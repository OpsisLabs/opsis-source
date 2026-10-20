import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";
import { canonicalBytes, sha256 } from "@rh-chain/shared";
import type { ControlsEvidence } from "../controls/service.js";
import type { Env } from "../config/env.js";
import type { ProviderHttp } from "../chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  type RpcSpendBudget,
} from "../chain/robinhood-rpc.js";
import { AppError } from "../http/errors.js";
import type { LaunchCardsBudget } from "./budget.js";
import type { SourceDocumentInput } from "../chain/types.js";
import type { ChainLog, Point } from "./registry.js";
export const hex = (value: number) => `0x${value.toString(16)}`;
export const isHash = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
export const isAddress = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value);
export function quantity(value: unknown): number {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value))
    throw unavailable();
  const n = Number(BigInt(value));
  if (!Number.isSafeInteger(n) || n < 0) throw unavailable();
  return n;
}
export function unavailable(reason = "PROVIDER_ERROR:UNKNOWN") {
  return new AppError(
    "LAUNCH_CARDS_UNAVAILABLE",
    503,
    "Launch facts could not be verified at one block",
    { reason },
  );
}
export class ReadCap extends Error {}
export class TimeLimit extends Error {}
export const multicall3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const aggregateAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);
export async function mapSix<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(6, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]!, index);
      }
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return out;
}
export async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms)) return promise;
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeLimit()), Math.max(0, ms));
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export class LogRangeError extends AppError {
  constructor(readonly limit?: number) {
    super(
      "LAUNCH_LOG_RANGE_UNAVAILABLE",
      503,
      "Provider refused the log range",
      { reason: "PROVIDER_RANGE_LIMIT" },
    );
  }
}
export class SimulationUnsupported extends AppError {
  constructor() {
    super(
      "SIMULATION_METHOD_UNSUPPORTED",
      503,
      "eth_simulateV1 is not supported by this provider",
      { reason: "PROVIDER_ERROR:METHOD_UNSUPPORTED" },
    );
  }
}
const learnedWindows = new Map<string, { limit?: number; worked: number }>();
export function providerReason(error: unknown): string {
  if (error instanceof TimeLimit) return "TIME_LIMIT";
  if (error instanceof ReadCap) return "BUDGET_EXHAUSTED";
  if (error instanceof AppError)
    return String(
      (error.details as { reason?: string } | undefined)?.reason ?? error.code,
    );
  const code = (error as { code?: unknown } | null)?.code;
  return `PROVIDER_ERROR:${typeof code === "string" || typeof code === "number" ? code : "UNKNOWN"}`;
}
function rangeLimit(
  code: unknown,
  message: unknown,
): number | null | undefined {
  const text = String(message ?? "");
  // Throttling and transport failures say nothing about the permitted block span.
  if (
    /rate.?limit|too many requests|timeout|timed out|temporar/i.test(text) ||
    Number(code) === 429
  )
    return undefined;
  if (
    ![22, -32602, -32005].includes(Number(code)) &&
    !/range|blocks is not supported|limit|too many|too large|exceeds/i.test(
      text,
    )
  )
    return undefined;
  const match =
    text.match(/range\s+over\s+([\d,]+)\s+blocks/i) ??
    text.match(/only\s+([\d,]+)\s+(?:blocks\s+)?are allowed/i) ??
    text.match(
      /(?:limit(?:ed)?(?: to)?|maximum|max|up to)\s*[:=]?\s*([\d,]+)\s+blocks/i,
    );
  const n = match ? Number(match[1]!.replaceAll(",", "")) : 0;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export type Header = { number: number; hash: string; seconds: number };
export class LaunchReader {
  calls = 0;
  documentCalls = 0;
  private readonly inFlight = new Set<Promise<unknown>>();
  private reserved = 0;
  private units = 0;
  private nonSimulation = 0;
  private simulations = 0;
  deadline = Infinity;
  ceiling = Infinity;
  unitLimit = Infinity;
  nonSimulationLimit = Infinity;
  simulationLimit = Infinity;
  private explorerDeadline?: number;
  private explorerFailed = false;
  private readonly receiptSigners = new Map<
    string,
    { from: string; block: number; hash: string }
  >();
  private readonly pendingHeaders = new Map<number, Promise<Header>>();
  private batch: {
    params: unknown[];
    optional: boolean;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }[] = [];
  async multicall(
    calls: { to: string; data: string }[],
    block: string,
  ): Promise<(string | null)[]> {
    const raw = await this.rawRead("eth_call", [
      {
        to: multicall3,
        data: encodeFunctionData({
          abi: aggregateAbi,
          functionName: "aggregate3",
          args: [
            calls.map((c) => ({
              target: c.to as Hex,
              callData: c.data as Hex,
              allowFailure: true,
            })),
          ],
        }),
      },
      block,
    ]);
    try {
      const entries = decodeFunctionResult({
        abi: aggregateAbi,
        functionName: "aggregate3",
        data: raw as Hex,
      });
      if (entries.length !== calls.length) throw new Error();
      return entries.map((e) => (e.success ? e.returnData : null));
    } catch {
      throw unavailable("PROVIDER_ERROR:MALFORMED_MULTICALL");
    }
  }
  read(
    method: string,
    params: unknown[],
    optional = false,
    maxAttempts = 3,
  ): Promise<unknown> {
    if (method !== "eth_call" || params.length !== 2)
      return this.rawRead(method, params, optional, maxAttempts);
    return new Promise((resolve, reject) => {
      this.batch.push({ params, optional, resolve, reject });
      if (this.batch.length === 1)
        queueMicrotask(() => {
          void this.flush();
        });
    });
  }
  private async flush() {
    const queued = this.batch;
    this.batch = [];
    const groups = new Map<string, typeof queued>();
    for (const entry of queued) {
      const block = String(entry.params[1]);
      const group = groups.get(block) ?? [];
      group.push(entry);
      groups.set(block, group);
    }
    await Promise.all(
      [...groups.entries()].map(async ([block, entries]) => {
        try {
          if (entries.length === 1) {
            const e = entries[0]!;
            e.resolve(await this.rawRead("eth_call", e.params, e.optional));
            return;
          }
          const values = await this.multicall(
            entries.map((e) => e.params[0] as { to: string; data: string }),
            block,
          );
          entries.forEach((e, i) =>
            values[i] === null && !e.optional
              ? e.reject(unavailable("PROVIDER_ERROR:CALL_REVERTED"))
              : e.resolve(values[i]),
          );
        } catch (error) {
          entries.forEach((e) => e.reject(error));
        }
      }),
    );
  }
  private async reserve(method: string, document = false, finalizing = false) {
    if (!finalizing && this.now() >= this.deadline) throw new TimeLimit();
    const units = method === "eth_simulateV1" ? 20 : 1;
    if (
      this.calls + this.documentCalls + this.reserved >=
        this.maxCalls - (finalizing ? 0 : 1) ||
      this.units + units > this.unitLimit - (finalizing ? 0 : 1) ||
      (method === "eth_simulateV1"
        ? this.simulations >= this.simulationLimit
        : this.nonSimulation >= this.nonSimulationLimit - (finalizing ? 0 : 1))
    )
      throw new ReadCap("Read cap reached");
    this.reserved++;
    this.units += units;
    if (method === "eth_simulateV1") this.simulations++;
    else this.nonSimulation++;
    try {
      await within(
        this.budget.consume(units),
        finalizing
          ? Math.min(5_000, this.ceiling - this.now())
          : this.deadline - this.now(),
      );
      if (!finalizing && this.now() >= this.deadline) throw new TimeLimit();
      if (document) return ++this.documentCalls;
      return ++this.calls;
    } finally {
      this.reserved--;
    }
  }
  get budgetUnits() {
    return this.units;
  }
  readonly headers = new Map<number, Header>();
  readonly evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
  private readonly endpoint;
  readonly rpc: ProviderHttp;
  readonly logWindowBlocks: number;
  private readonly providerKey: string;
  constructor(
    env: Env,
    readonly budget: LaunchCardsBudget,
    readonly maxCalls: number,
    readonly now: () => number,
    rpc?: ProviderHttp,
    spend?: RpcSpendBudget,
  ) {
    this.endpoint = robinhoodRpcEndpoint(env);
    this.providerKey = `${this.endpoint.id}:${this.endpoint.url}`;
    this.logWindowBlocks = env.LAUNCH_LOG_WINDOW_BLOCKS;
    this.rpc =
      rpc ??
      createRobinhoodRpcHttp(env, {
        providerName: "launch-cards-rpc",
        spend,
        client: {
          maxRetries: 0,
          maxConcurrency: 6,
          maxResponseBytes: 1_000_000,
          rpcWorkload: "launch-cards",
        },
      });
  }
  private rawRead(
    method: string,
    params: unknown[],
    optional = false,
    maxAttempts = 3,
    finalizing = false,
  ): Promise<unknown> {
    const promise = this.performRead(
      method,
      params,
      optional,
      maxAttempts,
      finalizing,
    );
    this.inFlight.add(promise);
    void promise.then(
      () => this.inFlight.delete(promise),
      () => this.inFlight.delete(promise),
    );
    return promise;
  }
  private async performRead(
    method: string,
    params: unknown[],
    optional = false,
    maxAttempts = 3,
    finalizing = false,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const id = await this.reserve(method, false, finalizing);
      let payload: unknown;
      let transportError: unknown;
      try {
        payload = await within(
          this.rpc.requestJson(this.endpoint.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          }),
          finalizing
            ? Math.min(5_000, this.ceiling - this.now())
            : this.deadline - this.now(),
        );
      } catch (error) {
        transportError = error;
      }
      const endpoint = new URL(this.endpoint.url);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      )
        throw unavailable();
      this.evidence.rpcCalls.push({
        method,
        paramsSha256: await sha256(canonicalBytes(params)),
      });
      this.evidence.sources.push({
        id: `launch-rpc-${id}`,
        provider: this.endpoint.id,
        url: endpoint.origin,
        fetchedAt: new Date(this.now()).toISOString(),
        responseSha256: await sha256(
          canonicalBytes(
            transportError
              ? { transportError: providerReason(transportError) }
              : (payload ?? null),
          ),
        ),
      });
      const response = payload as {
        id?: unknown;
        error?: { code?: unknown; message?: unknown };
        result?: unknown;
      } | null;
      if (transportError instanceof TimeLimit) throw transportError;
      if (transportError) {
        if (
          attempt + 1 < maxAttempts &&
          (transportError as { retryable?: boolean }).retryable
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 400 * (attempt + 1)),
          );
          continue;
        }
        throw unavailable(providerReason(transportError));
      }
      if (
        !response ||
        typeof response !== "object" ||
        Array.isArray(response) ||
        response.id !== id
      )
        throw unavailable();
      if (response.error) {
        const { code, message } = response.error;
        const limit =
          method === "eth_getLogs" ? rangeLimit(code, message) : undefined;
        if (limit !== undefined) {
          if (limit !== null) this.learnLimit(limit);
          throw new LogRangeError(limit ?? undefined);
        }
        if (
          attempt + 1 < maxAttempts &&
          (Number(code) === 429 ||
            /rate.?limit|too many requests|timeout|timed out|temporarily unavailable/i.test(
              String(message),
            ))
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 400 * (attempt + 1)),
          );
          continue;
        }
        if (
          method === "eth_simulateV1" &&
          ([-32601, -32004].includes(Number(code)) ||
            /method.*(?:not supported|not found|not available|unsupported)|unsupported.*method/i.test(
              String(message),
            ))
        )
          throw new SimulationUnsupported();
        if (optional && code === 3) return null;
        throw unavailable(
          `PROVIDER_ERROR:${Number.isInteger(Number(code)) ? code : "UNKNOWN"}`,
        );
      }
      if (!("result" in response)) throw unavailable();
      return response.result;
    }
  }
  get windowBlocks() {
    return Math.min(
      this.logWindowBlocks,
      learnedWindows.get(this.providerKey)?.limit ?? this.logWindowBlocks,
    );
  }
  private learnLimit(limit: number) {
    const state = learnedWindows.get(this.providerKey);
    learnedWindows.set(this.providerKey, {
      limit: Math.min(limit, state?.limit ?? limit),
      worked: Math.min(state?.worked ?? 0, limit),
    });
  }
  async explorer(read: () => Promise<SourceDocumentInput>): Promise<unknown> {
    // A 1.2 s explorer allowance leaves room for 28 archive reads in the 5 s non-registry target.
    this.explorerDeadline ??= this.now() + 1_200;
    if (this.explorerFailed || this.now() >= this.explorerDeadline)
      throw unavailable("EXPLORER_UNAVAILABLE");
    let doc: SourceDocumentInput | undefined;
    let id = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      id = await this.reserve("document", true);
      try {
        doc = await within(
          read(),
          Math.min(1_200, this.explorerDeadline - this.now()),
        );
        break;
      } catch (error) {
        // The existing explorer gate already retries a 429 once. Only retry a 5xx here.
        if (
          attempt === 0 &&
          /PROVIDER_HTTP_5\d\d/.test(
            String((error as { code?: string }).code),
          ) &&
          this.now() < this.explorerDeadline
        )
          continue;
        this.explorerFailed = true;
        throw unavailable("EXPLORER_UNAVAILABLE");
      }
    }
    if (!doc) throw unavailable("EXPLORER_UNAVAILABLE");
    this.evidence.sources.push({
      id: `launch-explorer-${id}`,
      provider: "blockscout",
      url: doc.requestUrl!,
      fetchedAt: new Date(this.now()).toISOString(),
      responseSha256: await sha256(canonicalBytes(doc.responseJson)),
    });
    return doc.responseJson;
  }
  async receipt(hash: string, anchor: Header): Promise<ChainLog[]> {
    const raw = (await this.read("eth_getTransactionReceipt", [
      hash,
    ])) as Record<string, unknown> | null;
    if (
      !raw ||
      raw.transactionHash !== hash ||
      !isHash(raw.blockHash) ||
      quantity(raw.blockNumber) > anchor.number ||
      !Array.isArray(raw.logs) ||
      raw.logs.length > 2_000
    )
      throw unavailable("CREATION_NOT_FOUND");
    const header = await this.block(quantity(raw.blockNumber));
    if (header.hash !== raw.blockHash.toLowerCase())
      throw unavailable("HEADER_MISMATCH");
    const seen = new Set<string>();
    for (const log of raw.logs as ChainLog[]) {
      if (
        !log ||
        !isAddress(log.address) ||
        log.removed ||
        log.transactionHash !== hash ||
        log.blockHash !== raw.blockHash ||
        log.blockNumber !== raw.blockNumber ||
        !Array.isArray(log.topics) ||
        !log.topics.every(isHash) ||
        typeof log.data !== "string" ||
        !/^0x(?:[0-9a-f]{2})*$/i.test(log.data)
      )
        throw unavailable();
      quantity(log.transactionIndex);
      const key = String(quantity(log.logIndex));
      if (seen.has(key)) throw unavailable();
      seen.add(key);
    }
    if (isAddress(raw.from))
      this.receiptSigners.set(hash.toLowerCase(), {
        from: raw.from.toLowerCase(),
        block: header.number,
        hash: header.hash,
      });
    return raw.logs as ChainLog[];
  }
  async signer(hash: string, block: number): Promise<string> {
    const cached = this.receiptSigners.get(hash);
    if (cached) {
      if (
        cached.block !== block ||
        cached.hash !== (await this.block(block)).hash
      )
        throw unavailable("HEADER_MISMATCH");
      return cached.from;
    }
    const tx = (await this.read("eth_getTransactionByHash", [hash])) as Record<
      string,
      unknown
    > | null;
    if (
      !tx ||
      String(tx.hash).toLowerCase() !== hash ||
      !isAddress(tx.from) ||
      quantity(tx.blockNumber) !== block ||
      String(tx.blockHash).toLowerCase() !== (await this.block(block)).hash
    )
      throw unavailable("HEADER_MISMATCH");
    const from = tx.from.toLowerCase();
    this.receiptSigners.set(hash, {
      from,
      block,
      hash: String(tx.blockHash).toLowerCase(),
    });
    return from;
  }
  async transaction(log: ChainLog) {
    const tx = (await this.read("eth_getTransactionByHash", [
      log.transactionHash,
    ])) as Record<string, unknown> | null;
    if (
      !tx ||
      String(tx.hash).toLowerCase() !== log.transactionHash.toLowerCase() ||
      quantity(tx.blockNumber) !== quantity(log.blockNumber) ||
      String(tx.blockHash).toLowerCase() !== log.blockHash.toLowerCase() ||
      !isAddress(tx.from)
    )
      throw unavailable("HEADER_MISMATCH");
    return tx;
  }
  async document(http: ProviderHttp, url: string): Promise<unknown> {
    const id = await this.reserve("document", true);
    const value = await within(
      http.requestJson(url, { redirect: "error" }),
      this.deadline - this.now(),
    );
    this.evidence.sources.push({
      id: `launch-document-${id}`,
      provider: "stock-token-engine",
      url,
      fetchedAt: new Date(this.now()).toISOString(),
      responseSha256: await sha256(canonicalBytes(value)),
    });
    return value;
  }
  async block(number: number | "latest", fresh = false): Promise<Header> {
    if (number !== "latest" && !fresh && this.headers.has(number))
      return this.headers.get(number)!;
    if (number !== "latest" && !fresh) {
      const pending = this.pendingHeaders.get(number);
      if (pending) return pending;
      const promise = this.fetchBlock(number);
      this.pendingHeaders.set(number, promise);
      try {
        return await promise;
      } finally {
        this.pendingHeaders.delete(number);
      }
    }
    return this.fetchBlock(number);
  }
  private async fetchBlock(
    number: number | "latest",
    finalizing = false,
  ): Promise<Header> {
    const raw = (await this.rawRead(
      "eth_getBlockByNumber",
      [number === "latest" ? number : hex(number), false],
      false,
      1,
      finalizing,
    )) as Record<string, unknown> | null;
    if (!raw || !isHash(raw.hash)) throw unavailable();
    const header = {
      number: quantity(raw.number),
      hash: raw.hash.toLowerCase(),
      seconds: quantity(raw.timestamp),
    };
    if (number !== "latest" && header.number !== number)
      throw unavailable("HEADER_MISMATCH");
    this.headers.set(header.number, header);
    return header;
  }
  async anchor(): Promise<Header> {
    if ((await this.read("eth_chainId", [])) !== "0x1237") throw unavailable();
    const header = await this.block("latest");
    if (Math.abs(this.now() - header.seconds * 1000) > 60_000)
      throw unavailable();
    return header;
  }
  async recheck(anchor: Header): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
    try {
      if ((await this.fetchBlock(anchor.number, true)).hash !== anchor.hash)
        throw unavailable("ANCHOR_CHANGED");
    } catch (error) {
      if (error instanceof ReadCap) throw unavailable("BUDGET_EXHAUSTED");
      if (error instanceof TimeLimit) throw unavailable("ANCHOR_UNAVAILABLE");
      throw error;
    }
  }
  async point(log: ChainLog): Promise<Point> {
    const h = await this.block(quantity(log.blockNumber));
    if (h.hash !== log.blockHash.toLowerCase())
      throw unavailable("HEADER_MISMATCH");
    return {
      blockNumber: h.number,
      blockHash: h.hash,
      timestamp: new Date(h.seconds * 1000).toISOString(),
      transactionHash: log.transactionHash.toLowerCase(),
      logIndex: quantity(log.logIndex),
    };
  }
  // Timestamp binary search; no assumed block rate enters a time rule.
  async lowerBound(
    seconds: number,
    anchor: Header,
    floor = 0,
  ): Promise<number> {
    if (seconds > anchor.seconds) return anchor.number + 1;
    let lo = floor,
      hi = anchor.number;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const h = await this.block(mid);
      if (h.seconds < seconds) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  async logs(
    address: string | string[],
    topics: unknown[],
    from: number,
    to: number,
    maxAttempts = 3,
  ): Promise<ChainLog[]> {
    if (to < from) return [];
    const raw = await this.read(
      "eth_getLogs",
      [{ address, topics, fromBlock: hex(from), toBlock: hex(to) }],
      false,
      maxAttempts,
    );
    if (!Array.isArray(raw) || raw.length > 2_000) throw unavailable();
    const seen = new Set<string>();
    for (const log of raw as ChainLog[]) {
      if (
        !log ||
        !isAddress(log.address) ||
        !(Array.isArray(address) ? address : [address]).some(
          (a) => a.toLowerCase() === log.address.toLowerCase(),
        ) ||
        !isHash(log.blockHash) ||
        !isHash(log.transactionHash) ||
        log.removed ||
        !Array.isArray(log.topics) ||
        !log.topics.every(isHash) ||
        typeof log.data !== "string" ||
        !/^0x(?:[0-9a-f]{2})*$/i.test(log.data)
      )
        throw unavailable();
      const n = quantity(log.blockNumber);
      quantity(log.transactionIndex);
      quantity(log.logIndex);
      if (n < from || n > to) throw unavailable();
      for (let i = 0; i < topics.length; i++) {
        const filter = topics[i];
        if (filter === null) continue;
        if (
          Array.isArray(filter)
            ? !filter.some(
                (t) => t.toLowerCase() === log.topics[i]?.toLowerCase(),
              )
            : String(filter).toLowerCase() !== log.topics[i]?.toLowerCase()
        )
          throw unavailable();
      }
      const key = `${log.blockHash}:${log.logIndex}`;
      if (seen.has(key)) throw unavailable();
      seen.add(key);
    }
    return (raw as ChainLog[]).sort(
      (a, b) =>
        quantity(a.blockNumber) - quantity(b.blockNumber) ||
        quantity(a.logIndex) - quantity(b.logIndex),
    );
  }
  // Factory feed and token-indexed scans use learned windows. Retries spend the same ledger,
  // provider units and request call cap as successful reads.
  async logWindow(
    address: string,
    topics: unknown[],
    from: number,
    to: number,
    windowBlocks: number,
    budget: { remaining: number },
    backwards = true,
    reserve = 12,
  ) {
    windowBlocks = Math.min(windowBlocks, this.windowBlocks);
    while (
      budget.remaining > 0 &&
      this.calls + this.documentCalls < this.maxCalls - reserve
    ) {
      const start = backwards ? Math.max(from, to - windowBlocks + 1) : from;
      const end = backwards ? to : Math.min(to, from + windowBlocks - 1);
      const before = this.calls;
      try {
        const logs = await this.logs(
          address,
          topics,
          start,
          end,
          Math.min(
            3,
            budget.remaining,
            this.maxCalls - reserve - this.calls - this.documentCalls,
          ),
        );
        const state = learnedWindows.get(this.providerKey);
        learnedWindows.set(this.providerKey, {
          ...state,
          worked: Math.max(state?.worked ?? 0, end - start + 1),
        });
        return { logs, from: start, to: end, windowBlocks };
      } catch (error) {
        if (!(error instanceof LogRangeError)) throw error;
        // Do not retry the same range at the floor, including shorter tails.
        const span = end - start + 1;
        if (span <= 1) throw error;
        windowBlocks = Math.min(
          error.limit ?? Math.max(1, Math.floor(span / 2)),
          span - 1,
        );
        this.learnLimit(windowBlocks);
      } finally {
        budget.remaining -= this.calls - before;
      }
    }
    return null;
  }
  async range(
    address: string,
    topics: unknown[],
    from: number,
    to: number,
    chunks: number,
    backwards = false,
    wide = false,
  ) {
    const logs: ChainLog[] = [];
    let logCapped = false;
    let cursor = backwards ? to : from,
      calls = 0;
    const budget = { remaining: chunks };
    let windowBlocks = wide
      ? this.windowBlocks
      : Math.min(2_000, this.windowBlocks);
    let reason: string | undefined;
    while (backwards ? cursor >= from : cursor <= to) {
      if (calls >= chunks || this.calls >= this.maxCalls - 12) break;
      let page;
      try {
        page = await this.logWindow(
          address,
          topics,
          backwards ? from : cursor,
          backwards ? cursor : to,
          windowBlocks,
          budget,
          backwards,
        );
      } catch (error) {
        if (!(error instanceof AppError || error instanceof ReadCap))
          throw error;
        reason = providerReason(error);
        break;
      }
      calls = chunks - budget.remaining;
      if (!page) break;
      const { from: start, to: end, logs: found } = page;
      windowBlocks = page.windowBlocks;
      const remaining = 256 - logs.length;
      logs.push(...found.slice(0, remaining));
      logCapped = found.length > remaining;
      cursor = backwards ? start - 1 : end + 1;
      if (logCapped) break;
    }
    return {
      logs,
      coverage: {
        fromBlock: backwards ? cursor + 1 : from,
        toBlock: backwards ? to : cursor - 1,
        requestedFromBlock: from,
        requestedToBlock: to,
        chunks: chunks - budget.remaining,
        ...(reason ? { reason } : {}),
        logCap: 256,
        logCount: logs.length,
        logCapped,
      },
      partial: logCapped || (backwards ? cursor >= from : cursor <= to),
    };
  }
}
