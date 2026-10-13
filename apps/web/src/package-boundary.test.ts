import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// The web image is built from apps/web and the shared packages only. An import
// that reaches into the API app compiles in the monorepo and breaks that build.
describe("web package boundary", () => {
  it("never imports from the API app's source tree", () => {
    const offenders = sourceFiles(new URL(".", import.meta.url).pathname)
      .filter((path) => /from\s+["'][^"']*\/api\/src\//.test(readFileSync(path, "utf8")) && !path.endsWith("package-boundary.test.ts"));
    expect(offenders).toEqual([]);
  });
});
