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
  const gross =
    (q * (exit - entry) * (input.side === "long" ? 1n : -1n)) / SCALE;
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
  };
}
