import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { readinessPasses } from "./readiness-policy.mjs";

const privateReady = { ok: true, deploymentMode: "private-only", cloudWorkspace: "disabled", database: "memory", redis: "up", retention: { status: "disabled" } };
assert.equal(readinessPasses(privateReady, "private-only"), true);
assert.equal(readinessPasses(privateReady), false);
assert.equal(readinessPasses({ ...privateReady, cloudWorkspace: "enabled" }, "private-only"), false);
assert.equal(readinessPasses({ ...privateReady, deploymentMode: undefined }, "private-only"), false);
assert.equal(readinessPasses({ ...privateReady, redis: "unavailable" }, "private-only"), false);
assert.equal(readinessPasses({ ...privateReady, database: "unavailable" }, "private-only"), false);
assert.throws(() => readinessPasses(privateReady, "anything"));

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({
    ok: true,
    database: "up",
    redis: "up",
    retention: { status: "up", lastSuccessAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString() }
  }));
});

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("load fixture did not bind a TCP port");
  const child = spawn(process.execPath, [resolve("scripts/load-smoke.mjs")], {
    env: {
      ...process.env,
      OPSIS_LOAD_URL: `http://127.0.0.1:${address.port}/readyz`,
      OPSIS_LOAD_SECONDS: "5",
      OPSIS_LOAD_CONCURRENCY: "1",
      OPSIS_LOAD_PAUSE_MS: "100",
      OPSIS_LOAD_P95_MS: "10000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const code = await new Promise((resolveExit) => child.once("exit", resolveExit));
  if (code !== 0) throw new Error(`load smoke fixture failed (${code})\n${stdout}\n${stderr}`);
  const summary = JSON.parse(stdout.trim());
  if (summary.failures !== 0 || summary.requests < 1) throw new Error(`unexpected load summary: ${stdout}`);
  console.log(`PASS: launch load fixture completed ${summary.requests} healthy readiness requests.`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
