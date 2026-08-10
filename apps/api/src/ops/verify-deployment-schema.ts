import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

type ForeignKeyRow = {
  constraint_name: string;
  delete_action: string;
};

const migrationsDirectory = resolve(import.meta.dirname, "../../prisma/migrations");

async function verifyDeploymentSchema(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the deployment schema check");
  }

  const prisma = new PrismaClient();
  try {
    const migrationTable = await prisma.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public."_prisma_migrations"')::text AS table_name
    `;
    if (!migrationTable[0]?.table_name) {
      throw new Error("Prisma migration history is missing; run the reviewed owner-only baseline before deployment");
    }

    const applied = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM "_prisma_migrations"
    `;
    const appliedByName = new Map(applied.map((row) => [row.migration_name, row]));
    const expectedMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migrationName of expectedMigrations) {
      const row = appliedByName.get(migrationName);
      if (!row || !row.finished_at || row.rolled_back_at) {
        throw new Error(`Required migration is not successfully applied: ${migrationName}`);
      }
      const migrationSql = readFileSync(resolve(migrationsDirectory, migrationName, "migration.sql"));
      const expectedChecksum = createHash("sha256").update(migrationSql).digest("hex");
      if (row.checksum !== expectedChecksum) {
        throw new Error(`Applied migration checksum does not match the reviewed file: ${migrationName}`);
      }
    }

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
