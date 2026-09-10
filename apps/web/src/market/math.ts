import type { VaultMarketComparison } from "../vault/types";
import { translateCurrent } from "../i18n/translate";
import type { TranslationKey } from "../i18n";

type Decimal = { coefficient: bigint; scale: number };

type ReasonTranslator = (key: TranslationKey) => string;

export type LandedCostRow = {
  comparison: VaultMarketComparison;
  landedTotal: string | null;
  rank: number | null;
  rankable: boolean;
  unavailableReason: string | null;
  comparisonGroup: string;
  fresh: boolean;
};

export function calculateLandedCosts(
  comparisons: VaultMarketComparison[],
  freshComparisonIds: ReadonlySet<string>,
  translate: ReasonTranslator = translateCurrent,
): LandedCostRow[] {
  const rows = comparisons.map((comparison): LandedCostRow => {
    const group = JSON.stringify([
      comparison.canonicalAssetId,
      comparison.condition.trim().toLowerCase(),
      comparison.currency,
      normalizeDecimal(comparison.quantity),
      comparison.region.trim().toLowerCase(),
    ]);
    const missing = [
      comparison.shipping,
      comparison.tax,
      comparison.duty,
      comparison.fees,
      comparison.discount,
    ].some((value) => value === "");
    let total: Decimal | null = null;
    let reason: string | null = null;
    if (comparison.identityConfidence === "candidate")
      reason = translate("market.math.reasonCandidate");
    else if (!comparison.condition.trim())
      reason = translate("market.math.reasonCondition");
    else if (
      !["provider_available", "provider_low_stock", "owner_available"].includes(
        comparison.inventoryState,
      )
    )
      reason = translate("market.math.reasonAvailability");
    else if (!freshComparisonIds.has(comparison.id))
      reason = translate("market.math.reasonStale");
    else if (missing)
      reason = translate("market.math.reasonMissingCosts");
    else {
      total = subtract(
        add(
          add(
            multiply(
              parseDecimal(comparison.itemUnitPrice),
              parseDecimal(comparison.quantity),
            ),
            parseDecimal(comparison.shipping),
          ),
          add(
            add(parseDecimal(comparison.tax), parseDecimal(comparison.duty)),
            parseDecimal(comparison.fees),
          ),
        ),
        parseDecimal(comparison.discount),
      );
      if (total.coefficient < 0n) {
        total = null;
        reason = translate("market.math.reasonDiscountExceeds");
      }
    }
    return {
      comparison,
      landedTotal: total ? decimalToString(total) : null,
      rank: null,
      rankable: total !== null && reason === null,
      unavailableReason: reason,
      comparisonGroup: group,
      fresh: freshComparisonIds.has(comparison.id),
    };
  });

  const groups = new Map<string, LandedCostRow[]>();
  for (const row of rows) {
    if (!row.rankable) continue;
    const group = groups.get(row.comparisonGroup) ?? [];
    group.push(row);
    groups.set(row.comparisonGroup, group);
  }
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        compare(
          parseDecimal(left.landedTotal ?? "0"),
          parseDecimal(right.landedTotal ?? "0"),
        ) || left.comparison.id.localeCompare(right.comparison.id),
    );
    let prior: string | null = null;
    let rank = 0;
    group.forEach((row, index) => {
      if (row.landedTotal !== prior) rank = index + 1;
      row.rank = rank;
      prior = row.landedTotal;
    });
  }
  return rows.sort((left, right) => {
    if (left.rankable !== right.rankable) return left.rankable ? -1 : 1;
    if (left.comparisonGroup !== right.comparisonGroup)
      return left.comparisonGroup.localeCompare(right.comparisonGroup);
    if (left.rank !== right.rank)
      return (
        (left.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.rank ?? Number.MAX_SAFE_INTEGER)
      );
    return left.comparison.id.localeCompare(right.comparison.id);
  });
}

export function buildMarketHandoffs(
  name: string,
  setName = "",
  number = "",
): Array<{
  id: string;
  label: string;
  url: string;
  query: string;
  liveData: false;
}> {
  const query = [
    name.trim(),
    setName.trim(),
    number.trim() ? `#${number.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 180);
  const encoded = encodeURIComponent(query);
  return [
    {
      id: "ebay",
      label: translateCurrent("market.handoff.ebay"),
      url: `https://www.ebay.com/sch/i.html?_nkw=${encoded}`,
      query,
      liveData: false,
    },
    {
      id: "tcgplayer",
      label: translateCurrent("market.handoff.tcgplayer"),
      url: `https://www.tcgplayer.com/search/all/product?q=${encoded}&view=grid`,
      query,
      liveData: false,
    },
    {
      id: "cardmarket",
      label: translateCurrent("market.handoff.cardmarket"),
      url: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encoded}`,
      query,
      liveData: false,
    },
  ];
}

function parseDecimal(value: string): Decimal {
  const match = /^(\d{1,78})(?:\.(\d{1,78}))?$/.exec(value);
  if (!match) throw new Error("invalid exact decimal");
  const fraction = match[2] ?? "";
  return normalize({
    coefficient: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  });
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return normalize({
    coefficient:
      left.coefficient * 10n ** BigInt(scale - left.scale) +
      right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  });
}

function subtract(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return normalize({
    coefficient:
      left.coefficient * 10n ** BigInt(scale - left.scale) -
      right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  });
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return normalize({
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  });
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
  const digits = normalized.coefficient.toString();
  if (normalized.scale === 0) return digits;
  const padded = digits.padStart(normalized.scale + 1, "0");
  return `${padded.slice(0, -normalized.scale)}.${padded.slice(-normalized.scale)}`;
}

function normalizeDecimal(value: string): string {
  return decimalToString(parseDecimal(value));
}
