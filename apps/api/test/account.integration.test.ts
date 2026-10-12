import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { deletePrismaUserAccount } from "../src/account/repository.js";
import { loadEnv } from "../src/config/env.js";
import { sha256 } from "../src/security/hash.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must reference a test database");
}

if (!databaseUrl) {
  describe.skip("PostgreSQL account portability", () => {
    it("requires TEST_DATABASE_URL", () => undefined);
  });
} else {
  describe("PostgreSQL account portability", () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    beforeAll(() => prisma.$connect());
    afterAll(() => prisma.$disconnect());

    it("exports owned rows and deletes SetNull records without deleting shared public data", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const email = `account-delete-${suffix}@example.com`;
      const sharedCacheKey = `shared-public-${suffix}`;
      const app = await buildApp(loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl, LOG_LEVEL: "silent" }), prisma);
      let userId = "";
      try {
        const register = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: { email, password: "correct-horse-battery-staple" }
        });
        expect(register.statusCode).toBe(200);
        userId = register.json().user.id as string;
        const accessToken = register.json().accessToken as string;
        await prisma.usageEvent.create({ data: { userId, eventType: "CHAIN_LOOKUP", quantity: 1 } });
        await prisma.usageAggregate.create({
          data: { userId, month: new Date("2026-08-01T00:00:00.000Z"), eventType: "CHAIN_LOOKUP", quantity: 3 }
        });
        await prisma.auditLog.create({ data: { userId, action: "TEST_LINKED_AUDIT" } });
        await prisma.auditLog.create({
          data: { action: "TEST_LEGACY_EMAIL_AUDIT", metadata: { emailHash: sha256(email.toLowerCase()) } }
        });
        await prisma.cachedApiResponse.create({
          data: {
            cacheKey: sharedCacheKey,
            provider: "test-public",
            responseJson: { public: true },
            expiresAt: new Date(Date.now() + 60_000)
          }
        });

        const exported = await app.inject({
          method: "GET",
          url: "/v1/account/export",
          headers: { authorization: `Bearer ${accessToken}` }
        });
        expect(exported.statusCode).toBe(200);
        expect(exported.json()).toMatchObject({
          schemaVersion: "opsis.account-export.v1",
          profile: { id: userId, email },
          usageEvents: [{ eventType: "CHAIN_LOOKUP", quantity: 1 }],
          usageAggregates: [{ eventType: "CHAIN_LOOKUP", quantity: 3 }]
        });

        const deleted = await app.inject({
          method: "DELETE",
          url: "/v1/account",
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { confirmation: "DELETE MY OPSIS ACCOUNT" }
        });
        expect(deleted.statusCode).toBe(204);
        expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
        expect(await prisma.usageEvent.count({ where: { userId } })).toBe(0);
        expect(await prisma.auditLog.count({ where: { userId } })).toBe(0);
        expect(await prisma.auditLog.count({
          where: { metadata: { path: ["emailHash"], equals: sha256(email.toLowerCase()) } }
        })).toBe(0);
        expect(await prisma.cachedApiResponse.count({ where: { cacheKey: sharedCacheKey } })).toBe(1);
        const copiedAccessToken = await app.inject({
          method: "GET",
          url: "/v1/auth/me",
          headers: { authorization: `Bearer ${accessToken}` }
        });
        expect(copiedAccessToken.statusCode).toBe(401);
      } finally {
        await app.close();
        if (userId) {
          await prisma.auditLog.deleteMany({ where: { userId } });
          await prisma.usageEvent.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
        }
        await prisma.auditLog.deleteMany({
          where: { metadata: { path: ["emailHash"], equals: sha256(email.toLowerCase()) } }
        });
        await prisma.cachedApiResponse.deleteMany({ where: { cacheKey: sharedCacheKey } });
      }
    }, 20_000);

    it("rolls back every account row when deletion fails before commit", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const email = `account-rollback-${suffix}@example.com`;
      const app = await buildApp(loadEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl, LOG_LEVEL: "silent" }), prisma);
      let userId = "";
      try {
        const register = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: { email, password: "correct-horse-battery-staple" }
        });
        expect(register.statusCode).toBe(200);
        userId = register.json().user.id as string;
        await prisma.usageEvent.create({ data: { userId, eventType: "CHAIN_LOOKUP", quantity: 1 } });
        await prisma.auditLog.create({ data: { userId, action: "TEST_ROLLBACK_AUDIT" } });
        const before = {
          usageEvents: await prisma.usageEvent.count({ where: { userId } }),
          auditLogs: await prisma.auditLog.count({ where: { userId } })
        };

        await expect(prisma.$transaction(async (tx) => {
          expect(await deletePrismaUserAccount(tx, userId)).toBe(true);
          throw new Error("injected rollback");
        })).rejects.toThrow("injected rollback");

        expect(await prisma.user.findUnique({ where: { id: userId } })).not.toBeNull();
        expect(await prisma.usageEvent.count({ where: { userId } })).toBe(before.usageEvents);
        expect(await prisma.auditLog.count({ where: { userId } })).toBe(before.auditLogs);
      } finally {
        await app.close();
        if (userId) {
          await prisma.auditLog.deleteMany({ where: { userId } });
          await prisma.usageEvent.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
        }
      }
    }, 20_000);

    it("cascades linked usage and audit rows on direct user deletion", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const user = await prisma.user.create({
        data: { email: `account-cascade-${suffix}@example.com`, passwordHash: "test" }
      });
      const usage = await prisma.usageEvent.create({
        data: { userId: user.id, eventType: "CHAIN_LOOKUP", quantity: 1 }
      });
      const audit = await prisma.auditLog.create({
        data: { userId: user.id, action: "TEST_CASCADE_AUDIT" }
      });

      await prisma.user.delete({ where: { id: user.id } });

      expect(await prisma.usageEvent.findUnique({ where: { id: usage.id } })).toBeNull();
      expect(await prisma.auditLog.findUnique({ where: { id: audit.id } })).toBeNull();
    }, 20_000);
  });
}
