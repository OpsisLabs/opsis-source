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
it("uses the configured access limit without changing the one-minute window", async () => {
  const app = await buildApp({ ...env(), RATE_LIMIT_ACCESS_PER_MINUTE: 21 });
  try {
    for (let index = 0; index < 21; index += 1) {
      const response = await app.inject({ method: "POST", url: "/v1/private/opsis/access", headers, payload: {} });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    const refused = await app.inject({ method: "POST", url: "/v1/private/opsis/access", headers, payload: {} });
    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(refused.headers["retry-after"])).toBeLessThanOrEqual(60);
  } finally {
    await app.close();
  }
});
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
      perpHandoff: false,
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
      "research", "tokenControls", "exitCheck", "watch", "rwa", "observedTrades", "swapPreview", "stockDesk", "publicCards", "publicMcp", "alerts", "telegramBot", "openDataSql", "openDataDatasets", "launchCards", "claimCheck", "receipts", "perpHandoff",
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
      research: true, tokenControls: true, exitCheck: true, watch: true, rwa: false, observedTrades: true, swapPreview: false, stockDesk: false, publicCards: false, publicMcp: false, telegramBot: false, alerts: false, openDataSql: false, openDataDatasets: false, launchCards: false, claimCheck: false, receipts: false, perpHandoff: false,
    });
    expect(body.swapPreview).toBe(false);
    expect(body.manifest.capabilities.some((row: { id: string }) => /perpExecution|quant|history/i.test(row.id))).toBe(false);
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
      perpHandoff: false,
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

it("enables Swap preview with the configured source; on-chain quotes need no Uniswap key", async () => {
  const base = { ...loadEnv({ NODE_ENV: "test" }), OPSIS_WORKSPACES_ENABLED: true, OPSIS_PUBLIC_ACCESS_ENABLED: true };
  for (const [overrides, expected] of [
    [{ UNISWAP_QUOTE_ENABLED: false, UNISWAP_API_KEY: undefined }, false],
    [{ UNISWAP_QUOTE_ENABLED: true, UNISWAP_API_KEY: undefined }, true],
    [{ UNISWAP_QUOTE_ENABLED: true, SWAP_QUOTE_SOURCE: "uniswap-api", UNISWAP_API_KEY: undefined }, false],
    [{ UNISWAP_QUOTE_ENABLED: true, SWAP_QUOTE_SOURCE: "uniswap-api", UNISWAP_API_KEY: "server-only-key" }, true],
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

it("keeps the venue directory off by default and enables only its manifest row, never execution", async () => {
  expect(env().PERP_HANDOFF_ENABLED).toBe(false);
  for (const flag of [undefined, "false", "true", "TRUE"] as const) {
    const config = loadEnv({ NODE_ENV: "test", OPSIS_WORKSPACES_ENABLED: "true", OPSIS_PUBLIC_ACCESS_ENABLED: "true", PERP_HANDOFF_ENABLED: flag });
    const app = Fastify();
    await opsisRoutes(app, config);
    try {
      const response = await app.inject({ method: "POST", url: "/v1/private/opsis/access", payload: {} });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const enabled = flag?.toLowerCase() === "true";
      expect(body.perpHandoff).toBe(enabled);
      expect(body.perpExecution).toBe(false);
      expect(body.manifest.capabilities.find((row: { id: string }) => row.id === "perpHandoff")).toEqual({
        id: "perpHandoff", enabled,
        scope: "Reviewed directory of perpetual-futures venues by stated region; no orders and no eligibility verification",
        origin: "static review, checked 2026-10-12",
        freshness: "re-review due within 120 days",
        coverage: "United States and Canada only",
        limits: "Each venue's own pages govern; Opsis verifies no identity or eligibility",
      });
    } finally {
      await app.close();
    }
  }
  for (const flag of ["", "yes", "1", "-1", "101"]) {
    expect(() => loadEnv({ NODE_ENV: "test", PERP_HANDOFF_ENABLED: flag })).toThrow();
  }
});

it("keeps saved-check comparisons off by default and advertises local-only evidence only when enabled", async () => {
  expect(env().SAVED_CHECK_COMPARISONS_ENABLED).toBe(false);
  for (const flag of [undefined, "false", "true"] as const) {
    const config = loadEnv({ NODE_ENV: "test", OPSIS_WORKSPACES_ENABLED: "true", OPSIS_PUBLIC_ACCESS_ENABLED: "true", SAVED_CHECK_COMPARISONS_ENABLED: flag });
    const app = Fastify();
    await opsisRoutes(app, config);
    try {
      const response = await app.inject({ method: "POST", url: "/v1/private/opsis/access", payload: {} });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.savedCheckComparisons).toBe(flag === "true");
      const row = body.manifest.capabilities.find((item: { id: string }) => item.id === "savedCheckComparisons");
      if (flag === "true") expect(row).toMatchObject({ enabled: true });
      else expect(row).toBeUndefined();
      expect(body.perpExecution).toBe(false);
    } finally { await app.close(); }
  }
  expect(() => loadEnv({ NODE_ENV: "test", SAVED_CHECK_COMPARISONS_ENABLED: "yes" })).toThrow();
});
