import { describe, expect, it } from "vitest";
import { chartMax, niceScale, waterfall, type ChartRow } from "./chart";

const labels = { before: "Starting value", after: "After this scenario" };
const row = (id: string, before: bigint, delta: bigint, percent: number | null): ChartRow => ({
  id,
  label: id,
  before,
  after: before + delta,
  delta,
  percent,
});

describe("stress chart geometry", () => {
  it("walks from the starting total through each position's change to the result", () => {
    const rows = [row("a", 600000n, -180000n, -30), row("b", 250000n, 0n, 0), row("c", 150000n, 15000n, 10)];
    const bars = waterfall(rows, 1000000n, 835000n, labels);
    expect(bars.map((bar) => [bar.id, bar.kind, bar.low, bar.high, bar.value])).toEqual([
      ["before", "total", 0n, 1000000n, 1000000n],
      ["a", "down", 820000n, 1000000n, -180000n],
      ["b", "flat", 820000n, 820000n, 0n],
      ["c", "up", 820000n, 835000n, 15000n],
      ["after", "total", 0n, 835000n, 835000n],
    ]);
    expect(chartMax(rows, bars)).toBe(1000000n);
  });

  it("refuses a result that does not equal the start plus every change", () => {
    expect(() => waterfall([row("a", 100n, -10n, -10)], 100n, 95n, labels)).toThrow("waterfall");
  });

  it("rounds the axis to readable steps", () => {
    expect(niceScale(1000000)).toEqual({ max: 1000000, step: 200000 });
    expect(niceScale(1210000)).toEqual({ max: 1250000, step: 250000 });
    expect(niceScale(7)).toEqual({ max: 8, step: 2 });
    expect(niceScale(0)).toEqual({ max: 1, step: 1 });
  });
});
