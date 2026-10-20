import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult, type Abi } from "viem";
import { ProviderRequestError, type ProviderHttp } from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import type { RwaBudget } from "../src/rwa/budget.js";
import { RwaService } from "../src/rwa/service.js";
import { rwaRoutes } from "../src/routes/rwa.js";
import { buildApp } from "../src/app.js";

const STOCK = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9";
const VAULT = "0xbeeff033f34c046626b8d0a041844c5d1a5409dd";
const ASSET = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const UNKNOWN = "0x1111111111111111111111111111111111111111";
const UID = `0x${"12".repeat(32)}` as const;
const BLOCK_HASH = `0x${"ab".repeat(32)}`;
const FEED = "0x6b22a786baa607d76728168703a39ea9c99f2cd0";
const NOW = new Date("2026-08-11T12:00:00.000Z");
const apps: Array<ReturnType<typeof Fastify>> = [];

const testEnv = (enabled = true, rpcUrl = "https://rpc.mainnet.chain.robinhood.com") => loadEnv({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  RWA_VERIFY_ENABLED: String(enabled),
  ROBINHOOD_PUBLIC_RPC_URL: rpcUrl,
  RWA_MAX_RPC_SUBCALLS: "24"
});

afterEach(async () => { while (apps.length) await apps.pop()?.close(); });

describe("RWA evidence inspector", () => {
  it("keeps keyed RPC endpoint details out of citations while using the configured destination", async () => {
    const configuredUrl = "https://rpc.mainnet.chain.robinhood.com/secret-route/private-key?api_key=do-not-expose";
    const { http, rpc } = stockFixtures();
    const result = await new RwaService(testEnv(true, configuredUrl), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);

    const citation = result.sources.find((item) => item.id === "robinhood-rpc");
    expect(citation).toMatchObject({ url: "https://rpc.mainnet.chain.robinhood.com", fetchedAt: result.anchor.capturedAt });
    expect(JSON.stringify(result)).not.toContain("secret-route");
    expect(JSON.stringify(result)).not.toContain("do-not-expose");
    const outboundCalls = (rpc.requestJson as ReturnType<typeof vi.fn>).mock.calls;
    expect(outboundCalls.length).toBeGreaterThan(0);
    expect(outboundCalls.every(([url]) => url === configuredUrl)).toBe(true);
  });

  it("requires exact deployment + UID identity and never double-applies the multiplier", async () => {
    const { http, rpc } = stockFixtures();
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);

    expect(result.kind).toBe("stock_token");
    expect(result.headline).toContain("canonical Robinhood Stock Token");
    expect(result.stock).toMatchObject({
      uid: UID,
      symbol: "AAPL",
      currentMultiplier: "1",
      oraclePaused: false,
      oracle: { value: "308.1", state: "current" },
      underlyingQuote: { bid: "308.89", ask: "308.97" }
    });
    expect(result.checks.find((item) => item.id === "custody")).toMatchObject({ status: "claim" });
    expect(result.checks.find((item) => item.id === "multiplier")?.detail).toContain("Raw balances do not rebase");
    expect(result.checks.find((item) => item.id === "token-pause")).toMatchObject({ status: "confirmed" });
    expect(result.limitations.join(" ")).toContain("already includes the multiplier");
    expect(result.privacy.serverStorage).toBe("none");
  });

  it("desk mode skips hosted prices and preserves the feed multiplier flag and RPC evidence", async () => {
    const { http, rpc } = stockFixtures();
    const wrapped: ProviderHttp = { requestJson: async (url, init) => {
      const body = await http.requestJson(url, init);
      return url.includes("feeds-robinhood-mainnet") ? (body as object[]).map(row => ({ ...row, multiplierEmbedded: true })) : body;
    } };
    const rpcCalls: import("@rh-chain/shared").ReceiptBody["rpcCalls"] = [];
    const result = await new RwaService(testEnv(), { http: wrapped, rpc, budget: budget(), now: () => NOW }).verify(STOCK, { desk: true, rpcCalls });
    expect(result.stock?.underlyingQuote).toBeNull();
    expect(result.stock?.oracle).toMatchObject({ value: "308.1", multiplierEmbedded: true });
    expect((http.requestJson as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).includes("/prices/"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("rhj/prices/");
    expect(rpcCalls).toHaveLength(16);
  });

  it("derives the multiplier basis from the directory product type", async () => {
    const run = async (feedDocs?: Record<string, unknown>) => {
      const { http, rpc } = stockFixtures({ feedDocs });
      return (await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK, { desk: true })).stock?.oracle;
    };
    expect(await run({ productTypeCode: "primaryTokenizedPrice" })).toMatchObject({ state: "current", multiplierEmbedded: true });
    expect(await run({ productTypeCode: "RefPrice" })).toMatchObject({ state: "current", multiplierEmbedded: false });
    expect(await run({ productTypeCode: "ExRate" })).toMatchObject({ multiplierEmbedded: null });
    expect(await run()).toMatchObject({ multiplierEmbedded: null });
  });
  it("accepts the on-chain RH<SYMBOL> feed description and still rejects other descriptions", async () => {
    const run = async (feedDescription: string) => {
      const { http, rpc } = stockFixtures({ feedDescription });
      return (await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK)).stock?.oracle?.state;
    };
    expect(await run("RHAAPL / USD")).toBe("current");
    expect(await run("Robinhood AAPL / USD")).toBe("current");
    expect(await run("RHNVDA / USD")).toBe("invalid");
    expect(await run("AAPL / USD")).toBe("invalid");
  });
  it("surfaces UID conflicts and paused oracle values instead of trusting the ticker", async () => {
    const { http, rpc } = stockFixtures({ uid: `0x${"34".repeat(32)}`, paused: true });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);

    expect(result.checks.find((item) => item.id === "canonical")?.status).toBe("conflict");
    expect(result.stock?.oracle).toMatchObject({ state: "paused", value: "308.1" });
    expect(result.checks.find((item) => item.id === "oracle-paused")?.status).toBe("warning");
  });

  it("treats a missing Chainlink feed as unavailable rather than inventing a price", async () => {
    const { http, rpc } = stockFixtures({ noFeed: true });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.stock?.oracle).toBeNull();
    expect(result.checks.find((item) => item.id === "oracle")).toMatchObject({ status: "missing" });
  });

  it("labels a heartbeat-expired oracle stale instead of current", async () => {
    const { http, rpc } = stockFixtures({ oracleUpdatedAt: Math.floor(NOW.getTime() / 1000) - 90_000 });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.stock?.oracle?.state).toBe("stale_or_market_closed");
    expect(result.checks.find((item) => item.id === "oracle")?.status).toBe("warning");
  });

  it("rejects incomplete oracle rounds and surfaces a direct token pause", async () => {
    const { http, rpc } = stockFixtures({ roundId: 2n, answeredInRound: 1n, tokenPaused: true });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.stock?.oracle).toMatchObject({ state: "invalid", value: null });
    expect(result.stock?.tokenPaused).toBe(true);
    expect(result.checks.find((item) => item.id === "token-pause")?.status).toBe("warning");
  });

  it("rejects a quote with the wrong deployment, currency, or future timestamp", async () => {
    const { http, rpc } = stockFixtures({ quoteChainId: 1, quoteCurrency: "EUR", quoteGeneratedAt: "2026-08-12T12:00:00.000Z" });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.stock?.underlyingQuote).toBeNull();
    expect(result.checks.find((item) => item.id === "quote")?.status).toBe("conflict");
  });

  it("distinguishes optional provider outage from a valid empty response", async () => {
    const { http, rpc } = stockFixtures({ optionalFailure: true });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.checks.find((item) => item.id === "quote")).toMatchObject({ status: "missing" });
    expect(result.checks.find((item) => item.id === "actions")?.detail).toContain("zero actions was not assumed");
    expect(result.checks.find((item) => item.id === "oracle")?.detail).toContain("unavailable");
  });

  it("rejects malformed optional Stock Token documents without treating them as empty", async () => {
    const { http, rpc } = stockFixtures({ malformedOptional: true });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.stock?.underlyingQuote).toBeNull();
    expect(result.stock?.corporateActions).toEqual([]);
    expect(result.stock?.oracle).toBeNull();
    expect(result.checks.find((item) => item.id === "quote")).toMatchObject({ status: "conflict" });
    expect(result.checks.find((item) => item.id === "actions")).toMatchObject({ status: "conflict" });
    expect(result.checks.find((item) => item.id === "oracle")).toMatchObject({ status: "conflict" });
  });

  it("separates valid empty quote/feed collections from malformed matching entries", async () => {
    const empty = stockFixtures({ quoteEmpty: true, noFeed: true });
    const emptyResult = await new RwaService(testEnv(), { ...empty, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(emptyResult.checks.find((item) => item.id === "quote")).toMatchObject({ status: "missing" });
    expect(emptyResult.checks.find((item) => item.id === "oracle")).toMatchObject({ status: "missing" });

    const malformed = stockFixtures({ malformedQuote: true, malformedFeed: true });
    const malformedResult = await new RwaService(testEnv(), { ...malformed, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(malformedResult.checks.find((item) => item.id === "quote")).toMatchObject({ status: "conflict" });
    expect(malformedResult.checks.find((item) => item.id === "oracle")).toMatchObject({ status: "conflict" });
  });

  it("reconciles scheduled multiplier evidence and never assumes a missing pause read is false", async () => {
    const matching = stockFixtures({ registryPending: "1.25", onchainPending: 1_250_000_000_000_000_000n, effectiveAt: 1_800_000_000n });
    const matchingResult = await new RwaService(testEnv(), { ...matching, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(matchingResult.checks.find((item) => item.id === "scheduled-multiplier")).toMatchObject({ status: "confirmed" });
    expect(matchingResult.stock?.pendingMultiplier).toBe("1.25");

    const incomplete = stockFixtures({ registryPending: "1.25", missingScheduleEvidence: true, missingTokenPaused: true });
    const incompleteResult = await new RwaService(testEnv(), { ...incomplete, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(incompleteResult.checks.find((item) => item.id === "scheduled-multiplier")).toMatchObject({ status: "missing" });
    expect(incompleteResult.checks.find((item) => item.id === "token-pause")).toMatchObject({ status: "missing" });
    expect(incompleteResult.stock?.tokenPaused).toBeNull();
  });

  it("discloses corporate-action truncation instead of implying complete coverage", async () => {
    const { http, rpc } = stockFixtures({ actionCount: 21 });
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK);
    expect(result.stock?.corporateActions).toHaveLength(20);
    expect(result.checks.find((item) => item.id === "actions")).toMatchObject({ status: "warning" });
    expect(result.checks.find((item) => item.id === "actions")?.detail).toContain("20 of 21");
  });

  it("verifies Morpho identity directly and does not treat ERC-4626 max methods as liquidity", async () => {
    const { http, rpc } = morphoFixtures();
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(VAULT);

    expect(result.kind).toBe("morpho_vault");
    expect(result.morpho).toMatchObject({
      listed: true,
      asset: { address: ASSET, symbol: "USDG", decimals: 6 },
      totalAssetsRaw: "312464692595723",
      withdrawableAssetsRaw: "35034061292463",
      indexLagBlocks: 10,
      configIndexedBlock: 980,
      apyIndexedBlock: 999,
      trailing24hApy: "0.0362605711219608"
    });
    expect(result.limitations.join(" ")).toContain("maxDeposit/maxWithdraw");
    expect(JSON.stringify((rpc.requestJson as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("maxWithdraw");
  });

  it("keeps unavailable Morpho listing distinct from an explicit unlisted result", async () => {
    const unavailable = morphoFixtures({ listing: "unavailable" });
    const unavailableResult = await new RwaService(testEnv(), { ...unavailable, budget: budget(), now: () => NOW }).verify(VAULT);
    expect(unavailableResult.morpho?.listed).toBeNull();
    expect(unavailableResult.checks.find((item) => item.id === "listing")?.status).toBe("missing");
    expect(unavailableResult.summary).toContain("listing status was unavailable");
    expect(unavailableResult.checks.find((item) => item.id === "listing")?.detail).toContain("PROVIDER_HTTP_503");
    expect(unavailableResult.checks.find((item) => item.id === "listing")?.detail).not.toContain("valid listing collection");

    const unlisted = morphoFixtures({ listing: false });
    const unlistedResult = await new RwaService(testEnv(), { ...unlisted, budget: budget(), now: () => NOW }).verify(VAULT);
    expect(unlistedResult.morpho?.listed).toBe(false);
    expect(unlistedResult.checks.find((item) => item.id === "listing")?.status).toBe("warning");

    const empty = morphoFixtures({ listing: "empty" });
    const emptyResult = await new RwaService(testEnv(), { ...empty, budget: budget(), now: () => NOW }).verify(VAULT);
    expect(emptyResult.morpho?.listed).toBeNull();
    expect(emptyResult.checks.find((item) => item.id === "listing")).toMatchObject({ status: "missing" });
    expect(emptyResult.checks.find((item) => item.id === "listing")?.detail).toContain("valid listing collection");
  });

  it("formats direct vault totals with directly verified asset decimals", async () => {
    const fixtures = morphoFixtures({ directAssetDecimals: 18 });
    const result = await new RwaService(testEnv(), { ...fixtures, budget: budget(), now: () => NOW }).verify(VAULT);
    expect(result.morpho?.asset.decimals).toBe(18);
    expect(result.checks.find((item) => item.id === "vault-identity")).toMatchObject({ status: "conflict" });
  });

  it("rejects malformed optional Morpho state, APY, and listing documents", async () => {
    const fixtures = morphoFixtures({ malformedOptional: true });
    const result = await new RwaService(testEnv(), { ...fixtures, budget: budget(), now: () => NOW }).verify(VAULT);
    expect(result.morpho).toMatchObject({ listed: null, indexedBlock: null, trailing24hApy: null });
    expect(result.checks.find((item) => item.id === "listing")).toMatchObject({ status: "conflict" });
    expect(result.checks.find((item) => item.id === "vault-totals")).toMatchObject({ status: "conflict" });
    expect(result.checks.find((item) => item.id === "liquidity")).toMatchObject({ status: "conflict" });
    expect(result.checks.find((item) => item.id === "yield")).toMatchObject({ status: "conflict" });
  });

  it("fails closed on malformed required Morpho configuration bounds", async () => {
    const fixtures = morphoFixtures({ malformedConfig: true });
    await expect(new RwaService(testEnv(), { ...fixtures, budget: budget(), now: () => NOW }).verify(VAULT))
      .rejects.toMatchObject({ code: "RWA_PROVIDER_SCHEMA_CHANGED" });
  });

  it("returns an honest unsupported result without inferring physical authenticity", async () => {
    const http: ProviderHttp = { requestJson: vi.fn(async (url) => {
      if (url.endsWith("/assets")) return { assets: [] };
      throw new ProviderRequestError("PROVIDER_HTTP_404", false);
    }) };
    const rpc = baseRpc();
    const result = await new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(UNKNOWN);
    expect(result.kind).toBe("unsupported_contract");
    expect(result.summary).toContain("cannot prove backing or physical authenticity");
    expect(result.checks.find((item) => item.id === "physical")?.status).toBe("unsupported");
  });

  it("fails closed on registry schema drift or a required Morpho lookup outage", async () => {
    const rpc = baseRpc();
    const malformed: ProviderHttp = { requestJson: vi.fn(async () => ({ unexpected: [] })) };
    await expect(new RwaService(testEnv(), { http: malformed, rpc, budget: budget(), now: () => NOW }).verify(UNKNOWN)).rejects.toMatchObject({ code: "RWA_PROVIDER_SCHEMA_CHANGED" });

    const outage: ProviderHttp = { requestJson: vi.fn(async (url) => {
      if (url.endsWith("/assets")) return { assets: [] };
      throw new ProviderRequestError("PROVIDER_HTTP_503", true);
    }) };
    await expect(new RwaService(testEnv(), { http: outage, rpc, budget: budget(), now: () => NOW }).verify(UNKNOWN)).rejects.toMatchObject({ code: "RWA_PROVIDER_UNAVAILABLE" });
  });

  it("fails closed when the block hash changes", async () => {
    const { http, rpc } = stockFixtures({ reorg: true });
    await expect(new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK)).rejects.toMatchObject({ code: "RWA_ANCHOR_CHANGED" });
  });

  it("keeps per-verification RPC ceilings isolated under concurrency", async () => {
    const { http, rpc } = stockFixtures();
    const service = new RwaService(testEnv(), { http, rpc, budget: budget(), now: () => NOW });
    await expect(Promise.all([service.verify(STOCK), service.verify(STOCK)])).resolves.toHaveLength(2);

    const tight = loadEnv({ NODE_ENV: "test", RWA_VERIFY_ENABLED: "true", RWA_MAX_RPC_SUBCALLS: "8" });
    await expect(new RwaService(tight, { http, rpc, budget: budget(), now: () => NOW }).verify(STOCK)).rejects.toMatchObject({ code: "RWA_RPC_LIMIT_EXCEEDED" });
  });

  it("keeps the route strict, anonymous, disabled by flag, and no-store", async () => {
    const app = Fastify({ logger: false }); apps.push(app); installErrorHandler(app);
    const verify = vi.fn(async () => ({ kind: "unsupported_contract" }));
    await rwaRoutes(app, testEnv(), { verify } as never);
    const response = await app.inject({ method: "POST", url: "/v1/private/rwa/verify", payload: { address: UNKNOWN } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(verify).toHaveBeenCalledWith(UNKNOWN);
    const extra = await app.inject({ method: "POST", url: "/v1/private/rwa/verify", payload: { address: UNKNOWN, label: "private" } });
    expect(extra.statusCode).toBe(400);

    const disabled = Fastify({ logger: false }); apps.push(disabled); installErrorHandler(disabled);
    await rwaRoutes(disabled, testEnv(false), { verify } as never);
    expect((await disabled.inject({ method: "POST", url: "/v1/private/rwa/verify", payload: { address: UNKNOWN } })).statusCode).toBe(503);
  });

  it("enforces the dedicated anonymous hourly rate limit", async () => {
    const verify = vi.fn(async () => ({ kind: "unsupported_contract" }));
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      RWA_VERIFY_ENABLED: "true",
      RATE_LIMIT_RWA_PER_HOUR: "2"
    }), undefined, { rwaVerification: { verify } as never });
    apps.push(app);
    const request = () => app.inject({ method: "POST", url: "/v1/private/rwa/verify", payload: { address: UNKNOWN } });
    expect((await request()).statusCode).toBe(200);
    expect((await request()).statusCode).toBe(200);
    expect((await request()).statusCode).toBe(429);
    expect(verify).toHaveBeenCalledTimes(2);
  });
});

function budget(): RwaBudget { return { consume: vi.fn(async () => undefined) }; }

function stockFixtures(options: { feedDescription?: string; feedDocs?: Record<string, unknown>; uid?: `0x${string}`; paused?: boolean; tokenPaused?: boolean; missingTokenPaused?: boolean; noFeed?: boolean; malformedFeed?: boolean; quoteEmpty?: boolean; malformedQuote?: boolean; optionalFailure?: boolean; malformedOptional?: boolean; actionCount?: number; reorg?: boolean; oracleUpdatedAt?: number; roundId?: bigint; answeredInRound?: bigint; quoteChainId?: number; quoteCurrency?: string; quoteGeneratedAt?: string; registryPending?: string; onchainPending?: bigint; effectiveAt?: bigint; missingScheduleEvidence?: boolean } = {}) {
  const http: ProviderHttp = { requestJson: vi.fn(async (url) => {
    if (url.endsWith("/assets")) return { assets: [{
      id: UID, tokenSymbol: "AAPL", tokenName: "Apple • Robinhood Token", tokenDecimals: 18,
      deployments: [{ contractAddress: STOCK, chainId: 4663 }], currentMultiplier: "1.000000000000000000",
      pendingMultiplier: options.registryPending ?? "", status: "ASSET_STATUS_ACTIVE"
    }] };
    if (url.includes("/prices/AAPL")) { if (options.optionalFailure) throw new ProviderRequestError("PROVIDER_HTTP_429", true); if (options.malformedOptional) return { quotes: "invalid" }; if (options.quoteEmpty) return { quotes: [] }; return { quotes: [{ tokenSymbol: "AAPL", deployments: [{ contractAddress: STOCK, chainId: options.quoteChainId ?? 4663 }], bid: options.malformedQuote ? null : "308.89", ask: "308.97", currency: options.quoteCurrency ?? "USD", generatedAt: options.quoteGeneratedAt ?? NOW.toISOString(), isTradingHalt: false }] }; }
    if (url.endsWith("/corporate-actions")) { if (options.optionalFailure) throw new ProviderRequestError("PROVIDER_TIMEOUT", true); if (options.malformedOptional) return { corpActions: "invalid" }; return { corpActions: Array.from({ length: options.actionCount ?? 1 }, (_, index) => ({ id: `${UID}:${index}`, type: "CORPORATE_ACTION_TYPE_CASH_DIVIDEND", status: "CORPORATE_ACTION_STATUS_IN_PROGRESS", processDate: { year: 2026, month: 8, day: 15 }, tokenSymbol: "AAPL", deployments: [{ contractAddress: STOCK, chainId: 4663 }], details: { cashDividend: { rate: "0.25" } } })) }; }
    if (url.includes("feeds-robinhood-mainnet")) { if (options.optionalFailure) throw new ProviderRequestError("PROVIDER_CIRCUIT_OPEN", false); if (options.malformedOptional) return { feeds: [] }; return options.noFeed ? [] : [{ name: "Robinhood AAPL / USD", proxyAddress: options.malformedFeed ? "invalid" : FEED, heartbeat: 86400, decimals: 8, ...(options.feedDocs ? { docs: options.feedDocs } : {}) }]; }
    throw new Error(`unexpected HTTP ${url}`);
  }) };
  const rpc = scriptedRpc((id) => {
    const values: Record<string, unknown> = {
      "stock:uid": encoded(stockFunctions, "uid", options.uid ?? UID),
      "stock:name": encoded(stockFunctions, "name", "Apple • Robinhood Token"),
      "stock:symbol": encoded(stockFunctions, "symbol", "AAPL"),
      "stock:decimals": encoded(stockFunctions, "decimals", 18),
      "stock:uiMultiplier": encoded(stockFunctions, "uiMultiplier", 1_000_000_000_000_000_000n),
      "stock:newUIMultiplier": options.missingScheduleEvidence ? undefined : encoded(stockFunctions, "newUIMultiplier", options.onchainPending ?? 1_000_000_000_000_000_000n),
      "stock:effectiveAt": options.missingScheduleEvidence ? undefined : encoded(stockFunctions, "effectiveAt", options.effectiveAt ?? 0n),
      "stock:oraclePaused": encoded(stockFunctions, "oraclePaused", options.paused ?? false),
      "stock:tokenPaused": options.missingTokenPaused ? undefined : encoded(stockFunctions, "tokenPaused", options.tokenPaused ?? false),
      "stock:terms": encoded(stockFunctions, "terms", "https://robinhood.com/stocktoken/rhj"),
      "feed:description": encoded(feedFunctions, "description", options.feedDescription ?? "Robinhood AAPL / USD"),
      "feed:decimals": encoded(feedFunctions, "decimals", 8),
      "feed:latestRoundData": encoded(feedFunctions, "latestRoundData", [options.roundId ?? 1n, 30_810_000_000n, 0n, BigInt(options.oracleUpdatedAt ?? Math.floor(NOW.getTime() / 1000) - 3600), options.answeredInRound ?? 1n])
    };
    return values[id];
  }, options.reorg);
  return { http, rpc };
}

function morphoFixtures(options: { listing?: boolean | "unavailable" | "empty"; malformedOptional?: boolean; malformedConfig?: boolean; directAssetDecimals?: number } = {}) {
  const http: ProviderHttp = { requestJson: vi.fn(async (url) => {
    if (url.endsWith("/assets")) return { assets: [] };
    if (url.endsWith(`/v0/vaults-v2/4663:${VAULT}`)) return { data: {
      chain_id: 4663, address: VAULT, last_indexed_block: "980", version: "2.0", name: "Steakhouse USDG", symbol: "steakUSDG",
      asset: { address: ASSET, decimals: 6, symbol: "USDG" }, owner: "0x2222222222222222222222222222222222222222",
      curator: "0x3333333333333333333333333333333333333333", timelock_seconds: options.malformedConfig ? -1 : 604800
    } };
    if (url.endsWith("/state")) return options.malformedOptional ? { data: { total_assets: "not-a-number" } } : { data: { last_indexed_block: "990", total_assets: "312464692595723", total_supply: "311340318068268371403691700", withdrawable_assets: "35034061292463", allocated_assets: "302471377591652", idle_assets: "9993315004071" } };
    if (url.includes("apy-averages")) return options.malformedOptional ? { data: { apy: "3.6%" } } : { data: { last_indexed_block: "999", apy: 0.0362605711219608 } };
    if (url.endsWith("/graphql")) {
      if (options.listing === "unavailable") throw new ProviderRequestError("PROVIDER_HTTP_503", true);
      return options.malformedOptional ? { data: { vaultV2s: { items: "invalid" } } } : { data: { vaultV2s: { items: options.listing === "empty" ? [] : [{ address: VAULT, listed: options.listing ?? true }] } } };
    }
    throw new Error(`unexpected HTTP ${url}`);
  }) };
  const rpc = scriptedRpc((id) => ({
    "vault:asset": encoded(vaultFunctions, "asset", ASSET),
    "vault:totalAssets": encoded(vaultFunctions, "totalAssets", 312_464_692_595_723n),
    "vault:totalSupply": encoded(vaultFunctions, "totalSupply", 311_340_318_068_268_371_403_691_700n),
    "vault:name": encoded(vaultFunctions, "name", "Steakhouse USDG"),
    "vault:symbol": encoded(vaultFunctions, "symbol", "steakUSDG"),
    "asset:decimals": encoded(assetFunctions, "decimals", options.directAssetDecimals ?? 6)
  })[id]);
  return { http, rpc };
}

function baseRpc(): ProviderHttp { return scriptedRpc(() => undefined); }
function scriptedRpc(valueForId: (id: string) => unknown, reorg = false): ProviderHttp {
  let blockReads = 0;
  return { requestJson: vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown> | Array<Record<string, unknown>>;
    if (!Array.isArray(body)) {
      if (body.method === "eth_getBlockByNumber") {
        blockReads += 1;
        return { id: body.id, result: { number: "0x3e8", hash: blockReads > 1 && reorg ? `0x${"cd".repeat(32)}` : BLOCK_HASH } };
      }
      if (body.method === "eth_getCode") return { id: body.id, result: "0x6000" };
      throw new Error(`unexpected RPC ${String(body.method)}`);
    }
    return body.map((request) => ({ id: request.id, result: valueForId(String(request.id)) ?? "0x" }));
  }) };
}

const stockFunctions = [
  fn("uid", "bytes32"), fn("name", "string"), fn("symbol", "string"), fn("decimals", "uint8"), fn("uiMultiplier", "uint256"),
  fn("newUIMultiplier", "uint256"), fn("effectiveAt", "uint256"), fn("oraclePaused", "bool"), fn("tokenPaused", "bool"), fn("terms", "string")
] as const satisfies Abi;
const feedFunctions = [fn("description", "string"), fn("decimals", "uint8"), { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] }] as const satisfies Abi;
const vaultFunctions = [fn("asset", "address"), fn("totalAssets", "uint256"), fn("totalSupply", "uint256"), fn("name", "string"), fn("symbol", "string")] as const satisfies Abi;
const assetFunctions = [fn("decimals", "uint8")] as const satisfies Abi;

function fn(name: string, output: string) { return { type: "function" as const, name, stateMutability: "view" as const, inputs: [], outputs: [{ type: output }] }; }
function encoded(abi: Abi, functionName: string, result: unknown): string { return encodeFunctionResult({ abi, functionName, result }); }
