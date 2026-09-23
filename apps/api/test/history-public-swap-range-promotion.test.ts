import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { PublicSwapHistoryRepository, publicSwapContentDigest } from "../src/history/public-swap-history.js";

const POOL = `0x${"11".repeat(20)}`;
const HASH_A = `0x${"aa".repeat(32)}`;
const HASH_B = `0x${"bb".repeat(32)}`;
const range = { chainId: 4663 as const, poolAddress: POOL, fromBlock: 80n, toBlock: 88n, source: "capture-a" };

function event(blockHash = HASH_A) {
  return {
    id: `${blockHash}-event`, chainId: 4663, poolAddress: POOL, source: "capture-a",
    blockNumber: 84n, blockHash, transactionHash: blockHash, logIndex: 1,
    blockTimestamp: new Date("2026-09-23T12:00:00Z"), observedAt: new Date("2026-09-23T12:01:00Z"),
    amount0: new Prisma.Decimal("-1"), amount1: new Prisma.Decimal("2"),
    sqrtPriceX96: new Prisma.Decimal("79228162514264337593543950336"),
    liquidity: new Prisma.Decimal("1"), tick: 0, canonicalStatus: "UNKNOWN",
  };
}

class MemoryDb {
  events = [event(), event(HASH_B)];
  coverages = [{ id: "coverage-1", revision: 1, ...range, blockHash: HASH_A, status: "COMPLETE",
    canonicalStatus: "UNKNOWN", expectedEventCount: 1, contentDigest: publicSwapContentDigest([this.events[0]!]) }];
  publicSwapHistoryCoverage = {
    findFirst: async ({ where }: any) => this.coverages.filter((row) => row.chainId === where.chainId
      && row.poolAddress === where.poolAddress && row.fromBlock === where.fromBlock
      && row.toBlock === where.toBlock && row.source === where.source)
      .sort((a, b) => b.revision - a.revision)[0] ?? null,
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of this.coverages) if (row.id === where.id && row.revision === where.revision
        && row.canonicalStatus === where.canonicalStatus) { Object.assign(row, data); count++; }
      return { count };
    },
  };
  publicSwapObservation = {
    findMany: async ({ where, take }: any) => this.events.filter((row) => row.chainId === where.chainId
      && row.poolAddress === where.poolAddress && row.source === where.source
      && row.blockNumber >= where.blockNumber.gte && row.blockNumber <= where.blockNumber.lte).slice(0, take),
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of this.events) {
        const hashMatches = typeof where.blockHash === "string" ? row.blockHash === where.blockHash
          : row.blockHash !== where.blockHash.not;
        if (row.chainId === where.chainId && row.poolAddress === where.poolAddress
          && row.source === where.source && row.blockNumber === where.blockNumber && hashMatches) {
          Object.assign(row, data); count++;
        }
      }
      return { count };
    },
  };
  $transaction = async <T>(run: (tx: MemoryDb) => Promise<T>) => run(this);
}

function input() {
  return { ...range, coverageId: "coverage-1", revision: 1, blockHash: HASH_A,
    verifiedBlocks: [{ blockNumber: 84n, blockHash: HASH_A }, { blockNumber: 88n, blockHash: HASH_A }] };
}

describe("atomic verified Swap range promotion", () => {
  it("promotes earlier-block events with matching hashes and orphans a stored fork", async () => {
    const db = new MemoryDb();
    const repo = new PublicSwapHistoryRepository(db as any, true);
    expect(await repo.promoteVerifiedCanonicalRange(input())).toBe(true);
    expect(db.events.map((row) => row.canonicalStatus)).toEqual(["CANONICAL", "ORPHANED"]);
    expect(db.coverages[0]!.canonicalStatus).toBe("CANONICAL");
  });

  it("promotes a verified EMPTY anchor without fabricating event rows", async () => {
    const db = new MemoryDb(); db.events = [];
    db.coverages[0]!.status = "EMPTY";
    db.coverages[0]!.expectedEventCount = 0;
    db.coverages[0]!.contentDigest = publicSwapContentDigest([]);
    const repo = new PublicSwapHistoryRepository(db as any, true);
    expect(await repo.promoteVerifiedCanonicalRange({ ...input(), verifiedBlocks: [{ blockNumber: 88n, blockHash: HASH_A }] })).toBe(true);
    expect(db.coverages[0]!.canonicalStatus).toBe("CANONICAL");
  });

  it("refuses a revised latest coverage, missing event block, or changed content without any promotion", async () => {
    const cases: Array<{ change: (db: MemoryDb) => void; verifiedBlocks?: ReturnType<typeof input>["verifiedBlocks"] }> = [
      { change: (db) => { db.coverages.push({ ...db.coverages[0]!, id: "coverage-2", revision: 2, status: "GAP" }); } },
      { change: () => {}, verifiedBlocks: [{ blockNumber: 88n, blockHash: HASH_A }] },
      { change: (db) => { db.coverages[0]!.contentDigest = "f".repeat(64); } },
    ];
    for (const { change, verifiedBlocks } of cases) {
      const db = new MemoryDb(); change(db);
      const repo = new PublicSwapHistoryRepository(db as any, true);
      expect(await repo.promoteVerifiedCanonicalRange({ ...input(), verifiedBlocks: verifiedBlocks ?? input().verifiedBlocks })).toBe(false);
      expect(db.events.every((row) => row.canonicalStatus === "UNKNOWN")).toBe(true);
      expect(db.coverages.every((row) => row.canonicalStatus === "UNKNOWN")).toBe(true);
    }
  });

  it("rejects duplicate verified blocks and a missing matching range anchor", async () => {
    const repo = new PublicSwapHistoryRepository(new MemoryDb() as any, true);
    await expect(repo.promoteVerifiedCanonicalRange({ ...input(), verifiedBlocks: [
      { blockNumber: 84n, blockHash: HASH_A }, { blockNumber: 84n, blockHash: HASH_A },
      { blockNumber: 88n, blockHash: HASH_A },
    ] })).rejects.toThrow("Invalid verified block list");
    await expect(repo.promoteVerifiedCanonicalRange({ ...input(), verifiedBlocks: [
      { blockNumber: 84n, blockHash: HASH_A },
    ] })).rejects.toThrow("Missing verified range anchor");
  });
});
