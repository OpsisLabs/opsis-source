import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chooseChecks, needsApplicationChecks } from "./public-ci-scope.mjs";

test("artwork and documentation keep the publication-only path", () => {
  assert.equal(needsApplicationChecks(["README.md", "docs/assets/opsis-banner.gif", "scripts/render-readme-banner.mjs", ".opsis-public-mirror.json"]), false);
});
test("code, dependencies, workflow, claims and unknown paths require application checks", () => {
  for (const path of ["apps/web/src/main.tsx", "pnpm-lock.yaml", ".github/workflows/public-verify.yml", "docs/opsis/30-marketing.md", "scripts/identity-guard.mjs", "new-file", "docs/assets-other/file"]) {
    assert.equal(needsApplicationChecks(["README.md", path]), true, path);
  }
});
test("unavailable history and unexpected events fail closed to the full suite", () => {
  for (const base of [undefined, "", "0".repeat(40), "--all", "invalid"]) {
    assert.equal(chooseChecks("push", base, "false", () => []), true);
  }
  const base = "a".repeat(40);
  assert.equal(chooseChecks("push", base, "false", () => { throw new Error("missing object"); }), true);
  assert.equal(chooseChecks("unknown", base, "false", () => []), true);
  assert.equal(chooseChecks("pull_request", base, undefined, () => ["README.md"]), false);
  assert.equal(chooseChecks("push", base, undefined, () => ["apps/api/index.ts"]), true);
});
test("manual runs default to full checks and support an explicit slim run", () => {
  assert.equal(chooseChecks("workflow_dispatch", undefined, undefined), true);
  assert.equal(chooseChecks("workflow_dispatch", undefined, "true"), true);
  assert.equal(chooseChecks("workflow_dispatch", undefined, "false"), false);
});
