import { strict as assert } from "node:assert";
import { validateIdentity, validateMessage } from "./identity-guard.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const policy = { name: "Opsis", email: "source@opsis.invalid" };
validateIdentity(policy.name, policy.email, policy);
assert.throws(() => validateIdentity("Personal account", policy.email, policy));
assert.throws(() => validateIdentity(policy.name, "personal@example.test", policy));
validateMessage("fix: preserve encrypted records", policy);
validateMessage(`fix: records\n\nCo-authored-by: ${policy.name} <${policy.email}>`, policy);
for (const trailer of ["Co-authored-by", "Signed-off-by", "Reviewed-by", "Tested-by", "Acked-by", "Reported-by"]) {
  assert.throws(() => validateMessage(`fix: records\n\n${trailer}: Personal account <personal@example.test>`, policy));
}
console.log("Identity policy tests passed (author/email and six attribution trailer types).");

for (const role of ["private", "public"]) {
  test(`${role} push checks unpublished commits and preserves remote history`, () => {
    const root = mkdtempSync(join(tmpdir(), "opsis-identity-test-"));
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
    const commit = (name, email) => {
      git("add", ".");
      git("-c", `user.name=${name}`, "-c", `user.email=${email}`, "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "fixture checkpoint");
      return git("rev-parse", "HEAD");
    };
    const push = (sha, remoteSha, ref = "refs/heads/main", url = "https://opsis.example/source.git") => spawnSync(process.execPath,
      [fileURLToPath(new URL("./identity-guard.mjs", import.meta.url)), "push", "origin", url], {
        cwd: root, encoding: "utf8", input: `refs/heads/main ${sha} ${ref} ${remoteSha}\n`,
      });
    try {
      git("init", "--quiet", "-b", "main");
      git("config", "opsis.repositoryRole", role);
      git("config", "opsis.allowedPushUrl", "https://opsis.example/source.git");
      writeFileSync(join(root, "identity-policy.json"), JSON.stringify(policy));
      mkdirSync(join(root, "scripts"));
      copyFileSync(new URL("./verify-public-tree.mjs", import.meta.url), join(root, "scripts/verify-public-tree.mjs"));
      // Public pushes still verify the whole tree, including old remote commits.
      const files = Object.fromEntries([
        ["identity-policy.json", JSON.stringify(policy)],
        ["scripts/verify-public-tree.mjs", readFileSync(join(root, "scripts/verify-public-tree.mjs"))],
      ].map(([path, text]) => [path, createHash("sha256").update(text).digest("hex")]));
      writeFileSync(join(root, ".opsis-public-mirror.json"), JSON.stringify({ format: "opsis.public-source.v1", files }));
      const old = commit("Legacy project", "legacy@sample.invalid");
      git("update-ref", "refs/remotes/origin/main", old);
      const publishedElsewhere = commit("Legacy project", "legacy@sample.invalid");
      git("update-ref", "refs/remotes/secondary/reviewed", publishedElsewhere);
      const approved = commit(policy.name, policy.email);
      for (const remoteSha of [old, "0".repeat(40)]) {
        const result = push(approved, remoteSha);
        assert.equal(result.status, 0, result.stderr);
      }
      assert.notEqual(push(approved, old, "refs/heads/main", "https://opsis.example/wrong.git").status, 0);
      assert.notEqual(push("0".repeat(40), old).status, 0);
      if (role === "public") assert.notEqual(push(approved, old, "refs/heads/feature").status, 0);
      const unapproved = commit("Unapproved fixture", "unapproved@sample.invalid");
      const rejected = push(unapproved, old);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /unapproved commit identity/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
