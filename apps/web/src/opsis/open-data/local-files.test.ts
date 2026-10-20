import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalFiles, tableNames, validateLocalFiles } from "./local-files";
import { fetchDatasetManifest } from "./data";
import { openDataDatasetsEnabled } from "./availability";
import { hashBytes, makeSqlRun, parseSqlRun } from "./model";
import { startSqlRun } from "./runner";
import { dataset } from "./fixture.test-support";
const csv = "x\n1\n2\n3\n";
const file = (text = csv, name = "sample-data.csv") =>
  ({
    name,
    size: new TextEncoder().encode(text).length,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }) as File;
const result = {
  columns: [{ name: "n", type: "Int64" }],
  rows: [["3"]],
  truncated: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("local CSV files", () => {
  it("bounds the selection before reading a byte", async () => {
    for (const files of [
      [],
      Array(5).fill(file()),
      [{ name: "x.csv", size: 50_000_001 }],
      Array(3).fill({ name: "x.csv", size: 40_000_000 }),
      [file("")],
    ])
      expect(() => validateLocalFiles(files)).toThrow("localLimit");
    expect(() =>
      validateLocalFiles(Array(2).fill({ name: "x.csv", size: 50_000_000 })),
    ).not.toThrow();
    expect(() => validateLocalFiles([file(csv, "sample.parquet")])).toThrow(
      "csvError",
    );
    const arrayBuffer = vi.fn();
    await expect(
      readLocalFiles([
        { name: "x.csv", size: 50_000_001, arrayBuffer } as unknown as File,
      ]),
    ).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("hashes exact bytes with SHA-256 and derives safe deterministic deduplicated tables", async () => {
    expect(await hashBytes(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      tableNames([
        "Sample Data.csv",
        "Sample-Data.CSV",
        "sample_data_2.csv",
        "1.csv",
        "漢字.csv",
        "'; DROP TABLE x--.csv",
      ]),
    ).toEqual([
      "sample_data",
      "sample_data_2",
      "sample_data_2_2",
      "csv_1",
      "csv",
      "drop_table_x",
    ]);
    expect(tableNames(["a".repeat(200) + ".csv"])[0]).toHaveLength(55);
    const [input] = await readLocalFiles([file()]);
    expect(input.sha256).toBe(await hashBytes(new TextEncoder().encode(csv)));
    expect(input.id).toBe("sample_data");
  });
  it("exports strict local kinds and retains published manifest compatibility", async () => {
    const inputs = await readLocalFiles([file()]);
    const run = await makeSqlRun(inputs, "SELECT 1", "v1.4.3", 100, result);
    expect(run.manifest.datasets).toEqual([
      {
        kind: "local",
        name: "sample-data.csv",
        sha256: inputs[0].sha256,
        bytes: csv.length,
      },
    ]);
    expect(parseSqlRun(run.manifest)).toEqual(run.manifest);
    for (const patch of [
      { kind: "remote" },
      { bytes: 50_000_001 },
      { bytes: 0 },
      { extra: true },
      { name: "../x.csv" },
    ])
      expect(() =>
        parseSqlRun({
          ...run.manifest,
          datasets: [{ ...run.manifest.datasets[0], ...patch }],
        }),
      ).toThrow();
    const published = await makeSqlRun(
      [dataset],
      "SELECT 1",
      "v1.4.3",
      100,
      result,
    );
    expect(parseSqlRun(published.manifest)).toEqual(published.manifest);
    expect(() =>
      parseSqlRun({
        ...run.manifest,
        datasets: [...run.manifest.datasets, ...published.manifest.datasets],
      }),
    ).toThrow();
  });
  it("replays the same files without fetch and refuses changed files before creating a worker", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const inputs = await readLocalFiles([file()]);
    const factory = vi.fn(() => ({
      run: async () => ({ version: "v1.4.3", result }),
      terminate: vi.fn(),
    }));
    const run = await startSqlRun(inputs, "SELECT 1", 100, factory).promise;
    await expect(
      startSqlRun(
        await readLocalFiles([file()]),
        "SELECT 1",
        100,
        factory,
        run.manifest,
      ).promise,
    ).resolves.toEqual(run);
    const changed = await readLocalFiles([file("x\n4\n")]);
    expect(() =>
      startSqlRun(changed, "SELECT 1", 100, factory, run.manifest),
    ).toThrow("replayError");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("datasets off never fetches a manifest or a dataset URL, even on replay", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await fetchDatasetManifest(new AbortController().signal)).toBeNull();
    expect(() => startSqlRun([dataset], "SELECT 1", 10, vi.fn())).toThrow();
    vi.stubEnv("VITE_OPEN_DATA_SQL_ENABLED", "true");
    for (const flag of [undefined, "false", "true"]) {
      vi.stubEnv("VITE_OPEN_DATA_DATASETS_ENABLED", flag);
      expect(
        openDataDatasetsEnabled({ openDataSql: true, openDataDatasets: true }),
      ).toBe(flag === "true");
      expect(
        openDataDatasetsEnabled({ openDataSql: true, openDataDatasets: false }),
      ).toBe(false);
    }
    vi.stubEnv("VITE_OPEN_DATA_SQL_ENABLED", "false");
    expect(
      openDataDatasetsEnabled({ openDataSql: true, openDataDatasets: true }),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
