import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { observeRetention } from "../observability/metrics.js";

export type RetentionResult = Record<
  "authTokens" | "refreshTokens" | "sourceDocuments" | "cachedResponses" | "rateLimitBuckets" | "auditLogs" | "usageEvents" | "usageAggregates" | "chatSessions",
  number
>;

type RetentionRuntimeStatus = {
  enabled: boolean;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
};

let runtimeStatus: RetentionRuntimeStatus = {
  enabled: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null
};

export function retentionReadiness(enabled: boolean, intervalHours: number, now = new Date()) {
  if (!enabled) return { status: "disabled" as const, lastSuccessAt: null };
  const lastSuccessAt = runtimeStatus.lastSuccessAt?.toISOString() ?? null;
  const overdueMs = intervalHours * 1.5 * 60 * 60 * 1_000;
  const overdue = !runtimeStatus.lastSuccessAt || now.getTime() - runtimeStatus.lastSuccessAt.getTime() > overdueMs;
  const failedSinceSuccess = Boolean(
    runtimeStatus.lastFailureAt &&
      (!runtimeStatus.lastSuccessAt || runtimeStatus.lastFailureAt > runtimeStatus.lastSuccessAt)
  );
  return {
    status: overdue || failedSinceSuccess ? "unavailable" as const : "up" as const,
    lastSuccessAt,
    lastAttemptAt: runtimeStatus.lastAttemptAt?.toISOString() ?? null
  };
}

export async function runRetention(prisma: PrismaClient, env: Env, now = new Date()): Promise<RetentionResult> {
  const authCutoff = daysBefore(now, env.RETENTION_AUTH_DAYS);
  const sourceCutoff = daysBefore(now, env.RETENTION_SOURCE_DAYS);
  const auditCutoff = daysBefore(now, env.RETENTION_AUDIT_DAYS);
  const usageCutoff = daysBefore(now, env.RETENTION_USAGE_DAYS);
  const chatCutoff = daysBefore(now, env.RETENTION_CHAT_DAYS);
  const aggregateCutoff = daysBefore(now, 365);
  await prisma.$executeRaw`
    INSERT INTO "UsageAggregate" ("userId", "month", "eventType", "quantity", "updatedAt")
    SELECT "userId", date_trunc('month', "createdAt"), "eventType", SUM("quantity")::integer, ${now}
    FROM "UsageEvent"
    WHERE "userId" IS NOT NULL AND "createdAt" < ${usageCutoff} AND "createdAt" >= ${aggregateCutoff}
    GROUP BY "userId", date_trunc('month', "createdAt"), "eventType"
    ON CONFLICT ("userId", "month", "eventType") DO UPDATE
    SET "quantity" = EXCLUDED."quantity", "updatedAt" = EXCLUDED."updatedAt"
  `;
  const [authTokens, refreshTokens, sourceDocuments, cachedResponses, rateLimitBuckets, auditLogs, usageEvents, usageAggregates, chatSessions] =
    await prisma.$transaction([
      prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: authCutoff } }] } }),
      prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: authCutoff } }] } }),
      prisma.sourceDocument.deleteMany({
        where: { messages: { none: {} }, OR: [{ expiresAt: { lt: now } }, { fetchedAt: { lt: sourceCutoff } }] }
      }),
      prisma.cachedApiResponse.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } }),
      prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
      prisma.usageEvent.deleteMany({ where: { createdAt: { lt: usageCutoff } } }),
      prisma.usageAggregate.deleteMany({ where: { month: { lt: aggregateCutoff } } }),
      prisma.chatSession.deleteMany({ where: { updatedAt: { lt: chatCutoff } } })
    ]);
  return {
    authTokens: authTokens.count,
    refreshTokens: refreshTokens.count,
    sourceDocuments: sourceDocuments.count,
    cachedResponses: cachedResponses.count,
    rateLimitBuckets: rateLimitBuckets.count,
    auditLogs: auditLogs.count,
    usageEvents: usageEvents.count,
    usageAggregates: usageAggregates.count,
    chatSessions: chatSessions.count
  };
}

export function installRetention(
  app: FastifyInstance,
  prisma: PrismaClient,
  env: Env,
  cleanup: () => Promise<RetentionResult> = () => runRetention(prisma, env)
): void {
  let running = false;
  runtimeStatus = { enabled: true, lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null };
  const run = async () => {
    if (running) return;
    running = true;
    runtimeStatus.lastAttemptAt = new Date();
    try {
      const result = await cleanup();
      runtimeStatus.lastSuccessAt = new Date();
      observeRetention("success");
      app.log.info({ result }, "retention cleanup completed");
    } catch (error) {
      runtimeStatus.lastFailureAt = new Date();
      observeRetention("failure");
      app.log.error({ err: error }, "retention cleanup failed");
    } finally {
      running = false;
    }
  };
  // Run once at process readiness so routine redeploys cannot indefinitely
  // postpone the legal retention windows. The interval is the subsequent
  // cadence, and the running guard prevents overlap inside one replica.
  app.addHook("onReady", run);
  const timer = setInterval(() => void run(), env.RETENTION_INTERVAL_HOURS * 60 * 60 * 1000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
