import { useEffect, useRef, useState } from "react";
import { chartMax, niceScale, waterfall, type ChartRow } from "./chart";

const MARGIN = { top: 28, right: 12, bottom: 58, left: 64 };

/** The chart fills its box; the box's size comes from layout, never from the chart. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 640, height: 360 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(260, Math.round(entry.contentRect.width)),
        height: Math.max(240, Math.round(entry.contentRect.height)),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text);

/** Before/after portfolio value as a waterfall or paired bars. Exact values live in the table beside it. */
export function StressChart({
  mode,
  rows,
  before,
  after,
  labels,
  money,
  axisMoney,
  signedPercent,
  description,
}: {
  mode: "waterfall" | "paired";
  rows: ChartRow[];
  before: bigint;
  after: bigint;
  labels: { before: string; after: string; beforeLegend: string; afterLegend: string };
  money: (cents: bigint) => string;
  axisMoney: (cents: number) => string;
  signedPercent: (percent: number) => string;
  description: string;
}) {
  const [ref, { width, height: HEIGHT }] = useSize<HTMLDivElement>();
  const bars = waterfall(rows, before, after, labels);
  const { max, step } = niceScale(Number(chartMax(rows, bars)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const y = (cents: number) => MARGIN.top + plotHeight - (cents / max) * plotHeight;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const slots = mode === "waterfall" ? bars.length : rows.length;
  const slot = plotWidth / Math.max(1, slots);
  const barWidth = Math.min(64, slot * (mode === "waterfall" ? 0.62 : 0.36));
  const labelChars = Math.max(4, Math.floor(slot / 6.4));
  const x = (index: number) => MARGIN.left + slot * index + slot / 2;
  // Narrow slots get compact value labels; exact amounts stay in the title and the table.
  const compact = slot < 92;
  const shown = (value: bigint) => (compact ? axisMoney(Number(value)) : money(value));
  const signedMoney = (value: bigint) => (value > 0n ? `+${shown(value)}` : shown(value));

  return (
    <div className="stress-chart">
      <div className="stress-chart-box" ref={ref}>
      <svg width={width} height={HEIGHT} role="img" aria-label={description}>
        {ticks.map((tick) => (
          <g key={tick} className="stress-chart-tick">
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
            <text x={MARGIN.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">
              {axisMoney(tick)}
            </text>
          </g>
        ))}
        {mode === "waterfall"
          ? bars.map((bar, index) => {
              const top = y(Number(bar.high));
              const bottom = y(Number(bar.low));
              const next = bars[index + 1];
              const level = bar.kind === "down" ? bar.low : bar.high;
              return (
                <g key={bar.id} className={`stress-chart-bar stress-chart-${bar.kind}`}>
                  <title>{`${bar.label}: ${bar.kind === "total" ? money(bar.value) : `${bar.value > 0n ? "+" : ""}${money(bar.value)}`}`}</title>
                  {bar.kind === "flat" ? (
                    <line x1={x(index) - barWidth / 2} x2={x(index) + barWidth / 2} y1={top} y2={top} />
                  ) : (
                    <rect x={x(index) - barWidth / 2} y={top} width={barWidth} height={Math.max(1, bottom - top)} rx={2} />
                  )}
                  {next && (
                    <line
                      className="stress-chart-step"
                      x1={x(index) + barWidth / 2}
                      x2={x(index + 1) - barWidth / 2}
                      y1={y(Number(level))}
                      y2={y(Number(level))}
                    />
                  )}
                  <text
                    className="stress-chart-value"
                    x={x(index)}
                    y={bar.kind === "down" ? bottom + 14 : top - 7}
                    textAnchor="middle"
                  >
                    {bar.kind === "total" ? shown(bar.value) : bar.kind === "flat" ? "0" : signedMoney(bar.value)}
                  </text>
                  <text className="stress-chart-label" x={x(index)} y={HEIGHT - MARGIN.bottom + 20} textAnchor="middle">
                    {clip(bar.label, labelChars)}
                  </text>
                  {bar.percent !== null && (
                    <text className="stress-chart-sub" x={x(index)} y={HEIGHT - MARGIN.bottom + 36} textAnchor="middle">
                      {signedPercent(bar.percent)}
                    </text>
                  )}
                </g>
              );
            })
          : rows.map((row, index) => (
              <g key={row.id} className="stress-chart-pair">
                <title>{`${row.label}: ${money(row.before)} → ${money(row.after)}`}</title>
                <rect
                  className="stress-chart-before"
                  x={x(index) - barWidth - 2}
                  y={y(Number(row.before))}
                  width={barWidth}
                  height={Math.max(1, y(0) - y(Number(row.before)))}
                  rx={2}
                />
                <rect
                  className={`stress-chart-after stress-chart-${row.delta < 0n ? "down" : row.delta > 0n ? "up" : "flat"}`}
                  x={x(index) + 2}
                  y={y(Number(row.after))}
                  width={barWidth}
                  height={Math.max(1, y(0) - y(Number(row.after)))}
                  rx={2}
                />
                <text className="stress-chart-value" x={x(index) + 2 + barWidth / 2} y={y(Number(row.after)) - 7} textAnchor="middle">
                  {row.delta === 0n ? "0" : signedMoney(row.delta)}
                </text>
                <text className="stress-chart-label" x={x(index)} y={HEIGHT - MARGIN.bottom + 20} textAnchor="middle">
                  {clip(row.label, labelChars)}
                </text>
                {row.percent !== null && (
                  <text className="stress-chart-sub" x={x(index)} y={HEIGHT - MARGIN.bottom + 36} textAnchor="middle">
                    {signedPercent(row.percent)}
                  </text>
                )}
              </g>
            ))}
        <line className="stress-chart-axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} />
      </svg>
      </div>
      {mode === "paired" && (
        <p className="stress-chart-legend">
          <span><i className="stress-chart-before" aria-hidden="true" />{labels.beforeLegend}</span>
          <span><i className="stress-chart-after" aria-hidden="true" />{labels.afterLegend}</span>
        </p>
      )}
    </div>
  );
}
