import { describe, expect, it } from "vitest";
import { analyzeFundingRecords } from "./funding-records";

const rec = (overrides: Record<string, unknown> = {}) => {
  const timestamp = (overrides.timestamp as string | undefined) ?? "2026-09-20T08:00:00Z";
  const provenance = (overrides.provenance as { source: string; observedAt: string } | undefined) ?? { source: "manual export", observedAt: new Date(Date.parse(timestamp) + 300_000).toISOString().replace(".000Z", "Z") };
  return ({
  venue: "Venue A", instrument: { chainId: 1, market: "ethereum:BTC-PERP" }, timestamp,
  status: "realized", quotedIntervalSeconds: 28_800, paidIntervalSeconds: 28_800, direction: "paid",
  notionalConvention: "linear quote notional", notional: "1000", quoteUnit: "USDC", amount: "1.25",
  provenance, ...overrides,
  });
};
const dataset = (...records: unknown[]) => ({ schemaVersion: 1, records });

describe("funding record analysis", () => {
  it("uses paid-negative and received-positive signs with exact decimal totals", () => {
    const result = analyzeFundingRecords(dataset(rec(), rec({ timestamp: "2026-09-20T16:00:00Z", direction: "received", amount: "0.4" }), rec({ timestamp: "2026-09-21T00:00:00Z", amount: "0.000000000000000001" })));
    expect(result.realizedNet).toBe("-0.850000000000000001");
  });
  it("keeps predictions out of realized cumulative funding and preserves both intervals", () => {
    const result = analyzeFundingRecords(dataset(rec(), rec({ status: "predicted", timestamp: "2026-09-20T16:00:00.125Z", direction: "received", amount: "99", quotedIntervalSeconds: 3600, paidIntervalSeconds: 1800, provenance: { source: "forecast", observedAt: "2026-09-20T16:00:00Z" } })));
    expect(result.realizedNet).toBe("-1.25");
    expect(result.predictedCount).toBe(1);
    expect(result.records[1]?.quotedIntervalSeconds).toBe(3600);
    expect(result.records[1]?.paidIntervalSeconds).toBe(1800);
    expect(result.chartData).toEqual([{ timestamp: "2026-09-20T08:00:00Z", value: -1.25 }]);
    expect(result.cumulativeByRecord).toEqual(["-1.25", ""]);
  });
  it("accepts valid fractional UTC milliseconds and enforces realized point-in-time provenance", () => {
    const fractional = rec({ timestamp: "2026-09-20T08:00:00.125Z", provenance: { source: "observed", observedAt: "2026-09-20T08:00:00.125Z" } });
    expect(analyzeFundingRecords(dataset(fractional)).records[0]?.timestamp).toBe("2026-09-20T08:00:00.125Z");
    const earlyProvenance = rec({ provenance: { source: "early", observedAt: "2026-09-20T07:59:59.999Z" } });
    expect(() => analyzeFundingRecords(dataset(earlyProvenance))).toThrow(/cannot precede settlement/);
  });
  it("refuses a chart when exact cumulative units exceed safe Number bounds", () => {
    const result = analyzeFundingRecords(dataset(rec({ amount: "9999999999999999", notional: "9999999999999999" })));
    expect(result.realizedNet).toBe("-9999999999999999");
    expect(result.chartData).toBeNull();
  });
  it("rejects duplicate or out-of-order timestamps", () => {
    expect(() => analyzeFundingRecords(dataset(rec(), rec()))).toThrow(/strictly increasing/);
    expect(() => analyzeFundingRecords(dataset(rec({ timestamp: "2026-09-20T16:00:00Z" }), rec()))).toThrow(/strictly increasing/);
  });
  it("rejects mixed venues, instruments, units, ambiguous signs, and implausible amounts", () => {
    expect(() => analyzeFundingRecords(dataset(rec(), rec({ timestamp: "2026-09-20T16:00:00Z", quoteUnit: "USD" })))).toThrow(/one venue/);
    expect(() => analyzeFundingRecords(dataset(rec(), rec({ timestamp: "2026-09-20T16:00:00Z", instrument: { chainId: 10, market: "optimism:BTC-PERP" } })))).toThrow(/one venue/);
    expect(() => analyzeFundingRecords(dataset(rec({ direction: "unknown" })))).toThrow(/Direction/);
    expect(() => analyzeFundingRecords(dataset(rec({ amount: "1001" })))).toThrow(/cannot exceed notional/);
  });
  it("requires explicit intervals, provenance, status, and bounded records", () => {
    expect(() => analyzeFundingRecords(dataset(rec({ provenance: { source: "x" } })))).toThrow(/observedAt/);
    expect(() => analyzeFundingRecords({ schemaVersion: 1, records: Array.from({ length: 501 }, (_, i) => rec({ timestamp: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString().replace(".000", "") })) })).toThrow(/Record count/);
  });
});
