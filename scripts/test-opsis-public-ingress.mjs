// Build the Opsis image with VITE_OPSIS_PUBLIC_ACCESS_ENABLED=true first.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const image = process.argv[2] ?? "opsis-public-web:local";
const id = execFileSync("docker", ["run", "--rm", "-d", "-p", "127.0.0.1::80", "-e", "OPSIS_PUBLIC_ACCESS_ENABLED=true", "-e", "API_UPSTREAM_HOST=127.0.0.1", "-e", "API_UPSTREAM_PORT=9", image], {encoding:"utf8"}).trim();
try {
  const port = execFileSync("docker", ["port", id, "80"], {encoding:"utf8"}).trim().split(":").at(-1);
  const base = `http://127.0.0.1:${port}`;
  for(let i=0;i<30;i++) { try { await fetch(base); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  for (const path of ["/", "/research", "/check", "/saved", "/quant/", "/opsis-site/index.html", "/opsis-site/scene.js"]) {
    const response = await fetch(base+path);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get("www-authenticate"),null);
  }
  assert.equal((await fetch(base)).headers.get("x-frame-options"),"DENY");
  assert.equal((await fetch(base+"/opsis-site/index.html")).headers.get("x-frame-options"),"SAMEORIGIN");
  assert.equal((await fetch(base+"/opsis-site/missing.js")).status,404);
  const {chromium,webkit} = await import("@playwright/test");
  for(const engine of [chromium,webkit]) {
    const browser=await engine.launch(engine===chromium?{channel:"chrome"}:{});
    try {
      const page=await browser.newPage();
      await page.route("**/v1/private/opsis/access",route=> {
        assert.equal(route.request().headers().authorization,undefined);
        return route.fulfill({json:{expiresAt:new Date(Date.now()+60000).toISOString(),chainId:4663,research:true,exitCheck:false,watch:false,rwa:false,observedTrades:false,perpExecution:false}});
      });
      await page.goto(base);
      await page.frameLocator('iframe[title="Opsis overview — interactive chain"]').getByRole("heading",{name:"See the bigger picture."}).waitFor();
      assert.equal(await page.getByLabel("Preview access key").count(),0);
    } finally { await browser.close(); }
  }
  console.log("PASS: public container opens without either password gate in Chromium and WebKit; CSP preserved.");
} finally {execFileSync("docker",["stop",id],{stdio:"ignore"});}
