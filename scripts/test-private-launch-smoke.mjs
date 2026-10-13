import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const sha = "0123456789abcdef0123456789abcdef01234567";
let exposeCloudWrites = false;
let researchStatus = 200;
let researchBody = { entity: { type: "token", facts: { symbol: "WETH", decimals: 18 } } };
const researchRequests = [];
const server = createServer(async (request, response) => {
  const path = request.url;
  response.setHeader("Content-Type", "application/json");
  if (path === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<html><head><meta name="build-sha" content="${sha}" /></head></html>`);
  } else if (path === "/healthz") response.end(JSON.stringify({ ok: true, buildSha: sha }));
  else if (path === "/readyz") response.end(JSON.stringify({ ok: true, deploymentMode: "private-only", cloudWorkspace: "disabled", database: "memory", redis: "up", retention: { status: "disabled" } }));
  else if (["/metrics", "/docs"].includes(path)) { response.statusCode = 404; response.end("{}"); }
  else if (path === "/v1/private/analyze") {
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
  const run = (scope) => new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/launch-smoke.mjs")], { env: { ...process.env, OPSIS_WEB_URL: url, OPSIS_API_URL: url, OPSIS_EXPECTED_SHA: sha, OPSIS_LAUNCH_SCOPE: scope }, stdio: ["ignore", "pipe", "pipe"] });
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
  console.log("PASS: private launch smoke verifies scope, identity, disabled cloud writes and Auto token recognition; false-green fixtures rejected.");
} finally { await new Promise(resolveClose => server.close(resolveClose)); }
