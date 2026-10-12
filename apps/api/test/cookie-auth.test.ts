import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyReply } from "fastify";
import cookiePlugin from "@fastify/cookie";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { memoryStore } from "../src/db/memory.js";
import { setSessionCookies } from "../src/auth/cookies.js";
import { authRoutes } from "../src/routes/auth.js";
import { installCsrfProtection } from "../src/http/csrf.js";
import { installErrorHandler } from "../src/http/errors.js";
import { corsOptionsForRequest } from "../src/http/cors.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  memoryStore.users.clear();
  memoryStore.usersByEmail.clear();
  memoryStore.usersByWallet.clear();
  memoryStore.usernames.clear();
  memoryStore.refreshTokens.clear();
  memoryStore.authTokens.clear();
  memoryStore.sessions.clear();
  memoryStore.messages.clear();
  memoryStore.usage = [];
  memoryStore.auditLogs = [];
});

describe("HttpOnly browser sessions", () => {
  it("keeps credentials out of non-test response bodies and authenticates with cookies", async () => {
    // Exercise the non-test serialization/cookie boundary with an isolated
    // route fixture. The real app correctly refuses database-less signups.
    const app = Fastify();
    await app.register(cookiePlugin);
    await authRoutes(app, loadEnv({ NODE_ENV: "development", LOG_LEVEL: "silent" }));
    apps.push(app);
    const register = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "cookie-user@example.com", password: "correct-horse-battery-staple" }
    });

    expect(register.statusCode).toBe(200);
    expect(register.json()).toMatchObject({ user: { email: "cookie-user@example.com" } });
    expect(register.json()).not.toHaveProperty("accessToken");
    expect(register.json()).not.toHaveProperty("refreshToken");
    const setCookies = headerValues(register.headers["set-cookie"]);
    expect(setCookies).toHaveLength(2);
    expect(setCookies.every((value) => /HttpOnly/i.test(value))).toBe(true);
    expect(setCookies.every((value) => /SameSite=Strict/i.test(value))).toBe(true);
    expect(setCookies.every((value) => /Path=\//i.test(value))).toBe(true);

    const cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("cookie-user@example.com");

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { cookie },
      payload: {}
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).not.toHaveProperty("accessToken");
    expect(refresh.json()).not.toHaveProperty("refreshToken");
    expect(headerValues(refresh.headers["set-cookie"])).toHaveLength(2);
  });

  it("uses __Host Secure cookie attributes in production configuration", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      APP_ORIGIN: "https://opsis.example",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      DATABASE_URL: "postgresql://user:password@db.example.com/app",
      REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters",
      ALCHEMY_API_KEY: "alchemy-key"
    });
    const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
    const reply = {
      setCookie(name: string, _value: string, options: Record<string, unknown>) {
        calls.push({ name, options });
        return this;
      }
    } as unknown as FastifyReply;

    setSessionCookies(reply, env, {
      user: { id: "user", email: null, username: "user", walletAddress: null, role: "USER", status: "ACTIVE" },
      accessToken: "access",
      refreshToken: "refresh"
    });

    expect(calls.map((call) => call.name)).toEqual(["__Host-opsis_access", "__Host-opsis_refresh"]);
    expect(calls.every((call) => call.options.httpOnly === true)).toBe(true);
    expect(calls.every((call) => call.options.secure === true)).toBe(true);
    expect(calls.every((call) => call.options.sameSite === "strict")).toBe(true);
    expect(calls.every((call) => call.options.path === "/")).toBe(true);
    expect(calls.every((call) => !("domain" in call.options))).toBe(true);
  });

  it("mirrors the production cookie boundary in an HTTPS preview environment", () => {
    const env = loadEnv({ NODE_ENV: "test", SECURE_SESSION_COOKIES: "true" });
    const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
    const reply = {
      setCookie(name: string, _value: string, options: Record<string, unknown>) {
        calls.push({ name, options });
        return this;
      }
    } as unknown as FastifyReply;

    setSessionCookies(reply, env, {
      user: { id: "user", email: null, username: "user", walletAddress: null, role: "USER", status: "ACTIVE" },
      accessToken: "access",
      refreshToken: "refresh"
    });

    expect(calls.map((call) => call.name)).toEqual(["__Host-opsis_access", "__Host-opsis_refresh"]);
    expect(calls.every((call) => call.options.secure === true)).toBe(true);
    expect(calls.every((call) => call.options.httpOnly === true)).toBe(true);
    expect(calls.every((call) => call.options.sameSite === "strict")).toBe(true);
    expect(calls.every((call) => call.options.path === "/")).toBe(true);
  });

  it("enforces exact Origin, JSON, Fetch Metadata, and the custom header when enabled", async () => {
    const resolve = vi.fn(async () => ({
      entity: { chainId: 4663, type: "wallet" as const, value: "0x0000000000000000000000000000000000000042", facts: {}, citations: [], riskNotes: [] },
      sources: [],
      providerDestinations: []
    }));
    const answer = vi.fn(async () => ({
      answer: "safe",
      summaryBullets: [],
      confirmedFacts: [],
      inferences: [],
      facts: {},
      uncertainty: [],
      riskNotes: [],
      citations: [],
      suggestedQuestions: [],
      suggestedFollowUps: []
    }));
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      APP_ORIGIN: "https://opsis.example",
      CSRF_PROTECTION_ENABLED: "true"
    }), undefined, { privateAnalysis: { resolve, answer } });
    apps.push(app);
    const payload = { entity: "0x0000000000000000000000000000000000000042" };

    const missing = await app.inject({ method: "POST", url: "/v1/private/analyze", payload });
    const crossSite = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      headers: {
        origin: "https://opsis.example",
        "sec-fetch-site": "cross-site",
        "x-opsis-csrf": "1"
      },
      payload
    });
    const accepted = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      headers: {
        origin: "https://opsis.example",
        "sec-fetch-site": "same-origin",
        "x-opsis-csrf": "1"
      },
      payload
    });

    const neither = await app.inject({ method: "POST", url: "/v1/private/analyze",
      headers: { origin: "https://opsis.example" }, payload });
    expect(neither.statusCode).toBe(403);
    expect(neither.json().error.code).toBe("CSRF_HEADER_REQUIRED");
    expect(missing.statusCode).toBe(403);
    expect(crossSite.statusCode).toBe(403);
    expect(accepted.statusCode).toBe(200);
  });
});

describe("CSRF alias origins", () => {
  const canonical = "https://opsis.example";
  const alias = "https://earlier.opsis.example";
  const headers = { origin: alias, "sec-fetch-site": "same-origin", "x-opsis-csrf": "1" };

  function csrfApp(aliases?: string) {
    const env = loadEnv({ NODE_ENV: "test", APP_ORIGIN: canonical, APP_ORIGIN_ALIASES: aliases, CSRF_PROTECTION_ENABLED: "true" });
    const app = Fastify();
    apps.push(app);
    installErrorHandler(app);
    installCsrfProtection(app, env);
    app.post("/state", async () => ({ ok: true }));
    return { app, env };
  }

  it.each([canonical, alias, "https://second.opsis.example"])("accepts the configured origin %s", async (origin) => {
    const { app } = csrfApp(`${alias},https://second.opsis.example`);
    const response = await app.inject({ method: "POST", url: "/state", headers: { ...headers, origin }, payload: {} });
    expect(response.statusCode).toBe(200);
  });

  it.each(["https://unknown.opsis.example", "null", undefined, `${alias}/`, `${alias}.other.example`])
    ("rejects the unaccepted origin %j without exposing aliases", async (origin) => {
      const { app } = csrfApp(alias);
      const response = await app.inject({ method: "POST", url: "/state",
        headers: { "sec-fetch-site": "same-origin", "x-opsis-csrf": "1", ...(origin === undefined ? {} : { origin }) }, payload: {} });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toEqual({ code: "CSRF_ORIGIN_REJECTED", message: "Request origin was not accepted" });
      expect(response.body).not.toContain(alias);
    });

  it("still rejects a cross-site request from an alias before checking its header or JSON", async () => {
    const { app } = csrfApp(alias);
    const response = await app.inject({ method: "POST", url: "/state",
      headers: { origin: alias, "sec-fetch-site": "cross-site", "content-type": "text/plain" }, payload: "{}" });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_SITE_REJECTED");
  });

  it("still requires the confirmation header for an alias before checking JSON", async () => {
    const { app } = csrfApp(alias);
    const response = await app.inject({ method: "POST", url: "/state",
      headers: { origin: alias, "sec-fetch-site": "same-origin", "content-type": "text/plain" }, payload: "{}" });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_HEADER_REQUIRED");
  });

  it("still requires JSON for an alias with the confirmation header", async () => {
    const { app } = csrfApp(alias);
    const response = await app.inject({ method: "POST", url: "/state",
      headers: { ...headers, "content-type": "text/plain" }, payload: "{}" });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe("JSON_REQUIRED");
  });

  it.each([undefined, "", " \t "])("preserves canonical-only acceptance without aliases %j", async (value) => {
    const { app } = csrfApp(value);
    const accepted = await app.inject({ method: "POST", url: "/state", headers: { ...headers, origin: canonical }, payload: {} });
    const rejected = await app.inject({ method: "POST", url: "/state", headers, payload: {} });
    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  it("builds the allowed origins once when protection is installed", async () => {
    const { app, env } = csrfApp(alias);
    env.APP_ORIGIN_ALIAS_LIST.push("https://late.opsis.example");
    const response = await app.inject({ method: "POST", url: "/state",
      headers: { ...headers, origin: "https://late.opsis.example" }, payload: {} });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  it("keeps production CORS on the canonical origin", () => {
    const { env } = csrfApp(alias);
    expect(corsOptionsForRequest("/v1/auth/me", { ...env, NODE_ENV: "production" }))
      .toMatchObject({ origin: canonical, credentials: true });
    expect(corsOptionsForRequest("/v1/public/open-data/v1/registry", { ...env, NODE_ENV: "production" }))
      .toMatchObject({ origin: false, credentials: false, preflight: false });
  });

  it("keeps aliases out of readiness and the access manifest", async () => {
    const app = await buildApp(loadEnv({
      NODE_ENV: "test", LOG_LEVEL: "silent", APP_ORIGIN: canonical, APP_ORIGIN_ALIASES: alias,
      CSRF_PROTECTION_ENABLED: "true", OPSIS_WORKSPACES_ENABLED: "true", OPSIS_PUBLIC_ACCESS_ENABLED: "true"
    }));
    apps.push(app);
    const readiness = await app.inject({ method: "GET", url: "/readyz" });
    const access = await app.inject({ method: "POST", url: "/v1/private/opsis/access", headers, payload: {} });
    expect(readiness.statusCode).toBe(200);
    expect(access.statusCode).toBe(200);
    for (const response of [readiness, access]) {
      expect(response.body).not.toContain(alias);
      expect(response.body).not.toContain("APP_ORIGIN_ALIAS");
    }
  });
});

function headerValues(value: string | string[] | number | undefined): string[] {
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}
