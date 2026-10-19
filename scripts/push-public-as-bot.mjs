import { execFileSync } from "node:child_process";
import { sign } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = "OpsisLabs/opsis-source";
const remote = `https://github.com/${repository}.git`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function appJwt(clientId, privateKey, now = Math.floor(Date.now() / 1000)) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(clientId)) throw new Error("configure the App client ID first");
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: clientId, iat: now - 60, exp: now + 540 })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}

export function validateApp(app, installation) {
  if (app.slug !== "opsis-bot" || app.owner?.login !== "OpsisLabs") throw new Error("expected the OpsisLabs-owned opsis-bot App");
  if (installation.app_id !== app.id || installation.account?.login !== "OpsisLabs" || installation.repository_selection !== "selected" || installation.suspended_at) throw new Error("expected an active, selected-repository OpsisLabs installation");
}

export function validateTokenScope(result) {
  if (!result.token || result.repositories?.length !== 1 || result.repositories[0].full_name !== repository || result.repositories[0].private !== false) throw new Error("installation token must be restricted to the public source repository");
  const allowed = { contents: "write", workflows: "write", metadata: "read" };
  if (result.permissions?.contents !== "write" || result.permissions?.workflows !== "write" || Object.entries(result.permissions).some(([key, value]) => allowed[key] !== value)) throw new Error("unexpected installation token permissions");
}

export async function withAppToken(jwt, request, useToken) {
  const app = await request("GET", "/app", jwt);
  const installation = await request("GET", `/repos/${repository}/installation`, jwt);
  validateApp(app, installation);
  const result = await request("POST", `/app/installations/${installation.id}/access_tokens`, jwt, {
    repositories: ["opsis-source"], permissions: { contents: "write", workflows: "write" },
  });
  try {
    validateTokenScope(result);
    return await useToken(result.token);
  } finally {
    if (result.token) await request("DELETE", "/installation/token", result.token);
  }
}

async function request(method, path, token, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // Do not print response bodies, JWTs, private keys or installation tokens.
  if (!response.ok) throw new Error(`GitHub ${method} ${path} returned HTTP ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}

export async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length && args[0] !== "--check")) throw new Error("usage: node scripts/push-public-as-bot.mjs [--check]");
  if (git(["config", "--get", "opsis.repositoryRole"]) !== "public" || git(["branch", "--show-current"]) !== "main" || git(["status", "--porcelain"])) throw new Error("run from a clean guarded public main clone");
  if (git(["remote", "get-url", "--push", "origin"]) !== remote || git(["config", "--get", "opsis.allowedPushUrl"]) !== remote || git(["config", "--get", "core.hooksPath"]) !== ".githooks") throw new Error("public destination or identity hooks are not configured");
  const keyPath = resolve(root, git(["rev-parse", "--git-path", "opsis-bot.private-key.pem"]));
  const keyInfo = lstatSync(keyPath);
  if (!keyInfo.isFile() || (keyInfo.mode & 0o077)) throw new Error("App key must be a private regular file with mode 0600 inside .git");
  const jwt = appJwt(git(["config", "--get", "opsis.appClientId"]), readFileSync(keyPath));
  await withAppToken(jwt, request, async token => {
    const directory = mkdtempSync(join(tmpdir(), "opsis-bot-"));
    const askpass = join(directory, "askpass.sh");
    try {
      writeFileSync(askpass, '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *Password*) printf "%s\\n" "$OPSIS_APP_INSTALLATION_TOKEN" ;;\n  *) exit 1 ;;\nesac\n', { mode: 0o700 });
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_TRACE|^GIT_CURL_VERBOSE$/.test(key)));
      Object.assign(env, { GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0", OPSIS_APP_INSTALLATION_TOKEN: token });
      execFileSync("git", ["-c", "credential.helper=", "-c", "credential.https://github.com.username=x-access-token", "push", ...(args[0] === "--check" ? ["--dry-run"] : []), "origin", "main"], { cwd: root, env, stdio: "inherit" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  console.log(args[0] === "--check" ? "Bot authentication and guarded dry-run passed; token revoked." : "Public push completed as opsis-bot[bot]; token revoked.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Bot publication stopped: ${error.message}`); process.exitCode = 1; });
}
