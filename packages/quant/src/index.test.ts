import { describe, expect, it } from "vitest";
import {
  datasetHash,
  runQuant,
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
