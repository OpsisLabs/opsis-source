import { describe, expect, it, vi } from "vitest";
import { ProviderHttpClient, ProviderRequestError, type ProviderHttpOptions } from "../src/chain/provider-http.js";

const options: ProviderHttpOptions = {
  maxRetries: 1,
  backoffMs: 10,
  timeoutMs: 1000,
  circuitFailureThreshold: 2,
  circuitResetMs: 5000,
  requestBudgetPerMinute: 10
};

describe("provider HTTP resilience", () => {
  it("retries transient responses with bounded backoff", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const client = new ProviderHttpClient(options, { fetch: fetchMock, now: () => 0, sleep });

    await expect(client.requestJson("https://provider.test")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("opens the circuit after consecutive request failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 }));
    const client = new ProviderHttpClient(
      { ...options, maxRetries: 0 },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined }
    );

    await expect(client.requestJson("https://provider.test")).rejects.toMatchObject({ code: "PROVIDER_HTTP_503" });
    await expect(client.requestJson("https://provider.test")).rejects.toMatchObject({ code: "PROVIDER_HTTP_503" });
    await expect(client.requestJson("https://provider.test")).rejects.toMatchObject({ code: "PROVIDER_CIRCUIT_OPEN" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not open the circuit for non-retryable responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("missing", { status: 404 }));
    const client = new ProviderHttpClient(
      { ...options, maxRetries: 0, circuitFailureThreshold: 1 },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined }
    );

    await expect(client.requestJson("https://provider.test/one")).rejects.toMatchObject({ code: "PROVIDER_HTTP_404" });
    await expect(client.requestJson("https://provider.test/two")).rejects.toMatchObject({ code: "PROVIDER_HTTP_404" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops requests when the provider budget is exhausted", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new ProviderHttpClient(
      { ...options, requestBudgetPerMinute: 1 },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined }
    );

    await client.requestJson("https://provider.test");
    await expect(client.requestJson("https://provider.test")).rejects.toEqual(
      new ProviderRequestError("PROVIDER_BUDGET_EXCEEDED", false)
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reserves provider-weighted units before every physical retry and fails closed", async () => {
    const reserve = vi.fn()
      .mockResolvedValueOnce({ outcome: "reserved", units: 5, remaining: 5 })
      .mockResolvedValueOnce({ outcome: "exhausted" });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 }));
    const client = new ProviderHttpClient(
      { ...options, rpcUnitBudget: { reserve } },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined },
    );
    await expect(client.requestJson("https://provider.test", {
      method: "POST",
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: "0xprivate" }, "latest"] },
        { jsonrpc: "2.0", id: 2, method: "eth_getLogs", params: [] },
      ]),
    })).rejects.toEqual(new ProviderRequestError("PROVIDER_GLOBAL_BUDGET_EXCEEDED", false));
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledWith(["eth_call", "eth_getLogs"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send an RPC body whose methods cannot be metered", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const reserve = vi.fn(async () => ({ outcome: "unmetered" as const }));
    const client = new ProviderHttpClient(
      { ...options, rpcUnitBudget: { reserve } },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined },
    );
    await expect(client.requestJson("https://provider.test", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_newUnknownMethod", params: [] }),
    })).rejects.toEqual(new ProviderRequestError("PROVIDER_GLOBAL_BUDGET_UNMETERED", false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not partially meter a malformed JSON-RPC batch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const reserve = vi.fn(async (methods: readonly string[]) => ({
      outcome: methods.length > 0 ? "reserved" as const : "unmetered" as const,
      units: 1,
      remaining: 9,
    }));
    const client = new ProviderHttpClient(
      { ...options, rpcUnitBudget: { reserve } },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined },
    );
    await expect(client.requestJson("https://provider.test", {
      method: "POST",
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_call", params: [] },
        { jsonrpc: "2.0", id: 2, params: [] },
      ]),
    })).rejects.toMatchObject({ code: "PROVIDER_GLOBAL_BUDGET_UNMETERED" });
    expect(reserve).toHaveBeenCalledWith([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds concurrent requests per provider", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const fetchMock = vi.fn<typeof fetch>(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = new ProviderHttpClient(
      { ...options, maxConcurrency: 2 },
      { fetch: fetchMock, now: () => 0, sleep: async () => undefined }
    );

    const requests = [1, 2, 3].map((value) => client.requestJson(`https://provider.test/${value}`));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => release());
    await Promise.all(requests);

    expect(peak).toBe(2);
  });

  it("fails closed before parsing oversized or malformed provider documents", async () => {
    const oversized = new ProviderHttpClient(
      { ...options, maxRetries: 0, maxResponseBytes: 16 },
      { fetch: vi.fn(async () => new Response(JSON.stringify({ payload: "A".repeat(64) }))), now: () => 0, sleep: async () => undefined }
    );
    await expect(oversized.requestJson("https://provider.test/oversized")).rejects.toMatchObject({ code: "PROVIDER_RESPONSE_TOO_LARGE" });

    const malformed = new ProviderHttpClient(
      { ...options, maxRetries: 0, maxResponseBytes: 1_024 },
      { fetch: vi.fn(async () => new Response("not-json")), now: () => 0, sleep: async () => undefined }
    );
    await expect(malformed.requestJson("https://provider.test/malformed")).rejects.toMatchObject({ code: "PROVIDER_MALFORMED_RESPONSE" });
  });
});
