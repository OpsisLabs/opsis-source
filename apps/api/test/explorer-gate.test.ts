import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerGate, getExplorerGate } from "../src/chain/explorer-gate.js";
import { createProviderHttp, ProviderHttpClient } from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";

const midnight = Date.parse("2026-10-15T00:00:00.000Z");
function setup(options: Partial<{ requestsPerSecond: number; maxWaitMs: number; creditReserve: number }> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(midnight - 10_000);
  const dependencies = { now: Date.now, sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };
  return new ExplorerGate({ requestsPerSecond: 4, maxWaitMs: 2500, creditReserve: 5000, ...options }, dependencies);
}
const response = (credits?: string, status = 200) => new Response("{}", {
  status, headers: credits === undefined ? {} : { "x-credits-remaining": credits }
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("process explorer gate", () => {
  it("passes four starts and waits for the fifth at the rolling boundary", async () => {
    const gate = setup();
    const starts: number[] = [];
    const fetch = vi.fn(async () => { starts.push(Date.now()); return response(); });
    await Promise.all(Array.from({ length: 4 }, () => gate.request(fetch)));
    const fifth = gate.request(fetch);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    await fifth;
    expect(starts[4]! - starts[0]!).toBe(1000);
  });

  it("refuses an excessive wait immediately without fetching", async () => {
    const gate = setup({ maxWaitMs: 999 });
    const fetch = vi.fn(async () => response());
    await Promise.all(Array.from({ length: 4 }, () => gate.request(fetch)));
    await expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: false });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("serves waiting arrivals in order across multiple windows", async () => {
    const gate = setup({ requestsPerSecond: 1 });
    const order: number[] = [];
    const requests = [1, 2, 3].map((id) => gate.request(async () => { order.push(id); return response(); }));
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all(requests);
    expect(order).toEqual([1, 2, 3]);
  });

  it("retries a 429 once after a second, even with no provider retries", async () => {
    const gate = setup();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(undefined, 429)).mockResolvedValueOnce(response("9000"));
    const client = new ProviderHttpClient({ explorerGate: gate, maxRetries: 0, backoffMs: 1, timeoutMs: 1000,
      circuitFailureThreshold: 1, circuitResetMs: 5000, requestBudgetPerMinute: 100 },
    { fetch, now: Date.now, sleep: async () => {} });
    const request = client.requestJson("https://explorer.test");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(gate.creditsRemaining).toBe(9000);
  });

  it("refuses a 429 retry outside the original wait limit", async () => {
    const gate = setup({ maxWaitMs: 999 });
    const fetch = vi.fn(async () => response(undefined, 429));
    await expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("includes the initial queue wait in the 429 retry deadline", async () => {
    const gate = setup({ requestsPerSecond: 1, maxWaitMs: 1500 });
    await gate.request(async () => response());
    const fetch = vi.fn(async () => response(undefined, 429));
    const pending = expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a second 429", async () => {
    const gate = setup();
    const fetch = vi.fn(async () => response(undefined, 429));
    const pending = expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: false });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["5000", "4999"])("stops at reserve %s until exactly midnight, including on error responses", async (credits) => {
    const gate = setup();
    await gate.request(async () => response(credits, 503));
    const fetch = vi.fn(async () => response("100000"));
    await expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_CREDITS_EXHAUSTED" });
    vi.setSystemTime(midnight - 1);
    await expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_CREDITS_EXHAUSTED" });
    expect(fetch).not.toHaveBeenCalled();
    vi.setSystemTime(midnight);
    await gate.request(fetch);
    expect(fetch).toHaveBeenCalledOnce();
    expect(gate.creditsRemaining).toBe(100000);
  });

  it("keeps reading above reserve and ignores missing and malformed headers", async () => {
    const gate = setup();
    await gate.request(async () => response("5001"));
    for (const header of [undefined, "", " ", "oops", "NaN", "Infinity"]) {
      const pending = gate.request(async () => response(header));
      await vi.advanceTimersByTimeAsync(1000);
      await pending;
      expect(gate.creditsRemaining).toBe(5001);
    }
  });

  it.each(["rate", "credits"])("gate %s refusals leave the provider circuit closed", async (reason) => {
    const gate = setup({ requestsPerSecond: 1, maxWaitMs: 0 });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(reason === "credits" ? "5000" : "9000"))
      .mockImplementation(async () => response("100000"));
    const client = new ProviderHttpClient({ explorerGate: gate, maxRetries: 0, backoffMs: 1, timeoutMs: 1000,
      circuitFailureThreshold: 1, circuitResetMs: 5000, requestBudgetPerMinute: 100 },
    { fetch, now: Date.now, sleep: async () => {} });
    await client.requestJson("https://explorer.test");
    for (let i = 0; i < 3; i += 1) {
      await expect(client.requestJson("https://explorer.test")).rejects.toMatchObject({
        code: reason === "credits" ? "PROVIDER_CREDITS_EXHAUSTED" : "PROVIDER_RATE_LIMITED"
      });
    }
    vi.setSystemTime(midnight);
    await expect(client.requestJson("https://explorer.test")).resolves.toEqual({});
  });

  it("rechecks the reserve before fetching an already queued request", async () => {
    const gate = setup({ requestsPerSecond: 1 });
    let finish!: (response: Response) => void;
    const first = gate.request(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const fetch = vi.fn(async () => response());
    const pending = expect(gate.request(fetch)).rejects.toMatchObject({ code: "PROVIDER_CREDITS_EXHAUSTED" });
    await vi.advanceTimersByTimeAsync(0);
    finish(response("5000"));
    await first;
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps refused requests out of the provider's per-minute budget", async () => {
    const gate = setup({ requestsPerSecond: 1, maxWaitMs: 0 });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response());
    const client = new ProviderHttpClient({ explorerGate: gate, maxRetries: 0, backoffMs: 1, timeoutMs: 1000,
      circuitFailureThreshold: 1, circuitResetMs: 5000, requestBudgetPerMinute: 2 },
    { fetch, now: Date.now, sleep: async () => {} });
    await client.requestJson("https://explorer.test");
    for (let i = 0; i < 5; i += 1) {
      await expect(client.requestJson("https://explorer.test")).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    }
    await vi.advanceTimersByTimeAsync(1000);
    await expect(client.requestJson("https://explorer.test")).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares the default gate across Research and Watch HTTP clients", async () => {
    setup();
    const env = loadEnv({ NODE_ENV: "test", BLOCKSCOUT_REQUESTS_PER_SECOND: "1", BLOCKSCOUT_MAX_WAIT_MS: "0" });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);
    const research = createProviderHttp(env, "blockscout");
    const watch = createProviderHttp(env, "blockscout");
    await research.requestJson("https://explorer.test");
    await expect(watch.requestJson("https://explorer.test")).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(watch.requestJson("https://explorer.test")).resolves.toEqual({});
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not add another 429 retry after a generic provider retry", async () => {
    const gate = setup();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(undefined, 429))
      .mockResolvedValueOnce(response(undefined, 503))
      .mockResolvedValueOnce(response(undefined, 429));
    const client = new ProviderHttpClient({ explorerGate: gate, maxRetries: 1, backoffMs: 1, timeoutMs: 1000,
      circuitFailureThreshold: 1, circuitResetMs: 5000, requestBudgetPerMinute: 100 },
    { fetch, now: Date.now, sleep: async () => {} });
    const pending = expect(client.requestJson("https://explorer.test")).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("shares the process instance and allows isolated keyed clocks", () => {
    const env = loadEnv({ NODE_ENV: "test" });
    const dependencies = { now: () => 0, sleep: async () => {} };
    expect(getExplorerGate(env, "test-a", dependencies)).toBe(getExplorerGate(env, "test-a", dependencies));
    expect(getExplorerGate(env, "test-b", dependencies)).not.toBe(getExplorerGate(env, "test-a", dependencies));
  });
});
