import type { Plugin } from "vite";
export type SqlChunk = {
  fileName: string;
  isEntry: boolean;
  imports: string[];
  modules: Record<string, unknown>;
};
const duckModule = (id: string) =>
  /(?:@duckdb|open-data\/engine(?:-session)?\.ts)/.test(id);
/** Inspect emitted static edges, including both retry registries. Dynamic edges
 * remain lazy. This also catches Vite/Rollup chunk placement regressions. */
export function assertSqlLazy(chunks: SqlChunk[]): string[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const roots = chunks.filter(
    (chunk) =>
      chunk.isEntry ||
      Object.keys(chunk.modules).some((id) =>
        /\/(?:route-chunks|page-imports)\.ts(?:\?|$)/.test(id),
      ),
  );
  if (!roots.length) throw new Error("No SQL lazy boundary roots found");
  for (const root of roots) {
    const visited = new Set<string>();
    function visit(name: string) {
      if (visited.has(name)) return;
      visited.add(name);
      const chunk = byName.get(name);
      if (!chunk) return;
      if (Object.keys(chunk.modules).some(duckModule))
        throw new Error(
          "DuckDB entered an eager entry or route-registry dependency",
        );
      chunk.imports.forEach(visit);
    }
    visit(root.fileName);
  }
  return roots.map((root) => root.fileName).sort();
}
export function openDataBoundary(): Plugin {
  return {
    name: "opsis-sql-lazy-boundary",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (item) => item.type === "chunk",
      );
      const roots = assertSqlLazy(chunks);
      if (
        Object.keys(bundle).some((name) =>
          /duckdb-(?:mvp|coi).*\.(?:wasm|js)$/.test(name),
        )
      )
        throw new Error("Only the DuckDB EH assets may ship");
      this.emitFile({
        type: "asset",
        fileName: "open-data-build.json",
        source: JSON.stringify({
          lazy: true,
          checkedRoots: roots,
          engineFiles: Object.keys(bundle)
            .filter((name) => /duckdb-(?:eh|browser-eh)/.test(name))
            .sort(),
        }),
      });
    },
  };
}
