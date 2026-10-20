import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import { translate } from "../i18n/translate";
import { QuotePanel } from "../pages/SwapPreview";
import TradeSimulator from "../simulator/TradeSimulator";
import Status from "../opsis/Status";
import type { Capabilities } from "../opsis/model";
import { statusDetails } from "../opsis/status-copy";
import { officialUniswapUrl, SWAP_TOKENS, type SwapQuote } from "./api";

const state = vi.hoisted(() => ({ scenario: false, index: 0, quote: null as unknown, time: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    if (!state.scenario) return actual.useState(initial);
    const index = state.index++;
    const inputs: Record<number, unknown> = { 2: "1", 3: "500", 4: "2000", 5: state.quote, 8: state.time, 9: 30000 };
    return actual.useState(Object.hasOwn(inputs, index) ? inputs[index] : initial);
  } };
});
const now = Date.parse("2026-10-20T12:00:00.000Z");
function fixture(): SwapQuote {
  return {
    pair: "WETH/USDG", chain: { id: 4663, name: "Robinhood Chain" },
    input: { symbol: "WETH", address: SWAP_TOKENS.WETH.address, amount: "0.01" },
    output: { symbol: "USDG", address: SWAP_TOKENS.USDG.address, amount: "19.8", minimumReceived: "19.701", minimumSource: "derived_tolerance" },
    route: { routing: "CLASSIC", label: "Uniswap v3 · single pool (fee 0.05%)", protocols: ["V3"] },
    priceImpactPercent: 1, slippageTolerancePercent: 0.5,
    estimatedGas: { nativeAmount: "0.0001", usdAmount: "0.2", paidBy: "user" },
    simulation: { status: "warning", reasons: [] }, approvalMayBeRequired: true,
    transactionPreview: { explanationOnly: true, unsigned: true, chainId: 4663, sender: null, target: null,
      action: "Read-only quote explanation", canSign: false, canBroadcast: false },
    quotedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString(), freshForMs: 30000,
    provider: { name: "Uniswap", requestId: "fixture-onchain", cached: false },
    handoffUrl: officialUniswapUrl("WETH_TO_USDG", "0.01"), disclosures: [],
    onchain: { blockNumber: 4660, blockHash: `0x${"ab".repeat(32)}`, capturedAtMs: now,
      poolAddress: `0x${"11".repeat(20)}`, feeTier: 500, lpFeeAmount: "0.000005", gasEstimate: "100000",
      gasPriceWei: "1000000000", networkFeeEth: "0.0001", ethUsd: "2000", ethUsdObservedAt: new Date(now - 5000).toISOString(),
      nativeSide: "input", rpcProvider: "drpc" },
  };
}
afterEach(() => { vi.unstubAllGlobals(); state.scenario = false; state.index = 0; });

describe.each(["en", "zh-CN"] as const)("on-chain quote rendering (%s)", (locale) => {
  function render(node: React.ReactNode) {
    vi.stubGlobal("document", { cookie: `opsis_locale_v1=${locale}` });
    return renderToStaticMarkup(<I18nProvider><MemoryRouter>{node}</MemoryRouter></I18nProvider>);
  }
  it.each(["swap", "scenario"])("renders evidence and user-paid ETH/USD costs on the %s screen", (screen) => {
    const quote = fixture();
    state.scenario = screen === "scenario";
    state.index = screen === "scenario" ? -1 : 0; state.quote = quote; state.time = now;
    const html = render(screen === "swap" ? <QuotePanel quote={quote} elapsedMs={0} /> : <TradeSimulator />);
    expect(html).toContain(locale === "en" ? "Single-pool estimate." : "单池估算。");
    expect(html).toContain(translate(locale, "trade.onchain.block", { block: 4660 }));
    expect(html).toContain(quote.onchain!.poolAddress);
    expect(html).toContain("0.0001 ETH · 0.2 USD");
    expect(html).toContain(locale === "en" ? "estimate you pay" : "由你支付");
    expect(html).toContain(locale === "en" ? "LP fee estimate" : "LP 费用估算");
    expect(html).toContain(locale === "en" ? "no full transaction simulation" : "未进行完整交易模拟");
    expect(html).toContain(locale === "en" ? "using WETH pools" : "使用 WETH 池");
    expect(html).not.toMatch(/\bfree\b|免费/i);
    expect(html).not.toContain("Provider route check passed");
    expect(html).toContain("https://app.uniswap.org/swap?");
  });
  it("describes the configured on-chain source in the status row", () => {
    const copy = statusDetails.swapPreview;
    const capabilities: Capabilities = { expiresAt: new Date(now + 30000).toISOString(), chainId: 4663, research: false,
      exitCheck: false, watch: false, rwa: false, observedTrades: false, swapPreview: true, perpExecution: false,
      manifest: { version: 1, chain: { id: 4663, name: "Robinhood Chain" }, build: null,
        capabilities: [{ id: "swapPreview", enabled: true, scope: copy.scope[0], origin: copy.origin[0], freshness: copy.freshness[0], coverage: copy.coverage[0], limits: copy.limits[0] }] } };
    const html = render(<Status capabilities={capabilities} />);
    expect(html).toContain("QuoterV2");
    expect(html).toContain(locale === "en" ? "single-pool" : "单池");
    expect(html).not.toMatch(/Trade API|\bfree\b|免费/i);
  });
});
