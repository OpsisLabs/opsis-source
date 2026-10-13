import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const steps = ["page", "access", "research", "check"];
const mainToken = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

export function loadSettings(env = process.env) {
  let target;
  try { target = new URL(env.OPSIS_LOAD_URL); } catch { throw new Error("OPSIS_LOAD_URL is required and must be an origin"); }
  if (/\s/.test(env.OPSIS_LOAD_URL) || target.username || target.password || target.pathname !== "/" || target.search || target.hash ||
      !/^https?:\/\/[^/?#]+\/?$/.test(env.OPSIS_LOAD_URL) ||
      (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname)))) {
    throw new Error("OPSIS_LOAD_URL must be an HTTPS origin without a path (HTTP loopback is permitted for tests)");
  }
  const selected = (env.OPSIS_LOAD_STEPS ?? steps.join(",")).split(",").map((step) => step.trim());
  if (selected.some((step) => !steps.includes(step)) || new Set(selected).size !== selected.length) {
    throw new Error("OPSIS_LOAD_STEPS must be a nonempty comma-separated subset of page,access,research,check without duplicates");
  }
  const settings = {
    visitors: integer(env, "OPSIS_LOAD_VISITORS", 5, 1, 50),
    seconds: integer(env, "OPSIS_LOAD_SECONDS", 30, 5, 300),
    thinkMs: integer(env, "OPSIS_LOAD_THINK_MS", 500, 0, 10_000),
    steps: steps.filter((step) => selected.includes(step)),
    timeoutMs: integer(env, "OPSIS_LOAD_TIMEOUT_MS", 15_000, 1_000, 60_000)
  };
  if (settings.steps.some((step) => ["research", "check"].includes(step)) && env.OPSIS_LOAD_ACK_COST !== "1") {
    throw new Error("Set OPSIS_LOAD_ACK_COST=1: research and check spend prepaid chain-data units");
  }
  return { target: target.origin, ...settings };
}

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max || env[name]?.trim() === "") {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function assetUrl(html, origin) {
  // Use a script or stylesheet from the shell, never a third-party host.
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    if (/^<link/i.test(tag[0]) && !/\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(tag[0])) continue;
    const reference = tag[0].match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!reference) continue;
    try {
      const url = new URL(reference.replaceAll("&amp;", "&"), origin);
      if (url.origin === origin && !url.username && !url.password) return url;
    } catch { /* Ignore malformed references and try the next shell asset. */ }
  }
  return null;
}

export async function runVisitors(settings) {
  const { target, visitors, seconds, thinkMs, timeoutMs } = settings;
  const started = performance.now();
  const deadline = started + seconds * 1_000;
  const counters = Object.fromEntries([...settings.steps, ...(settings.steps.includes("page") ? ["asset"] : [])]
    .map((step) => [step, { requests: 0, successes: 0, durations: [], refusals: {}, retryAfterSeconds: null }]));
  let reached = 0;
  let visitsStarted = 0;
  let visitsCompleted = 0;
  const pause = async () => {
    const remaining = deadline - performance.now();
    if (remaining > 0 && thinkMs > 0) await new Promise((done) => setTimeout(done, Math.min(thinkMs, remaining)));
  };
  async function request(step, path, payload) {
    const counter = counters[step];
    counter.requests += 1;
    const begin = performance.now();
    let status = 0;
    let code = "NETWORK_ERROR";
    try {
      const response = await fetch(new URL(path, target), {
        method: payload === undefined ? "GET" : "POST",
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "cache-control": "no-cache, no-store",
          ...(payload === undefined ? {} : {
            Origin: target, "x-opsis-csrf": "1", "content-type": "application/json", "sec-fetch-site": "same-origin"
          })
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
      });
      reached += 1;
      status = response.status;
      if (status === 429) {
        const raw = response.headers.get("retry-after");
        const retry = raw === null ? NaN : /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : (Date.parse(raw) - Date.now()) / 1_000;
        if (Number.isFinite(retry) && retry >= 0) {
          counter.retryAfterSeconds = Math.min(counter.retryAfterSeconds ?? Infinity, retry);
        }
      }
      const body = await response.text();
      if (response.ok) {
        counter.successes += 1;
        return { ok: true, body };
      }
      code = "UNKNOWN";
      try {
        const errorCode = JSON.parse(body)?.error?.code;
        if (typeof errorCode === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(errorCode)) code = errorCode;
      } catch { /* Non-JSON refusals retain their HTTP status. */ }
    } catch (error) {
      status = 0;
      code = ["TimeoutError", "AbortError"].includes(error.name) ? "TIMEOUT" : "NETWORK_ERROR";
    } finally {
      counter.durations.push(performance.now() - begin);
    }
    counter.refusals[status] ??= Object.create(null);
    counter.refusals[status][code] = (counter.refusals[status][code] ?? 0) + 1;
    return { ok: false };
  }
  await Promise.all(Array.from({ length: visitors }, async () => {
    while (performance.now() < deadline) {
      visitsStarted += 1;
      let complete = true;
      for (const step of settings.steps) {
        if (performance.now() >= deadline) { complete = false; break; }
        let result;
        if (step === "page") {
          result = await request("page", "/");
          if (result.ok) {
            const asset = assetUrl(result.body, target);
            if (!asset) {
              counters.page.successes -= 1;
              counters.page.refusals[0] ??= {};
              counters.page.refusals[0].ASSET_NOT_FOUND = (counters.page.refusals[0].ASSET_NOT_FOUND ?? 0) + 1;
              complete = false;
              break;
            }
            if (performance.now() >= deadline) { complete = false; break; }
            result = await request("asset", asset);
          }
        } else if (step === "access") result = await request(step, "/v1/private/opsis/access", {});
        else if (step === "research") result = await request(step, "/v1/private/analyze", { entity: mainToken, entityType: "unknown", task: "overview" });
        else result = await request(step, "/v1/private/exit-check/quote", { token: mainToken, amount: "0.1", outputToken: "USDG" });
        if (!result.ok) { complete = false; break; }
        if (step !== settings.steps.at(-1)) await pause();
      }
      if (complete) visitsCompleted += 1;
      await pause();
    }
  }));
  const summary = {
    target, settings: { visitors, seconds, thinkMs, steps: settings.steps, timeoutMs },
    wallTimeMs: Math.round(performance.now() - started), visitsStarted, visitsCompleted,
    steps: Object.fromEntries(Object.entries(counters).map(([step, counter]) => [step, {
      requests: counter.requests, successes: counter.successes,
      latencyMs: Object.fromEntries([["p50", 0.5], ["p95", 0.95], ["p99", 0.99], ["max", 1]]
        .map(([name, fraction]) => [name, counter.durations.length ? Math.round(percentile(counter.durations, fraction)) : null])),
      refusals: counter.refusals, retryAfterSeconds: counter.retryAfterSeconds
    }]))
  };
  return { summary, exitCode: reached > 0 ? 0 : 1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let settings;
  try { settings = loadSettings(); } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
  if (settings) {
    const { summary, exitCode } = await runVisitors(settings);
    console.log(JSON.stringify(summary));
    console.error(`Opsis ${summary.target}: ${summary.visitsCompleted}/${summary.visitsStarted} visits completed in ${summary.wallTimeMs}ms`);
    for (const [step, result] of Object.entries(summary.steps)) {
      console.error(`${step}: ${result.successes}/${result.requests} successes; latency ms ${JSON.stringify(result.latencyMs)}; refusals ${JSON.stringify(result.refusals)}; minimum Retry-After ${result.retryAfterSeconds ?? "none"}s`);
    }
    process.exitCode = exitCode;
  }
}
