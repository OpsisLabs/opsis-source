import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { decodeFunctionResult, encodeFunctionData, formatUnits, type Hex } from "viem";
import type { Env } from "../config/env.js";
import type { ProviderHttp } from "../chain/provider-http.js";
import { createRobinhoodRpcHttp, robinhoodRpcEndpoint, type RpcSpendBudget } from "../chain/robinhood-rpc.js";
import type { PortfolioBudget } from "../portfolio/budget.js";
import { chainlinkAbi, ethUsdFeed } from "../rwa/chainlink.js";

export type PulseReason = "unavailable" | "malformed_response" | "budget_limited" | "stale_feed" | "latest_unavailable" | "inconsistent_blocks" | "coordination_unavailable";
export type PulseValue<T> = { value: T; reason: null } | { value: null; reason: PulseReason };
type Block = { number: string; hash: string; timestamp: string };
export type NetworkPulse = {
  chainId: 4663;
  observedAt: string;
  source: { rpc: string; feed: string };
  latestBlock: PulseValue<Block>;
  latestAgeSeconds: PulseValue<number>;
  safeBlock: PulseValue<Block>;
  safeLagBlocks: PulseValue<string>;
  safeLagSeconds: PulseValue<number>;
  gasPriceGwei: PulseValue<string>;
  ethUsd: PulseValue<string>;
  ethUsdUpdatedAt: PulseValue<string>;
  rpcLatencyMs: PulseValue<number>;
};
type SharedStore = Pick<Redis, "get" | "set" | "eval">;
type Dependencies = { rpc?: ProviderHttp; rpcSpend?: RpcSpendBudget; budget: PortfolioBudget; redis?: SharedStore; now?: () => number; clock?: () => number };
const TTL_MS = 15_000;
const resultKey = "opsis:network-pulse:4663:v1:result";
const lockKey = "opsis:network-pulse:4663:v1:lock";
const publish = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])
redis.call("DEL", KEYS[1])
return 1
`;
const known = <T>(value: T): PulseValue<T> => ({ value, reason: null });
const unknown = <T>(reason: PulseReason): PulseValue<T> => ({ value: null, reason });
function quantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value) || value.length > 66) throw new Error("Malformed quantity");
  return BigInt(value);
}
function block(value: unknown, observed: number): Block {
  const raw = value as Record<string, unknown> | null;
  const number = quantity(raw?.number);
  const seconds = quantity(raw?.timestamp);
  if (seconds > BigInt(Math.floor(observed / 1000)) || seconds > 8_640_000_000_000n || typeof raw?.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(raw.hash)) throw new Error("Malformed block");
  return { number: String(number), hash: raw.hash, timestamp: new Date(Number(seconds) * 1000).toISOString() };
}

/** Four independent reads in one batch; no retries, fallback, or background worker. */
export class NetworkPulseService {
  private readonly rpc: ProviderHttp;
  private readonly now: () => number;
  private readonly clock: () => number;
  private cached?: NetworkPulse;
  private pending?: Promise<NetworkPulse>;

  constructor(private readonly env: Env, private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
    this.clock = dependencies.clock ?? (() => performance.now());
    this.rpc = dependencies.rpc ?? createRobinhoodRpcHttp(env, {
      providerName: "network-pulse-rpc", spend: dependencies.rpcSpend,
      client: { maxRetries: 0, timeoutMs: 5000, maxConcurrency: 1 },
    });
  }

  observe(): Promise<NetworkPulse> {
    if (this.cached && this.fresh(this.cached)) return Promise.resolve(this.cached);
    if (this.pending) return this.pending;
    this.pending = this.sharedRead().catch(() => this.empty("coordination_unavailable")).then(result => {
      this.cached = result;
      return result;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private fresh(result: NetworkPulse): boolean {
    const age = this.now() - Date.parse(result.observedAt);
    return age >= 0 && age < TTL_MS;
  }

  private async sharedRead(): Promise<NetworkPulse> {
    const redis = this.dependencies.redis;
    if (!redis) return this.refresh();
    const cached = await redis.get(resultKey);
    if (cached) {
      const result = JSON.parse(cached) as NetworkPulse;
      if (this.fresh(result)) return result;
    }
    const owner = randomUUID();
    if (await redis.set(lockKey, owner, "PX", 30_000, "NX") === "OK") {
      // Recheck after acquiring: another process may have published meanwhile.
      const existing = await redis.get(resultKey);
      const previous = existing ? JSON.parse(existing) as NetworkPulse : undefined;
      const result = previous && this.fresh(previous) ? previous : await this.refresh();
      const ttl = Math.max(1, TTL_MS - (this.now() - Date.parse(result.observedAt)));
      if (await redis.eval(publish, 2, lockKey, resultKey, owner, JSON.stringify(result), String(ttl)) !== 1) throw new Error("Pulse lease unavailable");
      return result;
    }
    const deadline = this.clock() + 10_000;
    while (this.clock() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = await redis.get(resultKey);
      if (result) {
        const pulse = JSON.parse(result) as NetworkPulse;
        if (this.fresh(pulse)) return pulse;
      }
    }
    throw new Error("Pulse handoff unavailable");
  }

  private empty(reason: PulseReason): NetworkPulse {
    return {
      chainId: 4663, observedAt: new Date(this.now()).toISOString(),
      source: { rpc: robinhoodRpcEndpoint(this.env).id, feed: ethUsdFeed.proxyAddress },
      latestBlock: unknown(reason), latestAgeSeconds: unknown(reason), safeBlock: unknown(reason),
      safeLagBlocks: unknown(reason), safeLagSeconds: unknown(reason), gasPriceGwei: unknown(reason),
      ethUsd: unknown(reason), ethUsdUpdatedAt: unknown(reason), rpcLatencyMs: unknown(reason),
    };
  }

  private async refresh(): Promise<NetworkPulse> {
    try { await this.dependencies.budget.consume(4); }
    catch { return this.empty("budget_limited"); }
    const reads = [
      { method: "eth_getBlockByNumber", params: ["latest", false] },
      { method: "eth_getBlockByNumber", params: ["safe", false] },
      { method: "eth_gasPrice", params: [] },
      { method: "eth_call", params: [{ to: ethUsdFeed.proxyAddress, data: encodeFunctionData({ abi: chainlinkAbi, functionName: "latestRoundData" }) }, "latest"] },
    ];
    const started = this.clock();
    let raw: unknown;
    try {
      raw = await this.rpc.requestJson(robinhoodRpcEndpoint(this.env).url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(reads.map((read, id) => ({ jsonrpc: "2.0", id, ...read }))),
      });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      return this.empty(/BUDGET|SPEND_GUARD|RATE_LIMIT/.test(code) ? "budget_limited" : "unavailable");
    }
    const latency = Math.max(0, Math.round(this.clock() - started));
    const result = this.empty("malformed_response");
    result.rpcLatencyMs = known(latency);
    if (!Array.isArray(raw) || raw.length !== 4 || new Set(raw.map(row => row?.id)).size !== 4 || raw.some(row => !row || !Number.isInteger(row.id) || row.id < 0 || row.id > 3 || row.jsonrpc !== "2.0" || Object.hasOwn(row, "result") === Object.hasOwn(row, "error"))) return result;
    const read = <T>(id: number, parse: (value: unknown) => T): PulseValue<T> => {
      const row = raw.find(row => row.id === id);
      if (row.error || row.result === null) return unknown("unavailable");
      try { return known(parse(row.result)); } catch { return unknown("malformed_response"); }
    };
    const observed = Date.parse(result.observedAt);
    result.latestBlock = read(0, value => block(value, observed));
    result.safeBlock = read(1, value => block(value, observed));
    result.gasPriceGwei = read(2, value => formatUnits(quantity(value), 9));
    const latest = result.latestBlock.value, safe = result.safeBlock.value;
    result.latestAgeSeconds = latest ? known(Math.floor((observed - Date.parse(latest.timestamp)) / 1000)) : unknown(result.latestBlock.reason!);
    if (latest && safe) {
      if (BigInt(safe.number) > BigInt(latest.number) || safe.timestamp > latest.timestamp) {
        result.safeLagBlocks = unknown("inconsistent_blocks");
        result.safeLagSeconds = unknown("inconsistent_blocks");
      } else {
        result.safeLagBlocks = known(String(BigInt(latest.number) - BigInt(safe.number)));
        result.safeLagSeconds = known((Date.parse(latest.timestamp) - Date.parse(safe.timestamp)) / 1000);
      }
    } else {
      const reason = !latest ? "latest_unavailable" : result.safeBlock.reason!;
      result.safeLagBlocks = unknown(reason);
      result.safeLagSeconds = unknown(reason);
    }
    const round = read(3, value => decodeFunctionResult({ abi: chainlinkAbi, functionName: "latestRoundData", data: value as Hex }));
    if (!round.value) {
      result.ethUsd = unknown(round.reason!);
      result.ethUsdUpdatedAt = unknown(round.reason!);
    } else {
      const [roundId, answer, , updatedAt, answeredInRound] = round.value;
      const seconds = BigInt(Math.floor(observed / 1000));
      if (roundId > 0n && answer > 0n && updatedAt > 0n && updatedAt <= seconds && answeredInRound >= roundId) {
        result.ethUsdUpdatedAt = known(new Date(Number(updatedAt) * 1000).toISOString());
        result.ethUsd = seconds - updatedAt > BigInt(ethUsdFeed.heartbeat) ? unknown("stale_feed") : known(formatUnits(answer, ethUsdFeed.decimals));
      }
    }
    return result;
  }
}
