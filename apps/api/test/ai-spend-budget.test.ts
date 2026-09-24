import { describe, expect, it, vi } from "vitest";
import {
  RedisAiSpendReservationLedger,
  validateAiSpendCaps,
  type AiSpendRedis,
} from "../src/ai/spend-budget.js";

class FakeRedis implements AiSpendRedis {
  values = new Map<string, number>();
  ttls = new Map<string, number>();
  calls: Array<{ keys: string[]; args: string[] }> = [];
  error = false;
  malformed: unknown;

  async eval(_script: string, count: number, ...args: string[]): Promise<unknown> {
    const keys = args.slice(0, count);
    const values = args.slice(count);
    this.calls.push({ keys, args: values });
    if (this.error) throw new Error("redis unavailable");
    if (this.malformed !== undefined) return this.malformed;
    const [cost, dayCap, monthCap, dayTtl, monthTtl] = values.map(Number);
    const day = this.values.get(keys[0]!) ?? 0;
    const month = this.values.get(keys[1]!) ?? 0;
    if (day + cost > dayCap || month + cost > monthCap) return [0, day, month];
    this.values.set(keys[0]!, day + cost);
    this.values.set(keys[1]!, month + cost);
    this.ttls.set(keys[0]!, dayTtl!);
    this.ttls.set(keys[1]!, monthTtl!);
    return [1, day + cost, month + cost];
  }
}

const at = (value: string) => () => new Date(value);
const caps = { dailyCapMicroUsd: 100, monthlyCapMicroUsd: 500 };

describe("AI spend reservation ledger", () => {
  it("reserves exact cap boundaries and reports remaining balances", async () => {
    const redis = new FakeRedis();
    const ledger = new RedisAiSpendReservationLedger(redis, caps, at("2026-09-23T12:00:00.000Z"));
    expect(await ledger.reserve(100)).toEqual({ status: "reserved", remainingDailyMicroUsd: 0, remainingMonthlyMicroUsd: 400 });
    expect(await ledger.reserve(1)).toEqual({ status: "exhausted", remainingDailyMicroUsd: 0, remainingMonthlyMicroUsd: 400 });
  });

  it("uses canonical UTC day and month keys and retains keys through period end with margin", async () => {
    const redis = new FakeRedis();
    const ledger = new RedisAiSpendReservationLedger(redis, caps, at("2026-09-30T23:59:30.000Z"));
    await ledger.reserve(10);
    expect(redis.calls[0]?.keys).toEqual([
      "opsis:ai-spend:v1:daily:2026-09-30",
      "opsis:ai-spend:v1:monthly:2026-09",
    ]);
    expect(redis.calls[0]?.args.slice(3)).toEqual(["86430", "86430"]);
    expect(redis.ttls.get(redis.calls[0]!.keys[0]!)).toBe(86_430);
    const nextMonth = new RedisAiSpendReservationLedger(redis, caps, at("2026-10-01T00:00:00.000Z"));
    await nextMonth.reserve(10);
    expect(redis.calls[1]?.keys).toEqual([
      "opsis:ai-spend:v1:daily:2026-10-01",
      "opsis:ai-spend:v1:monthly:2026-10",
    ]);
  });

  it.each([
    ["daily", 95, 1, 100, 500],
    ["monthly", 0, 95, 100, 100],
  ])("does not partially debit when the %s cap is exhausted", async (_kind, daily, monthly, dailyCap, monthlyCap) => {
    const redis = new FakeRedis();
    const ledger = new RedisAiSpendReservationLedger(redis, { dailyCapMicroUsd: dailyCap, monthlyCapMicroUsd: monthlyCap }, at("2026-09-23T12:00:00Z"));
    redis.values.set("opsis:ai-spend:v1:daily:2026-09-23", daily);
    redis.values.set("opsis:ai-spend:v1:monthly:2026-09", monthly);
    const before = [...redis.values.entries()];
    expect((await ledger.reserve(10)).status).toBe("exhausted");
    expect([...redis.values.entries()]).toEqual(before);
  });

  it("fails closed on Redis errors, malformed replies and unknown status values", async () => {
    const redis = new FakeRedis();
    const ledger = new RedisAiSpendReservationLedger(redis, caps);
    redis.error = true;
    expect(await ledger.reserve(1)).toEqual({ status: "unavailable" });
    redis.error = false;
    for (const reply of [null, [], ["wat", 0, 0], [1, -1, 0], [1, 0, 0, 4], [2, 0, 0]]) {
      redis.malformed = reply;
      expect(await ledger.reserve(1)).toEqual({ status: "unavailable" });
    }
  });

  it("fails closed if the stored counter is malformed", async () => {
    const redis: AiSpendRedis = { eval: vi.fn().mockResolvedValue([-1, 0, 0]) };
    const ledger = new RedisAiSpendReservationLedger(redis, caps);
    expect(await ledger.reserve(1)).toEqual({ status: "unavailable" });
  });

  it("admits only one of two concurrent requests that would jointly exceed the cap", async () => {
    const redis = new FakeRedis();
    const first = new RedisAiSpendReservationLedger(redis, { dailyCapMicroUsd: 100, monthlyCapMicroUsd: 200 });
    const second = new RedisAiSpendReservationLedger(redis, { dailyCapMicroUsd: 100, monthlyCapMicroUsd: 200 });
    const results = await Promise.all([first.reserve(60), second.reserve(60)]);
    expect(results.map((result) => result.status).sort()).toEqual(["exhausted", "reserved"]);
    expect([...redis.values.values()]).toEqual([60, 60]);
  });

  it("rejects invalid caps and reservation costs", async () => {
    for (const cap of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateAiSpendCaps({ dailyCapMicroUsd: cap, monthlyCapMicroUsd: 100 })).toThrow();
    }
    expect(() => validateAiSpendCaps({ dailyCapMicroUsd: 101, monthlyCapMicroUsd: 100 })).toThrow();
    const ledger = new RedisAiSpendReservationLedger(new FakeRedis(), caps);
    for (const cost of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(ledger.reserve(cost)).rejects.toThrow();
    }
  });
});
