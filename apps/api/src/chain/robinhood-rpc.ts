import type Redis from "ioredis";
import type { Env } from "../config/env.js";
import {
  ProviderHttpClient,
  ProviderRequestError,
  type ProviderHttp,
  type ProviderHttpOptions
} from "./provider-http.js";

// One transport for every server-side Robinhood Chain JSON-RPC read. The
// official public RPC is development-only under Robinhood's hosted-service
// terms; production uses the founder-admitted dRPC gateway (decision D20).
// There is deliberately no fallback between the two: a dRPC denial is an
// unavailable read, never a silent switch to the public endpoint.

export const DRPC_ORIGIN = "https://lb.drpc.live";

export type RobinhoodRpcProviderId = "robinhood-public-rpc" | "drpc";

export type RobinhoodRpcEndpoint = {
  id: RobinhoodRpcProviderId;
  /** Destination named in privacy receipts and citations. */
  label: string;
  /** Request URL. It never contains a credential. */
  url: string;
};

export function robinhoodRpcEndpoint(env: Env): RobinhoodRpcEndpoint {
  if (env.ROBINHOOD_RPC_PROVIDER === "drpc") {
    return { id: "drpc", label: "dRPC Robinhood Chain gateway", url: `${DRPC_ORIGIN}/${env.DRPC_ROBINHOOD_NETWORK}` };
  }
  return { id: "robinhood-public-rpc", label: "Robinhood Public RPC", url: env.ROBINHOOD_PUBLIC_RPC_URL };
}

/** Sentence appended to privacy disclosures that name the RPC destination. */
export function rpcRoutingDisclosure(endpoint: RobinhoodRpcEndpoint): string {
  return endpoint.id === "drpc"
    ? " dRPC is a paid gateway that may route each read to an independent node operator in its network."
    : "";
}

// Read-only methods the Robinhood Chain services send, with dRPC compute-unit
// weights. dRPC publishes 20 CU for standard calls; eth_getLogs is reserved at
// a deliberately higher upper bound until reconciled with account statistics.
// Any other method, including every signing or broadcast method, is refused
// before dispatch on both transports.
export const ROBINHOOD_RPC_METHOD_UNITS: Readonly<Record<string, number>> = Object.freeze({
  eth_blockNumber: 20,
  eth_call: 20,
  eth_chainId: 20,
  eth_getBalance: 20,
  eth_getBlockByNumber: 20,
  eth_getCode: 20,
  eth_getLogs: 200,
  eth_getTransactionByHash: 20,
  eth_getTransactionReceipt: 20
});

const MAX_BATCH_MEMBERS = 100;

export function jsonRpcUnits(body: RequestInit["body"]): number {
  if (typeof body !== "string") throw new ProviderRequestError("PROVIDER_RPC_METHOD_NOT_ALLOWED", false);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ProviderRequestError("PROVIDER_RPC_METHOD_NOT_ALLOWED", false);
  }
  const members = Array.isArray(parsed) ? parsed : [parsed];
  if (members.length === 0 || members.length > MAX_BATCH_MEMBERS) {
    throw new ProviderRequestError("PROVIDER_RPC_METHOD_NOT_ALLOWED", false);
  }
  let units = 0;
  for (const member of members) {
    const method = member && typeof member === "object" ? (member as { method?: unknown }).method : undefined;
    const weight = typeof method === "string" && Object.hasOwn(ROBINHOOD_RPC_METHOD_UNITS, method)
      ? ROBINHOOD_RPC_METHOD_UNITS[method]
      : undefined;
    if (weight === undefined) throw new ProviderRequestError("PROVIDER_RPC_METHOD_NOT_ALLOWED", false);
    units += weight;
  }
  return units;
}

export type RpcSpendBudget = { reserve(units: number): Promise<void> };

const RESERVE_MONTHLY_UNITS = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local units = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if current + units > limit then return {-1, current} end
local next = current + units
redis.call("SET", KEYS[1], tostring(next), "EX", ttl)
return {next, limit - next}
`;

/**
 * Account-wide monthly compute-unit fuse for the paid dRPC transport. Units
 * are reserved before dispatch and never refunded, so a failed or timed-out
 * call still counts. The public development RPC is not billed and uses the
 * existing per-feature daily counters only.
 */
export function createRobinhoodRpcSpendBudget(
  env: Env,
  redis?: Redis,
  now: () => Date = () => new Date()
): RpcSpendBudget {
  if (env.ROBINHOOD_RPC_PROVIDER !== "drpc") return { reserve: async () => undefined };
  if (redis) return new RedisMonthlySpendBudget(redis, env.DRPC_MONTHLY_CU_LIMIT, now);
  if (env.NODE_ENV === "production") {
    return {
      reserve: async () => {
        throw new ProviderRequestError("PROVIDER_SPEND_GUARD_UNAVAILABLE", false);
      }
    };
  }
  return new MemoryMonthlySpendBudget(env.DRPC_MONTHLY_CU_LIMIT, now);
}

class RedisMonthlySpendBudget implements RpcSpendBudget {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly now: () => Date
  ) {}

  async reserve(units: number): Promise<void> {
    assertUnits(units, this.limit);
    const current = this.now();
    let consumed: number;
    try {
      const result = await this.redis.eval(
        RESERVE_MONTHLY_UNITS,
        1,
        `rh:rpc-spend:drpc:${current.toISOString().slice(0, 7)}`,
        String(units),
        String(this.limit),
        String(secondsUntilNextUtcMonth(current) + 86_400)
      );
      consumed = Array.isArray(result) ? Number(result[0]) : Number.NaN;
    } catch {
      throw new ProviderRequestError("PROVIDER_SPEND_GUARD_UNAVAILABLE", false);
    }
    if (consumed === -1) throw new ProviderRequestError("PROVIDER_MONTHLY_BUDGET_EXCEEDED", false);
    if (!Number.isFinite(consumed)) throw new ProviderRequestError("PROVIDER_SPEND_GUARD_UNAVAILABLE", false);
  }
}

class MemoryMonthlySpendBudget implements RpcSpendBudget {
  private month = "";
  private consumed = 0;

  constructor(
    private readonly limit: number,
    private readonly now: () => Date
  ) {}

  async reserve(units: number): Promise<void> {
    assertUnits(units, this.limit);
    const month = this.now().toISOString().slice(0, 7);
    if (month !== this.month) {
      this.month = month;
      this.consumed = 0;
    }
    if (this.consumed + units > this.limit) throw new ProviderRequestError("PROVIDER_MONTHLY_BUDGET_EXCEEDED", false);
    this.consumed += units;
  }
}

function assertUnits(units: number, limit: number): void {
  if (!Number.isSafeInteger(units) || units <= 0 || units > limit) {
    throw new ProviderRequestError("PROVIDER_MONTHLY_BUDGET_EXCEEDED", false);
  }
}

function secondsUntilNextUtcMonth(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1_000));
}

/**
 * Wraps a provider client so that only allowlisted read methods reach the
 * configured endpoint, paid calls are reserved before dispatch, and the dRPC
 * key travels only as a header to that exact URL with redirects refused.
 */
export class RobinhoodRpcHttp implements ProviderHttp {
  constructor(
    readonly endpoint: RobinhoodRpcEndpoint,
    private readonly inner: ProviderHttp,
    private readonly spend: RpcSpendBudget,
    private readonly credential?: string
  ) {}

  async requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
    if (url !== this.endpoint.url) throw new ProviderRequestError("PROVIDER_DESTINATION_MISMATCH", false);
    const units = jsonRpcUnits(init.body);
    await this.spend.reserve(units);
    const headers = new Headers(init.headers);
    if (this.credential) headers.set("Drpc-Key", this.credential);
    return this.inner.requestJson(url, { ...init, headers, redirect: "error" });
  }
}

export type RobinhoodRpcOptions = {
  providerName: string;
  spend?: RpcSpendBudget;
  client?: Partial<ProviderHttpOptions>;
};

export function createRobinhoodRpcHttp(env: Env, options: RobinhoodRpcOptions): RobinhoodRpcHttp {
  const endpoint = robinhoodRpcEndpoint(env);
  const paid = endpoint.id === "drpc";
  const inner = new ProviderHttpClient({
    maxRetries: env.PROVIDER_MAX_RETRIES,
    backoffMs: env.PROVIDER_BACKOFF_MS,
    timeoutMs: env.PROVIDER_TIMEOUT_MS,
    circuitFailureThreshold: env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD,
    circuitResetMs: env.PROVIDER_CIRCUIT_RESET_MS,
    requestBudgetPerMinute: env.PROVIDER_REQUEST_BUDGET_PER_MINUTE,
    maxConcurrency: env.PROVIDER_MAX_CONCURRENCY,
    ...options.client,
    // A paid attempt is reserved once before dispatch, so the paid transport
    // never retries inside the client.
    ...(paid ? { maxRetries: 0 } : {}),
    providerName: paid ? `drpc:${options.providerName}` : options.providerName
  });
  return new RobinhoodRpcHttp(
    endpoint,
    inner,
    options.spend ?? createRobinhoodRpcSpendBudget(env),
    paid ? env.DRPC_API_KEY : undefined
  );
}
