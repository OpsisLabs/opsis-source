import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../src/config/env.js";
import { installRetention, retentionReadiness, runRetention, type RetentionResult } from "../src/ops/retention.js";

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

  it("runs at startup and never overlaps an active cleanup", async () => {
    const hooks = new Map<string, () => Promise<void>>();
    const app = {
      log: { info: vi.fn(), error: vi.fn() },
      addHook: vi.fn((name: string, hook: () => Promise<void>) => hooks.set(name, hook))
    } as unknown as FastifyInstance;
    let release: (() => void) | undefined;
    const cleanup = vi.fn(() => new Promise<RetentionResult>((resolve) => {
      release = () => resolve({
        authTokens: 0,
        refreshTokens: 0,
        sourceDocuments: 0,
        cachedResponses: 0,
        rateLimitBuckets: 0,
        auditLogs: 0,
        usageEvents: 0,
        usageAggregates: 0,
        chatSessions: 0
      });
    }));
    const env = loadEnv({ NODE_ENV: "test", RETENTION_INTERVAL_HOURS: "24" });

    installRetention(app, {} as PrismaClient, env, cleanup);
    const first = hooks.get("onReady")?.();
    const overlapping = hooks.get("onReady")?.();
    await overlapping;
    expect(cleanup).toHaveBeenCalledTimes(1);
    release?.();
    await first;
    expect(app.log.info).toHaveBeenCalledWith({ result: expect.any(Object) }, "retention cleanup completed");
    expect(retentionReadiness(true, 24).status).toBe("up");
    await hooks.get("onClose")?.();
  });

  it("fails readiness after a rejected cleanup and when the last success is overdue", async () => {
    const hooks = new Map<string, () => Promise<void>>();
    const app = {
      log: { info: vi.fn(), error: vi.fn() },
      addHook: vi.fn((name: string, hook: () => Promise<void>) => hooks.set(name, hook))
    } as unknown as FastifyInstance;
    const env = loadEnv({ NODE_ENV: "test", RETENTION_INTERVAL_HOURS: "24" });

    installRetention(app, {} as PrismaClient, env, vi.fn().mockRejectedValue(new Error("cleanup failed")));
    await hooks.get("onReady")?.();
    expect(retentionReadiness(true, 24).status).toBe("unavailable");
    expect(app.log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, "retention cleanup failed");
    await hooks.get("onClose")?.();

    const successHooks = new Map<string, () => Promise<void>>();
    const successApp = {
      log: { info: vi.fn(), error: vi.fn() },
      addHook: vi.fn((name: string, hook: () => Promise<void>) => successHooks.set(name, hook))
    } as unknown as FastifyInstance;
    const empty: RetentionResult = { authTokens: 0, refreshTokens: 0, sourceDocuments: 0, cachedResponses: 0, rateLimitBuckets: 0, auditLogs: 0, usageEvents: 0, usageAggregates: 0, chatSessions: 0 };
    installRetention(successApp, {} as PrismaClient, env, vi.fn().mockResolvedValue(empty));
    await successHooks.get("onReady")?.();
    expect(retentionReadiness(true, 24, new Date(Date.now() + 37 * 60 * 60 * 1_000)).status).toBe("unavailable");
    await successHooks.get("onClose")?.();
  });
});
