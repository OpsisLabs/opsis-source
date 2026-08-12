import { createHmac } from "node:crypto";
import type Redis from "ioredis";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";

const CONSUME = `
local identity = tonumber(redis.call("GET", KEYS[1]) or "0")
local global = tonumber(redis.call("GET", KEYS[2]) or "0")
local identity_limit = tonumber(ARGV[1])
local global_limit = tonumber(ARGV[2])
local identity_ttl = tonumber(ARGV[3])
local global_ttl = tonumber(ARGV[4])
if identity + 1 > identity_limit then return {-1, identity, global} end
if global + 1 > global_limit then return {-2, identity, global} end
local next_identity = redis.call("INCR", KEYS[1])
if next_identity == 1 then redis.call("EXPIRE", KEYS[1], identity_ttl) end
local next_global = redis.call("INCR", KEYS[2])
if next_global == 1 then redis.call("EXPIRE", KEYS[2], global_ttl) end
return {next_identity, next_global}
`;

export type OpenDataLimitResult = { limit: number; remaining: number; resetSeconds: number };
export type OpenDataLimiter = { consume(clientAddress: string): Promise<OpenDataLimitResult> };

export function createOpenDataLimiter(
  env: Env,
  redis?: Redis,
  now: () => Date = () => new Date(),
): OpenDataLimiter {
  if (!redis) {
    return {
      consume: async () => {
        throw new AppError("OPEN_DATA_CAP_UNAVAILABLE", 503, "The Open Data safety cap is unavailable");
      },
    };
  }
  return {
    consume: async (clientAddress) => {
      const current = now();
      const identity = createHmac("sha256", env.JWT_ACCESS_SECRET)
        .update(`chainscout:open-data:${clientAddress.trim().toLowerCase()}`)
        .digest("hex");
      const hour = current.toISOString().slice(0, 13);
      const day = current.toISOString().slice(0, 10);
      const resetSeconds = secondsUntilNextUtcHour(current);
      try {
        const result = await redis.eval(
          CONSUME,
          2,
          `rh:open-data:identity:${hour}:${identity}`,
          `rh:open-data:global:${day}`,
          String(env.RATE_LIMIT_OPEN_DATA_PER_HOUR),
          String(env.OPEN_DATA_DAILY_REQUEST_BUDGET),
          String(resetSeconds + 60),
          String(secondsUntilNextUtcDay(current) + 3_600),
        );
        const values = Array.isArray(result) ? result.map(Number) : [];
        const consumed = values[0];
        if (values[0] === -1) {
          throw new AppError("OPEN_DATA_RATE_LIMIT_EXCEEDED", 429, "The anonymous Open Data hourly cap was reached", { retryAfterSeconds: resetSeconds });
        }
        if (values[0] === -2) {
          throw new AppError("OPEN_DATA_DAILY_CAP_EXCEEDED", 503, "The Open Data daily safety cap was reached");
        }
        if (typeof consumed !== "number" || !Number.isFinite(consumed)) throw new Error("invalid Redis limiter result");
        return {
          limit: env.RATE_LIMIT_OPEN_DATA_PER_HOUR,
          remaining: Math.max(0, env.RATE_LIMIT_OPEN_DATA_PER_HOUR - consumed),
          resetSeconds,
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("OPEN_DATA_CAP_UNAVAILABLE", 503, "The Open Data safety cap is unavailable");
      }
    },
  };
}

function secondsUntilNextUtcHour(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1_000));
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1_000));
}
