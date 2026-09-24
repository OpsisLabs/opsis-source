import { describe, expect, it } from "vitest";
import { analyzeBasisRecords } from "./basis-records";

const fixture = {
  schemaVersion: 1,
  venue: "Synthetic Venue",
  chainId: 1,
  market: "ethereum:EXAMPLE-PERP",
  quoteUnit: "USD",
  records: [
    { timestamp: "2026-09-20T08:00:00Z", markPrice: "101.25", indexPrice: "100", markProvenance: { source: "Synthetic", observedAt: "2026-09-20T08:00:00Z" }, indexProvenance: { source: "Synthetic", observedAt: "2026-09-20T08:00:00Z" } },
    { timestamp: "2026-09-20T09:00:00Z", markPrice: "99", indexPrice: "100", markProvenance: { source: "Synthetic", observedAt: "2026-09-20T09:00:00Z" }, indexProvenance: { source: "Synthetic", observedAt: "2026-09-20T09:00:00Z" } },
  ],
};

describe("basis records", () => {
  it("computes signed basis with exact decimal integer math", () => {
    const result = analyzeBasisRecords(fixture);
    expect(result.points.map((point) => point.basisBps)).toEqual(["125", "-100"]);
    expect(result.points[0]?.markPrice).toBe("101.25");
    expect(result.chartData?.map((point) => point.value)).toEqual([125, -100]);
  });
  it("refuses stale pairings and timestamps that do not increase", () => {
    const stale = structuredClone(fixture);
    stale.records[1]!.indexProvenance.observedAt = "2026-09-20T08:00:00Z";
    expect(() => analyzeBasisRecords(stale)).toThrow(/observed exactly/);
    const unordered = structuredClone(fixture);
    unordered.records[1]!.timestamp = "2026-09-20T07:00:00Z";
    expect(() => analyzeBasisRecords(unordered)).toThrow(/strictly increasing/);
  });
  it("refuses price precision outside the declared limit", () => {
    const invalid = structuredClone(fixture);
    invalid.records[0]!.markPrice = "1.0000000000000000001";
    expect(() => analyzeBasisRecords(invalid)).toThrow(/18 fractional digits/);
  });
});
