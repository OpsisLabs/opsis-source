import type { SwapRangeRequest } from "./public-swap-capture.js";

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
  /** The implementation's maximum duration must be strictly below the lease TTL. */
  capture(range: WorkerRange): Promise<CaptureResult>;
}
export interface HistoryWorkerLease {
  acquire(key: string): Promise<string | null>;
  /** Must validate the owner token and renew the lease when it is still owned. */
  confirm(key: string, ownerToken: string): Promise<boolean>;
  release(key: string, ownerToken: string): Promise<void>;
}
export interface RangeAttemptBudget { reserve(input: { kind: "RANGE-ATTEMPT"; range: WorkerRange }): Promise<boolean> }
export interface StorageHeadroom { check(): Promise<{ allowed: boolean }> }
export interface WorkerCoverageWriter {
  recordGap(input: { range: WorkerRange; detail: "BUDGET_EXHAUSTED" | "STORAGE_CAP" }): Promise<void>;
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
    let priorError: unknown;
    try {
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]!;
        if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        const before = await this.deps.storage.check();
        if (!before.allowed) {
          if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          await this.deps.coverage.recordGap({ range, detail: "STORAGE_CAP" });
          counts.gaps++;
          return { status: "STOPPED", ...counts, stopReason: "STORAGE_CAP" };
        }
        if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        if (!(await this.deps.budget.reserve({ kind: "RANGE-ATTEMPT", range }))) {
          if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
          await this.deps.coverage.recordGap({ range, detail: "BUDGET_EXHAUSTED" });
          counts.gaps++;
          return { status: "STOPPED", ...counts, stopReason: "BUDGET_EXHAUSTED" };
        }
        if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        counts.attempted++;
        const result = await this.deps.capture.capture(range);
        if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
        if (result.status === "COMPLETE") counts.complete++;
        else if (result.status === "EMPTY") counts.empty++;
        else if (result.status === "GAP") { counts.gaps++; return { status: "STOPPED", ...counts, stopReason: "SOURCE_GAP" }; }
        else { counts.unavailable++; return { status: "STOPPED", ...counts, stopReason: "SOURCE_UNAVAILABLE" }; }

        if (i + 1 < ranges.length) {
          const after = await this.deps.storage.check();
          if (!after.allowed) {
            const nextRange = ranges[i + 1]!;
            if (!(await this.ownsLease(owner))) return { status: "STOPPED", ...counts, stopReason: "LEASE_LOST" };
            await this.deps.coverage.recordGap({ range: nextRange, detail: "STORAGE_CAP" });
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
      try { await this.deps.lease.release(GLOBAL_LEASE_KEY, owner); }
      catch (error) { if (priorError === undefined) throw error; }
    }
  }

  private ownsLease(owner: string): Promise<boolean> {
    return this.deps.lease.confirm(GLOBAL_LEASE_KEY, owner);
  }
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
