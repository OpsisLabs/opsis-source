/** Local linear-contract costs and isolated liquidation estimate, not venue margin math or execution. */
const SCALE = 100_000_000n;
function fixed(value: string, signed = false): bigint {
  if (
    !(
      signed
        ? /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/
        : /^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/
    ).test(value)
  )
    throw new Error("Use decimal inputs with at most eight decimal places");
  const negative = value.startsWith("-");
  const [whole, part = ""] = (negative ? value.slice(1) : value).split(".");
  return BigInt(whole + part.padEnd(8, "0")) * (negative ? -1n : 1n);
}
function display(raw: bigint) {
  const a = (raw < 0n ? -raw : raw).toString().padStart(9, "0");
  return `${raw < 0n ? "-" : ""}${a.slice(0, -8)}.${a.slice(-8)}`;
}
const ratioDisplay = (numerator: bigint, denominator: bigint) => {
  if (denominator <= 0n) throw new Error("Collateral must be positive");
  return display((numerator * SCALE) / denominator);
};
export function perpScenario(input: {
  side: "long" | "short";
  quantity: string;
  entry: string;
  exit: string;
  entryFeeBps: string;
  exitFeeBps: string;
  funding: string;
  otherCosts: string;
}) {
  if (!["long", "short"].includes(input.side)) throw new Error("Invalid side");
  const q = fixed(input.quantity),
    entry = fixed(input.entry),
    exit = fixed(input.exit),
    feeIn = fixed(input.entryFeeBps),
    feeOut = fixed(input.exitFeeBps),
    funding = fixed(input.funding, true),
    other = fixed(input.otherCosts);
  const result = calculate(
    input.side,
    q,
    entry,
    exit,
    feeIn,
    feeOut,
    funding,
    other,
  );
  return {
    entryNotional: result.entryNotional,
    exitNotional: result.exitNotional,
    gross: result.gross,
    entryFee: result.entryFee,
    exitFee: result.exitFee,
    funding: result.funding,
    otherCosts: result.otherCosts,
    net: result.net,
  };
}

type PerpScenarioInput = Parameters<typeof perpScenario>[0];

function wholeHours(value: string, min: bigint, max: bigint): bigint {
  if (!/^(?:0|[1-9]\d{0,4})$/.test(value))
    throw new Error("Hours must be whole numbers");
  const hours = BigInt(value);
  if (hours < min || hours > max) throw new Error("Hours out of range");
  return hours;
}

/** Constant entry notional and rate; count completed funding intervals only. */
export function perpFundingOverHold(input: {
  side: "long" | "short";
  quantity: string;
  entry: string;
  rateBps: string;
  intervalHours: string;
  holdingHours: string;
}) {
  if (!["long", "short"].includes(input.side)) throw new Error("Invalid side");
  const q = fixed(input.quantity),
    entry = fixed(input.entry);
  if (q <= 0n || entry <= 0n)
    throw new Error("Positive quantity and entry required");
  if (!/^-?(?:0|[1-9]\d{0,3})(?:\.\d{1,4})?$/.test(input.rateBps))
    throw new Error("Funding rate must use at most four decimal places");
  const rate = fixed(input.rateBps, true);
  if (rate < -1000n * SCALE || rate > 1000n * SCALE)
    throw new Error("Funding rate must be from -1000 to 1000 bps");
  const interval = wholeHours(input.intervalHours, 1n, 24n);
  const hold = wholeHours(input.holdingHours, 0n, 87600n);
  const intervals = hold / interval;
  const perInterval =
    (q * entry * rate * (input.side === "long" ? 1n : -1n)) /
    (10_000n * SCALE * SCALE);
  return {
    intervals: intervals.toString(),
    perInterval: display(perInterval),
    total: display(perInterval * intervals),
  };
}

/** Isolated linear position, no fees/funding/mark rules/tiers. Round to earlier liquidation. */
export function perpLiquidationEstimate(input: {
  side: "long" | "short";
  quantity: string;
  entry: string;
  collateral: string;
  maintenanceBps: string;
}):
  | { state: "estimate"; price: string; movePercent: string }
  | {
      state: "none";
      reason: "no_positive_price" | "below_maintenance_at_entry";
    } {
  if (!["long", "short"].includes(input.side)) throw new Error("Invalid side");
  const q = fixed(input.quantity),
    entry = fixed(input.entry),
    collateral = fixed(input.collateral);
  if (q <= 0n || entry <= 0n || collateral <= 0n)
    throw new Error("Positive quantity, entry and collateral required");
  if (!/^(?:0|[1-9]\d{0,3})$/.test(input.maintenanceBps))
    throw new Error("Maintenance must be whole bps from 0 to 9999");
  const maintenance = BigInt(input.maintenanceBps);
  const notional = q * entry;
  if (collateral * SCALE * 10_000n < notional * maintenance)
    return { state: "none", reason: "below_maintenance_at_entry" };
  const long = input.side === "long";
  const numerator =
    (notional + (long ? -1n : 1n) * collateral * SCALE) * 10_000n;
  if (numerator <= 0n) return { state: "none", reason: "no_positive_price" };
  const denominator = q * (10_000n + (long ? -maintenance : maintenance));
  const price = long
    ? (numerator + denominator - 1n) / denominator
    : numerator / denominator;
  const move = ((price - entry) * 10_000n) / entry;
  const absolute = move < 0n ? -move : move;
  return {
    state: "estimate",
    price: display(price),
    movePercent: `${move < 0n ? "-" : move > 0n ? "+" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`,
  };
}

/** Compare only the user's fee/funding assumptions; preserve labels and order. */
export function perpCostComparison(
  base: PerpScenarioInput,
  sets: {
    label: string;
    entryFeeBps: string;
    exitFeeBps: string;
    funding: string;
  }[],
) {
  perpScenario(base);
  if (sets.length < 1 || sets.length > 3)
    throw new Error("Use one to three assumption sets");
  return sets.map((set) => {
    if (!set.label.trim() || set.label.length > 24)
      throw new Error("Use a label of 1 to 24 characters");
    const result = calculate(
      base.side,
      fixed(base.quantity),
      fixed(base.entry),
      fixed(base.exit),
      fixed(set.entryFeeBps),
      fixed(set.exitFeeBps),
      fixed(set.funding, true),
      fixed(base.otherCosts),
    );
    const gross =
      (fixed(base.quantity) *
        (fixed(base.exit) - fixed(base.entry)) *
        (base.side === "long" ? 1n : -1n)) /
      SCALE;
    return {
      label: set.label,
      entryFee: result.entryFee,
      exitFee: result.exitFee,
      funding: result.funding,
      totalCosts: display(gross - result._netRaw),
      net: result.net,
    };
  });
}

/** Plain text only. Every label is localized by the caller; no region or venue. */
export function perpScenarioSummary(
  input: PerpScenarioInput,
  labels: {
    heading: string;
    side: string;
    long: string;
    short: string;
    quantity: string;
    entry: string;
    exit: string;
    entryFee: string;
    exitFee: string;
    funding: string;
    otherCosts: string;
    net: string;
    collateral: string;
    maintenance: string;
    liquidation: string;
    footer: string;
  },
  optional?: { collateral: string; maintenanceBps: string },
): string[] {
  const result = perpScenario(input);
  const lines = [
    labels.heading,
    `${labels.side}: ${input.side === "long" ? labels.long : labels.short}`,
    `${labels.quantity}: ${display(fixed(input.quantity))}`,
    `${labels.entry}: ${display(fixed(input.entry))}`,
    `${labels.exit}: ${display(fixed(input.exit))}`,
    `${labels.entryFee}: ${result.entryFee}`,
    `${labels.exitFee}: ${result.exitFee}`,
    `${labels.funding}: ${result.funding}`,
    `${labels.otherCosts}: ${result.otherCosts}`,
    `${labels.net}: ${result.net}`,
  ];
  if (optional) {
    try {
      const estimate = perpLiquidationEstimate({ ...input, ...optional });
      lines.push(
        `${labels.collateral}: ${display(fixed(optional.collateral))}`,
      );
      lines.push(`${labels.maintenance}: ${optional.maintenanceBps}`);
      if (estimate.state === "estimate")
        lines.push(`${labels.liquidation}: ${estimate.price}`);
    } catch {
      /* Invalid optional assumptions stay unknown. */
    }
  }
  return [...lines, labels.footer];
}
const SHOCKS = [-20, -10, 0, 10, 20] as const;

/** User-entered percentage points, bounded to -95.00..500.00 in 0.01 steps. */
function parseCustomShock(value: string): {
  basisPoints: bigint;
  label: string;
} {
  if (!/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value))
    throw new Error("Custom shock must use at most two decimal places");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const basisPoints = negative ? -magnitude : magnitude;
  if (basisPoints < -9_500n || basisPoints > 50_000n)
    throw new Error("Custom shock must be from -95% to +500%");
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  const label = `${basisPoints < 0n ? "-" : basisPoints > 0n ? "+" : ""}${absolute / 100n}${absolute % 100n ? `.${(absolute % 100n).toString().padStart(2, "0")}` : ""}%`;
  return { basisPoints, label };
}

/** Custom closing-price shock; null means eight-decimal truncation is too coarse. */
export function perpCustomShockScenario(
  input: PerpScenarioInput,
  value: string,
) {
  const { basisPoints, label } = parseCustomShock(value);
  const q = fixed(input.quantity),
    entry = fixed(input.entry),
    exit = fixed(input.exit),
    feeIn = fixed(input.entryFeeBps),
    feeOut = fixed(input.exitFeeBps),
    funding = fixed(input.funding, true),
    other = fixed(input.otherCosts);
  if (
    !["long", "short"].includes(input.side) ||
    q <= 0n ||
    entry <= 0n ||
    exit <= 0n ||
    feeIn > 10_000n * SCALE ||
    feeOut > 10_000n * SCALE
  )
    throw new Error("Invalid scenario assumptions");

  const numerator = entry * (10_000n + basisPoints);
  const shockedExit = numerator / 10_000n;
  const remainder = numerator % 10_000n;
  // Truncation error in percentage points is remainder/(100*entry).
  // Refuse only when it exceeds 0.01 percentage point: remainder > entry.
  if (shockedExit <= 0n || remainder > entry) return null;
  const result = calculate(
    input.side,
    q,
    entry,
    shockedExit,
    feeIn,
    feeOut,
    funding,
    other,
  );
  return {
    percent: label,
    exit: display(shockedExit),
    net: result.net,
    netRaw: result._netRaw,
  };
}

function calculate(
  side: PerpScenarioInput["side"],
  q: bigint,
  entry: bigint,
  exit: bigint,
  feeIn: bigint,
  feeOut: bigint,
  funding: bigint,
  other: bigint,
) {
  if (
    q <= 0n ||
    entry <= 0n ||
    exit <= 0n ||
    feeIn > 10_000n * SCALE ||
    feeOut > 10_000n * SCALE
  )
    throw new Error(
      "Positive quantity/prices and fee rates from 0 to 10,000 bps required",
    );
  // Each term truncates toward zero to eight quote-currency decimals; the
  // venue may use different tick, lot and settlement rounding conventions.
  const entryNotional = (q * entry) / SCALE,
    exitNotional = (q * exit) / SCALE;
  const gross = (q * (exit - entry) * (side === "long" ? 1n : -1n)) / SCALE;
  const entryFee = (entryNotional * feeIn) / (10_000n * SCALE),
    exitFee = (exitNotional * feeOut) / (10_000n * SCALE);
  return {
    entryNotional: display(entryNotional),
    exitNotional: display(exitNotional),
    gross: display(gross),
    entryFee: display(entryFee),
    exitFee: display(exitFee),
    funding: display(funding),
    otherCosts: display(other),
    net: display(gross - entryFee - exitFee - funding - other),
    _netRaw: gross - entryFee - exitFee - funding - other,
  };
}

/** Fixed price shocks use integer percent arithmetic and truncate to eight decimals. */
export function perpShockScenarios(input: PerpScenarioInput, customNetRaw?: bigint) {
  // Parse and validate every assumption using the same boundaries as the main result.
  const q = fixed(input.quantity),
    entry = fixed(input.entry),
    feeIn = fixed(input.entryFeeBps),
    feeOut = fixed(input.exitFeeBps),
    funding = fixed(input.funding, true),
    other = fixed(input.otherCosts);
  if (
    !["long", "short"].includes(input.side) ||
    q <= 0n ||
    entry <= 0n ||
    feeIn > 10_000n * SCALE ||
    feeOut > 10_000n * SCALE
  )
    throw new Error("Invalid scenario assumptions");

  const shockedPrices = SHOCKS.map((percent) => {
    // Integer division is deterministic truncation toward zero at 8 decimals.
    const numerator = entry * BigInt(100 + percent);
    const shockedExit = numerator / 100n;
    const remainder = numerator % 100n;
    return { percent, shockedExit, remainder };
  });
  // Refuse zero prices and moves whose eight-decimal rounding changes the
  // intended percentage by more than 0.01 percentage point (1 bp).
  if (
    shockedPrices.some(
      ({ shockedExit, remainder }) =>
        shockedExit <= 0n || remainder * 100n > entry,
    )
  )
    return null;

  const results = shockedPrices.map(({ percent, shockedExit }) => {
    const result = calculate(
      input.side,
      q,
      entry,
      shockedExit,
      feeIn,
      feeOut,
      funding,
      other,
    );
    return {
      percent,
      exit: display(shockedExit),
      entryNotional: result.entryNotional,
      exitNotional: result.exitNotional,
      gross: result.gross,
      entryFee: result.entryFee,
      exitFee: result.exitFee,
      funding: result.funding,
      otherCosts: result.otherCosts,
      net: result.net,
      netRaw: result._netRaw,
    };
  });
  const entered = perpScenario(input);
  const maxAbs = results.reduce((max, row) => {
    const value = row.netRaw;
    const abs = value < 0n ? -value : value;
    return abs > max ? abs : max;
  }, customNetRaw === undefined ? 0n : customNetRaw < 0n ? -customNetRaw : customNetRaw);
  return {
    entered: { exit: display(fixed(input.exit)), ...entered },
    customBar: customNetRaw === undefined ? null : (() => {
      const abs = customNetRaw < 0n ? -customNetRaw : customNetRaw;
      return {
        barWidth: maxAbs === 0n ? 0 : Number((abs * 100n) / maxAbs),
        negative: customNetRaw < 0n,
      };
    })(),
    shocks: results.map((row) => {
      const net = row.netRaw;
      const abs = net < 0n ? -net : net;
      // Convert only a bounded 0..100 ratio for visual geometry.
      const barWidth = maxAbs === 0n ? 0 : Number((abs * 100n) / maxAbs);
      return {
        percent: row.percent,
        exit: row.exit,
        entryNotional: row.entryNotional,
        exitNotional: row.exitNotional,
        gross: row.gross,
        entryFee: row.entryFee,
        exitFee: row.exitFee,
        funding: row.funding,
        otherCosts: row.otherCosts,
        net: row.net,
        barWidth,
        negative: net < 0n,
      };
    }),
  };
}

/** Local hypothetical isolated-collateral buffer. This is not venue margin math. */
export function perpCollateralBuffer(
  input: PerpScenarioInput,
  collateralText: string,
  maintenanceBpsText: string,
  customShock?: string,
) {
  const collateral = fixed(collateralText);
  if (collateral <= 0n) throw new Error("Collateral must be positive");
  if (!/^(?:0|[1-9]\d{0,4})$/.test(maintenanceBpsText))
    throw new Error("Maintenance requirement must be whole basis points");
  const maintenanceBps = BigInt(maintenanceBpsText);
  if (maintenanceBps > 10_000n)
    throw new Error("Maintenance requirement must be from 0 to 10000 bps");
  const comparison = perpShockScenarios(input);
  const q = fixed(input.quantity), entry = fixed(input.entry);
  const entryNotional = q * entry / SCALE;
  const calc = (exit: string, netRaw: bigint) => {
    const exitNotional = q * fixed(exit) / SCALE;
    const maintenance = exitNotional * maintenanceBps / 10_000n;
    const equity = collateral + netRaw;
    return {
      exitNotional: display(exitNotional),
      equity: display(equity),
      maintenanceRequirement: display(maintenance),
      buffer: display(equity - maintenance),
    };
  };
  const enteredResult = calculate(
    input.side, q, entry, fixed(input.exit), fixed(input.entryFeeBps),
    fixed(input.exitFeeBps), fixed(input.funding, true), fixed(input.otherCosts),
  );
  const shockResults = comparison ? SHOCKS.map((percent) => {
    const exit = entry * BigInt(100 + percent) / 100n;
    const pnl = calculate(
      input.side, q, entry, exit, fixed(input.entryFeeBps),
      fixed(input.exitFeeBps), fixed(input.funding, true), fixed(input.otherCosts),
    );
    return calc(display(exit), pnl._netRaw);
  }) : null;
  const customResult = customShock === undefined || customShock.trim() === ""
    ? null
    : perpCustomShockScenario(input, customShock);
  return {
    entryLeverage: ratioDisplay(entryNotional, collateral),
    entered: calc(input.exit, enteredResult._netRaw),
    shocks: shockResults,
    custom: customResult ? calc(customResult.exit, customResult.netRaw) : null,
  };
}
