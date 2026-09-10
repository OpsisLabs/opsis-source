import type { BenchmarkInput, CardBenchmark } from "@rh-chain/shared";

export const CARD_EXAMPLES = [
  { provider: "tcgdex", cardId: "base1-4", name: "Charizard", detail: "Pokémon · Base Set #4", mark: "04", tone: "#fa6c34" },
  { provider: "tcgdex", cardId: "base1-58", name: "Pikachu", detail: "Pokémon · Base Set #58", mark: "58", tone: "#d5b85d" },
  { provider: "ygoprodeck", cardId: "46986414", name: "Dark Magician", detail: "Yu-Gi-Oh! · Across versions", mark: "DM", tone: "#b8a2cf" },
  { provider: "ygoprodeck", cardId: "89631139", name: "Blue-Eyes White Dragon", detail: "Yu-Gi-Oh! · Across versions", mark: "BE", tone: "#89b8c9" },
] as const;

export function validCardInput(input: BenchmarkInput) {
  return input.provider === "tcgdex" ? /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(input.cardId)
    : input.provider === "ygoprodeck" && /^\d{1,8}$/.test(input.cardId);
}
const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
const stamp = (value: unknown, now: number) => typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 300_000;

export function checkedPrices(input: BenchmarkInput, value: unknown, now = Date.now()): CardBenchmark {
  const data = value as CardBenchmark | null;
  const expectedUrl = input.provider === "tcgdex" ? `https://api.tcgdex.net/v2/en/cards/${input.cardId}` : `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${input.cardId}`;
  if (!validCardInput(input) || !data || data.provider !== input.provider || data.cardId !== input.cardId || data.sourceUrl !== expectedUrl ||
    !text(data.name, 200) || !stamp(data.fetchedAt, now) || !Array.isArray(data.rows) || data.rows.length > 100 ||
    data.rows.some(row => !row || !text(row.market, 80) || !text(row.variant, 100) || !text(row.metric, 80) ||
      !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 1e9 || !["USD", "EUR"].includes(row.currency) ||
      !(row.updatedAt === null || stamp(row.updatedAt, now)))) throw new Error("These price references could not be verified. Please try another card.");
  return data;
}
const metricNames: Record<string, string> = {
  marketPrice: "Market reference", midPrice: "Mid-price reference", lowPrice: "Low-price reference", highPrice: "High-price reference", directLowPrice: "Direct low reference",
  avg: "Average reference", low: "Low reference", trend: "Price trend reference", avg1: "1-day average", avg7: "7-day average", avg30: "30-day average",
  "avg-holo": "Holo average", "low-holo": "Holo low", "trend-holo": "Holo trend", "avg1-holo": "Holo 1-day average", "avg7-holo": "Holo 7-day average", "avg30-holo": "Holo 30-day average",
};
export const metricName = (metric: string) => metricNames[metric] ?? metric;
export const priceText = (amount: number, currency: "USD" | "EUR") => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

// Select a representative metric, not a cheapest offer across unlike sources.
export function headlineReferences(data: CardBenchmark, currency: "USD" | "EUR") {
  const priority = ["marketPrice", "trend", "trend-holo", "avg", "avg-holo", "midPrice", "reference low", "lowPrice", "low", "low-holo"];
  const score = (metric: string) => { const index = priority.indexOf(metric); return index < 0 ? 100 : index; };
  const groups = new Map<string, CardBenchmark["rows"][number]>();
  for (const row of data.rows.filter(row => row.currency === currency)) {
    const key = `${row.market}\0${row.variant}`;
    const prior = groups.get(key);
    if (!prior || score(row.metric) < score(prior.metric)) groups.set(key, row);
  }
  return [...groups.values()];
}
