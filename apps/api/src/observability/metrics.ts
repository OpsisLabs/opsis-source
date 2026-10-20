import type { FastifyInstance, FastifyRequest } from "fastify";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

type RuntimeMetrics = {
  alerts: Counter<"event" | "reason">;
  alertsLag: Gauge;
  explorerCredits: Gauge;
  explorerRefusals: Counter<"reason">;
  providerCalls: Counter<"provider" | "outcome" | "error_code">;
  providerDuration: Histogram<"provider">;
  rpcSubcalls: Counter<"provider" | "method">;
  rpcWorkloadSubcalls: Counter<"workload" | "method">;
  providerResponseBytes: Counter<"provider">;
  aiCalls: Counter<"outcome">;
  aiDuration: Histogram<never>;
  cacheOperations: Counter<"outcome">;
  rateLimitDenials: Counter<"route">;
  authEvents: Counter<"event">;
  operationalFailures: Counter<"code" | "status_code">;
  retentionRuns: Counter<"outcome">;
  retentionLastAttempt: Gauge;
  retentionLastSuccess: Gauge;
};

export type RpcWorkload = "research" | "observed-trades" | "exit-check" | "controls" | "launch-cards" | "rwa" | "portfolio" | "alerts" | "unattributed";
const RPC_WORKLOADS = new Set<RpcWorkload>(["research", "observed-trades", "exit-check", "controls", "launch-cards", "rwa", "portfolio", "alerts", "unattributed"]);

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
  const rpcSubcalls = new Counter({
    name: "rh_chain_rpc_subcalls_total",
    help: "JSON-RPC methods attempted, including batch members and retries; no parameters are recorded",
    labelNames: ["provider", "method"],
    registers: [registry]
  });
  const rpcWorkloadSubcalls = new Counter({
    name: "rh_chain_rpc_workload_subcalls_total",
    help: "Physical JSON-RPC method attempts by bounded application workload; includes batch members and retries, never request parameters",
    labelNames: ["workload", "method"],
    registers: [registry]
  });
  const providerResponseBytes = new Counter({
    name: "rh_chain_provider_response_bytes_total",
    help: "Successfully parsed provider response body bytes",
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
  const operationalFailures = new Counter({
    name: "rh_chain_operational_failures_total",
    help: "Bounded application failures suitable for launch alerts",
    labelNames: ["code", "status_code"],
    registers: [registry]
  });
  const retentionRuns = new Counter({
    name: "rh_chain_retention_runs_total",
    help: "Retention cleanup attempts",
    labelNames: ["outcome"],
    registers: [registry]
  });
  const retentionLastAttempt = new Gauge({
    name: "rh_chain_retention_last_attempt_timestamp_seconds",
    help: "Unix timestamp of the latest retention cleanup attempt",
    registers: [registry]
  });
  const retentionLastSuccess = new Gauge({
    name: "rh_chain_retention_last_success_timestamp_seconds",
    help: "Unix timestamp of the latest successful retention cleanup",
    registers: [registry]
  });
  const queueDepth = new Gauge({
    name: "rh_chain_queue_depth",
    help: "Background queue depth; zero while synchronous hydration is used",
    labelNames: ["queue"],
    registers: [registry]
  });
  queueDepth.set({ queue: "entity_hydration" }, 0);
  const explorerCredits = new Gauge({
    name: "rh_chain_explorer_credits_remaining",
    help: "Latest daily credits remaining reported by the explorer",
    registers: [registry]
  });
  const explorerRefusals = new Counter({
    name: "rh_chain_explorer_gate_refusals_total",
    help: "Explorer requests refused by the process gate",
    labelNames: ["reason"],
    registers: [registry]
  });
  const alerts = new Counter({ name: "rh_chain_alerts_total", help: "Alert follower and delivery counters without recipient or address labels", labelNames: ["event", "reason"], registers: [registry] });
  const alertsLag = new Gauge({ name: "rh_chain_alerts_lag_blocks", help: "Blocks behind the selected alert block tag", registers: [registry] });
  activeMetrics = {
    alerts,
    alertsLag,
    explorerCredits,
    explorerRefusals,
    providerCalls,
    providerDuration,
    rpcSubcalls,
    rpcWorkloadSubcalls,
    providerResponseBytes,
    aiCalls,
    aiDuration,
    cacheOperations,
    rateLimitDenials,
    authEvents,
    operationalFailures,
    retentionRuns,
    retentionLastAttempt,
    retentionLastSuccess
  };
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

export function observeRpcSubcall(provider: string, method: string, workload: RpcWorkload = "unattributed"): void {
  activeMetrics?.rpcSubcalls.inc({ provider, method });
  activeMetrics?.rpcWorkloadSubcalls.inc({ workload: RPC_WORKLOADS.has(workload) ? workload : "unattributed", method });
}

export function observeProviderResponseBytes(provider: string, bytes: number): void {
  activeMetrics?.providerResponseBytes.inc({ provider }, bytes);
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

export function observeOperationalFailure(code: string, statusCode: number): void {
  activeMetrics?.operationalFailures.inc({ code, status_code: String(statusCode) });
}

export function observeRetention(outcome: "success" | "failure", at = new Date()): void {
  const seconds = at.getTime() / 1_000;
  activeMetrics?.retentionLastAttempt.set(seconds);
  activeMetrics?.retentionRuns.inc({ outcome });
  if (outcome === "success") activeMetrics?.retentionLastSuccess.set(seconds);
}

export function observeExplorerCredits(credits: number): void {
  activeMetrics?.explorerCredits.set(credits);
}

export function observeExplorerRefusal(reason: "rate_limited" | "credits_exhausted"): void {
  activeMetrics?.explorerRefusals.inc({ reason });
}

export function observeAlert(event: "polls" | "lag" | "deliveries" | "duplicates" | "budgetStops" | "gaps" | "stop", value = 1, reason: "budget" | "capacity" | "lease" | "provider" | "none" = "none"): void {
  if (event === "lag") activeMetrics?.alertsLag.set(value);
  else activeMetrics?.alerts.inc({ event, reason }, value);
}
