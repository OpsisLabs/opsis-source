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
      source: "reviewed-source", status: "EMPTY", canonicalStatus: "CANONICAL", expectedEventCount: 0,
      contentDigest: publicSwapContentDigest([]), retentionExpiresAt: null,
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
    expect(response.json()).toEqual({ state: "empty", events: [] });
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
    [{ state: "complete", events: [{ ...event, privateField: "must not escape" }] }, { state: "complete", events: [event] }],
    [{ state: "empty", events: [] }, { state: "empty", events: [] }],
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
    const { app } = await routeApp({ result: { state: "complete", events: [{ ...event, amount0: null }] } });
    const response = await app.inject({ method: "POST", url: "/v1/public/swap-history", payload: body });
    expect(response.json()).toEqual({ state: "gap" });
  });
});
