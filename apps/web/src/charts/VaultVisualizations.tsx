import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import type { VaultAsset } from "../vault/types";
import { allocationPercent, valueTotals } from "../portfolio/math";
import {
  ChainScoutChart,
} from "./ChainScoutChart";
import { CHART_COLORS, darkAxis, darkGrid, darkTooltip } from "./theme";

const TYPE_LABELS: Record<VaultAsset["assetType"], string> = {
  crypto: "Crypto",
  collectible: "Collectibles",
  rwa: "Tokenized / RWA",
  nft: "NFTs",
  other: "Other",
};

type ValuePoint = {
  date: string;
  value: string;
  numeric: number;
  kind: "purchase" | "reference";
  label: string;
};

export function VaultRecordMixChart({ assets }: { assets: VaultAsset[] }) {
  const data = useMemo(
    () =>
      Object.entries(TYPE_LABELS)
        .map(([type, name]) => ({
          name,
          value: assets.filter((asset) => asset.assetType === type).length,
        }))
        .filter((item) => item.value > 0),
    [assets],
  );
  if (!data.length) return null;

  const option: EChartsCoreOption = {
    tooltip: {
      ...darkTooltip,
      trigger: "item",
      formatter: (params: unknown) => {
        const item = params as { name?: string; value?: number };
        return `${item.name ?? "Asset type"}<br/><b>${item.value ?? 0} encrypted record${item.value === 1 ? "" : "s"}</b>`;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: "#9a938a", fontSize: 9 },
      itemWidth: 9,
      itemHeight: 9,
    },
    series: [
      {
        name: "Encrypted records",
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#242424", borderWidth: 3 },
        label: {
          color: "#d6ccba",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 9,
          formatter: "{b}\n{c}",
        },
        data,
      },
    ],
  };

  return (
    <ChartPanel
      eyebrow="ENCRYPTED RECORD MIX"
      copy="Record counts only. This is not a value allocation or market-weight chart."
    >
      <ChainScoutChart
        option={option}
        label={`Encrypted Vault records by asset type: ${data.map((item) => `${item.name} ${item.value}`).join(", ")}.`}
        height={250}
      />
      <DataTable
        headings={["Asset type", "Encrypted records"]}
        rows={data.map((item) => [item.name, String(item.value)])}
      />
    </ChartPanel>
  );
}

export function CollectibleValueHistoryChart({ asset }: { asset: VaultAsset }) {
  const groups = useMemo(() => collectibleGroups(asset), [asset]);
  if (!asset.collectible || groups.length === 0) return null;

  return (
    <div className="mt-4 space-y-3" data-testid="collectible-value-history">
      {groups.map(({ currency, points }) => {
        const option: EChartsCoreOption = {
          grid: darkGrid,
          tooltip: {
            ...darkTooltip,
            trigger: "axis",
            formatter: (params: unknown) => {
              const items = (Array.isArray(params) ? params : [params]) as Array<{
                dataIndex?: number;
                seriesName?: string;
              }>;
              const point = points[items[0]?.dataIndex ?? -1];
              if (!point) return "";
              return `${point.date}<br/>${point.label}<br/><b>${point.value} ${currency}</b>`;
            },
          },
          xAxis: {
            ...darkAxis,
            type: "category",
            boundaryGap: false,
            data: points.map((point) => point.date),
          },
          yAxis: {
            ...darkAxis,
            type: "value",
            name: currency,
            nameTextStyle: { color: "#9a938a", fontSize: 9 },
          },
          series: [
            {
              name: "Purchase / reference",
              type: "line",
              smooth: false,
              connectNulls: false,
              symbolSize: 8,
              lineStyle: { color: CHART_COLORS[0], width: 2 },
              itemStyle: {
                color: (params: unknown) =>
                  points[(params as { dataIndex: number }).dataIndex]?.kind ===
                  "purchase"
                    ? CHART_COLORS[1]
                    : CHART_COLORS[0],
              },
              areaStyle: { color: "rgba(250,108,52,0.08)" },
              data: points.map((point) => point.numeric),
            },
          ],
        };
        return (
          <div key={currency} className="border border-[#383838] bg-[#202020] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono-d text-[8px] tracking-wider text-[#fa6c34]">
                OWNER-ENTERED HISTORY · {currency}
              </p>
              <p className="font-mono-d text-[7.5px] text-[#7f7972]">
                LAVENDER PURCHASE · ORANGE REFERENCE
              </p>
            </div>
            <ChainScoutChart
              option={option}
              label={`${asset.name} owner-entered purchase and dated reference history in ${currency}. Not a live market feed.`}
              height={210}
            />
            <DataTable
              headings={["Date", "Entry", `Exact value (${currency})`]}
              rows={points.map((point) => [point.date, point.label, point.value])}
            />
          </div>
        );
      })}
      <p className="text-[9px] leading-relaxed text-[#7f7972]">
        This visualization uses encrypted purchase lots and owner-entered dated
        reference sources. It is not a live price feed, appraisal, sale record,
        or authenticity claim.
      </p>
    </div>
  );
}

export function PortfolioAllocationChart({
  rows,
}: {
  rows: Array<{
    symbol: string;
    currentValue: string | null;
    reference: { currency: string } | null;
  }>;
}) {
  const groups = useMemo(() => allocationGroups(rows), [rows]);
  if (!groups.length) return null;

  return (
    <section className="clip-panel border border-[#383838] bg-[#242424] p-5">
      <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
        LOCAL REFERENCE ALLOCATION
      </p>
      <p className="mt-2 text-[10.5px] leading-relaxed text-[#7f7972]">
        Values are grouped by matching owner-entered currency. ChainScout never
        invents foreign-exchange conversion or mixes currencies into one total.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {groups.map(({ currency, entries }) => {
          const option: EChartsCoreOption = {
            grid: { ...darkGrid, top: 12 },
            tooltip: {
              ...darkTooltip,
              trigger: "axis",
              axisPointer: { type: "shadow" },
              formatter: (params: unknown) => {
                const item = (Array.isArray(params) ? params[0] : params) as {
                  dataIndex?: number;
                };
                const entry = entries[item?.dataIndex ?? -1];
                return entry
                  ? `${entry.symbol}<br/><b>${entry.exact} ${currency}</b><br/>${entry.percent.toFixed(2)}% of ${currency} references`
                  : "";
              },
            },
            xAxis: {
              ...darkAxis,
              type: "value",
              max: 100,
              axisLabel: {
                color: "#9a938a",
                fontSize: 9,
                formatter: "{value}%",
              },
            },
            yAxis: {
              ...darkAxis,
              type: "category",
              inverse: true,
              data: entries.map((entry) => entry.symbol),
            },
            series: [
              {
                name: currency,
                type: "bar",
                barMaxWidth: 22,
                itemStyle: { color: CHART_COLORS[0] },
                data: entries.map((entry) => entry.percent),
              },
            ],
          };
          return (
            <div key={currency} className="border border-[#333] bg-[#202020] p-3">
              <p className="font-mono-d text-[8px] tracking-wider text-[#d6ccba]">
                {currency} · {entries.length} REFERENCED HOLDING{entries.length === 1 ? "" : "S"}
              </p>
              <ChainScoutChart
                option={option}
                label={`Owner-entered portfolio reference allocation in ${currency}: ${entries.map((entry) => `${entry.symbol} ${entry.percent.toFixed(2)} percent`).join(", ")}.`}
                height={Math.max(190, entries.length * 42 + 75)}
              />
              <DataTable
                headings={["Holding", `Exact reference value (${currency})`, "Share"]}
                rows={entries.map((entry) => [
                  entry.symbol,
                  entry.exact,
                  `${entry.percent.toFixed(2)}%`,
                ])}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function collectibleGroups(asset: VaultAsset) {
  if (!asset.collectible) return [];
  const byCurrency = new Map<string, ValuePoint[]>();
  const add = (currency: string, point: ValuePoint) => {
    const normalized = currency.trim().toUpperCase();
    if (!normalized || !Number.isFinite(point.numeric)) return;
    byCurrency.set(normalized, [...(byCurrency.get(normalized) ?? []), point]);
  };
  asset.lots.forEach((lot, index) => {
    if (!lot.unitPrice || !lot.acquiredAt) return;
    add(lot.currency, {
      date: lot.acquiredAt,
      value: lot.unitPrice,
      numeric: Number(lot.unitPrice),
      kind: "purchase",
      label: `Purchase lot ${index + 1} · unit price`,
    });
  });
  asset.collectible.references.forEach((reference) => {
    add(reference.currency, {
      date: reference.observedAt,
      value: reference.value,
      numeric: Number(reference.value),
      kind: "reference",
      label: reference.label,
    });
  });
  return [...byCurrency.entries()]
    .map(([currency, points]) => ({
      currency,
      points: points.sort((left, right) =>
        left.date === right.date
          ? left.kind.localeCompare(right.kind)
          : left.date.localeCompare(right.date),
      ),
    }))
    .filter((group) => group.points.length > 0)
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function allocationGroups(
  rows: Array<{
    symbol: string;
    currentValue: string | null;
    reference: { currency: string } | null;
  }>,
) {
  const totals = valueTotals(
    rows.map((row, index) => ({
      assetKey: String(index),
      name: row.symbol,
      symbol: row.symbol,
      quantity: "0",
      linkedAsset: null,
      lotQuantity: null,
      quantityMatches: false,
      acquisition: [],
      reference: row.reference
        ? { id: String(index), assetKey: String(index), unitPrice: "0", currency: row.reference.currency, updatedAt: "1970-01-01T00:00:00.000Z" }
        : null,
      currentValue: row.currentValue,
      unrealizedGain: null,
      gainUnavailableReason: null,
    })),
  );
  const byCurrency = new Map<string, Array<{ symbol: string; exact: string }>>();
  rows.forEach((row) => {
    if (!row.currentValue || !row.reference) return;
    const currency = row.reference.currency.trim().toUpperCase();
    byCurrency.set(currency, [
      ...(byCurrency.get(currency) ?? []),
      { symbol: row.symbol, exact: row.currentValue },
    ]);
  });
  return [...byCurrency.entries()]
    .map(([currency, values]) => {
      const total = totals.find((item) => item.currency === currency)?.value ?? "0";
      return {
        currency,
        entries: values
          .map((item) => ({
            ...item,
            percentExact: allocationPercent(item.exact, total) ?? "0",
            percent: Number(allocationPercent(item.exact, total) ?? "0"),
          }))
          .sort((left, right) =>
            right.percent === left.percent
              ? left.symbol.localeCompare(right.symbol)
              : right.percent - left.percent,
          ),
      };
    })
    .filter((group) => group.entries.some((entry) => entry.percent > 0))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function ChartPanel({
  eyebrow,
  copy,
  children,
}: {
  eyebrow: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="clip-panel border border-[#383838] bg-[#242424] p-5">
      <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
        {eyebrow}
      </p>
      <p className="mt-2 text-[10.5px] leading-relaxed text-[#7f7972]">
        {copy}
      </p>
      {children}
    </section>
  );
}

function DataTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 border-t border-[#333] pt-2">
      <summary className="cursor-pointer font-mono-d text-[8px] tracking-wider text-[#9a938a]">
        ACCESSIBLE EXACT DATA TABLE
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[360px] border-collapse text-left font-mono-d text-[8px] text-[#9a938a]">
          <thead>
            <tr>
              {headings.map((heading) => (
                <th key={heading} className="border-b border-[#383838] px-2 py-2 text-[#d6ccba]">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${row.join(":")}:${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}:${cellIndex}`} className="border-b border-[#2f2f2f] px-2 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
