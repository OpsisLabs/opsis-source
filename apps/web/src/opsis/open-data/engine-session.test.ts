import { createRequire } from "node:module";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  createDuckDB,
  VoidLogger,
  NODE_RUNTIME,
} from "@duckdb/duckdb-wasm/blocking";
import { executeSql, type SqlDatabase } from "./engine-session";
import { makeSqlRun, replayMatches } from "./model";
import { readLocalFiles } from "./local-files";
import { dataset } from "./fixture.test-support";
const require = createRequire(import.meta.url);
let db: Awaited<ReturnType<typeof createDuckDB>>;
// The same query/session code as the browser, through an offline blocking Node
// boundary. Browser Worker lifecycle is tested separately; no browser is started.
function adapter(fixture = true): SqlDatabase {
  return {
    open: async (config) => {
      db.open(config);
      if (!fixture) return;
      const conn = db.connect();
      try {
        db.registerFileText(
          "tiny.csv",
          '"amount0","blockNumber"\r\n"9007199254740993123456789","100"\r\n"-42","101"\r\n',
        );
        conn.query(
          "CREATE TABLE example_swaps AS SELECT * FROM read_csv('tiny.csv', header=true, columns={'amount0':'VARCHAR','blockNumber':'UBIGINT'})",
        );
      } finally {
        conn.close();
      }
    },
    connect: async () => {
      const conn = db.connect();
      return {
        query: async (sql: string) => conn.query(sql),
        close: async () => conn.close(),
      } as unknown as Awaited<ReturnType<SqlDatabase["connect"]>>;
    },
    registerFileBuffer: async (name, bytes) =>
      db.registerFileBuffer(name, bytes),
    dropFile: async (name) => {
      db.dropFile(name);
      return null;
    },
  };
}
describe("real offline EH SQL session", () => {
  beforeAll(async () => {
    const wasm = require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm");
    db = await createDuckDB(
      {
        mvp: { mainModule: wasm, mainWorker: "" },
        eh: { mainModule: wasm, mainWorker: "" },
      },
      new VoidLogger(),
      NODE_RUNTIME,
    );
    await db.instantiate();
  });
  afterAll(() => db?.reset());
  it("executes an exact-integer CSV fixture through the real session and replays its result hash", async () => {
    const query =
      "SELECT amount0, blockNumber FROM example_swaps ORDER BY blockNumber; -- exact\n";
    const a = await executeSql(adapter(), [], query, 10_000);
    expect(a.result.rows).toEqual([
      ["9007199254740993123456789", "100"],
      ["-42", "101"],
    ]);
    const b = await executeSql(adapter(), [], query, 10_000);
    const first = await makeSqlRun(
      [dataset],
      query,
      a.version,
      10_000,
      a.result,
    );
    const second = await makeSqlRun(
      [dataset],
      query,
      b.version,
      10_000,
      b.result,
    );
    expect(replayMatches(first.manifest, second.manifest)).toBe(true);
  });
  it("enforces cap + one with deterministic result types and duplicate columns", async () => {
    const { result } = await executeSql(
      adapter(),
      [],
      "SELECT amount0, amount0 FROM example_swaps ORDER BY blockNumber",
      1,
    );
    expect(result.rows).toEqual([
      ["9007199254740993123456789", "9007199254740993123456789"],
    ]);
    expect(result.truncated).toBe(true);
    expect(result.columns.map((c) => c.type)).toEqual(["Utf8", "Utf8"]);
  });
  it("has DuckDB external access and extension auto-loading disabled as a second layer", async () => {
    await executeSql(adapter(), [], "SELECT 1", 10_000);
    const conn = db.connect();
    try {
      expect(
        conn
          .query("SELECT current_setting('enable_external_access') AS enabled")
          .get(0)?.enabled,
      ).toBe(false);
      expect(
        conn
          .query(
            "SELECT current_setting('autoinstall_known_extensions') AS enabled",
          )
          .get(0)?.enabled,
      ).toBe(false);
      expect(
        conn
          .query(
            "SELECT current_setting('autoload_known_extensions') AS enabled",
          )
          .get(0)?.enabled,
      ).toBe(false);
      expect(() =>
        conn.query("SELECT * FROM read_csv('/missing.csv')"),
      ).toThrow(/disabled|permission/i);
    } finally {
      conn.close();
    }
  });
  it("imports local CSV through the real engine, counts rows and exposes columns", async () => {
    const text = "x,label\n1,first\n2,second\n3,third\n";
    const file = {
      name: "sample.csv",
      size: text.length,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    } as File;
    const inputs = await readLocalFiles([file]);
    const actual = await executeSql(
      adapter(false),
      inputs.map((dataset) => ({ dataset, bytes: dataset.buffer })),
      "SELECT count(*), sum(x) FROM sample",
      100,
    );
    expect(actual.result.rows).toEqual([["3", "6"]]);
    expect(actual.tables).toEqual([
      {
        name: "sample",
        rowCount: "3",
        columns: [
          { name: "x", type: "Int64" },
          { name: "label", type: "Utf8" },
        ],
      },
    ]);
    expect(inputs[0].buffer.byteLength).toBe(text.length);
  });
  it("preserves exact signed decimal SUM results without floating-point conversion", async () => {
    const actual = await executeSql(
      adapter(false),
      [],
      "SELECT CAST(-1234.50 AS DECIMAL(18,2)), CAST(9007199254740993123456789 AS HUGEINT), CAST(0.01 AS DECIMAL(5,2))",
      100,
    );
    expect(actual.result.rows).toEqual([
      ["-1234.50", "9007199254740993123456789", "0.01"],
    ]);
  });
  it("refuses malformed CSV per file without skipping bad rows", async () => {
    const text = 'x,label\n1,first\n2,"unterminated\n';
    const file = {
      name: "broken.csv",
      size: text.length,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    } as File;
    const [input] = await readLocalFiles([file]);
    await expect(
      executeSql(
        adapter(false),
        [{ dataset: input, bytes: input.buffer }],
        "SELECT * FROM broken",
        100,
      ),
    ).rejects.toMatchObject({ code: "csvError", fileName: "broken.csv" });
  });
  it("refuses the missing Parquet extension without a download", async () => {
    await expect(
      executeSql(
        adapter(false),
        [{ dataset, bytes: new Uint8Array([1, 2]) }],
        "SELECT * FROM example_swaps",
        10_000,
      ),
    ).rejects.toMatchObject({ code: "parquetUnavailable" });
  });
});
