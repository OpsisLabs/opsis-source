import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("environment validation", () => {
  it.each([
    ["BLOCKSCOUT_REQUESTS_PER_SECOND", 4, 1, 50],
    ["BLOCKSCOUT_MAX_WAIT_MS", 2500, 0, 10000],
    ["BLOCKSCOUT_CREDIT_RESERVE", 5000, 0, 100000],
    ["BLOCKSCOUT_TOKEN_CACHE_SECONDS", 900, 0, 3600],
    ["BLOCKSCOUT_OPTIONAL_WAIT_MS", 8000, 500, 10000]
  ] as const)("bounds %s and supplies its default", (setting, fallback, minimum, maximum) => {
    expect(loadEnv({ NODE_ENV: "test" })[setting]).toBe(fallback);
    for (const value of [minimum, maximum]) {
      expect(loadEnv({ NODE_ENV: "test", [setting]: String(value) })[setting]).toBe(value);
    }
    const invalid = [String(minimum - 1), "0.5", "invalid", "Infinity"];
    if (setting !== "BLOCKSCOUT_CREDIT_RESERVE") invalid.push(String(maximum + 1));
    for (const value of invalid) {
      expect(() => loadEnv({ NODE_ENV: "test", [setting]: value })).toThrow(setting);
    }
  });
  it("bounds the per-minute access limit at startup", () => {
    expect(loadEnv({ NODE_ENV: "test" }).RATE_LIMIT_ACCESS_PER_MINUTE).toBe(240);
    for (const value of ["20", "2000"]) {
      expect(loadEnv({ NODE_ENV: "test", RATE_LIMIT_ACCESS_PER_MINUTE: value }).RATE_LIMIT_ACCESS_PER_MINUTE).toBe(Number(value));
    }
    for (const value of ["19", "2001", "20.5", "invalid"]) {
      expect(() => loadEnv({ NODE_ENV: "test", RATE_LIMIT_ACCESS_PER_MINUTE: value })).toThrow(/RATE_LIMIT_ACCESS_PER_MINUTE/);
    }
  });
  describe("APP_ORIGIN_ALIASES", () => {
    const production = {
      NODE_ENV: "production", APP_ORIGIN: "https://opsis.example",
      ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      REDIS_URL: "rediss://cache.example.com", METRICS_TOKEN: "metrics-secret-at-least-32-characters"
    };

    it.each([undefined, "", " \t\n "])("defaults to no aliases for %j", (value) => {
      expect(loadEnv({ ...production, APP_ORIGIN_ALIASES: value }).APP_ORIGIN_ALIAS_LIST).toEqual([]);
    });

    it("parses one or four aliases and trims surrounding whitespace", () => {
      expect(loadEnv({ ...production, APP_ORIGIN_ALIASES: " https://earlier.opsis.example " }).APP_ORIGIN_ALIAS_LIST)
        .toEqual(["https://earlier.opsis.example"]);
      expect(loadEnv({ ...production,
        APP_ORIGIN_ALIASES: " https://one.opsis.example ,\t https://two.opsis.example,\nhttps://three.opsis.example , https://four.opsis.example "
      }).APP_ORIGIN_ALIAS_LIST).toEqual([
        "https://one.opsis.example", "https://two.opsis.example", "https://three.opsis.example", "https://four.opsis.example"
      ]);
    });

    it.each([
      "https://one.opsis.example,https://two.opsis.example,https://three.opsis.example,https://four.opsis.example,https://five.opsis.example",
      "https://earlier.opsis.example, https://earlier.opsis.example",
      "https://opsis.example",
      "https://one.opsis.example,,https://two.opsis.example",
      ",https://earlier.opsis.example",
      "https://earlier.opsis.example,",
      "https://one.opsis.example, ,https://two.opsis.example",
      "http://earlier.opsis.example",
      "https://localhost", "https://127.0.0.1", "https://127.0.0.2", "https://[::1]",
      "http://localhost:5174"
    ])("rejects an inadmissible production list %j", (value) => {
      expect(() => loadEnv({ ...production, APP_ORIGIN_ALIASES: value })).toThrow(/APP_ORIGIN_ALIASES/);
    });

    it.each([
      "not-an-origin", "null", "ftp://earlier.opsis.example",
      "https://earlier.opsis.example/path", "https://earlier.opsis.example/",
      "https://earlier.opsis.example?redirect=1", "https://earlier.opsis.example#fragment",
      "https://demo-account:sample-password@earlier.opsis.example",
      "https://<earlier.opsis.example>", 'https://earlier.opsis.example"', "https://earlier.opsis.example'",
      "https://earlier .opsis.example", "https://earlier.\nopsis.example", "https://earlier.\ropsis.example",
      "https://earlier.\topsis.example", "https://EARLIER.opsis.example", "https://earlier.opsis.example:443",
      "support@opsis.example,security@opsis.example"
    ])("rejects malformed or hostile aliases in every environment %j", (value) => {
      for (const NODE_ENV of ["production", "development", "test"]) {
        expect(() => loadEnv({ ...production, NODE_ENV, APP_ORIGIN_ALIASES: value })).toThrow(/APP_ORIGIN_ALIASES/);
      }
    });

    it.each(["development", "test"])("allows HTTP localhost aliases in %s", (NODE_ENV) => {
      expect(loadEnv({ NODE_ENV, APP_ORIGIN_ALIASES: "http://localhost:5174,http://127.0.0.1:5174,http://[::1]:5174" }).APP_ORIGIN_ALIAS_LIST)
        .toEqual(["http://localhost:5174", "http://127.0.0.1:5174", "http://[::1]:5174"]);
      expect(() => loadEnv({ NODE_ENV, APP_ORIGIN_ALIASES: "http://localhost:5173" })).toThrow(/must be distinct/);
      expect(() => loadEnv({ NODE_ENV, APP_ORIGIN: "http://localhost:5173/", APP_ORIGIN_ALIASES: "http://localhost:5173" }))
        .toThrow(/must be distinct/);
    });

    it.each(["https://127.0.0.2", "https://[::1]"])("also refuses loopback canonical production origins %j", (APP_ORIGIN) => {
      expect(() => loadEnv({ ...production, APP_ORIGIN })).toThrow(/canonical HTTPS origin/);
    });
  });

  it("keeps Watch off unless its flag is a valid true value", () => {
    expect(loadEnv({ NODE_ENV: "test" }).WATCH_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: "test", WATCH_ENABLED: "false" }).WATCH_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: "test", WATCH_ENABLED: "true" }).WATCH_ENABLED).toBe(true);
    expect(() => loadEnv({ NODE_ENV: "test", WATCH_ENABLED: "invalid" })).toThrow();
  });
  it("allows private-only production without cloud storage but keeps security gates", () => {
    const privateProduction = {
      NODE_ENV: "production", APP_ORIGIN: "https://opsis.example",
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
      APP_ORIGIN: "https://opsis.example",
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
      APP_ORIGIN: "https://opsis.example",
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
    expect(() => loadEnv({ ...production, APP_ORIGIN: "http://opsis.example" })).toThrow(/canonical HTTPS origin/);
    expect(() => loadEnv({ ...production, APP_ORIGIN: "https://opsis.example/path" })).toThrow(/canonical HTTPS origin/);
    expect(() => loadEnv({ ...production, JWT_ACCESS_SECRET: "short-secret" })).toThrow(/at least 32/);
    expect(() => loadEnv({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET })).toThrow(/must be distinct/);
    expect(() => loadEnv({ ...production, METRICS_TOKEN: production.JWT_ACCESS_SECRET })).toThrow(/must be distinct/);
  });

  it("requires an API key only when OpenAI is explicitly selected", () => {
    expect(() => loadEnv({ NODE_ENV: "test", AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "ollama" }).AI_PROVIDER).toBe("ollama");
  });

  it("validates quote source and requires a key only for uniswap-api", () => {
    expect(loadEnv({ NODE_ENV: "test", UNISWAP_QUOTE_ENABLED: "true" }).SWAP_QUOTE_SOURCE).toBe("onchain");
    expect(loadEnv({ NODE_ENV: "test", SWAP_QUOTE_SOURCE: "onchain" }).UNISWAP_API_KEY).toBeUndefined();
    expect(() => loadEnv({ NODE_ENV: "test", SWAP_QUOTE_SOURCE: "unknown" })).toThrow(/SWAP_QUOTE_SOURCE/);
    expect(() => loadEnv({ NODE_ENV: "test", SWAP_QUOTE_SOURCE: "uniswap-api" })).toThrow(/UNISWAP_API_KEY/);
    const enabled = loadEnv({
      NODE_ENV: "test",
      UNISWAP_QUOTE_ENABLED: "true",
      SWAP_QUOTE_SOURCE: "uniswap-api",
      UNISWAP_API_KEY: "server-only-key"
    });
    expect(enabled.UNISWAP_QUOTE_ENABLED).toBe(true);
    expect(loadEnv({ NODE_ENV: "test" }).UNISWAP_QUOTE_ENABLED).toBe(false);
  });

  it("uses dRPC for production Portfolio Intelligence and the official public RPC only in development", () => {
    const production = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://opsis.example",
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

  it("pins enabled Stock-token check to the official Robinhood endpoint and chain", () => {
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
