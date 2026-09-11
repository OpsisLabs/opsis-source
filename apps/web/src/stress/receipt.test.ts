import { describe, expect, it } from "vitest";
import { examplePositions, stress } from "./model";
import { receipt } from "./receipt";
const shock = { scope: "single", percent: -40, positionId: "asset-a" } as const;
describe("stress receipt privacy", () => {
  it("excludes private names, positions, values and identifiers by default", () => {
    const positions = examplePositions("concentrated");
    positions[0].label = "PRIVATE-NEVER-EXPORT";
    const output = receipt(stress(positions, shock), shock, true);
    expect(output.totals).toBeNull();
    expect(output.changeBps).toBe(-2800);
    expect(JSON.stringify(output)).not.toMatch(
      /PRIVATE-NEVER-EXPORT|asset-a|1000000/,
    );
    expect(Object.keys(output).sort()).toEqual([
      "affectedBps",
      "changeBps",
      "createdAt",
      "custom",
      "scope",
      "shockPercent",
      "totals",
    ]);
  });
  it("only includes totals on explicit opt in, with exact assumed values", () => {
    const output = receipt(
      stress(examplePositions("concentrated"), shock),
      shock,
      false,
      true,
      new Date("2026-09-11T00:00:00Z"),
    );
    expect(output.totals).toEqual({ before: "1000000", after: "720000" });
    expect(output.createdAt).toBe("2026-09-11T00:00:00.000Z");
    expect(output.affectedBps).toBe(7000);
  });
});
