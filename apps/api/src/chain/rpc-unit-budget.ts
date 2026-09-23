import type Redis from "ioredis";

const RESERVE_UNITS = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local units = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if current + units > limit then return {-1, current} end
local next = current + units
redis.call("SET", KEYS[1], tostring(next), "EX", ttl)
return {next, limit - next}
`;

export type RpcBudgetReservation =
  | { outcome: "reserved"; units: number; remaining: number }
  | { outcome: "exhausted" | "unmetered" | "unavailable" };

export interface RpcUnitBudget {
  reserve(methods: readonly string[]): Promise<RpcBudgetReservation>;
}

type RedisEval = Pick<Redis, "eval">;

/**
 * One account-wide reservation ledger for a reviewed provider plan. Every
 * physical attempt, including a retry and each JSON-RPC batch member, must
 * reserve its units before the request is sent. Callers must not fall back to
 * another endpoint when this ledger denies a request.
 */
export class RedisMonthlyRpcUnitBudget implements RpcUnitBudget {
  constructor(
    private readonly redis: RedisEval,
    private readonly accountKey: string,
    private readonly monthlyLimit: number,
    private readonly methodUnits: Readonly<Record<string, number>>,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!/^[a-z0-9-]{1,64}$/.test(accountKey)) throw new Error("Invalid RPC budget account key");
    if (!Number.isSafeInteger(monthlyLimit) || monthlyLimit <= 0) throw new Error("Invalid RPC monthly unit limit");
    if (Object.keys(methodUnits).length === 0 || Object.values(methodUnits).some((units) => !Number.isSafeInteger(units) || units <= 0)) {
      throw new Error("Invalid RPC method unit schedule");
    }
  }

  async reserve(methods: readonly string[]): Promise<RpcBudgetReservation> {
    if (methods.length === 0 || methods.length > 100) return { outcome: "unmetered" };
    let units = 0;
    for (const method of methods) {
      const weight = this.methodUnits[method];
      if (!weight) return { outcome: "unmetered" };
      units += weight;
      if (!Number.isSafeInteger(units) || units > this.monthlyLimit) return { outcome: "exhausted" };
    }
    const current = this.now();
    const month = current.toISOString().slice(0, 7);
    const nextMonth = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1);
    const ttl = Math.max(1, Math.ceil((nextMonth - current.getTime()) / 1_000) + 3_600);
    try {
      const result = await this.redis.eval(
        RESERVE_UNITS,
        1,
        `rh:rpc-account-budget:${this.accountKey}:${month}`,
        String(units),
        String(this.monthlyLimit),
        String(ttl),
      );
      if (!Array.isArray(result)) return { outcome: "unavailable" };
      const consumed = Number(result[0]);
      const remaining = Number(result[1]);
      if (consumed === -1) return { outcome: "exhausted" };
      if (!Number.isSafeInteger(consumed) || !Number.isSafeInteger(remaining) || remaining < 0 || consumed + remaining !== this.monthlyLimit) {
        return { outcome: "unavailable" };
      }
      return { outcome: "reserved", units, remaining };
    } catch {
      return { outcome: "unavailable" };
    }
  }
}
