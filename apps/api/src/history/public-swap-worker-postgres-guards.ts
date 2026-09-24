import { Prisma, type PrismaClient } from "@prisma/client";
import type { PublicSwapHistoryRepository } from "./public-swap-history.js";
import { PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID } from "./public-swap-history.js";
import type { HistoryWorkerLease, StorageHeadroom, WorkerCoverageWriter } from "./public-swap-capture-worker.js";
import type { RedisHistoryWorkerLease } from "./public-swap-worker-redis-guards.js";

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
      workerLeaseToken: input.workerLeaseToken,
    });
  }
}

const WORKER_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** PostgreSQL half of the worker lease; coverage writes lock and check this same row. */
export class PostgresHistoryWorkerLease {
  constructor(private readonly prisma: PrismaClient, readonly ttlMs = 60_000) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new TypeError("History worker lease TTL must be a positive safe integer");
  }

  async acquire(ownerToken: string): Promise<boolean> {
    if (!WORKER_TOKEN.test(ownerToken)) return false;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ ownerToken: string | null; active: boolean }>>(Prisma.sql`
        SELECT "ownerToken", ("expiresAt" > clock_timestamp()) AS active
        FROM "PublicSwapHistoryWorkerLease"
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID}
        FOR UPDATE
      `);
      if (rows.length !== 1 || rows[0]!.active) return false;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PublicSwapHistoryWorkerLease"
        SET "ownerToken" = ${ownerToken}, "expiresAt" = clock_timestamp() + (${this.ttlMs} * interval '1 millisecond')
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID}
      `);
      return true;
    });
  }

  async renew(ownerToken: string): Promise<boolean> {
    if (!WORKER_TOKEN.test(ownerToken)) return false;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ ownerToken: string | null; active: boolean }>>(Prisma.sql`
        SELECT "ownerToken", ("expiresAt" > clock_timestamp()) AS active
        FROM "PublicSwapHistoryWorkerLease"
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID}
        FOR UPDATE
      `);
      if (rows.length !== 1 || rows[0]!.ownerToken !== ownerToken || !rows[0]!.active) return false;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PublicSwapHistoryWorkerLease"
        SET "expiresAt" = clock_timestamp() + (${this.ttlMs} * interval '1 millisecond')
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID} AND "ownerToken" = ${ownerToken}
      `);
      return true;
    });
  }

  async release(ownerToken: string): Promise<void> {
    if (!WORKER_TOKEN.test(ownerToken)) return;
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ ownerToken: string | null }>>(Prisma.sql`
        SELECT "ownerToken" FROM "PublicSwapHistoryWorkerLease"
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID} FOR UPDATE
      `);
      if (rows.length !== 1 || rows[0]!.ownerToken !== ownerToken) return;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PublicSwapHistoryWorkerLease"
        SET "ownerToken" = NULL, "expiresAt" = NULL
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID} AND "ownerToken" = ${ownerToken}
      `);
    });
  }
}

/** Redis remains the first contention gate; PostgreSQL owns the coverage fence. */
export class FencedHistoryWorkerLease implements HistoryWorkerLease {
  readonly ttlMs: number;

  constructor(private readonly redis: RedisHistoryWorkerLease, private readonly postgres: PostgresHistoryWorkerLease) {
    this.ttlMs = Math.min(redis.ttlMs, postgres.ttlMs);
  }

  async acquire(key: string): Promise<string | null> {
    const token = await this.redis.acquire(key);
    if (!token) return null;
    try {
      if (await this.postgres.acquire(token)) return token;
    } catch {
      // A partial acquisition fails closed; Redis is released below.
    }
    await this.redis.release(key, token);
    return null;
  }

  async confirm(key: string, ownerToken: string): Promise<boolean> {
    if (!(await this.redis.confirm(key, ownerToken))) return false;
    return this.postgres.renew(ownerToken);
  }

  async release(key: string, ownerToken: string): Promise<void> {
    try { await this.postgres.release(ownerToken); }
    finally { await this.redis.release(key, ownerToken); }
  }
}
