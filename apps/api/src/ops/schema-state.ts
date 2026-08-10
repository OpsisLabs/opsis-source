export type AppliedMigration = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export type ExpectedMigration = {
  name: string;
  checksum: string;
};

export function assertExactMigrationHistory(
  applied: AppliedMigration[],
  expected: ExpectedMigration[]
): void {
  const expectedByName = new Map(expected.map((migration) => [migration.name, migration]));
  const appliedCounts = new Map<string, number>();

  for (const row of applied) {
    appliedCounts.set(row.migration_name, (appliedCounts.get(row.migration_name) ?? 0) + 1);
    if (!expectedByName.has(row.migration_name)) {
      throw new Error(`Migration history contains an unreviewed entry: ${row.migration_name}`);
    }
  }
  for (const [migrationName, count] of appliedCounts) {
    if (count !== 1) {
      throw new Error(`Migration history contains ${count} entries for ${migrationName}`);
    }
  }
  if (applied.length !== expected.length) {
    throw new Error(`Migration history count mismatch: expected ${expected.length}, received ${applied.length}`);
  }

  const appliedByName = new Map(applied.map((row) => [row.migration_name, row]));
  for (const migration of expected) {
    const row = appliedByName.get(migration.name);
    if (!row || !row.finished_at || row.rolled_back_at) {
      throw new Error(`Required migration is not successfully applied: ${migration.name}`);
    }
    if (row.checksum !== migration.checksum) {
      throw new Error(`Applied migration checksum does not match the reviewed file: ${migration.name}`);
    }
  }
}
