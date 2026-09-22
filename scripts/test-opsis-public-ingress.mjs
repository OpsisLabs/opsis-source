// Build the Opsis image with VITE_OPSIS_PUBLIC_ACCESS_ENABLED=true first.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:https";
import { request } from "node:http";
import { execFileSync } from "node:child_process";
const image = process.argv[2] ?? "opsis-public-web:local";
const id = execFileSync("docker", ["run", "--rm", "-d", "-p", "127.0.0.1::80", "-e", "OPSIS_PUBLIC_ACCESS_ENABLED=true", "-e", "API_UPSTREAM_HOST=127.0.0.1", "-e", "API_UPSTREAM_PORT=9", image], {encoding:"utf8"}).trim();
const tlsDir = mkdtempSync(join(tmpdir(), "opsis-ingress-tls-"));
let tlsServer;
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
  // WebKit enforces upgrade-insecure-requests even on loopback. Exercise the
  // actual production CSP through a local TLS terminator, like Railway.
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(tlsDir,"key.pem"), "-out", join(tlsDir,"cert.pem"), "-days", "1", "-subj", "/CN=localhost"], {stdio:"ignore"});
  tlsServer = createServer({key:readFileSync(join(tlsDir,"key.pem")),cert:readFileSync(join(tlsDir,"cert.pem"))}, (incoming,outgoing)=> {
    const upstream=request(base+incoming.url,{method:incoming.method,headers:incoming.headers},response=> {
      outgoing.writeHead(response.statusCode,response.headers); response.pipe(outgoing);
    });
    upstream.on("error",()=>{outgoing.writeHead(502);outgoing.end();});
    incoming.pipe(upstream);
  });
  await new Promise(resolve=>tlsServer.listen(0,"127.0.0.1",resolve));
  const secureBase = `https://127.0.0.1:${tlsServer.address().port}`;
  const {chromium,webkit} = await import("@playwright/test");
  for(const engine of [chromium,webkit]) {
    const browser=await engine.launch(engine===chromium?{channel:"chrome"}:{});
    try {
      const page=await browser.newPage({ignoreHTTPSErrors:true});
      await page.route("**/v1/private/opsis/access",route=> {
        assert.equal(route.request().headers().authorization,undefined);
        return route.fulfill({json:{expiresAt:new Date(Date.now()+60000).toISOString(),chainId:4663,research:true,exitCheck:false,watch:false,rwa:false,observedTrades:false,perpExecution:false}});
      });
      await page.goto(secureBase);
      await page.frameLocator('iframe[title="Opsis overview — interactive chain"]').getByRole("heading",{name:"See the bigger picture."}).waitFor();
      assert.equal(await page.getByLabel("Preview access key").count(),0);
      await page.goto(secureBase+"/lab");
      await page.getByRole("img",{name:/Interactive captured pool map/}).waitFor();
      assert.equal(await page.locator("#opsis-content iframe").count(),0);
      await page.getByRole("button",{name:/Portfolio surface/}).click();
      await page.getByText("2,501 deterministic shock pairs",{exact:false}).waitFor();
      await page.getByRole("button", { name: /Quant research/ }).click();
      const observations = Array.from({length:190},(_,n)=>({date:new Date(Date.UTC(2025,0,n+1)).toISOString().slice(0,10),price:100+n}));
      await page.getByLabel("CSV or JSON file").setInputFiles({name:"test-only.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({schemaVersion:1,instrument:{chainId:4663,address:"0x1111111111111111111111111111111111111111",symbol:"TEST"},quoteCurrency:"USD",clock:"daily_crypto_24_7",provenance:{source:"synthetic container fixture",observedAt:"2025-09-01T00:00:00Z"},synthetic:true,observations}))});
      await page.getByRole("button", { name: "Run local experiment", exact:true }).click();
      await page.getByRole("heading", { name:"4. Results", exact:true }).waitFor();

    } finally { await browser.close(); }
  }
  console.log("PASS: public container opens without either password gate in Chromium and WebKit; CSP preserved.");
} finally {
  if(tlsServer) { tlsServer.closeAllConnections(); await new Promise(resolve=>tlsServer.close(resolve)); }
  rmSync(tlsDir,{recursive:true,force:true});
  execFileSync("docker",["stop",id],{stdio:"ignore"});
}
