import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PublicSwapHistoryFenceError,
  PublicSwapHistoryRepository,
  PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID,
} from "../src/history/public-swap-history.js";
import { PostgresHistoryWorkerLease } from "../src/history/public-swap-worker-postgres-guards.js";

const databaseUrl = process.env.PUBLIC_SWAP_FENCE_DATABASE_URL;
function isDisposableTestDatabaseUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("PUBLIC_SWAP_FENCE_DATABASE_URL must be a valid URL for the disposable opsis_fence_test database"); }
  if (!(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") || parsed.pathname !== "/opsis_fence_test") {
    throw new Error("Refusing PostgreSQL fence integration tests unless the database name is exactly opsis_fence_test");
  }
  return true;
}
const enabled = isDisposableTestDatabaseUrl(databaseUrl);
const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";

describe.skipIf(!enabled)("public Swap PostgreSQL capture fence", () => {
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();
  const lease = new PostgresHistoryWorkerLease(prisma, 5_000);
  const history = new PublicSwapHistoryRepository(prisma, true);
  const source = `fence-${randomUUID()}`;

  beforeAll(async () => {
    await prisma.publicSwapHistoryWorkerLease.update({
      where: { id: PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID },
      data: { ownerToken: null, expiresAt: null },
    });
  });

  afterAll(async () => {
    await prisma.publicSwapHistoryCoverage.deleteMany({ where: { source } });
    await prisma.publicSwapHistoryWorkerLease.update({
      where: { id: PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID },
      data: { ownerToken: null, expiresAt: null },
    });
    await prisma.$disconnect();
  });

  it("validates token shape, expiry, renewal, owner-checked release, and stale writes", async () => {
    expect(await lease.acquire("malformed")).toBe(false);
    expect(await lease.acquire(ownerA)).toBe(true);
    expect(await lease.renew("malformed")).toBe(false);
    expect(await lease.renew(ownerA)).toBe(true);
    await lease.release(ownerB);
    expect(await lease.renew(ownerA)).toBe(true);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PublicSwapHistoryWorkerLease" SET "expiresAt" = clock_timestamp() - interval '1 millisecond'
      WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID}
    `);
    expect(await lease.renew(ownerA)).toBe(false);
    expect(await lease.acquire(ownerB)).toBe(true);

    await expect(history.recordCoverage({
      chainId: 4663, poolAddress: "0x1111111111111111111111111111111111111111",
      fromBlock: 1n, toBlock: 2n, source, status: "GAP", workerLeaseToken: ownerA,
    })).rejects.toBeInstanceOf(PublicSwapHistoryFenceError);
    await expect(history.recordCoverage({
      chainId: 4663, poolAddress: "0x1111111111111111111111111111111111111111",
      fromBlock: 1n, toBlock: 2n, source, status: "GAP", workerLeaseToken: ownerB,
    })).resolves.toMatchObject({ status: "GAP" });
    await lease.release(ownerA);
    expect(await lease.renew(ownerB)).toBe(true);
  });

  it("serializes lease takeover behind a transaction holding the coverage fence row", async () => {
    await lease.release(ownerB);
    expect(await lease.acquire(ownerA)).toBe(true);
    let signalLocked!: () => void;
    let releaseHolder!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const hold = new Promise<void>((resolve) => { releaseHolder = resolve; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "PublicSwapHistoryWorkerLease"
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID} FOR UPDATE
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PublicSwapHistoryWorkerLease" SET "expiresAt" = clock_timestamp() - interval '1 millisecond'
        WHERE "id" = ${PUBLIC_SWAP_HISTORY_WORKER_LEASE_ID}
      `);
      signalLocked();
      await hold;
    });
    await locked;
    let takeoverSettled = false;
    const takeover = lease.acquire(ownerB).then((result) => { takeoverSettled = true; return result; });
    try {
      const waitDeadline = Date.now() + 2_000;
      let waitingOnLock = false;
      while (!waitingOnLock && Date.now() < waitDeadline) {
        const rows = await prisma.$queryRaw<Array<{ waiting: bigint }>>(Prisma.sql`
          SELECT count(*)::bigint AS waiting
          FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query ILIKE '%PublicSwapHistoryWorkerLease%'
        `);
        waitingOnLock = (rows[0]?.waiting ?? 0n) > 0n;
        if (!waitingOnLock) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waitingOnLock).toBe(true);
      expect(takeoverSettled).toBe(false);
    } finally {
      releaseHolder();
      await holder;
    }
    expect(await takeover).toBe(true);
    await lease.release(ownerB);
  }, 10_000);
});
