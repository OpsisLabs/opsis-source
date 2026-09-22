import { it, expect } from "vitest";
import { stockGap } from "./stock-gap";
const input = {
  dex: "55",
  reference: "100",
  multiplier: "0.5",
  mode: "underlying" as const,
  unit: "USD",
  referenceUnit: "USD",
};
it("uses multiplier exactly once and token-oracle unit contract excludes it", () => {
  expect(stockGap(input)).toBe("10.0000");
  expect(stockGap({ ...input, mode: "oracle", reference: "50" })).toBe(
    "10.0000",
  );
  expect(
    stockGap({
      ...input,
      mode: "oracle",
      reference: "50",
      multiplier: "invalid ignored",
    }),
  ).toBe("10.0000");
});
it("rejects cross-currency, zero and malformed prices", () => {
  for (const changed of [
    { referenceUnit: "USDG" },
    { dex: "0" },
    { reference: "NaN" },
    { multiplier: "-1" },
  ])
    expect(() => stockGap({ ...input, ...changed })).toThrow();
});
it("keeps extreme decimals exact and never divides by zero", () => {
  expect(
    stockGap({
      ...input,
      dex: "0.000000000000000000000000000000000002",
      reference: "0.000000000000000000000000000000000001",
      multiplier: "1",
    }),
  ).toBe("100.0000");
  expect(stockGap({ ...input, dex: "25" })).toBe("-50.0000");
});
