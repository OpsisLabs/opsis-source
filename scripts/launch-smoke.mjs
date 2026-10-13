import { readinessPasses } from "./readiness-policy.mjs";
const scope = process.env.OPSIS_LAUNCH_SCOPE ?? "cloud";
const webBase = requiredUrl("OPSIS_WEB_URL");
// A private-only deployment may keep its API off the public internet and serve
// it only through the web host. Without an API address the checks that need
// the API's own origin are skipped by name, never passed silently.
const apiBase = scope === "private-only" && !process.env.OPSIS_API_URL ? null : requiredUrl("OPSIS_API_URL");
const expectedSha = process.env.OPSIS_EXPECTED_SHA?.trim();
const timeoutMs = boundedInteger(process.env.OPSIS_SMOKE_TIMEOUT_MS, 15_000, 1_000, 60_000);

const checks = [
  ["web home", new URL("/", webBase), 200],
  ["privacy", new URL("/privacy", webBase), 200],
  ["terms", new URL("/terms", webBase), 200],
  ...(apiBase ? [
    ["health", new URL("/healthz", apiBase), 200],
    ["readiness", new URL("/readyz", apiBase), 200],
    ["metrics concealed", new URL("/metrics", apiBase), 404],
    ["API docs concealed", new URL("/docs", apiBase), 404],
  ] : [
    ["readiness", new URL("/readyz", webBase), 200],
  ]),
];
if (!apiBase) console.log("SKIP health, metrics concealed, API docs concealed: no OPSIS_API_URL (API reached through the web host only)");

let health;
let webSha;
for (const [label, url, status] of checks) {
  const response = await fetchBounded(url);
  if (response.status !== status) throw new Error(`${label}: expected ${status}, received ${response.status}`);
  if (label === "web home") {
    const html = await response.text();
    webSha = html.match(/<meta\s+name=["']build-sha["']\s+content=["']([0-9a-f]{40})["']/i)?.[1];
    if (!webSha) throw new Error("web home: full build SHA marker is missing");
  }
  if (label === "health") health = await response.json();
  if (label === "readiness") {
    const ready = await response.json();
    if (!readinessPasses(ready, scope)) throw new Error(`readiness: ${scope} deployment dependencies or cloud boundary failed`);
  }
  console.log(`PASS ${label} ${status}`);
}
// Through the web host the API reports its build in the access manifest.
const apiSha = apiBase ? health?.buildSha : await manifestBuild();
if (!apiSha || apiSha !== webSha) {
  throw new Error(`deployment mismatch: web=${webSha ?? "none"}, api=${apiSha ?? "none"}`);
}
console.log(`PASS matching web/API build ${webSha}`);
if (expectedSha && apiSha !== expectedSha) {
  throw new Error(`health: expected build ${expectedSha}, received ${apiSha ?? "none"}`);
}
if (expectedSha) console.log(`PASS exact build ${expectedSha}`);
if (scope === "private-only") {
  for (const path of ["/v1/auth/wallet/nonce", "/v1/chat/sessions"]) {
    const response = await fetch(new URL(path, webBase), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", "x-opsis-csrf": "1", Origin: webBase.origin }, body: "{}"
    });
    const body = await response.json();
    if (response.status !== 503 || body.error?.code !== "CLOUD_WORKSPACE_UNAVAILABLE") throw new Error(`private-only boundary failed: ${path}`);
    console.log(`PASS cloud writes disabled ${path}`);
  }
  const response = await fetch(new URL("/v1/private/analyze", webBase), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", "x-opsis-csrf": "1", Origin: webBase.origin, "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ entity: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", entityType: "unknown", task: "overview" })
  });
  if (response.status !== 200) throw new Error(`main token research: expected 200, received ${response.status}`);
  const body = await response.json();
  if (body.entity?.type !== "token" || body.entity?.facts?.symbol !== "WETH" || body.entity?.facts?.decimals !== 18) {
    throw new Error("main token research: expected token WETH with 18 decimals");
  }
  console.log("PASS main token research WETH 18");
}

async function manifestBuild() {
  const response = await fetch(new URL("/v1/private/opsis/access", webBase), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", "x-opsis-csrf": "1", Origin: webBase.origin, "sec-fetch-site": "same-origin" }, body: "{}"
  });
  if (response.status !== 200) throw new Error(`access manifest: expected 200, received ${response.status}`);
  const build = (await response.json())?.manifest?.build;
  return typeof build === "string" && /^[0-9a-f]{40}$/i.test(build) ? build : undefined;
}

async function fetchBounded(url) {
  return fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json,text/html" } });
}

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error(`${name} must use HTTPS`);
  return url;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("invalid smoke timeout");
  return parsed;
}
