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
  for (const path of ["/", "/research", "/check", "/saved", "/quant/", "/opsis-site/index.html", "/opsis-site/scene.js"]) assert.equal((await fetch(base+path)).status,401,path);
  assert.equal((await fetch(base,{headers:{authorization:"Basic d3Jvbmc6d3Jvbmc="}})).status,401);
  const page = await fetch(base,{headers}); assert.equal(page.status,200);
  const html = await page.text(); const script = /src="([^"]+\.js)"/.exec(html)?.[1]; assert(script);
  assert.equal((await fetch(base+script)).status,401,"assets must also require ingress authentication");
  assert.equal((await fetch(base+script,{headers})).status,200);
  assert.equal(page.headers.get("x-frame-options"), "DENY", "app remains unframeable");
  const landing = await fetch(base+"/opsis-site/index.html", {headers});
  assert.equal(landing.status, 200);
  assert.equal(landing.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(landing.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  assert.equal((await fetch(base+"/opsis-site/missing.js", {headers})).status,404);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({channel:"chrome"});
  try {
    const context = await browser.newContext({httpCredentials:{username:"opsis", password}});
    const tab = await context.newPage();
    const errors = [];
    tab.on("pageerror", error => errors.push(error.message));
    await tab.route("**/v1/private/opsis/access", route => route.fulfill({json:{expiresAt:new Date(Date.now()+60000).toISOString(),chainId:4663,research:true,exitCheck:true,watch:true,rwa:false,observedTrades:false,perpExecution:false}}));
    await tab.goto(base);
    await tab.getByLabel("Preview access key").fill("a".repeat(64));
    await tab.getByRole("button",{name:"Open preview",exact:true}).click();
    const film = tab.frameLocator('iframe[title="Opsis overview — interactive chain"]');
    await film.locator('#scanner[data-state="ready"]').waitFor({timeout:15000});
    await film.locator('#public-entity').fill("0x"+"a".repeat(40));
    await film.locator('#public-search button').click();
    await tab.getByRole("button",{name:"Run research",exact:true}).waitFor();
    assert.equal(errors.length,0,errors.join("\n"));
    console.log("PASS: original film renders with production CSP; public-identity handoff opens Research.");
  } finally { await browser.close(); }
  const api = await fetch(base+"/v1/private/opsis/access",{ method:"POST",headers:{authorization:"Preview "+"a".repeat(64),"content-type":"application/json"},body:"{}" });
  assert.equal(api.status,502,"API bearer must reach upstream, not be rejected by Basic auth");
  console.log("PASS: Opsis container requires ingress auth for pages/assets; API bearer remains separate; missing protection fails startup.");
} finally { execFileSync("docker",["stop",id],{stdio:"ignore"}); }
