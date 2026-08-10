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
          schemaVersion: "chainscout.account-export.v1",
          profile: { id: userId, email },
          usageEvents: [{ eventType: "CHAIN_LOOKUP", quantity: 1 }]
        });

        const deleted = await app.inject({
          method: "DELETE",
          url: "/v1/account",
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { confirmation: "DELETE MY CHAINSCOUT ACCOUNT" }
        });
        expect(deleted.statusCode).toBe(204);
        expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
        expect(await prisma.usageEvent.count({ where: { userId } })).toBe(0);
        expect(await prisma.auditLog.count({ where: { userId } })).toBe(0);
        expect(await prisma.auditLog.count({
          where: { metadata: { path: ["emailHash"], equals: sha256(email.toLowerCase()) } }
        })).toBe(0);
        expect(await prisma.cachedApiResponse.count({ where: { cacheKey: sharedCacheKey } })).toBe(1);
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

        await expect(prisma.$transaction(async (tx) => {
          expect(await deletePrismaUserAccount(tx, userId)).toBe(true);
          throw new Error("injected rollback");
        })).rejects.toThrow("injected rollback");

        expect(await prisma.user.findUnique({ where: { id: userId } })).not.toBeNull();
        expect(await prisma.usageEvent.count({ where: { userId } })).toBe(1);
        expect(await prisma.auditLog.count({ where: { userId } })).toBe(1);
      } finally {
        await app.close();
        if (userId) {
          await prisma.auditLog.deleteMany({ where: { userId } });
          await prisma.usageEvent.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
        }
      }
    }, 20_000);
  });
}
