import { describe, expect, it } from "vitest";
import { dialPercent } from "./dial";

describe("stress dial", () => {
  it("maps every whole percentage to its correct arc position", () => {
    for (let value = -100; value <= 100; value++) {
      const angle = ((100 - value) / 200) * Math.PI;
      expect(
        dialPercent(150 + Math.cos(angle) * 125, 158 - Math.sin(angle) * 125),
      ).toBe(value);
    }
  });
  it("clamps drags below either endpoint without flipping sides", () => {
    expect(dialPercent(-20, 220)).toBe(-100);
    expect(dialPercent(350, 220)).toBe(100);
    expect(dialPercent(150, -40)).toBe(0);
  });
});
