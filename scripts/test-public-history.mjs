import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportHistory, verifyHistory } from "./export-public-history.mjs";

const fixture = mkdtempSync(join(tmpdir(), "chainscout-history-test-"));
const source = join(fixture, "source");
const target = join(fixture, "public");
const git = (...args) => execFileSync("git", args, { cwd: source, encoding: "utf8", stdio: "pipe" }).trim();
const commit = (message, date) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-m", message], {
  cwd: source, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture Person", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "Fixture Person", GIT_COMMITTER_EMAIL: "fixture@example.test", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
});
try {
  mkdirSync(source);
  writeFileSync(join(source, "public-source-policy.json"), JSON.stringify({ files: ["README.md", "identity-policy.json"], prefixes: [], scriptExtension: ".mjs" }));
  writeFileSync(join(source, "identity-policy.json"), JSON.stringify({ name: "ChainScout", email: "source@chainscout.invalid" }));
  writeFileSync(join(source, "README.md"), "Reviewed source\n");
  git("init", "-b", "main");
  git("config", "user.name", "Fixture Person"); git("config", "user.email", "fixture@example.test");
  git("add", "."); commit("initial source", "2020-01-02T03:04:05-05:00");
  const initial = git("rev-parse", "HEAD");
  writeFileSync(join(source, "internal.txt"), "Private fixture excluded\n");
  git("add", "."); commit("internal update", "2020-01-03T03:04:05+02:00");
  git("switch", "-c", "side", initial);
  writeFileSync(join(source, "README.md"), "Reviewed source update\n");
  git("add", "."); commit("public update", "2020-01-04T03:04:05-05:00");
  const side = git("rev-parse", "HEAD");
  git("switch", "main");
  git("merge", "--no-commit", "--no-ff", side); commit("merge source", "2020-01-05T03:04:05-05:00");
  exportHistory(source, target);
  const publicGit = (...args) => execFileSync("git", args, { cwd: target, encoding: "utf8" }).trim();
  assert.equal(publicGit("rev-list", "--count", "HEAD"), "4");
  assert.equal(publicGit("show", "-s", "--format=%P", "HEAD").split(" ").length, 2);
  assert.equal(publicGit("log", "--format=%an <%ae>").split("\n").every(value => value === "ChainScout <source@chainscout.invalid>"), true);
  assert.equal(publicGit("log", "--format=%s").includes("filtered source-history checkpoint"), true);
  assert.equal(publicGit("ls-tree", "-r", "--name-only", "HEAD").includes("internal.txt"), false);
  assert.equal(readFileSync(join(target, "README.md"), "utf8"), "Reviewed source update\n");
  assert.throws(() => exportHistory(source, target));
  const firstPublicTip = publicGit("rev-parse", "HEAD");
  writeFileSync(join(source, "README.md"), "Appended source\n");
  git("add", "."); commit("append real change", "2020-01-06T03:04:05-05:00");
  exportHistory(source, target, true);
  assert.equal(publicGit("rev-list", "--count", "HEAD"), "5");
  assert.equal(publicGit("rev-parse", "HEAD^"), firstPublicTip);
  assert.equal(readFileSync(join(target, "README.md"), "utf8"), "Appended source\n");
  exportHistory(source, target, true);
  assert.equal(publicGit("rev-list", "--count", "HEAD"), "5");
  const ledgerPath = join(target, ".git/chainscout-history-map.json");
  const ledger = JSON.parse(readFileSync(ledgerPath));
  ledger[0].public = ledger[1].public;
  writeFileSync(ledgerPath, JSON.stringify(ledger));
  assert.throws(() => verifyHistory(source, target));
  console.log("History tests passed: exact dates, merge topology, count, empty checkpoints, project identity, source fidelity and occupied-destination guard.");
} finally { rmSync(fixture, { recursive: true, force: true }); }
