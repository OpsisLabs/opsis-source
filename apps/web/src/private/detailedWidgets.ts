import { deriveWidgets } from "../dashboard/adapters";
import type { AnswerWidget, ChainEntityType, WidgetRow } from "../dashboard/types";
import { translateCurrent as t } from "../i18n";
import { explorerNumber, holderShares, isBurnAddress, visibleTokenText } from "../opsis/explorer-facts";
import { compactAmount, formatExactAmount, scaleRawAmount } from "../opsis/transactionTimeline";
import type { ResearchFacts } from "./api";

export type DetailedWidget = Omit<AnswerWidget, "rows"> & {
  rows?: (WidgetRow & { exactValue?: string })[];
};

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

function compareAmounts(a: string, b: string): number {
  const [aw, af = ""] = a.split(".");
  const [bw, bf = ""] = b.split(".");
  const whole = BigInt(aw) - BigInt(bw);
  if (whole !== 0n) return whole > 0n ? 1 : -1;
  const places = Math.max(af.length, bf.length);
  return af.padEnd(places, "0").localeCompare(bf.padEnd(places, "0"));
}

/** Detailed research uses the same burn classification and token precision as Research. */
export function detailedWidgets(facts: ResearchFacts, kind: ChainEntityType): DetailedWidget[] {
  const widgets = deriveWidgets(facts, kind);
  if (kind !== "token") return widgets;
  const holders = facts.topHolders ?? [];
  const shares = holderShares(facts);
  const pool = explorerNumber(facts.liquidityPoolShare);
  const ten = explorerNumber(shares.ten);
  const burned = explorerNumber(shares.burned);
  const known = (pool ?? 0) + (ten ?? 0) + (burned ?? 0);
  const supply: AnswerWidget["segments"] = [
    ...(pool !== null && pool > 0 ? [{ label: t("cloud.widget.segment.tradingPool"), pct: pool }] : []),
    ...(ten !== null && ten > 0 ? [{ label: t("cloud.widget.segment.top10"), pct: ten }] : []),
    ...(burned !== null && burned > 0 ? [{ label: t("cloud.widget.segment.burned"), pct: burned }] : []),
    ...(known < 100 ? [{ label: t(pool !== null && ten !== null && burned !== null
      ? "cloud.widget.segment.everyoneElse" : "cloud.widget.segment.unclassified"), pct: 100 - known }] : []),
  ];

  const decimals = explorerNumber(facts.decimals);
  const transfers = (facts.recentTransfers ?? []).flatMap((row) => {
    const amount = formatExactAmount(row.formattedValue) !== null ? row.formattedValue!
      : scaleRawAmount(row.rawValue, decimals);
    return amount !== null && /^0x[0-9a-f]{40}$/i.test(row.from) && /^0x[0-9a-f]{40}$/i.test(row.to)
      && compareAmounts(amount, "0") > 0 ? [{ ...row, amount }] : [];
  }).sort((a, b) => compareAmounts(b.amount, a.amount)).slice(0, 5);
  const peak = Number(transfers[0]?.amount);
  const transferWidget: DetailedWidget = {
    kind: "rows",
    title: t("cloud.widget.largestTransfers.title"),
    note: t("cloud.widget.tokenTransfers.note"),
    rows: transfers.map((row) => {
      const symbol = row.tokenSymbol || (typeof facts.symbol === "string" ? facts.symbol : "");
      const unit = symbol ? visibleTokenText(symbol) : t("cloud.widget.tokenUnitUnknown");
      return {
        label: `${shortAddress(row.from)} → ${shortAddress(row.to)}`,
        sub: row.timestamp,
        value: `${compactAmount(row.amount, 2)} ${unit}`,
        exactValue: `${formatExactAmount(row.amount)} ${unit}`,
        barPct: Number.isFinite(peak) && peak > 0 ? (Number(row.amount) / peak) * 100 : undefined,
        pivot: row.to,
      };
    }),
  };

  const corrected = widgets.flatMap((widget): DetailedWidget[] => {
    if (widget.title === t("cloud.widget.supplyControl.title")) {
      return known <= 100 ? [{ ...widget, segments: supply }] : [];
    }
    if (widget.title === t("cloud.widget.largestHolders.title")) {
      return [{ ...widget, rows: widget.rows?.map((row) => {
        const holder = holders.find((holder) => holder.address === row.pivot);
        return holder && (holder.isBurn || isBurnAddress(holder.address))
          ? { ...row, sub: t("cloud.widget.holder.burn"), tone: "neutral" } : row;
      }) }];
    }
    if (widget.title === transferWidget.title) return [];
    return [widget];
  });
  if (transfers.length) corrected.push(transferWidget);
  return corrected;
}
