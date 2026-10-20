import type { ObservedTradeObservation, ObservedTradesResponse } from "./api";

export type ScatterScale = "log" | "linear";

/** Signed Swap amounts determine direction. Keep the original decimal strings. */
export function swapAmounts(row: ObservedTradeObservation) {
  const base = { amount: row.baseAmount, token: row.baseToken };
  const quote = { amount: row.quoteAmount, token: row.quoteToken };
  return row.side === "sell"
    ? { input: base, output: quote }
    : { input: quote, output: base };
}

/** Geometry only: exact amounts stay in the linked table and inspector.
 * Unusable time/value observations are retained in the table, never plotted at zero.
 */
export function scatter(
  rows: ObservedTradeObservation[],
  window: Pick<ObservedTradesResponse["window"], "fromTime" | "toTime">,
  scale: ScatterScale,
) {
  const valid = rows.flatMap((row) => {
    const time = row.blockTime ? Date.parse(row.blockTime) : NaN;
    const value = /^\d+(?:\.\d+)?$/.test(row.notionalQuote)
      ? Number(row.notionalQuote)
      : NaN;
    return Number.isFinite(time) && Number.isFinite(value) && value > 0
      ? [{ row, time, value }]
      : [];
  });
  const start = window.fromTime ? Date.parse(window.fromTime) : NaN;
  const end = Date.parse(window.toTime);
  if (!valid.length)
    return {
      points: [],
      omitted: rows.length,
      from: start,
      to: end,
      ticks: [] as number[],
      y: () => 0,
    };

  const times = valid.map((point) => point.time);
  const from = Math.min(...times, ...(Number.isFinite(start) ? [start] : []));
  const to = Math.max(...times, ...(Number.isFinite(end) ? [end] : []));
  const maxValue = Math.max(...valid.map((point) => point.value));
  const minValue = Math.min(...valid.map((point) => point.value));
  const low = scale === "log" ? Math.floor(Math.log10(minValue)) : 0;
  const high =
    scale === "log"
      ? Math.max(low + 1, Math.ceil(Math.log10(maxValue)))
      : maxValue;
  const y = (value: number) =>
    1 - ((scale === "log" ? Math.log10(value) : value) - low) / (high - low);
  const steps = scale === "log" ? Math.min(4, high - low) : 4;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => {
    const value = low + ((high - low) * i) / steps;
    return scale === "log" ? 10 ** value : value;
  });
  return {
    points: valid.map(({ row, time, value }) => ({
      row,
      time,
      value,
      x: to === from ? 0.5 : (time - from) / (to - from),
      y: y(value),
    })),
    omitted: rows.length - valid.length,
    from,
    to,
    ticks,
    y,
  };
}
