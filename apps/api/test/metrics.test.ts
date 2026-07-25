import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Prometheus metrics", () => {
  it("exports bounded HTTP and process metrics when enabled", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", ENABLE_METRICS: "true", LOG_LEVEL: "silent" }));
    apps.push(app);

    await app.inject({ method: "GET", url: "/healthz" });
    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("rh_chain_http_requests_total");
    expect(response.body).toContain('route="/healthz"');
    expect(response.body).toContain("rh_chain_process_cpu_seconds_total");
  });

  it("does not register the route when disabled", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", ENABLE_METRICS: "false", LOG_LEVEL: "silent" }));
    apps.push(app);

    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(404);
  });
});
