const target = requiredUrl("CHAINSCOUT_LOAD_URL");
const durationSeconds = boundedInteger(process.env.CHAINSCOUT_LOAD_SECONDS, 30, 5, 120);
const concurrency = boundedInteger(process.env.CHAINSCOUT_LOAD_CONCURRENCY, 2, 1, 10);
const pauseMs = boundedInteger(process.env.CHAINSCOUT_LOAD_PAUSE_MS, 100, 25, 2_000);
const p95LimitMs = boundedInteger(process.env.CHAINSCOUT_LOAD_P95_MS, 1_500, 50, 10_000);
const deadline = Date.now() + durationSeconds * 1_000;
const durations = [];
let failures = 0;

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(target, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5_000) });
      if (!response.ok) failures += 1;
      const body = await response.json().catch(() => null);
      if (!body || body.ok !== true || body.database !== "up" || body.redis !== "up" || body.retention?.status !== "up") failures += 1;
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - started);
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}));

durations.sort((a, b) => a - b);
const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? Infinity;
console.log(JSON.stringify({ target: target.origin + target.pathname, durationSeconds, concurrency, pauseMs, requests: durations.length, failures, p95Ms: Math.round(p95) }));
if (failures > 0) throw new Error(`load smoke had ${failures} failed requests`);
if (p95 > p95LimitMs) throw new Error(`load smoke p95 ${Math.round(p95)}ms exceeded ${p95LimitMs}ms`);

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error(`${name} must use HTTPS`);
  return url;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`expected an integer from ${min} to ${max}`);
  return parsed;
}
