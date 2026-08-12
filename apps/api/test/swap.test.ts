import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonCache } from "../src/cache/service.js";
import { ProviderRequestError, type ProviderHttp } from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { swapRoutes } from "../src/routes/swaps.js";
import { PREVIEW_SWAPPER, SCOUT_SWAP_TOKENS } from "../src/swap/constants.js";
import {
  ScoutSwapService,
  SwapQuoteProviderError,
  UniswapQuoteSource,
  normalizeQuote,
  type SwapQuoteSource
} from "../src/swap/service.js";

const apps: Array<ReturnType<typeof Fastify>> = [];
const quotedAt = Date.parse("2026-08-07T12:00:00.000Z");

function classicQuote(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "uniswap-request-1",
    routing: "CLASSIC",
    isTokenApprovalApplicable: true,
    permitData: null,
    quote: {
      input: { amount: "10000000000000000", token: SCOUT_SWAP_TOKENS.WETH.address },
      output: {
        amount: "36450000",
        minimumAmount: "36267750",
        token: SCOUT_SWAP_TOKENS.USDG.address,
        recipient: PREVIEW_SWAPPER
      },
      routeString: "100% · WETH → USDG · v4 0.05%",
      route: [[{ type: "v4-pool" }]],
      priceImpact: 0.04,
      gasFee: "12000000000000",
      gasFeeUSD: "0.04",
      ...overrides
    }
  };
}

function enabledEnv() {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    UNISWAP_QUOTE_ENABLED: "true",
    UNISWAP_API_KEY: "private-uniswap-key"
  });
}

async function quoteApp(source: SwapQuoteSource, enabled = true) {
  const app = Fastify({ logger: false });
  apps.push(app);
  installErrorHandler(app);
  const env = enabled ? enabledEnv() : loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" });
  await swapRoutes(app, env, new JsonCache(undefined, 15), source);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Scout Swap quote route", () => {
  it("returns a sanitized, fresh, read-only WETH/USDG preview and caches repeats", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue(classicQuote()) };
    const app = await quoteApp(source);
    const payload = { direction: "WETH_TO_USDG", amount: "0.01" };

    const first = await app.inject({ method: "POST", url: "/v1/swaps/quote", payload });
    const second = await app.inject({ method: "POST", url: "/v1/swaps/quote", payload });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      pair: "WETH/USDG",
      chain: { id: 4663, name: "Robinhood Chain" },
      input: { symbol: "WETH", amount: "0.01" },
      output: {
        symbol: "USDG",
        address: SCOUT_SWAP_TOKENS.USDG.address,
        amount: "36.45",
        minimumReceived: "36.26775",
        minimumSource: "provider"
      },
      route: { routing: "CLASSIC", protocols: ["V4"] },
      priceImpactPercent: 0.04,
      simulation: { status: "passed", reasons: [] },
      transactionPreview: { explanationOnly: true, unsigned: true, canSign: false, canBroadcast: false },
      provider: { name: "Uniswap", cached: false }
    });
    expect(first.json().handoffUrl).toContain("https://app.uniswap.org/swap?chain=robinhood&");
    expect(first.headers["cache-control"]).toBe("private, no-store");
    expect(Date.parse(first.json().expiresAt) - Date.parse(first.json().quotedAt)).toBe(30_000);
    expect(first.json().freshForMs).toBe(30_000);
    expect(second.json().provider.cached).toBe(true);
    expect(source.requestQuote).toHaveBeenCalledTimes(1);
    expect(first.body).not.toContain("private-uniswap-key");
    expect(first.body).not.toContain('"data"');
    expect(first.body).not.toContain("signTransaction");
    expect(first.body).not.toContain("sendTransaction");
  });

  it("canonicalizes equivalent input for one cache entry without truncating token precision", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue(classicQuote()) };
    const app = await quoteApp(source);
    const padded = await app.inject({ method: "POST", url: "/v1/swaps/quote", payload: { direction: "WETH_TO_USDG", amount: "0.0100" } });
    const canonical = await app.inject({ method: "POST", url: "/v1/swaps/quote", payload: { direction: "WETH_TO_USDG", amount: "0.01" } });
    expect(padded.statusCode).toBe(200);
    expect(padded.json().input.amount).toBe("0.01");
    expect(padded.json().handoffUrl).toContain("value=0.01");
    expect(canonical.json().provider.cached).toBe(true);
    expect(source.requestQuote).toHaveBeenCalledTimes(1);
    expect(source.requestQuote).toHaveBeenCalledWith({ direction: "WETH_TO_USDG", amount: "0.01" });
  });

  it("fails closed when disabled and maps no-route and malformed provider responses", async () => {
    const disabled = await quoteApp({ requestQuote: vi.fn() }, false);
    const off = await disabled.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "WETH_TO_USDG", amount: "1" }
    });
    expect(off.statusCode).toBe(503);
    expect(off.json().error.code).toBe("SCOUT_SWAP_DISABLED");

    const noRoute = await quoteApp({ requestQuote: vi.fn().mockRejectedValue(new SwapQuoteProviderError("no_route")) });
    const missing = await noRoute.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "WETH_TO_USDG", amount: "1" }
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe("SWAP_NO_ROUTE");

    const malformed = await quoteApp({ requestQuote: vi.fn().mockResolvedValue({ not: "a quote" }) });
    const bad = await malformed.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "WETH_TO_USDG", amount: "1" }
    });
    expect(bad.statusCode).toBe(503);
    expect(bad.json().error.code).toBe("SWAP_PROVIDER_MALFORMED_RESPONSE");

    const unavailable = await quoteApp({ requestQuote: vi.fn().mockRejectedValue(new SwapQuoteProviderError("unavailable")) });
    const outage = await unavailable.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "WETH_TO_USDG", amount: "1" }
    });
    expect(outage.statusCode).toBe(503);
    expect(outage.json().error.code).toBe("SWAP_PROVIDER_UNAVAILABLE");
  });

  it("rejects precision beyond the selected token decimals", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue(classicQuote()) };
    const app = await quoteApp(source);
    const response = await app.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "USDG_TO_WETH", amount: "1.0000001" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SWAP_REQUEST");
    expect(source.requestQuote).not.toHaveBeenCalled();
  });

  it("rejects wallet transmission at the public quote boundary", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue(classicQuote()) };
    const app = await quoteApp(source);
    const response = await app.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: {
        direction: "WETH_TO_USDG",
        amount: "0.01",
        swapper: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(source.requestQuote).not.toHaveBeenCalled();
  });

  it.each([
    "transactionHash",
    "calldata",
    "decodedInput",
    "checkout",
    "orderId",
    "historicalAmount",
    "walletAddress"
  ])("rejects historical or execution field %s at the strict quote boundary", async (field) => {
    const source = { requestQuote: vi.fn().mockResolvedValue(classicQuote()) };
    const app = await quoteApp(source);
    const response = await app.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "WETH_TO_USDG", amount: "0.01", [field]: "must-not-pass" }
    });
    expect(response.statusCode).toBe(400);
    expect(source.requestQuote).not.toHaveBeenCalled();
  });

  it("normalizes the reverse USDG to WETH direction", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue({
      requestId: "reverse-quote",
      routing: "CLASSIC",
      isTokenApprovalApplicable: true,
      quote: {
        input: { amount: "1000000", token: SCOUT_SWAP_TOKENS.USDG.address },
        output: {
          amount: "532000000000000",
          minimumAmount: "529340000000000",
          token: SCOUT_SWAP_TOKENS.WETH.address
        },
        route: [[{ type: "v4-pool" }]],
        gasFee: "12000000000000"
      }
    }) };
    const app = await quoteApp(source);
    const response = await app.inject({
      method: "POST",
      url: "/v1/swaps/quote",
      payload: { direction: "USDG_TO_WETH", amount: "1" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      input: { symbol: "USDG", amount: "1" },
      output: { symbol: "WETH", amount: "0.000532", minimumReceived: "0.00052934" }
    });
    expect(response.json().handoffUrl).toContain(`inputCurrency=${SCOUT_SWAP_TOKENS.USDG.address}`);
  });

  it("preserves an exact eighteen-decimal WETH output instead of rounding it to zero", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue({
      requestId: "small-reverse-quote",
      routing: "CLASSIC",
      quote: {
        input: { amount: "1000000", token: SCOUT_SWAP_TOKENS.USDG.address },
        output: { amount: "1", minimumAmount: "1", token: SCOUT_SWAP_TOKENS.WETH.address },
        route: [[{ type: "v4-pool" }]],
      },
    }) };
    const app = await quoteApp(source);
    const response = await app.inject({ method: "POST", url: "/v1/swaps/quote", payload: { direction: "USDG_TO_WETH", amount: "1" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().output).toMatchObject({
      amount: "0.000000000000000001",
      minimumReceived: "0.000000000000000001",
    });
  });
});

describe("Uniswap quote safety", () => {
  it("keeps transaction execution and provider credentials out of the browser feature", () => {
    const featureSource = [
      new URL("../src/swap/service.ts", import.meta.url),
      new URL("../../web/src/pages/ScoutSwap.tsx", import.meta.url),
      new URL("../../web/src/swap/api.ts", import.meta.url)
    ].map((url) => readFileSync(url, "utf8")).join("\n");
    const browserSource = [
      new URL("../../web/src/pages/ScoutSwap.tsx", import.meta.url),
      new URL("../../web/src/swap/api.ts", import.meta.url)
    ].map((url) => readFileSync(url, "utf8")).join("\n");

    expect(featureSource).not.toMatch(/signTransaction|sendTransaction|eth_sendRawTransaction|wallet_sendCalls/);
    expect(browserSource).not.toContain("UNISWAP_API_KEY");
    expect(browserSource).not.toContain("x-api-key");
    expect(browserSource).not.toContain("swapper");
  });

  it("accepts the official singular simulation failure field as a preview warning", () => {
    const raw = classicQuote({
      output: { amount: "1000000", minimumAmount: "995000", token: SCOUT_SWAP_TOKENS.USDG.address },
      txFailureReason: "SIMULATION_UNAVAILABLE",
      priceImpact: undefined
    });
    const quote = normalizeQuote(raw, { direction: "WETH_TO_USDG", amount: "0.01" }, quotedAt);
    expect(quote.output.minimumReceived).toBe("0.995");
    expect(quote.simulation).toEqual({ status: "warning", reasons: ["SIMULATION_UNAVAILABLE"] });
    expect(quote.priceImpactPercent).toBeNull();
  });

  it("fails closed on unsupported routes, amount mismatches, and invalid minimums", () => {
    expect(() => normalizeQuote(
      { ...classicQuote(), routing: "BRIDGE" },
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    )).toThrowError(SwapQuoteProviderError);
    expect(() => normalizeQuote(
      classicQuote({ input: { amount: "20000000000000000", token: SCOUT_SWAP_TOKENS.WETH.address } }),
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    )).toThrowError(SwapQuoteProviderError);
    expect(() => normalizeQuote(
      classicQuote({ output: { amount: "1000000", minimumAmount: "1000001", token: SCOUT_SWAP_TOKENS.USDG.address } }),
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    )).toThrowError(SwapQuoteProviderError);
    expect(() => normalizeQuote(
      { ...classicQuote({ output: { amount: "1000000", token: SCOUT_SWAP_TOKENS.USDG.address } }), routing: "DUTCH_V3" },
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    )).toThrowError(SwapQuoteProviderError);
    expect(() => normalizeQuote(
      classicQuote({ output: { amount: "9".repeat(79), minimumAmount: "1", token: SCOUT_SWAP_TOKENS.USDG.address } }),
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    )).toThrowError(SwapQuoteProviderError);
  });

  it("derives and labels a CLASSIC preview floor when the optional provider minimum is absent", () => {
    const quote = normalizeQuote(
      classicQuote({ output: { amount: "1000000", token: SCOUT_SWAP_TOKENS.USDG.address } }),
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    );
    expect(quote.output).toMatchObject({ minimumReceived: "0.995", minimumSource: "derived_tolerance" });
  });

  it("does not relabel a classic-route comparator as UniswapX user cost", () => {
    const quote = normalizeQuote(
      { ...classicQuote({ gasFee: undefined, gasFeeUSD: undefined, classicGasUseEstimateUSD: "9.99" }), routing: "DUTCH_V3" },
      { direction: "WETH_TO_USDG", amount: "0.01" },
      quotedAt
    );
    expect(quote.estimatedGas).toEqual({ nativeAmount: null, usdAmount: null, paidBy: "filler_or_user" });
  });

  it("uses a fixed non-user address for provider quotes", async () => {
    const requestJson = vi.fn().mockResolvedValue(classicQuote());
    const source = new UniswapQuoteSource(enabledEnv(), { requestJson }, () => quotedAt);
    await source.requestQuote({ direction: "WETH_TO_USDG", amount: "0.01" });
    const options = requestJson.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(options.body)).toMatchObject({ swapper: PREVIEW_SWAPPER });
  });

  it("pauses immediately after the first upstream 429 instead of retrying", async () => {
    const requestJson = vi.fn().mockRejectedValue(new ProviderRequestError("PROVIDER_HTTP_429", true));
    const http: ProviderHttp = { requestJson };
    const source = new UniswapQuoteSource(enabledEnv(), http, () => quotedAt);
    const request = { direction: "WETH_TO_USDG" as const, amount: "0.01" };

    await expect(source.requestQuote(request)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(source.requestQuote(request)).rejects.toMatchObject({ code: "rate_limited" });
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it("coalesces simultaneous identical requests into one provider call", async () => {
    const source = { requestQuote: vi.fn().mockResolvedValue(classicQuote()) };
    const service = new ScoutSwapService(enabledEnv(), new JsonCache(undefined, 15), source, () => quotedAt);
    const request = { direction: "WETH_TO_USDG" as const, amount: "0.01" };
    const [first, second] = await Promise.all([service.quote(request), service.quote(request)]);
    expect(first).toEqual(second);
    expect(source.requestQuote).toHaveBeenCalledTimes(1);
  });
});
