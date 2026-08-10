import { describe, expect, it } from "vitest";
import { assertExactMigrationHistory, type AppliedMigration } from "../src/ops/schema-state.js";

const finishedAt = new Date("2026-08-10T00:00:00.000Z");
const expected = [
  { name: "001_init", checksum: "aaa" },
  { name: "002_privacy", checksum: "bbb" }
];

function applied(name: string, checksum: string): AppliedMigration {
  return { migration_name: name, checksum, finished_at: finishedAt, rolled_back_at: null };
}

describe("deployment migration history", () => {
  it("accepts one successful checksummed row per reviewed migration", () => {
    expect(() => assertExactMigrationHistory([
      applied("001_init", "aaa"),
      applied("002_privacy", "bbb")
    ], expected)).not.toThrow();
  });

  it("rejects missing, unknown, duplicate, modified, and rolled-back rows", () => {
    expect(() => assertExactMigrationHistory([applied("001_init", "aaa")], expected)).toThrow("count mismatch");
    expect(() => assertExactMigrationHistory([
      applied("001_init", "aaa"),
      applied("999_unknown", "zzz")
    ], expected)).toThrow("unreviewed entry");
    expect(() => assertExactMigrationHistory([
      applied("001_init", "aaa"),
      applied("001_init", "aaa")
    ], expected)).toThrow("2 entries");
    expect(() => assertExactMigrationHistory([
      applied("001_init", "changed"),
      applied("002_privacy", "bbb")
    ], expected)).toThrow("checksum");
    expect(() => assertExactMigrationHistory([
      applied("001_init", "aaa"),
      { ...applied("002_privacy", "bbb"), rolled_back_at: finishedAt }
    ], expected)).toThrow("not successfully applied");
  });
});
