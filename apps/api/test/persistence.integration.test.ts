import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { AuthRepository } from "../src/auth/repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must reference a test database");
}

if (!databaseUrl) {
  describe.skip("PostgreSQL persistence", () => {
    it("requires TEST_DATABASE_URL", () => undefined);
  });
} else {
  describe("PostgreSQL persistence", () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    beforeAll(() => prisma.$connect());
    afterAll(() => prisma.$disconnect());

    it("persists a source-linked chat exchange and usage", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const email = `persistence-${suffix}@example.com`;
      const entityValue = `integration-fixture-${suffix}`;
      const app = await buildApp(
        loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
        prisma,
      );
      let userId: string | undefined;
      let sourceIds: string[] = [];

      try {
        const register = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: { email, password: "strong-password" },
        });
        expect(register.statusCode).toBe(200);
        userId = register.json().user.id as string;
        const accessToken = register.json().accessToken as string;

        const created = await app.inject({
          method: "POST",
          url: "/v1/chat/sessions",
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { title: "Persistence integration" },
        });
        expect(created.statusCode).toBe(200);
        const sessionId = created.json().session.id as string;

        const sent = await app.inject({
          method: "POST",
          url: `/v1/chat/sessions/${sessionId}/messages`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            entity: entityValue,
            entityType: "unknown",
            question: "What source supports this answer?",
          },
        });
        expect(sent.statusCode).toBe(200);

        const session = await prisma.chatSession.findUnique({
          where: { id: sessionId },
          include: {
            activeEntity: true,
            messages: {
              orderBy: { createdAt: "asc" },
              include: { sources: { include: { sourceDocument: true } } },
            },
          },
        });
        expect(session?.userId).toBe(userId);
        expect(session?.activeEntity).toMatchObject({
          type: "UNKNOWN",
          value: entityValue,
        });
        expect(session?.messages).toHaveLength(2);

        const assistant = session?.messages.find(
          (message) => message.role === "ASSISTANT",
        );
        expect(assistant?.sources).toHaveLength(1);
        expect(assistant?.sources[0]?.fieldsUsed).toEqual(["hash", "status", "from", "to", "value", "gas_used", "method", "block_number"]);
        expect(assistant?.sources[0]?.sourceDocument).toMatchObject({
          provider: "local",
          entityType: "UNKNOWN",
          entityValue,
        });
        expect(assistant?.sources[0]?.sourceDocument.requestHash).toMatch(
          /^[a-f0-9]{64}$/,
        );
        sourceIds =
          assistant?.sources.map((source) => source.sourceDocumentId) ?? [];

        const usage = await prisma.usageEvent.findMany({ where: { userId } });
        expect(usage.map((event) => event.eventType).sort()).toEqual([
          "AI_MESSAGE",
          "CHAIN_LOOKUP",
        ]);
        const audits = await prisma.auditLog.findMany({ where: { userId } });
        expect(audits.map((audit) => audit.action)).toEqual([
          "AUTH_REGISTER_SUCCEEDED",
        ]);
      } finally {
        await app.close();
        const user = userId
          ? { id: userId }
          : await prisma.user.findUnique({
              where: { email },
              select: { id: true },
            });
        if (user) {
          if (sourceIds.length === 0) {
            const links = await prisma.messageSource.findMany({
              where: { message: { session: { userId: user.id } } },
              select: { sourceDocumentId: true },
            });
            sourceIds = links.map((link) => link.sourceDocumentId);
          }
          await prisma.auditLog.deleteMany({ where: { userId: user.id } });
          await prisma.usageEvent.deleteMany({ where: { userId: user.id } });
          await prisma.user.delete({ where: { id: user.id } });
        }
        if (sourceIds.length > 0)
          await prisma.sourceDocument.deleteMany({
            where: { id: { in: sourceIds } },
          });
        await prisma.cachedApiResponse.deleteMany({ where: { cacheKey: { contains: entityValue } } });
        await prisma.chainEntity.deleteMany({ where: { value: entityValue } });
      }
    }, 20_000);

    it("allows only one concurrent refresh-token rotation", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const user = await prisma.user.create({ data: { email: `refresh-race-${suffix}@example.com`, passwordHash: "test" } });
      const auth = new AuthRepository(prisma);
      const oldToken = `old-${suffix}`;
      try {
        await auth.storeRefreshToken(user.id, oldToken, new Date(Date.now() + 60_000));

        const results = await Promise.all([
          auth.rotateRefreshToken(oldToken, `next-a-${suffix}`, new Date(Date.now() + 120_000)),
          auth.rotateRefreshToken(oldToken, `next-b-${suffix}`, new Date(Date.now() + 120_000))
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect(results.filter((result) => result === null)).toHaveLength(1);
        expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
      } finally {
        await prisma.user.deleteMany({ where: { id: user.id } });
      }
    }, 20_000);
  });
}
