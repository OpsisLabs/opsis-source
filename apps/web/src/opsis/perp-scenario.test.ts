import { it, expect } from "vitest";
import { perpScenario } from "./perp-scenario";
const input = {
  side: "long" as const,
  quantity: "2",
  entry: "100",
  exit: "110",
  entryFeeBps: "5",
  exitFeeBps: "10",
  funding: "1",
  otherCosts: "0.5",
};
it("separates notionals, price P&L, entry/exit fees and funding without annualization", () => {
  expect(perpScenario(input)).toEqual({
    entryNotional: "200.00000000",
    exitNotional: "220.00000000",
    gross: "20.00000000",
    entryFee: "0.10000000",
    exitFee: "0.22000000",
    funding: "1.00000000",
    otherCosts: "0.50000000",
    net: "18.18000000",
  });
  expect(perpScenario({ ...input, side: "short", funding: "-1" }).net).toBe(
    "-19.82000000",
  );
});
it("never infers zero fees from missing, malformed or negative inputs", () => {
  for (const v of [
    { funding: "" },
    { quantity: "0" },
    { entry: "1e6" },
    { exitFeeBps: "-1" },
    { entryFeeBps: "10001" },
    { otherCosts: "NaN" },
  ])
    expect(() => perpScenario({ ...input, ...v })).toThrow();
});
it("preserves sub-cent decimals and bounds precision", () => {
  expect(
    perpScenario({
      ...input,
      quantity: "0.00000001",
      entry: "1",
      exit: "2",
      entryFeeBps: "0",
      exitFeeBps: "0",
      funding: "0",
      otherCosts: "0",
    }).net,
  ).toBe("0.00000001");
  expect(() => perpScenario({ ...input, quantity: "0.000000001" })).toThrow();
});
