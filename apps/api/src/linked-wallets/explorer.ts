import { canonicalBytes, sha256 } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import type { ControlsEvidence } from "../controls/service.js";
import {
  createProviderHttp,
  type ProviderHttp,
  ProviderRequestError,
} from "../chain/provider-http.js";
import { isAddress, isHash, ReadCap } from "../launches/reader.js";
import { AppError } from "../http/errors.js";
import type { LinkedWalletsBudget } from "./budget.js";

export type Funding = {
  from: string;
  to: string;
  transactionHash: string;
  block: number;
  index: number;
};
export type HolderCandidate = {
  wallet: string;
  excluded?: "pool" | "burn" | "token";
};
const burns = new Set([
  `0x${"0".repeat(40)}`,
  "0x000000000000000000000000000000000000dead",
  "0xdead000000000000000042069420694206942069",
]);
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid explorer evidence");
  return v as Record<string, unknown>;
};
const integer = (v: unknown) => {
  if (
    typeof v !== "string" ||
    !/^\d+$/.test(v) ||
    !Number.isSafeInteger(Number(v))
  )
    throw new Error("Invalid explorer integer");
  return Number(v);
};
// Rate limiting is local evidence unavailability, never a graph-wide credit cap.
export const fundingCap = (error: unknown): boolean =>
  error instanceof ReadCap ||
  [
    "LINKED_WALLETS_DAILY_BUDGET_EXCEEDED",
    "LINKED_WALLETS_BUDGET_UNAVAILABLE",
    "LINKED_WALLETS_RPC_LIMIT_EXCEEDED",
    "PROVIDER_CREDITS_EXHAUSTED",
    "PROVIDER_BUDGET_EXCEEDED",
    "PROVIDER_GLOBAL_BUDGET_EXCEEDED",
    "PROVIDER_GLOBAL_BUDGET_UNAVAILABLE",
  ].includes(String((error as { code?: unknown } | null)?.code ?? ""));
export function fundingFailure(error: unknown): string {
  if (error instanceof ReadCap) return error.message;
  if (error instanceof ProviderRequestError || error instanceof AppError)
    return error.code;
  return "Invalid or unavailable funding evidence";
}
const retryable = (error: unknown) =>
  /^(PROVIDER_HTTP_5\d\d|PROVIDER_HTTP_429|PROVIDER_RATE_LIMITED|PROVIDER_TIMEOUT)$/.test(
    String((error as { code?: unknown } | null)?.code ?? ""),
  ) ||
  (error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name));
export class FundingExplorer {
  calls = 0;
  private reserved = 0;
  private stopped?: unknown;
  private readonly inFlight = new Set<Promise<unknown>>();
  private active = 0;
  private starts: number[] = [];
  private turn: Promise<void> = Promise.resolve();
  private async pace(): Promise<void> {
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      this.starts = this.starts.filter((time) => time > Date.now() - 1_000);
      if (this.starts.length >= 5) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, this.starts[0]! + 1_000 - Date.now()),
          ),
        );
        this.starts = this.starts.filter((time) => time > Date.now() - 1_000);
      }
      this.starts.push(Date.now());
    } finally {
      release();
    }
  }
  private readonly waiters: Array<() => void> = [];
  private async acquire(): Promise<void> {
    if (this.active < 4) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }
  readonly evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
  readonly observed: Funding[] = [];
  private readonly http: ProviderHttp;
  constructor(
    private readonly env: Env,
    private readonly budget: LinkedWalletsBudget,
    private readonly now: () => number,
    http?: ProviderHttp,
  ) {
    this.http =
      http ??
      createProviderHttp(
        {
          ...env,
          PROVIDER_MAX_RETRIES: 0,
          BLOCKSCOUT_REQUESTS_PER_SECOND: Math.min(
            5,
            env.BLOCKSCOUT_REQUESTS_PER_SECOND,
          ),
          PROVIDER_TIMEOUT_MS: Math.min(env.PROVIDER_TIMEOUT_MS, 3_000),
        },
        "blockscout",
        1_000_000,
        undefined,
        false,
      );
  }
  private async read(
    path: string,
    legacy = false,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const base = this.env.BLOCKSCOUT_PRO_API_KEY
      ? `${this.env.BLOCKSCOUT_PRO_API_BASE_URL.replace(/\/$/, "")}/${this.env.BLOCKSCOUT_CHAIN_ID}/api/${legacy ? "" : "v2/"}`
      : legacy
        ? this.env.BLOCKSCOUT_API_BASE_URL.replace(/\/v2\/?$/, "/")
        : `${this.env.BLOCKSCOUT_API_BASE_URL.replace(/\/$/, "")}/`;
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    const key = this.env.BLOCKSCOUT_PRO_API_KEY ?? this.env.BLOCKSCOUT_API_KEY;
    if (key) url.searchParams.set("apikey", key);
    return this.transport.requestJson(url.toString(), {
      headers: { accept: "application/json" },
    });
  }
  // Launch creation discovery shares the graph's explorer cap, ledger and transport.
  readonly launchHttp: ProviderHttp = {
    requestJson: async (url, init) => {
      try {
        return await this.transport.requestJson(url, init);
      } catch (error) {
        // The launch reader has its own 5xx retry. This transport already made
        // both admitted attempts; do not multiply them at the composition layer.
        if (/^PROVIDER_HTTP_5\d\d$/.test(fundingFailure(error)))
          throw new AppError(
            "LINKED_WALLETS_EXPLORER_UNAVAILABLE",
            503,
            "Explorer unavailable",
          );
        throw error;
      }
    },
  };
  private readonly transport: ProviderHttp = {
    requestJson: (url, init) => {
      const promise = this.request(url, init);
      this.inFlight.add(promise);
      void promise.then(
        () => this.inFlight.delete(promise),
        () => this.inFlight.delete(promise),
      );
      return promise;
    },
  };
  async settle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }
  private async request(url: string, init?: RequestInit): Promise<unknown> {
    await this.acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        if (this.stopped) throw this.stopped;
        // Reserve before every physical attempt, including retries. Count pending
        // admissions too: concurrent wallets cannot overshoot the graph cap.
        if (
          this.calls + this.reserved >=
          this.env.LINKED_WALLETS_MAX_EXPLORER_CALLS
        )
          throw new ReadCap("Explorer call cap reached");
        this.reserved++;
        let id: number;
        try {
          await this.pace();
          if (this.stopped) throw this.stopped;
          await this.budget.consume(50);
          id = ++this.calls;
        } catch (error) {
          if (fundingCap(error)) this.stopped = error;
          throw error;
        } finally {
          this.reserved--;
        }
        try {
          const body = await this.http.requestJson(url, init);
          this.evidence.sources.push({
            id: `funding-explorer-${id}`,
            provider: "blockscout",
            url: new URL(url).origin,
            fetchedAt: new Date(this.now()).toISOString(),
            responseSha256: await sha256(canonicalBytes(body)),
          });
          // Legacy APIs can return provider refusals in a successful HTTP body.
          const response = body as {
            status?: unknown;
            result?: unknown;
          } | null;
          if (response?.status === "0" && typeof response.result === "string") {
            if (
              /credit|daily.*(?:cap|limit)|quota.*exhaust/i.test(
                response.result,
              )
            )
              throw new ProviderRequestError(
                "PROVIDER_CREDITS_EXHAUSTED",
                false,
              );
            if (/rate.?limit|too many requests/i.test(response.result))
              throw new ProviderRequestError("PROVIDER_RATE_LIMITED", false);
          }
          return body;
        } catch (error) {
          if (fundingCap(error)) this.stopped = error;
          if (attempt !== 0 || !retryable(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } finally {
      this.release();
    }
  }

  async holders(
    token: string,
  ): Promise<{ holders: HolderCandidate[]; complete: boolean }> {
    const holders: HolderCandidate[] = [];
    let cursor: Record<string, string> = {};
    const seen = new Set<string>();
    for (let page = 0; page < 2; page++) {
      let body: Record<string, unknown>;
      try {
        body = obj(await this.read(`tokens/${token}/holders`, false, cursor));
      } catch (error) {
        if (holders.length && fundingCap(error))
          return { holders, complete: false };
        throw error;
      }
      if (!Array.isArray(body.items) || body.items.length > 100)
        throw new Error("Invalid holder list");
      for (const raw of body.items) {
        if (holders.length >= 100) break;
        const row = obj(raw),
          account = obj(row.address);
        if (
          !isAddress(account.hash) ||
          typeof row.value !== "string" ||
          !/^\d+$/.test(row.value)
        )
          throw new Error("Invalid holder");
        const wallet = account.hash.toLowerCase();
        if (seen.has(wallet)) throw new Error("Duplicate holder");
        seen.add(wallet);
        const tags = (
          account.metadata as { tags?: Array<{ slug?: string }> } | undefined
        )?.tags;
        const burn =
          burns.has(wallet) ||
          tags?.some(
            (t) => typeof t.slug === "string" && t.slug.startsWith("null-"),
          );
        const pool =
          account.is_contract === true &&
          typeof account.name === "string" &&
          /pair|pool|swap|router|lp\b/i.test(account.name);
        holders.push({
          wallet,
          ...(wallet === token
            ? { excluded: "token" as const }
            : burn
              ? { excluded: "burn" as const }
              : pool
                ? { excluded: "pool" as const }
                : {}),
        });
      }
      if (!body.next_page_params) return { holders, complete: true };
      if (holders.length >= 100) return { holders, complete: true };
      cursor = {};
      for (const [key, value] of Object.entries(obj(body.next_page_params))) {
        if (
          !["value", "address_hash", "items_count"].includes(key) ||
          !["string", "number"].includes(typeof value)
        )
          throw new Error("Invalid holder cursor");
        cursor[key] = String(value);
      }
      if (!Object.keys(cursor).length) throw new Error("Invalid holder cursor");
    }
    return { holders, complete: holders.length === 100 };
  }
  async firstFunding(
    wallet: string,
    anchor: number,
  ): Promise<{ funding: Funding | null; capped: boolean }> {
    let incomplete = false;
    // A single oldest-first page is the default. Internal ETH is only a fallback
    // when that page has no inbound value; no explorer token-transfer requests.
    for (const action of ["txlist", "txlistinternal"]) {
      const body = obj(
        await this.read("", true, {
          module: "account",
          action,
          address: wallet,
          startblock: "0",
          endblock: String(anchor),
          sort: "asc",
          page: "1",
          offset: "10",
        }),
      );
      if (
        !Array.isArray(body.result) ||
        body.result.length > 10 ||
        !["0", "1"].includes(String(body.status)) ||
        (String(body.status) === "0" && body.result.length)
      )
        throw new Error("Explorer address list unavailable");
      let previous = -1;
      const inbound: Funding[] = [];
      for (const raw of body.result) {
        const row = obj(raw);
        const block = integer(row.blockNumber),
          index = integer(row.transactionIndex);
        const order = block * 1_000_000 + index;
        if (
          !Number.isSafeInteger(order) ||
          order < previous ||
          block > anchor ||
          !isAddress(row.from) ||
          !isAddress(row.to) ||
          !isHash(row.hash) ||
          typeof row.value !== "string" ||
          !/^\d+$/.test(row.value)
        )
          throw new Error("Invalid oldest-first evidence");
        previous = order;
        if (
          row.isError !== "0" ||
          row.txreceipt_status === "0" ||
          BigInt(row.value) === 0n
        )
          continue;
        const transfer = {
          from: row.from.toLowerCase(),
          to: row.to.toLowerCase(),
          transactionHash: row.hash.toLowerCase(),
          block,
          index,
        };
        this.observed.push(transfer);
        if (transfer.to === wallet && transfer.from !== wallet)
          inbound.push(transfer);
      }
      const first = inbound[0];
      if (first) {
        if (
          inbound.some(
            (r) =>
              r.block === first.block &&
              r.index === first.index &&
              r.from !== first.from,
          )
        )
          throw new Error("Ambiguous first funding");
        return { funding: incomplete ? null : first, capped: incomplete };
      }
      incomplete ||= body.result.length === 10;
    }
    return { funding: null, capped: incomplete };
  }
}
