import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

export type RetentionResult = Record<
  "authTokens" | "refreshTokens" | "sourceDocuments" | "cachedResponses" | "rateLimitBuckets" | "auditLogs" | "usageEvents" | "usageAggregates" | "chatSessions",
  number
>;

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

export function installRetention(app: FastifyInstance, prisma: PrismaClient, env: Env): void {
  const run = () => {
    void runRetention(prisma, env)
      .then((result) => app.log.info({ result }, "retention cleanup completed"))
      .catch((error) => app.log.error({ err: error }, "retention cleanup failed"));
  };
  const timer = setInterval(run, env.RETENTION_INTERVAL_HOURS * 60 * 60 * 1000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
