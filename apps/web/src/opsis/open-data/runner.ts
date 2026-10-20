import { fetchDataset } from "./data";
import {
  OpenDataError,
  TIME_LIMIT_MS,
  makeSqlRun,
  replayMatches,
  inputsMatch,
  verifyDatasetBytes,
  type SqlInput,
  type TableInfo,
  type SqlResult,
  type SqlRunManifest,
} from "./model";
import { validateLocalFiles, tableNames } from "./local-files";
import { guardQuery } from "./query-guard";
export interface SqlEngine {
  run(
    inputs: { dataset: SqlInput; bytes: Uint8Array }[],
    query: string,
    cap: number,
  ): Promise<{ version: string; result: SqlResult; tables?: TableInfo[] }>;
  terminate(): void;
}
/** Owns the actual DuckDB worker, so cancellation cannot orphan an engine. */
export function startSqlRun(
  datasets: SqlInput[],
  query: string,
  cap: number,
  createEngine: () => SqlEngine,
  expected?: SqlRunManifest,
  timeoutMs = TIME_LIMIT_MS,
  datasetsEnabled = false,
) {
  guardQuery(query);
  if (
    (!datasetsEnabled && datasets.some((d) => !("kind" in d))) ||
    !datasets.length ||
    datasets.length > 4 ||
    new Set(datasets.map((d) => d.id)).size !== datasets.length ||
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > 10_000
  )
    throw new OpenDataError("refused");
  if (
    expected &&
    (expected.query !== query ||
      expected.resultLimit !== cap ||
      !inputsMatch(expected.datasets, datasets))
  )
    throw new OpenDataError("replayError");
  const locals = datasets.filter((d) => "kind" in d);
  if (locals.length) {
    if (locals.length !== datasets.length) throw new OpenDataError("refused");
    validateLocalFiles(locals.map((d) => ({ name: d.name, size: d.bytes })));
    const ids = tableNames(locals.map((d) => d.name));
    if (
      locals.some((d, i) => d.id !== ids[i] || d.buffer.byteLength !== d.bytes)
    )
      throw new OpenDataError("refused");
  }
  const abort = new AbortController();
  let engine: SqlEngine | undefined;
  let stopped = false;
  let rejectStop: (error: OpenDataError) => void = () => {};
  const stopPromise = new Promise<never>((_, reject) => {
    rejectStop = reject;
  });
  const stop = (code: "cancelled" | "timeout") => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    engine?.terminate();
    rejectStop(new OpenDataError(code));
  };
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  const task = async () => {
    const inputs = [];
    // Local bytes stay in memory. Published fetches require the separate gate.
    for (const dataset of datasets) {
      const bytes =
        "kind" in dataset
          ? dataset.buffer
          : await fetchDataset(dataset, abort.signal);
      await verifyDatasetBytes(bytes, dataset.sha256);
      if (stopped) throw new OpenDataError("cancelled");
      inputs.push({ dataset, bytes });
    }
    engine = createEngine();
    const { version, result, tables } = await engine.run(inputs, query, cap);
    if (stopped) throw new OpenDataError("cancelled");
    const run = await makeSqlRun(datasets, query, version, cap, result);
    if (expected && !replayMatches(expected, run.manifest))
      throw new OpenDataError("replayError");
    return { ...run, ...(tables ? { tables } : {}) };
  };
  const promise = Promise.race([task(), stopPromise]).finally(() => {
    stopped = true;
    clearTimeout(timer);
    abort.abort();
    engine?.terminate();
  });
  return { promise, cancel: () => stop("cancelled") };
}
