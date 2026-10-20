import { useEffect, useRef, useState } from "react";
import { useCopy } from "../opsis/copy";
import type { ResearchFacts } from "./api";
import {
  cumulativeHolders,
  holderChartGeometry,
  transferReadCounts,
} from "./researchWorkspace";

function useChartSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, Math.round(entry.contentRect.width))),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function HolderChart({
  facts,
  topTen,
}: {
  facts: ResearchFacts;
  topTen: number | null;
}) {
  const c = useCopy();
  const { ref, width } = useChartSize();
  const [mode, setMode] = useState<"line" | "bars">("line");
  const [selected, setSelected] = useState(0);
  const rows = cumulativeHolders(facts);
  const height = 180;
  const maxRank = Math.max(10, rows.length);
  const g = holderChartGeometry(rows, width, height, maxRank);
  const points = g.points;
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");
  const area = points.length
    ? `${line} L${points.at(-1)!.x},${g.y(0)} L${points[0].x},${g.y(0)} Z`
    : "";
  const marker =
    topTen !== null && topTen <= 100 ? { x: g.x(10), y: g.y(topTen) } : null;
  const active = points[selected];
  return (
    <section
      className="details-ws-panel details-ws-distribution"
      aria-labelledby="details-distribution-title"
    >
      <div className="details-ws-panel-head">
        <h2 id="details-distribution-title">
          {c("Cumulative holder distribution", "持有者累计分布")}
        </h2>
        <div
          className="details-ws-chart-toggle"
          role="group"
          aria-label={c("Chart style", "图表样式")}
        >
          {(["line", "bars"] as const).map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={mode === style}
              onClick={() => setMode(style)}
            >
              {style === "line" ? c("Line", "折线") : c("Bars", "柱状")}
            </button>
          ))}
        </div>
      </div>
      <div className="details-ws-holder-chart" ref={ref}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={c(
            "Cumulative holder distribution by logarithmic wallet rank. Exact values in the holder table below.",
            "按对数钱包排名显示持有者累计分布。精确值见下方持有者表格。",
          )}
          onPointerMove={(event) => {
            const x =
              event.clientX - event.currentTarget.getBoundingClientRect().left;
            if (points.length)
              setSelected(
                points.reduce(
                  (best, point, index) =>
                    Math.abs(point.x - x) < Math.abs(points[best].x - x)
                      ? index
                      : best,
                  0,
                ),
              );
          }}
        >
          {[0, 20, 40, 60, 80, 100].map((tick) => (
            <g key={tick} className="details-ws-chart-grid">
              <line
                x1={g.left}
                x2={width - g.right}
                y1={g.y(tick)}
                y2={g.y(tick)}
              />
              <text x={g.left - 9} y={g.y(tick) + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {Array.from(
            { length: Math.floor(Math.log10(maxRank)) + 1 },
            (_, index) => 10 ** index,
          ).map((rank) => (
            <g key={rank} className="details-ws-chart-grid">
              <line x1={g.x(rank)} x2={g.x(rank)} y1={g.top} y2={g.y(0)} />
              <text x={g.x(rank)} y={height - 29} textAnchor="middle">
                {rank.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          <path
            className="details-ws-chart-axis"
            d={`M${g.left},${g.top}V${g.y(0)}H${width - g.right}`}
          />
          {mode === "line" ? (
            <>
              <path className="details-ws-chart-area" d={area} />
              <path className="details-ws-chart-line" d={line} />
            </>
          ) : (
            points.map((point) => (
              <rect
                key={point.rank}
                className="details-ws-cumulative-bar"
                x={point.x - 3}
                y={point.y}
                width={6}
                height={g.y(0) - point.y}
              >
                <title>{`${point.rank}: ${point.cumulative}%`}</title>
              </rect>
            ))
          )}
          {marker && (
            <g className="details-ws-top-ten">
              <line x1={marker.x} x2={marker.x} y1={g.top} y2={g.y(0)} />
              <circle cx={marker.x} cy={marker.y} r={5} />
              <rect
                x={Math.max(g.left, marker.x - 126)}
                y={Math.max(g.top, marker.y - 48)}
                width={116}
                height={40}
                rx={4}
              />
              <text
                x={Math.max(g.left, marker.x - 126) + 8}
                y={Math.max(g.top, marker.y - 48) + 16}
              >
                {c("Top 10 wallets", "前十大钱包")}
              </text>
              <text
                x={Math.max(g.left, marker.x - 126) + 8}
                y={Math.max(g.top, marker.y - 48) + 31}
              >
                {topTen}%
              </text>
            </g>
          )}
          {active && (
            <circle
              className="details-ws-chart-active"
              cx={active.x}
              cy={active.y}
              r={3.5}
            />
          )}
          <text
            x={(g.left + width - g.right) / 2}
            y={height - 7}
            textAnchor="middle"
          >
            {c("Holder rank (log scale)", "持有者排名（对数刻度）")}
          </text>
          <text
            transform={`translate(13 ${(g.top + g.y(0)) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {c("Cumulative supply (%)", "累计供应量（%）")}
          </text>
        </svg>
        {!points.length && (
          <div className="details-ws-chart-empty">
            {c(
              "Holder shares are missing or inconsistent. Run a token lookup with holder coverage to draw the distribution.",
              "持有者占比缺失或不一致。请查询包含持有者覆盖的代币以绘制分布。",
            )}
          </div>
        )}
      </div>
      <details className="details-ws-chart-inspection">
        <summary>
          {c("Inspect ranks & sample coverage", "检查排名与样本覆盖")}
        </summary>
        {points.length > 0 && (
          <label className="details-ws-inspect">
            {c("Inspect holder", "检查持有者")}
            <select
              aria-label={c("Inspect holder", "检查持有者")}
              value={selected}
              onChange={(event) => setSelected(Number(event.target.value))}
            >
              {rows.map((row, index) => (
                <option key={row.address} value={index}>
                  {row.rank} · {row.address.slice(0, 6)}…{row.address.slice(-4)}
                </option>
              ))}
            </select>
            <output
              className="details-ws-selected-holder"
              title={active?.address}
            >
              {active
                ? `${active.cumulative.toFixed(2)}% ${c("cumulative", "累计")}`
                : "—"}
              <span className="sr-only">{active?.address}</span>
            </output>
          </label>
        )}
        <p className="details-ws-note">
          {c(
            "Reported sample only · pools and burns excluded. The Top 10 marker uses the response aggregate; missing ranks are not interpolated. Exact individual shares remain in the table.",
            "仅报告样本 · 不含池及销毁地址。前十标记使用响应汇总值；不填补缺失排名。精确的各持有者占比保留在表格中。",
          )}
        </p>
      </details>
    </section>
  );
}

export function TransferChart({ facts }: { facts: ResearchFacts }) {
  const c = useCopy();
  const { ref, width } = useChartSize();
  const rows = transferReadCounts(facts);
  if (!rows.length) return null;
  const maximum = Math.max(...rows.map((row) => row.count));
  const plot = width - 62;
  const slot = plot / rows.length;
  return (
    <div className="details-ws-transfer-chart" ref={ref}>
      <h3>
        {c("Transfer records by observed time", "按观察时间统计转账记录")}
      </h3>
      <svg
        width={width}
        height={132}
        role="img"
        aria-label={c(
          "Count of supplied transfer records at each observed time. Exact counts follow.",
          "各观察时间所提供的转账记录数。精确计数见下方。",
        )}
      >
        {[0, maximum].map((tick) => (
          <g className="details-ws-chart-grid" key={tick}>
            <line
              x1={34}
              x2={width - 10}
              y1={96 - (tick / maximum) * 70}
              y2={96 - (tick / maximum) * 70}
            />
            <text x={26} y={100 - (tick / maximum) * 70} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {rows.map((row, index) => (
          <rect
            key={row.time}
            className="details-ws-cumulative-bar"
            x={34 + index * slot + slot * 0.25}
            y={96 - (row.count / maximum) * 70}
            width={Math.max(2, slot * 0.5)}
            height={(row.count / maximum) * 70}
          >
            <title>
              {row.time}: {row.count}
            </title>
          </rect>
        ))}
        <text x={34} y={120}>
          {rows[0].time.slice(11, 19)} UTC
        </text>
        <text x={width - 10} y={120} textAnchor="end">
          {rows.length > 1 ? `${rows.at(-1)!.time.slice(11, 19)} UTC` : ""}
        </text>
      </svg>
      <details>
        <summary>{c("Exact observed counts", "精确观察计数")}</summary>
        <dl className="details-ws-facts">
          {rows.map((row) => (
            <div key={row.time}>
              <dt>{row.time}</dt>
              <dd>{row.count}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
