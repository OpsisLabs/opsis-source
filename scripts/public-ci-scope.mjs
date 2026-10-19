import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const documentationOnly = new Set([
  "README.md", "LICENSE", ".opsis-public-mirror.json",
  "docs/public-source.md", "docs/dependency-licenses.md",
  "scripts/render-readme-banner.mjs",
]);

export function needsApplicationChecks(paths) {
  return paths.some(path => !documentationOnly.has(path) && !path.startsWith("docs/assets/"));
}

export function chooseChecks(event, base, requested, changedPaths) {
  if (event === "workflow_dispatch") return requested !== "false";
  // Missing or invalid comparison data always selects the full checks.
  if (!["push", "pull_request"].includes(event) || !/^[a-f0-9]{40}$/i.test(base ?? "") || /^0+$/.test(base)) return true;
  try { return needsApplicationChecks(changedPaths(base)); }
  catch { return true; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const full = chooseChecks(process.env.CI_EVENT_NAME, process.env.CI_BASE_SHA, process.env.CI_FULL_CHECKS, base =>
    execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${full}\n`);
  const summary = full
    ? "Application/build/browser checks selected."
    : "Documentation/artwork change: publication checks run; application installation, build and browser suites skipped.";
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
