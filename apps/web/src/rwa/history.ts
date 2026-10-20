import type { StockGapSeries } from "../opsis/stock-gap-series";

export function historyMatches(
  series: StockGapSeries,
  identity: { chainId: number; address: string } | null,
): boolean {
  return (
    identity === null ||
    (series.instrument.chainId === identity.chainId &&
      series.instrument.address.toLowerCase() ===
        identity.address.toLowerCase())
  );
}

/** Display-only inference: a long interval is not evidence of actual source coverage. */
export function historySegments(series: StockGapSeries) {
  const points = series.observations
    .map((observation, index) => ({
      observation,
      index,
      timestampMs: Date.parse(observation.timestamp),
    }))
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const intervals = points
    .slice(1)
    .map((point, index) => point.timestampMs - points[index].timestampMs)
    .filter((interval) => interval > 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const cadenceMs =
    intervals.length === 0
      ? null
      : intervals.length % 2
        ? intervals[middle]
        : (intervals[middle - 1] + intervals[middle]) / 2;
  const breakAfterMs = cadenceMs === null ? null : cadenceMs * 3;
  const segments: (typeof points)[] = [];
  for (const point of points) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (
      !current ||
      (previous &&
        breakAfterMs !== null &&
        point.timestampMs - previous.timestampMs > breakAfterMs)
    ) {
      segments.push([point]);
    } else current.push(point);
  }
  return { segments, cadenceMs, breakAfterMs };
}

/** Geometry only: exact decimal percentages remain the stock-gap engine's strings. */
export function gapExtent(series: StockGapSeries) {
  const sorted = [...series.observations].sort(
    (a, b) => a.chartGapPercent - b.chartGapPercent,
  );
  const low = Math.min(0, sorted[0]?.chartGapPercent ?? 0);
  const high = Math.max(0, sorted.at(-1)?.chartGapPercent ?? 0);
  const padding = Math.max(0.0001, (high - low) * 0.12);
  const rawMin = low === high ? -1 : low - padding;
  const rawMax = low === high ? 1 : high + padding;
  const roughStep = (rawMax - rawMin) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const step =
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) *
    magnitude;
  const firstTick = Math.floor(rawMin / step);
  const lastTick = Math.ceil(rawMax / step);
  const ticks = Array.from({ length: lastTick - firstTick + 1 }, (_, index) =>
    Number(((firstTick + index) * step).toPrecision(12)),
  );
  return {
    min: ticks[0],
    max: ticks[ticks.length - 1],
    ticks,
    low: sorted[0]?.gapPercent ?? null,
    high: sorted.at(-1)?.gapPercent ?? null,
  };
}

/** Median of exact engine strings; even samples may require one extra decimal place. */
export function gapMedian(series: StockGapSeries): string | null {
  if (!series.observations.length) return null;
  const precision = Math.max(
    ...series.observations.map(
      (row) => row.gapPercent.split(".")[1]?.length ?? 0,
    ),
  );
  const values = series.observations
    .map((row) => {
      const negative = row.gapPercent.startsWith("-");
      const [whole, fraction = ""] = row.gapPercent
        .replace(/^-/, "")
        .split(".");
      return (
        BigInt(whole + fraction.padEnd(precision, "0")) * (negative ? -1n : 1n)
      );
    })
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(values.length / 2);
  const sum =
    values.length % 2
      ? values[middle] * 2n
      : values[middle - 1] + values[middle];
  const extra = sum % 2n !== 0n;
  const raw = extra ? sum * 5n : sum / 2n;
  const decimals = precision + (extra ? 1 : 0);
  const digits = (raw < 0n ? -raw : raw).toString().padStart(decimals + 1, "0");
  return `${raw < 0n ? "-" : ""}${decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits}`;
}

/** Equal-width, left-closed bins; the final bin includes its upper boundary. */
export function gapHistogram(series: StockGapSeries, count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error("Invalid bin count");
  const values = series.observations.map((row) => row.chartGapPercent);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const start = min === max ? min - 0.5 : min;
  const end = min === max ? max + 0.5 : max;
  const step = (end - start) / count;
  const bins = Array.from({ length: count }, (_, index) => ({
    from: start + index * step,
    to: index === count - 1 ? end : start + (index + 1) * step,
    count: 0,
  }));
  for (const value of values)
    bins[Math.max(0, Math.min(count - 1, Math.floor((value - start) / step)))]
      .count++;
  return bins;
}
