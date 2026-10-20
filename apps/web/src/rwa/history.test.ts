import { describe, expect, it } from "vitest";
import { parseStockGapSeries } from "../opsis/stock-gap-series";
import {
  gapExtent,
  gapHistogram,
  gapMedian,
  historySegments,
  historyMatches,
} from "./history";

const series = (values = ["90", "100", "110", "120"]) =>
  parseStockGapSeries({
    schemaVersion: 1,
    instrument: {
      chainId: 4663,
      address: `0x${"ab".repeat(20)}`,
      symbol: "SAMPLE-STOCK",
    },
    quoteCurrency: "USD",
    referenceQuoteCurrency: "USD",
    referenceType: "underlying",
    sourceName: "Synthetic test fixture",
    observedAt: "2026-09-05T00:00:00Z",
    observations: values.map((dexPrice, index) => ({
      timestamp: `2026-09-0${index + 1}T12:00:00Z`,
      dexPrice,
      referencePrice: "100",
      multiplier: "1",
      session: "open",
    })),
  });

describe("RWA history presentation", () => {
  it("requires exact chain and contract identity; a symbol cannot join lookup and history", () => {
    const data = series();
    expect(historyMatches(data, null)).toBe(true);
    expect(
      historyMatches(data, {
        chainId: 4663,
        address: data.instrument.address.toUpperCase(),
      }),
    ).toBe(true);
    expect(
      historyMatches(data, { chainId: 1, address: data.instrument.address }),
    ).toBe(false);
    expect(
      historyMatches(data, { chainId: 4663, address: `0x${"cd".repeat(20)}` }),
    ).toBe(false);
  });
  it("keeps exact endpoints and includes zero on a padded chart axis", () => {
    expect(gapExtent(series())).toEqual({
      min: -20,
      max: 30,
      ticks: [-20, -10, 0, 10, 20, 30],
      low: "-10.0000",
      high: "20.0000",
    });
    const flat = gapExtent(series(["100", "100"]));
    expect(flat).toMatchObject({
      min: -1,
      max: 1,
      low: "0.0000",
      high: "0.0000",
    });
  });
  it("bins every observation once including boundary and repeated values", () => {
    const bins = gapHistogram(series(), 3);
    expect(bins.map((bin) => bin.count)).toEqual([1, 1, 2]);
    expect(bins[0].from).toBe(-10);
    expect(bins.at(-1)?.to).toBe(20);
    expect(
      gapHistogram(series(["100", "100"])).reduce(
        (sum, bin) => sum + bin.count,
        0,
      ),
    ).toBe(2);
    expect(() => gapHistogram(series(), 0)).toThrow();
  });
  it("does not create samples or source ages inside a missing interval", () => {
    const data = series();
    expect(gapHistogram(data).reduce((sum, bin) => sum + bin.count, 0)).toBe(
      data.observations.length,
    );
    expect(
      data.observations.every((row) => row.oracleAgeMinutes === null),
    ).toBe(true);
    expect(data.observations.map((row) => row.timestamp)).toHaveLength(4);
  });
  it("connects adjacent observations chronologically and breaks only unusually long intervals", () => {
    const data = series();
    data.observations[3].timestamp = "2026-09-20T12:00:00Z";
    data.observations.reverse();
    const result = historySegments(data);
    expect(result.cadenceMs).toBe(86_400_000);
    expect(result.breakAfterMs).toBe(3 * 86_400_000);
    expect(
      result.segments.map((segment) => segment.map((point) => point.index)),
    ).toEqual([[3, 2, 1], [0]]);
    expect(result.segments.flat()).toHaveLength(4);
    expect(data.observations[0].timestamp).toBe("2026-09-20T12:00:00Z");
  });
  it("does not infer missing coverage from two distant samples or the break threshold itself", () => {
    const data = series(["100", "101"]);
    data.observations[1].timestamp = "2026-10-01T12:00:00Z";
    expect(historySegments(data).segments).toHaveLength(1);
    const regular = series();
    regular.observations[3].timestamp = "2026-09-06T12:00:00Z";
    expect(historySegments(regular).segments).toHaveLength(1);
  });
  it("calculates odd, even and negative exact medians without floating point rounding", () => {
    expect(gapMedian(series())).toBe("5.0000");
    expect(gapMedian(series(["90", "100", "120"]))).toBe("0.0000");
    expect(gapMedian(series(["99.9998", "99.9999"]))).toBe("-0.00015");
    expect(gapMedian(series(["100", "100.0001"]))).toBe("0.00005");
  });
  it("handles empty and single-point geometry safely", () => {
    const data = series();
    data.observations = [];
    expect(gapHistogram(data)).toEqual([]);
    expect(gapMedian(data)).toBeNull();
    expect(gapExtent(data)).toMatchObject({
      min: -1,
      max: 1,
      low: null,
      high: null,
    });
    expect(historySegments(data)).toEqual({
      segments: [],
      cadenceMs: null,
      breakAfterMs: null,
    });
    data.observations = series().observations.slice(0, 1);
    expect(historySegments(data).segments[0]).toHaveLength(1);
    expect(gapHistogram(data).reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    expect(gapMedian(data)).toBe("-10.0000");
  });
  it("keeps all values and zero within round ordered ticks for one-sided and tiny gaps", () => {
    for (const data of [
      series(["100.0001", "100.0002"]),
      series(["80", "90"]),
      series(["110", "140"]),
    ]) {
      const extent = gapExtent(data);
      expect(extent.min).toBeLessThanOrEqual(0);
      expect(extent.max).toBeGreaterThanOrEqual(0);
      expect(extent.ticks).toContain(0);
      expect(extent.min).toBeLessThan(
        Math.min(...data.observations.map((row) => row.chartGapPercent)),
      );
      expect(extent.max).toBeGreaterThan(
        Math.max(...data.observations.map((row) => row.chartGapPercent)),
      );
      expect(extent.ticks.every(Number.isFinite)).toBe(true);
    }
  });
});
