import { describe, expect, it } from "vitest";
import {
  datasetHash,
  observedReturnHistogram,
  runQuant,
  observedDrawdown,
  validateDataset,
  type PriceDataset,
} from "./index";

const dataset = (count = 40): PriceDataset => ({
  schemaVersion: 1,
  instrument: {
    chainId: 4663,
    address: "0x0000000000000000000000000000000000000abc",
    symbol: "TEST",
  },
  quoteCurrency: "USD",
  clock: "daily_crypto_24_7",
  provenance: {
    source: "synthetic fixture",
    observedAt: "2026-09-01T00:00:00Z",
  },
  synthetic: true,
  observations: Array.from({ length: count }, (_, n) => ({
    date: new Date(Date.UTC(2026, 0, n + 1)).toISOString().slice(0, 10),
    price: 100 + n,
  })),
});

describe("observed return histogram", () => {
  it("declares exact edges, includes both sample endpoints and conserves counts", () => {
    const histogram = observedReturnHistogram([-0.1, -0.05, 0, 0.05, 0.1], 4, 0.05);
    expect(histogram.edges).toHaveLength(5);
    expect(histogram.edges[0]).toBe(-0.1);
    expect(histogram.edges.at(-1)).toBe(0.1);
    expect(histogram.counts).toEqual([1, 1, 1, 2]);
    expect(histogram.counts.reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(histogram.negativeTailCount).toBe(2);
    expect(histogram.positiveTailCount).toBe(2);
  });
  it("centers identical returns in a declared range and rejects empty or nonfinite input", () => {
    const histogram = observedReturnHistogram([0, 0, 0], 4);
    expect(histogram.counts.reduce((sum, count) => sum + count, 0)).toBe(3);
    expect(histogram.counts[2]).toBe(3);
    expect(histogram.negativeTailCount).toBe(0);
    expect(histogram.positiveTailCount).toBe(0);
    expect(() => observedReturnHistogram([])).toThrow(/non-empty/);
    expect(() => observedReturnHistogram([0, NaN])).toThrow(/finite/);
    expect(() => observedReturnHistogram([-1])).toThrow(/greater than -1/);
    expect(() => observedReturnHistogram([1, 1 + Number.EPSILON * 4], 100)).toThrow(/distinct numeric edges/);
  });
});

describe("quant dataset contract", () => {
  it("refuses duplicates, gaps and short history", () => {
    const invalid = dataset(4);
    invalid.observations[2]!.date = invalid.observations[1]!.date;
    const result = validateDataset(invalid, new Date("2026-12-01T00:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.issues.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "duplicate_date",
        "out_of_order",
        "insufficient_history",
      ]),
    );
  });
  it("is reproducible and handles a flat series", async () => {
    const flat = dataset(40);
    flat.observations = flat.observations.map((row) => ({
      ...row,
      price: 100,
    }));
    const a = runQuant(flat, {
      bootstrapRuns: 20,
      seed: 42,
      confidence: 0.9,
      researchMode: true,
    });
    const b = runQuant(flat, {
      bootstrapRuns: 20,
      seed: 42,
      confidence: 0.9,
      researchMode: true,
    });
    expect(a).toEqual(b);
    expect(a.stats.volatilityAnnualized).toBe(0);
    expect(a.bootstrap.terminal.median).toBe(1);
    expect(a.bootstrap.path[0]?.bands).toEqual([
      { confidence: 0.5, low: 1, high: 1 },
      { confidence: 0.8, low: 1, high: 1 },
      { confidence: 0.95, low: 1, high: 1 },
    ]);
    expect(a.bootstrap.path.every((point) => point.bands.every((band) => band.low === 1 && band.high === 1))).toBe(true);
    expect(await datasetHash(flat)).toHaveLength(64);
  });
  it("returns a structured refusal for missing metadata and requires 180 returns by default", () => {
    expect(() => validateDataset({ observations: [] })).not.toThrow();
    expect(() =>
      runQuant(dataset(40), {
        bootstrapRuns: 20,
        seed: 1,
        confidence: 0.9,
        researchMode: false,
      }),
    ).toThrow(/180/);
  });
  it("honors cancellation before allocating a complete path", () => {
    const long = dataset(200);
    let checks = 0;
    expect(() =>
      runQuant(
        long,
        { bootstrapRuns: 20, seed: 1, confidence: 0.9, researchMode: true },
        () => {
          checks += 1;
          return checks > 2;
        },
      ),
    ).toThrow("cancelled");
  });
});

it("rejects null rows, malformed dates/provenance and numeric overflow", () => {
  for (const value of [
    { ...dataset(), observations: [null] },
    { ...dataset(), synthetic: "yes" },
    {
      ...dataset(),
      provenance: { source: "test", observedAt: "2099-01-01T00:00:00Z" },
    },
  ])
    expect(validateDataset(value).ok).toBe(false);
  const crash = dataset();
  crash.observations[2]!.price = Number.MIN_VALUE;
  expect(() =>
    runQuant(crash, {
      seed: 2,
      bootstrapRuns: 20,
      confidence: 0.9,
      researchMode: true,
    }),
  ).toThrow(/precision|overflow/i);
});
it("canonicalizes key order and rejects aliased/out-of-range seeds", async () => {
  const a = dataset();
  const b = {
    ...a,
    instrument: {
      symbol: a.instrument.symbol,
      address: a.instrument.address,
      chainId: a.instrument.chainId,
    },
    provenance: {
      observedAt: a.provenance.observedAt,
      source: a.provenance.source,
    },
  };
  expect(await datasetHash(a)).toBe(await datasetHash(b));
  for (const seed of [-1, 4294967296, NaN, Infinity])
    expect(() =>
      runQuant(a, {
        seed,
        bootstrapRuns: 20,
        confidence: 0.9,
        researchMode: true,
      }),
    ).toThrow();
});
it("nonflat seeded paths reproduce, report thin tails and preserve a crash drawdown", () => {
  const a = dataset(190);
  a.observations.forEach((row, n) => {
    row.price = 100 * (n % 3 === 0 ? 1 : 0.9) * (n < 90 ? 1 : 0.5);
  });
  const spec = {
    seed: 42,
    bootstrapRuns: 30,
    confidence: 0.9,
    researchMode: false,
  };
  const first = runQuant(a, spec);
  expect(first).toEqual(runQuant(a, spec));
  expect(first.stats.maxDrawdown).toBe(-0.55);
  expect(first.bootstrap.path[0]!.median).toBe(1);
  expect(first.manifest.units).toBe("normalized_wealth");
  const trend = runQuant(dataset(), { ...spec, researchMode: true });
  expect(trend.stats.tailCount).toBeLessThan(20);
  expect(trend.stats.warnings).toHaveLength(1);
});

it("moving-block bootstrap preserves contiguous return stretches and records its model", () => {
  const input = dataset(40);
  const factors = [1.01, 0.98, 1.04, 0.97, 1.02, 0.99, 1.03];
  input.observations.forEach((row, index) => {
    if (index > 0) row.price = input.observations[index - 1]!.price * factors[(index - 1) % factors.length]!;
  });
  const spec = {
    seed: 17, bootstrapRuns: 1, confidence: 0.9, researchMode: true,
    model: "historical_moving_block_bootstrap" as const, blockLength: 3,
  };
  const first = runQuant(input, spec);
  expect(first).toEqual(runQuant(input, spec));
  expect(first.manifest).toMatchObject({ model: spec.model, modelVersion: "1", blockLength: 3, horizon: 39 });
  const sourceFactors = input.observations.slice(1).map((row, index) => row.price / input.observations[index]!.price);
  const sampledFactors = first.bootstrap.path.slice(1).map((point, index) => point.median / first.bootstrap.path[index]!.median);
  for (let offset = 0; offset < sampledFactors.length; offset += 3) {
    const block = sampledFactors.slice(offset, offset + 3);
    const found = sourceFactors.some((_, start) => start + 3 <= sourceFactors.length
      && block.every((factor, index) => Math.abs(factor - sourceFactors[start + index]!) < 1e-10));
    expect(found).toBe(true);
  }
});

it("runs seeded single-instrument lognormal GBM comparisons with estimated parameters", () => {
  const input = dataset(40);
  const factors = [1.02, 0.97, 1.05, 0.99, 1.01];
  input.observations.forEach((row, index) => {
    if (index > 0) row.price = input.observations[index - 1]!.price * factors[(index - 1) % factors.length]!;
  });
  const spec = { seed: 4321, bootstrapRuns: 80, confidence: 0.9, researchMode: true, model: "gbm_parametric_comparison" as const };
  const result = runQuant(input, spec);
  expect(result).toEqual(runQuant(input, spec));
  expect(result).not.toEqual(runQuant(input, { ...spec, seed: 4322 }));
  const logs = input.observations.slice(1).map((row, index) => Math.log(row.price / input.observations[index]!.price));
  const mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const variance = logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logs.length - 1);
  expect(result.manifest.model).toBe("gbm_parametric_comparison");
  expect(result.manifest.estimatedParameters).toEqual({ dailyLogReturnMean: mean, dailyLogReturnSampleVariance: variance });
  expect(result.bootstrap.path).toHaveLength(input.observations.length);
  expect(result.bootstrap.path[0]).toMatchObject({ low: 1, median: 1, high: 1 });
  expect(result.bootstrap.path.at(-1)!.bands.map((band) => band.confidence)).toEqual([0.5, 0.8, 0.95]);
  expect(result.manifest.assumptions.join(" ")).toMatch(/not an observed distribution, forecast, price target, investment advice, or venue\/liquidation result/);
  const flat = dataset(40);
  flat.observations.forEach((row) => { row.price = 100; });
  const flatRun = runQuant(flat, spec);
  expect(flatRun.bootstrap.path.every((point) => point.low === 1 && point.median === 1 && point.high === 1)).toBe(true);
  const extreme = dataset(40);
  extreme.observations.forEach((row, index) => { row.price = index % 2 ? 1e300 : 1e-300; });
  expect(() => runQuant(extreme, spec)).toThrow(/precision|overflow|underflow/i);
  expect(() => runQuant(input, { ...spec, blockLength: 3 })).toThrow(/Block length/);
});

it("returns deterministic nested pointwise 50/80/95 bands from each seeded path ensemble", () => {
  const input = dataset();
  input.observations.forEach((row, index) => {
    if (index > 0) row.price = input.observations[index - 1]!.price * [0.9, 1.1, 1.03, 0.97][(index - 1) % 4]!;
  });
  const spec = { seed: 314, bootstrapRuns: 100, confidence: 0.9, researchMode: true };
  const first = runQuant(input, spec);
  expect(first).toEqual(runQuant(input, spec));
  expect(first.bootstrap.path[4]!.bands.map((band) => band.confidence)).toEqual([0.5, 0.8, 0.95]);
  for (const point of first.bootstrap.path) {
    const [fifty, eighty, ninetyFive] = point.bands;
    expect(fifty!.low).toBeLessThanOrEqual(point.median);
    expect(fifty!.high).toBeGreaterThanOrEqual(point.median);
    expect(eighty!.low).toBeLessThanOrEqual(fifty!.low);
    expect(eighty!.high).toBeGreaterThanOrEqual(fifty!.high);
    expect(ninetyFive!.low).toBeLessThanOrEqual(eighty!.low);
    expect(ninetyFive!.high).toBeGreaterThanOrEqual(eighty!.high);
  }
  expect(first.bootstrap.path[4]!.bands[0]!.confidence).toBe(0.5);
  expect(first.bootstrap.path[4]!.bands[0]!.low).toBeCloseTo(0.91773, 5);
  expect(first.bootstrap.path[4]!.bands[0]!.high).toBeCloseTo(1.12167, 5);
  expect(first.bootstrap.path[4]!.low).toBeCloseTo(0.8019, 4);
  expect(first.bootstrap.path[4]!.high).toBeCloseTo(1.208911, 5);
});

it("refuses invalid moving-block settings while leaving the IID default unchanged", () => {
  const input = dataset();
  const base = { seed: 1, bootstrapRuns: 5, confidence: 0.9, researchMode: true };
  expect(runQuant(input, base).manifest.model).toBe("historical_iid_bootstrap");
  for (const length of [undefined, 1, 20, 31, 1.5, NaN, Infinity]) {
    expect(() => runQuant(input, { ...base, model: "historical_moving_block_bootstrap", blockLength: length })).toThrow(/Block length/);
  }
  expect(() => runQuant(input, { ...base, model: "historical_iid_bootstrap", blockLength: 3 })).toThrow(/Block length/);
  let checks = 0;
  expect(() => runQuant(input, { ...base, model: "historical_moving_block_bootstrap", blockLength: 3 }, () => ++checks > 2)).toThrow("cancelled");
});

it("dates observed peak-to-trough drawdown and recovery without treating it as a simulation", () => {
  const input = dataset(31);
  input.observations.forEach((row) => { row.price = 100; });
  const flat = observedDrawdown(input);
  expect(flat.points).toHaveLength(31);
  expect(flat.points.every((point) => point.drawdown === 0)).toBe(true);
  input.observations[10]!.price = 120;
  input.observations[11]!.price = 60;
  input.observations[12]!.price = 120;
  const observed = observedDrawdown(input);
  expect(observed.points[11]).toEqual({
    date: input.observations[11]!.date,
    peakDate: input.observations[10]!.date,
    drawdown: -0.5,
  });
  expect(observed.points[12]!.drawdown).toBe(0);
  expect(observed.maxDrawdown).toBe(-0.5);
});

it("refuses gapped or numerically unrepresentable observed drawdown inputs", () => {
  const gapped = dataset(31);
  gapped.observations.splice(4, 1);
  expect(() => observedDrawdown(gapped)).toThrow(/consecutive/);
  const extreme = dataset(31);
  extreme.observations.forEach((row) => { row.price = 1e200; });
  extreme.observations[4]!.price = 1e-200;
  expect(() => observedDrawdown(extreme)).toThrow(/precision/);
});
