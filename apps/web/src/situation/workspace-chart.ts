/** Display geometry only. Prices, returns and candle eligibility come from the existing engines. */
export type MarketPoint = {
  time: number;
  value: number | null;
  volume?: number;
};
export type MarketSeries = { id: string; label: string; points: MarketPoint[] };

export function segments(
  points: MarketPoint[],
  interval: number,
): MarketPoint[][] {
  const result: MarketPoint[][] = [];
  let current: MarketPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.value)) {
      current = [];
      continue;
    }
    if (!current.length || point.time - current.at(-1)!.time > interval) {
      current = [];
      result.push(current);
    }
    current.push(point);
  }
  return result;
}

export function valueDomain(
  series: MarketSeries[],
  symmetric = false,
): [number, number] {
  const values = series.flatMap((line) =>
    line.points.flatMap((p) =>
      p.value !== null && Number.isFinite(p.value) ? [p.value] : [],
    ),
  );
  if (!values.length) return symmetric ? [-0.05, 0.05] : [0, 1];
  if (symmetric) {
    const limit = Math.max(0.05, ...values.map(Math.abs)) * 1.2;
    return [-limit, limit];
  }
  const min = Math.min(...values),
    max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 1);
  return [min - padding, max + padding];
}

export function observationTimes(series: MarketSeries[]): number[] {
  return [
    ...new Set(series.flatMap((line) => line.points.map((p) => p.time))),
  ].sort((a, b) => a - b);
}

export function nearestObservation(times: number[], target: number): number {
  if (!times.length) return -1;
  return times.reduce(
    (nearest, time, i) =>
      Math.abs(time - target) < Math.abs(times[nearest] - target) ? i : nearest,
    0,
  );
}

/** Rounded display ticks; never rounds the observations themselves. */
export function axisScale(series: MarketSeries[], symmetric = false) {
  const [low, high] = valueDomain(series, symmetric);
  const rawStep = (high - low) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rawStep) ?? 10) *
    magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks = Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, i) => Number((min + i * step).toPrecision(12)),
  );
  return { min, max, ticks };
}

/** Each disjoint run gets its own fill, so missing observations stay missing. */
export function areaPath(
  points: MarketPoint[],
  x: (n: number) => number,
  y: (n: number) => number,
  baseline: number,
) {
  if (points.length < 2) return "";
  return `M${x(points[0].time)},${baseline} ${points
    .map((p) => `L${x(p.time)},${y(p.value!)}`)
    .join(" ")} L${x(points.at(-1)!.time)},${baseline} Z`;
}

export function captureSummary(points: MarketPoint[]) {
  const valid = points.filter(
    (p) => p.value !== null && Number.isFinite(p.value),
  );
  const volumes = points.flatMap((p) =>
    p.volume !== undefined && Number.isFinite(p.volume) && p.volume >= 0
      ? [p.volume]
      : [],
  );
  const first = valid[0]?.value ?? null;
  const last = valid.at(-1)?.value ?? null;
  return {
    first,
    last,
    change:
      first !== null && first > 0 && last !== null
        ? (last / first - 1) * 100
        : null,
    averageVolume: volumes.length
      ? volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length
      : null,
    volumeCount: volumes.length,
  };
}

/** Compact two-line SVG callouts, including mixed Chinese/Latin report titles. */
export function calloutLines(text: string, width: number): string[] {
  const lines = [""];
  const measure = (text: string) =>
    Array.from(text).reduce(
      (sum, char) => sum + (char.charCodeAt(0) > 255 ? 11 : 5.8),
      0,
    );
  const tokens = (text.match(/[a-zA-Z0-9’'&/-]+|\s+|[^\s]/gu) ?? []).flatMap(
    (word) => (measure(word) > width ? Array.from(word) : [word]),
  );
  let used = 0;
  for (const token of tokens) {
    const advance = measure(token);
    if (used + advance > width) {
      if (lines.length === 2) {
        while (measure(lines[1] + "…") > width)
          lines[1] = lines[1].slice(0, -1);
        lines[1] = lines[1].trimEnd() + "…";
        break;
      }
      lines.push("");
      used = 0;
    }
    if (!used && !token.trim()) continue;
    lines[lines.length - 1] += token;
    used += advance;
  }
  return lines.map((line) => line.trim());
}
