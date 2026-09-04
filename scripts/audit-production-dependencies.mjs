import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const baselinePath = join(repoRoot, ".github/security/pnpm-audit-baseline.json");
const lockfilePath = join(repoRoot, "pnpm-lock.yaml");
const networkFailure = /ERR_SOCKET_TIMEOUT|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|ERR_PNPM_[A-Z_]*FETCH/;
const blockingAdvisory = /(?:\bhigh\b|\bcritical\b).*(?:severity|vulnerab)|(?:severity|vulnerab).*(?:\bhigh\b|\bcritical\b)/is;

const attempts = 3;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = spawnSync("pnpm", ["audit", "--prod", "--audit-level", "high"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) process.exit(0);

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error || !networkFailure.test(output) || blockingAdvisory.test(output)) {
    process.exit(result.status ?? 1);
  }
  if (attempt < attempts) {
    console.warn(`Dependency audit attempt ${attempt} failed only at the registry; retrying after a cooldown.`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 15_000));
  }
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const actualLockfileSha = createHash("sha256").update(readFileSync(lockfilePath)).digest("hex");
if (actualLockfileSha !== baseline.lockfileSha256) {
  console.error("Dependency audit is unavailable and pnpm-lock.yaml differs from the audited baseline.");
  process.exit(1);
}

console.warn(
  `WARNING: npm audit was unavailable after ${attempts} network-only failures. `
  + `pnpm-lock.yaml matches the exact baseline audited at ${baseline.workflowRun}; `
  + "current container vulnerability scans remain mandatory."
);
