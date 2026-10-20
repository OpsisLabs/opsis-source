import { useEffect, useId, useRef, useState } from "react";
import { useCopy } from "../opsis/copy";
import { useI18n } from "../i18n";
import type { StockGapSeries } from "../opsis/stock-gap-series";
import { gapExtent, gapHistogram, gapMedian, historySegments } from "./history";

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(220, Math.round(entry.contentRect.width))),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function RwaHistoryChart({
  series,
  selected,
  select,
}: {
  series: StockGapSeries;
  selected: number;
  select: (index: number) => void;
}) {
  const c = useCopy(),
    { locale } = useI18n();
  const [ref, width] = useWidth();
  const rows = series.observations,
    row = rows[selected];
  const first = Date.parse(rows[0].timestamp),
    last = Date.parse(rows[rows.length - 1].timestamp);
  const left = 52,
    right = width - 18,
    top = 38,
    bottom = 282;
  const extent = gapExtent(series),
    { segments } = historySegments(series);
  const x = (timestamp: string) =>
    left +
    ((Date.parse(timestamp) - first) / Math.max(1, last - first)) *
      (right - left);
  const y = (value: number) =>
    bottom -
    ((value - extent.min) / (extent.max - extent.min)) * (bottom - top);
  const maxAge = Math.max(
    1,
    ...rows.map((point) => point.oracleAgeMinutes ?? 0),
  );
  const tickCount = width < 460 ? 3 : width < 650 ? 6 : 10;
  const ticks = Array.from(
    { length: tickCount },
    (_, i) => first + (i / (tickCount - 1)) * (last - first),
  );
  const date = (value: number) =>
    new Date(value).toLocaleDateString(locale, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  const actions = rows
    .map((point, index) => ({ ...point, index }))
    .filter(
      (point) =>
        point.corporateAction.state === "announced" ||
        point.corporateAction.state === "effective",
    );
  const selectedX = x(row.timestamp),
    selectedY = y(row.chartGapPercent);
  const calloutWidth = Math.min(138, width - 72),
    calloutX = Math.max(left, Math.min(right - calloutWidth, selectedX + 12));
  const calloutY = Math.max(top + 10, Math.min(bottom - 64, selectedY - 64));
  return (
    <div ref={ref} className="rwa-ws-plot">
      <svg
        viewBox={`0 0 ${width} 360`}
        role="img"
        aria-label={c(
          "Token-to-reference gap over observed time. Line breaks show intervals exceeding three times the median observed spacing, not measured missing coverage. Corporate-action markers and data-source-age strip share the time axis. Exact values are in the observations table.",
          "按观察时间显示的代币与参考价差。间隔超过观察间距中位数三倍时断线，不代表测得的缺失覆盖率。公司行动标记及数据来源时距条共用时间轴。精确值见观察值表。",
        )}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - bounds.left) / bounds.width) * width;
          let closest = 0;
          rows.forEach((point, index) => {
            if (
              Math.abs(x(point.timestamp) - px) <
              Math.abs(x(rows[closest].timestamp) - px)
            )
              closest = index;
          });
          select(closest);
        }}
      >
        {extent.ticks.map((tick) => (
          <g key={tick} className="rwa-chart-grid">
            <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
            <text x={left - 10} y={y(tick)} dy=".35em" textAnchor="end">
              {Number(tick.toFixed(4)).toLocaleString(locale, {
                maximumFractionDigits: 4,
              })}
            </text>
          </g>
        ))}
        {ticks.map((tick, index) => {
          const tx = left + (index / (ticks.length - 1)) * (right - left);
          return (
            <g key={tick} className="rwa-chart-grid">
              <line x1={tx} x2={tx} y1={top} y2={bottom + 5} />
              <text
                x={tx}
                y={bottom + 25}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === ticks.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {date(tick)}
              </text>
            </g>
          );
        })}
        <path
          className="rwa-chart-axis"
          d={`M${left},${top}V${bottom}H${right}`}
        />
        <text
          transform={`translate(13 ${(top + bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {c("Gap (%)", "价差（%）")}
        </text>
        {actions.map((point, index) => (
          <g
            key={point.timestamp}
            className={`rwa-chart-event rwa-chart-event-${index % 3}`}
          >
            <line
              className="rwa-chart-action"
              x1={x(point.timestamp)}
              x2={x(point.timestamp)}
              y1={top - 16}
              y2={bottom}
            >
              <title>{point.corporateAction.description}</title>
            </line>
            <circle cx={x(point.timestamp)} cy={top - 20} r={3.5} />
            {width > 460 && (
              <text
                x={Math.min(
                  right - 116,
                  Math.max(left + 4, x(point.timestamp) + 8),
                )}
                y={top - 22}
              >
                {date(Date.parse(point.timestamp))}
                <tspan
                  x={Math.min(
                    right - 116,
                    Math.max(left + 4, x(point.timestamp) + 8),
                  )}
                  dy={14}
                >
                  {(point.corporateAction.description ?? "").slice(0, 23)}
                  {(point.corporateAction.description?.length ?? 0) > 23
                    ? "…"
                    : ""}
                </tspan>
              </text>
            )}
          </g>
        ))}
        {segments.map((segment, index) => (
          <path
            key={index}
            className="rwa-chart-line"
            d={segment
              .map(
                (point, i) =>
                  `${i ? "L" : "M"}${x(point.observation.timestamp)},${y(point.observation.chartGapPercent)}`,
              )
              .join(" ")}
          />
        ))}
        {rows.map((point, index) => (
          <g
            key={point.timestamp}
            className={`rwa-chart-point rwa-session-${point.session}`}
            onClick={() => select(index)}
          >
            <title>{`${point.timestamp} · ${point.gapPercent}% · ${point.session}${point.corporateAction.description ? ` · ${point.corporateAction.description}` : ""}`}</title>
            <circle
              className="rwa-chart-hit"
              cx={x(point.timestamp)}
              cy={y(point.chartGapPercent)}
              r={9}
            />
            <circle
              cx={x(point.timestamp)}
              cy={y(point.chartGapPercent)}
              r={rows.length > 120 ? 1.4 : 2.5}
            />
          </g>
        ))}
        <circle
          className="rwa-chart-selected"
          cx={selectedX}
          cy={selectedY}
          r={8}
        />
        <circle
          className="rwa-chart-focus-dot"
          cx={selectedX}
          cy={selectedY}
          r={4}
        />
        <g className="rwa-chart-callout" aria-hidden="true">
          <path
            d={`M${calloutX + 10},${calloutY + 48}L${selectedX},${selectedY - 9}`}
          />
          <rect
            x={calloutX}
            y={calloutY}
            width={calloutWidth}
            height={48}
            rx={4}
          />
          <text x={calloutX + 10} y={calloutY + 17}>
            {date(Date.parse(row.timestamp))}, {row.timestamp.slice(11, 16)}
            <tspan
              className="rwa-chart-callout-value"
              x={calloutX + 10}
              dy={19}
            >
              {row.gapPercent}%
            </tspan>
          </text>
        </g>
        <text x={0} y={331}>
          {c("Data source age", "数据来源时距")}
        </text>
        <text x={right} y={326} textAnchor="end">
          {series.referenceType === "oracle"
            ? c(
                "Oracle age · minutes · relative height",
                "预言机时距 · 分钟 · 相对高度",
              )
            : c(
                "Unavailable for underlying references",
                "标的参考价无时距数据",
              )}
        </text>
        <line
          className="rwa-chart-grid-line"
          x1={left + (width < 460 ? 0 : 90)}
          x2={right}
          y1={335}
          y2={335}
        />
        {rows.map((point) =>
          point.oracleAgeMinutes === null ? (
            <line
              key={point.timestamp}
              className="rwa-chart-age-unknown"
              x1={x(point.timestamp)}
              x2={x(point.timestamp)}
              y1={343}
              y2={355}
            />
          ) : (
            <line
              key={point.timestamp}
              className="rwa-chart-age"
              x1={x(point.timestamp)}
              x2={x(point.timestamp)}
              y1={355 - Math.max(3, (point.oracleAgeMinutes / maxAge) * 16)}
              y2={355}
            >
              <title>{`${point.timestamp}: ${point.oracleAgeMinutes} ${c("minutes", "分钟")}`}</title>
            </line>
          ),
        )}
      </svg>
    </div>
  );
}

export function RwaHistogram({ series }: { series: StockGapSeries }) {
  const c = useCopy();
  const [ref, width] = useWidth(),
    gradient = useId();
  const bins = gapHistogram(series, 30),
    median = Number(gapMedian(series));
  const left = 52,
    right = width - 18,
    top = 28,
    bottom = 118;
  const start = bins[0].from,
    end = bins[bins.length - 1].to;
  const x = (value: number) =>
    left + ((value - start) / (end - start)) * (right - left);
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const step = Math.max(1, Math.ceil(max / 3)),
    ceiling = Math.ceil(max / step) * step;
  const y = (value: number) => bottom - (value / ceiling) * (bottom - top);
  return (
    <div ref={ref} className="rwa-ws-histogram">
      <svg
        viewBox={`0 0 ${width} 170`}
        role="img"
        aria-label={c(
          "Gap distribution: counts in thirty equal-width bins over the imported sample, with its median marked. Exact observations and bin counts are available below.",
          "价差分布：导入样本中三十个等宽区间的计数，并标记中位数。精确观察值及区间计数见下方。",
        )}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="var(--accent)" stopOpacity=".45" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".22" />
          </linearGradient>
        </defs>
        {Array.from({ length: ceiling / step + 1 }, (_, i) => i * step).map(
          (count) => (
            <g key={count} className="rwa-chart-grid">
              <line x1={left} x2={right} y1={y(count)} y2={y(count)} />
              <text x={left - 10} y={y(count)} dy=".35em" textAnchor="end">
                {count}
              </text>
            </g>
          ),
        )}
        {Array.from(
          { length: width < 460 ? 4 : 9 },
          (_, i) => start + (i / ((width < 460 ? 4 : 9) - 1)) * (end - start),
        ).map((tick) => (
          <g key={tick} className="rwa-chart-grid">
            <line x1={x(tick)} x2={x(tick)} y1={top} y2={bottom + 5} />
            <text x={x(tick)} y={bottom + 22} textAnchor="middle">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {bins.map((bin, index) => (
          <rect
            key={index}
            className="rwa-chart-bin"
            style={{ fill: `url(#${gradient})` }}
            x={x(bin.from) + 1}
            y={y(bin.count)}
            width={Math.max(1, (right - left) / bins.length - 2)}
            height={bottom - y(bin.count)}
          >
            <title>{`${bin.from.toFixed(4)}% – ${bin.to.toFixed(4)}%: ${bin.count}`}</title>
          </rect>
        ))}
        <path
          className="rwa-chart-axis"
          d={`M${left},${top}V${bottom}H${right}`}
        />
        <line
          className="rwa-chart-median"
          x1={x(median)}
          x2={x(median)}
          y1={8}
          y2={bottom}
        />
        <text
          className="rwa-chart-median-label"
          x={Math.max(left, Math.min(right - 112, x(median) + 8))}
          y={13}
        >
          {c("Median", "中位数")} {median.toFixed(2)}%
        </text>
        <text
          transform={`translate(13 ${(top + bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {c("Count", "计数")}
        </text>
        <text x={(left + right) / 2} y={162} textAnchor="middle">
          {c("Token-to-reference gap (%)", "代币与参考价差（%）")}
        </text>
      </svg>
    </div>
  );
}

export function EmptyHistoryChart({
  histogram = false,
  importAction,
}: {
  histogram?: boolean;
  importAction: () => void;
}) {
  const c = useCopy();
  const [ref, width] = useWidth();
  const height = histogram ? 170 : 340,
    left = 48,
    right = width - 14,
    top = 22,
    bottom = height - 38;
  return (
    <div
      ref={ref}
      className={`rwa-ws-empty-chart ${histogram ? "rwa-ws-empty-histogram" : ""}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          histogram
            ? c(
                "Empty gap distribution chart; paired observations required",
                "空价差分布图；需要配对观察值",
              )
            : c(
                "Empty token-to-reference gap chart; paired observations required",
                "空代币与参考价差图；需要配对观察值",
              )
        }
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g className="rwa-chart-grid" key={i}>
            <line
              x1={left}
              x2={right}
              y1={top + ((bottom - top) * i) / 4}
              y2={top + ((bottom - top) * i) / 4}
            />
            <line
              x1={left + ((right - left) * i) / 4}
              x2={left + ((right - left) * i) / 4}
              y1={top}
              y2={bottom}
            />
          </g>
        ))}
        <path
          className="rwa-chart-axis"
          d={`M${left},${top}V${bottom}H${right}`}
        />
        <text x={(left + right) / 2} y={height - 10} textAnchor="middle">
          {histogram
            ? c("Gap (%) · no observations", "价差（%）· 无观察值")
            : c(
                "Observed time (UTC) · no observations",
                "观察时间（UTC）· 无观察值",
              )}
        </text>
        <text
          transform={`translate(13 ${(top + bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {histogram ? c("Count", "计数") : c("Gap (%)", "价差（%）")}
        </text>
      </svg>
      <div className="rwa-ws-empty-message">
        <h3>
          {histogram
            ? c(
                "No distribution without paired prices",
                "无配对价格，无法显示分布",
              )
            : c("Paired observations are needed", "需要配对观察值")}
        </h3>
        {!histogram && (
          <p>
            {c(
              "The lookup returns a snapshot, not a price series. Import dated token and reference prices to plot the observed gap.",
              "查询返回快照而非价格序列。导入注明日期的代币及参考价格，以绘制观察价差。",
            )}
          </p>
        )}
        <button type="button" onClick={importAction}>
          {c("Import paired prices", "导入配对价格")}
        </button>
      </div>
    </div>
  );
}
