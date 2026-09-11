import edition from "./performance.json";
import { calls, type Call } from "./model";

export type PricePoint = { timestamp: number; price: number };
export type PriceAsset = {
  symbol: string;
  id: string;
  confidence: number;
  prices: PricePoint[];
  direction?: string;
};
export type Observation = {
  callId: string;
  direction: string;
  status: string;
  reason: string;
  assets: PriceAsset[];
  url: string | null;
  entryAt: number | null;
  endAt: number | null;
  requested: number[];
  sha256: string | null;
};
export const priceEdition = edition;
const records: Observation[] = edition.records;
const asOf = Date.parse(edition.asOf) / 1000;
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
export const maxPriceDeviationSeconds = 600;
export const assetIds: Record<string, string> = {
  BTC: "coingecko:bitcoin",
  ETH: "coingecko:ethereum",
  SOL: "coingecko:solana",
  HYPE: "coingecko:hyperliquid",
  ZEC: "coingecko:zcash",
  PONS: "coingecko:pons",
  NET: "coingecko:netnet",
  STONKBROKER: "coingecko:stonkbroker",
  PUMP: "coingecko:pump-fun",
  XRP: "coingecko:ripple",
  DOGE: "coingecko:dogecoin",
};

export function scoringLegs(call: Call) {
  if (!["long", "short", "mixed"].includes(call.scoringDirection)) return [];
  const legs =
    call.scoringLegs ??
    call.tokens.map((symbol) => ({ symbol, direction: call.scoringDirection }));
  if (
    !legs.length ||
    new Set(legs.map((leg) => leg.symbol)).size !== legs.length ||
    legs.some(
      (leg) =>
        !call.tokens.includes(leg.symbol) ||
        !assetIds[leg.symbol] ||
        !["long", "short"].includes(leg.direction),
    )
  )
    return [];
  return legs;
}

export function assetReturnCurve(asset: PriceAsset) {
  const sign = asset.direction === "short" ? -1 : 1;
  return asset.prices.map(
    (point) => sign * (point.price / asset.prices[0].price - 1) * 100,
  );
}

export function validateObservation(record: Observation, call: Call) {
  const legs = scoringLegs(call);
  if (
    record.status !== "complete" ||
    record.callId !== call.id ||
    !legs.length ||
    record.direction !== call.scoringDirection ||
    !record.assets.length ||
    !record.entryAt ||
    !record.endAt
  )
    return false;
  const expectedEntry =
    (Math.floor(Date.parse(call.publishedAt) / 3_600_000) + 1) * 3600;
  if (
    record.entryAt !== expectedEntry ||
    record.endAt !== expectedEntry + 604800 ||
    record.endAt > asOf
  )
    return false;
  if (new Set(record.assets.map((a) => a.id)).size !== record.assets.length)
    return false;
  if (
    record.assets.length !== legs.length ||
    !legs.every((leg) =>
      record.assets.some(
        (a) =>
          a.symbol === leg.symbol && (a.direction ?? "long") === leg.direction,
      ),
    )
  )
    return false;
  return record.assets.every(
    (asset) =>
      asset.id === assetIds[asset.symbol] &&
      Number.isFinite(asset.confidence) &&
      asset.confidence >= 0.9 &&
      asset.prices.length === 8 &&
      asset.prices.every(
        (p, i, points) =>
          Number.isFinite(p.price) &&
          p.price > 0 &&
          Number.isFinite(p.timestamp) &&
          Math.abs(p.timestamp - (expectedEntry + i * 86400)) <=
            maxPriceDeviationSeconds &&
          p.timestamp >= Date.parse(call.publishedAt) / 1000 &&
          p.timestamp <= asOf &&
          (i === 0 || p.timestamp > points[i - 1].timestamp),
      ),
  );
}

export function observationFor(call: Call): Observation {
  const record = records.find((r) => r.callId === call.id);
  if (!record)
    return {
      callId: call.id,
      status: "unavailable",
      reason: "No price observations captured.",
      direction: "long",
      assets: [],
      url: null,
      entryAt: null,
      endAt: null,
      requested: [],
      sha256: null,
    };
  if (record.status === "complete" && !validateObservation(record, call))
    return {
      ...record,
      status: "unavailable",
      assets: [],
      reason: "Price observations failed validation.",
    };
  return record;
}

export function callPerformance(call: Call) {
  const observation = observationFor(call);
  if (observation.status !== "complete")
    return { observation, percent: null, curve: null, worstDay: null };
  const curve = Array.from({ length: 8 }, (_, day) =>
    mean(observation.assets.map((a) => assetReturnCurve(a)[day])),
  );
  return {
    observation,
    percent: curve[7],
    curve,
    worstDay: Math.min(...curve),
  };
}

export type ScoringFilter =
  "all" | "eligible" | "scored" | "pending" | "unscored" | "unavailable";

export function scoringStatus(call: Call) {
  if (!scoringLegs(call).length) return "excluded";
  const observation = observationFor(call);
  if (observation.status === "complete") return "scored";
  if (observation.status === "pending") return "pending";
  if (observation.status === "excluded") return "excluded";
  return "unavailable";
}

export function matchesScoringFilter(call: Call, filter: ScoringFilter) {
  const status = scoringStatus(call);
  if (filter === "all") return true;
  if (filter === "eligible") return status !== "excluded";
  if (filter === "unscored")
    return status === "excluded" || status === "unavailable";
  return status === filter;
}

export function scoringSummary(items: Call[]) {
  const counts = {
    tracked: items.length,
    eligible: 0,
    scored: 0,
    pending: 0,
    excluded: 0,
    unavailable: 0,
  };
  for (const call of items) {
    const status = scoringStatus(call);
    counts[status]++;
    if (status !== "excluded") counts.eligible++;
  }
  return counts;
}

export function profilePerformance(id: string, items: Call[] = calls) {
  const history = items.filter((c) => c.profile === id);
  const measured = history.map((call) => ({ call, ...callPerformance(call) }));
  const complete = measured.filter((m) => m.percent !== null);
  const percent = complete.length
    ? mean(complete.map((m) => m.percent!))
    : null;
  return {
    history,
    measured,
    complete,
    percent,
    curve: complete.length
      ? Array.from({ length: 8 }, (_, day) =>
          mean(complete.map((m) => m.curve![day])),
        )
      : null,
    positive: complete.filter((m) => m.percent! > 0).length,
    pending: measured.filter((m) => m.observation.status === "pending").length,
    excluded: measured.filter((m) => m.observation.status === "excluded")
      .length,
    unavailable: measured.filter((m) => m.observation.status === "unavailable")
      .length,
    best: [...complete].sort((a, b) => b.percent! - a.percent!)[0],
  };
}

export const formatPercent = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
export const paperPnl = (percent: number, stake: number) =>
  (stake * percent) / 100;
export const formatMoney = (n: number) =>
  `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
