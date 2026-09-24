import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { AppError } from "../src/http/errors.js";
import { ProviderHttpClient } from "../src/chain/provider-http.js";
import { observeRetention, observeRpcSubcall } from "../src/observability/metrics.js";

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

  it("exports bounded operational failure and retention signals", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", ENABLE_METRICS: "true", LOG_LEVEL: "silent" }));
    apps.push(app);
    app.get("/test-operational-failure", async () => {
      throw new AppError("TEST_BUDGET_EXCEEDED", 503, "bounded test failure");
    });
    observeRetention("success", new Date("2026-08-12T12:00:00.000Z"));
    observeRetention("failure", new Date("2026-08-12T13:00:00.000Z"));

    expect((await app.inject({ method: "GET", url: "/test-operational-failure" })).statusCode).toBe(503);
    const metrics = (await app.inject({ method: "GET", url: "/metrics" })).body;
    expect(metrics).toContain('rh_chain_operational_failures_total{code="TEST_BUDGET_EXCEEDED",status_code="503"} 1');
    expect(metrics).toContain('rh_chain_retention_runs_total{outcome="success"} 1');
    expect(metrics).toContain('rh_chain_retention_runs_total{outcome="failure"} 1');
    expect(metrics).toContain("rh_chain_retention_last_success_timestamp_seconds 1786536000");
  });

  it("counts actual JSON-RPC subcall attempts without exposing parameters", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", ENABLE_METRICS: "true", LOG_LEVEL: "silent" }));
    apps.push(app);
    const canary = "0xprivate-canary-must-not-be-a-metric-label";
    let attempts = 0;
    const client = new ProviderHttpClient(
      { maxRetries: 1, backoffMs: 1, timeoutMs: 1000, circuitFailureThreshold: 2, circuitResetMs: 1000, requestBudgetPerMinute: 10, providerName: "rpc-metrics-test", rpcWorkload: "portfolio" },
      {
        fetch: async () => {
          attempts += 1;
          return attempts === 1
            ? new Response("unavailable", { status: 503 })
            : new Response(JSON.stringify([{ jsonrpc: "2.0", id: 1, result: "0x1" }]));
        },
        now: Date.now,
        sleep: async () => undefined,
      },
    );
    await client.requestJson("https://provider.test", {
      method: "POST",
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: canary }, "latest"] },
        { jsonrpc: "2.0", id: 2, method: "eth_getLogs", params: [{ address: canary }] },
      ]),
    });
    const metrics = (await app.inject({ method: "GET", url: "/metrics" })).body;
    expect(metrics).toContain('rh_chain_rpc_subcalls_total{provider="rpc-metrics-test",method="eth_call"} 2');
    expect(metrics).toContain('rh_chain_rpc_subcalls_total{provider="rpc-metrics-test",method="eth_getLogs"} 2');
    expect(metrics).toContain('rh_chain_rpc_workload_subcalls_total{workload="portfolio",method="eth_call"} 2');
    expect(metrics).toContain('rh_chain_rpc_workload_subcalls_total{workload="portfolio",method="eth_getLogs"} 2');
    expect(metrics).toContain('rh_chain_provider_response_bytes_total{provider="rpc-metrics-test"}');
    expect(metrics).not.toContain(canary);
  });

  it("attributes shared-provider RPC usage to bounded workloads", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", ENABLE_METRICS: "true", LOG_LEVEL: "silent" }));
    apps.push(app);
    observeRpcSubcall("robinhood-public-rpc", "eth_call", "exit-check");
    observeRpcSubcall("robinhood-public-rpc", "eth_call", "rwa");
    observeRpcSubcall("alchemy", "eth_getBalance", "research");
    observeRpcSubcall("robinhood-public-rpc", "eth_call", "untrusted-private-value" as "unattributed");
    const metrics = (await app.inject({ method: "GET", url: "/metrics" })).body;
    expect(metrics).toContain('rh_chain_rpc_subcalls_total{provider="robinhood-public-rpc",method="eth_call"} 3');
    expect(metrics).toContain('rh_chain_rpc_workload_subcalls_total{workload="exit-check",method="eth_call"} 1');
    expect(metrics).toContain('rh_chain_rpc_workload_subcalls_total{workload="rwa",method="eth_call"} 1');
    expect(metrics).toContain('rh_chain_rpc_workload_subcalls_total{workload="research",method="eth_getBalance"} 1');
    expect(metrics).toContain('rh_chain_rpc_workload_subcalls_total{workload="unattributed",method="eth_call"} 1');
    expect(metrics).not.toContain("untrusted-private-value");
  });
});
