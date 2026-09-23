import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { PublicSwapHistoryRead } from "../src/history/public-swap-reader.js";
import type { PublicSwapHistoryLookup } from "../src/routes/public-swap-history.js";
import { publicSwapContentDigest } from "../src/history/public-swap-history.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
const body = { chainId: 4663, poolAddress: `0x${"11".repeat(20)}`, fromBlock: "100", toBlock: "101", source: "reviewed-source" };
const event = { chainId: 4663, poolAddress: body.poolAddress, blockNumber: "100", blockHash: `0x${"aa".repeat(32)}`,
  transactionHash: `0x${"bb".repeat(32)}`, logIndex: 1, blockTimestamp: "2026-09-23T00:00:00.000Z",
  amount0: "-1", amount1: "2", sqrtPriceX96: "3", liquidity: "4", tick: -5 };
const evidence = { kind: "observed" as const, chain: "eip155:4663" as const,
  instrumentId: `eip155:4663/pool:${body.poolAddress}`, observedAt: "2026-09-23T00:00:00.000Z",
  sourceId: "reviewed-source", sourceVersion: "unknown" as const, decoderVersion: "uniswap-v3-swap-abi-v1" as const,
  anchor: { height: "101", hash: `0x${"aa".repeat(32)}`, semantics: "current-not-final" as const },
  coverage: { state: "complete" as const, scope: { fromBlock: "100", toBlock: "101" },
    caps: { maxBlocks: 100, maxEvents: 100 }, gaps: [] as [] },
  freshness: { state: "unknown" as const, checkedAt: "2026-09-23T00:00:00.000Z" },
  units: { amount0: "raw-token-units" as const, amount1: "raw-token-units" as const, sqrtPriceX96: "Q64.96" as const,
    liquidity: "raw-pool-liquidity" as const, tick: "ticks" as const },
  limitations: ["Provider version and freshness are not established by stored coverage."] };

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function routeApp(options: { enabled?: boolean; prisma?: boolean; result?: PublicSwapHistoryRead } = {}) {
  const reader: PublicSwapHistoryLookup = { read: vi.fn().mockResolvedValue(options.result ?? { state: "gap" }) };
  const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", PUBLIC_SWAP_HISTORY_ENABLED: String(options.enabled ?? true) }),
    options.prisma === false ? undefined : {} as PrismaClient,
    { publicSwapHistory: reader });
  apps.push(app);
  return { app, reader };
}

describe("public stored Swap history route", () => {
  it("is hidden when disabled or database-less", async () => {
    const disabled = await routeApp({ enabled: false });
    const hidden = await disabled.app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.headers["cache-control"]).toBe("no-store");
    expect(disabled.reader.read).not.toHaveBeenCalled();

    const absent = await routeApp({ prisma: false });
    expect((await absent.app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body })).statusCode).toBe(404);
    expect(absent.reader.read).not.toHaveBeenCalled();
  });

  it("uses the route flag to read promoted stored EMPTY coverage through the real reader", async () => {
    const coverage = {
      id: "coverage-1", revision: 1, chainId: 4663, poolAddress: body.poolAddress, fromBlock: 100n, toBlock: 101n,
      blockHash: `0x${"aa".repeat(32)}`, source: "reviewed-source", status: "EMPTY", canonicalStatus: "CANONICAL", expectedEventCount: 0,
      contentDigest: publicSwapContentDigest([]), observedAt: new Date("2026-09-23T00:00:00.000Z"), retentionExpiresAt: null,
    };
    let coverageReads = 0;
    const prisma = {
      publicSwapHistoryCoverage: { findFirst: vi.fn(async () => { coverageReads++; return coverage; }) },
      publicSwapObservation: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", PUBLIC_SWAP_HISTORY_ENABLED: "true" }), prisma);
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ state: "empty", evidence: { sourceId: "reviewed-source",
      anchor: { height: "101", hash: `0x${"aa".repeat(32)}` }, coverage: { state: "empty" } }, events: [] });
    expect(coverageReads).toBe(2);
  });

  it("rejects malformed, non-lowercase and overwide ranges before reading", async () => {
    const { app, reader } = await routeApp();
    for (const invalid of [
      { ...body, poolAddress: body.poolAddress.toUpperCase() },
      { ...body, fromBlock: "01" },
      { ...body, fromBlock: "1e2" },
      { ...body, source: "Bad Source" },
      { ...body, toBlock: "200" },
      { ...body, extra: "ignored" },
      { ...body, chainId: 1 },
    ]) {
      expect((await app.inject({ method: "POST", url: "/v1/public/swap-history", payload: invalid })).statusCode).toBe(400);
    }
    expect(reader.read).not.toHaveBeenCalled();
  });

  it.each([
    [{ state: "complete", evidence, events: [{ ...event, privateField: "must not escape" }] },
      { state: "complete", evidence, events: [event] }],
    [{ state: "empty", evidence: { ...evidence, coverage: { ...evidence.coverage, state: "empty" } }, events: [] },
      { state: "empty", evidence: { ...evidence, coverage: { ...evidence.coverage, state: "empty" } }, events: [] }],
    [{ state: "gap" }, { state: "gap" }],
    [{ state: "unavailable" }, { state: "unavailable" }],
  ] as const)("returns only the reader's safe %s state", async (result, expected) => {
    const { app, reader } = await routeApp({ result: result as PublicSwapHistoryRead });
    const response = await app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual(expected);
    expect(reader.read).toHaveBeenCalledWith({ ...body, fromBlock: 100n, toBlock: 101n });
  });

  it("fails closed when a complete event no longer matches the public schema", async () => {
    const { app } = await routeApp({ result: { state: "complete", evidence, events: [{ ...event, amount0: null }] } });
    const response = await app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(response.json()).toEqual({ state: "gap" });
  });

  it("deep-projects evidence and rejects an event whose range-end hash conflicts with the anchor", async () => {
    const nestedPrivate = { ...evidence,
      anchor: { ...evidence.anchor, secret: "hidden" },
      coverage: { ...evidence.coverage, secret: "hidden", scope: { ...evidence.coverage.scope, secret: "hidden" },
        caps: { ...evidence.coverage.caps, secret: "hidden" }, gaps: [], privateGap: "hidden" },
      freshness: { ...evidence.freshness, secret: "hidden" },
      units: { ...evidence.units, secret: "hidden" }, secret: "hidden" };
    const { app: privateApp } = await routeApp({ result: { state: "complete", evidence: nestedPrivate, events: [
      { ...event, blockNumber: "101", blockHash: evidence.anchor.hash },
    ] } });
    const response = await privateApp.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(response.json()).toEqual({ state: "complete", evidence, events: [{ ...event, blockNumber: "101", blockHash: evidence.anchor.hash }] });

    const { app: mismatchApp } = await routeApp({ result: { state: "complete", evidence,
      events: [{ ...event, blockNumber: "101", blockHash: `0x${"cc".repeat(32)}` }] } });
    const mismatch = await mismatchApp.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(mismatch.json()).toEqual({ state: "gap" });
  });

  it("fails closed when successful results omit evidence or evidence does not match the exact request", async () => {
    for (const result of [
      { state: "complete", evidence: { ...evidence, sourceId: "other-source" }, events: [event] },
      { state: "complete", evidence: { ...evidence, anchor: { ...evidence.anchor, height: "100" } }, events: [event] },
      { state: "complete", evidence, events: [] },
      { state: "empty", evidence: { ...evidence, coverage: { ...evidence.coverage, state: "empty" } }, events: [event] },
      { state: "empty", events: [] },
    ] as unknown as PublicSwapHistoryRead[]) {
      const { app } = await routeApp({ result });
      const response = await app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
      expect(response.json()).toEqual({ state: "gap" });
    }
  });
});
