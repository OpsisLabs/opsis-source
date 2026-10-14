import type { Env } from "../config/env.js";
import { observeExplorerCredits, observeExplorerRefusal } from "../observability/metrics.js";
import { ProviderRequestError } from "./provider-http.js";

export type ExplorerUnavailableReason = "daily_limit" | "rate_limited" | "unavailable";
export type ExplorerGateOptions = { requestsPerSecond: number; maxWaitMs: number; creditReserve: number };
type Dependencies = { now: () => number; sleep: (ms: number) => Promise<void> };

export class ExplorerGate {
  private starts: number[] = [];
  private pending: number[] = [];
  private turn: Promise<void> = Promise.resolve();
  private blockedUntil = 0;
  creditsRemaining?: number;

  constructor(
    private readonly options: ExplorerGateOptions,
    private readonly dependencies: Dependencies = {
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    }
  ) {}

  async request(
    fetchResponse: () => Promise<Response>,
    startedAt = this.dependencies.now(),
    retryState = { retried429: false }
  ): Promise<Response> {
    let response = await this.start(fetchResponse, startedAt);
    this.observeResponse(response);
    if (response.status === 429) {
      await response.body?.cancel();
      if (retryState.retried429) this.refuse("rate_limited");
      retryState.retried429 = true;
      response = await this.start(fetchResponse, startedAt, this.dependencies.now() + 1000);
      this.observeResponse(response);
      if (response.status === 429) {
        await response.body?.cancel();
        this.refuse("rate_limited");
      }
    }
    return response;
  }

  private async start(fetchResponse: () => Promise<Response>, startedAt: number, notBefore = this.dependencies.now()): Promise<Response> {
    this.assertCredits();
    const now = this.dependencies.now();
    this.starts = this.starts.filter((time) => time > now - 1000);
    const planned = [...this.starts, ...this.pending];
    const slot = Math.max(now, notBefore, planned.at(-1) ?? now,
      planned.length >= this.options.requestsPerSecond ? planned[planned.length - this.options.requestsPerSecond]! + 1000 : now);
    if (slot - startedAt > this.options.maxWaitMs) this.refuse("rate_limited");
    this.pending.push(slot);
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>((resolve) => { release = resolve; });
    try {
      await previous;
      this.assertCredits();
      this.starts = this.starts.filter((time) => time > this.dependencies.now() - 1000);
      const next = Math.max(slot, this.starts.length >= this.options.requestsPerSecond ? this.starts[0]! + 1000 : slot);
      if (next - startedAt > this.options.maxWaitMs) this.refuse("rate_limited");
      const wait = next - this.dependencies.now();
      if (wait > 0) await this.dependencies.sleep(wait);
      this.assertCredits();
      if (this.dependencies.now() - startedAt > this.options.maxWaitMs) this.refuse("rate_limited");
      this.starts.push(this.dependencies.now());
      // Release the queue after starting the fetch, without waiting for its response.
      return fetchResponse();
    } finally {
      this.pending.shift();
      release();
    }
  }

  private observeResponse(response: Response): void {
    const raw = response.headers.get("x-credits-remaining");
    if (raw === null || raw.trim() === "") return;
    const credits = Number(raw);
    if (!Number.isFinite(credits)) return;
    this.creditsRemaining = credits;
    observeExplorerCredits(credits);
    if (credits <= this.options.creditReserve) {
      this.blockedUntil = (Math.floor(this.dependencies.now() / 86_400_000) + 1) * 86_400_000;
    }
  }

  private assertCredits(): void {
    if (this.dependencies.now() < this.blockedUntil) this.refuse("credits_exhausted");
  }

  private refuse(reason: "rate_limited" | "credits_exhausted"): never {
    observeExplorerRefusal(reason);
    throw new ProviderRequestError(reason === "rate_limited" ? "PROVIDER_RATE_LIMITED" : "PROVIDER_CREDITS_EXHAUSTED", false);
  }
}

const gates = new Map<string, ExplorerGate>();
export function getExplorerGate(env: Env, key = "process", dependencies?: Dependencies): ExplorerGate {
  let gate = gates.get(key);
  if (!gate) {
    gate = new ExplorerGate({
      requestsPerSecond: env.BLOCKSCOUT_REQUESTS_PER_SECOND,
      maxWaitMs: env.BLOCKSCOUT_MAX_WAIT_MS,
      creditReserve: env.BLOCKSCOUT_CREDIT_RESERVE
    }, dependencies);
    gates.set(key, gate);
  }
  return gate;
}

export function explorerUnavailableReason(error: unknown): ExplorerUnavailableReason {
  const code = error instanceof ProviderRequestError ? error.code : undefined;
  return code === "PROVIDER_CREDITS_EXHAUSTED" ? "daily_limit" : code === "PROVIDER_RATE_LIMITED" ? "rate_limited" : "unavailable";
}
