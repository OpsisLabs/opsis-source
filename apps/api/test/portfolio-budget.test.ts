import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { createPortfolioBudget } from "../src/portfolio/budget.js";

describe("portfolio global provider budget", () => {
  it("enforces the configured daily total and resets on the next UTC day", async () => {
    let now = new Date("2026-08-10T23:59:00.000Z");
    const budget = createPortfolioBudget(loadEnv({
      NODE_ENV: "test",
      PORTFOLIO_DAILY_RPC_UNIT_BUDGET: "100"
    }), undefined, () => now);

    await budget.consume(60);
    await budget.consume(40);
    await expect(budget.consume(1)).rejects.toMatchObject({ code: "PORTFOLIO_DAILY_BUDGET_EXCEEDED" });
    now = new Date("2026-08-11T00:00:01.000Z");
    await expect(budget.consume(100)).resolves.toBeUndefined();
  });

  it("fails closed in production when the shared Redis guard is unavailable", async () => {
    const env = loadEnv({
      NODE_ENV: "production",
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      APP_ORIGIN: "https://opsis.example",
      DATABASE_URL: "postgresql://db.example/app",
      REDIS_URL: "rediss://redis.example/0",
      JWT_ACCESS_SECRET: "production-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "production-refresh-secret-at-least-32",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters",
      ALCHEMY_API_KEY: "configured"
    });
    const budget = createPortfolioBudget(env);
    await expect(budget.consume(1)).rejects.toMatchObject({ code: "PORTFOLIO_BUDGET_UNAVAILABLE" });
  });
});
