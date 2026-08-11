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

export type MarketBudget = { consume(units: number): Promise<void> };

export function createMarketBudget(
  env: Env,
  redis?: Redis,
  now: () => Date = () => new Date(),
): MarketBudget {
  if (redis)
    return new RedisMarketBudget(redis, env.MARKET_DAILY_REQUEST_BUDGET, now);
  if (env.NODE_ENV === "production") {
    return {
      consume: async () => {
        throw new AppError(
          "MARKET_BUDGET_UNAVAILABLE",
          503,
          "The free market-data budget guard is unavailable",
        );
      },
    };
  }
  return new MemoryMarketBudget(env.MARKET_DAILY_REQUEST_BUDGET, now);
}

class RedisMarketBudget implements MarketBudget {
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
        `rh:market-budget:${current.toISOString().slice(0, 10)}`,
        String(units),
        String(this.limit),
        String(secondsUntilNextUtcDay(current) + 3_600),
      );
      const consumed = Array.isArray(result) ? Number(result[0]) : Number.NaN;
      if (consumed === -1)
        throw new AppError(
          "MARKET_DAILY_BUDGET_EXCEEDED",
          503,
          "Today's free market-data budget has been reached",
        );
      if (!Number.isFinite(consumed))
        throw new Error("invalid Redis budget result");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "MARKET_BUDGET_UNAVAILABLE",
        503,
        "The free market-data budget guard is unavailable",
      );
    }
  }
}

class MemoryMarketBudget implements MarketBudget {
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
        "MARKET_DAILY_BUDGET_EXCEEDED",
        503,
        "Today's free market-data budget has been reached",
      );
    this.consumed += units;
  }
}

function assertUnits(units: number, limit: number): void {
  if (!Number.isInteger(units) || units <= 0 || units > limit) {
    throw new AppError(
      "MARKET_REQUEST_LIMIT_EXCEEDED",
      503,
      "The market lookup exceeded its request safety limit",
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
