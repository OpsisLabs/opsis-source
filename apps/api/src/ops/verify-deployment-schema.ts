import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertExactMigrationHistory, type AppliedMigration } from "./schema-state.js";
import { deploymentSchemaRequired } from "./deployment-schema-policy.js";

type ForeignKeyRow = {
  constraint_name: string;
  delete_action: string;
};

const migrationsDirectory = resolve(import.meta.dirname, "../../prisma/migrations");

async function verifyDeploymentSchema(): Promise<void> {
  if (!deploymentSchemaRequired(process.env)) {
    process.stdout.write("[schema-check] Explicit private-only deployment without a database; no database schema to verify\n");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const migrationTable = await prisma.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public."_prisma_migrations"')::text AS table_name
    `;
    if (!migrationTable[0]?.table_name) {
      throw new Error("Prisma migration history is missing; run the reviewed owner-only baseline before deployment");
    }

    const applied = await prisma.$queryRaw<AppliedMigration[]>`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM "_prisma_migrations"
    `;
    const expectedMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const expectedHistory = expectedMigrations.map((migrationName) => {
      const migrationSql = readFileSync(resolve(migrationsDirectory, migrationName, "migration.sql"));
      return { name: migrationName, checksum: createHash("sha256").update(migrationSql).digest("hex") };
    });
    assertExactMigrationHistory(applied, expectedHistory);

    const foreignKeys = await prisma.$queryRaw<ForeignKeyRow[]>`
      SELECT constraint_name, delete_rule AS delete_action
      FROM information_schema.referential_constraints
      WHERE constraint_schema = 'public'
        AND constraint_name IN ('UsageEvent_userId_fkey', 'AuditLog_userId_fkey')
    `;
    const deleteActionByConstraint = new Map(
      foreignKeys.map((row) => [row.constraint_name, row.delete_action.toUpperCase()])
    );
    for (const constraint of ["UsageEvent_userId_fkey", "AuditLog_userId_fkey"]) {
      if (deleteActionByConstraint.get(constraint) !== "CASCADE") {
        throw new Error(`Required account-deletion cascade is missing: ${constraint}`);
      }
    }

    process.stdout.write(
      `[schema-check] ${expectedMigrations.length} reviewed migrations and account-deletion cascades verified\n`
    );
  } finally {
    await prisma.$disconnect();
  }
}

verifyDeploymentSchema().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown schema verification failure";
  process.stderr.write(`[schema-check] ${message}\n`);
  process.exitCode = 1;
});
