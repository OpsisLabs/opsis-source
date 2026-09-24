import { it, expect } from "vitest";
import { perpCustomShockScenario, perpScenario, perpShockScenarios } from "./perp-scenario";
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

it("compares fixed shocks in both directions with the same exact cost assumptions", () => {
  const comparison = perpShockScenarios(input);
  if (!comparison) throw new Error("Expected representable fixed shocks");
  expect(comparison.shocks.map(({ percent, exit, net }) => [percent, exit, net])).toEqual([
    [-20, "80.00000000", "-41.76000000"],
    [-10, "90.00000000", "-21.78000000"],
    [0, "100.00000000", "-1.80000000"],
    [10, "110.00000000", "18.18000000"],
    [20, "120.00000000", "38.16000000"],
  ]);
  expect(comparison.entered.net).toBe(perpScenario(input).net);
  expect(comparison.entered.exit).toBe("110.00000000");
  const short = perpShockScenarios({ ...input, side: "short" });
  if (!short) throw new Error("Expected representable short shocks");
  expect(short.shocks[0].net).toBe("38.24000000");
  expect(short.shocks[4].net).toBe("-41.84000000");
  expect(short.shocks.every((row) => row.barWidth >= 0 && row.barWidth <= 100)).toBe(true);
  expect(short.shocks[0].negative).toBe(false);
  expect(short.shocks[4].negative).toBe(true);
  expect(
    perpShockScenarios({ ...input, exit: "9999999999999999" })?.shocks.map((row) => row.barWidth),
  ).toEqual(comparison.shocks.map((row) => row.barWidth));
});

it("keeps the entered result while refusing shock prices lost to eight-decimal rounding", () => {
  const tinyEntry = {
    ...input,
    quantity: "1",
    entry: "0.00000001",
    exit: "0.00000001",
    entryFeeBps: "0",
    exitFeeBps: "0",
    funding: "0",
    otherCosts: "0",
  };
  expect(perpScenario(tinyEntry).net).toBe("0.00000000");
  expect(perpShockScenarios(tinyEntry)).toBeNull();
  expect(
    perpShockScenarios({ ...tinyEntry, entry: "0.00000002", exit: "0.00000002" }),
  ).toBeNull();
  const fractional = perpShockScenarios({
    ...input,
    entry: "123.45678912",
    exit: "123.45678912",
  });
  expect(fractional).not.toBeNull();
  expect(fractional?.shocks.map((row) => row.exit)).toEqual([
    "98.76543129",
    "111.11111020",
    "123.45678912",
    "135.80246803",
    "148.14814694",
  ]);
});

it("keeps shock prices and calculations in BigInt at supported input extremes", () => {
  const extreme = perpShockScenarios({
    side: "long",
    quantity: "9999999999999999.99999999",
    entry: "9999999999999999.99999999",
    exit: "9999999999999999.99999999",
    entryFeeBps: "10000",
    exitFeeBps: "10000",
    funding: "0",
    otherCosts: "0",
  });
  if (!extreme) throw new Error("Expected representable extreme shocks");
  expect(extreme.shocks[4].exit).toBe("11999999999999999.99999998");
  expect(extreme.shocks[4].net).toContain("-");
  expect(extreme.shocks.every((row) => row.barWidth >= 0 && row.barWidth <= 100)).toBe(true);
  expect(() => perpShockScenarios({ ...input, funding: "" })).toThrow();
  expect(() => perpShockScenarios({ ...input, entry: "0" })).toThrow();
});

it("calculates bounded fractional custom shocks with exact decimal prices", () => {
  const noCosts = {
    ...input,
    entry: "100",
    exit: "110",
    entryFeeBps: "0",
    exitFeeBps: "0",
    funding: "0",
    otherCosts: "0",
  };
  expect(perpCustomShockScenario(noCosts, "-12.34")).toMatchObject({
    percent: "-12.34%", exit: "87.66000000", net: "-24.68000000",
  });
  expect(perpCustomShockScenario(noCosts, "12.34")).toMatchObject({
    percent: "+12.34%", exit: "112.34000000", net: "24.68000000",
  });
  expect(perpCustomShockScenario(noCosts, "0")).toMatchObject({
    percent: "0%", exit: "100.00000000", net: "0.00000000",
  });
});

it("rejects malformed or out-of-range custom shocks and refuses unrepresentable prices", () => {
  for (const shock of ["-95.01", "500.01", "500.1", "1.001", "+1", "1e2", " 1", "-", "01"])
    expect(() => perpCustomShockScenario(input, shock)).toThrow();
  expect(perpCustomShockScenario(input, "-95")?.exit).toBe("5.00000000");
  expect(perpCustomShockScenario(input, "500")?.exit).toBe("600.00000000");
  expect(() => perpCustomShockScenario({ ...input, exit: "0" }, "1")).toThrow();
  expect(perpCustomShockScenario({
    ...input, quantity: "1", entry: "0.00000001", exit: "0.00000001",
    entryFeeBps: "0", exitFeeBps: "0", funding: "0", otherCosts: "0",
  }, "1")).toBeNull();
});

it("accepts the 0.01 percentage-point precision boundary and scales custom plot bars together", () => {
  const boundary = perpCustomShockScenario({
    ...input, quantity: "1", entry: "0.00001000", exit: "0.00001000",
    entryFeeBps: "0", exitFeeBps: "0", funding: "0", otherCosts: "0",
  }, "0.01");
  expect(boundary?.exit).toBe("0.00001000");

  const custom = perpCustomShockScenario(input, "500");
  if (!custom) throw new Error("Expected representable custom shock");
  const comparison = perpShockScenarios(input, custom.netRaw);
  if (!comparison) throw new Error("Expected representable fixed shocks");
  expect(comparison.customBar?.barWidth).toBe(100);
  expect(Math.max(...comparison.shocks.map((row) => row.barWidth))).toBeLessThan(100);
});
