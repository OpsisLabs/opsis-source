// Run after building apps/web/Dockerfile with VITE_OPSIS_WORKSPACES_ENABLED=true.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
const image = process.argv[2] ?? "opsis-preview-web:local";
const password = "test-only-preview-ingress";
const hash = execFileSync("openssl", ["passwd", "-apr1", "-stdin"], { input: password, encoding: "utf8" }).trim();
const env = ["-e", "API_UPSTREAM_HOST=127.0.0.1", "-e", "API_UPSTREAM_PORT=9"];
const missing = spawnSync("docker", ["run", "--rm", ...env, image], { encoding: "utf8", timeout: 15000 });
assert.notEqual(missing.status, 0, "missing hash must fail closed");
assert.match(missing.stderr, /requires an ingress password hash/);
const id = execFileSync("docker", ["run", "--rm", "-d", "-p", "127.0.0.1::80", ...env, "-e", `OPSIS_INGRESS_PASSWORD_HASH=${hash}`, image], { encoding: "utf8" }).trim();
try {
  const port = execFileSync("docker", ["port", id, "80"], { encoding: "utf8" }).trim().split(":").at(-1);
  const base = `http://127.0.0.1:${port}`;
  const headers = { authorization: `Basic ${Buffer.from(`opsis:${password}`).toString("base64")}` };
  let ready = false;
  for (let i=0; i<30; i++) { try { await fetch(base); ready=true; break; } catch { await new Promise(r => setTimeout(r,100)); } }
  assert(ready, "preview container did not start");
  for (const path of ["/", "/research", "/check", "/saved", "/quant/"]) assert.equal((await fetch(base+path)).status,401,path);
  assert.equal((await fetch(base,{headers:{authorization:"Basic d3Jvbmc6d3Jvbmc="}})).status,401);
  const page = await fetch(base,{headers}); assert.equal(page.status,200);
  const html = await page.text(); const script = /src="([^"]+\.js)"/.exec(html)?.[1]; assert(script);
  assert.equal((await fetch(base+script)).status,401,"assets must also require ingress authentication");
  assert.equal((await fetch(base+script,{headers})).status,200);
  const api = await fetch(base+"/v1/private/opsis/access",{ method:"POST",headers:{authorization:"Preview "+"a".repeat(64),"content-type":"application/json"},body:"{}" });
  assert.equal(api.status,502,"API bearer must reach upstream, not be rejected by Basic auth");
  console.log("PASS: Opsis container requires ingress auth for pages/assets; API bearer remains separate; missing protection fails startup.");
} finally { execFileSync("docker",["stop",id],{stdio:"ignore"}); }
