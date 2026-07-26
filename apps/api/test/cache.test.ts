import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonCache, type CacheClient } from "../src/cache/service.js";
import { ChainEntityResolver } from "../src/chain/resolver.js";
import { loadEnv } from "../src/config/env.js";

class FakeRedis implements CacheClient {
  readonly values = new Map<string, string>();
  lastSet?: { key: string; mode: "EX"; ttlSeconds: number };

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown> {
    this.values.set(key, value);
    this.lastSet = { key, mode, ttlSeconds };
    return "OK";
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("JSON cache", () => {
  it("uses namespaced Redis keys with a bounded TTL", async () => {
    const redis = new FakeRedis();
    const cache = new JsonCache(redis, 45);

    await cache.set("entity:1", { ok: true });

    expect(redis.lastSet).toEqual({ key: "rh:cache:entity:1", mode: "EX", ttlSeconds: 45 });
    expect(await cache.get("entity:1")).toEqual({ ok: true });
  });

  it("reuses a normalized provider result in memory", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes("/transactions")
        ? { items: [{ hash: "0xtransaction" }] }
        : { hash: "0x0000000000000000000000000000000000000001", coin_balance: "1" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = loadEnv({ NODE_ENV: "test" });
    const resolver = new ChainEntityResolver(env, new JsonCache(undefined, 60));
    const address = "0x0000000000000000000000000000000000000001";

    const first = await resolver.resolveWithSources("wallet", address);
    const second = await resolver.resolveWithSources("wallet", address);

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("automatically resolves a token address from provider metadata", async () => {
    const address = "0x0000000000000000000000000000000000000002";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/transactions")) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (url.includes("/tokens/")) {
        return new Response(JSON.stringify({ name: "Fixture Token", symbol: "FIX", decimals: "18" }), { status: 200 });
      }
      return new Response(JSON.stringify({ hash: address, is_contract: true, token: { symbol: "FIX" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const resolver = new ChainEntityResolver(loadEnv({ NODE_ENV: "test" }), new JsonCache(undefined, 60));

    const resolution = await resolver.resolveWithSources("unknown", address);

    expect(resolution.entity.type).toBe("token");
    expect(resolution.entity.facts).toMatchObject({ name: "Fixture Token", symbol: "FIX", decimals: "18" });
    // 8 baseline calls plus holders, counters and the deploying address, which
    // together supply the distribution analysis.
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });
});
