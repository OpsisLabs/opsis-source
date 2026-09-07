import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const sha = "0123456789abcdef0123456789abcdef01234567";
let exposeCloudWrites = false;
const server = createServer((request, response) => {
  const path = request.url;
  response.setHeader("Content-Type", "application/json");
  if (path === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<html><head><meta name="build-sha" content="${sha}" /></head></html>`);
  } else if (path === "/healthz") response.end(JSON.stringify({ ok: true, buildSha: sha }));
  else if (path === "/readyz") response.end(JSON.stringify({ ok: true, deploymentMode: "private-only", cloudWorkspace: "disabled", database: "memory", redis: "up", retention: { status: "disabled" } }));
  else if (["/metrics", "/docs"].includes(path)) { response.statusCode = 404; response.end("{}"); }
  else if (path.startsWith("/v1/")) {
    response.statusCode = exposeCloudWrites ? 200 : 503;
    response.end(JSON.stringify({ error: { code: "CLOUD_WORKSPACE_UNAVAILABLE" } }));
  } else response.end("{}");
});
await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
try {
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = (scope) => new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/launch-smoke.mjs")], { env: { ...process.env, CHAINSCOUT_WEB_URL: url, CHAINSCOUT_API_URL: url, CHAINSCOUT_EXPECTED_SHA: sha, CHAINSCOUT_LAUNCH_SCOPE: scope }, stdio: "ignore" });
    child.once("error", reject); child.once("exit", resolveExit);
  });
  assert.equal(await run("private-only"), 0);
  assert.notEqual(await run("cloud"), 0);
  exposeCloudWrites = true;
  assert.notEqual(await run("private-only"), 0);
  console.log("PASS: private launch smoke verifies scope, identity and disabled cloud writes; false-green fixtures rejected.");
} finally { await new Promise(resolveClose => server.close(resolveClose)); }
