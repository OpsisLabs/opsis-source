import { describe, expect, it } from "vitest";
import { deriveTradeDrivenPriceSeries } from "../src/history/public-swap-price-series.js";
import type { PublicSwapHistoryRead } from "../src/history/public-swap-reader.js";

const POOL = `0x${"11".repeat(20)}`;
const SQRT_ONE = (1n << 96n).toString();
const event = (overrides: Record<string, unknown> = {}) => ({
  poolAddress: POOL, blockNumber: "84", blockHash: `0x${"aa".repeat(32)}`,
  transactionHash: `0x${"bb".repeat(32)}`, logIndex: 1,
  blockTimestamp: "2026-09-23T12:00:00.000Z", sqrtPriceX96: SQRT_ONE, ...overrides,
});
const complete = (events = [event()]): PublicSwapHistoryRead => ({ state: "complete", events });
const orientation = { poolAddress: POOL, base: "token0" as const, token0Decimals: 18, token1Decimals: 18 };

describe("trade-driven sampled price derivation", () => {
  it("uses exact post-swap sqrt ratios and preserves the event provenance", () => {
    const result = deriveTradeDrivenPriceSeries(complete([event(), event({ logIndex: 2, transactionHash: `0x${"cc".repeat(32)}`,
      sqrtPriceX96: (2n << 96n).toString() })]), orientation);
    expect(result).toMatchObject({ state: "complete", method: "uniswap-v3-post-swap-sqrt-price",
      samples: [{ quotePerBase: "1", blockNumber: "84" }, { quotePerBase: "4", logIndex: 2 }] });
    if (result.state === "complete") expect(result.samples[0]!.numerator).toBe(result.samples[0]!.denominator);
  });

  it("inverts the ratio and applies token decimals without floating point", () => {
    const inverse = deriveTradeDrivenPriceSeries(complete([event({ sqrtPriceX96: (2n << 96n).toString() })]),
      { ...orientation, base: "token1" });
    expect(inverse).toMatchObject({ state: "complete", samples: [{ quotePerBase: "0.25" }] });
    const decimals = deriveTradeDrivenPriceSeries(complete(), { ...orientation, token1Decimals: 6 });
    expect(decimals).toMatchObject({ state: "complete", samples: [{ quotePerBase: "1000000000000" }] });
  });

  it("does not render a nonzero subprecision ratio as zero", () => {
    const result = deriveTradeDrivenPriceSeries(complete([event({ sqrtPriceX96: "1" })]), orientation);
    expect(result).toMatchObject({ state: "complete", samples: [{ quotePerBase: null, truncated: true }] });
  });

  it("preserves EMPTY, GAP and UNAVAILABLE instead of making a price point", () => {
    expect(deriveTradeDrivenPriceSeries({ state: "empty", events: [] }, orientation)).toEqual({ state: "empty", samples: [] });
    expect(deriveTradeDrivenPriceSeries({ state: "gap" }, orientation)).toEqual({ state: "gap" });
    expect(deriveTradeDrivenPriceSeries({ state: "unavailable" }, orientation)).toEqual({ state: "unavailable" });
  });

  it("fails closed on malformed, duplicate or timestamp-regressing events", () => {
    for (const events of [
      [event({ sqrtPriceX96: "0" })],
      [event({ poolAddress: `0x${"22".repeat(20)}` })],
      [event(), event()],
      [event({ blockNumber: "84" }), event({ blockNumber: "85", logIndex: 2,
        transactionHash: `0x${"cc".repeat(32)}`, blockTimestamp: "2026-09-23T11:59:00.000Z" })],
    ]) expect(deriveTradeDrivenPriceSeries(complete(events), orientation)).toEqual({ state: "gap" });
  });
});
