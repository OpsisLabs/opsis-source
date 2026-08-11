import type { PortfolioSnapshot } from "@rh-chain/shared";
import type { VaultAsset, VaultPortfolioValuation } from "../vault/types";

type Decimal = { coefficient: bigint; scale: number };

export type PortfolioMathRow = {
  assetKey: string;
  name: string;
  symbol: string;
  quantity: string;
  linkedAsset: VaultAsset | null;
  lotQuantity: string | null;
  quantityMatches: boolean;
  acquisition: Array<{ currency: string; cost: string; complete: boolean }>;
  reference: VaultPortfolioValuation | null;
  currentValue: string | null;
  unrealizedGain: string | null;
  gainUnavailableReason: string | null;
};

export function buildPortfolioMath(
  snapshot: PortfolioSnapshot,
  assets: VaultAsset[],
  valuations: VaultPortfolioValuation[]
): PortfolioMathRow[] {
  const holdings = [
    {
      assetKey: "native:eth",
      identifiers: ["eth", "native:eth"],
      name: "Robinhood Chain ETH",
      symbol: "ETH",
      quantity: snapshot.nativeBalanceEth
    },
    ...snapshot.tokens.map((token) => ({
      assetKey: `token:${token.contract}`,
      identifiers: [token.contract],
      name: token.name,
      symbol: token.symbol,
      quantity: token.quantity
    })),
    ...snapshot.nfts.map((nft) => ({
      assetKey: `nft:${nft.contract}:${nft.tokenId}`,
      identifiers: [`${nft.contract}:${nft.tokenId}`],
      name: nft.name,
      symbol: `${nft.symbol} #${nft.tokenId}`,
      quantity: nft.quantity
    }))
  ];
  return holdings.map((holding) => {
    const linkedAsset = assets.find((asset) => holding.identifiers.includes(asset.identifier.trim().toLowerCase())) ?? null;
    const reference = valuations.find((valuation) => valuation.assetKey === holding.assetKey) ?? null;
    const lotQuantity = linkedAsset
      ? linkedAsset.lots.reduce((sum, lot) => add(sum, parseDecimal(lot.quantity)), zero())
      : null;
    const acquisitionByCurrency = new Map<string, { value: Decimal; complete: boolean }>();
    linkedAsset?.lots.forEach((lot) => {
      const currency = lot.currency.toUpperCase();
      const existing = acquisitionByCurrency.get(currency) ?? { value: zero(), complete: true };
      if (!lot.unitPrice) existing.complete = false;
      else existing.value = add(existing.value, multiply(parseDecimal(lot.quantity), parseDecimal(lot.unitPrice)));
      acquisitionByCurrency.set(currency, existing);
    });
    const acquisition = [...acquisitionByCurrency.entries()]
      .map(([currency, value]) => ({ currency, cost: decimalToString(value.value), complete: value.complete }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
    const quantityMatches = lotQuantity !== null && compare(lotQuantity, parseDecimal(holding.quantity)) === 0;
    const currentValue = reference ? decimalToString(multiply(parseDecimal(holding.quantity), parseDecimal(reference.unitPrice))) : null;
    const matchingCost = reference
      ? acquisition.find((cost) => cost.currency === reference.currency && cost.complete)
      : undefined;
    const gainUnavailableReason = !reference
      ? "Add a local reference price to estimate value."
      : !linkedAsset
        ? "Link a Vault asset by contract, ETH, or contract:tokenId to compare cost."
        : !quantityMatches
          ? "Onchain quantity and entered lots do not match; ChainScout will not invent a disposal method."
          : acquisition.length !== 1 || !matchingCost
            ? "Cost basis is missing or uses a different/mixed currency."
            : null;
    return {
      assetKey: holding.assetKey,
      name: holding.name,
      symbol: holding.symbol,
      quantity: holding.quantity,
      linkedAsset,
      lotQuantity: lotQuantity ? decimalToString(lotQuantity) : null,
      quantityMatches,
      acquisition,
      reference,
      currentValue,
      unrealizedGain: currentValue && matchingCost && !gainUnavailableReason
        ? decimalToString(subtract(parseDecimal(currentValue), parseDecimal(matchingCost.cost)))
        : null,
      gainUnavailableReason
    };
  });
}

export function valueTotals(rows: PortfolioMathRow[]): Array<{ currency: string; value: string }> {
  const totals = new Map<string, Decimal>();
  rows.forEach((row) => {
    if (!row.reference || !row.currentValue) return;
    totals.set(row.reference.currency, add(totals.get(row.reference.currency) ?? zero(), parseDecimal(row.currentValue)));
  });
  return [...totals.entries()]
    .map(([currency, value]) => ({ currency, value: decimalToString(value) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

export function verifiedHoldingCount(snapshot: PortfolioSnapshot): number {
  const nativeHolding = parseDecimal(snapshot.nativeBalanceEth).coefficient === 0n ? 0 : 1;
  return nativeHolding + snapshot.tokens.length + snapshot.nfts.length;
}

export function allocationPercent(value: string, total: string): string | null {
  const part = parseDecimal(value);
  const whole = parseDecimal(total);
  if (part.coefficient < 0n || whole.coefficient <= 0n) return null;
  const scale = Math.max(part.scale, whole.scale);
  const numerator = part.coefficient * 10n ** BigInt(scale - part.scale) * 10_000n;
  const denominator = whole.coefficient * 10n ** BigInt(scale - whole.scale);
  const basisPoints = (numerator + denominator / 2n) / denominator;
  return decimalToString({ coefficient: basisPoints, scale: 2 });
}

export function formatDisplayDecimal(value: string, fractionDigits = 6): string {
  const parsed = parseDecimal(value);
  if (parsed.scale <= fractionDigits) return decimalToString(parsed);
  const divisor = 10n ** BigInt(parsed.scale - fractionDigits);
  const negative = parsed.coefficient < 0n;
  const absolute = negative ? -parsed.coefficient : parsed.coefficient;
  const rounded = (absolute + divisor / 2n) / divisor;
  return decimalToString({ coefficient: negative ? -rounded : rounded, scale: fractionDigits });
}

function parseDecimal(value: string): Decimal {
  const match = /^(-?)(\d{1,400})(?:\.(\d{1,400}))?$/.exec(value);
  if (!match) throw new Error("invalid exact decimal");
  const fraction = match[3] ?? "";
  const coefficient = BigInt(`${match[1]}${match[2]}${fraction}`);
  return normalize({ coefficient, scale: fraction.length });
}

function zero(): Decimal {
  return { coefficient: 0n, scale: 0 };
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return normalize({
    coefficient: left.coefficient * 10n ** BigInt(scale - left.scale) + right.coefficient * 10n ** BigInt(scale - right.scale),
    scale
  });
}

function subtract(left: Decimal, right: Decimal): Decimal {
  return add(left, { coefficient: -right.coefficient, scale: right.scale });
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return normalize({ coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale });
}

function compare(left: Decimal, right: Decimal): number {
  const difference = subtract(left, right).coefficient;
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

function normalize(value: Decimal): Decimal {
  let { coefficient, scale } = value;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function decimalToString(value: Decimal): string {
  const normalized = normalize(value);
  const negative = normalized.coefficient < 0n;
  const digits = (negative ? -normalized.coefficient : normalized.coefficient).toString();
  if (normalized.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(normalized.scale + 1, "0");
  return `${negative ? "-" : ""}${padded.slice(0, -normalized.scale)}.${padded.slice(-normalized.scale)}`;
}
