import type Redis from "ioredis";

const KEY_PREFIX = "opsis:ai-spend:v1";
const TTL_MARGIN_SECONDS = 86_400;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const RESERVE_SPEND = `
local function read_counter(key)
  local raw = redis.call("GET", key)
  if not raw then return 0 end
  if not string.match(raw, "^%d+$") then return nil end
  local value = tonumber(raw)
  if not value or value < 0 or value > 9007199254740991 or value % 1 ~= 0 then return nil end
  return value
end

local daily = read_counter(KEYS[1])
local monthly = read_counter(KEYS[2])
if not daily or not monthly then return {-1, 0, 0} end

local cost = tonumber(ARGV[1])
local daily_cap = tonumber(ARGV[2])
local monthly_cap = tonumber(ARGV[3])
local daily_ttl = tonumber(ARGV[4])
local monthly_ttl = tonumber(ARGV[5])
if not cost or not daily_cap or not monthly_cap or not daily_ttl or not monthly_ttl then return {-1, 0, 0} end
if daily + cost > daily_cap or monthly + cost > monthly_cap then return {0, daily, monthly} end

local next_daily = daily + cost
local next_monthly = monthly + cost
redis.call("SET", KEYS[1], string.format("%.0f", next_daily), "EX", daily_ttl)
redis.call("SET", KEYS[2], string.format("%.0f", next_monthly), "EX", monthly_ttl)
return {1, next_daily, next_monthly}
`;

export type AiSpendReservationResult =
  | { status: "reserved"; remainingDailyMicroUsd: number; remainingMonthlyMicroUsd: number }
  | { status: "exhausted"; remainingDailyMicroUsd: number; remainingMonthlyMicroUsd: number }
  | { status: "unavailable" };

/** A single reservation covers one physical paid attempt, including provider retries. */
export interface AiSpendReservationLedger {
  reserve(costUpperBoundMicroUsd: number): Promise<AiSpendReservationResult>;
}

export interface AiSpendRedis {
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
}

export interface AiSpendCaps {
  dailyCapMicroUsd: number;
  monthlyCapMicroUsd: number;
}

export function validateAiSpendCaps(caps: AiSpendCaps): void {
  assertPositiveSafeInteger(caps.dailyCapMicroUsd, "daily cap");
  assertPositiveSafeInteger(caps.monthlyCapMicroUsd, "monthly cap");
  if (caps.dailyCapMicroUsd > caps.monthlyCapMicroUsd) {
    throw new RangeError("Daily AI spend cap must not exceed monthly cap");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`AI spend ${name} must be a positive safe integer in micro-USD`);
  }
}

function periodKeys(now: Date): { dailyKey: string; monthlyKey: string; dailyTtl: number; monthlyTtl: number } {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new RangeError("AI spend clock must return a valid date");
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const nextDay = Date.UTC(year, month, day + 1);
  const nextMonth = Date.UTC(year, month + 1, 1);
  const ttl = (end: number) => Math.max(1, Math.ceil((end - time) / 1000) + TTL_MARGIN_SECONDS);
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    dailyKey: `${KEY_PREFIX}:daily:${yyyy}-${mm}-${dd}`,
    monthlyKey: `${KEY_PREFIX}:monthly:${yyyy}-${mm}`,
    dailyTtl: ttl(nextDay),
    monthlyTtl: ttl(nextMonth),
  };
}

function parseReply(reply: unknown): [number, number, number] | undefined {
  if (!Array.isArray(reply) || reply.length !== 3) return undefined;
  const values = reply.map((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return Number(value);
    return NaN;
  });
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return undefined;
  return values as [number, number, number];
}

export class RedisAiSpendReservationLedger implements AiSpendReservationLedger {
  constructor(
    private readonly redis: Pick<Redis, "eval"> | AiSpendRedis,
    private readonly caps: AiSpendCaps,
    private readonly now: () => Date = () => new Date(),
  ) {
    validateAiSpendCaps(caps);
  }

  async reserve(costUpperBoundMicroUsd: number): Promise<AiSpendReservationResult> {
    if (!Number.isSafeInteger(costUpperBoundMicroUsd) || costUpperBoundMicroUsd <= 0) {
      throw new RangeError("AI request cost upper bound must be a positive safe integer in micro-USD");
    }
    let keys: ReturnType<typeof periodKeys>;
    try {
      keys = periodKeys(this.now());
    } catch {
      return { status: "unavailable" };
    }

    try {
      const reply = parseReply(await this.redis.eval(
        RESERVE_SPEND,
        2,
        keys.dailyKey,
        keys.monthlyKey,
        String(costUpperBoundMicroUsd),
        String(this.caps.dailyCapMicroUsd),
        String(this.caps.monthlyCapMicroUsd),
        String(keys.dailyTtl),
        String(keys.monthlyTtl),
      ));
      if (!reply) return { status: "unavailable" };
      const [status, dailySpent, monthlySpent] = reply;
      if (status === -1 || status > 1) return { status: "unavailable" };
      if (dailySpent > this.caps.dailyCapMicroUsd || monthlySpent > this.caps.monthlyCapMicroUsd) {
        return { status: "unavailable" };
      }
      const remainingDailyMicroUsd = this.caps.dailyCapMicroUsd - dailySpent;
      const remainingMonthlyMicroUsd = this.caps.monthlyCapMicroUsd - monthlySpent;
      if (status === 0) return { status: "exhausted", remainingDailyMicroUsd, remainingMonthlyMicroUsd };
      if (status !== 1 || dailySpent < costUpperBoundMicroUsd || monthlySpent < costUpperBoundMicroUsd) {
        return { status: "unavailable" };
      }
      return { status: "reserved", remainingDailyMicroUsd, remainingMonthlyMicroUsd };
    } catch {
      return { status: "unavailable" };
    }
  }
}
