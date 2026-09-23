import { createHash, randomUUID } from "node:crypto";
import type Redis from "ioredis";
import type { HistoryWorkerLease, RangeAttemptBudget, WorkerRange } from "./public-swap-capture-worker.js";

export const DEFAULT_HISTORY_WORKER_LEASE_TTL_MS = 60_000;
const BUDGET_TTL_BUFFER_SECONDS = 3_600;
const LEASE_PREFIX = "rh:public-swap-history-worker:lease:v1:";
const BUDGET_PREFIX = "rh:public-swap-history-range-attempt:v1:";

const CONFIRM_AND_RENEW = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("PEXPIRE", KEYS[1], ARGV[2])
`;
const RELEASE_IF_OWNER = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;
const RESERVE_DAILY_ATTEMPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current >= tonumber(ARGV[1]) then return 0 end
local next = redis.call("INCR", KEYS[1])
if next == 1 then redis.call("EXPIRE", KEYS[1], ARGV[2]) end
return 1
`;

type RedisGuardsClient = Pick<Redis, "set" | "eval">;

/** A bounded capture must finish in less than this lease TTL. No renewal timer is started. */
export class RedisHistoryWorkerLease implements HistoryWorkerLease {
  constructor(
    private readonly redis: RedisGuardsClient,
    readonly ttlMs = DEFAULT_HISTORY_WORKER_LEASE_TTL_MS,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new TypeError("History worker lease TTL must be a positive safe integer");
  }

  async acquire(key: string): Promise<string | null> {
    const token = randomUUID();
    try {
      const result = await this.redis.set(this.key(key), token, "PX", this.ttlMs, "NX");
      if (result === null) return null;
      if (result !== "OK") throw new Error("Malformed Redis lease acquisition result");
      return token;
    } catch {
      // Redis errors and malformed responses never report ownership.
      return null;
    }
  }

  async confirm(key: string, ownerToken: string): Promise<boolean> {
    if (!isUuid(ownerToken)) return false;
    const result = await this.redis.eval(CONFIRM_AND_RENEW, 1, this.key(key), ownerToken, String(this.ttlMs));
    if (result === 1 || result === "1") return true;
    if (result === 0 || result === "0") return false;
    throw new Error("Malformed Redis lease confirmation result");
  }

  async release(key: string, ownerToken: string): Promise<void> {
    if (!isUuid(ownerToken)) return;
    const result = await this.redis.eval(RELEASE_IF_OWNER, 1, this.key(key), ownerToken);
    if (result !== 0 && result !== 1 && result !== "0" && result !== "1") throw new Error("Malformed Redis lease release result");
  }

  private key(key: string): string {
    if (typeof key !== "string" || key.length === 0 || key.length > 200) throw new TypeError("Invalid history worker lease key");
    return `${LEASE_PREFIX}${createHash("sha256").update(key).digest("hex")}`;
  }
}

/** Atomic UTC-day range-attempt cap. Each accepted reservation is permanent for that UTC day. */
export class RedisRangeAttemptBudget implements RangeAttemptBudget {
  constructor(
    private readonly redis: RedisGuardsClient,
    readonly dailyCap: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isSafeInteger(dailyCap) || dailyCap <= 0 || dailyCap > 1000) {
      throw new TypeError("Range-attempt daily cap must be an integer from 1 to 1000");
    }
  }

  async reserve(_input: { kind: "RANGE-ATTEMPT"; range: WorkerRange }): Promise<boolean> {
    const current = this.now();
    if (!(current instanceof Date) || !Number.isFinite(current.getTime())) throw new TypeError("Invalid budget clock");
    const day = current.toISOString().slice(0, 10);
    const nextUtcDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1);
    const ttlSeconds = Math.ceil((nextUtcDay - current.getTime()) / 1000) + BUDGET_TTL_BUFFER_SECONDS;
    try {
      const result = await this.redis.eval(RESERVE_DAILY_ATTEMPT, 1, `${BUDGET_PREFIX}${day}`, String(this.dailyCap), String(ttlSeconds));
      if (result === 1 || result === "1") return true;
      if (result === 0 || result === "0") return false;
      throw new Error("Malformed Redis range-attempt budget result");
    } catch (error) {
      throw new Error("Range-attempt budget unavailable", { cause: error });
    }
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
