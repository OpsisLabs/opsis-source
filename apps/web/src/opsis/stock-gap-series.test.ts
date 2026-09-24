import { describe, expect, it } from "vitest";
import { parseStockGapSeries } from "./stock-gap-series";

const base = {
  schemaVersion: 1,
  instrument: { chainId: 4663, address: "0x1111111111111111111111111111111111111111", symbol: "AAPLx" },
  quoteCurrency: "USD",
  referenceQuoteCurrency: "USD",
  referenceType: "underlying",
  sourceName: "fixture source",
  observedAt: "2026-09-24T12:00:00Z",
  observations: [
    { timestamp: "2026-09-24T09:30:00Z", dexPrice: "101", referencePrice: "100", multiplier: "1", session: "open" },
    { timestamp: "2026-09-24T09:31:00Z", dexPrice: "102", referencePrice: "100", multiplier: "1", session: "closed", corporateAction: { state: "announced", description: "split announced" } },
  ],
};

function asOracleRow(row: (typeof base.observations)[number], oracleObservedAt: string) {
  const { multiplier, ...rest } = row;
  void multiplier;
  return { ...rest, oracleObservedAt };
}

describe("parseStockGapSeries", () => {
  it("calculates underlying gaps with each row's multiplier and retains session/action metadata", () => {
    const input = { ...base, observations: base.observations.map((row, index) => ({ ...row, multiplier: index === 1 ? "2" : row.multiplier })) };
    const parsed = parseStockGapSeries(input);
    expect(parsed.observations.map((row) => row.gapPercent)).toEqual(["1.0000", "-49.0000"]);
    expect(parsed.observations[1]).toMatchObject({ dexPrice: "102", referencePrice: "100", multiplier: "2" });
    expect(parsed.observations[1].session).toBe("closed");
    expect(parsed.observations[1].corporateAction).toEqual({ state: "announced", description: "split announced" });
    expect(parsed.warnings).toContain("source_provenance_unverified");
  });

  it("does not multiply oracle references again and reports their age", () => {
    const input = { ...base, referenceType: "oracle", observations: base.observations.map((row) => ({ ...asOracleRow(row, "2026-09-24T09:29:00Z"), referencePrice: "100" })) };
    const parsed = parseStockGapSeries(input);
    expect(parsed.observations[0]).toMatchObject({ gapPercent: "1.0000", oracleAgeMinutes: 1 });
    expect(parsed.observations[0]).toMatchObject({ dexPrice: "101", referencePrice: "100", multiplier: null });
    expect(parsed.observations[1].oracleAgeMinutes).toBe(2);
    expect(parsed.observations[0].oracleAgeMinutes).not.toBeNull();
  });

  it("rejects malformed, duplicate, out-of-order, mixed-currency, and oversized series", () => {
    expect(() => parseStockGapSeries({ ...base, schemaVersion: 2 })).toThrow();
    expect(() => parseStockGapSeries({ ...base, observations: [base.observations[0], { ...base.observations[1], timestamp: "bad" }] })).toThrow();
    expect(() => parseStockGapSeries({ ...base, observations: [base.observations[0], { ...base.observations[1], timestamp: base.observations[0].timestamp }] })).toThrow(/unique and strictly increasing/);
    expect(() => parseStockGapSeries({ ...base, observations: [base.observations[1], base.observations[0]] })).toThrow(/unique and strictly increasing/);
    expect(() => parseStockGapSeries({ ...base, quoteCurrency: "USDG" })).toThrow(/quote currencies/);
    expect(() => parseStockGapSeries({ ...base, observations: Array(731).fill(base.observations[0]) })).toThrow(/2 to 730/);
    expect(() => parseStockGapSeries({ ...base, observations: [{ ...base.observations[0], dexPrice: `1.${"1".repeat(37)}` }, base.observations[1]] })).toThrow();
  });

  it("rejects unsupported chains, non-EVM identities, and source times before the series", () => {
    expect(() => parseStockGapSeries({ ...base, instrument: { ...base.instrument, chainId: 8453 } })).toThrow(/4663/);
    expect(() => parseStockGapSeries({ ...base, instrument: { ...base.instrument, address: "stock:AAPL" } })).toThrow(/20-byte EVM address/);
    expect(() => parseStockGapSeries({ ...base, observedAt: "2026-09-24T09:30:00Z" })).toThrow(/at or after every observation/);
  });

  it("preserves corporate-action state and marks omitted or unknown state as uncertain", () => {
    const states = ["none_reported", "announced", "effective", "unknown"] as const;
    for (const state of states) {
      const rowAction = state === "announced" || state === "effective"
        ? { state, description: `${state} split` }
        : { state };
      const result = parseStockGapSeries({
        ...base,
        observations: base.observations.map((row) => ({ ...row, corporateAction: rowAction })),
      });
      expect(result.observations[0].corporateAction.state).toBe(state);
      expect(result.warnings.includes("corporate_action_state_unknown")).toBe(state === "unknown");
    }
    const omitted = parseStockGapSeries({ ...base, observations: base.observations.map((row) => {
      const copy = { ...row };
      delete copy.corporateAction;
      return copy;
    }) });
    expect(omitted.observations[0].corporateAction).toEqual({ state: "unknown" });
    expect(omitted.warnings).toContain("corporate_action_state_unknown");
  });

  it("rejects missing or extraneous corporate-action descriptions", () => {
    for (const corporateAction of [{ state: "announced" }, { state: "effective" }, { state: "unknown", description: "unclear" }, { state: "none_reported", description: "none" }]) {
      expect(() => parseStockGapSeries({
        ...base,
        observations: base.observations.map((row) => ({ ...row, corporateAction })),
      })).toThrow(/corporateAction/);
    }
  });

  it("rejects future oracle timestamps, unsafe chart values, and unknown row session values", () => {
    const oracle = { ...base, referenceType: "oracle", observations: base.observations.map((row) => asOracleRow(row, "2026-09-24T09:31:00Z")) };
    expect(() => parseStockGapSeries(oracle)).toThrow(/must not be later/);
    expect(() => parseStockGapSeries({ ...base, observations: [base.observations[0], { ...base.observations[1], dexPrice: "1000000000000" }] })).toThrow(/safe chart range/);
    expect(() => parseStockGapSeries({ ...base, observations: [base.observations[0], { ...base.observations[1], session: "holiday" }] })).toThrow(/session/);
  });
});
