import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import type { Json } from "@rh-chain/shared";
import { OpenDataError, type SqlInput, type TableInfo } from "./model";
import { boundedQuery } from "./query-guard";
export type SqlDatabase = Pick<
  AsyncDuckDB,
  "open" | "connect" | "registerFileBuffer" | "dropFile"
>;
function valueJson(
  value: unknown,
  type?: { toString(): string; scale?: number },
): Json {
  // Arrow represents DuckDB HUGEINT/SUM and DECIMAL as signed 128-bit limbs.
  // Render exact decimal strings rather than byte objects or lossy JS numbers.
  if (value instanceof Uint32Array && type?.scale !== undefined) {
    let integer = 0n;
    for (let i = value.length - 1; i >= 0; i--)
      integer = (integer << 32n) | BigInt(value[i]);
    integer = BigInt.asIntN(value.byteLength * 8, integer);
    const negative = integer < 0n;
    const digits = (negative ? -integer : integer).toString();
    const scale = type.scale;
    const padded = digits.padStart(scale + 1, "0");
    const decimal =
      scale > 0
        ? `${padded.slice(0, -scale)}.${padded.slice(-scale)}`
        : digits + "0".repeat(-scale);
    return (negative ? "-" : "") + decimal;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { float: String(value) };
    return Object.is(value, -0) ? { float: "-0" } : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value))
    return {
      bytes: Array.from(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      ),
    };
  if (Array.isArray(value)) return value.map((v) => valueJson(v));
  // Arrow nested values have several type-specific representations. Refuse
  // unsupported types instead of silently producing a lossy commitment.
  throw new OpenDataError("engineError");
}

export async function executeSql(
  db: SqlDatabase,
  inputs: { dataset: SqlInput; bytes: Uint8Array }[],
  query: string,
  cap: number,
  isTerminated = () => false,
) {
  const sql = boundedQuery(query, cap);
  await db.open({
    maximumThreads: 1,
    allowUnsignedExtensions: false,
    query: { castBigIntToDouble: false, castDecimalToDouble: false },
    opfs: { fileHandling: "manual" },
  });
  const connection = await db.connect();
  try {
    await connection.query(
      "SET autoinstall_known_extensions = false; SET autoload_known_extensions = false; SET memory_limit = '256MB'; SET threads = 1",
    );
    const version = String(
      (await connection.query("SELECT version() AS version")).get(0)?.version,
    );
    const tables: TableInfo[] = [];
    if (inputs.some(({ dataset }) => !("kind" in dataset))) {
      const extension = (
        await connection.query(
          "SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'parquet'",
        )
      ).get(0)?.loaded;
      if (extension !== true) throw new OpenDataError("parquetUnavailable");
    }
    for (const { dataset, bytes } of inputs) {
      if (!/^[a-z][a-z0-9_]{0,62}$/.test(dataset.id))
        throw new OpenDataError("refused");
      const local = "kind" in dataset;
      const fileName = local ? `${dataset.id}.csv` : dataset.fileName;
      if (!/^[a-z][a-z0-9_.-]*$/.test(fileName))
        throw new OpenDataError("refused");
      await db.registerFileBuffer(fileName, bytes.slice());
      try {
        try {
          await connection.query(
            `CREATE TABLE "${dataset.id}" AS SELECT * FROM ${local ? `read_csv('${fileName}', header=true, delim=',', quote='"', escape='"', auto_detect=true, strict_mode=true, ignore_errors=false, null_padding=false, sample_size=-1)` : `read_parquet('${fileName}')`}`,
          );
        } catch {
          throw new OpenDataError(
            local ? "csvError" : "fileError",
            local ? dataset.name : undefined,
          );
        }
        const count = (
          await connection.query(`SELECT count(*) AS n FROM "${dataset.id}"`)
        ).get(0)?.n;
        if (!local && String(count) !== String(dataset.rowCount))
          throw new OpenDataError("fileError");
        const schema = await connection.query(
          `SELECT * FROM "${dataset.id}" LIMIT 0`,
        );
        tables.push({
          name: dataset.id,
          rowCount: String(count),
          columns: schema.schema.fields.map((f) => ({
            name: f.name,
            type: f.type.toString(),
          })),
        });
      } finally {
        await db.dropFile(fileName);
      }
    }
    await connection.query("SET enable_external_access = false");
    const table = await connection.query(sql);
    // Preserve published v1 result commitments; exact decimal display belongs
    // to the new local-file kind.
    const localResult = inputs.every(({ dataset }) => "kind" in dataset);
    const columns = table.schema.fields.map((field) => ({
      name: field.name,
      type: field.type.toString(),
    }));
    // Read by ordinal so duplicate column names cannot erase values.
    const rows: Json[][] = [];
    for (let row = 0; row < Math.min(table.numRows, cap); row++) {
      const cells = columns.map((_, column) =>
        valueJson(
          table.getChildAt(column)?.get(row),
          localResult ? table.schema.fields[column].type : undefined,
        ),
      );
      rows.push(cells);
    }
    return {
      version,
      tables,
      result: { columns, rows, truncated: table.numRows > cap },
    };
  } finally {
    if (!isTerminated()) await connection.close();
  }
}
