import type { PublicSwapHistoryRead } from "./public-swap-reader.js";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const Q192 = 1n << 192n;
const MAX_SQRT_PRICE = (1n << 160n) - 1n;
const DISPLAY_SCALE = 36n;
const DISPLAY_DENOMINATOR = 10n ** DISPLAY_SCALE;

export type PriceOrientation = {
  poolAddress: string;
  base: "token0" | "token1";
  token0Decimals: number;
  token1Decimals: number;
};

export type TradeDrivenPriceSample = {
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  blockTimestamp: string;
  sqrtPriceX96: string;
  /** Exact quote/base rational, with pool token decimals applied. */
  numerator: string;
  denominator: string;
  /** Truncated to at most 36 decimal places; null means below that precision. */
  quotePerBase: string | null;
  truncated: boolean;
};

export type TradeDrivenPriceSeries =
  | { state: "complete"; method: "uniswap-v3-post-swap-sqrt-price"; samples: TradeDrivenPriceSample[] }
  | { state: "empty"; samples: [] }
  | { state: "gap" | "unavailable" };

/**
 * One point per verified Swap event. This is a trade-driven sampled token
 * ratio, not an OHLC candle, a continuously quoted price, or a USD price.
 */
export function deriveTradeDrivenPriceSeries(
  read: PublicSwapHistoryRead,
  orientation: PriceOrientation,
): TradeDrivenPriceSeries {
  if (read.state === "gap" || read.state === "unavailable") return { state: read.state };
  if (read.state === "empty") return { state: "empty", samples: [] };
  if (!ADDRESS.test(orientation.poolAddress) || !["token0", "token1"].includes(orientation.base)
    || !validDecimals(orientation.token0Decimals) || !validDecimals(orientation.token1Decimals)
    || !Array.isArray(read.events) || read.events.length === 0 || read.events.length > 100) return { state: "gap" };

  const parsed: Array<TradeDrivenPriceSample & { block: bigint; timestamp: number }> = [];
  const seen = new Set<string>();
  for (const event of read.events) {
    if (!event || typeof event !== "object"
      || event.poolAddress !== orientation.poolAddress || typeof event.blockNumber !== "string"
      || !DECIMAL.test(event.blockNumber) || typeof event.blockHash !== "string" || !HASH.test(event.blockHash)
      || typeof event.transactionHash !== "string" || !HASH.test(event.transactionHash)
      || typeof event.logIndex !== "number" || !Number.isSafeInteger(event.logIndex) || event.logIndex < 0
      || typeof event.blockTimestamp !== "string" || !validIsoTime(event.blockTimestamp)
      || typeof event.sqrtPriceX96 !== "string" || !DECIMAL.test(event.sqrtPriceX96)) return { state: "gap" };
    const sqrt = BigInt(event.sqrtPriceX96);
    if (sqrt === 0n || sqrt > MAX_SQRT_PRICE) return { state: "gap" };
    const identity = `${event.blockHash}:${event.transactionHash}:${event.logIndex}`;
    if (seen.has(identity)) return { state: "gap" };
    seen.add(identity);

    const squared = sqrt * sqrt;
    const token1PerToken0Numerator = squared * 10n ** BigInt(orientation.token0Decimals);
    const token1PerToken0Denominator = Q192 * 10n ** BigInt(orientation.token1Decimals);
    const numerator = orientation.base === "token0" ? token1PerToken0Numerator : token1PerToken0Denominator;
    const denominator = orientation.base === "token0" ? token1PerToken0Denominator : token1PerToken0Numerator;
    const scaled = numerator * DISPLAY_DENOMINATOR / denominator;
    const remainder = numerator * DISPLAY_DENOMINATOR % denominator;
    parsed.push({
      blockNumber: event.blockNumber,
      blockHash: event.blockHash,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      blockTimestamp: event.blockTimestamp,
      sqrtPriceX96: event.sqrtPriceX96,
      numerator: numerator.toString(),
      denominator: denominator.toString(),
      quotePerBase: scaled === 0n ? null : decimalFromScaled(scaled),
      truncated: remainder !== 0n,
      block: BigInt(event.blockNumber),
      timestamp: Date.parse(event.blockTimestamp),
    });
  }
  parsed.sort((a, b) => a.block < b.block ? -1 : a.block > b.block ? 1 : a.logIndex - b.logIndex);
  for (let i = 1; i < parsed.length; i++) {
    const previous = parsed[i - 1]!;
    const current = parsed[i]!;
    if (current.timestamp < previous.timestamp
      || (current.block === previous.block && current.logIndex <= previous.logIndex)) return { state: "gap" };
  }
  return { state: "complete", method: "uniswap-v3-post-swap-sqrt-price",
    samples: parsed.map(({ block: _block, timestamp: _timestamp, ...publicSample }) => publicSample) };
}

function validDecimals(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 36; }

function validIsoTime(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function decimalFromScaled(scaled: bigint): string {
  const whole = scaled / DISPLAY_DENOMINATOR;
  const fraction = (scaled % DISPLAY_DENOMINATOR).toString().padStart(Number(DISPLAY_SCALE), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
