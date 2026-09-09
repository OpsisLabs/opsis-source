import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { marketRoutes } from "../src/routes/market.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
it("deal discovery is independently disabled and does not contact providers", async () => {
  const app = Fastify(); installErrorHandler(app);
  const directory = vi.fn();
  try {
    await marketRoutes(app, loadEnv({ NODE_ENV: "test" }), { directory } as never);
    const response = await app.inject({ method: "POST", url: "/v1/private/deals/merchants", payload: {} });
    expect(response.statusCode).toBe(503); expect(directory).not.toHaveBeenCalled();
    expect(response.headers["cache-control"]).toBe("private, no-store");
  } finally { await app.close(); }
});
it("enabled directory can honestly be empty and rejects private data", async () => {
  const app = Fastify(); installErrorHandler(app);
  const directory = vi.fn().mockResolvedValue({ merchants: [] });
  try {
    await marketRoutes(app, loadEnv({ NODE_ENV: "test", COLLECTIBLE_DEAL_FINDER_ENABLED: "true" }), { directory } as never);
    const bad = await app.inject({ method: "POST", url: "/v1/private/deals/merchants", payload: { privateNotes: "secret" } });
    expect(bad.statusCode).toBe(400); expect(directory).not.toHaveBeenCalled();
    const response = await app.inject({ method: "POST", url: "/v1/private/deals/merchants", payload: {} });
    expect(response.statusCode).toBe(200); expect(response.json().merchants).toEqual([]);
  } finally { await app.close(); }
});
