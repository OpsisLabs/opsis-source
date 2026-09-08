import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function selected(path, policy) {
  if (path.split("/").some(part => [".git", "node_modules", "dist", "output", "test-results"].includes(part))) return false;
  if (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example") return false;
  return policy.files.includes(path) || policy.prefixes.some(prefix => path.startsWith(prefix)) || (path.startsWith("scripts/") && path.endsWith(policy.scriptExtension));
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd: root, encoding, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function exportPublic(root, target, check = false) {
  root = resolve(root); target = resolve(target);
  if (target === root || target.startsWith(root + sep) || root.startsWith(target + sep) || target === dirname(target)) throw new Error("destination must be a separate dedicated directory, not an ancestor or child of the private repo");
  if (git(root, ["status", "--porcelain"]).trim()) throw new Error("commit and review the private working tree before exporting");
  const policy = JSON.parse(git(root, ["show", "HEAD:public-source-policy.json"]));
  const marker = resolve(target, ".chainscout-public-mirror.json");
  let previous = [];
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) throw new Error("symlink destination refused");
    if (!existsSync(marker) && readdirSync(target).length) throw new Error("nonempty destination has no public-mirror marker");
    if (existsSync(marker)) {
      const manifest = JSON.parse(readFileSync(marker, "utf8"));
      if (manifest.format !== "chainscout.public-source.v1") throw new Error("invalid mirror marker");
      previous = Object.keys(manifest.files);
    }
    if (existsSync(resolve(target, ".git"))) {
      if (git(target, ["branch", "--show-current"]).trim() !== "main") throw new Error("public clone must be on main");
      if (!check && git(target, ["status", "--porcelain"]).trim()) throw new Error("public clone has local changes; preserve or commit them before syncing");
    }
  }
  const entries = git(root, ["ls-tree", "-rz", "--full-tree", "HEAD"]).split("\0").filter(Boolean);
  const output = new Map();
  const modes = new Map();
  for (const entry of entries) {
    const [header, path] = entry.split("\t");
    if (!selected(path, policy)) continue;
    const [mode, kind, oid] = header.split(" ");
    if (kind !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`unsupported public file type: ${path}`);
    output.set(path, git(root, ["cat-file", "blob", oid], null));
    modes.set(path, mode === "100755" ? 0o755 : 0o644);
  }
  output.set(".github/workflows/public-verify.yml", Buffer.from(git(root, ["show", `HEAD:${policy.publicWorkflowTemplate}`])));
  if (policy.publicClaimsTemplate) output.set("docs/marketing-sourcebook.md", Buffer.from(git(root, ["show", `HEAD:${policy.publicClaimsTemplate}`])));
  const hashes = Object.fromEntries([...output].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, digest(bytes)]));
  // No private commit SHA, author, machine path or repository URL in the marker.
  const snapshot = { format: "chainscout.public-source.v1", sourceTreeDigest: digest(JSON.stringify(hashes)), files: hashes };
  output.set(".chainscout-public-mirror.json", Buffer.from(JSON.stringify(snapshot, null, 2) + "\n"));
  const safePath = (path) => {
    if (isAbsolute(path) || path.split("/").some(part => ["..", ".git", ""].includes(part))) throw new Error("unsafe managed path");
    const full = resolve(target, path);
    if (!relative(target, full) || !full.startsWith(target + sep)) throw new Error("path escaped mirror");
    for (let cursor = full; cursor !== target; cursor = dirname(cursor)) {
      if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink in destination: ${path}`);
    }
    return full;
  };
  const changed = [];
  for (const [path, bytes] of output) {
    const full = safePath(path);
    if (!existsSync(full) || !readFileSync(full).equals(bytes)) changed.push(path);
  }
  const removed = previous.filter(path => !output.has(path));
  // Preflight all paths before doing any writes or removing obsolete managed files.
  for (const path of [...output.keys(), ...removed]) safePath(path);
  if (!check) {
    for (const [path, bytes] of output) {
      const full = safePath(path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, bytes);
      chmodSync(full, modes.get(path) ?? 0o644);
    }
    for (const path of removed) if (existsSync(safePath(path))) unlinkSync(safePath(path));
  }
  if (check && (changed.length || removed.length)) throw new Error(`mirror differs: ${changed.length} changed/missing and ${removed.length} obsolete files`);
  console.log(`${check ? "Verified" : "Exported"} ${hashes ? Object.keys(hashes).length : 0} reviewed files; source digest ${snapshot.sourceTreeDigest}. No Git history copied.`);
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [target, flag] = process.argv.slice(2);
  try {
    if (!target || (flag && flag !== "--check")) throw new Error("usage: node scripts/export-public.mjs /absolute/public-clone [--check]");
    exportPublic(resolve(dirname(fileURLToPath(import.meta.url)), ".."), target, flag === "--check");
  } catch (error) { console.error(`Public export stopped: ${error.message}`); process.exitCode = 1; }
}
