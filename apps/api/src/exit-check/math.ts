import { formatUnits, parseUnits } from "viem";

const Q96 = 1n << 96n;
const Q192 = 1n << 192n;

export const MAX_UINT256 = (2n ** 256n) - 1n;
// Uniswap V3 core tick boundaries. A quote whose ending sqrt price reaches a
// boundary may have consumed the price limit and only partially filled.
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

export class ExitCheckInputError extends Error {
  constructor(public readonly code: "invalid_amount" | "invalid_token" | "invalid_output" | "unsupported_decimals") {
    super(code);
  }
}

/**
 * Structural amount validation that does not depend on token decimals. Runs
 * before canonicalization/cache lookup so malformed strings cannot alias a
 * cached valid amount.
 */
export function assertAmountSyntax(value: string): void {
  if (typeof value !== "string" || value.length > 80 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new ExitCheckInputError("invalid_amount");
  }
  const [whole, fraction = ""] = value.split(".");
  if (whole!.length > 78 || (whole === "0" && !/[1-9]/.test(fraction))) {
    throw new ExitCheckInputError("invalid_amount");
  }
}

/** Parse a decimal user amount into raw base units with exact BigInt math. */
export function parseExitAmount(value: string, decimals: number): bigint {
  assertAmountSyntax(value);
  const fraction = value.split(".")[1];
  if (fraction && fraction.length > decimals) throw new ExitCheckInputError("invalid_amount");
  try {
    const parsed = parseUnits(value, decimals);
    if (parsed <= 0n || parsed > MAX_UINT256) throw new ExitCheckInputError("invalid_amount");
    return parsed;
  } catch (error) {
    if (error instanceof ExitCheckInputError) throw error;
    throw new ExitCheckInputError("invalid_amount");
  }
}

export function canonicalExitAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

export function formatExitUnits(value: bigint, decimals: number): string {
  return formatUnits(value, decimals);
}

/**
 * Exact raw output an infinite-liquidity pool would return at the captured
 * spot sqrtPriceX96 (Q96 fixed point). No Number conversion is involved.
 * `zeroForOne` is true when the input token is pool token0.
 */
export function spotAmountOutRaw(input: {
  amountInRaw: bigint;
  sqrtPriceX96: bigint;
  zeroForOne: boolean;
}): bigint {
  if (input.amountInRaw <= 0n || input.sqrtPriceX96 <= 0n) return 0n;
  if (input.zeroForOne) return (input.amountInRaw * input.sqrtPriceX96 * input.sqrtPriceX96) / Q192;
  return (input.amountInRaw * Q192) / (input.sqrtPriceX96 * input.sqrtPriceX96);
}

/** Price impact in basis points, exact integer floor. Zero when the quote beats spot (rounding). */
export function priceImpactBps(input: { spotAmountOut: bigint; quotedAmountOut: bigint }): bigint | null {
  if (input.spotAmountOut <= 0n) return null;
  if (input.quotedAmountOut >= input.spotAmountOut) return 0n;
  return ((input.spotAmountOut - input.quotedAmountOut) * 10_000n) / input.spotAmountOut;
}

/** Format non-negative basis points as a trimmed percent string, e.g. 4n -> "0.04". */
export function formatBps(bps: bigint): string {
  const whole = bps / 100n;
  const fraction = (bps % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Exact input-side pool fee at the given Uniswap fee tier (parts per 1,000,000). */
export function feeAmountRaw(amountInRaw: bigint, fee: number): bigint {
  return (amountInRaw * BigInt(fee)) / 1_000_000n;
}

export function isZeroOrDeadAddress(address: string): boolean {
  const value = address.toLowerCase();
  return value === "0x0000000000000000000000000000000000000000"
    || value === "0x000000000000000000000000000000000000dead";
}

/** True when a quote ended at a V3 price boundary, which can indicate a partial fill. */
export function isBoundarySqrtPrice(sqrtPriceX96: bigint): boolean {
  return sqrtPriceX96 <= MIN_SQRT_RATIO || sqrtPriceX96 >= MAX_SQRT_RATIO;
}
