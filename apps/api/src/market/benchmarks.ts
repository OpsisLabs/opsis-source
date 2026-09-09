import type { BenchmarkInput, CardBenchmark } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { createProviderHttp, type ProviderHttp } from "../chain/provider-http.js";
import { createCollectibleBudget, type CollectibleBudget } from "../collectibles/budget.js";

const bad = () => new AppError("BENCHMARK_UNAVAILABLE", 502, "Reference prices are unavailable or could not be verified. Nothing was valued.");
const record = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
export function benchmarkUrl(input: BenchmarkInput): string {
  if (input.provider === "tcgdex" && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(input.cardId))
    return `https://api.tcgdex.net/v2/en/cards/${input.cardId}`;
  if (input.provider === "ygoprodeck" && /^\d{1,8}$/.test(input.cardId))
    return `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${input.cardId}`;
  throw new AppError("BENCHMARK_INVALID_ID", 400, "Use one public catalog card ID, not a URL or private identifier.");
}
export function parseBenchmark(input: BenchmarkInput, raw: unknown, now: Date): CardBenchmark {
  const sourceUrl = benchmarkUrl(input);
  const root = record(raw);
  const card = input.provider === "tcgdex" ? root : Array.isArray(root.data) && root.data.length === 1 ? record(root.data[0]) : {};
  if (String(card.id) !== input.cardId || typeof card.name !== "string" || !card.name || card.name.length > 200) throw bad();
  const rows: CardBenchmark["rows"] = [];
  function add(market: string, variant: string, metric: string, rawAmount: unknown, currency: "USD" | "EUR", stamp: unknown) {
    const amount = typeof rawAmount === "number" ? rawAmount : typeof rawAmount === "string" && /^\d+(\.\d+)?$/.test(rawAmount) ? Number(rawAmount) : NaN;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return;
    const time = typeof stamp === "string" ? Date.parse(stamp) : NaN;
    const updatedAt = Number.isFinite(time) && time <= now.getTime() + 300_000 ? new Date(time).toISOString() : null;
    rows.push({ market, variant, metric, amount, currency, updatedAt });
  }
  if (input.provider === "tcgdex") {
    const pricing = record(card.pricing), cm = record(pricing.cardmarket), tcg = record(pricing.tcgplayer);
    if (cm.unit === "EUR") for (const metric of ["avg", "low", "trend", "avg1", "avg7", "avg30", "avg-holo", "low-holo", "trend-holo", "avg1-holo", "avg7-holo", "avg30-holo"]) {
      add("Cardmarket", metric.includes("holo") ? "holo (provider mapping)" : "unspecified printing", metric, cm[metric], "EUR", cm.updated);
    }
    if (tcg.unit === "USD") for (const [variant, values] of Object.entries(tcg).slice(0, 32)) {
      if (!/^[a-zA-Z][a-zA-Z0-9 _-]{0,39}$/.test(variant)) continue;
      for (const metric of ["lowPrice", "midPrice", "highPrice", "marketPrice", "directLowPrice"]) add("TCGplayer", variant, metric, record(values)[metric], "USD", tcg.updated);
    }
  } else {
    const prices = Array.isArray(card.card_prices) ? record(card.card_prices[0]) : {};
    for (const [key, market, currency] of [
      ["cardmarket_price", "Cardmarket", "EUR"], ["tcgplayer_price", "TCGplayer", "USD"],
      ["ebay_price", "eBay", "USD"], ["amazon_price", "Amazon", "USD"], ["coolstuffinc_price", "CoolStuffInc", "USD"]
    ] as const) add(market, "lowest across versions—not an exact printing", "reference low", prices[key], currency, null);
  }
  return { provider: input.provider, cardId: input.cardId, name: card.name, fetchedAt: now.toISOString(), sourceUrl, rows: rows.slice(0, 100) };
}

export class BenchmarkService {
  private readonly http: ProviderHttp;
  private readonly budget: CollectibleBudget;
  private readonly cache = new Map<string, { expires: number; result: CardBenchmark }>();
  constructor(env: Env, deps: { http?: ProviderHttp; budget?: CollectibleBudget } = {}) {
    this.http = deps.http ?? createProviderHttp({ ...env, PROVIDER_MAX_RETRIES: 0, PROVIDER_REQUEST_BUDGET_PER_MINUTE: 12 }, "collectible-benchmarks", 512 * 1024);
    this.budget = deps.budget ?? createCollectibleBudget(env);
  }
  async lookup(input: BenchmarkInput): Promise<CardBenchmark> {
    const url = benchmarkUrl(input), now = Date.now();
    const cached = this.cache.get(url);
    if (cached && cached.expires > now) return cached.result;
    await this.budget.consume(1);
    let raw: unknown;
    try { raw = await this.http.requestJson(url, { redirect: "error", headers: { Accept: "application/json" } }); }
    catch { throw bad(); }
    const result = parseBenchmark(input, raw, new Date());
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(url, { result, expires: now + (input.provider === "ygoprodeck" ? 172800_000 : 3600_000) });
    return result;
  }
}
