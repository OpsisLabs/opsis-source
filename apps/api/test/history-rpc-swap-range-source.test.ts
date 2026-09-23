import { describe, expect, it } from "vitest";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { OBSERVED_TRADES_SWAP_TOPIC } from "../src/market/observed-trades.js";
import { RpcSwapRangeSource, type RpcSwapRangeAdmission } from "../src/history/rpc-swap-range-source.js";
import type { SwapRangeRequest } from "../src/history/public-swap-capture.js";

const request: SwapRangeRequest = { chainId: 4663, poolAddress: `0x${"a".repeat(40)}`, fromBlock: 10n, toBlock: 11n, source: "test" };
const admission: RpcSwapRangeAdmission = { allowCompleteRangeLogs: true, documentedProviderLogCap: 101 };
const hash = (digit: string) => `0x${digit.repeat(64)}`;
const log = (overrides: Record<string, unknown> = {}) => ({
  address: request.poolAddress,
  blockNumber: "0xa",
  transactionIndex: "0x0",
  logIndex: "0x0",
  blockHash: hash("1"),
  transactionHash: hash("2"),
  topics: [OBSERVED_TRADES_SWAP_TOPIC, hash("3"), hash("4")],
  data: `0x${"0".repeat(320)}`,
  removed: false,
  ...overrides,
});

function mockRpc(handler: (method: string, params: unknown[], call: number) => unknown) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const http: ProviderHttp = { async requestJson(_url, init) {
    const body = JSON.parse(String(init?.body)) as { id: string; method: string; params: unknown[] };
    calls.push({ method: body.method, params: body.params });
    return { jsonrpc: "2.0", id: body.id, result: handler(body.method, body.params, calls.length) };
  } };
  return { http, calls };
}

function source(http: ProviderHttp, gate: RpcSwapRangeAdmission = { allowCompleteRangeLogs: false, documentedProviderLogCap: 0 }) {
  return new RpcSwapRangeSource(http, "https://fixture.invalid", gate);
}
function header(number: string, blockHash = hash("1"), timestamp = "0x64") { return { number, hash: blockHash, timestamp }; }

describe("RpcSwapRangeSource", () => {
  it("stays disabled by default without making a network call", async () => {
    let calls = 0;
    const http: ProviderHttp = { async requestJson() { calls += 1; return {}; } };
    await expect(source(http).scan(request)).resolves.toEqual({ state: "unavailable" });
    await expect(source(http, { allowCompleteRangeLogs: true, documentedProviderLogCap: 100 }).scan(request)).resolves.toEqual({ state: "unavailable" });
    expect(calls).toBe(0);
  });

  it("rejects an invalid source slug before making a network call", async () => {
    let calls = 0;
    const http: ProviderHttp = { async requestJson() { calls += 1; return {}; } };
    await expect(source(http, admission).scan({ ...request, source: "bad source" })).resolves.toEqual({ state: "gap" });
    expect(calls).toBe(0);
  });

  it("returns one validated log with header-derived timestamp and rechecked anchor", async () => {
    const { http, calls } = mockRpc((method, params, call) => {
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_getLogs") return [log()];
      if (method === "eth_getBlockByNumber") return header(params[0] as string, hash("1"), "0x64");
      throw new Error("unexpected method");
    });
    const result = await source(http, admission).scan(request);
    expect(result.state).toBe("complete");
    if (result.state === "complete") {
      expect(result.toBlockHash).toBe(hash("1"));
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]?.blockTimestamp.toISOString()).toBe("1970-01-01T00:01:40.000Z");
    }
    expect(calls.map((call) => call.method)).toEqual(["eth_chainId", "eth_getBlockByNumber", "eth_getLogs", "eth_getBlockByNumber", "eth_getBlockByNumber"]);
    expect(calls[2]?.params).toEqual([{ address: request.poolAddress, fromBlock: "0xa", toBlock: "0xb", topics: [OBSERVED_TRADES_SWAP_TOPIC] }]);
  });

  it("validates empty ranges and still rechecks the exact anchor", async () => {
    const { http, calls } = mockRpc((method, params) => method === "eth_chainId" ? "0x1237"
      : method === "eth_getLogs" ? [] : header(params[0] as string, hash("5")));
    await expect(source(http, admission).scan(request)).resolves.toEqual({ state: "complete", toBlockHash: hash("5"), logs: [] });
    expect(calls.map((call) => call.method)).toEqual(["eth_chainId", "eth_getBlockByNumber", "eth_getLogs", "eth_getBlockByNumber"]);
  });

  it("returns a gap for a wrong chain or changed anchor", async () => {
    const wrong = mockRpc((method, params) => method === "eth_chainId" ? "0x1" : header(params[0] as string));
    await expect(source(wrong.http, admission).scan(request)).resolves.toEqual({ state: "gap" });
    const changed = mockRpc((method, params, call) => method === "eth_chainId" ? "0x1237"
      : method === "eth_getLogs" ? [] : header(params[0] as string, call === 4 ? hash("1") : hash("9")));
    await expect(source(changed.http, admission).scan(request)).resolves.toEqual({ state: "gap" });
  });

  it("rejects malformed logs, headers, removed logs, and duplicate positions", async () => {
    const cases = [
      { logs: [log({ address: `0x${"b".repeat(40)}` })], headerValue: header("0xa") },
      { logs: [log({ removed: true })], headerValue: header("0xa") },
      { logs: [log({ blockNumber: "0xc" })], headerValue: header("0xa") },
      { logs: [log({ logIndex: "0x0" }), log({ logIndex: "0x1", blockHash: hash("9"), transactionHash: hash("8") })], headerValue: header("0xa") },
      { logs: [log(), log({ transactionHash: hash("8") })], headerValue: header("0xa") },
      { logs: [log()], headerValue: { number: "0x9", hash: hash("1"), timestamp: "0x64" } },
      { logs: [log()], headerValue: { number: "0xa", hash: "bad", timestamp: "0x64" } },
      { logs: [log(), log()], headerValue: header("0xa") },
    ];
    for (const sample of cases) {
      const { http } = mockRpc((method, params) => method === "eth_chainId" ? "0x1237"
        : method === "eth_getLogs" ? sample.logs : sample.headerValue);
      await expect(source(http, admission).scan(request)).resolves.toEqual({ state: "gap" });
    }
  });

  it("returns unavailable on provider failure and gap at the hard response cap", async () => {
    const failing: ProviderHttp = { async requestJson() { throw new Error("private provider detail"); } };
    await expect(source(failing, admission).scan(request)).resolves.toEqual({ state: "unavailable" });
    const capped = mockRpc((method, params) => method === "eth_chainId" ? "0x1237"
      : method === "eth_getBlockByNumber" ? header(params[0] as string)
        : Array.from({ length: 100 }, (_, index) => log({ logIndex: `0x${index.toString(16)}` })));
    await expect(source(capped.http, admission).scan(request)).resolves.toEqual({ state: "gap" });
  });

  it("checks JSON-RPC ids and errors and never reports an RPC error as empty", async () => {
    const badResponse: ProviderHttp = { async requestJson(_url, init) {
      const body = JSON.parse(String(init?.body)) as { id: string };
      return { jsonrpc: "2.0", id: `${body.id}-wrong`, result: [] };
    } };
    await expect(source(badResponse, admission).scan(request)).resolves.toEqual({ state: "unavailable" });
    const rpcError: ProviderHttp = { async requestJson(_url, init) {
      const body = JSON.parse(String(init?.body)) as { id: string };
      return { jsonrpc: "2.0", id: body.id, error: { code: -32005, message: "rate limited" } };
    } };
    await expect(source(rpcError, admission).scan(request)).resolves.toEqual({ state: "unavailable" });
  });
});
