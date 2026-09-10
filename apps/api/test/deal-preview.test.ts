import { createHash } from "node:crypto";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { authorizeDealPreview } from "../src/market/preview-access.js";
import { marketRoutes } from "../src/routes/market.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
const key = "a".repeat(64);
const env = () => loadEnv({ NODE_ENV: "test", COLLECTIBLE_DEAL_FINDER_ENABLED: "true", DEAL_FINDER_PREVIEW_HASH: createHash("sha256").update(key).digest("hex"), DEAL_FINDER_PREVIEW_EXPIRES_AT: new Date(Date.now() + 60000).toISOString() });
it("requires exact credential, live expiry and kill switch", () => {
  expect(() => authorizeDealPreview(env(), undefined)).toThrow();
  expect(() => authorizeDealPreview(env(), "Preview " + "b".repeat(64))).toThrow();
  expect(() => authorizeDealPreview(env(), "Preview " + key)).not.toThrow();
  expect(() => authorizeDealPreview(env(), "Preview " + key, Date.now() + 120000)).toThrow();
  expect(() => authorizeDealPreview({ ...env(), COLLECTIBLE_DEAL_FINDER_ENABLED: false }, "Preview " + key)).toThrow();
  expect(() => authorizeDealPreview({ ...env(), DEAL_FINDER_PREVIEW_HASH: undefined }, "Preview " + key)).toThrow();
});
it("all production-preview routes deny unauthenticated callers before provider access", async () => {
  const app = Fastify(); installErrorHandler(app);
  const lookup = vi.fn(), directory = vi.fn(), merchant = vi.fn();
  try {
    await marketRoutes(app, env(), { directory, merchant } as never, { lookup });
    for (const suffix of ["access", "benchmark", "merchants", "offer"]) {
      const result = await app.inject({ method: "POST", url: "/v1/private/deals/" + suffix, payload: {} });
      expect(result.statusCode).toBe(404);
    }
    expect(lookup).not.toHaveBeenCalled(); expect(directory).not.toHaveBeenCalled(); expect(merchant).not.toHaveBeenCalled();
    const access = await app.inject({ method: "POST", url: "/v1/private/deals/access", payload: {}, headers: { authorization: "Preview " + key } });
    expect(access.statusCode).toBe(200); expect(access.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(access.json())).not.toContain(key);
  } finally { await app.close(); }
});
