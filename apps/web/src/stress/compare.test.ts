import { describe, expect, it } from "vitest";
import {
  allocateCents,
  compareAllocations,
  deriveWeights,
  evenWeights,
  outcomeComparison,
  parseWeights,
  validateRows,
  type ComparableRow,
} from "./compare";
import { parseStrictUsdCents } from "./money";

function rows(values: Array<[string, string]>): ComparableRow[] {
  return values.map(([id, value]) => ({
    id,
    label: id.toUpperCase(),
    cents: parseStrictUsdCents(value),
  }));
}

function afterMap(
  entries: Record<string, bigint>,
): Map<string, bigint> {
  return new Map(Object.entries(entries));
}

describe("compareAllocations", () => {
  it("compares current and proposed allocations against the exact same total", () => {
    const current = rows([
      ["a", "7000"],
      ["b", "2000"],
      ["c", "1000"],
    ]);
    const proposed = [
      { id: "a", weight: "40" },
      { id: "b", weight: "30" },
      { id: "c", weight: "30" },
    ];
    const comparison = compareAllocations(current, proposed);

    expect(comparison.totalCents).toBe(1_000_000n);
    expect(comparison.rows.map((row) => row.proposedCents)).toEqual([
      400_000n,
      300_000n,
      300_000n,
    ]);
    expect(
      comparison.rows.reduce((sum, row) => sum + row.proposedCents, 0n),
    ).toBe(comparison.totalCents);
    expect(comparison.rows.map((row) => row.deltaBps)).toEqual([
      -3000,
      1000,
      2000,
    ]);
  });

  it("allocates odd cents deterministically while preserving the exact total", () => {
    const current = rows([
      ["a", "0.34"],
      ["b", "0.33"],
      ["c", "0.33"],
    ]);
    const proposed = [
      { id: "a", weight: "33.33" },
      { id: "b", weight: "33.33" },
      { id: "c", weight: "33.34" },
    ];
    const comparison = compareAllocations(current, proposed);
    expect(comparison.rows.map((row) => row.proposedCents)).toEqual([
      33n,
      33n,
      34n,
    ]);
    expect(
      comparison.rows.reduce((sum, row) => sum + row.proposedCents, 0n),
    ).toBe(100n);

    // Largest-remainder tie-break is stable by position order, not by input.
    const tie = compareAllocations(current, [
      { id: "a", weight: "33.34" },
      { id: "b", weight: "33.33" },
      { id: "c", weight: "33.33" },
    ]);
    expect(tie.rows.map((row) => row.proposedCents)).toEqual([34n, 33n, 33n]);
    expect(deriveWeights(current).map((item) => item.weight)).toEqual([
      "34",
      "33",
      "33",
    ]);
  });

  it("handles exact huge totals within the allowed bound", () => {
    const current = rows([
      ["a", "1000000000"],
      ["b", "1000000000"],
    ]);
    const comparison = compareAllocations(current, [
      { id: "a", weight: "50" },
      { id: "b", weight: "50" },
    ]);
    expect(comparison.totalCents).toBe(200_000_000_000n);
    expect(comparison.rows.map((row) => row.proposedCents)).toEqual([
      100_000_000_000n,
      100_000_000_000n,
    ]);
  });

  it("rejects weights that do not add up to exactly 100", () => {
    const current = rows([
      ["a", "1"],
      ["b", "1"],
    ]);
    expect(() =>
      compareAllocations(current, [
        { id: "a", weight: "60" },
        { id: "b", weight: "39" },
      ]),
    ).toThrow("weightSum");
    expect(() =>
      compareAllocations(current, [
        { id: "a", weight: "60.005" },
        { id: "b", weight: "39.995" },
      ]),
    ).toThrow("weightValue");
  });

  it("rejects mismatched, duplicate and empty identities", () => {
    const current = rows([
      ["a", "1"],
      ["b", "1"],
    ]);
    expect(() =>
      compareAllocations(current, [
        { id: "b", weight: "50" },
        { id: "a", weight: "50" },
      ]),
    ).toThrow("identity");
    expect(() =>
      compareAllocations(current, [{ id: "a", weight: "100" }]),
    ).toThrow("positions");
    expect(() =>
      compareAllocations(rows([["", "1"]]), [{ id: "", weight: "100" }]),
    ).toThrow("identity");
  });

  it("validates exported entrypoints against malformed direct input", () => {
    expect(() => validateRows([])).toThrow("positions");
    expect(() =>
      validateRows(
        Array.from({ length: 11 }, (_, index) => ({
          id: `p${index}`,
          label: "P",
          cents: 1n,
        })),
      ),
    ).toThrow("positions");
    expect(() =>
      validateRows([
        { id: "a", label: "A", cents: 1n },
        { id: "a", label: "A", cents: 1n },
      ]),
    ).toThrow("identity");
    expect(() =>
      validateRows([{ id: "a", label: "A", cents: -1n }]),
    ).toThrow("value");
    expect(() =>
      validateRows([
        { id: "a", label: "A", cents: 0n },
        { id: "b", label: "B", cents: 0n },
      ]),
    ).toThrow("weightSum");
    expect(() =>
      validateRows([
        { id: "a", label: "A", cents: 100_000_000_001n },
        { id: "b", label: "B", cents: 1n },
      ]),
    ).toThrow("value");
  });

  it("bounds leftover distribution and rejects bad parsed weights", () => {
    expect(() =>
      allocateCents(100n, [
        { id: "a", bps: 5000 },
        { id: "b", bps: 4000 },
      ]),
    ).toThrow("weightSum");
    expect(() =>
      allocateCents(100n, [
        { id: "a", bps: 5000 },
        { id: "a", bps: 5000 },
      ]),
    ).toThrow("identity");
    expect(() =>
      allocateCents(100n, [{ id: "a", bps: 10000.5 }]),
    ).toThrow("weightValue");
    expect(() =>
      allocateCents(100_000_000_000_000_000_000n, [
        { id: "a", bps: 10000 },
      ]),
    ).toThrow("value");
    // Valid input never distributes more than count-1 extra cents.
    const allocated = allocateCents(301n, [
      { id: "a", bps: 3333 },
      { id: "b", bps: 3333 },
      { id: "c", bps: 3334 },
    ]);
    expect(allocated).toEqual([100n, 100n, 101n]);
  });

  it("does not mutate its inputs", () => {
    const current = rows([
      ["a", "1"],
      ["b", "1"],
    ]);
    const proposed = [
      { id: "a", weight: "50" },
      { id: "b", weight: "50" },
    ];
    const snapshot = JSON.parse(JSON.stringify(proposed));
    const before = current.map((row) => ({ ...row }));
    compareAllocations(current, proposed);
    expect(proposed).toEqual(snapshot);
    expect(current).toEqual(before);
  });

  it("derives and even-splits weights that always total 100", () => {
    const current = rows([
      ["a", "1"],
      ["b", "1"],
      ["c", "1"],
    ]);
    const derived = deriveWeights(current);
    expect(deriveWeights(current).map((item) => item.weight)).toEqual([
      "33.34",
      "33.33",
      "33.33",
    ]);
    expect(
      derived.reduce(
        (sum, item) =>
          sum +
          Number(item.weight.split(".")[0]) * 100 +
          Number((item.weight.split(".")[1] ?? "").padEnd(2, "0")),
        0,
      ),
    ).toBe(10000);
    const even = evenWeights(current);
    expect(even.map((item) => item.weight)).toEqual(["33.34", "33.33", "33.33"]);
    expect(parseWeights(current, even)).toHaveLength(3);
  });
});

describe("outcomeComparison", () => {
  it("attributes the improvement to reduced exposure, not to a flat larger allocation", () => {
    const current = rows([
      ["a", "7000"],
      ["b", "2000"],
      ["c", "1000"],
    ]);
    const comparison = compareAllocations(current, [
      { id: "a", weight: "40" },
      { id: "b", weight: "30" },
      { id: "c", weight: "30" },
    ]);
    const outcome = outcomeComparison(
      comparison,
      // Only A moves -40%. Current: A 7000 -> 4200.
      afterMap({ a: 420_000n, b: 200_000n, c: 100_000n }),
      // Proposed: A 4000 -> 2400.
      afterMap({ a: 240_000n, b: 300_000n, c: 300_000n }),
    );

    expect(outcome.currentAfter).toBe(720_000n);
    expect(outcome.proposedAfter).toBe(840_000n);
    expect(outcome.difference).toBe(120_000n);
    expect(
      outcome.rows.reduce((sum, row) => sum + row.plDelta, 0n),
    ).toBe(outcome.difference);
    const a = outcome.rows.find((row) => row.id === "a");
    const c = outcome.rows.find((row) => row.id === "c");
    expect(a?.plDelta).toBe(120_000n);
    expect(c?.plDelta).toBe(0n);
    expect(outcome.largest?.id).toBe("a");
  });

  it("reports no change when nothing moves even after reallocation", () => {
    const current = rows([
      ["a", "7000"],
      ["b", "2000"],
      ["c", "1000"],
    ]);
    const comparison = compareAllocations(current, [
      { id: "a", weight: "40" },
      { id: "b", weight: "30" },
      { id: "c", weight: "30" },
    ]);
    const outcome = outcomeComparison(
      comparison,
      afterMap({ a: 700_000n, b: 200_000n, c: 100_000n }),
      afterMap({ a: 400_000n, b: 300_000n, c: 300_000n }),
    );
    expect(outcome.difference).toBe(0n);
    expect(outcome.rows.every((row) => row.plDelta === 0n)).toBe(true);
  });

  it("rejects outcome maps that do not cover every position", () => {
    const comparison = compareAllocations(
      rows([
        ["a", "1"],
        ["b", "1"],
      ]),
      [
        { id: "a", weight: "50" },
        { id: "b", weight: "50" },
      ],
    );
    expect(() =>
      outcomeComparison(comparison, afterMap({ a: 1n }), afterMap({ a: 1n })),
    ).toThrow("identity");
  });
});
