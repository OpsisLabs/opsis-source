import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JsonCache } from "../src/cache/service.js";
import { loadEnv } from "../src/config/env.js";

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
  });
}
