// This module is reachable only through the lazy SQL workspace. Never add it to
// a route registry, a prefetch list, a shared barrel or a CDN bundle selector.
import { AsyncDuckDB, VoidLogger } from "@duckdb/duckdb-wasm";
import wasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import workerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { OpenDataError } from "./model";
import { guardQuery } from "./query-guard";
import { executeSql } from "./engine-session";
import type { SqlEngine } from "./runner";
export function createSqlEngine(): SqlEngine {
  const worker = new Worker(workerUrl);
  const db = new AsyncDuckDB(new VoidLogger(), worker);
  let terminated = false;
  return {
    terminate() {
      if (!terminated) {
        terminated = true;
        void db.terminate().catch(() => {});
        worker.terminate();
      }
    },
    async run(inputs, query, cap) {
      // Guard runs before any user query reaches DuckDB, including replay.
      guardQuery(query);
      try {
        await db.instantiate(wasmUrl);
      } catch {
        throw new OpenDataError("unsupported");
      }
      return executeSql(db, inputs, query, cap, () => terminated);
    },
  };
}
