import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

function fixture(t, parallelPreparation = true) {
  const root = mkdtempSync(join(tmpdir(), "chainscout-release-policy-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  copyFileSync(new URL("./release-train.mjs", import.meta.url), join(root, "scripts/release-train.mjs"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Policy Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  const manifest = { baseBranch: "main", activeRelease: "one", rules: { parallelPreparation }, releases: [
    { id: "one", order: 1, branch: "release/one", status: "active", tagPrefix: "rc/one/" },
    { id: "two", order: 2, branch: "release/two", status: "queued", tagPrefix: "rc/two/" },
    { id: "three", order: 3, branch: "release/three", status: "queued", tagPrefix: "rc/three/" }
  ] };
  writeFileSync(join(root, "release-train.json"), JSON.stringify(manifest));
  git("add", "."); git("commit", "-m", "fixture"); git("branch", "release/one");
  const run = (...args) => spawnSync(process.execPath, ["scripts/release-train.mjs", ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "" }
  });
  return { root, git, run };
}

test("registered branches can be prepared together without advancing or switching", t => {
  const { git, run } = fixture(t);
  assert.equal(run("prepare", "two").status, 0);
  assert.equal(run("prepare", "three").status, 0);
  assert.equal(git("branch", "--show-current"), "main");
  git("switch", "release/two");
  assert.equal(run("check").status, 0);
  assert.notEqual(run("candidate").status, 0);
});
test("legacy policy still rejects early preparation", t => {
  const { git, run } = fixture(t, false);
  assert.notEqual(run("prepare", "two").status, 0);
  git("branch", "release/two");
  assert.notEqual(run("check").status, 0);
});
test("unknown, active, duplicate and dirty preparation fail closed", t => {
  const { root, run } = fixture(t);
  assert.notEqual(run("prepare", "unknown").status, 0);
  assert.notEqual(run("prepare", "one").status, 0);
  assert.equal(run("prepare", "two").status, 0);
  assert.notEqual(run("prepare", "two").status, 0);
  writeFileSync(join(root, "uncommitted.txt"), "test");
  assert.notEqual(run("prepare", "three").status, 0);
});
test("activation requires predecessor tag, refuses skips and preserves prepared work", t => {
  const { root, git, run } = fixture(t);
  assert.equal(run("prepare", "two").status, 0);
  assert.notEqual(run("advance", "two").status, 0);
  git("tag", "rc/one/1");
  assert.notEqual(run("advance", "three").status, 0);
  git("switch", "release/two");
  writeFileSync(join(root, "feature.txt"), "prepared work");
  git("add", "."); git("commit", "-m", "prepare feature");
  const tip = git("rev-parse", "HEAD");
  git("switch", "main");
  assert.equal(run("advance", "two").status, 0);
  assert.equal(git("rev-parse", "HEAD"), tip);
  assert.equal(git("branch", "--show-current"), "release/two");
  assert.equal(run("check").status, 0);
});
test("stale prepared branches cannot activate until main is integrated", t => {
  const { root, git, run } = fixture(t);
  run("prepare", "two");
  writeFileSync(join(root, "main-fix.txt"), "new main fix");
  git("add", "."); git("commit", "-m", "main fix"); git("tag", "rc/one/1");
  const result = run("advance", "two");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /merge current main/);
  assert.equal(git("branch", "--show-current"), "main");
});
