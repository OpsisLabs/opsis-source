import { describe, expect, it } from "vitest";
import { boundedQuery, guardQuery } from "./query-guard";
describe("SQL guard before worker dispatch", () => {
  it.each([
    "INSTALL",
    "LOAD",
    "ATTACH",
    "COPY",
    "EXPORT",
    "SET",
    "RESET",
    "PRAGMA",
    "CALL",
    "CREATE",
    "ALTER",
    "DROP",
    "INSERT",
    "UPDATE",
    "DELETE",
    "MERGE",
    "IMPORT",
    "EXECUTE",
    "PREPARE",
    "VACUUM",
    "CHECKPOINT",
    "GRANT",
    "REVOKE",
  ])("refuses %s with casing and leading/nested comments", (statement) => {
    for (const command of [
      statement,
      statement.toLowerCase(),
      statement.slice(0, 2).toLowerCase() + statement.slice(2),
    ]) {
      expect(() =>
        guardQuery(
          `/* start /* nested */ end */ -- prefix\n${command} anything`,
        ),
      ).toThrow();
      expect(() =>
        guardQuery(`SELECT 1; /* next */ ${command} anything`),
      ).toThrow();
    }
  });
  it.each([
    "https://example.invalid/data",
    "HTTP://example.invalid/data",
    "s3://bucket/object",
    "file:///tmp/data",
    "../data.parquet",
    "./data",
    "/tmp/data",
    "C:\\data\\file",
    "data.parquet",
    "data.csv",
    "data.duckdb",
    "~/data",
    "\\\\host\\data",
  ])("refuses URL or path %s", (value) => {
    for (const quote of ["'", '"'])
      expect(() =>
        guardQuery(`/* note */ SeLeCt ${quote}${value}${quote}`),
      ).toThrow();
  });
  it.each([
    "SELECT * FROM read_parquet('x')",
    "SELECT * FROM parquet_scan('x')",
    "SELECT * FROM glob('x')",
    "SELECT * FROM query('x')",
    "WITH x AS (DELETE FROM t) SELECT 1",
    "SELECT random()",
    'SELECT "RaNdOm"()',
    'SELECT * FROM "read_parquet"(\'x\')',
    "SELECT gen_random_uuid()",
    "SELECT transaction_timestamp()",
    "SELECT current_timestamp",
    "SELECT $x$/tmp/data$x$",
    "SELECT E'\\x2f'",
    "SELECT 1 /* unclosed",
    "SELECT 'unclosed",
    "SELECT 1; SELECT 2",
    "SELECT 1;;",
    "SELECT `x`",
    "SELECT 1\u0000",
  ])("refuses unsupported SQL %s", (value) =>
    expect(() => guardQuery(value)).toThrow(),
  );
  it.each([
    "SELECT 1",
    "-- note\nSELECT amount0 FROM example_swaps ORDER BY blockNumber, logIndex",
    "WITH x AS (SELECT 1 AS n) SELECT n / 2 FROM x",
    "SELECT 'it''s a ; string', 42::BIGINT; -- end",
    'SELECT "amount0" FROM example_swaps /* nested /* note */ ok */;',
  ])("accepts bounded local read %s", (query) => {
    expect(() => guardQuery(query)).not.toThrow();
    expect(boundedQuery(query, 10_000)).toMatch(/LIMIT 10001$/);
  });
  it("rejects invalid caps and overlong SQL", () => {
    for (const cap of [0, -1, 1.5, 10_001])
      expect(() => boundedQuery("SELECT 1", cap)).toThrow();
    expect(() => guardQuery("SELECT '" + "a".repeat(50_000) + "'")).toThrow();
  });
});
