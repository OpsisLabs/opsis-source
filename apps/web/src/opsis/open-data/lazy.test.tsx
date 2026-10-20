import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import I18nProvider from "../../i18n/I18nProvider";
import SqlAccess from "./SqlAccess";
import { openDataSqlEnabled } from "./availability";
import {
  assertSqlLazy,
  type SqlChunk,
} from "../../../build/open-data-boundary";
const loaded = vi.hoisted(() => vi.fn());
vi.mock("./SqlWorkspace", () => {
  loaded();
  return { default: () => null };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("SQL lazy boundaries", () => {
  it("has no eager DuckDB imports from entry, Lab or either route registry", () => {
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      expect(file).not.toMatch(/open-data\/engine/);
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of ast.statements) {
        const spec =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : undefined;
        if (!spec || !ts.isStringLiteral(spec)) continue;
        expect(spec.text).not.toContain("@duckdb");
        if (
          !spec.text.startsWith(".") ||
          (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
        )
          continue;
        const base = resolve(dirname(file), spec.text);
        const next = [
          base + ".ts",
          base + ".tsx",
          resolve(base, "index.ts"),
          resolve(base, "index.tsx"),
        ].find(existsSync);
        if (next) visit(next);
      }
    }
    for (const root of [
      "main.tsx",
      "opsis/route-chunks.ts",
      "product/page-imports.ts",
      "opsis/Lab.tsx",
    ])
      visit(resolve("src", root));
    expect(visited.size).toBeGreaterThan(20);
  });
  it("build check rejects transitive eager engine edges from entry and registry chunks", () => {
    const chunk = (
      fileName: string,
      module: string,
      imports: string[] = [],
      isEntry = false,
    ): SqlChunk => ({ fileName, modules: { [module]: {} }, imports, isEntry });
    const engine = chunk("sql.js", "src/opsis/open-data/engine.ts");
    expect(
      assertSqlLazy([chunk("entry.js", "src/main.tsx", [], true), engine]),
    ).toEqual(["entry.js"]);
    expect(() =>
      assertSqlLazy([
        chunk("entry.js", "src/main.tsx", ["bridge.js"], true),
        chunk("bridge.js", "src/bridge.ts", [engine.fileName]),
        engine,
      ]),
    ).toThrow(/eager/);
    for (const registry of ["route-chunks", "page-imports"])
      expect(() =>
        assertSqlLazy([
          chunk("registry.js", `src/${registry}.ts`, [engine.fileName]),
          engine,
        ]),
      ).toThrow(/eager/);
  });
  it.each([undefined, false, true])(
    "missing/off build flag refuses server capability %s without imports, fetches or workers",
    (capability) => {
      vi.stubEnv("VITE_OPEN_DATA_SQL_ENABLED", "false");
      const fetch = vi.fn();
      const worker = vi.fn();
      vi.stubGlobal("fetch", fetch);
      vi.stubGlobal("Worker", worker);
      expect(openDataSqlEnabled({ openDataSql: capability })).toBe(false);
      expect(
        renderToStaticMarkup(
          <I18nProvider>
            <SqlAccess capabilities={{ openDataSql: capability }} />
          </I18nProvider>,
        ),
      ).toBe("");
      expect(fetch).not.toHaveBeenCalled();
      expect(worker).not.toHaveBeenCalled();
      expect(loaded).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, false])(
    "enabled build refuses absent/off server capability %s",
    (capability) => {
      vi.stubEnv("VITE_OPEN_DATA_SQL_ENABLED", "true");
      expect(openDataSqlEnabled({ openDataSql: capability })).toBe(false);
      expect(
        renderToStaticMarkup(
          <I18nProvider>
            <SqlAccess capabilities={{ openDataSql: capability }} />
          </I18nProvider>,
        ),
      ).toBe("");
      expect(loaded).not.toHaveBeenCalled();
      expect(openDataSqlEnabled({ openDataSql: true })).toBe(true);
    },
  );
});
