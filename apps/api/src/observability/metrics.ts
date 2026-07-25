import type { FastifyInstance, FastifyRequest } from "fastify";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

type RuntimeMetrics = {
  providerCalls: Counter<"provider" | "outcome" | "error_code">;
  providerDuration: Histogram<"provider">;
  aiCalls: Counter<"outcome">;
  aiDuration: Histogram<never>;
  cacheOperations: Counter<"outcome">;
  rateLimitDenials: Counter<"route">;
  authEvents: Counter<"event">;
};

let activeMetrics: RuntimeMetrics | undefined;

export async function installMetrics(app: FastifyInstance): Promise<void> {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "rh_chain_" });
  const requests = new Counter({
    name: "rh_chain_http_requests_total",
    help: "Completed HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [registry]
  });
  const duration = new Histogram({
    name: "rh_chain_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry]
  });
  const providerCalls = new Counter({
    name: "rh_chain_provider_calls_total",
    help: "Chain provider calls",
    labelNames: ["provider", "outcome", "error_code"],
    registers: [registry]
  });
  const providerDuration = new Histogram({
    name: "rh_chain_provider_call_duration_seconds",
    help: "Chain provider call duration",
    labelNames: ["provider"],
    registers: [registry]
  });
  const aiCalls = new Counter({
    name: "rh_chain_ai_calls_total",
    help: "AI provider calls",
    labelNames: ["outcome"],
    registers: [registry]
  });
  const aiDuration = new Histogram({
    name: "rh_chain_ai_call_duration_seconds",
    help: "AI provider call duration",
    registers: [registry]
  });
  const cacheOperations = new Counter({
    name: "rh_chain_cache_operations_total",
    help: "Cache hits and misses",
    labelNames: ["outcome"],
    registers: [registry]
  });
  const rateLimitDenials = new Counter({
    name: "rh_chain_rate_limit_denials_total",
    help: "Denied requests by route",
    labelNames: ["route"],
    registers: [registry]
  });
  const authEvents = new Counter({
    name: "rh_chain_auth_events_total",
    help: "Authentication events",
    labelNames: ["event"],
    registers: [registry]
  });
  const queueDepth = new Gauge({
    name: "rh_chain_queue_depth",
    help: "Background queue depth; zero while synchronous hydration is used",
    labelNames: ["queue"],
    registers: [registry]
  });
  queueDepth.set({ queue: "entity_hydration" }, 0);
  activeMetrics = { providerCalls, providerDuration, aiCalls, aiDuration, cacheOperations, rateLimitDenials, authEvents };
  const startedAt = new WeakMap<FastifyRequest, bigint>();

  app.addHook("onRequest", async (request) => {
    startedAt.set(request, process.hrtime.bigint());
  });
  app.addHook("onResponse", async (request, reply) => {
    const started = startedAt.get(request);
    const labels = {
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      status_code: String(reply.statusCode)
    };
    requests.inc(labels);
    if (started !== undefined) duration.observe(labels, Number(process.hrtime.bigint() - started) / 1_000_000_000);
  });
  app.get("/metrics", { config: { rateLimit: false } }, async (_request, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });
}

export function observeProviderCall(provider: string, durationSeconds: number, errorCode?: string): void {
  activeMetrics?.providerDuration.observe({ provider }, durationSeconds);
  activeMetrics?.providerCalls.inc({ provider, outcome: errorCode ? "error" : "success", error_code: errorCode ?? "none" });
}

export function observeAiCall(durationSeconds: number, outcome: "success" | "invalid" | "error" | "fallback"): void {
  activeMetrics?.aiDuration.observe(durationSeconds);
  activeMetrics?.aiCalls.inc({ outcome });
}

export function observeCache(outcome: "hit" | "miss" | "error"): void {
  activeMetrics?.cacheOperations.inc({ outcome });
}

export function observeRateLimit(route: string): void {
  activeMetrics?.rateLimitDenials.inc({ route });
}

export function observeAuth(event: "signup" | "login"): void {
  activeMetrics?.authEvents.inc({ event });
}
