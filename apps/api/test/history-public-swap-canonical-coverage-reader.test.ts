import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaCanonicalCoverageReader } from "../src/history/public-swap-canonical-coverage-reader.js";

const request = { chainId: 4663, poolAddress: `0x${"11".repeat(20)}`, fromBlock: 80n, toBlock: 88n, source: "capture-a" };

describe("canonical verification database reader", () => {
  it("reads the latest exact coverage and only bounded public event anchors", async () => {
    const coverage = { id: "cov-2", revision: 2, ...request, blockHash: `0x${"aa".repeat(32)}`,
      status: "COMPLETE", canonicalStatus: "UNKNOWN" };
    const anchors = [{ chainId: 4663, poolAddress: request.poolAddress, source: request.source,
      blockNumber: 84n, blockHash: `0x${"bb".repeat(32)}` }];
    const findFirst = vi.fn(async () => coverage);
    const findMany = vi.fn(async () => anchors);
    const db = { publicSwapHistoryCoverage: { findFirst }, publicSwapObservation: { findMany } } as unknown as PrismaClient;
    const reader = new PrismaCanonicalCoverageReader(db);
    expect(await reader.readLatest(request)).toEqual(coverage);
    expect(await reader.readObservationBlockAnchors(request)).toEqual(anchors);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: request, orderBy: { revision: "desc" } }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { chainId: 4663, poolAddress: request.poolAddress, source: request.source,
        blockNumber: { gte: 80n, lte: 88n } }, take: 101,
      select: { chainId: true, poolAddress: true, source: true, blockNumber: true, blockHash: true },
    }));
  });
});
