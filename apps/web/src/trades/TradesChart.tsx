import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { useCopy } from "../opsis/copy";
import type { ObservedTradesResponse } from "./api";
import { scatter, swapAmounts, type ScatterScale } from "./chart";
import { formatTimestamp } from "./model";

const M = { top: 18, right: 16, bottom: 64, left: 64 };

export function TradesChart({
  data,
  selectedId,
  onSelect,
  scale,
  unit,
  emptyState,
}: {
  data: ObservedTradesResponse | null;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  scale: ScatterScale;
  unit: string;
  emptyState?: ReactNode;
}) {
  const c = useCopy();
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const dots = useRef(new Map<string, SVGGElement>());
  const [size, setSize] = useState({ width: 640, height: 350 });
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const plot = scatter(
    data?.observations ?? [],
    data?.window ?? { fromTime: null, toTime: "" },
    scale,
  );
  const width = Math.max(1, size.width),
    height = Math.max(1, size.height);
  const x = (fraction: number) =>
    M.left + fraction * Math.max(1, width - M.left - M.right);
  const y = (fraction: number) =>
    M.top + fraction * Math.max(1, height - M.top - M.bottom);
  const selected = plot.points.find(({ row }) => row.id === selectedId);
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumSignificantDigits: 3,
  });
  const date = (timestamp: number) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(timestamp);
  const time = (timestamp: number) =>
    new Date(timestamp).toISOString().slice(11, 19);
  const label = c(
    `Swap value over time in ${unit}. Exact amounts are in the table below.`,
    `${unit} 兑换金额随时间变化。精确金额见下方表格。`,
  );
  const pointLabel = (index: number, value: string, blockTime: string | null) =>
    c(
      `Select swap ${index + 1}: ${value} ${unit}, ${formatTimestamp(blockTime) || "time unknown"}`,
      `选择兑换 ${index + 1}：${value} ${unit}，${formatTimestamp(blockTime) || "时间未知"}`,
    );

  return (
    <>
      <div className="trades-ws-chart-box" ref={ref}>
        <svg
          width={width}
          height={height}
          role="group"
          aria-label={label}
          aria-describedby="trades-chart-help"
        >
          {plot.ticks.map((tick) => (
            <g key={tick} className="trades-ws-tick">
              <line
                x1={M.left}
                x2={x(1)}
                y1={y(plot.y(tick))}
                y2={y(plot.y(tick))}
              />
              <text
                x={M.left - 10}
                y={y(plot.y(tick))}
                dy=".35em"
                textAnchor="end"
              >
                {compact.format(tick)}
              </text>
            </g>
          ))}
          {(Number.isFinite(plot.from) && Number.isFinite(plot.to)
            ? plot.to === plot.from
              ? [0.5]
              : width < 460
                ? [0, 1]
                : [0, 0.25, 0.5, 0.75, 1]
            : []
          ).map((fraction) => {
            const timestamp = plot.from + fraction * (plot.to - plot.from);
            return (
              <g key={fraction} className="trades-ws-tick">
                <line x1={x(fraction)} x2={x(fraction)} y1={M.top} y2={y(1)} />
                <text
                  x={x(fraction)}
                  y={height - M.bottom + 20}
                  textAnchor={
                    fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
                  }
                >
                  <tspan x={x(fraction)}>{date(timestamp)}</tspan>
                  <tspan x={x(fraction)} dy="16">
                    {time(timestamp)}
                  </tspan>
                </text>
              </g>
            );
          })}
          <path
            className="trades-ws-axis"
            d={`M ${M.left} ${M.top} V ${y(1)} H ${x(1)}`}
          />
          <text
            className="trades-ws-axis-title"
            transform={`translate(15 ${y(0.5)}) rotate(-90)`}
            textAnchor="middle"
          >
            {c(`Swap value (${unit})`, `兑换金额（${unit}）`)}
          </text>
          <text
            className="trades-ws-axis-title"
            x={x(0.5)}
            y={height - 3}
            textAnchor="middle"
          >
            {c("Time (UTC)", "时间（UTC）")}
          </text>
          {selected && (
            <g className="trades-ws-crosshair" aria-hidden="true">
              <line
                x1={M.left}
                x2={x(1)}
                y1={y(selected.y)}
                y2={y(selected.y)}
              />
              <line
                x1={x(selected.x)}
                x2={x(selected.x)}
                y1={M.top}
                y2={y(1)}
              />
              <circle cx={x(selected.x)} cy={y(selected.y)} r="11" />
            </g>
          )}
          {plot.points.map(({ row, x: px, y: py }, index) => (
            <g
              key={row.id}
              ref={(element) => {
                if (element) dots.current.set(row.id, element);
                else dots.current.delete(row.id);
              }}
              role="button"
              tabIndex={
                selectedId === row.id || (!selected && index === 0) ? 0 : -1
              }
              aria-pressed={selectedId === row.id}
              aria-label={pointLabel(
                data!.observations.indexOf(row),
                row.notionalQuote,
                row.blockTime,
              )}
              className="trades-ws-point"
              data-selected={row.id === selectedId || undefined}
              onClick={() => onSelect(row.id)}
              onFocus={() => onSelect(row.id)}
              onKeyDown={(event) => {
                if (
                  [
                    "ArrowRight",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowUp",
                    "Home",
                    "End",
                  ].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? plot.points.length - 1
                        : (index +
                            (["ArrowRight", "ArrowDown"].includes(event.key)
                              ? 1
                              : -1) +
                            plot.points.length) %
                          plot.points.length;
                  dots.current.get(plot.points[next].row.id)?.focus();
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row.id);
                }
              }}
            >
              <title>
                {pointLabel(
                  data!.observations.indexOf(row),
                  row.notionalQuote,
                  row.blockTime,
                )}
              </title>
              <circle
                className="trades-ws-point-hit"
                cx={x(px)}
                cy={y(py)}
                r="13"
              />
              <circle className="trades-ws-dot" cx={x(px)} cy={y(py)} r="4" />
            </g>
          ))}
          {!plot.ticks.length && (
            <text
              className="trades-ws-axis-title"
              x={M.left - 10}
              y={M.top + 3}
              textAnchor="end"
            >
              —
            </text>
          )}
          {selected &&
            width > 460 &&
            (() => {
              const amounts = swapAmounts(selected.row);
              const left = Math.max(
                M.left + 8,
                Math.min(x(selected.x) + 24, x(1) - 188),
              );
              const top = Math.max(M.top + 6, y(selected.y) - 84);
              return (
                <g
                  className="trades-ws-callout"
                  aria-hidden="true"
                  pointerEvents="none"
                >
                  <path
                    d={`M ${x(selected.x) + 8} ${y(selected.y) - 8} L ${left} ${top + 50}`}
                  />
                  <rect x={left} y={top} width="180" height="68" rx="4" />
                  <text x={left + 10} y={top + 18}>
                    {date(selected.time)} · {time(selected.time)}
                  </text>
                  <text x={left + 10} y={top + 37}>
                    {compact.format(selected.value)} {unit}
                  </text>
                  <text x={left + 10} y={top + 55}>
                    {amounts.input.token.symbol || "?"} →{" "}
                    {amounts.output.token.symbol || "?"}
                  </text>
                </g>
              );
            })()}
        </svg>
        {plot.points.length === 0 && (
          <div className="trades-ws-empty">
            {emptyState ?? (
              <p>
                {c(
                  "This capture lacks usable timestamps or positive quote values. Observe another window; exact observations remain in the table.",
                  "此捕获缺少可用时间戳或正报价金额。请观察其他窗口；精确观察值仍保留在表格中。",
                )}
              </p>
            )}
          </div>
        )}
      </div>
      <p id="trades-chart-help" className="trades-ws-note">
        {c(
          "Select a point or table row · arrow keys move between events in table order.",
          "选择图点或表格行 · 在图中使用方向键按表格顺序切换事件。",
        )}
      </p>
      {plot.omitted > 0 && (
        <p className="trades-ws-note">
          {c(
            `${plot.omitted} observations have an unavailable time or plottable value; retained in the table.`,
            `${plot.omitted} 条观察的时间或可绘制金额不可用；仍保留在表格中。`,
          )}
        </p>
      )}
    </>
  );
}
