import { describe, expect, it } from "vitest";
import { examplePositions, stress } from "./model";
import type { Position, Shock } from "./model";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function makePositions(count: number, value = "1"): Position[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    label: `P${index}`,
    value,
  }));
}

function all(percent: number, positionId = ""): Shock {
  return { scope: "all", percent, positionId };
}

function single(percent: number, positionId: string): Shock {
  return { scope: "single", percent, positionId };
}

describe("stress", () => {
  it("treats a 70% holding falling 40% as -28% of the portfolio", () => {
    const result = stress(
      examplePositions("concentrated"),
      single(-40, "asset-a"),
    );

    expect(result.before).toBe(1_000_000n);
    expect(result.after).toBe(720_000n);
    expect(result.delta).toBe(-280_000n);
    expect(result.changeBps).toBe(-2800);
    expect(result.largestShareBps).toBe(7000);
    expect(result.largestId).toBe("asset-a");
    expect(result.rows).toEqual([
      {
        id: "asset-a",
        label: "Asset A",
        before: 700_000n,
        after: 420_000n,
        delta: -280_000n,
        shareBps: 7000,
      },
      {
        id: "asset-b",
        label: "Asset B",
        before: 200_000n,
        after: 200_000n,
        delta: 0n,
        shareBps: 2000,
      },
      {
        id: "asset-c",
        label: "Asset C",
        before: 100_000n,
        after: 100_000n,
        delta: 0n,
        shareBps: 1000,
      },
    ]);
  });

  it("applies a global shock to every row", () => {
    const result = stress(examplePositions("concentrated"), all(-10));

    expect(result.before).toBe(1_000_000n);
    expect(result.after).toBe(900_000n);
    expect(result.delta).toBe(-100_000n);
    expect(result.changeBps).toBe(-1000);
    expect(result.rows.map((row) => row.after)).toEqual([
      630_000n,
      180_000n,
      90_000n,
    ]);
    expect(result.rows.map((row) => row.delta)).toEqual([
      -70_000n,
      -20_000n,
      -10_000n,
    ]);
    expect(result.largestId).toBe("asset-a");
    expect(result.largestShareBps).toBe(7000);
  });

  it("applies a positive single-position shock and leaves other rows untouched", () => {
    const result = stress(
      examplePositions("concentrated"),
      single(25, "asset-b"),
    );

    expect(result.before).toBe(1_000_000n);
    expect(result.after).toBe(1_050_000n);
    expect(result.delta).toBe(50_000n);
    expect(result.changeBps).toBe(500);
    expect(result.rows.map((row) => [row.id, row.after])).toEqual([
      ["asset-a", 700_000n],
      ["asset-b", 250_000n],
      ["asset-c", 100_000n],
    ]);
  });

  it("rounds each position after the shock half-up to the nearest cent, then sums rows", () => {
    const positions: Position[] = [
      { id: "a", label: "A", value: "100.01" },
      { id: "b", label: "B", value: "0.01" },
    ];
    const result = stress(positions, all(50));

    expect(result.before).toBe(10_002n);
    expect(result.rows[0].after).toBe(15_002n);
    expect(result.rows[1].after).toBe(2n);
    expect(result.after).toBe(15_004n);
    expect(result.delta).toBe(5_002n);
  });

  it("rounds exact half-cent results away from zero rather than to even cents", () => {
    const positions: Position[] = [
      { id: "x", label: "X", value: "0.01" },
      { id: "y", label: "Y", value: "0.03" },
    ];
    const result = stress(positions, all(50));

    expect(result.rows[0].after).toBe(2n);
    expect(result.rows[1].after).toBe(5n);
  });

  it("rounds basis-point ratios consistently for repeating decimals", () => {
    const positions: Position[] = [
      { id: "a", label: "A", value: "1" },
      { id: "b", label: "B", value: "1" },
      { id: "c", label: "C", value: "1" },
    ];
    const result = stress(positions, single(1, "a"));

    expect(result.rows.map((row) => row.shareBps)).toEqual([3333, 3333, 3333]);
    expect(result.before).toBe(300n);
    expect(result.after).toBe(301n);
    expect(result.delta).toBe(1n);
    expect(result.changeBps).toBe(33);
    expect(result.largestId).toBe("a");
    expect(result.largestShareBps).toBe(3333);
  });

  it("allows zero-value positions while rejecting a zero total", () => {
    const positions: Position[] = [
      { id: "a", label: "A", value: "0" },
      { id: "b", label: "B", value: "1.00" },
    ];
    const result = stress(positions, all(-50));

    expect(result.before).toBe(100n);
    expect(result.after).toBe(50n);
    expect(result.delta).toBe(-50n);
    expect(result.changeBps).toBe(-5000);
    expect(result.rows.map((row) => row.shareBps)).toEqual([0, 10000]);
    expect(result.largestId).toBe("b");
    expect(result.largestShareBps).toBe(10000);

    const zeros: Position[] = [
      { id: "a", label: "A", value: "0" },
      { id: "b", label: "B", value: "0.00" },
    ];
    expect(() => stress(zeros, all(-10))).toThrow("total");
  });

  it("accepts the per-position maximum and rejects anything above it", () => {
    const atMax: Position = { id: "max", label: "Max", value: "1000000000" };
    expect(stress([atMax], all(0)).before).toBe(100_000_000_000n);

    const atMaxCents: Position = {
      id: "max",
      label: "Max",
      value: "1000000000.00",
    };
    expect(stress([atMaxCents], all(0)).before).toBe(100_000_000_000n);

    const overMax: Position = {
      id: "max",
      label: "Max",
      value: "1000000000.01",
    };
    expect(() => stress([overMax], all(0))).toThrow("value");
  });

  it("enforces one to ten rows", () => {
    expect(() => stress([], all(0))).toThrow("positions");
    expect(() => stress(makePositions(11), all(0))).toThrow("positions");
    expect(stress(makePositions(10), all(0)).rows).toHaveLength(10);
    expect(stress(makePositions(1), all(0)).rows).toHaveLength(1);
  });

  it.each([
    "1e3",
    "1E3",
    "1,000",
    "+1",
    "-1",
    ".5",
    "5.",
    "1.234",
    "",
    " 1",
    "1 ",
    "0x10",
    "NaN",
    "Infinity",
    "1.2.3",
    "abc",
    "--1",
  ])("rejects invalid numeric notation %j with a value error", (value) => {
    const positions: Position[] = [{ id: "a", label: "A", value }];
    expect(() => stress(positions, all(0))).toThrow("value");
  });

  it("rejects non-string values", () => {
    const positions = [
      { id: "a", label: "A", value: 7000 },
    ] as unknown as Position[];
    expect(() => stress(positions, all(0))).toThrow("value");
  });

  it("rejects duplicate or empty ids with an identity error", () => {
    const duplicate: Position[] = [
      { id: "a", label: "A", value: "1" },
      { id: "a", label: "B", value: "1" },
    ];
    expect(() => stress(duplicate, all(0))).toThrow("identity");

    const empty: Position[] = [{ id: "", label: "A", value: "1" }];
    expect(() => stress(empty, all(0))).toThrow("identity");

    const blank: Position[] = [{ id: "   ", label: "A", value: "1" }];
    expect(() => stress(blank, all(0))).toThrow("identity");

    const missing = [{ label: "A", value: "1" }] as unknown as Position[];
    expect(() => stress(missing, all(0))).toThrow("identity");
  });

  it("rejects malformed position entries with a positions error", () => {
    const notObjects = [null, "nope", 42] as unknown as Position[];
    expect(() => stress(notObjects, all(0))).toThrow("positions");
  });

  it("trims labels and enforces a 1..40 character range", () => {
    const padded: Position[] = [{ id: "a", label: "  Asset A  ", value: "1" }];
    expect(stress(padded, all(0)).rows[0].label).toBe("Asset A");

    const forty = "x".repeat(40);
    const atLimit: Position[] = [{ id: "a", label: forty, value: "1" }];
    expect(stress(atLimit, all(0)).rows[0].label).toBe(forty);

    const tooLong: Position[] = [
      { id: "a", label: "x".repeat(41), value: "1" },
    ];
    expect(() => stress(tooLong, all(0))).toThrow("identity");

    const blank: Position[] = [{ id: "a", label: "   ", value: "1" }];
    expect(() => stress(blank, all(0))).toThrow("identity");

    const notString = [
      { id: "a", label: null, value: "1" },
    ] as unknown as Position[];
    expect(() => stress(notString, all(0))).toThrow("identity");
  });

  it("validates the shock with a shock error", () => {
    const positions = examplePositions("concentrated");
    const percentShocks: Shock[] = [
      { scope: "all", percent: 101, positionId: "" },
      { scope: "all", percent: -101, positionId: "" },
      { scope: "all", percent: 1.5, positionId: "" },
      { scope: "all", percent: Number.NaN, positionId: "" },
      { scope: "all", percent: Number.POSITIVE_INFINITY, positionId: "" },
      { scope: "all", percent: "10" as unknown as number, positionId: "" },
      {
        scope: "some" as unknown as Shock["scope"],
        percent: 10,
        positionId: "",
      },
    ];
    for (const shock of percentShocks) {
      expect(() => stress(positions, shock)).toThrow("shock");
    }

    expect(() => stress(positions, single(-40, "missing"))).toThrow("shock");
    expect(() => stress(positions, single(-40, ""))).toThrow("shock");
    expect(() =>
      stress(positions, single(-40, 7 as unknown as string)),
    ).toThrow("shock");
    expect(() => stress(positions, null as unknown as Shock)).toThrow("shock");
  });

  it("accepts boundary percentages and ignores positionId in all mode", () => {
    const positions = examplePositions("concentrated");
    expect(stress(positions, all(-100)).after).toBe(0n);
    expect(stress(positions, all(-100)).changeBps).toBe(-10000);
    expect(stress(positions, all(100)).after).toBe(2_000_000n);
    expect(stress(positions, all(100)).changeBps).toBe(10000);
    expect(stress(positions, all(0, "not-a-real-id")).delta).toBe(0n);
    expect(stress(positions, single(0, "asset-a")).delta).toBe(0n);
  });

  it("never mutates frozen input and returns fresh row objects", () => {
    const positions = deepFreeze(examplePositions("concentrated"));
    const frozen = deepFreeze(examplePositions("concentrated"));
    const shock = deepFreeze(single(-40, "asset-a"));
    const snapshot = JSON.parse(JSON.stringify(positions));

    const result = stress(positions, shock);

    expect(positions).toEqual(snapshot);
    expect(frozen).toEqual(snapshot);
    expect(result.rows).toHaveLength(3);
    for (let index = 0; index < result.rows.length; index += 1) {
      expect(result.rows[index]).not.toBe(positions[index]);
    }
    expect(result.rows[0]).not.toBe(result.rows[1]);
  });

  it("provides illustrative example portfolios that are fresh each call", () => {
    const concentrated = examplePositions("concentrated");
    const spread = examplePositions("spread");

    expect(concentrated.map((position) => position.label)).toEqual([
      "Asset A",
      "Asset B",
      "Asset C",
    ]);
    expect(concentrated.map((position) => position.value)).toEqual([
      "7000",
      "2000",
      "1000",
    ]);
    expect(spread.map((position) => position.label)).toEqual([
      "Asset A",
      "Asset B",
      "Asset C",
    ]);
    expect(spread.map((position) => position.value)).toEqual([
      "4000",
      "3000",
      "3000",
    ]);
    expect(concentrated).not.toBe(examplePositions("concentrated"));
    expect(() => examplePositions("other" as unknown as "spread")).toThrow(
      "positions",
    );
  });
});
