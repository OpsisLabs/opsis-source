import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportPublic, selected } from "./export-public.mjs";

const fixture = mkdtempSync(join(tmpdir(), "chainscout-export-test-"));
const source = join(fixture, "source");
const target = join(fixture, "public");
const policy = { prefixes: ["apps/"], files: ["README.md", "public-source-policy.json"], scriptExtension: ".mjs", publicWorkflowTemplate: "template.yml" };
const git = (...args) => execFileSync("git", args, { cwd: source, stdio: "pipe" });
try {
  mkdirSync(join(source, "apps"), { recursive: true });
  writeFileSync(join(source, "public-source-policy.json"), JSON.stringify(policy));
  writeFileSync(join(source, "README.md"), "Public fixture\n");
  writeFileSync(join(source, "apps", "app.ts"), "export const fixture = true;\n");
  writeFileSync(join(source, "template.yml"), "name: Fixture\n");
  writeFileSync(join(source, ".env"), "FAKE_PRIVATE_FIXTURE=never_export_this\n");
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
  git("add", "."); git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  assert.equal(selected("apps/.env.local", policy), false);
  assert.equal(selected("apps/node_modules/private.js", policy), false);
  assert.equal(selected("docs/internal.md", policy), false);
  assert.throws(() => exportPublic(source, join(source, "nested")));
  exportPublic(source, target);
  assert.equal(existsSync(join(target, ".env")), false);
  assert.equal(existsSync(join(target, ".git")), false);
  assert.equal(readFileSync(join(target, "apps", "app.ts"), "utf8"), readFileSync(join(source, "apps", "app.ts"), "utf8"));
  exportPublic(source, target, true);
  writeFileSync(join(target, "README.md"), "changed");
  assert.throws(() => exportPublic(source, target, true));
  exportPublic(source, target);
  writeFileSync(join(source, "README.md"), "dirty source");
  assert.throws(() => exportPublic(source, target));
  git("add", "README.md"); git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-m", "update fixture");
  const occupied = join(fixture, "occupied"); mkdirSync(occupied); writeFileSync(join(occupied, "keep"), "keep");
  assert.throws(() => exportPublic(source, occupied));
  rmSync(join(target, "README.md")); symlinkSync(join(occupied, "keep"), join(target, "README.md"));
  assert.throws(() => exportPublic(source, target));
  assert.equal(readFileSync(join(occupied, "keep"), "utf8"), "keep");
  console.log("Public export tests passed: exclusions, exact copy, dirty source, drift, occupied destination and symlink safety.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
