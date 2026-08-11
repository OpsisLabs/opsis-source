import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JsonCache } from "../src/cache/service.js";
import { loadEnv } from "../src/config/env.js";
import { createPortfolioBudget } from "../src/portfolio/budget.js";
import { createRwaBudget } from "../src/rwa/budget.js";

const redisUrl = process.env.TEST_REDIS_URL;
const redisDatabase = redisUrl ? Number(new URL(redisUrl).pathname.slice(1)) : 0;
if (redisUrl && (!Number.isInteger(redisDatabase) || redisDatabase < 1)) {
  throw new Error("TEST_REDIS_URL must use a non-default Redis database");
}

if (!redisUrl) {
  describe.skip("Redis integration", () => {
    it("requires TEST_REDIS_URL", () => undefined);
  });
} else {
  describe("Redis integration", () => {
    const redis = new Redis(redisUrl);

    beforeAll(() => redis.flushdb());
    afterAll(async () => {
      await redis.flushdb();
      await redis.quit();
    });

    it("stores expiring JSON and shares rate limits", async () => {
      const cache = new JsonCache(redis, 30);
      await cache.set("integration", { ok: true });
      expect(await cache.get("integration")).toEqual({ ok: true });
      expect(await redis.ttl("rh:cache:integration")).toBeGreaterThan(0);

      const app = await buildApp(
        loadEnv({ NODE_ENV: "test", REDIS_URL: redisUrl, RATE_LIMIT_PUBLIC_PER_HOUR: "2" })
      );
      try {
        expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
        expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
        expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
        expect((await app.inject({ method: "GET", url: "/v1/auth/me" })).statusCode).toBe(401);
        expect((await app.inject({ method: "GET", url: "/v1/auth/me" })).statusCode).toBe(401);
        expect((await app.inject({ method: "GET", url: "/v1/auth/me" })).statusCode).toBe(429);
        expect(await redis.keys("rh:rate-limit:*")).not.toEqual([]);
      } finally {
        await app.close();
      }
    });

    it("atomically shares the address-free daily portfolio budget", async () => {
      const env = loadEnv({ NODE_ENV: "test", PORTFOLIO_DAILY_RPC_UNIT_BUDGET: "100" });
      const now = () => new Date("2026-08-10T12:00:00.000Z");
      const first = createPortfolioBudget(env, redis, now);
      const second = createPortfolioBudget(env, redis, now);
      await first.consume(60);
      await second.consume(40);
      await expect(first.consume(1)).rejects.toMatchObject({ code: "PORTFOLIO_DAILY_BUDGET_EXCEEDED" });
      const keys = await redis.keys("rh:portfolio-budget:*");
      expect(keys).toEqual(["rh:portfolio-budget:2026-08-10"]);
      expect(await redis.get(keys[0])).toBe("100");
      expect(await redis.ttl(keys[0])).toBeGreaterThan(0);
    });

    it("atomically shares the address-free daily RWA budget", async () => {
      const env = loadEnv({ NODE_ENV: "test", RWA_DAILY_RPC_UNIT_BUDGET: "100" });
      const now = () => new Date("2026-08-11T12:00:00.000Z");
      const first = createRwaBudget(env, redis, now);
      const second = createRwaBudget(env, redis, now);
      await Promise.all([first.consume(40), second.consume(60)]);
      await expect(first.consume(1)).rejects.toMatchObject({ code: "RWA_DAILY_BUDGET_EXCEEDED" });
      const keys = await redis.keys("rh:rwa-budget:*");
      expect(keys).toEqual(["rh:rwa-budget:2026-08-11"]);
      expect(await redis.get(keys[0])).toBe("100");
    });
  });
}
