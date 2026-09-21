import { expect, it } from "vitest";
import { relativeBar } from "./visual-model";
it("compares very large raw quantities without floating-point overflow", () => {
  const huge = 10n ** 100n;
  expect(
    relativeBar(String(huge / 2n), [String(huge), String(huge / 2n)]),
  ).toBe(50);
  expect(relativeBar("100", ["100", "99"])).toBe(100);
  expect(relativeBar("0", ["0"])).toBe(0);
  expect(relativeBar("bad", ["100"])).toBe(0);
});
import { decimalBars } from "./visual-model";
it("aligns mixed decimal precision without changing exact input amounts", () => {
  expect(decimalBars(["0.1", "0.20", "0"])).toEqual([50, 100, 0]);
  expect(
    decimalBars(["9007199254740993000000", "4503599627370496500000"]),
  ).toEqual([100, 50]);
  expect(decimalBars(["1", "unknown"])).toBeNull();
  expect(decimalBars(["-1", "1"])).toBeNull();
  expect(decimalBars([])).toBeNull();
});
