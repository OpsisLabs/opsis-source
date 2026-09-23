import type { PrismaClient } from "@prisma/client";
import type { PublicSwapHistoryRepository } from "./public-swap-history.js";
import type { StorageHeadroom, WorkerCoverageWriter } from "./public-swap-capture-worker.js";

type StorageQuery = Pick<PrismaClient, "$queryRaw">;
type CoverageRepository = Pick<PublicSwapHistoryRepository, "recordCoverage">;

/**
 * A conservative relation-size gate, not a database or hosting quota. WAL,
 * backups, other tables, and bytes written by a single in-flight range are
 * outside pg_total_relation_size; keep a separately configured safety margin.
 */
export class PostgresHistoryStorageHeadroom implements StorageHeadroom {
  constructor(
    private readonly prisma: StorageQuery,
    private readonly maxRelationBytes: bigint,
    private readonly reserveBytes: bigint,
  ) {
    if (maxRelationBytes <= 0n || reserveBytes <= 0n || reserveBytes >= maxRelationBytes) {
      throw new TypeError("Invalid history relation-size limit or reserve");
    }
  }

  async check(): Promise<{ allowed: boolean }> {
    // Static identifiers only: no caller or configuration value enters SQL.
    const rows = await this.prisma.$queryRaw<Array<{ bytes: bigint }>>`
      SELECT (
        pg_total_relation_size('"PublicSwapObservation"'::regclass)
        + pg_total_relation_size('"PublicSwapHistoryCoverage"'::regclass)
      )::bigint AS bytes
    `;
    if (rows.length !== 1 || typeof rows[0]?.bytes !== "bigint" || rows[0].bytes < 0n) {
      throw new Error("History relation size is unavailable");
    }
    return { allowed: rows[0].bytes + this.reserveBytes <= this.maxRelationBytes };
  }
}

/** Failed worker decisions become explicit coverage revisions, never EMPTY. */
export class PostgresWorkerCoverageWriter implements WorkerCoverageWriter {
  constructor(private readonly history: CoverageRepository) {}

  async recordGap(input: Parameters<WorkerCoverageWriter["recordGap"]>[0]): Promise<void> {
    await this.history.recordCoverage({
      ...input.range,
      status: "GAP",
      detail: input.detail,
    });
  }
}
