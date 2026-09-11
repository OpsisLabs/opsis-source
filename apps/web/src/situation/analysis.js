export const eventTime = (e) => Date.parse(e.time) / 1000;
export const signed = (v) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
export function eventSeries(market, e, minutes) {
  const t = eventTime(e);
  return market.assets.map((a) => {
    const pts = a.points.filter(
      (p) =>
        p.requestedTime >= t - minutes * 60 &&
        p.requestedTime <= t + minutes * 60 &&
        Number.isInteger((p.requestedTime - t) / 300),
    );
    const baseline = pts.find((p) => p.requestedTime === t && p.price != null);
    const points = pts.map((p) => ({
      ...p,
      relative: (p.requestedTime - t) / 60,
      change:
        baseline && p.price != null
          ? (p.price / baseline.price - 1) * 100
          : null,
    }));
    const first = points.find((p) => p.requestedTime === t - minutes * 60),
      last = points.find((p) => p.requestedTime === t + minutes * 60);
    return {
      ...a,
      points,
      baseline,
      before:
        first?.change == null
          ? null
          : (-first.change / (100 + first.change)) * 100,
      after: last?.change ?? null,
      coverage: points.filter((p) => p.price != null).length,
      expected: (minutes / 5) * 2 + 1,
    };
  });
}
