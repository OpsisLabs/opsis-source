import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { createRwaBudget } from "../src/rwa/budget.js";

describe("RWA public-RPC budget", () => {
  it("fails closed in production without a shared Redis guard", async () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ORIGIN: "https://chainscout.example",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      DATABASE_URL: "postgresql://user:pass@db.example/app",
      REDIS_URL: "rediss://cache.example",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters",
      RWA_DAILY_RPC_UNIT_BUDGET: "100"
    });
    await expect(createRwaBudget(env).consume(1)).rejects.toMatchObject({ code: "RWA_BUDGET_UNAVAILABLE" });
  });

  it("enforces and resets the bounded development budget", async () => {
    let now = new Date("2026-08-11T12:00:00Z");
    const budget = createRwaBudget(loadEnv({ NODE_ENV: "test", RWA_DAILY_RPC_UNIT_BUDGET: "100" }), undefined, () => now);
    await budget.consume(60);
    await budget.consume(40);
    await expect(budget.consume(1)).rejects.toMatchObject({ code: "RWA_DAILY_BUDGET_EXCEEDED" });
    now = new Date("2026-08-12T00:00:01Z");
    await expect(budget.consume(100)).resolves.toBeUndefined();
  });

  it("uses one atomic day key without identifiers", async () => {
    const evalCall = vi.fn(async () => [10, 90]);
    const redis = { eval: evalCall };
    const env = loadEnv({ NODE_ENV: "test", RWA_DAILY_RPC_UNIT_BUDGET: "100" });
    await createRwaBudget(env, redis as never, () => new Date("2026-08-11T12:00:00Z")).consume(10);
    expect(evalCall).toHaveBeenCalledWith(expect.any(String), 1, "rh:rwa-budget:2026-08-11", "10", "100", expect.any(String));
    expect(JSON.stringify(evalCall.mock.calls)).not.toMatch(/0x[0-9a-f]{40}/i);
  });
});
