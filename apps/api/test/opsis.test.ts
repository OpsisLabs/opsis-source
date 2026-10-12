import { createHash } from "node:crypto";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import {
  authorizeOpsisPreview,
  installOpsisPreviewGuard,
  opsisRoutes,
} from "../src/routes/opsis.js";
import { buildApp } from "../src/app.js";
const key = "a".repeat(64);
const headers = { authorization: `Preview ${key}` };
function env() {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    OPSIS_WORKSPACES_ENABLED: "true",
    OPSIS_PREVIEW_HASH: createHash("sha256").update(key).digest("hex"),
    OPSIS_PREVIEW_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  });
}
it("denies missing, wrong, expired, malformed and disabled access", () => {
  const config = env();
  expect(authorizeOpsisPreview(config, headers.authorization)).toBeGreaterThan(
    Date.now(),
  );
  for (const header of [
    undefined,
    `Bearer ${key}`,
    `Preview ${"b".repeat(64)}`,
    `Preview ${key} `,
  ])
    expect(() => authorizeOpsisPreview(config, header)).toThrow();
  for (const changed of [
    { OPSIS_WORKSPACES_ENABLED: false },
    { OPSIS_PREVIEW_HASH: undefined },
    { OPSIS_PREVIEW_HASH: "bad" },
    { OPSIS_PREVIEW_EXPIRES_AT: "bad" },
    { OPSIS_PREVIEW_EXPIRES_AT: new Date(0).toISOString() },
  ])
    expect(() =>
      authorizeOpsisPreview({ ...config, ...changed }, headers.authorization),
    ).toThrow();
  expect(
    authorizeOpsisPreview(
      {
        ...config,
        OPSIS_PREVIEW_EXPIRES_AT: new Date(
          Date.now() + 86_400_000,
        ).toISOString(),
      },
      headers.authorization,
    ),
  ).toBeLessThanOrEqual(Date.now() + 3_600_000);
});
it("gates reused private engines before parsing and provider work, including expired sessions", async () => {
  const config = env();
  const app = Fastify();
  const provider = vi.fn(() => ({ ok: true }));
  installErrorHandler(app);
  installOpsisPreviewGuard(app, config);
  await opsisRoutes(app, config);
  app.post("/v1/private/analyze", provider);
  try {
    for (const url of ["/v1/private/opsis/access", "/v1/private/analyze"]) {
      expect(
        (await app.inject({ method: "POST", url, payload: {} })).statusCode,
      ).toBe(404);
    }
    expect(provider).not.toHaveBeenCalled();
    const access = await app.inject({
      method: "POST",
      url: "/v1/private/opsis/access",
      headers,
      payload: {},
    });
    expect(access.statusCode).toBe(200);
    expect(access.headers["cache-control"]).toBe("private, no-store");
    expect(access.json()).toMatchObject({
      chainId: 4663,
      research: true,
      exitCheck: false,
      watch: false,
      perpExecution: false,
      manifest: {
        version: 1,
        chain: { id: 4663, name: "Robinhood Chain" },
        capabilities: expect.arrayContaining([
          expect.objectContaining({ id: "research", enabled: true }),
          expect.objectContaining({ id: "exitCheck", enabled: false }),
          expect.objectContaining({ id: "observedTrades", enabled: false }),
        ]),
      },
    });
    const manifest = access.json().manifest;
    expect(manifest.capabilities.map((item: { id: string }) => item.id)).toEqual([
      "research", "tokenControls", "exitCheck", "watch", "rwa", "observedTrades", "swapPreview",
    ]);
    expect(manifest.capabilities.every((item: { scope: string; origin: string; freshness: string; coverage: string; limits: string }) =>
      [item.scope, item.origin, item.freshness, item.coverage, item.limits].every(Boolean),
    )).toBe(true);
    expect(access.body).not.toContain(key);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/analyze",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    config.OPSIS_PREVIEW_EXPIRES_AT = new Date(0).toISOString();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/analyze",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(provider).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
it("publishes manifest capability parity from the configured server flags", async () => {
  const config = {
    ...env(),
    TOKEN_CONTROLS_ENABLED: true,
    EXIT_CHECK_ENABLED: true,
    WATCH_ENABLED: true,
    PORTFOLIO_MODE_ENABLED: true,
    RWA_VERIFY_ENABLED: false,
    OBSERVED_TRADES_ENABLED: true,
    BUILD_SHA: "a".repeat(40),
  };
  const app = Fastify();
  installErrorHandler(app);
  await opsisRoutes(app, config);
  try {
    const response = await app.inject({ method: "POST", url: "/v1/private/opsis/access", headers, payload: {} });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.manifest.build).toBe(config.BUILD_SHA);
    expect(Object.fromEntries(body.manifest.capabilities.map((row: { id: string; enabled: boolean }) => [row.id, row.enabled]))).toEqual({
      research: true, tokenControls: true, exitCheck: true, watch: true, rwa: false, observedTrades: true, swapPreview: false,
    });
    expect(body.swapPreview).toBe(false);
    expect(body.manifest.capabilities.some((row: { id: string }) => /perp|quant|history/i.test(row.id))).toBe(false);
  } finally {
    await app.close();
  }
});
it("keeps production CSRF and no-store boundaries on access", async () => {
  const app = await buildApp({ ...env(), CSRF_PROTECTION_ENABLED: true });
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/opsis/access",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const result = await app.inject({
      method: "POST",
      url: "/v1/private/opsis/access",
      headers: {
        ...headers,
        origin: "http://localhost:5173",
        "x-opsis-csrf": "1",
      },
      payload: {},
    });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
  } finally {
    await app.close();
  }
});
it("leaves existing private routes unchanged when preview is disabled", async () => {
  const app = Fastify();
  const config = { ...env(), OPSIS_WORKSPACES_ENABLED: false };
  installErrorHandler(app);
  installOpsisPreviewGuard(app, config);
  await opsisRoutes(app, config);
  app.post("/v1/private/analyze", () => ({ ok: true }));
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/analyze",
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/opsis/access",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});

it("public access requires explicit enablement and preserves disabled workspaces", () => {
  const config = { ...env(), OPSIS_PUBLIC_ACCESS_ENABLED: true };
  expect(authorizeOpsisPreview(config, undefined, 1000)).toBe(3_601_000);
  expect(() =>
    authorizeOpsisPreview({ ...config, OPSIS_WORKSPACES_ENABLED: false }),
  ).toThrow();
  expect(env().OPSIS_PUBLIC_ACCESS_ENABLED).toBe(false);
});
it("public access permits anonymous research while retaining capabilities and CSRF", async () => {
  const app = await buildApp({
    ...env(),
    OPSIS_PUBLIC_ACCESS_ENABLED: true,
    CSRF_PROTECTION_ENABLED: true,
  });
  try {
    const url = "/v1/private/opsis/access";
    expect(
      (await app.inject({ method: "POST", url, payload: {} })).statusCode,
    ).toBe(403);
    const result = await app.inject({
      method: "POST",
      url,
      headers: { origin: "http://localhost:5173", "x-opsis-csrf": "1" },
      payload: {},
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      research: true,
      exitCheck: false,
      perpExecution: false,
    });
    expect(result.json().manifest.capabilities.find((item: { id: string }) => item.id === "exitCheck").enabled).toBe(false);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    // Feature-level gates still reject disabled quotes before provider work.
    const quote = await app.inject({
      method: "POST",
      url: "/v1/private/exit-check/quote",
      headers: { origin: "http://localhost:5173", "x-opsis-csrf": "1" },
      payload: {},
    });
    expect(quote.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
it("public mode lets anonymous requests reach reused read-only engines", async () => {
  const app = Fastify();
  installErrorHandler(app);
  installOpsisPreviewGuard(app, {
    ...env(),
    OPSIS_PUBLIC_ACCESS_ENABLED: true,
  });
  app.post("/v1/private/analyze", () => ({ ok: true }));
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/analyze",
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});

it("enables Swap preview only when live quotes and the server-side Uniswap key are both configured", async () => {
  const base = { ...loadEnv({ NODE_ENV: "test" }), OPSIS_WORKSPACES_ENABLED: true, OPSIS_PUBLIC_ACCESS_ENABLED: true };
  for (const [overrides, expected] of [
    [{ UNISWAP_QUOTE_ENABLED: false, UNISWAP_API_KEY: undefined }, false],
    [{ UNISWAP_QUOTE_ENABLED: true, UNISWAP_API_KEY: undefined }, false],
    [{ UNISWAP_QUOTE_ENABLED: true, UNISWAP_API_KEY: "server-only-key" }, true],
  ] as const) {
    const app = Fastify();
    installErrorHandler(app);
    await opsisRoutes(app, { ...base, ...overrides });
    try {
      const response = await app.inject({ method: "POST", url: "/v1/private/opsis/access", headers: { "content-type": "application/json" }, payload: {} });
      const body = response.json();
      expect(body.swapPreview).toBe(expected);
      expect(body.manifest.capabilities.find((row: { id: string }) => row.id === "swapPreview")?.enabled).toBe(expected);
      expect(JSON.stringify(body)).not.toContain("server-only-key");
    } finally {
      await app.close();
    }
  }
});
