import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { loadEnv } from "../src/config/env.js";
import { JsonCache } from "../src/cache/service.js";
import { ProviderRequestError } from "../src/chain/provider-http.js";
import { RobinhoodRpcHttp, robinhoodRpcEndpoint } from "../src/chain/robinhood-rpc.js";
import { createExitCheckBudget } from "../src/exit-check/budget.js";
import { factoryAbi, poolAbi, quoterAbi } from "../src/exit-check/service.js";
import { MIN_SQRT_RATIO, MAX_SQRT_RATIO, isBoundarySqrtPrice } from "../src/exit-check/math.js";
import { UNISWAP_QUOTER_V2, UNISWAP_V3_FACTORY } from "../src/exit-check/constants.js";
import { chainlinkAbi, ethUsdFeed } from "../src/rwa/chainlink.js";
import { installErrorHandler } from "../src/http/errors.js";
import { swapRoutes } from "../src/routes/swaps.js";
import { OnchainQuoteSource } from "../src/swap/onchain.js";
import { SWAP_PREVIEW_TOKENS } from "../src/swap/constants.js";
import { normalizeQuote, SwapPreviewService } from "../src/swap/service.js";

const time = Date.parse("2026-10-20T12:00:00.000Z");
const seconds = BigInt(time / 1000);
const block = "0x1234";
const hash = `0x${"ab".repeat(32)}`;
const Q96 = 1n << 96n;
const request = { direction: "WETH_TO_USDG" as const, amount: "0.01" };
const env = (extra: Record<string, string> = {}) => loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", UNISWAP_QUOTE_ENABLED: "true", ...extra });
type RpcCall = { id: string; method: string; params: unknown[] };
type Options = { missing?: boolean; boundary?: number[]; failedQuote?: number[]; reorg?: boolean; staleFeed?: boolean; staleBlock?: boolean; failedDiscovery?: boolean; malformedBatch?: boolean; chain?: string };
function rpcFixture(options: Options = {}) {
  const calls: RpcCall[] = [];
  const pool = (fee: number) => `0x${fee.toString(16).padStart(40, "0")}` as Hex;
  const handle = (call: RpcCall): unknown => {
    calls.push(call);
    if (call.method === "eth_chainId") return options.chain ?? "0x1237";
    if (call.method === "eth_gasPrice") return "0x3b9aca00";
    if (call.method === "eth_getBlockByNumber") return { number: block,
      hash: options.reorg && call.params[0] === block ? `0x${"cd".repeat(32)}` : hash,
      timestamp: `0x${(seconds - (options.staleBlock ? 60n : 0n)).toString(16)}` };
    if (call.method !== "eth_call") throw new Error("unexpected method");
    const { to, data } = call.params[0] as { to: string; data: Hex };
    if (to.toLowerCase() === UNISWAP_V3_FACTORY) {
      if (options.failedDiscovery) throw new Error("fixture revert");
      const decoded = decodeFunctionData({ abi: factoryAbi, data });
      const fee = decoded.args[2];
      return encodeFunctionResult({ abi: factoryAbi, functionName: "getPool", result: options.missing || fee === 10000 ? `0x${"0".repeat(40)}` : pool(fee) });
    }
    if (to.toLowerCase() === UNISWAP_QUOTER_V2) {
      const decoded = decodeFunctionData({ abi: quoterAbi, data });
      const { amountIn, fee } = decoded.args[0];
      if (options.failedQuote?.includes(fee)) throw new Error("fixture revert");
      return encodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", result: [amountIn * BigInt(fee === 500 ? 90 : fee === 100 ? 88 : 85) / 100n,
        options.boundary?.includes(fee) ? MIN_SQRT_RATIO + 1n : Q96, 1, 100000n] });
    }
    if (to.toLowerCase() === ethUsdFeed.proxyAddress) {
      const decoded = decodeFunctionData({ abi: chainlinkAbi, data });
      if (decoded.functionName === "description") return encodeFunctionResult({ abi: chainlinkAbi, functionName: "description", result: "ETH / USD" });
      if (decoded.functionName === "decimals") return encodeFunctionResult({ abi: chainlinkAbi, functionName: "decimals", result: 8 });
      return encodeFunctionResult({ abi: chainlinkAbi, functionName: "latestRoundData", result: [1n, 2000n * 100000000n, seconds, seconds - (options.staleFeed ? 86401n : 5n), 1n] });
    }
    return encodeFunctionResult({ abi: poolAbi, functionName: "slot0", result: [Q96, 0, 0, 1, 1, 0, true] });
  };
  const requestJson = vi.fn(async (_url: string, init?: RequestInit): Promise<unknown> => {
    const reads = JSON.parse(String(init?.body)) as RpcCall[];
    const response = reads.map((call) => {
      try { return { jsonrpc: "2.0", id: call.id, result: handle(call) }; }
      catch { return { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: "fixture revert" } }; }
    });
    // JSON-RPC batch response order must not matter.
    return options.malformedBatch ? [...response.slice(1), response[1]] : response.reverse();
  });
  return { rpc: { requestJson }, calls, pool };
}
async function quote(options: Options = {}, overrides = {}) {
  const fixture = rpcFixture(options);
  const config = env(overrides);
  const budget = { consume: vi.fn().mockResolvedValue(undefined) };
  const source = new OnchainQuoteSource(config, { rpc: fixture.rpc, budget, now: () => time });
  return { result: normalizeQuote(await source.requestQuote(request), request, time), fixture, budget };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("official on-chain swap quotes", () => {
  it("refuses both QuoterV2 default limits one unit inside the absolute bounds", () => {
    expect(isBoundarySqrtPrice(MIN_SQRT_RATIO + 1n)).toBe(true);
    expect(isBoundarySqrtPrice(MAX_SQRT_RATIO - 1n)).toBe(true);
    expect(isBoundarySqrtPrice(Q96)).toBe(false);
  });
  it("compares existing fee tiers, skips a missing pool and selects the best output", async () => {
    const { result, fixture, budget } = await quote();
    expect(result.route).toEqual({ routing: "CLASSIC", label: "Uniswap v3 · single pool (fee 0.05%)", protocols: ["V3"] });
    expect(result.onchain).toMatchObject({ blockNumber: 4660, poolAddress: fixture.pool(500), feeTier: 500, lpFeeAmount: "0.000005" });
    expect(result.output).toMatchObject({ amount: "9000000000", minimumReceived: "8955000000", minimumSource: "derived_tolerance" });
    expect(result.priceImpactPercent).toBe(10);
    expect(fixture.calls.filter((call) => call.method === "eth_call" && (call.params[0] as { to: string }).to === UNISWAP_QUOTER_V2)).toHaveLength(3);
    expect(budget.consume.mock.calls.reduce((sum, [units]) => sum + Number(units), 0)).toBe(fixture.calls.length);
    expect(result.simulation.status).toBe("warning");
    expect(result.transactionPreview).toMatchObject({ canSign: false, canBroadcast: false, sender: null });
    expect(result.handoffUrl).toContain("https://app.uniswap.org/swap?");
    expect(result.disclosures.join(" ")).toContain("Single-pool estimate. Uniswap's app may route differently and show a different price.");
    expect(result.disclosures.join(" ")).toContain("Quote at block 4660");
    expect(JSON.stringify(result)).not.toMatch(/\bfree\b|免费/i);
  });

  it("discloses the user's network estimate in ETH and USD from the anchored Chainlink fixture", async () => {
    const { result } = await quote();
    expect(result.estimatedGas).toEqual({ nativeAmount: "0.0001", usdAmount: "0.2", paidBy: "user" });
    expect(result.onchain).toMatchObject({ gasEstimate: "100000", gasPriceWei: "1000000000", ethUsd: "2000" });
    expect(result.disclosures.join(" ")).toMatch(/estimate you pay/);
    expect(result.disclosures.join(" ")).toMatch(/gas price observed at quote time/);
  });

  it("pins every pool and feed read to the anchor and rechecks its hash", async () => {
    const { fixture } = await quote();
    expect(fixture.rpc.requestJson).toHaveBeenCalledTimes(4);
    for (const read of fixture.calls.filter((call) => call.method === "eth_call")) expect(read.params[1]).toBe(block);
    expect(fixture.calls.filter((call) => call.method === "eth_getBlockByNumber").map((call) => call.params)).toEqual([["latest", false], [block, false]]);
    // These metadata methods do not accept historical block parameters.
    expect(fixture.calls.find((call) => call.method === "eth_gasPrice")?.params).toEqual([]);
  });

  it.each(["ETH_TO_USDG", "USDG_TO_ETH"] as const)("labels WETH substitution for %s without changing the allowed handoff", async (direction) => {
    const fixture = rpcFixture();
    const source = new OnchainQuoteSource(env(), { rpc: fixture.rpc, now: () => time });
    const req = { direction, amount: "0.01" };
    const result = normalizeQuote(await source.requestQuote(req), req, time);
    expect(result.onchain?.nativeSide).toBe(direction === "ETH_TO_USDG" ? "input" : "output");
    expect(result.disclosures.join(" ")).toContain("estimated using WETH pools");
    expect(result.handoffUrl).toContain(SWAP_PREVIEW_TOKENS.WETH.address);
    for (const read of fixture.calls.filter((call) => call.method === "eth_call" && (call.params[0] as { to: string }).to === UNISWAP_QUOTER_V2)) {
      const decoded = decodeFunctionData({ abi: quoterAbi, data: (read.params[0] as { data: Hex }).data });
      const token = direction === "ETH_TO_USDG" ? decoded.args[0].tokenIn : decoded.args[0].tokenOut;
      expect(token.toLowerCase()).toBe(SWAP_PREVIEW_TOKENS.WETH.address.toLowerCase());
    }
  });

  it("uses the user's slippage and isolates cache entries by tolerance", async () => {
    const fixture = rpcFixture();
    const config = env();
    const source = new OnchainQuoteSource(config, { rpc: fixture.rpc, now: () => time });
    const service = new SwapPreviewService(config, new JsonCache(undefined, 15), source, () => time);
    const first = await service.quote({ ...request, slippageTolerancePercent: 1 });
    const second = await service.quote(request);
    expect(first.output.minimumReceived).toBe("8910000000");
    expect(second.output.minimumReceived).toBe("8955000000");
    expect(fixture.rpc.requestJson).toHaveBeenCalledTimes(8);
    await expect(service.quote({ ...request, slippageTolerancePercent: 0.001 })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("excludes a better boundary result and selects the next successful pool", async () => {
    const { result } = await quote({ boundary: [500] });
    expect(result.onchain?.feeTier).toBe(100);
  });
  it.each([
    [{ missing: true }, "no_route"],
    [{ boundary: [100, 500, 3000] }, "no_route"],
    [{ failedQuote: [100, 500, 3000] }, "no_route"],
    [{ failedDiscovery: true }, "unavailable"],
    [{ reorg: true }, "unavailable"],
    [{ staleBlock: true }, "unavailable"],
    [{ chain: "0x1" }, "unavailable"],
    [{ staleFeed: true }, "malformed_response"],
    [{ malformedBatch: true }, "malformed_response"],
  ] as const)("fails closed for %o", async (options, code) => {
    await expect(quote(options)).rejects.toMatchObject({ code });
  });

  it("reserves every RPC read in the existing daily and monthly provider budgets", async () => {
    const config = env({ ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: "fixture-drpc-key-0001" });
    const fixture = rpcFixture();
    const reserve = vi.fn().mockResolvedValue(undefined);
    const rpc = new RobinhoodRpcHttp(robinhoodRpcEndpoint(config), fixture.rpc, { reserve });
    await new OnchainQuoteSource(config, { rpc, now: () => time }).requestQuote(request);
    expect(reserve.mock.calls.reduce((sum, [units]) => sum + Number(units), 0)).toBe(fixture.calls.length * 20);
  });

  it.each(["daily", "monthly", "per-request", "per-minute"])("refuses exhausted %s budgets before additional dispatch", async (kind) => {
    const config = env({ EXIT_CHECK_MAX_RPC_SUBCALLS: kind === "per-request" ? "4" : "24", EXIT_CHECK_DAILY_RPC_UNIT_BUDGET: "100", UNISWAP_QUOTE_BUDGET_PER_MINUTE: "1" });
    const fixture = rpcFixture();
    const rpc = kind === "monthly" ? new RobinhoodRpcHttp(robinhoodRpcEndpoint(config), fixture.rpc, { reserve: async () => { throw new ProviderRequestError("PROVIDER_MONTHLY_BUDGET_EXCEEDED", false); } }) : fixture.rpc;
    const budget = kind === "daily" ? createExitCheckBudget(config) : { consume: async () => undefined };
    if (kind === "daily") await budget.consume(97);
    const source = new OnchainQuoteSource(config, { rpc, budget, now: () => time });
    if (kind === "per-minute") await source.requestQuote(request);
    const count = fixture.rpc.requestJson.mock.calls.length;
    await expect(source.requestQuote(request)).rejects.toMatchObject({ code: "rate_limited" });
    expect(fixture.rpc.requestJson.mock.calls.length).toBeLessThanOrEqual(count + (kind === "daily" || kind === "per-request" ? 1 : 0));
  });

  it("uses the configured on-chain source without an API key on both quote routes", async () => {
    const fixture = rpcFixture();
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => new Response(JSON.stringify(await fixture.rpc.requestJson("fixture", init)), { status: 200 })));
    vi.spyOn(Date, "now").mockReturnValue(time);
    const app = Fastify();
    installErrorHandler(app);
    await swapRoutes(app, env({ TRADE_SIMULATOR_ENABLED: "true" }), new JsonCache(undefined, 15));
    try {
      for (const [index, url] of ["/v1/swaps/quote", "/v1/private/trade-simulator/quote"].entries()) {
        const response = await app.inject({ method: "POST", url, payload: { ...request, amount: index ? "0.02" : "0.01" } });
        expect(response.statusCode).toBe(200);
        expect(response.json().onchain.poolAddress).toBe(fixture.pool(500));
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    } finally { await app.close(); vi.restoreAllMocks(); }
  });

  it("keeps the configured Trade API source available to both routes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      requestId: "fixture-api", routing: "CLASSIC", quote: {
        input: { amount: "10000000000000000", token: SWAP_PREVIEW_TOKENS.WETH.address },
        output: { amount: "19800000", minimumAmount: "19701000", token: SWAP_PREVIEW_TOKENS.USDG.address },
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = Fastify();
    installErrorHandler(app);
    const config = env({ TRADE_SIMULATOR_ENABLED: "true", SWAP_QUOTE_SOURCE: "uniswap-api", UNISWAP_API_KEY: "fixture-api-key" });
    await swapRoutes(app, config, new JsonCache(undefined, 15));
    try {
      for (const url of ["/v1/swaps/quote", "/v1/private/trade-simulator/quote"]) {
        const response = await app.inject({ method: "POST", url, payload: request });
        expect(response.statusCode).toBe(200);
        expect(response.json().onchain).toBeUndefined();
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`${config.UNISWAP_API_BASE_URL}/quote`);
    } finally { await app.close(); }
  });
});
