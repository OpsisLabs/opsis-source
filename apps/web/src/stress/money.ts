export const CENTS_PER_DOLLAR = 100n;
export const BPS_PER_UNIT = 10000n;
export const MAX_POSITIONS = 10;

export const MAX_POSITION_CENTS = 100_000_000_000n;
export const MAX_TOTAL_CENTS = MAX_POSITION_CENTS * BigInt(MAX_POSITIONS);
export const MAX_VALUE_LENGTH = 40;
const STRICT_VALUE_PATTERN = /^\d+(\.\d{1,2})?$/;
const DECIMAL_VALUE_PATTERN = /^\d+(\.\d+)?$/;
const WEIGHT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

export function roundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) throw new Error("denominator");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

export function toBps(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number(roundHalfAwayFromZero(part * BPS_PER_UNIT, total));
}

export function parseStrictUsdCents(raw: string): bigint {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > 14 ||
    !STRICT_VALUE_PATTERN.test(raw)
  )
    throw new Error("value");
  const [whole, fraction = ""] = raw.split(".");
  const cents =
    BigInt(whole) * CENTS_PER_DOLLAR +
    BigInt((fraction + "00").slice(0, 2));
  if (cents > MAX_POSITION_CENTS) throw new Error("value");
  return cents;
}

// Reference values may carry more than two decimals. Round half away from zero
// to exact cents using string math only, never floating point.
export function parseDecimalUsdCents(raw: string): bigint {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > MAX_VALUE_LENGTH ||
    !DECIMAL_VALUE_PATTERN.test(raw)
  )
    throw new Error("value");
  const [whole, fraction = ""] = raw.split(".");
  const padded = fraction + "000";
  const wholeCents = BigInt(whole) * CENTS_PER_DOLLAR;
  const base = BigInt(padded.slice(0, 2));
  const remainder = padded.charCodeAt(2) - 48;
  const cents = wholeCents + base + (remainder >= 5 ? 1n : 0n);
  if (cents > MAX_TOTAL_CENTS) throw new Error("value");
  return cents;
}

export function centsToInput(cents: bigint): string {
  if (cents < 0n) throw new Error("value");
  const whole = cents / CENTS_PER_DOLLAR;
  const fraction = cents % CENTS_PER_DOLLAR;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}

export function parseWeightBps(raw: string): number {
  if (typeof raw !== "string" || !WEIGHT_PATTERN.test(raw))
    throw new Error("weightValue");
  const [whole, fraction = ""] = raw.split(".");
  const value = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (value < 0 || value > 10000) throw new Error("weightValue");
  return value;
}

export function bpsToWeightString(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000)
    throw new Error("weightValue");
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}
