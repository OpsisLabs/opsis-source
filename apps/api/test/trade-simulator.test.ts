import Fastify from "fastify";
import { expect, it } from "vitest";
import { JsonCache } from "../src/cache/service.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { swapRoutes } from "../src/routes/swaps.js";
it("simulator endpoint fails closed when its own flag is off", async () => {
  const app = Fastify(); installErrorHandler(app);
  try {
    await swapRoutes(app, loadEnv({ NODE_ENV: "test" }), new JsonCache());
    const response = await app.inject({ method: "POST", url: "/v1/private/trade-simulator/quote", payload: { direction: "WETH_TO_USDG", amount: "0.01" } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("TRADE_SIMULATOR_DISABLED");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  } finally { await app.close(); }
});
