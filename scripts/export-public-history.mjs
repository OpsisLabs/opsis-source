import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicSnapshot } from "./export-public.mjs";
import { validateMessage } from "./identity-guard.mjs";

function git(root, args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...options }).trim();
}

// Only creates a separate unpublished repository. Existing histories are never
// rewritten; incremental synchronization can append descendants without force.
export function exportHistory(root, target, sync = false) {
  root = resolve(root); target = resolve(target);
  if (target === root || target.startsWith(root + sep) || root.startsWith(target + sep) || target === dirname(target)) throw new Error("use a separate dedicated destination");
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("symlink destination refused");
  if (!sync && existsSync(target) && readdirSync(target).length) throw new Error("initial history destination must be empty");
  if (git(root, ["status", "--porcelain"])) throw new Error("source must be clean and committed");
  const tip = git(root, ["rev-parse", "HEAD"]);
  const policy = JSON.parse(git(root, ["show", `${tip}:identity-policy.json`]));
  let ledger = [];
  let oldTip;
  if (sync) {
    if (git(target, ["branch", "--show-current"]) !== "main" || git(target, ["status", "--porcelain"])) throw new Error("public main must be clean before sync");
    if (git(target, ["config", "--get", "chainscout.repositoryRole"]) !== "public") throw new Error("destination is not a guarded public clone");
    verifyHistory(root, target);
    ledger = JSON.parse(readFileSync(resolve(target, ".git/chainscout-history-map.json"), "utf8"));
    git(root, ["merge-base", "--is-ancestor", ledger.at(-1).source, tip]);
    oldTip = git(target, ["rev-parse", "HEAD"]);
  }
  const mapping = new Map(ledger.map(item => [item.source, item.public]));
  const revisions = git(root, ["rev-list", "--reverse", "--topo-order", tip]).split("\n").filter(revision => !mapping.has(revision));
  if (!revisions.length) { console.log("Public history already matches; no commits created."); return; }
  mkdirSync(target, { recursive: true });
  if (!sync) git(target, ["init", "-b", "main"]);
  for (const [key, value] of Object.entries({ "user.name": policy.name, "user.email": policy.email, "user.useConfigOnly": "true", "commit.gpgsign": "false", "core.hooksPath": ".githooks", "chainscout.repositoryRole": "public" })) git(target, ["config", "--local", key, value]);
  const blobs = new Map();
  for (const revision of revisions) {
    const [authorDate, committerDate, parents, ...body] = git(root, ["show", "-s", "--format=%aI%n%cI%n%P%n%B", revision]).split("\n");
    let message = body.join("\n").replace(/^\s*(?:co-authored-by|signed-off-by|reviewed-by|tested-by|acked-by|reported-by)\s*:.*$/gmi, "").trim();
    validateMessage(message, policy);
    const { output, modes, snapshot } = publicSnapshot(root, revision, tip);
    git(target, ["read-tree", "--empty"]);
    const entries = [];
    for (const [path, bytes] of output) {
      const key = createHash("sha256").update(bytes).digest("hex");
      if (!blobs.has(key)) blobs.set(key, git(target, ["hash-object", "-w", "--stdin"], { input: bytes }));
      const oid = blobs.get(key);
      entries.push(`${modes.get(path) === 0o755 ? "100755" : "100644"} ${oid}\t${path}\0`);
    }
    git(target, ["update-index", "-z", "--index-info"], { input: entries.join("") });
    const tree = git(target, ["write-tree"]);
    const publicParents = parents ? parents.split(" ").map(parent => {
      if (!mapping.has(parent)) throw new Error("parent missing from topological export");
      return mapping.get(parent);
    }) : [];
    if (publicParents.length && publicParents.every(parent => git(target, ["show", "-s", "--format=%T", parent]) === tree)) {
      message = `chore: filtered source-history checkpoint\n\nThe original commit changed only material excluded from this public tree.\nIts timestamp and place in the development history are preserved.`;
    }
    const exported = git(target, ["commit-tree", tree, ...publicParents.flatMap(parent => ["-p", parent])], {
      input: message + "\n",
      env: { ...process.env, GIT_AUTHOR_NAME: policy.name, GIT_AUTHOR_EMAIL: policy.email, GIT_COMMITTER_NAME: policy.name, GIT_COMMITTER_EMAIL: policy.email, GIT_AUTHOR_DATE: authorDate, GIT_COMMITTER_DATE: committerDate },
    });
    mapping.set(revision, exported);
    ledger.push({ source: revision, public: exported, authorDate, committerDate, parents, digest: snapshot.sourceTreeDigest });
  }
  git(target, ["update-ref", "refs/heads/main", mapping.get(tip), ...(oldTip ? [oldTip] : [])]);
  if (sync) git(target, ["read-tree", "--reset", "-u", "HEAD"]);
  else git(target, ["checkout-index", "-a"]);
  // The private/public mapping stays in .git and is never part of a public tree.
  writeFileSync(resolve(target, ".git/chainscout-history-map.json"), JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
  verifyHistory(root, target);
  console.log(`Created ${revisions.length} filtered commits with exact original author/committer dates and parent structure. No remote configured or pushed.`);
}

export function verifyHistory(root, target) {
  const ledger = JSON.parse(readFileSync(resolve(target, ".git/chainscout-history-map.json"), "utf8"));
  if (!ledger.length || git(target, ["rev-parse", "HEAD"]) !== ledger.at(-1).public) throw new Error("public HEAD differs from the privately recorded export; preserve unrelated changes");
  const mapping = new Map(ledger.map(item => [item.source, item.public]));
  if (Number(git(target, ["rev-list", "--count", "HEAD"])) !== ledger.length) throw new Error("public commit count differs");
  if (Number(git(root, ["rev-list", "--count", ledger.at(-1).source])) !== ledger.length) throw new Error("source commit count differs");
  for (const item of ledger) {
    const original = git(root, ["show", "-s", "--format=%aI%n%cI%n%P", item.source]).split("\n");
    const published = git(target, ["show", "-s", "--format=%aI%n%cI%n%P", item.public]).split("\n");
    if (original[0] !== published[0] || original[1] !== published[1]) throw new Error("commit dates differ");
    if ((original[2] ?? "").split(" ").filter(Boolean).map(parent => mapping.get(parent)).join(" ") !== (published[2] ?? "")) throw new Error("parent structure differs");
  }
  console.log(`History verified: ${ledger.length} commits, exact dates and topology.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [target, mode] = process.argv.slice(2);
    if (!target || (mode && !["--verify", "--sync"].includes(mode))) throw new Error("usage: export-public-history.mjs /absolute/public-directory [--verify|--sync]");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    if (mode === "--verify") verifyHistory(root, resolve(target)); else exportHistory(root, target, mode === "--sync");
  } catch (error) { console.error(`History publication stopped: ${error.message}`); process.exitCode = 1; }
}
