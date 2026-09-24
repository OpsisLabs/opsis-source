import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { PublicSwapHistoryRepository } from "../src/history/public-swap-history.js";
import { PostgresHistoryStorageHeadroom, PostgresWorkerCoverageWriter } from "../src/history/public-swap-worker-postgres-guards.js";

const range = {
  chainId: 4663 as const,
  poolAddress: "0x1111111111111111111111111111111111111111",
  fromBlock: 1n,
  toBlock: 100n,
  source: "public-rpc",
};

function queryReturning(value: unknown) {
  const query = vi.fn(async () => value);
  return { query, prisma: { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw"> };
}

describe("public Swap worker PostgreSQL guards", () => {
  it("allows only when measured relations plus reserve fit the configured cap", async () => {
    const under = queryReturning([{ bytes: 8_241_152n }]);
    const atCap = new PostgresHistoryStorageHeadroom(under.prisma, 10_000_000n, 1_000_000n);
    expect(await atCap.check()).toEqual({ allowed: true });
    expect(under.query).toHaveBeenCalledTimes(1);

    const over = queryReturning([{ bytes: 9_000_001n }]);
    expect(await new PostgresHistoryStorageHeadroom(over.prisma, 10_000_000n, 1_000_000n).check()).toEqual({ allowed: false });
  });

  it("rejects invalid caps and fails closed when size is unavailable", async () => {
    const missing = queryReturning([]);
    expect(() => new PostgresHistoryStorageHeadroom(missing.prisma, 0n, 1n)).toThrow();
    expect(() => new PostgresHistoryStorageHeadroom(missing.prisma, 10n, 10n)).toThrow();
    await expect(new PostgresHistoryStorageHeadroom(missing.prisma, 10n, 1n).check()).rejects.toThrow("unavailable");
    for (const malformed of [[{ bytes: -1n }], [{ bytes: 42 }], [{ bytes: 1n }, { bytes: 2n }]]) {
      const db = queryReturning(malformed);
      await expect(new PostgresHistoryStorageHeadroom(db.prisma, 10n, 1n).check()).rejects.toThrow("unavailable");
    }
    const failed = { $queryRaw: vi.fn(async () => { throw new Error("database down"); }) } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(new PostgresHistoryStorageHeadroom(failed, 10n, 1n).check()).rejects.toThrow("database down");
  });

  it("records an explicit GAP revision and propagates storage failure", async () => {
    const recordCoverage = vi.fn(async () => ({}));
    const writer = new PostgresWorkerCoverageWriter({ recordCoverage } as unknown as Pick<PublicSwapHistoryRepository, "recordCoverage">);
    await writer.recordGap({ range, detail: "BUDGET_EXHAUSTED", workerLeaseToken: "00000000-0000-4000-8000-000000000000" });
    expect(recordCoverage).toHaveBeenCalledWith({ ...range, status: "GAP", detail: "BUDGET_EXHAUSTED", workerLeaseToken: "00000000-0000-4000-8000-000000000000" });
    recordCoverage.mockRejectedValueOnce(new Error("database down"));
    await expect(writer.recordGap({ range, detail: "STORAGE_CAP", workerLeaseToken: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow("database down");
  });
});
