import type { Env } from "../config/env.js";
import { observeProviderCall } from "../observability/metrics.js";

export type ProviderHttp = {
  requestJson(url: string, init?: RequestInit): Promise<unknown>;
};

export type ProviderHttpOptions = {
  maxRetries: number;
  backoffMs: number;
  timeoutMs: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
  requestBudgetPerMinute: number;
  maxConcurrency?: number;
  providerName?: string;
  maxResponseBytes?: number;
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
    await this.acquire();
    try {
      const result = await this.performRequest(url, init);
      observeProviderCall(this.options.providerName ?? "unknown", (this.dependencies.now() - startedAt) / 1000);
      return result;
    } catch (error) {
      const normalized = normalizeError(error);
      observeProviderCall(this.options.providerName ?? "unknown", (this.dependencies.now() - startedAt) / 1000, normalized.code);
      throw normalized;
    } finally {
      this.release();
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

  private async performRequest(url: string, init: RequestInit): Promise<unknown> {
    this.assertCircuitClosed();
    let lastError: ProviderRequestError | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      this.consumeBudget();
      try {
        const response = await this.dependencies.fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.options.timeoutMs)
        });
        if (!response.ok) {
          throw new ProviderRequestError(`PROVIDER_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
        }
        const json = await readBoundedJson(response, this.options.maxResponseBytes ?? 5 * 1024 * 1024);
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

export function createProviderHttp(env: Env, providerName?: string, maxResponseBytes?: number): ProviderHttpClient {
  return new ProviderHttpClient({
    maxRetries: env.PROVIDER_MAX_RETRIES,
    backoffMs: env.PROVIDER_BACKOFF_MS,
    timeoutMs: env.PROVIDER_TIMEOUT_MS,
    circuitFailureThreshold: env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD,
    circuitResetMs: env.PROVIDER_CIRCUIT_RESET_MS,
    requestBudgetPerMinute: env.PROVIDER_REQUEST_BUDGET_PER_MINUTE,
    maxConcurrency: env.PROVIDER_MAX_CONCURRENCY,
    providerName,
    maxResponseBytes
  });
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
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
    return JSON.parse(new TextDecoder(undefined, { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ProviderRequestError("PROVIDER_MALFORMED_RESPONSE", false);
  }
}

function normalizeError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ProviderRequestError("PROVIDER_TIMEOUT", true);
  }
  return new ProviderRequestError("PROVIDER_NETWORK_ERROR", true);
}
