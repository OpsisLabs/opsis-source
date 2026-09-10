import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { BenchmarkService, benchmarkUrl, parseBenchmark } from "../src/market/benchmarks.js";
import { loadEnv } from "../src/config/env.js";
import { marketRoutes } from "../src/routes/market.js";
import { installErrorHandler } from "../src/http/errors.js";
const input = { provider: "tcgdex", cardId: "base1-4" } as const;
const now = new Date("2026-09-09T12:00:00Z");
const raw = { id: "base1-4", name: "Charizard", pricing: { cardmarket: { unit: "EUR", updated: "2026-09-08T12:00:00Z", trend: 42, low: null }, tcgplayer: { unit: "USD", updated: "2099-01-01", holofoil: { marketPrice: 51, lowPrice: -1, highPrice: "NaN" } } } };
describe("free benchmarks", () => {
  it("preserves marketplace, currency, variant and source time without inventing missing values", () => {
    const result = parseBenchmark(input, raw, now);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ currency: "EUR", amount: 42, updatedAt: "2026-09-08T12:00:00.000Z" });
    expect(result.rows[1]).toMatchObject({ variant: "holofoil", amount: 51, updatedAt: null });
  });
  it("missing pricing is empty, not zero, and mismatched identity fails", () => {
    expect(parseBenchmark(input, { id: input.cardId, name: "Charizard" }, now).rows).toEqual([]);
    expect(() => parseBenchmark(input, { ...raw, id: "wrong" }, now)).toThrow();
  });
  it("rejects URLs, batch requests and invalid provider identifiers", () => {
    for (const cardId of ["../private", "https://evil.test", "1,2", ""]) expect(() => benchmarkUrl({ provider: "ygoprodeck", cardId })).toThrow();
    expect(() => benchmarkUrl({ provider: "tcgdex", cardId: "../private" })).toThrow();
  });
  it("Yu-Gi-Oh lows are explicitly across versions, with unknown market timestamp", () => {
    const result = parseBenchmark({ provider: "ygoprodeck", cardId: "46986414" }, { data: [{ id: 46986414, name: "Dark Magician", card_prices: [{ ebay_price: "0.99", cardmarket_price: "0", amazon_price: null }] }] }, now);
    expect(result.rows).toEqual([{ market: "eBay", variant: "lowest across versions—not an exact printing", metric: "reference low", amount: 0.99, currency: "USD", updatedAt: null }]);
  });
  it("caches only public results, bounds requests and does not follow redirects", async () => {
    const requestJson = vi.fn().mockResolvedValue(raw), consume = vi.fn();
    const service = new BenchmarkService(loadEnv({ NODE_ENV: "test" }), { http: { requestJson }, budget: { consume } });
    await service.lookup(input); await service.lookup(input);
    expect(requestJson).toHaveBeenCalledTimes(1); expect(consume).toHaveBeenCalledTimes(1);
    expect(requestJson).toHaveBeenCalledWith(benchmarkUrl(input), { redirect: "error", headers: { Accept: "application/json" } });
  });
  it("budget failure prevents provider contact and provider errors are sanitized", async () => {
    const requestJson = vi.fn().mockRejectedValue(new Error("sensitive upstream debug"));
    const service = new BenchmarkService(loadEnv({ NODE_ENV: "test" }), { http: { requestJson }, budget: { consume: vi.fn().mockRejectedValue(new Error("budget")) } });
    await expect(service.lookup(input)).rejects.toThrow("budget"); expect(requestJson).not.toHaveBeenCalled();
    const failed = new BenchmarkService(loadEnv({ NODE_ENV: "test" }), { http: { requestJson }, budget: { consume: vi.fn() } });
    await expect(failed.lookup(input)).rejects.toThrow("Reference prices are unavailable");
  });
  it("endpoint fails closed when disabled and rejects ownership fields before lookup", async () => {
    for (const enabled of [false, true]) {
      const app = Fastify(); installErrorHandler(app);
      const lookup = vi.fn().mockResolvedValue(parseBenchmark(input, raw, now));
      try {
        await marketRoutes(app, loadEnv({ NODE_ENV: "test", COLLECTIBLE_DEAL_FINDER_ENABLED: String(enabled) }), undefined, { lookup });
        const bad = await app.inject({ method: "POST", url: "/v1/private/deals/benchmark", payload: { ...input, notes: "private" } });
        expect(bad.statusCode).toBe(enabled ? 400 : 503); expect(lookup).not.toHaveBeenCalled();
        const response = await app.inject({ method: "POST", url: "/v1/private/deals/benchmark", payload: input });
        expect(response.statusCode).toBe(enabled ? 200 : 503);
        expect(response.headers["cache-control"]).toBe("private, no-store");
      } finally { await app.close(); }
    }
  });
});
