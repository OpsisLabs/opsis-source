import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getScoutSwapQuote,
  officialUniswapUrl,
  SWAP_TOKENS,
  type ScoutSwapQuote,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("Scout Swap browser contract", () => {
  it("omits credentials and accepts only an exact official handoff", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(quote()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getScoutSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).resolves.toMatchObject({ pair: "WETH/USDG" });
    expect(fetchMock).toHaveBeenCalledWith("/v1/swaps/quote", expect.objectContaining({
      credentials: "omit",
      body: JSON.stringify({ direction: "WETH_TO_USDG", amount: "0.01" }),
    }));
  });

  it("canonicalizes equivalent input without losing token precision", async () => {
    const value = quote();
    value.input.amount = "0.01";
    value.handoffUrl = officialUniswapUrl("WETH_TO_USDG", "0.01");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getScoutSwapQuote({ direction: "WETH_TO_USDG", amount: "0.0100" })).resolves.toMatchObject({ input: { amount: "0.01" } });
    expect(fetchMock).toHaveBeenCalledWith("/v1/swaps/quote", expect.objectContaining({
      body: JSON.stringify({ direction: "WETH_TO_USDG", amount: "0.01" }),
    }));
  });

  it.each([
    (value: ReturnType<typeof quote>) => { value.chain.id = 1; },
    (value: ReturnType<typeof quote>) => { value.input.amount = "0.02"; },
    (value: ReturnType<typeof quote>) => { value.input.address = SWAP_TOKENS.USDG.address; },
    (value: ReturnType<typeof quote>) => { value.output.address = SWAP_TOKENS.WETH.address; },
    (value: ReturnType<typeof quote>) => { value.handoffUrl = "https://evil.example/swap"; },
    (value: ReturnType<typeof quote>) => { value.handoffUrl = `${officialUniswapUrl("WETH_TO_USDG", "0.01")}&transactionHash=0xabc`; },
    (value: ReturnType<typeof quote>) => { value.output.minimumReceived = "37"; },
    (value: ReturnType<typeof quote>) => { value.expiresAt = new Date(Date.parse(value.quotedAt) + 30_001).toISOString(); },
    (value: ReturnType<typeof quote>) => { value.freshForMs = 30_001; },
    (value: ReturnType<typeof quote>) => { value.route.protocols = ["V4", ...Array.from({ length: 10 }, () => "V3")]; },
    (value: ReturnType<typeof quote>) => { value.route.routing = "BRIDGE"; },
    (value: ReturnType<typeof quote>) => { value.route.label = ""; },
    (value: ReturnType<typeof quote>) => { value.priceImpactPercent = "not-a-number" as unknown as number; },
    (value: ReturnType<typeof quote>) => { value.slippageTolerancePercent = 4; },
    (value: ReturnType<typeof quote>) => { value.estimatedGas.nativeAmount = "not-a-number"; },
    (value: ReturnType<typeof quote>) => { value.estimatedGas.paidBy = "merchant" as "user"; },
    (value: ReturnType<typeof quote>) => { value.approvalMayBeRequired = "yes" as unknown as boolean; },
    (value: ReturnType<typeof quote>) => { value.transactionPreview.target = "0x1111111111111111111111111111111111111111"; },
    (value: ReturnType<typeof quote>) => { value.transactionPreview.action = ""; },
    (value: ReturnType<typeof quote>) => { value.provider.requestId = ""; },
    (value: ReturnType<typeof quote>) => { value.provider.cached = "false" as unknown as boolean; },
    (value: ReturnType<typeof quote>) => {
      (value.transactionPreview as { canSign: boolean }).canSign = true;
    },
  ])("rejects mismatched or unsafe quote data", async (mutate) => {
    const value = quote();
    mutate(value);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(getScoutSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).rejects.toThrow(/invalid live quote/);
  });
});

function quote(): ScoutSwapQuote {
  const now = new Date("2026-08-12T12:00:00.000Z");
  return {
    pair: "WETH/USDG",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: { symbol: "WETH", address: SWAP_TOKENS.WETH.address, amount: "0.01" },
    output: { symbol: "USDG", address: SWAP_TOKENS.USDG.address, amount: "36.45", minimumReceived: "36.2", minimumSource: "provider" },
    route: { routing: "CLASSIC", label: "WETH → USDG", protocols: ["V4"] },
    priceImpactPercent: 0.01,
    slippageTolerancePercent: 0.5,
    estimatedGas: { nativeAmount: "0.0001", usdAmount: "0.01", paidBy: "user" as const },
    simulation: { status: "passed" as const, reasons: [] },
    approvalMayBeRequired: true,
    transactionPreview: { explanationOnly: true as const, unsigned: true as const, chainId: 4663, sender: null, target: UNISWAP_ROUTER, action: "Execute an exact-input swap for 0.01 WETH → at least 36.2 USDG", canSign: false as const, canBroadcast: false as const },
    quotedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30_000).toISOString(),
    freshForMs: 30_000,
    provider: { name: "Uniswap" as const, requestId: "test", cached: false },
    handoffUrl: officialUniswapUrl("WETH_TO_USDG", "0.01"),
    disclosures: ["Read-only"],
  };
}

const UNISWAP_ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904";
