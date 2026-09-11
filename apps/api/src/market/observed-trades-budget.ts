import type Redis from "ioredis";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";

const CONSUME_DAILY_BUDGET = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local units = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if current + units > limit then return {-1, current} end
local next = current + units
redis.call("SET", KEYS[1], tostring(next), "EX", ttl)
return {next, limit - next}
`;

export type ObservedTradesBudget = { consume(units: number): Promise<void> };

export function createObservedTradesBudget(
  env: Env,
  redis?: Redis,
  now: () => Date = () => new Date(),
): ObservedTradesBudget {
  if (redis)
    return new RedisObservedTradesBudget(
      redis,
      env.OBSERVED_TRADES_DAILY_RPC_UNIT_BUDGET,
      now,
    );
  if (env.NODE_ENV === "production") {
    return {
      consume: async () => {
        throw new AppError(
          "OBSERVED_TRADES_BUDGET_UNAVAILABLE",
          503,
          "The free observed-trades budget guard is unavailable",
        );
      },
    };
  }
  return new MemoryObservedTradesBudget(
    env.OBSERVED_TRADES_DAILY_RPC_UNIT_BUDGET,
    now,
  );
}

class RedisObservedTradesBudget implements ObservedTradesBudget {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly now: () => Date,
  ) {}

  async consume(units: number): Promise<void> {
    assertUnits(units, this.limit);
    const current = this.now();
    try {
      const result = await this.redis.eval(
        CONSUME_DAILY_BUDGET,
        1,
        `rh:observed-trades-budget:${current.toISOString().slice(0, 10)}`,
        String(units),
        String(this.limit),
        String(secondsUntilNextUtcDay(current) + 3_600),
      );
      const consumed = Array.isArray(result) ? Number(result[0]) : Number.NaN;
      if (consumed === -1)
        throw new AppError(
          "OBSERVED_TRADES_DAILY_BUDGET_EXCEEDED",
          503,
          "Today's free observed-trades budget has been reached",
        );
      if (!Number.isFinite(consumed))
        throw new Error("invalid Redis budget result");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "OBSERVED_TRADES_BUDGET_UNAVAILABLE",
        503,
        "The free observed-trades budget guard is unavailable",
      );
    }
  }
}

class MemoryObservedTradesBudget implements ObservedTradesBudget {
  private day = "";
  private consumed = 0;
  constructor(
    private readonly limit: number,
    private readonly now: () => Date,
  ) {}
  async consume(units: number): Promise<void> {
    assertUnits(units, this.limit);
    const day = this.now().toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.consumed = 0;
    }
    if (this.consumed + units > this.limit)
      throw new AppError(
        "OBSERVED_TRADES_DAILY_BUDGET_EXCEEDED",
        503,
        "Today's free observed-trades budget has been reached",
      );
    this.consumed += units;
  }
}

function assertUnits(units: number, limit: number): void {
  if (!Number.isInteger(units) || units <= 0 || units > limit) {
    throw new AppError(
      "OBSERVED_TRADES_RPC_LIMIT_EXCEEDED",
      503,
      "The observation exceeded its RPC safety limit",
    );
  }
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1_000));
}
