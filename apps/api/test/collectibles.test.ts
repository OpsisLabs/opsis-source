import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { ProviderRequestError } from "../src/chain/provider-http.js";
import type { CollectibleBudget } from "../src/collectibles/budget.js";
import { CollectibleCatalogService } from "../src/collectibles/service.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { collectibleRoutes } from "../src/routes/collectibles.js";
import { buildApp } from "../src/app.js";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const apps: Array<ReturnType<typeof Fastify>> = [];
const testEnv = (enabled = true) => loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", COLLECTIBLE_CATALOG_ENABLED: String(enabled) });

afterEach(async () => { while (apps.length) await apps.pop()?.close(); });

describe("collectible catalog", () => {
  it("searches bounded metadata, exact-filters number and set, and returns a privacy receipt", async () => {
    const http: ProviderHttp = { requestJson: vi.fn(async () => searchGraphql([
      { id: "base1-4", localId: "4", name: "Charizard", image: "SHOULD_NOT_LEAVE_SERVER" },
      { id: "base4-4", localId: "4", name: "Charizard", pricing: { market: 999 } },
      { id: "base1-40", localId: "40", name: "Charizard" }
    ])) };
    const result = await service(http).search({ language: "en", name: " Charizard ", number: "4", setId: "base1" });

    expect(result.results).toEqual([{ catalogId: "base1-4", name: "Charizard", number: "4" }]);
    expect(result.query).toEqual({ language: "en", name: "Charizard", number: "4", setId: "base1" });
    expect(result.privacy).toMatchObject({ serverStorage: "none", modelProvider: "none", providerDestinations: ["TCGdex"] });
    expect(JSON.stringify(result)).not.toMatch(/SHOULD_NOT_LEAVE_SERVER|market/);
    expect(http.requestJson).toHaveBeenCalledWith("https://api.tcgdex.net/v2/graphql", expect.objectContaining({ method: "POST", redirect: "error" }));
    const requestBody = JSON.parse(String((http.requestJson as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(requestBody.variables).toEqual({ name: "Charizard", localId: "4" });
    expect(requestBody.query).not.toMatch(/image|pricing|thirdParty|variants/i);
  });

  it("returns field-selected catalog identity without requesting art, prices, or printing metadata", async () => {
    const http: ProviderHttp = { requestJson: vi.fn(async () => detailGraphql(detailFixture())) };
    const result = await service(http).detail({ language: "en", cardId: "base1-4" });

    expect(result.card).toMatchObject({
      provider: "tcgdex", catalogId: "base1-4", name: "Charizard", number: "4",
      set: { id: "base1", name: "Base Set", officialCount: 102, totalCount: 102 }
    });
    expect(result.card.catalogUpdatedAt).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/assets\.tcgdex|marketPrice|999/);
    expect(result.card).not.toHaveProperty("image");
    expect(result.card).not.toHaveProperty("pricing");
    const requestBody = JSON.parse(String((http.requestJson as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(requestBody.query).not.toMatch(/image|pricing|thirdParty|variants/i);
  });

  it("distinguishes a valid empty search from a bounded truncated result set", async () => {
    const empty = await service({ requestJson: vi.fn(async () => searchGraphql([])) }).search({ language: "en", name: "Missing Card" });
    expect(empty).toMatchObject({ results: [], matchesShown: 0, truncated: false });

    const body = Array.from({ length: 25 }, (_, index) => ({ id: `set-${index + 1}`, localId: String(index + 1), name: "Pikachu" }));
    const bounded = await service({ requestJson: vi.fn(async () => searchGraphql(body)) }).search({ language: "en", name: "Pikachu" });
    expect(bounded.results).toHaveLength(8);
    expect(bounded.matchesShown).toBe(8);
    expect(bounded.truncated).toBe(true);
    expect(bounded).not.toHaveProperty("totalMatches");
  });

  it("rejects unsupported languages before any provider request", async () => {
    const requestJson = vi.fn();
    await expect(service({ requestJson }).search({ language: "fr", name: "Dracaufeu" })).rejects.toMatchObject({ code: "COLLECTIBLE_LANGUAGE_UNAVAILABLE" });
    await expect(service({ requestJson }).detail({ language: "fr", cardId: "base1-4" })).rejects.toMatchObject({ code: "COLLECTIBLE_LANGUAGE_UNAVAILABLE" });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("fails closed on malformed, oversized, and mismatched provider documents", async () => {
    await expect(service({ requestJson: vi.fn(async () => ({ data: [] })) }).search({ language: "en", name: "Pikachu" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_MALFORMED" });
    await expect(service({ requestJson: vi.fn(async () => searchGraphql(Array.from({ length: 26 }, (_, index) => ({ id: `x-${index}`, localId: index, name: "X" })))) }).search({ language: "en", name: "Pikachu" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_MALFORMED" });
    await expect(service({ requestJson: vi.fn(async () => ({ errors: [{ message: "failed" }], data: { cards: [] } })) }).search({ language: "en", name: "Pikachu" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_MALFORMED" });
    const mismatch = detailFixture(); mismatch.id = "base2-4";
    await expect(service({ requestJson: vi.fn(async () => detailGraphql(mismatch)) }).detail({ language: "en", cardId: "base1-4" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_MALFORMED" });
    const tupleMismatch = detailFixture(); tupleMismatch.set.id = "other-set";
    await expect(service({ requestJson: vi.fn(async () => detailGraphql(tupleMismatch)) }).detail({ language: "en", cardId: "base1-4" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_MALFORMED" });
    const impossibleCount = detailFixture(); impossibleCount.set.cardCount.total = 50;
    await expect(service({ requestJson: vi.fn(async () => detailGraphql(impossibleCount)) }).detail({ language: "en", cardId: "base1-4" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_MALFORMED" });
    await expect(service({ requestJson: vi.fn(async () => ({ data: { card: null } })) }).detail({ language: "en", cardId: "base1-4" })).rejects.toMatchObject({ code: "COLLECTIBLE_NOT_FOUND" });
  });

  it("maps provider limits/outages and consumes one budget unit per attempted request", async () => {
    const consume = vi.fn(async () => undefined);
    const limited = new CollectibleCatalogService(testEnv(), {
      budget: { consume }, now: () => NOW,
      http: { requestJson: vi.fn(async () => { throw new ProviderRequestError("PROVIDER_HTTP_429", true); }) }
    });
    await expect(limited.search({ language: "en", name: "Pikachu" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_RATE_LIMITED" });
    expect(consume).toHaveBeenCalledWith(1);
    const offline = service({ requestJson: vi.fn(async () => { throw new ProviderRequestError("PROVIDER_TIMEOUT", true); }) });
    await expect(offline.detail({ language: "en", cardId: "base1-4" })).rejects.toMatchObject({ code: "COLLECTIBLE_PROVIDER_UNAVAILABLE" });
  });

  it("rejects unsafe search/card identifiers before making a provider call", async () => {
    const requestJson = vi.fn();
    const catalog = service({ requestJson });
    await expect(catalog.search({ language: "en", name: "x" })).rejects.toMatchObject({ code: "INVALID_COLLECTIBLE_QUERY" });
    await expect(catalog.search({ language: "en", name: "Pikachu", setId: "../secret" })).rejects.toMatchObject({ code: "INVALID_COLLECTIBLE_QUERY" });
    await expect(catalog.detail({ language: "en", cardId: "../secret" })).rejects.toMatchObject({ code: "INVALID_COLLECTIBLE_ID" });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("keeps routes strict, anonymous, disabled by flag, and no-store", async () => {
    const app = Fastify({ logger: false }); apps.push(app); installErrorHandler(app);
    const source = { search: vi.fn(async () => ({ results: [] })), detail: vi.fn(async () => ({ card: {} })) };
    await collectibleRoutes(app, testEnv(), source as never);
    const response = await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: "Pikachu" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(source.search).toHaveBeenCalledWith({ language: "en", name: "Pikachu" });
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: "Pikachu", grade: "10" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "fr", name: "Pikachu" } })).statusCode).toBe(400);

    const disabled = Fastify({ logger: false }); apps.push(disabled); installErrorHandler(disabled);
    await collectibleRoutes(disabled, testEnv(false), source as never);
    expect((await disabled.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: "Pikachu" } })).statusCode).toBe(503);
  });

  it("enforces dedicated anonymous hourly limits on both catalog routes", async () => {
    const source = { search: vi.fn(async () => ({ results: [] })), detail: vi.fn(async () => ({ card: {} })) };
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", COLLECTIBLE_CATALOG_ENABLED: "true", RATE_LIMIT_COLLECTIBLE_PER_HOUR: "2" }), undefined, { collectibleCatalog: source as never });
    apps.push(app);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: "Pikachu" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: "Charizard" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: "Mewtwo" } })).statusCode).toBe(429);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/detail", payload: { language: "en", cardId: "base1-4" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/detail", payload: { language: "en", cardId: "base2-6" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/detail", payload: { language: "en", cardId: "base3-4" } })).statusCode).toBe(429);
  });

  it("keeps catalog query canaries out of logs and aggregate metrics", async () => {
    const marker = "catalog-query-canary-never-log";
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      const source = {
        search: vi.fn(async () => ({ ...searchResponseFixture(), query: { language: "en", name: marker, number: null, setId: null } })),
        detail: vi.fn()
      };
      const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "info", ENABLE_METRICS: "true", COLLECTIBLE_CATALOG_ENABLED: "true" }), undefined, { collectibleCatalog: source as never });
      apps.push(app);
      expect((await app.inject({ method: "POST", url: "/v1/private/collectibles/search", payload: { language: "en", name: marker } })).statusCode).toBe(200);
      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(metrics.body).not.toContain(marker);
      expect(written.join("\n")).not.toContain(marker);
    } finally {
      write.mockRestore();
    }
  });
});

function service(http: ProviderHttp): CollectibleCatalogService {
  return new CollectibleCatalogService(testEnv(), { http, budget: { consume: vi.fn(async () => undefined) }, now: () => NOW });
}

function detailFixture(): Record<string, any> {
  return {
    id: "base1-4", localId: "4", name: "Charizard", category: "Pokemon", illustrator: "Mitsuhiro Arita", rarity: "Rare",
    image: "https://assets.tcgdex.net/en/base/base1/4", pricing: { marketPrice: 999 },
    set: { id: "base1", name: "Base Set", cardCount: { official: 102, total: 102 }, logo: "https://assets.tcgdex.net/logo" },
    variants: { firstEdition: true, holo: true },
    variants_detailed: [{ type: "holo", pricing: { marketPrice: 999 } }]
  };
}

function searchGraphql(cards: unknown[]) {
  return { data: { cards } };
}

function detailGraphql(card: unknown) {
  return { data: { card } };
}

function searchResponseFixture() {
  return {
    results: [], matchesShown: 0, truncated: false, fetchedAt: NOW.toISOString(),
    source: { provider: "tcgdex", url: "https://tcgdex.dev", licenseUrl: "https://github.com/tcgdex/cards-database/blob/master/LICENSE" },
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", modelProvider: "none", providerDestinations: ["TCGdex"], disclosure: "Catalog identifiers only." }
  };
}
