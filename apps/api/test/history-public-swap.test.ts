import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  PublicSwapHistoryConflictError,
  PublicSwapHistoryRepository,
  type PublicSwapHistoryCoverageInput,
  type PublicSwapObservationInput,
} from "../src/history/public-swap-history.js";

const POOL = "0x1111111111111111111111111111111111111111";
const BLOCK_A = `0x${"aa".repeat(32)}`;
const BLOCK_B = `0x${"bb".repeat(32)}`;
const TX = `0x${"cc".repeat(32)}`;

class MemoryPrisma {
  observations = new Map<string, Record<string, any>>();
  coverages = new Map<string, Record<string, any>>();
  publicSwapObservation = {
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of this.observations.values()) {
        const hashMatches = typeof where.blockHash === "string"
          ? row.blockHash === where.blockHash
          : where.blockHash?.not ? row.blockHash !== where.blockHash.not : true;
        if (row.chainId === where.chainId && row.blockNumber === where.blockNumber && hashMatches) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    },
    findUnique: async ({ where }: any) => {
      const keyData = where.chainId_poolAddress_blockHash_transactionHash_logIndex;
      const key = [keyData.chainId, keyData.poolAddress, keyData.blockHash, keyData.transactionHash, keyData.logIndex].join(":");
      return this.observations.get(key) ?? null;
    },
    create: async ({ data }: any) => {
      const key = [data.chainId, data.poolAddress, data.blockHash, data.transactionHash, data.logIndex].join(":");
      if (this.observations.has(key)) throw new Error("unique collision");
      const row = { id: key, ...data };
      this.observations.set(key, row);
      return row;
    },
  };
  publicSwapHistoryCoverage = {
    findFirst: async ({ where, orderBy }: any) => [...this.coverages.values()]
      .filter((row) => Object.entries(where).every(([field, value]) => row[field] === value))
      .sort((a, b) => orderBy.revision === "desc" ? b.revision - a.revision : a.revision - b.revision)[0] ?? null,
    create: async ({ data }: any) => {
      const row = { id: `coverage-${data.revision}`, ...data };
      this.coverages.set(row.id, row);
      return row;
    },
  };
  $transaction = async <T>(run: (tx: any) => Promise<T>) => run(this);
}

function observation(blockHash = BLOCK_A): PublicSwapObservationInput {
  return {
    chainId: 4663,
    poolAddress: POOL,
    blockNumber: 88n,
    blockHash,
    transactionHash: TX,
    logIndex: 9,
    blockTimestamp: new Date("2026-09-23T12:00:00Z"),
    amount0: "-12345678901234567890123456789012345678901234567890",
    amount1: "98765432109876543210987654321098765432109876543210",
    sqrtPriceX96: "1461501637330902918203684832716283019655932542975",
    liquidity: "340282366920938463463374607431768211455",
    tick: -887272,
    source: "public-rpc",
  };
}

function coverage(status: PublicSwapHistoryCoverageInput["status"]): PublicSwapHistoryCoverageInput {
  return { chainId: 4663, poolAddress: POOL, fromBlock: 80n, toBlock: 89n, source: "public-rpc", status };
}

describe("public Swap history storage", () => {
  it("is off by default", async () => {
    const repo = new PublicSwapHistoryRepository(new MemoryPrisma() as any);
    await expect(repo.ingestObservation(observation())).rejects.toThrow("disabled");
  });

  it("is idempotent for the same chain/pool/block-hash/transaction/log identity", async () => {
    const db = new MemoryPrisma();
    const repo = new PublicSwapHistoryRepository(db as any, true);
    await repo.ingestObservation(observation());
    await repo.ingestObservation(observation());
    expect(db.observations.size).toBe(1);
  });

  it("rejects a conflicting replay without rewriting the original evidence", async () => {
    const db = new MemoryPrisma();
    const repo = new PublicSwapHistoryRepository(db as any, true);
    const first = observation();
    await repo.ingestObservation(first);
    await expect(repo.ingestObservation({ ...first, amount0: "-7" })).rejects.toBeInstanceOf(PublicSwapHistoryConflictError);
    const stored = [...db.observations.values()][0];
    expect(stored.amount0.toFixed(0)).toBe(first.amount0);
    expect(db.observations.size).toBe(1);
  });

  it("requires explicit verified promotion and does not resurrect a replayed stale fork", async () => {
    const db = new MemoryPrisma();
    const repo = new PublicSwapHistoryRepository(db as any, true);
    await repo.ingestObservation(observation(BLOCK_A));
    await repo.ingestObservation(observation(BLOCK_B));
    expect([...db.observations.values()].every((row) => row.canonicalStatus === "UNKNOWN")).toBe(true);
    await repo.promoteVerifiedCanonicalBlock({ chainId: 4663, blockNumber: 88n, blockHash: BLOCK_B });
    await repo.ingestObservation(observation(BLOCK_A));
    expect([...db.observations.values()].map((row) => [row.blockHash, row.canonicalStatus])).toEqual([
      [BLOCK_A, "ORPHANED"],
      [BLOCK_B, "CANONICAL"],
    ]);
  });

  it("keeps an empty successful range distinct from a coverage gap", async () => {
    const db = new MemoryPrisma();
    const repo = new PublicSwapHistoryRepository(db as any, true);
    const empty = await repo.recordCoverage(coverage("EMPTY"));
    await repo.recordCoverage(coverage("GAP"));
    await repo.recordCoverage(coverage("GAP"));
    expect([...db.coverages.values()].map((row) => [row.status, row.revision])).toEqual([
      ["EMPTY", 1],
      ["GAP", 2],
    ]);
    expect(empty.status).toBe("EMPTY");
  });

  it("retains large signed and unsigned event integers exactly", async () => {
    const db = new MemoryPrisma();
    const repo = new PublicSwapHistoryRepository(db as any, true);
    await repo.ingestObservation(observation());
    const row = [...db.observations.values()][0];
    expect(row.amount0).toBeInstanceOf(Prisma.Decimal);
    expect(row.amount0.toFixed(0)).toBe(observation().amount0);
    expect(row.amount1.toFixed(0)).toBe(observation().amount1);
    expect(row.sqrtPriceX96.toFixed(0)).toBe(observation().sqrtPriceX96);
    expect(row.liquidity.toFixed(0)).toBe(observation().liquidity);
  });
});
