import { formatUnits } from "viem";

const SCALE = 10n ** 30n;
export function exact(value: string): bigint | null {
  if (!/^\d{1,40}(?:\.\d{1,30})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * SCALE + BigInt(fraction.padEnd(30, "0"));
}
export function product(a: string, b: string): string | null {
  const x = exact(a),
    y = exact(b);
  return x !== null && y !== null ? formatUnits(x * y, 60) : null;
}
export function ratio(a: string, b: string): string | null {
  const x = exact(a),
    y = exact(b);
  return x !== null && y !== null && y > 0n
    ? formatUnits((x * SCALE) / y, 30)
    : null;
}
export function gap(
  pool: string,
  reference: string,
  usdgUsd: string,
): string | null {
  const p = exact(pool),
    r = exact(reference),
    u = exact(usdgUsd);
  if (p === null || r === null || u === null || r <= 0n || u <= 0n) return null;
  // Signed basis points, truncated toward zero to six decimal places.
  return formatUnits(((p * u - r * SCALE) * 10_000_000_000n) / (r * SCALE), 6);
}
export function notionalAmount(
  price: string,
  decimals: number,
  usd: string,
): string | null {
  const p = exact(price),
    n = exact(usd);
  if (
    p === null ||
    p <= 0n ||
    n === null ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    return null;
  const unit = 10n ** BigInt(decimals);
  const raw = (n * unit) / p;
  if (
    raw <= 0n ||
    raw >= 2n ** 256n ||
    (n * unit - raw * p) * 100n > unit * SCALE
  )
    return null;
  return formatUnits(raw, decimals);
}
