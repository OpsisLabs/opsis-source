import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import { loadEnv } from "../src/config/env.js";
import { chainlinkAbi, ethUsdFeed } from "../src/rwa/chainlink.js";
import { NetworkPulseService } from "../src/network-pulse/service.js";
import { networkPulseRoutes } from "../src/routes/network-pulse.js";
import { installErrorHandler } from "../src/http/errors.js";
import { RobinhoodRpcHttp, robinhoodRpcEndpoint } from "../src/chain/robinhood-rpc.js";

const time = Date.parse("2026-10-20T12:00:00.000Z");
const seconds = BigInt(time / 1000);
const env = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", OPSIS_WORKSPACES_ENABLED: "true", OPSIS_PUBLIC_ACCESS_ENABLED: "true", NETWORK_PULSE_ENABLED: "true" });
const hex = (value: bigint) => `0x${value.toString(16)}`;
function batch() {
  return [
    { jsonrpc: "2.0", id: 0, result: { number: "0x64", hash: `0x${"ab".repeat(32)}`, timestamp: hex(seconds - 2n) } },
    { jsonrpc: "2.0", id: 1, result: { number: "0x60", hash: `0x${"cd".repeat(32)}`, timestamp: hex(seconds - 10n) } },
    { jsonrpc: "2.0", id: 2, result: "0x3b9aca01" },
    { jsonrpc: "2.0", id: 3, result: round(seconds - 5n) },
  ];
}
function round(updatedAt: bigint, answer = 200012345678n, answeredInRound = 1n) {
  return encodeFunctionResult({ abi: chainlinkAbi, functionName: "latestRoundData", result: [1n, answer, updatedAt, updatedAt, answeredInRound] });
}
function fixture(response: unknown = batch()) {
  let now = time, clock = 0;
  const rpc = { requestJson: vi.fn(async () => { clock += 250; return response; }) };
  const budget = { consume: vi.fn(async () => undefined) };
  const service = new NetworkPulseService(env, { rpc, budget, now: () => now, clock: () => clock });
  return { service, rpc, budget, advance: (ms: number) => { now += ms; } };
}

describe("network pulse", () => {
  it("batches exactly four metered reads and preserves exact units and one observation time", async () => {
    const f = fixture(batch().reverse());
    const pulse = await f.service.observe();
    expect(pulse).toMatchObject({
      chainId: 4663, observedAt: new Date(time).toISOString(),
      latestBlock: { value: { number: "100" }, reason: null }, latestAgeSeconds: { value: 2 },
      safeBlock: { value: { number: "96" } }, safeLagBlocks: { value: "4" }, safeLagSeconds: { value: 8 },
      gasPriceGwei: { value: "1.000000001" }, ethUsd: { value: "2000.12345678" },
      ethUsdUpdatedAt: { value: new Date(time - 5000).toISOString() }, rpcLatencyMs: { value: 250 },
    });
    expect(f.budget.consume).toHaveBeenCalledExactlyOnceWith(4);
    const request = f.rpc.requestJson.mock.calls[0] as unknown as [string, RequestInit];
    const calls = JSON.parse(String(request[1].body));
    expect(calls.map((call: { method: string }) => call.method)).toEqual(["eth_getBlockByNumber", "eth_getBlockByNumber", "eth_gasPrice", "eth_call"]);
    expect(calls[3].params[0].to).toBe(ethUsdFeed.proxyAddress);
  });

  it("caches for exactly 15 seconds and shares in-flight work", async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.rpc.requestJson.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const first = f.service.observe(), second = f.service.observe();
    expect(first).toBe(second);
    await Promise.resolve();
    resolve(batch());
    expect(await first).toBe(await second);
    f.advance(14_999);
    await f.service.observe();
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(1);
    f.advance(1);
    const refreshed = await f.service.observe();
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(2);
    expect(refreshed.observedAt).toBe(new Date(time + 15_000).toISOString());
  });

  it("preserves partial success without extra calls or substituting latest for safe", async () => {
    const rows: unknown[] = batch();
    rows[1] = { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "tag unavailable" } };
    rows[3] = { jsonrpc: "2.0", id: 3, error: { code: -32000 } };
    const f = fixture(rows), pulse = await f.service.observe();
    expect(pulse.latestBlock.value?.number).toBe("100");
    expect(pulse.gasPriceGwei.value).toBe("1.000000001");
    for (const field of [pulse.safeBlock, pulse.safeLagBlocks, pulse.safeLagSeconds, pulse.ethUsd, pulse.ethUsdUpdatedAt]) expect(field).toEqual({ value: null, reason: "unavailable" });
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(1);
  });

  it.each([round(seconds - 86401n), round(seconds + 1n), round(seconds, -1n), round(seconds, 1n, 0n), "0x"])("refuses stale or invalid oracle values: %s", async value => {
    const rows = batch(); rows[3]!.result = value;
    const pulse = await fixture(rows).service.observe();
    expect(pulse.ethUsd.value).toBeNull();
    expect(pulse.ethUsd.reason).toBe(value === round(seconds - 86401n) ? "stale_feed" : "malformed_response");
    if (pulse.ethUsd.reason === "stale_feed") expect(pulse.ethUsdUpdatedAt.value).toBe(new Date(time - 86401000).toISOString());
    expect(pulse.gasPriceGwei.value).not.toBeNull();
  });

  it("refuses inconsistent block lags, malformed batches and missing latest evidence", async () => {
    const rows = batch();
    rows[1]!.result = { ...rows[0]!.result as object, number: "0x65" };
    expect((await fixture(rows).service.observe()).safeLagBlocks).toEqual({ value: null, reason: "inconsistent_blocks" });
    rows[0]!.result = null as never;
    const missing = await fixture(rows).service.observe();
    expect(missing.safeBlock.value?.number).toBe("101");
    expect(missing.safeLagBlocks.reason).toBe("latest_unavailable");
    for (const invalid of [[], [batch()[0], batch()[0], batch()[2], batch()[3]], { result: batch() }]) {
      const pulse = await fixture(invalid).service.observe();
      expect(pulse.latestBlock.reason).toBe("malformed_response");
      expect(pulse.gasPriceGwei.value).toBeNull();
    }
  });

  it("caches failure and never dispatches when the existing daily or spend guard refuses", async () => {
    const f = fixture();
    f.budget.consume.mockRejectedValue(new Error("budget unavailable"));
    expect((await f.service.observe()).latestBlock.reason).toBe("budget_limited");
    await f.service.observe();
    expect(f.budget.consume).toHaveBeenCalledTimes(1);
    expect(f.rpc.requestJson).not.toHaveBeenCalled();
    const inner = { requestJson: vi.fn() }, spend = { reserve: vi.fn().mockRejectedValue(new Error("spend guard unavailable")) };
    const rpc = new RobinhoodRpcHttp(robinhoodRpcEndpoint(env), inner, spend);
    const guarded = new NetworkPulseService(env, { rpc, budget: { consume: async () => undefined } });
    expect((await guarded.observe()).ethUsd.value).toBeNull();
    expect(spend.reserve).toHaveBeenCalledExactlyOnceWith(80);
    expect(inner.requestJson).not.toHaveBeenCalled();
  });

  it("shares refreshes across replicas and fails closed on Redis failure", async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => { if (values.has(key)) return null; values.set(key, value); return "OK"; }),
      eval: vi.fn(async (_script: string, _count: number, lock: string, key: string, owner: string, value: string) => {
        if (values.get(lock) !== owner) return 0;
        values.set(key, value); values.delete(lock); return 1;
      }),
    };
    const f = fixture();
    let now = time;
    const deps = { rpc: f.rpc, budget: f.budget, redis: redis as never, now: () => now };
    const first = new NetworkPulseService(env, deps), second = new NetworkPulseService(env, deps);
    const pulses = await Promise.all([first.observe(), second.observe()]);
    expect(pulses[0]).toEqual(pulses[1]);
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(1);
    now += 15_000;
    const expired = new NetworkPulseService(env, deps);
    expect((await expired.observe()).observedAt).toBe(new Date(now).toISOString());
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(2);
    redis.get.mockRejectedValue(new Error("Redis unavailable"));
    const refused = new NetworkPulseService(env, deps);
    expect((await refused.observe()).latestBlock.reason).toBe("coordination_unavailable");
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(2);
  });

  it("gates the route before provider work, including direct private-preview access", async () => {
    const app = Fastify(); installErrorHandler(app);
    const config = { ...env, NETWORK_PULSE_ENABLED: false };
    const service = { observe: vi.fn(async () => fixture().service.observe()) };
    await networkPulseRoutes(app, config, service);
    const read = () => app.inject({ method: "GET", url: "/v1/private/opsis/network-pulse" });
    try {
      expect((await read()).statusCode).toBe(404);
      config.NETWORK_PULSE_ENABLED = true;
      config.OPSIS_PUBLIC_ACCESS_ENABLED = false;
      expect((await read()).statusCode).toBe(404);
      config.OPSIS_PUBLIC_ACCESS_ENABLED = true;
      config.OPSIS_WORKSPACES_ENABLED = false;
      expect((await read()).statusCode).toBe(404);
      expect(service.observe).not.toHaveBeenCalled();
      config.OPSIS_WORKSPACES_ENABLED = true;
      const response = await read();
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    } finally { await app.close(); }
  });
});
