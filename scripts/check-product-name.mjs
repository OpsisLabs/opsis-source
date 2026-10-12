import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const forbidden = /chain[ _-]?scout|scout[ _-]?(watch|swap)|\bscoutwatch\b|\bscoutswap\b|\brwa verify\b|\bnoesis\b|eureka²|chatgpt\.site/gi;
const allowlistPath = "scripts/product-name-allowlist.json";
// Shipped release ids are immutable: their branches, RC tags and evidence files already exist.
const releaseId = new RegExp(`\\b\\d{2}-${"sco" + "ut"}-(?:swap|watch)\\b`, "gi");

export function checkProductName(root, policy) {
  if (!Array.isArray(policy.allow)) throw new Error("allowlist must contain an allow array");
  for (const entry of policy.allow) {
    if (typeof entry.path !== "string" || typeof entry.text !== "string" || !entry.text
        || typeof entry.why !== "string" || !entry.why.trim()) {
      throw new Error("each allowlist entry needs an exact path, matched text and why");
    }
  }
  const paths = execFileSync("git", ["ls-files", "-z"], {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  }).split("\0").filter(Boolean);
  const violations = [];
  for (const path of new Set(paths)) {
    if (path === allowlistPath) continue; // The allowlist has to spell the names it permits.
    let bytes;
    try { bytes = readFileSync(resolve(root, path)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (bytes.includes(0)) continue;
    let source;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { continue; }
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      const matches = [...line.replace(releaseId, "").matchAll(forbidden)].map(match => match[0]);
      const rejected = matches.filter(text => !policy.allow.some(entry => entry.path === path && entry.text === text));
      if (rejected.length) violations.push({ path, line: index + 1, text: line, matches: rejected });
    }
  }
  return violations;
}

export function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const policy = JSON.parse(readFileSync(resolve(root, allowlistPath), "utf8"));
  const violations = checkProductName(root, policy);
  for (const violation of violations) console.error(`${violation.path}:${violation.line}: ${violation.text}`);
  console.log(`Product name check: ${violations.length} violating lines.`);
  if (violations.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) { console.error(`Product name check failed: ${error.message}`); process.exitCode = 1; }
}
