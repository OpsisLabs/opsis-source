import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("environment validation", () => {
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
      JWT_ACCESS_SECRET: "configured-access-secret",
      JWT_REFRESH_SECRET: "configured-refresh-secret",
      SMTP_HOST: "smtp.example.com",
      EMAIL_FROM: "noreply@example.com",
      DATABASE_URL: "postgresql://user:password@db.example.com/app",
      REDIS_URL: "rediss://cache.example.com",
      ALCHEMY_API_KEY: "alchemy-key"
    })).not.toThrow();
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
});
