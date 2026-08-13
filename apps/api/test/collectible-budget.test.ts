import { describe, expect, it } from "vitest";
import { createCollectibleBudget } from "../src/collectibles/budget.js";
import { loadEnv } from "../src/config/env.js";

describe("collectible provider budget", () => {
  it("enforces and resets the in-memory daily ceiling", async () => {
    let now = new Date("2026-08-11T12:00:00.000Z");
    const budget = createCollectibleBudget(loadEnv({ NODE_ENV: "test", COLLECTIBLE_DAILY_REQUEST_BUDGET: "50" }), undefined, () => now);
    await budget.consume(49);
    await expect(budget.consume(2)).rejects.toMatchObject({ code: "COLLECTIBLE_DAILY_BUDGET_EXCEEDED" });
    now = new Date("2026-08-12T00:00:01.000Z");
    await expect(budget.consume(2)).resolves.toBeUndefined();
  });

  it("fails closed in production without Redis", async () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ORIGIN: "https://chainscout.example", JWT_ACCESS_SECRET: "configured-access-secret-at-least-32", JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      DATABASE_URL: "postgresql://user:password@db.example.com/app", REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters"
    });
    await expect(createCollectibleBudget(env).consume(1)).rejects.toMatchObject({ code: "COLLECTIBLE_BUDGET_UNAVAILABLE" });
  });
});
