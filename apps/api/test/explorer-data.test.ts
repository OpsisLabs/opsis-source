import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters } from "viem";
import { JsonCache } from "../src/cache/service.js";
import { AiService } from "../src/ai/service.js";
import { AlchemyProvider } from "../src/chain/alchemy.js";
import { BlockscoutProvider } from "../src/chain/blockscout.js";
import { ExplorerGate } from "../src/chain/explorer-gate.js";
import { explorerReasonApplies, normalizeEntity } from "../src/chain/normalize.js";
import { ProviderHttpClient, ProviderRequestError, type ProviderHttp } from "../src/chain/provider-http.js";
import { ChainEntityResolver } from "../src/chain/resolver.js";
import type { SourceDocumentInput } from "../src/chain/types.js";
import { loadEnv } from "../src/config/env.js";
import { applyPrivateProviderCoverage } from "../src/routes/private.js";

const weth = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const pons = "0x39dbed3a2bd333467115de45665cc57f813c4571";
const wallet = "0x8c11085f7403efb485f4915b35640ca11389f19f";
const observedAt = "2026-10-14T00:00:00.000Z";
const env = loadEnv({ NODE_ENV: "test", ENABLE_PUBLIC_RPC_FALLBACK: "true" });
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/explorer-live/${name}.json`, import.meta.url), "utf8"));
const tokenPaths = (address: string) => [`/tokens/${address}`, `/tokens/${address}/transfers`, `/smart-contracts/${address}`,
  `/tokens/${address}/holders`, `/tokens/${address}/counters`, `/addresses/${address}`];
// Private Mode starts the four slowest documents first, then the profile and counts.
const summaryOrder = (address: string) => [`/tokens/${address}/transfers`, `/smart-contracts/${address}`, `/addresses/${address}`,
  `/tokens/${address}/holders`, `/tokens/${address}`, `/tokens/${address}/counters`];
function tokenDocs(prefix = "weth", address = weth): SourceDocumentInput[] {
  return ["token", "transfers", "contract", "holders", "counters", "address"].map((name, i) => ({
    id: `${prefix}-${name}`, provider: "blockscout", chainId: 4663, entityType: "token", entityValue: address,
    requestUrl: `https://explorer.test/api/v2${tokenPaths(address)[i]}`, responseJson: fixture(`${prefix}-${name}`), fetchedAt: observedAt
  }));
}
function fixtureHttp(prefix = "weth", address = weth) {
  const calls: string[] = [];
  const docs = tokenDocs(prefix, address);
  const http: ProviderHttp = { async requestJson(url) {
    const path = new URL(url).pathname.replace(/^.*\/api\/v2/, "");
    calls.push(path);
    if (path.includes("/token-balances")) return fixture("wallet-token-balances");
    if (path.includes("/addresses/") && path.includes("/transactions")) return fixture("wallet-transactions");
    const index = tokenPaths(address).indexOf(path);
    if (index >= 0) return docs[index]!.responseJson;
    if (path.includes("/addresses/")) return fixture("wallet-address");
    throw new Error("Unexpected explorer path");
  } };
  return { calls, http };
}
function rpcHarness(code = "0x60016000") {
  const methods: string[] = [];
  const rpc = new AlchemyProvider(env, { async requestJson(_url, init) {
    const request = JSON.parse(String(init?.body));
    methods.push(request.method);
    if (request.method === "eth_getCode") return { result: code };
    if (request.method === "eth_getBalance") return { result: "0x0" };
    const values: Record<string, string> = {
      "0x06fdde03": encodeAbiParameters([{ type: "string" }], ["WETH"]),
      "0x95d89b41": encodeAbiParameters([{ type: "string" }], ["WETH"]),
      "0x313ce567": encodeAbiParameters([{ type: "uint256" }], [18n]),
      "0x18160ddd": encodeAbiParameters([{ type: "uint256" }], [100n])
    };
    return { result: values[request.params[0].data] };
  } });
  return { rpc, methods };
}
const noGoldrush = { name: "goldrush", isConfigured: () => false, getAddressSummary: async () => [] };
function resolver(http: ProviderHttp, cache = new JsonCache(), settings = env, rpc = rpcHarness().rpc) {
  return new ChainEntityResolver(settings, cache, undefined, { blockscout: new BlockscoutProvider(settings, http), alchemy: rpc, goldrush: noGoldrush });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("explorer token and wallet facts", () => {
  it("normalizes the captured WETH profile, pool distribution, proxy and exact source labels", () => {
    const docs = tokenDocs();
    docs[1]!.fetchedAt = "2026-10-14T00:01:00.000Z";
    const result = normalizeEntity(4663, "token", weth, docs);
    expect(result.facts).toMatchObject({ decimals: 18, holders: 584656, lifetimeTransfers: 486642572,
      totalSupply: "39778010762440868281051", verified: true, proxy: true, proxyType: "eip1967",
      implementations: [{ address: "0xC6B81b429797E0f555440b70cD99e032D7AE947e", name: "aeWETH" }],
      holderCoverage: "top_holders", activityCoverage: "indexed_window", sourceCoverage: "explorer_metadata",
      explorerObservedAt: observedAt, explorerReputation: "ok", burnedShare: 0, holdersAnalyzed: 50 });
    expect(Number(result.facts.liquidityPoolShare)).toBeGreaterThan(0);
    expect(result.facts.liquidityPools).toContainEqual(expect.objectContaining({ label: "UniswapV3Pool" }));
    expect(result.citations.map((source) => source.description)).toEqual([
      "Token profile · blockscout", "Recent token transfers · blockscout", "Contract metadata and verification · blockscout",
      "Largest token holders · blockscout", "Holder and transfer counts · blockscout", "Address profile · blockscout"
    ]);
  });

  it("separates PONS burned supply from wallet shares, deployer and answer notes", async () => {
    const docs = tokenDocs("pons", pons);
    const result = normalizeEntity(4663, "token", pons, docs);
    expect(result.facts).toMatchObject({ top1WalletShare: 5.4, burnedShare: 32.5 });
    expect(result.facts.topHolders).toContainEqual(expect.objectContaining({
      address: "0x000000000000000000000000000000000000dEaD", isBurn: true
    }));
    expect((result.facts.topHolders as Array<Record<string, unknown>>).find((holder) => !holder.isBurn && !holder.isPool)?.address)
      .toBe("0xB995B91882F5990e5aB3Cc4700b66b20A66C4C79");
    expect(result.riskNotes.map((note) => note.title)).not.toContain("One wallet holds a large share");
    for (const locale of ["en", "zh-CN"] as const) {
      const answer = await new AiService({ ...env, AI_PROVIDER: "fallback" }).answer("risk", result, locale);
      expect(answer.riskNotes.map((note) => note.title)).not.toContain("One wallet holds a large share");
    }
  });

  it.each([
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000DEAD",
    "0xDEAD000000000000000042069420694206942069",
    "0x1111111111111111111111111111111111111111"
  ])("excludes each burn address and null tag from concentration and deployer matching (%s)", (address) => {
    const docs = tokenDocs();
    docs[0]!.responseJson = { decimals: "18", total_supply: "1000" };
    docs[3]!.responseJson = { items: [{ value: "900", address: { hash: address, metadata: { tags: address === "0x1111111111111111111111111111111111111111" ? [{ slug: "null-burn" }] : [] } } },
      { value: "50", address: { hash: wallet } }] };
    docs[5]!.responseJson = { creator_address_hash: address };
    const result = normalizeEntity(4663, "token", weth, docs);
    expect(result.facts).toMatchObject({ burnedShare: 90, top1WalletShare: 5, top5WalletShare: 5,
      top10WalletShare: 5, deployerStillHolds: 0 });
  });

  it("names a contract as the largest holder instead of calling it a wallet, and counts contracts among the ten", () => {
    const docs = tokenDocs();
    docs[0]!.responseJson = { decimals: "18", total_supply: "1000" };
    docs[3]!.responseJson = { items: [
      { value: "300", address: { hash: `0x${"a".repeat(40)}`, name: "PoolManager", is_contract: true } },
      { value: "200", address: { hash: `0x${"b".repeat(40)}`, name: "Morpho", is_contract: true } },
      { value: "100", address: { hash: `0x${"c".repeat(40)}`, is_contract: true } },
      { value: "50", address: { hash: wallet, is_contract: false } }
    ] };
    const result = normalizeEntity(4663, "token", weth, docs);
    expect(result.facts).toMatchObject({ top1WalletShare: 20, top1HolderIsContract: true, top1HolderLabel: "Morpho", top10ContractCount: 2, top10WalletShare: 35 });
    const titles = result.riskNotes.map((note) => note.title);
    expect(titles).toContain("One contract holds a large share");
    expect(titles).not.toContain("One wallet holds a large share");
    const concentration = result.riskNotes.find((note) => note.title === "Supply is somewhat concentrated");
    expect(concentration?.detail).toContain("2 of them are contracts");
    expect(concentration?.detail).not.toContain("private wallets");
  });

  it("describes a thin recognised pool share as information, with the naming limit", () => {
    const docs = tokenDocs("pons", pons);
    const note = normalizeEntity(4663, "token", pons, docs).riskNotes.find((item) => item.title === "Little of the supply is in recognised trading pools");
    expect(note).toMatchObject({ severity: "info" });
    expect(note?.detail).toContain("Pools it does not name are not counted");
  });

  it("keeps missing documents and invalid numeric fields unknown", () => {
    const docs = tokenDocs().filter((_, i) => i === 0 || i === 5);
    docs[0]!.responseJson = { decimals: "256", holders_count: "9007199254740992", total_supply: 123 };
    const result = normalizeEntity(4663, "token", weth, docs);
    expect(result.facts).toMatchObject({ decimals: null, holders: null, lifetimeTransfers: null, totalSupply: null,
      verified: null, proxy: null, holderCoverage: "unavailable", activityCoverage: "unavailable", sourceCoverage: "unavailable" });
    expect(result.facts.implementations).toEqual([{ address: "0xC6B81b429797E0f555440b70cD99e032D7AE947e", name: "aeWETH" }]);
  });

  it.each([null, "", "18.5", "-1", "invalid"])("rejects invalid decimals and counts %j", (value) => {
    const docs = tokenDocs();
    docs[0]!.responseJson = { decimals: value, holders_count: value };
    docs[4]!.responseJson = { transfers_count: value };
    expect(normalizeEntity(4663, "token", weth, docs).facts).toMatchObject({ decimals: null, holders: null, lifetimeTransfers: null });
  });

  it("preserves captured wallet transactions, reputation and numeric balance decimals", async () => {
    const { http } = fixtureHttp();
    const docs = await new BlockscoutProvider(env, http).getAddressSummary(wallet, { detail: "summary", limit: 25 });
    const result = normalizeEntity(4663, "wallet", wallet, docs);
    expect(result.facts.recentTransactions).toHaveLength(12);
    expect(result.facts.recentTransactions).toContainEqual(expect.objectContaining({ status: "error", value: "0" }));
    expect(result.facts.tokenBalances).toContainEqual(expect.objectContaining({ reputation: "ok", decimals: 18 }));
    expect(result.facts).toMatchObject({ activityCoverage: "indexed_window", tokenBalanceCoverage: "indexed_window" });
  });
});

describe("Private Mode explorer reads", () => {
  it("fetches exactly six token documents with one transfer page and no native pricing", async () => {
    const { http, calls } = fixtureHttp();
    const result = await resolver(http).resolveWithSources("token", weth, { privateMode: true, limit: 500 });
    expect(calls).toEqual(summaryOrder(weth));
    expect(result.sources).toHaveLength(6);
    expect(result.entity.facts.recentTransfers).toHaveLength(12);
    expect((result.entity.facts.recentTransfers as Array<Record<string, unknown>>).every((transfer) => !("nativeValue" in transfer))).toBe(true);
  });

  it("recognizes Auto tokens on chain before six explorer token calls, without a wallet lookup", async () => {
    const { http, calls } = fixtureHttp();
    const { rpc, methods } = rpcHarness();
    const orderedHttp: ProviderHttp = { async requestJson(url, init) {
      expect(methods).toEqual(["eth_getCode", "eth_getBalance", "eth_call", "eth_call", "eth_call", "eth_call"]);
      return http.requestJson(url, init);
    } };
    const result = await resolver(orderedHttp, new JsonCache(), env, rpc).resolveWithSources("unknown", weth, { privateMode: true });
    expect(result.entity.type).toBe("token");
    expect(calls).toEqual(summaryOrder(weth));
    expect(result.entity.facts.sourceCoverage).toBe("explorer_metadata");
    expect(result.sources.some((doc) => doc.provider !== "blockscout")).toBe(false);
  });

  it.each(["0x", `0xef0100${"a".repeat(40)}`])("still reads the explorer wallet summary after chain code %s", async (code) => {
    const { http, calls } = fixtureHttp();
    const { rpc, methods } = rpcHarness(code);
    const result = await resolver(http, new JsonCache(), env, rpc).resolveWithSources("unknown", wallet, { privateMode: true, includeApprovals: false });
    expect(result.entity.type).toBe("wallet");
    expect(methods).toEqual(["eth_getCode", "eth_getBalance"]);
    expect(calls).toEqual([`/addresses/${wallet}`, `/addresses/${wallet}/transactions`, `/addresses/${wallet}/token-balances`]);
  });

  it.each([
    ["PROVIDER_CREDITS_EXHAUSTED", "daily_limit"], ["PROVIDER_RATE_LIMITED", "rate_limited"], ["PROVIDER_HTTP_503", "unavailable"]
  ])("keeps the Auto chain token sample with reason %s", async (code, reason) => {
    const http: ProviderHttp = { async requestJson() { throw new ProviderRequestError(code, false); } };
    const result = await resolver(http).resolveWithSources("unknown", weth, { privateMode: true });
    expect(result.entity.facts).toMatchObject({ decimals: 18, symbol: "WETH", sourceCoverage: "rpc_sample_only", explorerUnavailableReason: reason });
    expect(result.sources.every((doc) => doc.provider !== "blockscout")).toBe(true);
  });

  it.each(["PROVIDER_CREDITS_EXHAUSTED", "PROVIDER_RATE_LIMITED", "PROVIDER_HTTP_503"])("carries an optional-document failure to token and wallet facts (%s)", async (code) => {
    const { http } = fixtureHttp();
    const partial: ProviderHttp = { async requestJson(url, init) {
      if (url.includes("/holders") || url.includes("/transactions")) throw new ProviderRequestError(code, false);
      return http.requestJson(url, init);
    } };
    const subject = resolver(partial, new JsonCache(), env, rpcHarness("0x").rpc);
    const token = await subject.resolveWithSources("token", weth, { privateMode: true });
    const account = applyPrivateProviderCoverage(await subject.resolveWithSources("wallet", wallet, { privateMode: true, includeApprovals: false }));
    const reason = code === "PROVIDER_CREDITS_EXHAUSTED" ? "daily_limit" : code === "PROVIDER_RATE_LIMITED" ? "rate_limited" : "unavailable";
    expect(token.entity.facts).toMatchObject({ holderCoverage: "unavailable", explorerUnavailableReason: reason });
    expect(account.entity.facts).toMatchObject({ activityCoverage: "unavailable", explorerUnavailableReason: reason });
  });

  it("caches public token documents only, retains original times, expires at the configured TTL", async () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(observedAt));
    const { http, calls } = fixtureHttp();
    const cache = new JsonCache();
    const set = vi.spyOn(cache, "set");
    const subject = resolver(http, cache);
    const first = await subject.resolveWithSources("token", weth, { privateMode: true });
    await vi.advanceTimersByTimeAsync(899_999);
    const second = await subject.resolveWithSources("token", weth.toUpperCase().replace("0X", "0x"), { privateMode: true });
    expect(calls).toHaveLength(6);
    expect(first.entity.facts.explorerCached).toBe(false);
    expect(second.entity.facts.explorerCached).toBe(true);
    expect(second.sources).toEqual(first.sources);
    expect(second.entity.facts.explorerObservedAt).toBe(first.entity.facts.explorerObservedAt);
    expect(set).toHaveBeenCalledExactlyOnceWith(`explorer-token:v1:4663:${weth}`, { documents: first.sources, reason: undefined }, 900);
    await vi.advanceTimersByTimeAsync(1);
    await subject.resolveWithSources("token", weth, { privateMode: true });
    expect(calls).toHaveLength(12);
  });

  it("coalesces identical in-flight token reads across resolvers sharing the cache", async () => {
    const { http, calls } = fixtureHttp();
    const cache = new JsonCache();
    const a = resolver(http, cache), b = resolver(http, cache);
    const results = await Promise.all([a.resolveWithSources("token", weth, { privateMode: true }), b.resolveWithSources("token", weth, { privateMode: true })]);
    expect(calls).toHaveLength(6);
    expect(results[0]!.sources).toEqual(results[1]!.sources);
  });

  it("does not cache when disabled or after a failed token profile, and later calls recover", async () => {
    const { http, calls } = fixtureHttp();
    const cache = new JsonCache(); const set = vi.spyOn(cache, "set");
    const subject = resolver(http, cache, { ...env, BLOCKSCOUT_TOKEN_CACHE_SECONDS: 0 });
    await subject.resolveWithSources("token", weth, { privateMode: true });
    await subject.resolveWithSources("token", weth, { privateMode: true });
    expect(calls).toHaveLength(12);
    expect(set).not.toHaveBeenCalled();
    let fails = true;
    const recovering = resolver({ async requestJson(url, init) {
      if (fails) throw new ProviderRequestError("PROVIDER_HTTP_503", false);
      return http.requestJson(url, init);
    } }, cache);
    const fallback = await recovering.resolveWithSources("token", weth, { privateMode: true });
    expect(fallback.entity.facts.sourceCoverage).toBe("rpc_sample_only");
    expect(set).not.toHaveBeenCalled();
    fails = false;
    await recovering.resolveWithSources("token", weth, { privateMode: true });
    expect(set).toHaveBeenCalledOnce();
  });

  it("reads the six token documents at once and stops waiting for a slow optional one", async () => {
    const { http } = fixtureHttp();
    const started: string[] = [];
    const slow: ProviderHttp = { async requestJson(url, init) {
      const path = new URL(url).pathname.replace(/^.*\/api\/v2/, "");
      started.push(path);
      // The profile resolves last: every optional read must already be under way.
      if (path === `/tokens/${weth}`) await new Promise((resolve) => setTimeout(resolve, 20));
      if (path.endsWith("/holders")) await new Promise((resolve) => setTimeout(resolve, 2000));
      return http.requestJson(url, init);
    } };
    const subject = resolver(slow, new JsonCache(), { ...env, BLOCKSCOUT_OPTIONAL_WAIT_MS: 500 });
    const begun = Date.now();
    const result = await subject.resolveWithSources("token", weth, { privateMode: true });
    expect(Date.now() - begun).toBeLessThan(1500);
    expect(started).toEqual(summaryOrder(weth));
    expect(result.entity.facts).toMatchObject({ holderCoverage: "unavailable", activityCoverage: "indexed_window", explorerUnavailableReason: "unavailable" });
  });

  it("shares a read whose address profile failed, and not one whose contract record failed", async () => {
    for (const [failing, shared] of [[`/addresses/${weth}`, true], [`/smart-contracts/${weth}`, false]] as const) {
      const { http } = fixtureHttp();
      const cache = new JsonCache(); const set = vi.spyOn(cache, "set");
      const subject = resolver({ async requestJson(url, init) {
        if (new URL(url).pathname.endsWith(failing)) throw new ProviderRequestError("PROVIDER_TIMEOUT", true);
        return http.requestJson(url, init);
      } }, cache);
      const result = await subject.resolveWithSources("token", weth, { privateMode: true });
      expect(result.entity.facts.holderCoverage).toBe("top_holders");
      expect(set).toHaveBeenCalledTimes(shared ? 1 : 0);
    }
  });

  it("does not share a token read that is missing documents, so the next lookup reads again", async () => {
    const { http, calls } = fixtureHttp();
    const cache = new JsonCache(); const set = vi.spyOn(cache, "set");
    let busy = true;
    const subject = resolver({ async requestJson(url, init) {
      if (busy && url.includes("/holders")) throw new ProviderRequestError("PROVIDER_RATE_LIMITED", false);
      return http.requestJson(url, init);
    } }, cache);
    const first = await subject.resolveWithSources("token", weth, { privateMode: true });
    expect(first.entity.facts).toMatchObject({ holderCoverage: "unavailable", explorerUnavailableReason: "rate_limited" });
    expect(set).not.toHaveBeenCalled();
    busy = false;
    const second = await subject.resolveWithSources("token", weth, { privateMode: true });
    // The refused holders call never reached the explorer: 5 then 6 calls.
    expect(calls).toHaveLength(11);
    expect(second.entity.facts.holderCoverage).toBe("top_holders");
    expect(second.entity.facts.explorerUnavailableReason).toBeUndefined();
    expect(set).toHaveBeenCalledOnce();
  });

  it("falls back to the explorer when the chain read that classifies an Auto address fails", async () => {
    const { http, calls } = fixtureHttp();
    const failingRpc = new AlchemyProvider(env, { async requestJson() { throw new ProviderRequestError("PROVIDER_HTTP_503", true); } });
    const result = await resolver(http, new JsonCache(), env, failingRpc).resolveWithSources("unknown", weth, { privateMode: true, includeApprovals: false });
    expect(result.entity.type).toBe("token");
    expect(result.entity.facts.holderCoverage).toBe("top_holders");
    // The explorer address summary classifies it; the token read is the six-call summary.
    expect(calls.filter((path) => path.startsWith("/transactions/"))).toEqual([]);
    expect(calls.slice(-6)).toEqual(summaryOrder(weth));
  });

  it("never caches wallet summaries, even when their explorer reads succeed", async () => {
    const { http, calls } = fixtureHttp(); const cache = new JsonCache();
    const set = vi.spyOn(cache, "set"), get = vi.spyOn(cache, "get");
    const subject = resolver(http, cache, env, rpcHarness("0x").rpc);
    await subject.resolveWithSources("wallet", wallet, { privateMode: true, includeApprovals: false });
    await subject.resolveWithSources("wallet", wallet, { privateMode: true, includeApprovals: false });
    expect(calls).toHaveLength(6);
    expect(set).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });

  it("does not leak the keyed URL through HTTP failures, resolver sources, facts or cache", async () => {
    const key = "test-explorer-key-never-persisted";
    const configured = { ...env, BLOCKSCOUT_PRO_API_KEY: key };
    const { http } = fixtureHttp(); let failing = true;
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(new URL(String(url)).searchParams.get("apikey")).toBe(key);
      if (failing) throw new Error(`Failed request ${String(url)}`);
      return new Response(JSON.stringify(await http.requestJson(String(url), init)));
    });
    const gate = new ExplorerGate({ requestsPerSecond: 50, maxWaitMs: 2500, creditReserve: 5000 });
    const client = new ProviderHttpClient({ explorerGate: gate, maxRetries: 0, backoffMs: 1, timeoutMs: 1000,
      circuitFailureThreshold: 100, circuitResetMs: 1000, requestBudgetPerMinute: 100 }, { fetch, now: Date.now, sleep: async () => {} });
    const provider = new BlockscoutProvider(configured, client);
    try { await provider.getToken(weth, { detail: "summary" }); expect.fail("expected failure"); } catch (error) {
      expect(error).toMatchObject({ code: "PROVIDER_NETWORK_ERROR" });
      expect(String(error)).not.toContain(key); expect(JSON.stringify(error)).not.toContain(key);
    }
    const cache = new JsonCache(); const set = vi.spyOn(cache, "set");
    const subject = resolver(client, cache, configured);
    const fallback = await subject.resolveWithSources("token", weth, { privateMode: true });
    expect(JSON.stringify(fallback)).not.toContain(key); expect(set).not.toHaveBeenCalled();
    const noSampleRpc = { ...rpcHarness().rpc, name: "rpc", getTransaction: async () => [], getAddressSummary: async () => [], getAllowances: async () => [] };
    const failed = new ChainEntityResolver(configured, cache, undefined, { blockscout: provider, alchemy: noSampleRpc, goldrush: noGoldrush });
    try {
      await failed.resolveWithSources("token", weth, { privateMode: true });
      expect.fail("expected resolver failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "PROVIDER_NETWORK_ERROR" });
      expect(String(error)).not.toContain(key); expect(JSON.stringify(error)).not.toContain(key);
    }
    failing = false;
    const result = await subject.resolveWithSources("token", weth, { privateMode: true });
    const cached = await subject.resolveWithSources("token", weth, { privateMode: true });
    for (const data of [result.sources, result.entity, cached, set.mock.calls]) expect(JSON.stringify(data)).not.toContain(key);
    expect(cached.entity.facts.explorerCached).toBe(true);
  });
});

describe("explorer limitation scope", () => {
  it("names no reason when only the address profile, contract record or counts were missing", async () => {
    const { http, calls } = fixtureHttp();
    const partial: ProviderHttp = { async requestJson(url, init) {
      const path = new URL(url).pathname;
      if (path.endsWith(`/addresses/${weth}`) || path.includes("/smart-contracts/") || path.includes("/counters")) throw new ProviderRequestError("PROVIDER_TIMEOUT", true);
      return http.requestJson(url, init);
    } };
    const result = await resolver(partial).resolveWithSources("token", weth, { privateMode: true });
    expect(calls).toHaveLength(3);
    expect(result.entity.facts).toMatchObject({ holderCoverage: "top_holders", activityCoverage: "indexed_window", verified: null, proxy: null, lifetimeTransfers: null });
    expect(result.entity.facts.explorerUnavailableReason).toBeUndefined();
    const answer = await new AiService({ ...env, AI_PROVIDER: "fallback" }).answer("Explain", result.entity);
    expect(answer.uncertainty.some((sentence) => sentence.includes("Blockscout"))).toBe(false);
  });

  it("keeps the reason for a wallet whose balances fell back to the reviewed sample", () => {
    expect(explorerReasonApplies("wallet", { activityCoverage: "indexed_window", tokenBalanceCoverage: "reviewed_asset_sample" })).toBe(true);
    expect(explorerReasonApplies("wallet", { activityCoverage: "indexed_window", tokenBalanceCoverage: "indexed_window" })).toBe(false);
    expect(explorerReasonApplies("token", { holderCoverage: "top_holders", activityCoverage: "unavailable" })).toBe(true);
    expect(explorerReasonApplies("transaction", { holderCoverage: "unavailable" })).toBe(false);
  });
});

describe("explorer answer limitations", () => {
  it.each([
    ["daily_limit", "resets at 00:00 UTC", "UTC 00:00 重置"],
    ["rate_limited", "busy during this lookup", "Blockscout 繁忙"],
    ["unavailable", "could not be read", "无法读取"]
  ])("adds one limitation in both locales for %s", async (reason, english, chinese) => {
    const service = new AiService({ ...env, AI_PROVIDER: "fallback" });
    for (const type of ["token", "wallet"] as const) {
      const entity = normalizeEntity(4663, type, weth, []);
      entity.facts.explorerUnavailableReason = reason;
      const en = await service.answer("Explain", entity);
      const zh = await service.answer("Explain", entity, "zh-CN");
      expect(en.uncertainty.filter((sentence) => sentence.includes("Blockscout"))).toEqual([expect.stringContaining(english)]);
      expect(zh.uncertainty.filter((sentence) => sentence.includes("Blockscout"))).toEqual([expect.stringContaining(chinese)]);
    }
  });
});
