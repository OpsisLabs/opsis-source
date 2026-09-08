import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function validateIdentity(name, email, policy) {
  if (name !== policy.name || email !== policy.email) throw new Error("unapproved commit identity");
}

export function validateMessage(message, policy) {
  for (const line of message.split(/\r?\n/)) {
    if (/^\s*(?:co-authored-by|signed-off-by|reviewed-by|tested-by|acked-by|reported-by)\s*:/i.test(line)) {
      const attribution = line.slice(line.indexOf(":") + 1).trim();
      if (attribution !== `${policy.name} <${policy.email}>`) throw new Error("unapproved attribution trailer");
    }
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function inspectCommits(revisions, policy) {
  const commits = git(["rev-list", ...revisions]).split("\n").filter(Boolean);
  for (const sha of commits) {
    const [author, email, committer, committerEmail, ...body] = git(["show", "-s", "--format=%an%n%ae%n%cn%n%ce%n%B", sha]).split("\n");
    validateIdentity(author, email, policy);
    validateIdentity(committer, committerEmail, policy);
    validateMessage(body.join("\n"), policy);
    if (/^gpgsig /m.test(git(["cat-file", "commit", sha]))) throw new Error("signed commit requires a separate public identity review");
  }
  return commits.length;
}

export function main(args = process.argv.slice(2)) {
  const policy = JSON.parse(readFileSync("identity-policy.json", "utf8"));
  const [mode, ...rest] = args;
  if (mode === "commit") {
    for (const kind of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
      const match = /^(.*) <([^>]+)> \d+ [+-]\d{4}$/.exec(git(["var", kind]));
      if (!match) throw new Error("cannot resolve commit identity");
      validateIdentity(match[1], match[2], policy);
    }
  } else if (mode === "message") {
    validateMessage(readFileSync(rest[0], "utf8"), policy);
  } else if (mode === "history") {
    console.log(`Identity guard: ${inspectCommits(rest.length ? rest : ["--all"], policy)} commits checked.`);
  } else if (mode === "push") {
    const role = git(["config", "--get", "chainscout.repositoryRole"]);
    const expectedRemote = git(["config", "--get", "chainscout.allowedPushUrl"]);
    if (rest[1] !== expectedRemote) throw new Error("push destination differs from this clone's approved destination");
    if (!["private", "public"].includes(role)) throw new Error("install the identity guard for this clone first");
    for (const line of readFileSync(0, "utf8").trim().split("\n").filter(Boolean)) {
      const [, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      if (/^0+$/.test(localSha)) throw new Error("remote deletion requires separate review");
      if (role === "public") {
        if (remoteRef !== "refs/heads/main") throw new Error("public mirror only accepts its main branch");
        inspectCommits([localSha], policy);
        execFileSync(process.execPath, ["scripts/verify-public-tree.mjs", localSha], { stdio: "inherit" });
      } else {
        inspectCommits(/^0+$/.test(remoteSha) ? [localSha, "--not", `--remotes=${rest[0]}`] : [`${remoteSha}..${localSha}`], policy);
      }
    }
  } else throw new Error("usage: identity-guard.mjs commit | message FILE | history [REVISIONS] | push REMOTE URL");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    console.error(`Identity guard blocked the operation: ${error.message}. Run the documented local identity setup; do not bypass the hook.`);
    process.exitCode = 1;
  }
}
