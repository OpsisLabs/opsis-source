import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(repoRoot, "release-train.json");

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function branchName() {
  return process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git(["branch", "--show-current"]);
}

function baseBranchRef(baseBranch) {
  try {
    git(["rev-parse", "--verify", `refs/heads/${baseBranch}`]);
    return baseBranch;
  } catch {
    const remoteRef = `origin/${baseBranch}`;
    try {
      git(["rev-parse", "--verify", `refs/remotes/${remoteRef}`]);
      return remoteRef;
    } catch {
      fail(`cannot resolve base branch ${baseBranch}`);
    }
  }
}

function fail(message) {
  console.error(`\nrelease-train: ${message}\n`);
  process.exit(1);
}

function validateManifest(manifest) {
  if (!Array.isArray(manifest.releases) || manifest.releases.length === 0) {
    fail("release-train.json must contain releases");
  }

  const ids = new Set();
  const branches = new Set();
  const active = manifest.releases.filter((release) => release.status === "active");

  if (active.length !== 1 || active[0].id !== manifest.activeRelease) {
    fail("exactly one release must be active and match activeRelease");
  }

  manifest.releases.forEach((release, index) => {
    if (release.order !== index + 1) fail(`release ${release.id} has an invalid order`);
    if (ids.has(release.id)) fail(`duplicate release id: ${release.id}`);
    if (branches.has(release.branch)) fail(`duplicate release branch: ${release.branch}`);
    ids.add(release.id);
    branches.add(release.branch);

    if (index < active[0].order - 1 && release.status !== "released") {
      fail(`${release.id} must be released before ${active[0].id} can be active`);
    }
    if (index > active[0].order - 1 && release.status !== "queued") {
      fail(`${release.id} must remain queued until the preceding release ships`);
    }
  });

  return active[0];
}

function releaseRefs() {
  const output = git([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/release",
    "refs/remotes/origin/release",
  ]);
  return output ? output.split("\n") : [];
}

function validateSequence(manifest, { allowMain = true } = {}) {
  const active = validateManifest(manifest);
  const currentBranch = branchName();
  const allowedBranches = allowMain ? [manifest.baseBranch, active.branch] : [active.branch];

  if (!allowedBranches.includes(currentBranch)) {
    fail(`current branch is ${currentBranch || "detached"}; expected ${active.branch}`);
  }

  const futureBranches = manifest.releases
    .filter((release) => release.order > active.order)
    .map((release) => release.branch);
  const premature = releaseRefs().find((ref) =>
    futureBranches.some((branch) => ref === branch || ref === `origin/${branch}`),
  );
  if (premature) fail(`future branch exists before its turn: ${premature}`);

  if (currentBranch === active.branch) {
    try {
      git(["merge-base", "--is-ancestor", baseBranchRef(manifest.baseBranch), "HEAD"]);
    } catch {
      fail(`${active.branch} must descend from ${manifest.baseBranch}`);
    }
  }

  return { active, currentBranch };
}

function printStatus(manifest) {
  const active = validateManifest(manifest);
  console.log(`Active release: ${active.id}`);
  console.log(`Expected branch: ${active.branch}`);
  console.log(`Current branch:  ${branchName() || "detached"}`);
  console.log(`Monthly new-vendor budget: $${manifest.rules.incrementalVendorBudgetUsdPerMonth}`);
  console.log("");
  for (const release of manifest.releases) {
    const marker = release.status === "active" ? ">" : " ";
    console.log(`${marker} ${String(release.order).padStart(2, "0")}  ${release.status.padEnd(8)}  ${release.branch}`);
  }
}

const gateCommands = [
  ["pnpm", ["audit", "--prod", "--audit-level", "high"]],
  ["pnpm", ["lint"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
  ["pnpm", ["build"]],
  ["pnpm", ["test:e2e"]],
];

function runGate(manifest) {
  const { active } = validateSequence(manifest);
  console.log(`\nRunning complete gate for ${active.id}\n`);

  for (const [command, args] of gateCommands) {
    console.log(`\n--- ${command} ${args.join(" ")} ---\n`);
    const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
    if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`);
  }

  console.log(`\nPASS: ${active.id} cleared the local release gate.\n`);
}

function candidate(manifest) {
  const { active } = validateSequence(manifest, { allowMain: false });
  if (git(["status", "--porcelain"])) fail("candidate verification requires a clean working tree");
  runGate(manifest);
  const sha = git(["rev-parse", "HEAD"]);
  const tags = git(["tag", "--list", `${active.tagPrefix}*`]);
  const previousNumbers = tags
    ? tags
        .split("\n")
        .map((tag) => Number(tag.slice(active.tagPrefix.length)))
        .filter((number) => Number.isInteger(number) && number > 0)
    : [];
  const nextNumber = Math.max(0, ...previousNumbers) + 1;
  console.log(`Candidate SHA: ${sha}`);
  console.log(`Suggested immutable tag: ${active.tagPrefix}${nextNumber}`);
  console.log("Tagging, merging, pushing, and changing Railway remain explicit user-approved actions.");
}

function advance(manifest, nextId) {
  const active = validateManifest(manifest);
  const currentBranch = branchName();
  if (currentBranch !== manifest.baseBranch) fail(`advance must run from ${manifest.baseBranch}`);
  if (git(["status", "--porcelain"])) fail("advance requires a clean working tree");

  const currentIndex = manifest.releases.findIndex((release) => release.id === active.id);
  const next = manifest.releases[currentIndex + 1];
  if (!next) fail("the final planned release is already active");
  if (next.id !== nextId) fail(`the only valid next release is ${next.id}`);
  if (releaseRefs().some((ref) => ref === next.branch || ref === `origin/${next.branch}`)) {
    fail(`${next.branch} already exists`);
  }

  const mergedTags = git(["tag", "--merged", manifest.baseBranch, "--list", `${active.tagPrefix}*`]);
  if (!mergedTags) fail(`${active.id} needs an immutable RC tag merged into ${manifest.baseBranch}`);

  git(["switch", "-c", next.branch], { inherit: true });
  active.status = "released";
  next.status = "active";
  manifest.activeRelease = next.id;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nCreated ${next.branch} from ${manifest.baseBranch}.`);
  console.log("release-train.json is updated but not committed. Review it, then commit normally.");
}

const manifest = readManifest();
const [command = "status", argument] = process.argv.slice(2);

switch (command) {
  case "status":
    printStatus(manifest);
    break;
  case "check": {
    const { active } = validateSequence(manifest);
    console.log(`PASS: branch order is valid for ${active.id}`);
    break;
  }
  case "gate":
    runGate(manifest);
    break;
  case "candidate":
    candidate(manifest);
    break;
  case "advance":
    if (!argument) fail("usage: pnpm release:advance <next-release-id>");
    advance(manifest, argument);
    break;
  default:
    fail(`unknown command: ${command}`);
}
