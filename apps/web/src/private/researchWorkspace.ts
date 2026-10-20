import type { SourceCitation } from "../dashboard/types";
import {
  explorerNumber,
  isBurnAddress,
  visibleTokenText,
} from "../opsis/explorer-facts";
import {
  formatExactAmount,
  scaleRawAmount,
} from "../opsis/transactionTimeline";
import type { ResearchFacts } from "./api";

export function holderObservations(facts: ResearchFacts) {
  if (facts.holderCoverage === "unavailable") return [];
  return (facts.topHolders ?? []).map((holder) => {
    const value = explorerNumber(holder.share);
    return {
      ...holder,
      // Numeric positions are for drawing only; the source value stays exact in the table.
      percent: value !== null && value <= 100 ? value : null,
      shareText: value !== null && value <= 100 ? `${holder.share}%` : null,
      classification:
        holder.isBurn || isBurnAddress(holder.address)
          ? ("burn" as const)
          : holder.isPool
            ? ("pool" as const)
            : holder.isContract
              ? ("contract" as const)
              : ("unknown" as const),
    };
  });
}

export function transferObservations(facts: ResearchFacts) {
  if (facts.activityCoverage === "unavailable") return [];
  return (facts.recentTransfers ?? []).map((row) => {
    const amount =
      formatExactAmount(row.formattedValue) !== null
        ? row.formattedValue!
        : scaleRawAmount(row.rawValue, explorerNumber(facts.decimals));
    const symbol =
      row.tokenSymbol || (typeof facts.symbol === "string" ? facts.symbol : "");
    return {
      ...row,
      amount: amount === null ? null : formatExactAmount(amount),
      symbol: visibleTokenText(symbol),
    };
  });
}

/** Source reads are receipts, not a historical series of holder observations. */
export function sourceReadTimeline(sources: SourceCitation[]) {
  return sources
    .filter((source) => Number.isFinite(Date.parse(source.fetchedAt)))
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
}

/** A bounded cumulative curve of the reported non-pool, non-burn holders.
 * Missing shares invalidate rank ordering; never turn an unknown share into zero.
 * A separate top-ten aggregate can be marked, but never fills missing ranks.
 */
export function cumulativeHolders(facts: ResearchFacts) {
  const rows = holderObservations(facts).filter(
    (row) => row.classification !== "burn" && row.classification !== "pool",
  );
  if (!rows.length || rows.some((row) => row.percent === null)) return [];
  const sorted = [...rows].sort((a, b) => b.percent! - a.percent!);
  let cumulative = 0;
  const points = sorted.map((row, index) => {
    cumulative += row.percent!;
    return { ...row, rank: index + 1, cumulative };
  });
  // Rounded source percentages may sum slightly above 100. Refuse inconsistent data.
  return cumulative > 100 ? [] : points;
}

export function holderChartGeometry<
  T extends { rank: number; cumulative: number },
>(
  points: T[],
  width: number,
  height: number,
  maximumRank = Math.max(10, ...points.map((point) => point.rank)),
) {
  const left = 54,
    top = 20,
    right = 18,
    bottom = 48;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);
  const x = (rank: number) =>
    left +
    (Math.log10(Math.max(1, rank)) / Math.log10(Math.max(10, maximumRank))) *
      plotWidth;
  const y = (percent: number) => top + (1 - percent / 100) * plotHeight;
  return {
    left,
    top,
    right,
    bottom,
    x,
    y,
    points: points.map((point) => ({
      ...point,
      x: x(point.rank),
      y: y(point.cumulative),
    })),
  };
}

/** Counts by actual timestamp, never a token-volume sum across unknown units. */
export function transferReadCounts(facts: ResearchFacts) {
  const counts = new Map<string, number>();
  for (const row of transferObservations(facts)) {
    if (!row.timestamp || !Number.isFinite(Date.parse(row.timestamp))) continue;
    const time = new Date(row.timestamp).toISOString();
    counts.set(time, (counts.get(time) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, count]) => ({ time, count }));
}
