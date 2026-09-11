import { describe, expect, it } from "vitest";
import { applyMoves, parseMoves, shockToMoves } from "./scenario";
import type { ComparableRow } from "./compare";
import { parseStrictUsdCents } from "./money";

function rows(values: Array<[string, string]>): ComparableRow[] {
  return values.map(([id, value]) => ({
    id,
    label: id.toUpperCase(),
    cents: parseStrictUsdCents(value),
  }));
}

describe("scenario moves", () => {
  it("applies a different whole-percent move to each position", () => {
    const current = rows([
      ["a", "100"],
      ["b", "100"],
    ]);
    const scenario = applyMoves(
      current,
      parseMoves(current, [
        { id: "a", move: "-50" },
        { id: "b", move: "10" },
      ]),
    );
    expect(scenario.before).toBe(20_000n);
    expect(scenario.after).toBe(16_000n);
    expect(scenario.rows.map((row) => row.delta)).toEqual([-5_000n, 1_000n]);
    expect(scenario.delta).toBe(-4_000n);
    expect(scenario.movedCount).toBe(2);
  });

  it("rounds each position half away from zero on exact half cents", () => {
    const current = rows([
      ["x", "0.01"],
      ["y", "0.03"],
    ]);
    const scenario = applyMoves(
      current,
      parseMoves(current, [
        { id: "x", move: "50" },
        { id: "y", move: "50" },
      ]),
    );
    expect(scenario.rows[0].after).toBe(2n);
    expect(scenario.rows[1].after).toBe(5n);
  });

  it("shares the absolute movement across contributions", () => {
    const current = rows([
      ["a", "100"],
      ["b", "100"],
      ["c", "100"],
    ]);
    const scenario = applyMoves(
      current,
      parseMoves(current, [
        { id: "a", move: "-10" },
        { id: "b", move: "0" },
        { id: "c", move: "0" },
      ]),
    );
    const total = scenario.rows.reduce(
      (sum, row) => sum + row.contributionBps,
      0,
    );
    expect(total).toBeGreaterThan(9990);
    expect(scenario.rows[1].contributionBps).toBe(0);
    expect(scenario.rows[0].contributionBps).toBeGreaterThan(9900);
  });

  it("converts the existing one/all dial into equivalent moves", () => {
    const current = rows([
      ["a", "70"],
      ["b", "30"],
    ]);
    expect(shockToMoves(current, { scope: "all", percent: -25, positionId: "" }))
      .toEqual([
        { id: "a", percent: -25 },
        { id: "b", percent: -25 },
      ]);
    expect(
      shockToMoves(current, { scope: "single", percent: 40, positionId: "b" }),
    ).toEqual([
      { id: "a", percent: 0 },
      { id: "b", percent: 40 },
    ]);
  });

  it("rejects non-whole, out-of-range, empty, and mismatched moves", () => {
    const current = rows([
      ["a", "1"],
      ["b", "1"],
    ]);
    for (const value of ["1.5", "101", "-101", "", "-", "1e2", "abc", " 1"]) {
      expect(() =>
        parseMoves(current, [
          { id: "a", move: value },
          { id: "b", move: "0" },
        ]),
      ).toThrow("moveValue");
    }
    expect(() =>
      parseMoves(current, [
        { id: "b", move: "0" },
        { id: "a", move: "0" },
      ]),
    ).toThrow("identity");
    expect(() => parseMoves(current, [{ id: "a", move: "0" }])).toThrow(
      "moves",
    );
  });

  it("never mutates its inputs", () => {
    const current = rows([
      ["a", "1"],
      ["b", "1"],
    ]);
    const snapshot = current.map((row) => ({ ...row }));
    const moves = parseMoves(current, [
      { id: "a", move: "-50" },
      { id: "b", move: "0" },
    ]);
    applyMoves(current, moves);
    expect(current).toEqual(snapshot);
    expect(moves).toEqual([
      { id: "a", percent: -50 },
      { id: "b", percent: 0 },
    ]);
  });
});
