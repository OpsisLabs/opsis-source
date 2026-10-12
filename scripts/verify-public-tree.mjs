import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const revision = process.argv[2] ?? "HEAD";
if (!/^(?:HEAD|[a-f0-9]{40})$/.test(revision)) throw new Error("expected HEAD or a full commit SHA");
const git = (args, encoding = "utf8") => execFileSync("git", args, { encoding, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const marker = ".opsis-public-mirror.json";
const manifest = JSON.parse(git(["show", `${revision}:${marker}`]));
if (manifest.format !== "opsis.public-source.v1") throw new Error("invalid public-source manifest");
const paths = git(["ls-tree", "-rz", "--name-only", revision]).split("\0").filter(path => path && path !== marker).sort();
if (JSON.stringify(paths) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error("public tree contains missing or unreviewed files");
for (const path of paths) {
  const bytes = git(["show", `${revision}:${path}`], null);
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[path]) throw new Error(`public file differs from reviewed snapshot: ${path}`);
}
console.log(`Public tree: ${paths.length} files match the reviewed manifest.`);
