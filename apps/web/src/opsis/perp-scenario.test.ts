import { it, expect } from "vitest";
import {
  perpCollateralBuffer,
  perpCostComparison,
  perpCustomShockScenario,
  perpFundingOverHold,
  perpLiquidationEstimate,
  perpScenario,
  perpScenarioSummary,
  perpShockScenarios,
} from "./perp-scenario";
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

it("derives user-supplied isolated collateral buffers for entered and shock exits including costs", () => {
  const result = perpCollateralBuffer(input, "50", "500", "12.34");
  expect(result.entryLeverage).toBe("4.00000000");
  expect(result.entered).toEqual({
    exitNotional: "220.00000000",
    equity: "68.18000000",
    maintenanceRequirement: "11.00000000",
    buffer: "57.18000000",
  });
  expect(result.shocks?.[0]).toMatchObject({
    exitNotional: "160.00000000", equity: "8.24000000",
    maintenanceRequirement: "8.00000000", buffer: "0.24000000",
  });
  expect(result.custom?.buffer).toBe("61.62132000");
  const short = perpCollateralBuffer({ ...input, side: "short", funding: "-1" }, "50", "500");
  expect(short.entered.equity).toBe("30.18000000");
  expect(short.entered.buffer).toBe("19.18000000");
});

it("leaves unknown collateral inputs unavailable and rejects invalid or excessive precision", () => {
  for (const [collateral, bps] of [["", "500"], ["50", ""], ["0", "500"], ["-1", "500"], ["50", "1.5"], ["50", "10001"], ["1.000000001", "500"]])
    expect(() => perpCollateralBuffer(input, collateral, bps)).toThrow();
  const tiny = {
    ...input, quantity: "1", entry: "0.00000001", exit: "0.00000001",
    entryFeeBps: "0", exitFeeBps: "0", funding: "0", otherCosts: "0",
  };
  expect(perpCollateralBuffer(tiny, "1", "100")).toMatchObject({ entered: { buffer: "1.00000000" }, shocks: null });
});

const hold = {
  side: "long" as const,
  quantity: "2",
  entry: "100",
  rateBps: "10",
  intervalHours: "8",
  holdingHours: "25",
};
it("counts only complete funding intervals and applies all four side/rate sign conventions", () => {
  expect(perpFundingOverHold(hold)).toEqual({
    intervals: "3",
    perInterval: "0.20000000",
    total: "0.60000000",
  });
  expect(perpFundingOverHold({ ...hold, side: "short" }).total).toBe(
    "-0.60000000",
  );
  expect(perpFundingOverHold({ ...hold, rateBps: "-10" }).total).toBe(
    "-0.60000000",
  );
  expect(
    perpFundingOverHold({ ...hold, side: "short", rateBps: "-10" }).total,
  ).toBe("0.60000000");
  expect(perpFundingOverHold({ ...hold, holdingHours: "0" })).toMatchObject({
    intervals: "0",
    total: "0.00000000",
  });
  expect(perpFundingOverHold({ ...hold, holdingHours: "7" }).intervals).toBe(
    "0",
  );
  expect(
    perpFundingOverHold({
      ...hold,
      holdingHours: "87600",
      intervalHours: "24",
      rateBps: "-1000",
    }),
  ).toEqual({
    intervals: "3650",
    perInterval: "-20.00000000",
    total: "-73000.00000000",
  });
  expect(
    perpFundingOverHold({ ...hold, rateBps: "1000", intervalHours: "1" })
      .intervals,
  ).toBe("25");
  expect(perpFundingOverHold({ ...hold, rateBps: "0" }).total).toBe(
    "0.00000000",
  );
});
it("funding keeps exact decimal products and truncates per interval toward zero", () => {
  expect(
    perpFundingOverHold({
      ...hold,
      quantity: "0.00000003",
      entry: "0.9",
      rateBps: "1000",
      intervalHours: "1",
      holdingHours: "2",
    }),
  ).toEqual({ intervals: "2", perInterval: "0.00000000", total: "0.00000000" });
  expect(perpFundingOverHold({ ...hold, rateBps: "-0.1234" })).toEqual({
    intervals: "3",
    perInterval: "-0.00246800",
    total: "-0.00740400",
  });
  expect(
    perpFundingOverHold({
      ...hold,
      quantity: "9999999999999999.99999999",
      entry: "9999999999999999.99999999",
      rateBps: "1000",
      holdingHours: "8",
    }).perInterval,
  ).toBe("9999999999999999999999980000000.00000000");
});
it("refuses blank, malformed, excessive-precision and out-of-range funding assumptions", () => {
  for (const key of [
    "quantity",
    "entry",
    "rateBps",
    "intervalHours",
    "holdingHours",
  ] as const)
    expect(() => perpFundingOverHold({ ...hold, [key]: "" })).toThrow();
  for (const rateBps of [
    "1000.0001",
    "-1000.0001",
    "0.00001",
    "1e2",
    "NaN",
    " 1",
    "01",
  ])
    expect(() => perpFundingOverHold({ ...hold, rateBps })).toThrow();
  for (const intervalHours of ["0", "25", "1.5", "-1", "01"])
    expect(() => perpFundingOverHold({ ...hold, intervalHours })).toThrow();
  for (const holdingHours of ["87601", "-1", "1.5", "NaN"])
    expect(() => perpFundingOverHold({ ...hold, holdingHours })).toThrow();
  for (const invalid of [
    { quantity: "0" },
    { entry: "0" },
    { quantity: "-1" },
    { entry: "0.000000001" },
    { side: "invalid" as never },
  ])
    expect(() => perpFundingOverHold({ ...hold, ...invalid })).toThrow();
});

const isolated = {
  side: "long" as const,
  quantity: "2",
  entry: "100",
  collateral: "50",
  maintenanceBps: "500",
};
it("estimates long and short liquidation from price P&L and price-dependent maintenance", () => {
  expect(perpLiquidationEstimate(isolated)).toEqual({
    state: "estimate",
    price: "78.94736843",
    movePercent: "-21.05",
  });
  expect(perpLiquidationEstimate({ ...isolated, side: "short" })).toEqual({
    state: "estimate",
    price: "119.04761904",
    movePercent: "+19.04",
  });
  expect(perpLiquidationEstimate({ ...isolated, maintenanceBps: "0" })).toEqual(
    { state: "estimate", price: "75.00000000", movePercent: "-25.00" },
  );
  expect(
    perpLiquidationEstimate({
      ...isolated,
      side: "short",
      maintenanceBps: "0",
    }),
  ).toEqual({
    state: "estimate",
    price: "125.00000000",
    movePercent: "+25.00",
  });
  expect(perpLiquidationEstimate({ ...isolated, collateral: "10" })).toEqual({
    state: "estimate",
    price: "100.00000000",
    movePercent: "0.00",
  });
  expect(
    perpLiquidationEstimate({
      ...isolated,
      collateral: "200",
      maintenanceBps: "9999",
      side: "short",
    }).state,
  ).toBe("estimate");
});
it("rounds liquidation toward the earlier price at eight decimals using integer inequalities", () => {
  for (const side of ["long", "short"] as const) {
    const result = perpLiquidationEstimate({ ...isolated, side });
    if (result.state !== "estimate") throw new Error("Expected price estimate");
    const raw = BigInt(result.price.replace(".", ""));
    const scale = 100_000_000n;
    const numerator = (side === "long" ? 150n : 250n) * 10_000n * scale;
    const denominator = 2n * (side === "long" ? 9500n : 10500n);
    if (side === "long") {
      expect(raw * denominator >= numerator).toBe(true);
      expect((raw - 1n) * denominator < numerator).toBe(true);
    } else {
      expect(raw * denominator <= numerator).toBe(true);
      expect((raw + 1n) * denominator > numerator).toBe(true);
    }
  }
  expect(
    perpLiquidationEstimate({
      ...isolated,
      quantity: "0.00000001",
      entry: "0.00000001",
      collateral: "0.00000001",
      maintenanceBps: "0",
    }),
  ).toEqual({ state: "none", reason: "no_positive_price" });
});
it("states both reasons for no liquidation estimate rather than inventing a price", () => {
  for (const collateral of ["200", "201"])
    expect(perpLiquidationEstimate({ ...isolated, collateral })).toEqual({
      state: "none",
      reason: "no_positive_price",
    });
  for (const side of ["long", "short"] as const)
    expect(
      perpLiquidationEstimate({ ...isolated, side, collateral: "9.99999999" }),
    ).toEqual({ state: "none", reason: "below_maintenance_at_entry" });
});
it("refuses invalid or incomplete liquidation assumptions and a maintenance rate of 100 percent", () => {
  for (const key of [
    "quantity",
    "entry",
    "collateral",
    "maintenanceBps",
  ] as const)
    expect(() => perpLiquidationEstimate({ ...isolated, [key]: "" })).toThrow();
  for (const key of ["quantity", "entry", "collateral"] as const)
    for (const value of ["0", "-1", "NaN", "1.000000001"])
      expect(() =>
        perpLiquidationEstimate({ ...isolated, [key]: value }),
      ).toThrow();
  for (const maintenanceBps of ["10000", "10001", "-1", "0.1", "1e2", "01"])
    expect(() =>
      perpLiquidationEstimate({ ...isolated, maintenanceBps }),
    ).toThrow();
  expect(() =>
    perpLiquidationEstimate({ ...isolated, side: "invalid" as never }),
  ).toThrow();
});

const sets = [
  { label: "A", entryFeeBps: "5", exitFeeBps: "10", funding: "1" },
  {
    label: "My second assumptions",
    entryFeeBps: "0",
    exitFeeBps: "0",
    funding: "-2",
  },
  { label: "Third", entryFeeBps: "100", exitFeeBps: "100", funding: "0" },
];
it("compares one to three sets in user order including other costs and signed funding", () => {
  expect(perpCostComparison(input, sets)).toEqual([
    {
      label: "A",
      entryFee: "0.10000000",
      exitFee: "0.22000000",
      funding: "1.00000000",
      totalCosts: "1.82000000",
      net: "18.18000000",
    },
    {
      label: "My second assumptions",
      entryFee: "0.00000000",
      exitFee: "0.00000000",
      funding: "-2.00000000",
      totalCosts: "-1.50000000",
      net: "21.50000000",
    },
    {
      label: "Third",
      entryFee: "2.00000000",
      exitFee: "2.20000000",
      funding: "0.00000000",
      totalCosts: "4.70000000",
      net: "15.30000000",
    },
  ]);
  expect(perpCostComparison({ ...input, side: "short" }, sets)[1].net).toBe(
    "-18.50000000",
  );
  expect(perpCostComparison(input, sets.slice(0, 1))).toHaveLength(1);
  const large = {
    ...input,
    quantity: "9999999999999999",
    entry: "9999999999999999",
    exit: "9999999999999999",
  };
  expect(
    perpCostComparison(large, [
      { ...sets[0], entryFeeBps: "10000", exitFeeBps: "0", funding: "0" },
    ])[0].totalCosts,
  ).toBe("99999999999999980000000000000001.50000000");
});
it("refuses incomplete or invalid comparison sets, labels and base scenarios", () => {
  for (const badSets of [
    [],
    [...sets, sets[0]],
    [{ ...sets[0], label: "" }],
    [{ ...sets[0], label: "  " }],
    [{ ...sets[0], label: "x".repeat(25) }],
  ])
    expect(() => perpCostComparison(input, badSets)).toThrow();
  for (const key of ["entryFeeBps", "exitFeeBps", "funding"] as const)
    expect(() =>
      perpCostComparison(input, [{ ...sets[0], [key]: "" }]),
    ).toThrow();
  for (const invalid of [
    { entryFeeBps: "10001" },
    { exitFeeBps: "-1" },
    { funding: "NaN" },
  ])
    expect(() =>
      perpCostComparison(input, [{ ...sets[0], ...invalid }]),
    ).toThrow();
  expect(() => perpCostComparison({ ...input, quantity: "0" }, sets)).toThrow();
  expect(() => perpCostComparison({ ...input, funding: "" }, sets)).toThrow();
});

const summaryLabels = {
  heading: "Opsis perp scenario: hypothetical, not an order",
  side: "Side",
  long: "Long",
  short: "Short",
  quantity: "Quantity",
  entry: "Entry price",
  exit: "Scenario closing price",
  entryFee: "Entry fee",
  exitFee: "Exit fee",
  funding: "Total funding",
  otherCosts: "Other costs",
  net: "Net result",
  collateral: "Collateral",
  maintenance: "Maintenance requirement (bps)",
  liquidation: "Estimated liquidation price",
  footer:
    "All figures are your own assumptions. Check the venue's own numbers.",
};
it("builds a plain-text scenario summary with caller-localized labels and optional estimates", () => {
  expect(
    perpScenarioSummary(input, summaryLabels, {
      collateral: "50",
      maintenanceBps: "500",
    }),
  ).toEqual([
    summaryLabels.heading,
    "Side: Long",
    "Quantity: 2.00000000",
    "Entry price: 100.00000000",
    "Scenario closing price: 110.00000000",
    "Entry fee: 0.10000000",
    "Exit fee: 0.22000000",
    "Total funding: 1.00000000",
    "Other costs: 0.50000000",
    "Net result: 18.18000000",
    "Collateral: 50.00000000",
    "Maintenance requirement (bps): 500",
    "Estimated liquidation price: 78.94736843",
    summaryLabels.footer,
  ]);
  expect(
    perpScenarioSummary(
      { ...input, side: "short" },
      {
        ...summaryLabels,
        side: "方向",
        short: "空头",
        heading: "Opsis 永续情景：假设，并非订单",
      },
    )[1],
  ).toBe("方向: 空头");
});
it("omits unknown optional summary figures and refuses incomplete or invalid main scenarios", () => {
  const base = perpScenarioSummary(input, summaryLabels);
  for (const optional of [
    { collateral: "", maintenanceBps: "500" },
    { collateral: "50", maintenanceBps: "" },
    { collateral: "0", maintenanceBps: "500" },
    { collateral: "50", maintenanceBps: "10000" },
  ])
    expect(perpScenarioSummary(input, summaryLabels, optional)).toEqual(base);
  for (const collateral of ["200", "9"])
    expect(
      perpScenarioSummary(input, summaryLabels, {
        collateral,
        maintenanceBps: "500",
      }).some((line) => line.startsWith(summaryLabels.liquidation)),
    ).toBe(false);
  for (const invalid of [
    { funding: "" },
    { quantity: "0" },
    { exitFeeBps: "10001" },
  ])
    expect(() =>
      perpScenarioSummary({ ...input, ...invalid }, summaryLabels),
    ).toThrow();
});
