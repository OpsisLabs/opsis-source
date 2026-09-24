import { describe, expect, it } from "vitest";
import {
  observedCorrelationMatrix,
  type PriceDataset,
} from "./index";

const start = Date.UTC(2020, 0, 1);
const dataset = (
  id: number,
  returns: readonly number[],
  options: { offset?: number; quoteCurrency?: string; chainId?: number } = {},
): PriceDataset => {
  let price = 100;
  const offset = options.offset ?? 0;
  const observations = Array.from({ length: returns.length + 1 }, (_, index) => {
    if (index > 0) price *= 1 + returns[index - 1]!;
    return {
      date: new Date(start + (offset + index) * 86_400_000).toISOString().slice(0, 10),
      price,
    };
  });
  return {
    schemaVersion: 1,
    instrument: {
      chainId: options.chainId ?? 4663,
      address: `0x${id.toString(16).padStart(40, "0")}`,
      symbol: `T${id}`,
    },
    quoteCurrency: options.quoteCurrency ?? "USD",
    clock: "daily_crypto_24_7",
    provenance: { source: "fixture", observedAt: "2026-09-01T00:00:00Z" },
    observations,
  };
};
const pattern = (count: number, scale = 1) =>
  Array.from({ length: count }, (_, index) => (index % 2 === 0 ? 0.04 : -0.02) * scale);

describe("observed correlation matrix", () => {
  it("returns symmetric positive and negative Pearson correlations with directional beta", () => {
    const returns = pattern(60);
    const matrix = observedCorrelationMatrix([
      dataset(1, returns),
      dataset(2, returns.map((value) => -value / 2)),
    ]);
    expect(matrix.matchedReturns).toBe(60);
    expect(matrix.cells[0]![1]!.correlation).toBeCloseTo(-1, 12);
    expect(matrix.cells[1]![0]!.correlation).toBeCloseTo(-1, 12);
    expect(matrix.cells[0]![1]!.beta).toBeCloseTo(-2, 12);
    expect(matrix.cells[1]![0]!.beta).toBeCloseTo(-0.5, 12);
    const positive = observedCorrelationMatrix([
      dataset(1, returns),
      dataset(3, returns.map((value) => value * 2)),
    ]);
    expect(positive.cells[0]![1]!.correlation).toBeCloseTo(1, 12);
    expect(positive.cells[0]![1]!.beta).toBeCloseTo(0.5, 12);
    expect(positive.cells[0]![0]!.correlation).toBe(1);
  });

  it("keeps flat-series cells undefined and reports shifted common windows", () => {
    const flat = dataset(1, Array.from({ length: 70 }, () => 0));
    const shifted = dataset(2, pattern(65), { offset: 5 });
    const matrix = observedCorrelationMatrix([flat, shifted]);
    expect(matrix.commonWindow.startDate).toBe(shifted.observations[0]!.date);
    expect(matrix.commonWindow.endDate).toBe(flat.observations.at(-1)!.date);
    expect(matrix.matchedReturns).toBe(65);
    expect(matrix.cells[0]![0]!.correlation).toBeNull();
    expect(matrix.cells[0]![1]!.beta).toBeNull();
    expect(matrix.cells[1]![0]!.correlation).toBeNull();
  });

  it("requires 60 synchronized returns and warns below the preferred 120", () => {
    expect(() => observedCorrelationMatrix([dataset(1, pattern(59)), dataset(2, pattern(59))])).toThrow(/At least 60/);
    expect(() => observedCorrelationMatrix([dataset(1, pattern(731)), dataset(2, pattern(731))])).toThrow(/limited to 730/);
    const matrix = observedCorrelationMatrix([dataset(1, pattern(60)), dataset(2, pattern(60))]);
    expect(matrix.matchedReturns).toBe(60);
    expect(matrix.warnings).toHaveLength(1);
    expect(matrix.warnings[0]).toMatch(/120 or more are preferred/);
    const preferred = observedCorrelationMatrix([dataset(1, pattern(120)), dataset(2, pattern(120))]);
    expect(preferred.warnings).toEqual([]);
  });

  it("refuses quote, clock, identity, invalid observation, and extreme numerical mismatches", () => {
    expect(() => observedCorrelationMatrix([
      dataset(1, pattern(60)), dataset(2, pattern(60), { quoteCurrency: "EUR" }),
    ])).toThrow(/same quote currency/);
    expect(() => observedCorrelationMatrix([
      dataset(1, pattern(60)), dataset(1, pattern(60)),
    ])).toThrow(/distinct chain-qualified/);
    const wrongClock = dataset(6, pattern(60));
    wrongClock.clock = "weekly" as PriceDataset["clock"];
    expect(() => observedCorrelationMatrix([dataset(1, pattern(60)), wrongClock])).toThrow(/daily crypto 24\/7/);
    const invalid = dataset(3, pattern(60));
    invalid.observations[10]!.date = invalid.observations[9]!.date;
    expect(() => observedCorrelationMatrix([dataset(1, pattern(60)), invalid])).toThrow(/Duplicate date/);
    const extreme = dataset(4, pattern(60));
    extreme.observations[0]!.price = Number.MIN_VALUE;
    extreme.observations[1]!.price = Number.MAX_VALUE / 4;
    expect(() => observedCorrelationMatrix([extreme, dataset(5, pattern(60))])).toThrow(/numeric precision/);
  });
});
