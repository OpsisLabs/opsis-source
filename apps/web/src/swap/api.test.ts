import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSwapQuote,
  officialUniswapUrl,
  SWAP_TOKENS,
  type SwapQuote,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("Swap preview browser contract", () => {
  it("omits credentials and accepts only an exact official handoff", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(quote()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).resolves.toMatchObject({ pair: "WETH/USDG" });
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
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.0100" })).resolves.toMatchObject({ input: { amount: "0.01" } });
    expect(fetchMock).toHaveBeenCalledWith("/v1/swaps/quote", expect.objectContaining({
      body: JSON.stringify({ direction: "WETH_TO_USDG", amount: "0.01" }),
    }));
  });

  it("accepts on-chain evidence with the existing click-only handoff and rejects a substituted pool", async () => {
    const value = quote();
    value.route = { routing: "CLASSIC", label: "Uniswap v3 · single pool (fee 0.05%)", protocols: ["V3"] };
    value.simulation.status = "warning";
    value.output.minimumSource = "derived_tolerance";
    value.onchain = { blockNumber: 4660, blockHash: `0x${"ab".repeat(32)}`, capturedAtMs: Date.parse(value.quotedAt),
      poolAddress: `0x${"11".repeat(20)}`, feeTier: 500, lpFeeAmount: "0.000005", gasEstimate: "100000",
      gasPriceWei: "1000000000", networkFeeEth: "0.0001", ethUsd: "2000", ethUsdObservedAt: value.quotedAt,
      nativeSide: null, rpcProvider: "drpc" };
    const respond = () => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })));
    respond();
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).resolves.toMatchObject({ onchain: { feeTier: 500 } });
    const rows: NonNullable<SwapQuote["onchain"]>["feeTiers"] = [
      { feeTier: 100, status: "no_pool", reason: "pool_not_found" },
      { feeTier: 500, poolAddress: value.onchain.poolAddress, lpFeeAmount: value.onchain.lpFeeAmount, status: "quoted",
        outputAmount: value.output.amount, priceImpactPercent: value.priceImpactPercent, highestOutput: true },
      { feeTier: 3000, poolAddress: `0x${"22".repeat(20)}`, lpFeeAmount: "0.00003", status: "quote_refused", reason: "price_boundary" },
      { feeTier: 10000, status: "no_pool", reason: "pool_not_found" },
    ];
    value.onchain.feeTiers = rows;
    respond();
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).resolves.toMatchObject({ onchain: { feeTiers: rows } });
    const invalidRows: unknown[] = [
      [...rows, rows[0]], [rows[0], rows[0]], [],
      [{ feeTier: 200, status: "no_pool", reason: "pool_not_found" }],
      [{ ...rows[1], highestOutput: false }], [{ ...rows[1], outputAmount: "NaN" }],
      [{ ...rows[1], poolAddress: "invalid-pool" }], [{ ...rows[1], priceImpactPercent: 101 }],
      [rows[1], { ...rows[2], reason: "unrecognized" }],
      [rows[1], { ...rows[1], feeTier: 100, outputAmount: "9999999999999999.99999999999999", highestOutput: false }],
    ];
    for (const invalid of invalidRows) {
      value.onchain.feeTiers = invalid as typeof rows;
      respond();
      await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).rejects.toThrow(/invalid live quote/);
    }
    delete value.onchain.feeTiers;
    value.onchain.poolAddress = "invalid-pool";
    respond();
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).rejects.toThrow(/invalid live quote/);
  });

  it("matches a user-supplied slippage tolerance", async () => {
    const value = quote();
    value.slippageTolerancePercent = 1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })));
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01", slippageTolerancePercent: 1 })).resolves.toMatchObject({ slippageTolerancePercent: 1 });
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
    await expect(getSwapQuote({ direction: "WETH_TO_USDG", amount: "0.01" })).rejects.toThrow(/invalid live quote/);
  });
});

function quote(): SwapQuote {
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
