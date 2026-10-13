import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const sha = "0123456789abcdef0123456789abcdef01234567";
let exposeCloudWrites = false;
let researchStatus = 200;
let researchBody = { entity: { type: "token", facts: { symbol: "WETH", decimals: 18 } } };
const researchRequests = [];
let accessRequests = 0;
let accessStatus = 200;
let manifestSha = sha;
const apiOnlyProbes = [];
const server = createServer(async (request, response) => {
  const path = request.url;
  response.setHeader("Content-Type", "application/json");
  if (path === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<html><head><meta name="build-sha" content="${sha}" /></head></html>`);
  } else if (path === "/healthz") { apiOnlyProbes.push(path); response.end(JSON.stringify({ ok: true, buildSha: sha })); }
  else if (path === "/readyz") response.end(JSON.stringify({ ok: true, deploymentMode: "private-only", cloudWorkspace: "disabled", database: "memory", redis: "up", retention: { status: "disabled" } }));
  else if (["/metrics", "/docs"].includes(path)) { apiOnlyProbes.push(path); response.statusCode = 404; response.end("{}"); }
  else if (path === "/v1/private/opsis/access") {
    accessRequests += 1;
    response.statusCode = accessStatus;
    response.end(JSON.stringify(accessStatus === 200 ? { manifest: { build: manifestSha } } : { error: { code: "RATE_LIMIT_EXCEEDED" } }));
  } else if (path === "/v1/private/analyze") {
    let body = "";
    for await (const chunk of request) body += chunk;
    researchRequests.push({ method: request.method, headers: request.headers, body: JSON.parse(body) });
    response.statusCode = researchStatus;
    response.end(JSON.stringify(researchBody));
  } else if (path.startsWith("/v1/")) {
    response.statusCode = exposeCloudWrites ? 200 : 503;
    response.end(JSON.stringify({ error: { code: "CLOUD_WORKSPACE_UNAVAILABLE" } }));
  } else response.end("{}");
});
await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
try {
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = (scope, api = url) => new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/launch-smoke.mjs")], { env: { ...process.env, OPSIS_WEB_URL: url, OPSIS_API_URL: api, OPSIS_EXPECTED_SHA: sha, OPSIS_LAUNCH_SCOPE: scope }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject); child.once("close", (code) => resolveExit({ code, stdout, stderr }));
  });
  const healthy = await run("private-only");
  assert.equal(healthy.code, 0, healthy.stderr);
  assert.match(healthy.stdout, /PASS main token research WETH 18/);
  assert.equal(researchRequests.length, 1);
  assert.deepEqual(researchRequests[0].body, { entity: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", entityType: "unknown", task: "overview" });
  assert.equal(researchRequests[0].method, "POST");
  assert.equal(researchRequests[0].headers.origin, url);
  assert.equal(researchRequests[0].headers["content-type"], "application/json");
  assert.equal(researchRequests[0].headers["x-opsis-csrf"], "1");
  assert.equal(researchRequests[0].headers["sec-fetch-site"], "same-origin");
  assert.notEqual((await run("cloud")).code, 0);
  assert.equal(researchRequests.length, 1);
  exposeCloudWrites = true;
  assert.notEqual((await run("private-only")).code, 0);
  assert.equal(researchRequests.length, 1);
  exposeCloudWrites = false;
  for (const entity of [
    { type: "contract", facts: { symbol: "WETH", decimals: 18 } },
    { type: "token", facts: { symbol: "USDG", decimals: 18 } },
    { type: "token", facts: { symbol: "WETH", decimals: 6 } },
    { type: "token", facts: { symbol: "WETH", decimals: "18" } },
    { type: "token" }
  ]) {
    researchBody = { entity };
    const before = researchRequests.length;
    const failed = await run("private-only");
    assert.notEqual(failed.code, 0);
    assert.match(failed.stderr, /main token research: expected token WETH with 18 decimals/);
    assert.equal(researchRequests.length, before + 1);
  }
  researchStatus = 503;
  researchBody = { error: { code: "PROVIDER_UNAVAILABLE", message: "provider-response-marker" } };
  const before = researchRequests.length;
  const unavailable = await run("private-only");
  assert.notEqual(unavailable.code, 0);
  assert.match(unavailable.stderr, /main token research: expected 200, received 503/);
  assert.ok(!unavailable.stderr.includes("provider-response-marker"));
  assert.equal(researchRequests.length, before + 1);
  // Through the web host only: the API has no address of its own.
  researchStatus = 200;
  researchBody = { entity: { type: "token", facts: { symbol: "WETH", decimals: 18 } } };
  apiOnlyProbes.length = 0;
  accessRequests = 0;
  const webOnly = await run("private-only", "");
  assert.equal(webOnly.code, 0, webOnly.stderr);
  assert.match(webOnly.stdout, /SKIP health, metrics concealed, API docs concealed: no OPSIS_API_URL/);
  assert.match(webOnly.stdout, /PASS readiness 200/);
  assert.match(webOnly.stdout, new RegExp(`PASS matching web/API build ${sha}`));
  assert.match(webOnly.stdout, /PASS main token research WETH 18/);
  assert.deepEqual(apiOnlyProbes, []);
  assert.equal(accessRequests, 1);
  manifestSha = "f".repeat(40);
  const mismatch = await run("private-only", "");
  assert.notEqual(mismatch.code, 0);
  assert.match(mismatch.stderr, /deployment mismatch/);
  manifestSha = sha;
  accessStatus = 429;
  const refused = await run("private-only", "");
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /access manifest: expected 200, received 429/);
  accessStatus = 200;
  // The cloud scope still needs the API's own address.
  const cloudWithoutApi = await run("cloud", "");
  assert.notEqual(cloudWithoutApi.code, 0);
  assert.match(cloudWithoutApi.stderr, /OPSIS_API_URL is required/);
  console.log("PASS: private launch smoke verifies scope, identity, disabled cloud writes and Auto token recognition, with or without an API address; false-green fixtures rejected.");
} finally { await new Promise(resolveClose => server.close(resolveClose)); }
