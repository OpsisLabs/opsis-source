import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JsonCache } from "../src/cache/service.js";
import { loadEnv } from "../src/config/env.js";
import { createPortfolioBudget } from "../src/portfolio/budget.js";
import { createRwaBudget } from "../src/rwa/budget.js";
import { createCollectibleBudget } from "../src/collectibles/budget.js";
import { createMarketBudget } from "../src/market/budget.js";
import { createOpenDataLimiter } from "../src/open-data/limiter.js";

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

    it("atomically shares the query-free daily collectible budget", async () => {
      const env = loadEnv({ NODE_ENV: "test", COLLECTIBLE_DAILY_REQUEST_BUDGET: "50" });
      const now = () => new Date("2026-08-11T12:00:00.000Z");
      const first = createCollectibleBudget(env, redis, now);
      const second = createCollectibleBudget(env, redis, now);
      await Promise.all(Array.from({ length: 50 }, (_, index) => (index % 2 ? first : second).consume(1)));
      await expect(first.consume(1)).rejects.toMatchObject({ code: "COLLECTIBLE_DAILY_BUDGET_EXCEEDED" });
      const keys = await redis.keys("rh:collectible-budget:*");
      expect(keys).toEqual(["rh:collectible-budget:2026-08-11"]);
      expect(await redis.get(keys[0])).toBe("50");
    });

    it("atomically shares the identifier-free daily market budget", async () => {
      const env = loadEnv({ NODE_ENV: "test", MARKET_DAILY_REQUEST_BUDGET: "50" });
      const now = () => new Date("2026-08-11T12:00:00.000Z");
      const first = createMarketBudget(env, redis, now);
      const second = createMarketBudget(env, redis, now);
      await Promise.all(Array.from({ length: 50 }, (_, index) => (index % 2 ? first : second).consume(1)));
      await expect(second.consume(1)).rejects.toMatchObject({ code: "MARKET_DAILY_BUDGET_EXCEEDED" });
      const keys = await redis.keys("rh:market-budget:*");
      expect(keys).toEqual(["rh:market-budget:2026-08-11"]);
      expect(await redis.get(keys[0])).toBe("50");
    });

    it("atomically shares Open Data identity and global caps without storing raw client addresses", async () => {
      const env = loadEnv({
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: "open_data_test_hmac_secret",
        RATE_LIMIT_OPEN_DATA_PER_HOUR: "2",
        OPEN_DATA_DAILY_REQUEST_BUDGET: "100",
      });
      const now = () => new Date("2026-08-12T12:00:00.000Z");
      const first = createOpenDataLimiter(env, redis, now);
      const second = createOpenDataLimiter(env, redis, now);
      await Promise.all([first.consume("203.0.113.42"), second.consume("203.0.113.42")]);
      await expect(first.consume("203.0.113.42")).rejects.toMatchObject({ code: "OPEN_DATA_RATE_LIMIT_EXCEEDED" });
      const keys = await redis.keys("rh:open-data:*");
      expect(keys).toHaveLength(2);
      expect(keys.join("\n")).not.toContain("203.0.113.42");
      expect(await redis.get("rh:open-data:global:2026-08-12")).toBe("2");
      expect(await redis.ttl(keys.find((key) => key.includes(":identity:"))!)).toBeGreaterThan(0);
      expect(await redis.ttl("rh:open-data:global:2026-08-12")).toBeGreaterThan(0);
    });

    it("atomically exhausts the Open Data global cap across different identities and fails closed on Redis outage", async () => {
      const env = loadEnv({
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: "open_data_global_test_secret",
        RATE_LIMIT_OPEN_DATA_PER_HOUR: "100",
        OPEN_DATA_DAILY_REQUEST_BUDGET: "100",
      });
      const now = () => new Date("2026-08-13T12:00:00.000Z");
      const first = createOpenDataLimiter(env, redis, now);
      const second = createOpenDataLimiter(env, redis, now);
      await Promise.all(Array.from({ length: 100 }, (_, index) => (index % 2 ? first : second).consume(`198.51.100.${index + 1}`)));
      await expect(second.consume("203.0.113.250")).rejects.toMatchObject({ code: "OPEN_DATA_DAILY_CAP_EXCEEDED" });
      expect(await redis.get("rh:open-data:global:2026-08-13")).toBe("100");
      const broken = createOpenDataLimiter(env, { eval: async () => { throw new Error("offline"); } } as unknown as Redis, now);
      await expect(broken.consume("203.0.113.251")).rejects.toMatchObject({ code: "OPEN_DATA_CAP_UNAVAILABLE" });
    });
  });
}
