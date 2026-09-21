import { describe, expect, it } from "vitest";
import { portfolioScenario, scenarioPoints } from "./lab-data";
import { opsisTemplate } from "./presentation";
import { interpolate } from "../i18n/translate";
describe("native Lab preserves the captured scenario method", () => {
  it("matches the published default basket and cost formula", () => {
    expect(portfolioScenario(-12, -30, 40, 0.3).net).toBeCloseTo(8414.68, 8);
    expect(portfolioScenario(0, 0, 40, 0).pl).toBe(0);
    expect(portfolioScenario(40, 60, 55, 3).net).toBeCloseTo(14162, 8);
  });
  it("keeps the complete shock grid finite and distinct", () => {
    const p = scenarioPoints(40, 0.3);
    expect(p).toHaveLength(2501);
    expect(new Set(p.map((v) => v.id)).size).toBe(2501);
    expect(p.every((v) => [v.x, v.y, v.z].every(Number.isFinite))).toBe(true);
  });
  it("renames UI templates without rewriting interpolated private data", () => {
    expect(
      interpolate(opsisTemplate("ChainScout: {label}"), {
        label: "My ChainScout wallet",
      }),
    ).toBe("Opsis: My ChainScout wallet");
  });
});
