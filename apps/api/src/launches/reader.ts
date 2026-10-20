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
export function unavailable() {
  return new AppError(
    "LAUNCH_CARDS_UNAVAILABLE",
    503,
    "Launch facts could not be verified at one block",
  );
}
export class ReadCap extends Error {}
export class LogRangeError extends AppError {
  constructor() {
    super(
      "LAUNCH_LOG_RANGE_UNAVAILABLE",
      503,
      "Provider refused the log range",
    );
  }
}
export class SimulationUnsupported extends AppError {
  constructor() {
    super(
      "SIMULATION_METHOD_UNSUPPORTED",
      503,
      "eth_simulateV1 is not supported by this provider",
    );
  }
}
export type Header = { number: number; hash: string; seconds: number };
export class LaunchReader {
  calls = 0;
  documentCalls = 0;
  private finalizing = false;
  readonly headers = new Map<number, Header>();
  readonly evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
  private readonly endpoint;
  readonly rpc: ProviderHttp;
  readonly logWindowBlocks: number;
  constructor(
    env: Env,
    readonly budget: LaunchCardsBudget,
    readonly maxCalls: number,
    readonly now: () => number,
    rpc?: ProviderHttp,
    spend?: RpcSpendBudget,
  ) {
    this.endpoint = robinhoodRpcEndpoint(env);
    this.logWindowBlocks = env.LAUNCH_LOG_WINDOW_BLOCKS;
    this.rpc =
      rpc ??
      createRobinhoodRpcHttp(env, {
        providerName: "launch-cards-rpc",
        spend,
        client: {
          maxRetries: 0,
          maxConcurrency: 1,
          maxResponseBytes: 1_000_000,
          rpcWorkload: "launch-cards",
        },
      });
  }
  async read(
    method: string,
    params: unknown[],
    optional = false,
  ): Promise<unknown> {
    if (
      this.calls + this.documentCalls >=
      this.maxCalls - (this.finalizing ? 0 : 1)
    )
      throw new ReadCap("RPC subcall cap reached");
    await this.budget.consume(method === "eth_simulateV1" ? 20 : 1);
    const id = ++this.calls;
    let payload: unknown;
    // A rate limit or transient upstream error is retried twice with backoff, within the same budget.
    for (let attempt = 0; ; attempt++) {
      try {
        payload = await this.rpc.requestJson(this.endpoint.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        });
        break;
      } catch (error) {
        if (
          attempt < 2 &&
          (error as { retryable?: unknown }).retryable === true
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 400 * (attempt + 1)),
          );
          continue;
        }
        throw unavailable();
      }
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
      responseSha256: await sha256(canonicalBytes(payload)),
    });
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw unavailable();
    const response = payload as {
      id?: unknown;
      error?: { code?: unknown; message?: unknown };
      result?: unknown;
    };
    if (response.id !== id) throw unavailable();
    if (response.error) {
      if (
        method === "eth_getLogs" &&
        ([-32602, -32005].includes(Number(response.error.code)) ||
          /range|limit/i.test(String(response.error.message)))
      )
        throw new LogRangeError();
      if (
        method === "eth_simulateV1" &&
        ([-32601, -32004].includes(Number(response.error.code)) ||
          /method.*(?:not supported|not found|not available|unsupported)|unsupported.*method/i.test(
            String(response.error.message),
          ))
      )
        throw new SimulationUnsupported();
      if (optional && response.error.code === 3) return null;
      throw unavailable();
    }
    if (!("result" in response)) throw unavailable();
    return response.result;
  }
  async document(http: ProviderHttp, url: string): Promise<unknown> {
    if (this.calls + this.documentCalls >= this.maxCalls - 1)
      throw new ReadCap("Read cap reached");
    await this.budget.consume(1);
    const id = ++this.documentCalls;
    const value = await http.requestJson(url, { redirect: "error" });
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
    const raw = (await this.read("eth_getBlockByNumber", [
      number === "latest" ? number : hex(number),
      false,
    ])) as Record<string, unknown> | null;
    if (!raw || !isHash(raw.hash)) throw unavailable();
    const header = {
      number: quantity(raw.number),
      hash: raw.hash.toLowerCase(),
      seconds: quantity(raw.timestamp),
    };
    if (number !== "latest" && header.number !== number) throw unavailable();
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
    this.finalizing = true;
    try {
      if ((await this.block(anchor.number, true)).hash !== anchor.hash)
        throw unavailable();
    } finally {
      this.finalizing = false;
    }
  }
  async point(log: ChainLog): Promise<Point> {
    const h = await this.block(quantity(log.blockNumber));
    if (h.hash !== log.blockHash.toLowerCase()) throw unavailable();
    return {
      blockNumber: h.number,
      blockHash: h.hash,
      timestamp: new Date(h.seconds * 1000).toISOString(),
      transactionHash: log.transactionHash.toLowerCase(),
      logIndex: quantity(log.logIndex),
    };
  }
  // Timestamp binary search; no assumed block rate enters a time rule.
  async lowerBound(seconds: number, anchor: Header): Promise<number> {
    if (seconds > anchor.seconds) return anchor.number + 1;
    let lo = 0,
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
    address: string,
    topics: unknown[],
    from: number,
    to: number,
  ): Promise<ChainLog[]> {
    if (to < from) return [];
    if (to - from >= 10_000_000) throw unavailable();
    const raw = await this.read("eth_getLogs", [
      { address, topics, fromBlock: hex(from), toBlock: hex(to) },
    ]);
    if (!Array.isArray(raw) || raw.length > 2_000) throw unavailable();
    const seen = new Set<string>();
    for (const log of raw as ChainLog[]) {
      if (
        !log ||
        !isAddress(log.address) ||
        log.address.toLowerCase() !== address.toLowerCase() ||
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
  // Only indexed scans opt into wide windows. Retries spend the same ledger,
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
    while (budget.remaining > 0 && this.calls < this.maxCalls - reserve) {
      const start = backwards ? Math.max(from, to - windowBlocks + 1) : from;
      const end = backwards ? to : Math.min(to, from + windowBlocks - 1);
      budget.remaining--;
      try {
        const logs = await this.logs(address, topics, start, end);
        return { logs, from: start, to: end, windowBlocks };
      } catch (error) {
        if (!(error instanceof LogRangeError)) throw error;
        // Do not retry the same range at the floor, including shorter tails.
        if (end - start + 1 <= 2_000) throw error;
        windowBlocks = Math.max(2_000, Math.floor((end - start + 1) / 2));
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
    let windowBlocks = wide ? this.logWindowBlocks : 2_000;
    while (backwards ? cursor >= from : cursor <= to) {
      if (calls >= chunks || this.calls >= this.maxCalls - 12) break;
      const page = await this.logWindow(
        address,
        topics,
        backwards ? from : cursor,
        backwards ? cursor : to,
        windowBlocks,
        budget,
        backwards,
      );
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
        chunks: calls,
        logCap: 256,
        logCount: logs.length,
        logCapped,
      },
      partial: logCapped || (backwards ? cursor >= from : cursor <= to),
    };
  }
}
