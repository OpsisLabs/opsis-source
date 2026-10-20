import { getExplorerGate, type ExplorerGate } from "./explorer-gate.js";
import type { Env } from "../config/env.js";
import { observeProviderCall, observeProviderResponseBytes, observeRpcSubcall, type RpcWorkload } from "../observability/metrics.js";
import type { RpcUnitBudget } from "./rpc-unit-budget.js";

export type ProviderHttp = {
  requestJson(url: string, init?: RequestInit): Promise<unknown>;
};

export type ProviderHttpOptions = {
  explorerGate?: ExplorerGate;
  maxRetries: number;
  backoffMs: number;
  timeoutMs: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
  requestBudgetPerMinute: number;
  maxConcurrency?: number;
  providerName?: string;
  rpcWorkload?: RpcWorkload;
  maxResponseBytes?: number;
  rpcUnitBudget?: RpcUnitBudget;
};

type Dependencies = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export class ProviderRequestError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
  }
}

export class ProviderHttpClient implements ProviderHttp {
  private failures = 0;
  private circuitOpenedAt?: number;
  private budgetWindowStartedAt: number;
  private requestsInWindow = 0;
  private activeRequests = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly options: ProviderHttpOptions,
    private readonly dependencies: Dependencies = {
      fetch,
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    }
  ) {
    this.budgetWindowStartedAt = dependencies.now();
  }

  async requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
    const startedAt = this.dependencies.now();
    if (!this.options.explorerGate) await this.acquire();
    try {
      const result = await this.performRequest(url, init, startedAt);
      observeProviderCall(this.options.providerName ?? "unknown", (this.dependencies.now() - startedAt) / 1000);
      return result;
    } catch (error) {
      const normalized = normalizeError(error);
      if (!["PROVIDER_RATE_LIMITED", "PROVIDER_CREDITS_EXHAUSTED"].includes(normalized.code)) {
        observeProviderCall(this.options.providerName ?? "unknown", (this.dependencies.now() - startedAt) / 1000, normalized.code);
      }
      throw normalized;
    } finally {
      if (!this.options.explorerGate) this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeRequests < (this.options.maxConcurrency ?? 5)) {
      this.activeRequests += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeRequests += 1;
  }

  private release(): void {
    this.activeRequests -= 1;
    this.waiters.shift()?.();
  }

  private async performRequest(url: string, init: RequestInit, startedAt: number): Promise<unknown> {
    if (!this.options.explorerGate) this.assertCircuitClosed();
    let lastError: ProviderRequestError | undefined;
    const rpcMethods = rpcMethodsFromBody(init.body);
    const explorerRetryState = { retried429: false };

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      if (!this.options.explorerGate) this.consumeBudget();
      if (this.options.rpcUnitBudget) {
        let reservation;
        try {
          reservation = await this.options.rpcUnitBudget.reserve(rpcMethods);
        } catch {
          throw new ProviderRequestError("PROVIDER_GLOBAL_BUDGET_UNAVAILABLE", false);
        }
        if (reservation.outcome !== "reserved") {
          throw new ProviderRequestError(
            reservation.outcome === "exhausted" ? "PROVIDER_GLOBAL_BUDGET_EXCEEDED" :
              reservation.outcome === "unmetered" ? "PROVIDER_GLOBAL_BUDGET_UNMETERED" : "PROVIDER_GLOBAL_BUDGET_UNAVAILABLE",
            false,
          );
        }
      }
      for (const method of rpcMethods) observeRpcSubcall(this.options.providerName ?? "unknown", METRIC_RPC_METHODS.has(method) ? method : "other", this.options.rpcWorkload);
      try {
        const fetchResponse = () => {
          if (this.options.explorerGate) {
            this.assertCircuitClosed();
            this.consumeBudget();
          }
          return this.dependencies.fetch(url, {
            ...init,
            signal: AbortSignal.timeout(this.options.timeoutMs)
          });
        };
        const response = this.options.explorerGate
          ? await this.options.explorerGate.request(fetchResponse, startedAt, explorerRetryState)
          : await fetchResponse();
        if (!response.ok) {
          throw new ProviderRequestError(`PROVIDER_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
        }
        const { json, byteLength } = await readBoundedJson(response, this.options.maxResponseBytes ?? 5 * 1024 * 1024);
        observeProviderResponseBytes(this.options.providerName ?? "unknown", byteLength);
        this.failures = 0;
        this.circuitOpenedAt = undefined;
        return json;
      } catch (error) {
        lastError = normalizeError(error);
        if (!lastError.retryable || attempt === this.options.maxRetries) break;
        await this.dependencies.sleep(this.options.backoffMs * 2 ** attempt);
      }
    }

    if (lastError?.retryable) this.recordFailure();
    throw lastError ?? new ProviderRequestError("PROVIDER_REQUEST_FAILED", true);
  }

  private assertCircuitClosed(): void {
    if (this.circuitOpenedAt === undefined) return;
    if (this.dependencies.now() - this.circuitOpenedAt >= this.options.circuitResetMs) {
      this.circuitOpenedAt = undefined;
      this.failures = 0;
      return;
    }
    throw new ProviderRequestError("PROVIDER_CIRCUIT_OPEN", false);
  }

  private consumeBudget(): void {
    const now = this.dependencies.now();
    if (now - this.budgetWindowStartedAt >= 60_000) {
      this.budgetWindowStartedAt = now;
      this.requestsInWindow = 0;
    }
    if (this.requestsInWindow >= this.options.requestBudgetPerMinute) {
      throw new ProviderRequestError("PROVIDER_BUDGET_EXCEEDED", false);
    }
    this.requestsInWindow += 1;
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.circuitFailureThreshold) this.circuitOpenedAt = this.dependencies.now();
  }
}

export function createProviderHttp(env: Env, providerName?: string, maxResponseBytes?: number, rpcWorkload?: RpcWorkload): ProviderHttpClient {
  return new ProviderHttpClient({
    explorerGate: providerName === "blockscout" ? getExplorerGate(env) : undefined,
    maxRetries: env.PROVIDER_MAX_RETRIES,
    backoffMs: env.PROVIDER_BACKOFF_MS,
    timeoutMs: env.PROVIDER_TIMEOUT_MS,
    circuitFailureThreshold: env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD,
    circuitResetMs: env.PROVIDER_CIRCUIT_RESET_MS,
    requestBudgetPerMinute: env.PROVIDER_REQUEST_BUDGET_PER_MINUTE,
    maxConcurrency: env.PROVIDER_MAX_CONCURRENCY,
    providerName,
    maxResponseBytes,
    rpcWorkload
  });
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<{ json: unknown; byteLength: number }> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ProviderRequestError("PROVIDER_RESPONSE_TOO_LARGE", false);
  }
  if (!response.body) throw new ProviderRequestError("PROVIDER_MALFORMED_RESPONSE", false);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ProviderRequestError("PROVIDER_RESPONSE_TOO_LARGE", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return { json: JSON.parse(new TextDecoder(undefined, { fatal: true }).decode(bytes)) as unknown, byteLength: length };
  } catch {
    throw new ProviderRequestError("PROVIDER_MALFORMED_RESPONSE", false);
  }
}

// Metrics must have bounded labels. Never include JSON-RPC parameters, URLs,
// addresses, transaction hashes, or values supplied by the caller.
const METRIC_RPC_METHODS = new Set([
  "eth_blockNumber", "eth_call", "eth_chainId", "eth_gasPrice", "eth_getBalance",
  "eth_getBlockByHash", "eth_getBlockByNumber", "eth_getCode",
  "eth_getLogs", "eth_getStorageAt", "eth_getTransactionByHash",
  "eth_getTransactionReceipt", "eth_getTransactionCount", "eth_estimateGas", "eth_simulateV1",
]);

function rpcMethodsFromBody(body: RequestInit["body"]): string[] {
  if (typeof body !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(body);
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    if (calls.length === 0 || calls.length > 100) return [];
    const methods: string[] = [];
    for (const call of calls) {
      if (typeof call !== "object" || call === null || Array.isArray(call)) return [];
      const record = call as Record<string, unknown>;
      // Never partially meter a batch: an invalid member could still consume
      // provider units if the whole request is transmitted.
      if (record.jsonrpc !== "2.0" || typeof record.method !== "string" || !record.method) return [];
      methods.push(record.method);
    }
    return methods;
  } catch {
    return [];
  }
}

function normalizeError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ProviderRequestError("PROVIDER_TIMEOUT", true);
  }
  return new ProviderRequestError("PROVIDER_NETWORK_ERROR", true);
}
