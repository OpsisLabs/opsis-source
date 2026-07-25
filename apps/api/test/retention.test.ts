import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { runRetention } from "../src/ops/retention.js";

describe("retention cleanup", () => {
  it("deletes every expired data class with configured cutoffs", async () => {
    const deletions = Array.from({ length: 9 }, (_, index) => vi.fn().mockResolvedValue({ count: index + 1 }));
    const prisma = {
      authToken: { deleteMany: deletions[0] },
      refreshToken: { deleteMany: deletions[1] },
      sourceDocument: { deleteMany: deletions[2] },
      cachedApiResponse: { deleteMany: deletions[3] },
      rateLimitBucket: { deleteMany: deletions[4] },
      auditLog: { deleteMany: deletions[5] },
      usageEvent: { deleteMany: deletions[6] },
      usageAggregate: { deleteMany: deletions[7] },
      chatSession: { deleteMany: deletions[8] },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations)
    } as unknown as PrismaClient;
    const now = new Date("2026-07-10T00:00:00.000Z");

    const result = await runRetention(prisma, loadEnv({ NODE_ENV: "test" }), now);

    expect(result).toEqual({
      authTokens: 1,
      refreshTokens: 2,
      sourceDocuments: 3,
      cachedResponses: 4,
      rateLimitBuckets: 5,
      auditLogs: 6,
      usageEvents: 7,
      usageAggregates: 8,
      chatSessions: 9
    });
    expect(deletions.every((deletion) => deletion.mock.calls.length === 1)).toBe(true);
    expect(deletions[5]).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-04-11T00:00:00.000Z") } } });
  });
});
