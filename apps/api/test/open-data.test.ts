import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { OpenDataLimiter } from "../src/open-data/limiter.js";
import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import { AppError } from "../src/http/errors.js";
import { corsOptionsForRequest } from "../src/http/cors.js";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCOUT_SWAP_TOKENS } from "../src/swap/constants.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
const WETH = CHAINSCOUT_REVIEWED_ASSETS.WETH.address;
const UNKNOWN = "0x1111111111111111111111111111111111111111";

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function limiter(overrides: Partial<OpenDataLimiter> = {}): OpenDataLimiter {
  return {
    consume: vi.fn().mockResolvedValue({ limit: 60, remaining: 59, resetSeconds: 1_800 }),
    ...overrides,
  };
}

async function openDataApp(openDataLimiter: OpenDataLimiter = limiter(), enabled = true) {
  const app = await buildApp(loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    OPEN_DATA_API_ENABLED: String(enabled),
    BUILD_SHA: "1".repeat(40),
  }), undefined, { openDataLimiter });
  apps.push(app);
  return app;
}

describe("Open Data v1", () => {
  it("fails closed before consuming a cap when disabled", async () => {
    const cap = limiter();
    const app = await openDataApp(cap, false);
    const response = await app.inject({ method: "GET", url: "/v1/public/open-data/v1/registry" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().error.code).toBe("OPEN_DATA_API_DISABLED");
    expect(cap.consume).not.toHaveBeenCalled();
  });

  it("returns exactly the shared reviewed WETH/USDG support tuple and bounded provenance", async () => {
    const app = await openDataApp();
    const response = await app.inject({ method: "GET", url: "/v1/public/open-data/v1/registry" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-chainscout-data-class"]).toBe("chainscout-reviewed-reference");
    expect(response.headers["ratelimit-limit"]).toBe("60");
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      registryVersion: "2026-08-12.1",
      chainscoutSourceRevision: "1".repeat(40),
      chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
      assetsShown: 2,
      completeFor: "chainscout_reviewed_launch_registry",
      provenance: { upstreamPayloadIncluded: false, redistributionClass: "chainscout_reviewed_reference" },
      cap: { anonymousRequestsPerHour: 60, scope: "pseudonymous_network_client" },
    });
    expect(response.json().assets.map((entry: { symbol: string; address: string; decimals: number }) => ({ symbol: entry.symbol, address: entry.address, decimals: entry.decimals }))).toEqual([
      CHAINSCOUT_REVIEWED_ASSETS.WETH,
      CHAINSCOUT_REVIEWED_ASSETS.USDG,
    ].map(({ symbol, address, decimals }) => ({ symbol, address, decimals })));
    expect(SCOUT_SWAP_TOKENS).toBe(CHAINSCOUT_REVIEWED_ASSETS);
    expect(SCOUT_SWAP_TOKENS.WETH.name).toBe("Wrapped Ether");
    expect(response.json().assets.every((entry: { registryStatus: string; identityConfidence: string; sources: Array<{ purpose: string }> }) =>
      entry.registryStatus === "chainscout_supported" &&
      entry.identityConfidence === "chainscout_reviewed_static_match" &&
      entry.sources.every((source) => source.purpose === "human_verification_link_only")
    )).toBe(true);
    const parsed = response.json();
    for (const key of ["balance", "liquidity", "priceUsd", "transaction", "wallet", "rawPayload", "sourceDocument", "logo"]) {
      expect(JSON.stringify(Object.keys(parsed).concat(parsed.assets.flatMap((entry: object) => Object.keys(entry))))).not.toContain(key);
    }
  });

  it("normalizes known and unknown syntax without verifying existence or leaking the address into the URL", async () => {
    const app = await openDataApp();
    const known = await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", payload: { chainId: 4663, kind: "evm_address", value: WETH.toLowerCase() } });
    expect(known.statusCode).toBe(200);
    expect(known.headers["x-chainscout-data-class"]).toBe("chainscout-derived-normalization");
    expect(known.json()).toMatchObject({
      normalizedValue: WETH,
      syntaxValid: true,
      existenceVerified: false,
      registryMatch: { symbol: "WETH", registryStatus: "chainscout_supported" },
      provenance: { derivation: "deterministic_syntax_normalization", upstreamPayloadIncluded: false },
    });
    const unknown = await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", payload: { chainId: 4663, kind: "evm_address", value: UNKNOWN } });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json().registryMatch).toBeNull();
    expect(unknown.body).toContain("no asset type or contract behavior is inferred");
    expect("/v1/public/open-data/v1/normalize").not.toContain(UNKNOWN);
  });

  it("caps and no-stores invalid syntax, wrong chain, fields, credentials, content types, and oversized bodies", async () => {
    const cap = limiter();
    const app = await openDataApp(cap);
    const cases = [
      { chainId: 1, kind: "evm_address", value: UNKNOWN },
      { chainId: 4663, kind: "transaction", value: UNKNOWN },
      { chainId: 4663, kind: "evm_address", value: "0xbad" },
      { chainId: 4663, kind: "evm_address", value: UNKNOWN, vault: "private" },
    ];
    for (const payload of cases) {
      const response = await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", payload });
      expect(response.statusCode).toBe(400);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    const rejected = [
      await app.inject({ method: "GET", url: "/v1/public/open-data/v1/registry", headers: { cookie: "__Host-cs_access=secret" } }),
      await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", headers: { authorization: "Bearer secret", "content-type": "application/json" }, payload: { chainId: 4663, kind: "evm_address", value: UNKNOWN } }),
      await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", headers: { "content-type": "text/plain" }, body: "not-json" }),
      await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ chainId: 4663, kind: "evm_address", value: UNKNOWN, padding: "x".repeat(200) }) }),
    ];
    expect(rejected.map((response) => response.statusCode)).toEqual([400, 400, 415, 413]);
    expect(rejected[0]!.json().error.code).toBe("PUBLIC_CREDENTIALS_REJECTED");
    expect(rejected[1]!.json().error.code).toBe("PUBLIC_CREDENTIALS_REJECTED");
    expect(rejected.every((response) => response.headers["cache-control"] === "private, no-store")).toBe(true);
    expect(cap.consume).toHaveBeenCalledTimes(cases.length + rejected.length);
  });

  it("fails closed on cap outage and returns Retry-After on the anonymous hourly cap", async () => {
    const unavailable = await openDataApp(limiter({ consume: vi.fn().mockRejectedValue(new AppError("OPEN_DATA_CAP_UNAVAILABLE", 503, "down")) }));
    expect((await unavailable.inject({ method: "GET", url: "/v1/public/open-data/v1/registry" })).statusCode).toBe(503);
    const limited = await openDataApp(limiter({ consume: vi.fn().mockRejectedValue(new AppError("OPEN_DATA_RATE_LIMIT_EXCEEDED", 429, "cap", { retryAfterSeconds: 77 })) }));
    const response = await limited.inject({ method: "GET", url: "/v1/public/open-data/v1/registry" });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("77");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("denies actual and preflight CORS in development/staging/production policy and has only two data routes", async () => {
    const app = await openDataApp();
    const registry = await app.inject({ method: "GET", url: "/v1/public/open-data/v1/registry", headers: { origin: "https://consumer.example" } });
    expect(registry.headers["access-control-allow-origin"]).toBeUndefined();
    expect(registry.headers["access-control-allow-credentials"]).toBeUndefined();
    for (const [url, method] of [["/v1/public/open-data/v1/registry", "GET"], ["/v1/public/open-data/v1/normalize", "POST"]] as const) {
      const preflight = await app.inject({ method: "OPTIONS", url, headers: { origin: "https://evil.example", "access-control-request-method": method, "access-control-request-headers": "content-type" } });
      expect(preflight.statusCode).toBe(404);
      expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
      expect(preflight.headers["access-control-allow-credentials"]).toBeUndefined();
    }
    const development = loadEnv({ NODE_ENV: "development" });
    const production = loadEnv({
      NODE_ENV: "production",
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
      APP_ORIGIN: "https://chainscout.example",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      DATABASE_URL: "postgresql://user:password@db.example.com/app",
      REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters",
    });
    expect(corsOptionsForRequest("/v1/public/open-data/v1/registry", development)).toMatchObject({ origin: false, credentials: false, preflight: false });
    expect(corsOptionsForRequest("/v1/public/open-data/v1/normalize", production)).toMatchObject({ origin: false, credentials: false, preflight: false });
    expect(corsOptionsForRequest("/v1/auth/me", production)).toMatchObject({ origin: production.APP_ORIGIN, credentials: true });
    for (const base of [development, { ...production, REDIS_URL: undefined }]) {
      const modeApp = await buildApp(base, undefined, { openDataLimiter: limiter() });
      apps.push(modeApp);
      const preflight = await modeApp.inject({ method: "OPTIONS", url: "/v1/public/open-data/v1/normalize", headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
      expect(preflight.statusCode).toBe(404);
      expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
      expect(preflight.headers["access-control-allow-credentials"]).toBeUndefined();
    }
    for (const url of [
      "/v1/public/open-data/v1/search",
      `/v1/public/open-data/v1/wallets/${UNKNOWN}`,
      "/v1/public/open-data/v1/transactions/0x" + "1".repeat(64),
      "/v1/public/open-data/v1/bulk",
    ]) expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
  });

  it("conforms successful and bounded error responses to the versioned OpenAPI schemas", async () => {
    const spec = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../web/public/open-data-v1.openapi.json"), "utf8"));
    const ajv = new Ajv({ strict: false, validateFormats: false });
    ajv.addSchema(spec, "open-data-spec");
    const registrySchema = ajv.compile({ $ref: "open-data-spec#/components/schemas/RegistryResponse" });
    const identitySchema = ajv.compile({ $ref: "open-data-spec#/components/schemas/IdentityResponse" });
    const errorSchema = ajv.compile({ $ref: "open-data-spec#/components/schemas/ErrorResponse" });
    const app = await openDataApp();
    const registry = await app.inject({ method: "GET", url: "/v1/public/open-data/v1/registry" });
    const identity = await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", payload: { chainId: 4663, kind: "evm_address", value: UNKNOWN } });
    const error = await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", headers: { "content-type": "text/plain" }, body: "bad" });
    expect(registrySchema(registry.json()), ajv.errorsText(registrySchema.errors)).toBe(true);
    expect(identitySchema(identity.json()), ajv.errorsText(identitySchema.errors)).toBe(true);
    expect(errorSchema(error.json()), ajv.errorsText(errorSchema.errors)).toBe(true);
  });

  it("keeps the submitted public address out of bounded application logs", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "info", OPEN_DATA_API_ENABLED: "true" }), undefined, { openDataLimiter: limiter() });
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", payload: { chainId: 4663, kind: "evm_address", value: UNKNOWN } });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    spy.mockRestore();
    expect(lines.join("\n")).not.toContain(UNKNOWN);
  });

  it("makes zero runtime outbound calls for both public data routes", async () => {
    const outbound = vi.spyOn(globalThis, "fetch");
    const app = await openDataApp();
    expect((await app.inject({ method: "GET", url: "/v1/public/open-data/v1/registry" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/public/open-data/v1/normalize", payload: { chainId: 4663, kind: "evm_address", value: UNKNOWN } })).statusCode).toBe(200);
    expect(outbound).not.toHaveBeenCalled();
    outbound.mockRestore();
  });
});
