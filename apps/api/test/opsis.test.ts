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
    });
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
        "x-chainscout-csrf": "1",
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
