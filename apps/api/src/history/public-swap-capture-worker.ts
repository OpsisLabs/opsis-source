import type { SwapRangeRequest } from "./public-swap-capture.js";
import { PublicSwapHistoryFenceError } from "./public-swap-history.js";

const MAX_POOLS = 4;
const MAX_RANGES = 100;
const MAX_BLOCKS = 100n;
const GLOBAL_LEASE_KEY = "public-swap-capture-worker:4663";
const ADDRESS = /^0x[0-9a-f]{40}$/;
const SOURCE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type WorkerRange = Pick<SwapRangeRequest, "chainId" | "poolAddress" | "source" | "fromBlock" | "toBlock">;
export type AllowlistedRange = WorkerRange;
export type CaptureResult = { status: "COMPLETE" | "EMPTY" | "GAP" | "UNAVAILABLE"; rows: number };

export interface PublicSwapCaptureLike {
  capture(range: WorkerRange, options?: { assertLease: () => Promise<void>; workerLeaseToken?: string }): Promise<CaptureResult>;
}
export interface HistoryWorkerLease {
  /** Lease lifetime in milliseconds, used to schedule safe owner-checked renewal. */
  readonly ttlMs?: number;
  acquire(key: string): Promise<string | null>;
  /** Must validate the owner token and renew the lease when it is still owned. */
  confirm(key: string, ownerToken: string): Promise<boolean>;
  release(key: string, ownerToken: string): Promise<void>;
}
export interface RangeAttemptBudget { reserve(input: { kind: "RANGE-ATTEMPT"; range: WorkerRange }): Promise<boolean> }
export interface StorageHeadroom { check(): Promise<{ allowed: boolean }> }
export interface WorkerCoverageWriter {
  recordGap(input: { range: WorkerRange; detail: "BUDGET_EXHAUSTED" | "STORAGE_CAP"; workerLeaseToken: string }): Promise<void>;
}

export type WorkerPlan = { enabled: boolean; ranges: readonly WorkerRange[] };
export type WorkerResult = {
  status: "DISABLED" | "INVALID" | "COMPLETE" | "STOPPED";
  attempted: number; complete: number; empty: number; gaps: number; unavailable: number;
  stopReason?: "LEASE_UNAVAILABLE" | "LEASE_LOST" | "BUDGET_EXHAUSTED" | "STORAGE_CAP" | "SOURCE_GAP" | "SOURCE_UNAVAILABLE";
};

/** One-shot, default-off orchestration for explicitly admitted shared public ranges. */
export class PublicSwapCaptureWorker {
  constructor(private readonly deps: {
    capture: PublicSwapCaptureLike;
    lease: HistoryWorkerLease;
    budget: RangeAttemptBudget;
    storage: StorageHeadroom;
    coverage: WorkerCoverageWriter;
    allowlist: readonly AllowlistedRange[];
    enabled?: boolean;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
  }) {}

  async run(plan: WorkerPlan): Promise<WorkerResult> {
    const zero = { attempted: 0, complete: 0, empty: 0, gaps: 0, unavailable: 0 };
    if (!this.deps.enabled || plan.enabled !== true) return { status: "DISABLED", ...zero };
    const ranges = validateAndSort(plan, this.deps.allowlist);
    if (!ranges) return { status: "INVALID", ...zero };

    // One global owner token protects all storage, budget, coverage, and capture decisions.
    const owner = await this.deps.lease.acquire(GLOBAL_LEASE_KEY);
    if (!owner) return { status: "STOPPED", ...zero, stopReason: "LEASE_UNAVAILABLE" };
    const counts = { ...zero };
    const intervalMs = Math.max(1, Math.floor((this.deps.lease.ttlMs ?? 60_000) / 3));
    const setTimer = this.deps.setInterval ?? setInterval;
    const clearTimer = this.deps.clearInterval ?? clearInterval;
    let lost = false;
    let renewal: Promise<boolean> | null = null;
    const renew = () => {
      const operation = Promise.resolve().then(() => this.deps.lease.confirm(GLOBAL_LEASE_KEY, owner))
        .then((ok) => { if (!ok) lost = true; return ok; }, () => { lost = true; return false; });
      renewal = operation;
      void operation.then(() => { if (renewal === operation) renewal = null; });
      return operation;
    };
    const assertLease = async () => {
      if (lost) throw new LeaseLostError();
      if (renewal) {
        if (!(await renewal)) throw new LeaseLostError();
      }
      if (!(await renew())) throw new LeaseLostError();
    };
    const timer = setTimer(() => {
      if (lost || renewal) return;
      void renew();
    }, intervalMs);
    let priorError: unknown;
    try {
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]!;
        if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        const before = await this.deps.storage.check();
        if (!before.allowed) {
          if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          if (!(await this.tryRecordGap(range, "STORAGE_CAP", owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          counts.gaps++;
          return { status: "STOPPED", ...counts, stopReason: "STORAGE_CAP" };
        }
        if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        if (!(await this.deps.budget.reserve({ kind: "RANGE-ATTEMPT", range }))) {
          if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          if (!(await this.tryRecordGap(range, "BUDGET_EXHAUSTED", owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          counts.gaps++;
          return { status: "STOPPED", ...counts, stopReason: "BUDGET_EXHAUSTED" };
        }
        if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        counts.attempted++;
        let result: CaptureResult;
        try { result = await this.deps.capture.capture(range, { assertLease, workerLeaseToken: owner }); }
        catch (error) {
          if (error instanceof LeaseLostError || error instanceof PublicSwapHistoryFenceError || lost) {
            return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          }
          throw error;
        }
        if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        if (result.status === "COMPLETE") counts.complete++;
        else if (result.status === "EMPTY") counts.empty++;
        else if (result.status === "GAP") { counts.gaps++; return { status: "STOPPED", ...counts, stopReason: "SOURCE_GAP" }; }
        else { counts.unavailable++; return { status: "STOPPED", ...counts, stopReason: "SOURCE_UNAVAILABLE" }; }

        if (i + 1 < ranges.length) {
          const after = await this.deps.storage.check();
          if (!after.allowed) {
            const nextRange = ranges[i + 1]!;
            if (!(await this.tryAssertLease(assertLease))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
            if (!(await this.tryRecordGap(nextRange, "STORAGE_CAP", owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
            counts.gaps++;
            return { status: "STOPPED", ...counts, stopReason: "STORAGE_CAP" };
          }
        }
      }
      return { status: "COMPLETE", ...counts };
    } catch (error) {
      priorError = error;
      throw error;
    } finally {
      clearTimer(timer);
      if (renewal) await renewal;
      try { await this.deps.lease.release(GLOBAL_LEASE_KEY, owner); }
      catch (error) { if (priorError === undefined) throw error; }
    }
  }

  private async tryAssertLease(assertLease: () => Promise<void>): Promise<boolean> {
    try { await assertLease(); return true; } catch { return false; }
  }

  private async tryRecordGap(range: WorkerRange, detail: "BUDGET_EXHAUSTED" | "STORAGE_CAP", owner: string): Promise<boolean> {
    try {
      await this.deps.coverage.recordGap({ range, detail, workerLeaseToken: owner });
      return true;
    } catch (error) {
      if (error instanceof PublicSwapHistoryFenceError) return false;
      throw error;
    }
  }
}

export class LeaseLostError extends Error {
  constructor() { super("Public Swap capture lease was lost"); this.name = "LeaseLostError"; }
}

function validateAndSort(plan: WorkerPlan, allowlist: readonly AllowlistedRange[]): WorkerRange[] | null {
  if (!Array.isArray(plan.ranges) || plan.ranges.length === 0 || plan.ranges.length > MAX_RANGES) return null;
  if (!Array.isArray(allowlist) || allowlist.length === 0) return null;
  const validRange = (r: WorkerRange) => r.chainId === 4663 && ADDRESS.test(r.poolAddress)
    && r.poolAddress === r.poolAddress.toLowerCase() && SOURCE.test(r.source)
    && typeof r.fromBlock === "bigint" && typeof r.toBlock === "bigint"
    && r.fromBlock >= 0n && r.toBlock >= r.fromBlock && r.toBlock - r.fromBlock < MAX_BLOCKS;
  if (allowlist.some((entry) => !validRange(entry))) return null;
  if (new Set(allowlist.map((entry) => entry.poolAddress)).size > MAX_POOLS) return null;
  const permitted = (r: WorkerRange) => allowlist.some((a) => a.chainId === r.chainId
    && a.poolAddress === r.poolAddress && a.source === r.source
    && r.fromBlock >= a.fromBlock && r.toBlock <= a.toBlock);
  const ranges = [...plan.ranges];
  for (const r of ranges) if (!validRange(r) || !permitted(r)) return null;
  if (new Set(ranges.map((r) => r.poolAddress)).size > MAX_POOLS) return null;
  ranges.sort((a, b) => a.poolAddress.localeCompare(b.poolAddress) || a.source.localeCompare(b.source)
    || (a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0) || (a.toBlock < b.toBlock ? -1 : a.toBlock > b.toBlock ? 1 : 0));
  for (let i = 1; i < ranges.length; i++) {
    const a = ranges[i - 1]!; const b = ranges[i]!;
    if (a.poolAddress === b.poolAddress && a.source === b.source && b.fromBlock <= a.toBlock) return null;
  }
  return ranges;
}
