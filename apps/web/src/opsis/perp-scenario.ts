/** Local linear-contract scenario only. No margin/liquidation/execution model. */
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
  const result = calculate(input.side, q, entry, exit, feeIn, feeOut, funding, other);
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
const SHOCKS = [-20, -10, 0, 10, 20] as const;

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
export function perpShockScenarios(input: PerpScenarioInput) {
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
      ({ shockedExit, remainder }) => shockedExit <= 0n || remainder * 100n > entry,
    )
  )
    return null;

  const results = shockedPrices.map(({ percent, shockedExit }) => {
    const result = calculate(input.side, q, entry, shockedExit, feeIn, feeOut, funding, other);
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
  }, 0n);
  return {
    entered: { exit: display(fixed(input.exit)), ...entered },
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
