import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("environment validation", () => {
  it("allows private-only production without cloud storage but keeps security gates", () => {
    const privateProduction = {
      NODE_ENV: "production", APP_ORIGIN: "https://chainscout.example",
      ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      REDIS_URL: "rediss://cache.example.com", METRICS_TOKEN: "metrics-secret-at-least-32-characters",
      CLOUD_WORKSPACE_ENABLED: "false", RETENTION_ENABLED: "false"
    };
    expect(loadEnv(privateProduction).CLOUD_WORKSPACE_ENABLED).toBe(false);
    expect(() => loadEnv({ ...privateProduction, CLOUD_WORKSPACE_ENABLED: "true" })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...privateProduction, REDIS_URL: "" })).toThrow(/REDIS_URL/);
    expect(() => loadEnv({ ...privateProduction, ENABLE_METRICS: "false" })).toThrow(/Protected metrics/);
    expect(() => loadEnv({ ...privateProduction, CSRF_PROTECTION_ENABLED: "false" })).toThrow(/CSRF/);
  });
  it("treats blank optional URLs and false flags as disabled", () => {
    const env = loadEnv({
      NODE_ENV: "test",
      ALCHEMY_ROBINHOOD_RPC_URL: "",
      ENABLE_PUBLIC_RPC_FALLBACK: "false",
      ENABLE_METRICS: "false"
    });

    expect(env.ALCHEMY_ROBINHOOD_RPC_URL).toBeUndefined();
    expect(env.ENABLE_PUBLIC_RPC_FALLBACK).toBe(false);
    expect(env.ENABLE_METRICS).toBe(false);
  });

  it("rejects production defaults and accepts required security configuration", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow();
    expect(() => loadEnv({
      NODE_ENV: "production",
      APP_ORIGIN: "https://chainscout.example",
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      SMTP_HOST: "smtp.example.com",
      EMAIL_FROM: "noreply@example.com",
      DATABASE_URL: "postgresql://user:password@db.example.com/app",
      REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters"
    })).not.toThrow();
  });

  it("fails production closed when retention or protected metrics are unavailable", () => {
    const production = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://chainscout.example",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      DATABASE_URL: "postgresql://user:password@db.example.com/app",
      REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters"
    };

    expect(() => loadEnv({ ...production, RETENTION_ENABLED: "false" })).toThrow(/Retention cleanup/);
    expect(() => loadEnv({ ...production, ENABLE_METRICS: "false" })).toThrow(/Protected metrics/);
    expect(() => loadEnv({ ...production, METRICS_TOKEN: "" })).toThrow(/METRICS_TOKEN/);
    expect(() => loadEnv({ ...production, METRICS_TOKEN: "too-short" })).toThrow(/at least 32/);
    expect(() => loadEnv({ ...production, RETENTION_INTERVAL_HOURS: "25" })).toThrow();
    expect(() => loadEnv({ ...production, RETENTION_SOURCE_DAYS: "91" })).toThrow();
    expect(() => loadEnv({ ...production, RETENTION_USAGE_DAYS: "91" })).toThrow();
    expect(() => loadEnv({ ...production, APP_ORIGIN: "http://chainscout.example" })).toThrow(/canonical HTTPS origin/);
    expect(() => loadEnv({ ...production, APP_ORIGIN: "https://chainscout.example/path" })).toThrow(/canonical HTTPS origin/);
    expect(() => loadEnv({ ...production, JWT_ACCESS_SECRET: "short-secret" })).toThrow(/at least 32/);
    expect(() => loadEnv({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET })).toThrow(/must be distinct/);
    expect(() => loadEnv({ ...production, METRICS_TOKEN: production.JWT_ACCESS_SECRET })).toThrow(/must be distinct/);
  });

  it("requires an API key only when OpenAI is explicitly selected", () => {
    expect(() => loadEnv({ NODE_ENV: "test", AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "ollama" }).AI_PROVIDER).toBe("ollama");
  });

  it("requires a server-side Uniswap key only when live Scout Swap quotes are enabled", () => {
    expect(() => loadEnv({ NODE_ENV: "test", UNISWAP_QUOTE_ENABLED: "true" })).toThrow(/UNISWAP_API_KEY/);
    const enabled = loadEnv({
      NODE_ENV: "test",
      UNISWAP_QUOTE_ENABLED: "true",
      UNISWAP_API_KEY: "server-only-key"
    });
    expect(enabled.UNISWAP_QUOTE_ENABLED).toBe(true);
    expect(loadEnv({ NODE_ENV: "test" }).UNISWAP_QUOTE_ENABLED).toBe(false);
  });

  it("uses dRPC for production Portfolio Intelligence and the official public RPC only in development", () => {
    const production = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://chainscout.example",
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      DATABASE_URL: "postgresql://user:password@db.example.com/app",
      REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters",
      PORTFOLIO_MODE_ENABLED: "true"
    };
    expect(() => loadEnv({
      ...production,
      ROBINHOOD_PUBLIC_RPC_URL: "https://rpc.mainnet.chain.robinhood.com"
    })).not.toThrow();
    expect(loadEnv({
      NODE_ENV: "development",
      PORTFOLIO_MODE_ENABLED: "true",
      ROBINHOOD_PUBLIC_RPC_URL: "https://rpc.mainnet.chain.robinhood.com"
    }).ROBINHOOD_PUBLIC_RPC_URL).toBe("https://rpc.mainnet.chain.robinhood.com");
    expect(() => loadEnv({
      NODE_ENV: "development",
      PORTFOLIO_MODE_ENABLED: "true",
      ROBINHOOD_PUBLIC_RPC_URL: "https://rpc.example.com"
    })).toThrow(/official Robinhood Public RPC/);
    expect(() => loadEnv({
      NODE_ENV: "development",
      PORTFOLIO_MODE_ENABLED: "true",
      ROBINHOOD_PUBLIC_RPC_URL: "https://rpc.mainnet.chain.robinhood.com.evil.example"
    })).toThrow(/official Robinhood Public RPC/);
    expect(() => loadEnv({
      NODE_ENV: "development",
      PORTFOLIO_MODE_ENABLED: "true",
      BLOCKSCOUT_API_BASE_URL: "https://indexer.example.com/api/v2"
    })).toThrow(/official Blockscout endpoint/);
    expect(() => loadEnv({
      NODE_ENV: "development",
      PORTFOLIO_MODE_ENABLED: "true",
      BLOCKSCOUT_PRO_API_KEY: "server-only-key",
      BLOCKSCOUT_PRO_API_BASE_URL: "https://api.blockscout.com"
    })).not.toThrow();
    expect(() => loadEnv({
      NODE_ENV: "development",
      PORTFOLIO_MODE_ENABLED: "true",
      BLOCKSCOUT_CHAIN_ID: "1"
    })).toThrow(/Chain ID 4663/);
    expect(loadEnv({
      NODE_ENV: "test",
      PORTFOLIO_MODE_ENABLED: "true",
      ROBINHOOD_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
      BLOCKSCOUT_API_BASE_URL: "http://127.0.0.1:4000/api/v2"
    })).toMatchObject({
      ROBINHOOD_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
      BLOCKSCOUT_API_BASE_URL: "http://127.0.0.1:4000/api/v2"
    });
  });

  it("pins enabled RWA Verify to the official Robinhood endpoint and chain", () => {
    expect(loadEnv({
      NODE_ENV: "development",
      RWA_VERIFY_ENABLED: "true",
      ROBINHOOD_PUBLIC_RPC_URL: "https://rpc.mainnet.chain.robinhood.com"
    }).RWA_VERIFY_ENABLED).toBe(true);
    expect(() => loadEnv({
      NODE_ENV: "development",
      RWA_VERIFY_ENABLED: "true",
      ROBINHOOD_PUBLIC_RPC_URL: "https://rpc.mainnet.chain.robinhood.com.evil.example"
    })).toThrow(/official Robinhood Chain public RPC/);
    expect(() => loadEnv({
      NODE_ENV: "development",
      RWA_VERIFY_ENABLED: "true",
      ROBINHOOD_CHAIN_ID: "1"
    })).toThrow(/chain ID 4663/);
  });

  it("pins enabled Collectible Catalog to the official TCGdex v2 endpoint", () => {
    expect(loadEnv({ NODE_ENV: "development", COLLECTIBLE_CATALOG_ENABLED: "true" }).COLLECTIBLE_CATALOG_ENABLED).toBe(true);
    expect(() => loadEnv({
      NODE_ENV: "development", COLLECTIBLE_CATALOG_ENABLED: "true", TCGDEX_API_BASE_URL: "https://api.tcgdex.net.evil.example/v2"
    })).toThrow(/official TCGdex v2 endpoint/);
    expect(() => loadEnv({
      NODE_ENV: "development", COLLECTIBLE_CATALOG_ENABLED: "true", TCGDEX_API_BASE_URL: "https://api.tcgdex.net/v2?redirect=evil"
    })).toThrow(/official TCGdex v2 endpoint/);
    expect(loadEnv({
      NODE_ENV: "test", COLLECTIBLE_CATALOG_ENABLED: "true", TCGDEX_API_BASE_URL: "http://127.0.0.1:9090/v2"
    }).TCGDEX_API_BASE_URL).toBe("http://127.0.0.1:9090/v2");
  });

  it("keeps Market & Inventory disabled by default with bounded free-tier controls", () => {
    const defaults = loadEnv({ NODE_ENV: "test" });
    expect(defaults.MARKET_INVENTORY_ENABLED).toBe(false);
    expect(defaults.MARKET_DAILY_REQUEST_BUDGET).toBe(1_000);
    expect(defaults.RATE_LIMIT_MARKET_PER_HOUR).toBe(12);
    expect(loadEnv({ NODE_ENV: "test", MARKET_INVENTORY_ENABLED: "true", MARKET_DAILY_REQUEST_BUDGET: "50", RATE_LIMIT_MARKET_PER_HOUR: "1" }))
      .toMatchObject({ MARKET_INVENTORY_ENABLED: true, MARKET_DAILY_REQUEST_BUDGET: 50, RATE_LIMIT_MARKET_PER_HOUR: 1 });
    expect(() => loadEnv({ NODE_ENV: "test", MARKET_DAILY_REQUEST_BUDGET: "49" })).toThrow();
    expect(() => loadEnv({ NODE_ENV: "test", RATE_LIMIT_MARKET_PER_HOUR: "61" })).toThrow();
  });

  it("keeps Open Data disabled with bounded anonymous and global ceilings", () => {
    const defaults = loadEnv({ NODE_ENV: "test" });
    expect(defaults).toMatchObject({ OPEN_DATA_API_ENABLED: false, RATE_LIMIT_OPEN_DATA_PER_HOUR: 60, OPEN_DATA_DAILY_REQUEST_BUDGET: 10_000 });
    expect(loadEnv({ NODE_ENV: "test", OPEN_DATA_API_ENABLED: "true", RATE_LIMIT_OPEN_DATA_PER_HOUR: "1", OPEN_DATA_DAILY_REQUEST_BUDGET: "100" }))
      .toMatchObject({ OPEN_DATA_API_ENABLED: true, RATE_LIMIT_OPEN_DATA_PER_HOUR: 1, OPEN_DATA_DAILY_REQUEST_BUDGET: 100 });
    expect(() => loadEnv({ NODE_ENV: "test", RATE_LIMIT_OPEN_DATA_PER_HOUR: "1001" })).toThrow();
    expect(() => loadEnv({ NODE_ENV: "test", OPEN_DATA_DAILY_REQUEST_BUDGET: "99" })).toThrow();
  });
});
