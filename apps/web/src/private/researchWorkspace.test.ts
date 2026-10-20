import { describe, expect, it } from "vitest";
import type { SourceCitation } from "../dashboard/types";
import {
  cumulativeHolders,
  holderChartGeometry,
  transferReadCounts,
  holderObservations,
  sourceReadTimeline,
  transferObservations,
} from "./researchWorkspace";

const address = `0x${"1".repeat(40)}`;
const burn = "0x000000000000000000000000000000000000dEaD";
describe("detailed research presentation records", () => {
  it("retains exact shares, classifies burns first, and keeps missing/invalid values unknown", () => {
    const rows = holderObservations({
      topHolders: [
        { address, share: "12.123456789", isPool: true },
        { address: burn, share: 0, isContract: true },
        { address, share: "101" },
        { address },
      ],
    });
    expect(rows.map((row) => row.shareText)).toEqual([
      "12.123456789%",
      "0%",
      null,
      null,
    ]);
    expect(rows.map((row) => row.classification)).toEqual([
      "pool",
      "burn",
      "unknown",
      "unknown",
    ]);
    expect(
      holderObservations({
        holderCoverage: "unavailable",
        topHolders: [{ address, share: 50 }],
      }),
    ).toEqual([]);
  });
  it("preserves token precision and never assumes decimals or an ETH unit", () => {
    const row = { from: address, to: burn, rawValue: "3051092649036413974024" };
    expect(
      transferObservations({
        decimals: 18,
        symbol: "FIX",
        recentTransfers: [row],
      })[0],
    ).toMatchObject({ amount: "3,051.092649036413974024", symbol: "FIX" });
    expect(
      transferObservations({ recentTransfers: [row] })[0].amount,
    ).toBeNull();
    expect(
      transferObservations({
        recentTransfers: [
          { ...row, formattedValue: "0", tokenSymbol: "A\u200bB" },
        ],
      })[0],
    ).toMatchObject({ amount: "0", symbol: "A[U+200B]B" });
    expect(
      transferObservations({
        activityCoverage: "unavailable",
        recentTransfers: [row],
      }),
    ).toEqual([]);
  });
  it("orders valid source receipts without inventing dates or mutating the sources", () => {
    const sources = [
      { id: "later", fetchedAt: "2026-10-17T12:00:00Z" },
      { id: "missing", fetchedAt: "unknown" },
      { id: "first", fetchedAt: "2026-10-16T12:00:00Z" },
      { id: "same-time", fetchedAt: "2026-10-16T12:00:00Z" },
    ] as SourceCitation[];
    expect(sourceReadTimeline(sources).map((row) => row.id)).toEqual([
      "first",
      "same-time",
      "later",
    ]);
    expect(sources[0].id).toBe("later");
    expect(sourceReadTimeline([])).toEqual([]);
  });
});

describe("bounded cumulative holder geometry", () => {
  it("sorts wallet shares, excludes burns and pools, and stops at the supplied rank", () => {
    const facts = {
      topHolders: [
        { address: burn, share: 35 },
        { address: `0x${"2".repeat(40)}`, share: 12, isPool: true },
        { address, share: "4.25" },
        { address: `0x${"3".repeat(40)}`, share: "15.125" },
      ],
    };
    const points = cumulativeHolders(facts);
    expect(
      points.map(({ rank, cumulative }) => ({ rank, cumulative })),
    ).toEqual([
      { rank: 1, cumulative: 15.125 },
      { rank: 2, cumulative: 19.375 },
    ]);
    expect(facts.topHolders[0].address).toBe(burn);
    expect(points).toHaveLength(2);
  });
  it("refuses unknown, invalid or inconsistent shares and respects unavailable coverage", () => {
    expect(
      cumulativeHolders({ topHolders: [{ address, share: null }] }),
    ).toEqual([]);
    expect(
      cumulativeHolders({ topHolders: [{ address, share: 101 }] }),
    ).toEqual([]);
    expect(
      cumulativeHolders({
        topHolders: [
          { address, share: 60 },
          { address: burn, share: 20, isBurn: false },
          { address: `0x${"4".repeat(40)}`, share: 50 },
        ],
      }),
    ).toEqual([]);
    expect(
      cumulativeHolders({
        holderCoverage: "unavailable",
        topHolders: [{ address, share: 20 }],
      }),
    ).toEqual([]);
    expect(cumulativeHolders({})).toEqual([]);
  });
  it("positions powers of ten equally and maps 0–100 percent to the plot bounds", () => {
    for (const width of [220, 600, 900]) {
      const g = holderChartGeometry(
        [
          { rank: 1, cumulative: 10 },
          { rank: 10, cumulative: 30 },
          { rank: 100, cumulative: 75 },
        ],
        width,
        212,
      );
      expect(g.x(10) - g.x(1)).toBeCloseTo(g.x(100) - g.x(10));
      expect(g.y(100)).toBe(g.top);
      expect(g.y(0)).toBe(212 - g.bottom);
      expect(g.points[2].x).toBeLessThanOrEqual(width - g.right);
      expect(g.points[2].y).toBeGreaterThanOrEqual(g.top);
    }
  });
  it("groups only supplied transfer timestamps, without turning absent dates into observations", () => {
    const row = { from: address, to: burn, timestamp: "2026-10-18T12:00:00Z" };
    expect(
      transferReadCounts({
        recentTransfers: [
          row,
          row,
          { ...row, timestamp: undefined },
          { ...row, timestamp: "invalid" },
        ],
      }),
    ).toEqual([{ time: "2026-10-18T12:00:00.000Z", count: 2 }]);
    expect(
      transferReadCounts({
        activityCoverage: "unavailable",
        recentTransfers: [row],
      }),
    ).toEqual([]);
  });
});
