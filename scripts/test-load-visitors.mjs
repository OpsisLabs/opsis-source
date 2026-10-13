import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSettings, percentile, runVisitors } from "./load-visitors.mjs";

const token = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const base = { OPSIS_LOAD_URL: "https://opsis.example", OPSIS_LOAD_ACK_COST: "1" };
function run(env) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/load-visitors.mjs")], {
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("OPSIS_LOAD_"))), ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => done({ code, stdout, stderr }));
  });
}
async function fixture(handler, action) {
  const server = createServer(handler);
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await action(origin);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}
const quick = { OPSIS_LOAD_SECONDS: "5", OPSIS_LOAD_VISITORS: "1", OPSIS_LOAD_THINK_MS: "20", OPSIS_LOAD_TIMEOUT_MS: "1000" };

test("settings default to a bounded visitor journey and accept boundary values", () => {
  assert.deepEqual(loadSettings(base), { target: base.OPSIS_LOAD_URL, visitors: 5, seconds: 30, thinkMs: 500, steps: ["page", "access", "research", "check"], timeoutMs: 15000 });
  for (const [name, min, max] of [["VISITORS", 1, 50], ["SECONDS", 5, 300], ["THINK_MS", 0, 10000], ["TIMEOUT_MS", 1000, 60000]]) {
    for (const value of [min, max]) assert.doesNotThrow(() => loadSettings({ ...base, [`OPSIS_LOAD_${name}`]: String(value) }));
    for (const value of [min - 1, max + 1, "1.5", "invalid", ""]) assert.throws(() => loadSettings({ ...base, [`OPSIS_LOAD_${name}`]: String(value) }), new RegExp(`OPSIS_LOAD_${name}`));
  }
  for (const url of ["http://localhost:1234", "http://127.0.0.1:1234", "https://opsis.example/"]) assert.doesNotThrow(() => loadSettings({ ...base, OPSIS_LOAD_URL: url }));
  for (const url of [undefined, "", "invalid", "http://opsis.example", "ftp://localhost", "https://opsis.example/path", "https://opsis.example?", "https://opsis.example#", "https://demo-account:sample-password@opsis.example", "https://opsis.example\n"]) assert.throws(() => loadSettings({ ...base, OPSIS_LOAD_URL: url }), /OPSIS_LOAD_URL/);
  for (const value of ["", "page,", "access,access", "unknown"]) assert.throws(() => loadSettings({ ...base, OPSIS_LOAD_STEPS: value }), /OPSIS_LOAD_STEPS/);
  assert.deepEqual(loadSettings({ ...base, OPSIS_LOAD_STEPS: "check, page" }).steps, ["page", "check"]);
});

test("cost acknowledgement is exact and validation sends no requests", async () => {
  for (const steps of ["research", "check", "page,access,research,check"]) {
    for (const ack of [undefined, "0", "true", " 1"]) assert.throws(() => loadSettings({ ...base, OPSIS_LOAD_STEPS: steps, OPSIS_LOAD_ACK_COST: ack }), /prepaid chain-data units/);
  }
  assert.doesNotThrow(() => loadSettings({ ...base, OPSIS_LOAD_ACK_COST: undefined, OPSIS_LOAD_STEPS: "page,access" }));
  let requests = 0;
  await fixture((_request, response) => { requests += 1; response.end("{}"); }, async (origin) => {
    const result = await run({ ...quick, OPSIS_LOAD_URL: origin });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /OPSIS_LOAD_ACK_COST=1/);
    assert.equal(result.stdout, "");
    assert.equal(requests, 0);
  });
});

test("percentiles use nearest rank without mutating the sample", () => {
  const values = Array.from({ length: 100 }, (_, index) => 100 - index);
  for (const [fraction, expected] of [[0.5, 50], [0.95, 95], [0.99, 99], [1, 100]]) assert.equal(percentile(values, fraction), expected);
  assert.equal(values[0], 100);
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([42], 0.99), 42);
});

test("request accounting also handles refusals and partial bodies without a socket", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    await new Promise((done) => setTimeout(done, 2));
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "hidden-response-marker" } }), { status: 429, headers: { "Retry-After": "3" } });
    if (calls === 2) return new Response("not JSON hidden-response-marker", { status: 503 });
    if (calls === 3) return { status: 200, ok: true, headers: new Headers(), text: async () => { throw new DOMException("timed out", "TimeoutError"); } };
    return new Response("{}");
  });
  const { summary, exitCode } = await runVisitors({ ...loadSettings({ ...base, OPSIS_LOAD_STEPS: "access" }), seconds: 0.1, visitors: 1, thinkMs: 0 });
  assert.equal(exitCode, 0);
  assert.equal(summary.steps.access.refusals[429].RATE_LIMITED, 1);
  assert.equal(summary.steps.access.refusals[503].UNKNOWN, 1);
  assert.equal(summary.steps.access.refusals[0].TIMEOUT, 1);
  assert.equal(summary.steps.access.retryAfterSeconds, 3);
  assert.equal(summary.steps.access.requests, calls);
  assert.equal(summary.visitsCompleted, summary.steps.access.successes);
  assert.ok(!JSON.stringify(summary).includes("hidden-response-marker"));
});

test("visits use the web origin, ordered steps, browser headers and exact payloads", async () => {
  const requests = [];
  await fixture(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ path: request.url, method: request.method, headers: request.headers, body });
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end('<script src="https://outside.example/app.js"></script><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js"></script>');
    } else response.end("{}");
  }, async (origin) => {
    const result = await run({ ...base, ...quick, OPSIS_LOAD_URL: origin });
    assert.equal(result.code, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.target, origin);
    assert.equal(summary.settings.visitors, 1);
    assert.ok(summary.visitsCompleted > 0);
    assert.ok(summary.wallTimeMs >= 5000);
    assert.deepEqual(requests.slice(0, 5).map(({ path, method }) => [path, method]), [["/", "GET"], ["/assets/app.css", "GET"], ["/v1/private/opsis/access", "POST"], ["/v1/private/analyze", "POST"], ["/v1/private/exit-check/quote", "POST"]]);
    for (const request of requests) {
      assert.equal(request.headers.host, new URL(origin).host);
      assert.equal(request.headers["cache-control"], "no-cache, no-store");
      if (request.method === "POST") {
        assert.equal(request.headers.origin, origin);
        assert.equal(request.headers["x-opsis-csrf"], "1");
        assert.equal(request.headers["content-type"], "application/json");
        assert.equal(request.headers["sec-fetch-site"], "same-origin");
        const payload = JSON.parse(request.body);
        if (request.path.endsWith("access")) assert.deepEqual(payload, {});
        else if (request.path.endsWith("analyze")) assert.deepEqual(payload, { entity: token, entityType: "unknown", task: "overview" });
        else assert.deepEqual(payload, { token, amount: "0.1", outputToken: "USDG" });
      }
    }
    for (const step of ["page", "asset", "access", "research", "check"]) {
      assert.ok(summary.steps[step].requests > 0);
      assert.equal(summary.steps[step].requests, summary.steps[step].successes);
      assert.deepEqual(summary.steps[step].refusals, {});
    }
  });
});

test("HTTP refusals count status and code, retain the smallest wait and conceal bodies", async () => {
  let count = 0;
  const hidden = "response-body-marker-never-output";
  await fixture((_request, response) => {
    const index = count++ % 4;
    response.statusCode = [429, 429, 503, 403][index];
    if (index < 2) response.setHeader("Retry-After", index === 0 ? "12" : "3");
    response.end(index === 3 ? hidden : JSON.stringify({ error: { code: index < 2 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE", message: hidden }, detail: hidden }));
  }, async (origin) => {
    const result = await run({ ...quick, OPSIS_LOAD_URL: origin, OPSIS_LOAD_STEPS: "access" });
    assert.equal(result.code, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    const access = summary.steps.access;
    assert.equal(access.successes, 0);
    assert.ok(access.refusals[429].RATE_LIMITED > 0);
    assert.ok(access.refusals[503].PROVIDER_UNAVAILABLE > 0);
    assert.ok(access.refusals[403].UNKNOWN > 0);
    assert.equal(Object.values(access.refusals).flatMap(Object.values).reduce((sum, value) => sum + value, 0), access.requests);
    assert.equal(access.retryAfterSeconds, 3);
    assert.equal(summary.visitsCompleted, 0);
    assert.ok(!result.stdout.includes(hidden) && !result.stderr.includes(hidden));
  });
});

test("timeouts are bounded and an entirely unreachable run exits one", async () => {
  await fixture(() => {}, async (origin) => {
    const result = await run({ ...quick, OPSIS_LOAD_URL: origin, OPSIS_LOAD_STEPS: "access" });
    assert.equal(result.code, 1, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.ok(summary.steps.access.refusals[0].TIMEOUT > 0);
    assert.equal(summary.steps.access.successes, 0);
    assert.ok(summary.steps.access.latencyMs.max >= 900);
    assert.ok(summary.wallTimeMs < 7000);
  });
});

test("redirects and missing local assets stop a visit before chain-data work", async () => {
  let redirect = true;
  let followed = 0;
  await fixture((request, response) => {
    if (request.url !== "/") followed += 1;
    if (redirect) { response.writeHead(302, { Location: "/redirected" }); response.end(); }
    else response.end('<script src="https://outside.example/app.js"></script>');
  }, async (origin) => {
    const env = { ...quick, OPSIS_LOAD_URL: origin, OPSIS_LOAD_STEPS: "page,access", OPSIS_LOAD_THINK_MS: "500" };
    const first = await run(env);
    assert.equal(first.code, 1);
    assert.ok(JSON.parse(first.stdout).steps.page.refusals[0].NETWORK_ERROR > 0);
    redirect = false;
    const second = await run(env);
    assert.equal(second.code, 0);
    assert.ok(JSON.parse(second.stdout).steps.page.refusals[0].ASSET_NOT_FOUND > 0);
    assert.equal(JSON.parse(second.stdout).steps.access.requests, 0);
    assert.equal(followed, 0);
  });
});
