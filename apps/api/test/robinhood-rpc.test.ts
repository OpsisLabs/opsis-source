import { afterEach, describe, expect, it, vi } from "vitest";
import type Redis from "ioredis";
import { loadEnv } from "../src/config/env.js";
import { ProviderRequestError, type ProviderHttp } from "../src/chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  createRobinhoodRpcSpendBudget,
  jsonRpcUnits,
  robinhoodRpcEndpoint,
  rpcRoutingDisclosure,
  RobinhoodRpcHttp,
  type RpcSpendBudget
} from "../src/chain/robinhood-rpc.js";

const KEY = "test-drpc-key-0123456789abcdef";
const drpcEnv = (overrides: Record<string, string> = {}) =>
  loadEnv({ NODE_ENV: "test", ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: KEY, ...overrides });
const body = (method: string) => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] });
const okResponse = () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Robinhood Chain RPC endpoint", () => {
  it("defaults to the official public RPC for development", () => {
    const endpoint = robinhoodRpcEndpoint(loadEnv({ NODE_ENV: "test" }));
    expect(endpoint).toEqual({
      id: "robinhood-public-rpc",
      label: "Robinhood Public RPC",
      url: "https://rpc.mainnet.chain.robinhood.com"
    });
    expect(rpcRoutingDisclosure(endpoint)).toBe("");
  });

  it("resolves dRPC to a credential-free URL and discloses gateway routing", () => {
    const endpoint = robinhoodRpcEndpoint(drpcEnv());
    expect(endpoint).toEqual({ id: "drpc", label: "dRPC Robinhood Chain gateway", url: "https://lb.drpc.live/robinhood" });
    expect(endpoint.url).not.toContain(KEY);
    expect(rpcRoutingDisclosure(endpoint)).toMatch(/independent node operator/);
  });
});

describe("JSON-RPC method allowlist", () => {
  it("weights allowlisted reads and counts every batch member", () => {
    expect(jsonRpcUnits(body("eth_call"))).toBe(20);
    expect(jsonRpcUnits(body("eth_getLogs"))).toBe(200);
    expect(jsonRpcUnits(JSON.stringify([
      { jsonrpc: "2.0", id: "a", method: "eth_getBalance", params: [] },
      { jsonrpc: "2.0", id: "b", method: "eth_getTransactionReceipt", params: [] }
    ]))).toBe(40);
  });

  it.each([
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_signTypedData_v4",
    "eth_signTransaction",
    "personal_sign",
    "wallet_sendCalls",
    "debug_traceTransaction",
    "toString",
    "__proto__"
  ])("refuses %s before dispatch", (method) => {
    expect(() => jsonRpcUnits(body(method))).toThrow(ProviderRequestError);
  });

  it("refuses malformed, empty, oversized and mixed batches", () => {
    const refused = (value: RequestInit["body"]) =>
      expect(() => jsonRpcUnits(value)).toThrowError(expect.objectContaining({ code: "PROVIDER_RPC_METHOD_NOT_ALLOWED" }));
    refused(undefined);
    refused("not json");
    refused("[]");
    refused(JSON.stringify(Array.from({ length: 101 }, (_, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [] }))));
    refused(JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_call", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: [] }
    ]));
  });
});

describe("Robinhood Chain RPC transport", () => {
  const endpoint = { id: "drpc" as const, label: "dRPC Robinhood Chain gateway", url: "https://lb.drpc.live/robinhood" };

  it("sends the dRPC key only as a header to the exact endpoint and refuses redirects", async () => {
    const inner: ProviderHttp = { requestJson: vi.fn(async () => ({ result: "0x1" })) };
    const transport = new RobinhoodRpcHttp(endpoint, inner, { reserve: vi.fn(async () => undefined) }, KEY);

    await transport.requestJson(endpoint.url, { method: "POST", headers: { "content-type": "application/json" }, body: body("eth_call") });

    const [url, init] = vi.mocked(inner.requestJson).mock.calls[0]!;
    expect(url).toBe(endpoint.url);
    expect(url).not.toContain(KEY);
    expect(init?.redirect).toBe("error");
    const headers = new Headers(init?.headers);
    expect(headers.get("Drpc-Key")).toBe(KEY);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("never sends the key to any other destination", async () => {
    const inner: ProviderHttp = { requestJson: vi.fn(async () => ({})) };
    const transport = new RobinhoodRpcHttp(endpoint, inner, { reserve: async () => undefined }, KEY);

    await expect(transport.requestJson("https://rpc.mainnet.chain.robinhood.com", { method: "POST", body: body("eth_call") }))
      .rejects.toMatchObject({ code: "PROVIDER_DESTINATION_MISMATCH" });
    await expect(transport.requestJson(`${endpoint.url}/extra`, { method: "POST", body: body("eth_call") }))
      .rejects.toMatchObject({ code: "PROVIDER_DESTINATION_MISMATCH" });
    expect(inner.requestJson).not.toHaveBeenCalled();
  });

  it("reserves weighted units before dispatch and sends nothing when the fuse denies", async () => {
    const order: string[] = [];
    const inner: ProviderHttp = { requestJson: vi.fn(async () => { order.push("dispatch"); return {}; }) };
    const reserve = vi.fn(async (units: number) => { order.push(`reserve:${units}`); });
    const transport = new RobinhoodRpcHttp(endpoint, inner, { reserve }, KEY);

    await transport.requestJson(endpoint.url, { method: "POST", body: body("eth_getLogs") });
    expect(order).toEqual(["reserve:200", "dispatch"]);

    const denied = new RobinhoodRpcHttp(endpoint, inner, {
      reserve: async () => { throw new ProviderRequestError("PROVIDER_MONTHLY_BUDGET_EXCEEDED", false); }
    }, KEY);
    await expect(denied.requestJson(endpoint.url, { method: "POST", body: body("eth_call") }))
      .rejects.toMatchObject({ code: "PROVIDER_MONTHLY_BUDGET_EXCEEDED" });
    expect(inner.requestJson).toHaveBeenCalledTimes(1);
  });

  it("applies the read allowlist to the public development transport without a key", async () => {
    const env = loadEnv({ NODE_ENV: "test" });
    const inner: ProviderHttp = { requestJson: vi.fn(async () => ({})) };
    const transport = new RobinhoodRpcHttp(robinhoodRpcEndpoint(env), inner, createRobinhoodRpcSpendBudget(env));

    await transport.requestJson(env.ROBINHOOD_PUBLIC_RPC_URL, { method: "POST", body: body("eth_call") });
    expect(new Headers(vi.mocked(inner.requestJson).mock.calls[0]![1]?.headers).has("Drpc-Key")).toBe(false);
    await expect(transport.requestJson(env.ROBINHOOD_PUBLIC_RPC_URL, { method: "POST", body: body("eth_sendRawTransaction") }))
      .rejects.toMatchObject({ code: "PROVIDER_RPC_METHOD_NOT_ALLOWED" });
  });

  it("never retries a paid call, keeps quota denials non-retryable and keeps the key out of errors", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 10, message: "User balance exceeded" }), { status: 403 }))
      .mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const transport = createRobinhoodRpcHttp(drpcEnv({ PROVIDER_MAX_RETRIES: "2" }), {
      providerName: "test-rpc",
      client: { maxRetries: 3 }
    });

    const transient = await transport.requestJson("https://lb.drpc.live/robinhood", { method: "POST", body: body("eth_call") })
      .catch((error: unknown) => error);
    expect(transient).toMatchObject({ code: "PROVIDER_HTTP_503" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const exhausted = await transport.requestJson("https://lb.drpc.live/robinhood", { method: "POST", body: body("eth_call") })
      .catch((error: unknown) => error);
    expect(exhausted).toMatchObject({ code: "PROVIDER_HTTP_403", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const error of [transient, exhausted]) {
      expect(String(error)).not.toContain(KEY);
      expect(JSON.stringify(error)).not.toContain(KEY);
    }
    const [calledUrl] = fetchMock.mock.calls[1]!;
    expect(String(calledUrl)).toBe("https://lb.drpc.live/robinhood");
  });
});

describe("monthly dRPC compute-unit fuse", () => {
  it("does not meter the public development transport", async () => {
    const budget = createRobinhoodRpcSpendBudget(loadEnv({ NODE_ENV: "test" }));
    await expect(budget.reserve(1_000_000_000)).resolves.toBeUndefined();
  });

  it("denies units beyond the monthly limit and resets in the next UTC month", async () => {
    let now = new Date("2026-09-30T23:59:00.000Z");
    const budget = createRobinhoodRpcSpendBudget(drpcEnv({ DRPC_MONTHLY_CU_LIMIT: "100000" }), undefined, () => now);

    await budget.reserve(99_990);
    await expect(budget.reserve(20)).rejects.toMatchObject({ code: "PROVIDER_MONTHLY_BUDGET_EXCEEDED" });
    now = new Date("2026-10-01T00:00:00.000Z");
    await expect(budget.reserve(20)).resolves.toBeUndefined();
    await expect(budget.reserve(0)).rejects.toMatchObject({ code: "PROVIDER_MONTHLY_BUDGET_EXCEEDED" });
  });

  it("fails closed in production without Redis", async () => {
    const env = { ...drpcEnv(), NODE_ENV: "production" as const };
    await expect(createRobinhoodRpcSpendBudget(env).reserve(20)).rejects.toMatchObject({ code: "PROVIDER_SPEND_GUARD_UNAVAILABLE" });
  });

  it("reserves atomically in Redis under a monthly key that outlives the month", async () => {
    const evalMock = vi.fn().mockResolvedValue([20, 99_980]);
    const redis = { eval: evalMock } as unknown as Redis;
    const budget = createRobinhoodRpcSpendBudget(
      drpcEnv({ DRPC_MONTHLY_CU_LIMIT: "100000" }),
      redis,
      () => new Date("2026-09-25T12:00:00.000Z")
    );

    await budget.reserve(20);
    const [, keyCount, key, units, limit, ttl] = evalMock.mock.calls[0]!;
    expect(keyCount).toBe(1);
    expect(key).toBe("rh:rpc-spend:drpc:2026-09");
    expect([units, limit]).toEqual(["20", "100000"]);
    expect(Number(ttl)).toBeGreaterThan(5 * 86_400);
    expect(Number(ttl)).toBeLessThanOrEqual(7 * 86_400);
  });

  it("maps Redis denials and failures to closed, non-retryable errors", async () => {
    const denied: RpcSpendBudget = createRobinhoodRpcSpendBudget(drpcEnv(), { eval: vi.fn().mockResolvedValue([-1, 5]) } as unknown as Redis);
    await expect(denied.reserve(20)).rejects.toMatchObject({ code: "PROVIDER_MONTHLY_BUDGET_EXCEEDED", retryable: false });
    const broken = createRobinhoodRpcSpendBudget(drpcEnv(), { eval: vi.fn().mockRejectedValue(new Error("down")) } as unknown as Redis);
    await expect(broken.reserve(20)).rejects.toMatchObject({ code: "PROVIDER_SPEND_GUARD_UNAVAILABLE", retryable: false });
    const malformed = createRobinhoodRpcSpendBudget(drpcEnv(), { eval: vi.fn().mockResolvedValue("OK") } as unknown as Redis);
    await expect(malformed.reserve(20)).rejects.toMatchObject({ code: "PROVIDER_SPEND_GUARD_UNAVAILABLE" });
  });
});

describe("dRPC environment validation", () => {
  it("requires a well-formed key and chain 4663 when dRPC is selected", () => {
    expect(() => loadEnv({ NODE_ENV: "test", ROBINHOOD_RPC_PROVIDER: "drpc" })).toThrow(/DRPC_API_KEY/);
    expect(() => loadEnv({ NODE_ENV: "test", ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: "short" })).toThrow(/DRPC_API_KEY/);
    expect(() => loadEnv({ NODE_ENV: "test", ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: "has spaces in the key value" })).toThrow(/DRPC_API_KEY/);
    expect(() => drpcEnv({ ROBINHOOD_CHAIN_ID: "5042" })).toThrow(/4663/);
    expect(() => drpcEnv({ DRPC_ROBINHOOD_NETWORK: "Robinhood/../x" })).toThrow();
    expect(drpcEnv().DRPC_MONTHLY_CU_LIMIT).toBe(166_000_000);
  });

  it("requires dRPC for production chain reads and allows production with no chain reads", () => {
    const production = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://opsis.example",
      JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
      JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
      REDIS_URL: "rediss://cache.example.com",
      METRICS_TOKEN: "metrics-secret-at-least-32-characters"
    };
    expect(() => loadEnv(production)).toThrow(/admitted dRPC transport/);
    for (const flag of ["NETWORK_PULSE_ENABLED", "PORTFOLIO_MODE_ENABLED", "RWA_VERIFY_ENABLED", "EXIT_CHECK_ENABLED", "OBSERVED_TRADES_ENABLED"]) {
      expect(() => loadEnv({ ...production, PRIVATE_MODE_ENABLED: "false", [flag]: "true" })).toThrow(/admitted dRPC transport/);
    }
    expect(loadEnv({ ...production, PRIVATE_MODE_ENABLED: "false" }).ROBINHOOD_RPC_PROVIDER).toBe("robinhood-public");
    const admitted = loadEnv({
      ...production,
      ROBINHOOD_RPC_PROVIDER: "drpc",
      DRPC_API_KEY: KEY,
      OBSERVED_TRADES_ENABLED: "true",
      EXIT_CHECK_ENABLED: "true"
    });
    expect(robinhoodRpcEndpoint(admitted).id).toBe("drpc");
  });
});
