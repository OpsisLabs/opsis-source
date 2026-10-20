// Geometry for the before/after chart. Amounts stay in cents; the chart only positions them.

export type ChartRow = {
  id: string;
  label: string;
  before: bigint;
  after: bigint;
  delta: bigint;
  percent: number | null;
};

export type WaterfallBar = {
  id: string;
  label: string;
  percent: number | null;
  kind: "total" | "down" | "up" | "flat";
  low: bigint;
  high: bigint;
  value: bigint;
};

/** Starting total, one step per position (its change from the running total), then the result. */
export function waterfall(
  rows: ChartRow[],
  before: bigint,
  after: bigint,
  labels: { before: string; after: string },
): WaterfallBar[] {
  const bars: WaterfallBar[] = [
    { id: "before", label: labels.before, percent: null, kind: "total", low: 0n, high: before, value: before },
  ];
  let running = before;
  for (const row of rows) {
    const next = running + row.delta;
    bars.push({
      id: row.id,
      label: row.label,
      percent: row.percent,
      kind: row.delta < 0n ? "down" : row.delta > 0n ? "up" : "flat",
      low: next < running ? next : running,
      high: next < running ? running : next,
      value: row.delta,
    });
    running = next;
  }
  if (running !== after) throw new Error("waterfall");
  bars.push({ id: "after", label: labels.after, percent: null, kind: "total", low: 0n, high: after, value: after });
  return bars;
}

/** A rounded axis maximum and step (1, 2, 2.5 or 5 × 10ⁿ) with about `ticks` intervals. */
export function niceScale(max: number, ticks = 5): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 1 };
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw)!;
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}

/** The largest value any bar reaches, in cents. */
export function chartMax(rows: ChartRow[], bars: WaterfallBar[]): bigint {
  let max = 0n;
  for (const bar of bars) if (bar.high > max) max = bar.high;
  for (const row of rows) {
    if (row.before > max) max = row.before;
    if (row.after > max) max = row.after;
  }
  return max;
}
