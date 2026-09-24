import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisAiSpendReservationLedger } from "../src/ai/spend-budget.js";

const redisUrl = process.env.AI_SPEND_TEST_REDIS_URL;
if (redisUrl) {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" || url.hostname !== "127.0.0.1" || url.port !== "6398" ||
      url.pathname !== "/15" || url.username || url.password || url.search || url.hash) {
    throw new Error("AI spend integration test requires disposable redis://127.0.0.1:6398/15");
  }
}

if (!redisUrl) {
  describe.skip("AI spend Redis integration", () => {
    it("requires a disposable local Redis", () => undefined);
  });
} else {
  describe("AI spend Redis integration", () => {
    const redis = new Redis(redisUrl);
    const keys = [
      "opsis:ai-spend:v1:daily:2035-01-01",
      "opsis:ai-spend:v1:daily:2035-01-02",
      "opsis:ai-spend:v1:monthly:2035-01",
    ];
    const caps = { dailyCapMicroUsd: 100, monthlyCapMicroUsd: 150 };
    const on = (date: string) => () => new Date(date);

    beforeAll(async () => { await redis.del(...keys); });
    afterAll(async () => {
      await redis.del(...keys);
      await redis.quit();
    });

    it("admits one concurrent reservation and enforces both UTC caps without a partial debit", async () => {
      const first = new RedisAiSpendReservationLedger(redis, caps, on("2035-01-01T23:59:00Z"));
      const second = new RedisAiSpendReservationLedger(redis, caps, on("2035-01-01T23:59:00Z"));
      const results = await Promise.all([first.reserve(60), second.reserve(60)]);
      expect(results.map((result) => result.status).sort()).toEqual(["exhausted", "reserved"]);
      expect(await redis.get(keys[0]!)).toBe("60");
      expect(await redis.get(keys[2]!)).toBe("60");
      expect(await redis.ttl(keys[0]!)).toBeGreaterThan(0);

      const nextDay = new RedisAiSpendReservationLedger(redis, caps, on("2035-01-02T00:00:00Z"));
      expect((await nextDay.reserve(90)).status).toBe("reserved");
      expect((await nextDay.reserve(1)).status).toBe("exhausted");
      expect(await redis.get(keys[1]!)).toBe("90");
      expect(await redis.get(keys[2]!)).toBe("150");
    });

    it("fails closed on a corrupt stored counter", async () => {
      await redis.set(keys[1]!, "invalid");
      const ledger = new RedisAiSpendReservationLedger(redis, caps, on("2035-01-02T12:00:00Z"));
      expect(await ledger.reserve(1)).toEqual({ status: "unavailable" });
      expect(await redis.get(keys[2]!)).toBe("150");
    });
  });
}
