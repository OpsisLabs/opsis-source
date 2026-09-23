import { describe, expect, it, vi } from "vitest";
import { PublicSwapCaptureWorker, type WorkerRange } from "../src/history/public-swap-capture-worker.js";
const LEASE_KEY = "public-swap-capture-worker:4663";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const r = (poolAddress = A, fromBlock = 1n, toBlock = 10n): WorkerRange => ({ chainId: 4663, poolAddress, source: "public-rpc", fromBlock, toBlock });

function setup(options: { captureStatus?: "COMPLETE" | "EMPTY" | "GAP" | "UNAVAILABLE"; budget?: boolean; storage?: boolean; leaseAvailable?: boolean; confirm?: boolean; enabled?: boolean } = {}) {
  const capture = { capture: vi.fn(async () => ({ status: options.captureStatus ?? "COMPLETE" as const, rows: 1 })) };
  const lease = { acquire: vi.fn(async () => options.leaseAvailable === false ? null : "owner"), confirm: vi.fn(async () => options.confirm !== false), release: vi.fn(async () => {}) };
  const budget = { reserve: vi.fn(async () => options.budget !== false) };
  const storage = { check: vi.fn(async () => ({ allowed: options.storage !== false })) };
  const coverage = { recordGap: vi.fn(async () => {}) };
  const worker = new PublicSwapCaptureWorker({ capture, lease, budget, storage, coverage, allowlist: [r(A, 1n, 100n), r(B, 1n, 100n)], enabled: options.enabled ?? true });
  return { worker, capture, lease, budget, storage, coverage };
}

describe("public Swap capture worker", () => {
  it("is default off and rejects invalid or non-allowlisted plans before dependencies", async () => {
    const off = setup({ enabled: false });
    expect(await off.worker.run({ enabled: true, ranges: [r()] })).toMatchObject({ status: "DISABLED" });
    expect(off.lease.acquire).not.toHaveBeenCalled(); expect(off.capture.capture).not.toHaveBeenCalled();
    const h = setup();
    expect(await h.worker.run({ enabled: true, ranges: [r(B, 1n, 1000n)] })).toMatchObject({ status: "INVALID" });
    expect(await h.worker.run({ enabled: true, ranges: [r("0x3333333333333333333333333333333333333333")] })).toMatchObject({ status: "INVALID" });
    expect(await h.worker.run({ enabled: true, ranges: [r(A, 1n, 5n), r(A, 5n, 10n)] })).toMatchObject({ status: "INVALID" });
    expect(h.lease.acquire).not.toHaveBeenCalled(); expect(h.storage.check).not.toHaveBeenCalled();
  });

  it("processes ranges in deterministic order under one invocation lease", async () => {
    const h = setup();
    const out = await h.worker.run({ enabled: true, ranges: [r(B), r(A, 11n, 20n), r(A)] });
    expect(out).toMatchObject({ status: "COMPLETE", attempted: 3, complete: 3 });
    expect(h.capture.capture.mock.calls.map(([x]) => `${x.poolAddress}:${x.fromBlock}`)).toEqual([`${A}:1`, `${A}:11`, `${B}:1`]);
    expect(h.lease.acquire).toHaveBeenCalledTimes(1); expect(h.lease.acquire).toHaveBeenCalledWith(LEASE_KEY);
    expect(h.lease.release).toHaveBeenCalledTimes(1); expect(h.lease.release).toHaveBeenCalledWith(LEASE_KEY, "owner");
    expect(h.budget.reserve).toHaveBeenCalledWith(expect.objectContaining({ kind: "RANGE-ATTEMPT" }));
  });

  it("stops on lease contention or loss before another source call", async () => {
    const contended = setup({ leaseAvailable: false });
    expect(await contended.worker.run({ enabled: true, ranges: [r()] })).toMatchObject({ stopReason: "LEASE_UNAVAILABLE" });
    expect(contended.capture.capture).not.toHaveBeenCalled();
    expect(contended.storage.check).not.toHaveBeenCalled(); expect(contended.budget.reserve).not.toHaveBeenCalled();
    expect(contended.coverage.recordGap).not.toHaveBeenCalled();
    const lost = setup({ confirm: false });
    expect(await lost.worker.run({ enabled: true, ranges: [r()] })).toMatchObject({ stopReason: "LEASE_LOST" });
    expect(lost.capture.capture).not.toHaveBeenCalled();
  });

  it("records a bounded gap and stops when attempt budget or storage headroom is exhausted", async () => {
    const budget = setup({ budget: false });
    expect(await budget.worker.run({ enabled: true, ranges: [r()] })).toMatchObject({ stopReason: "BUDGET_EXHAUSTED", gaps: 1 });
    expect(budget.coverage.recordGap).toHaveBeenCalledWith({ range: r(), detail: "BUDGET_EXHAUSTED" });
    expect(budget.capture.capture).not.toHaveBeenCalled();
    const storage = setup({ storage: false });
    expect(await storage.worker.run({ enabled: true, ranges: [r()] })).toMatchObject({ stopReason: "STORAGE_CAP" });
    expect(storage.coverage.recordGap).toHaveBeenCalledWith({ range: r(), detail: "STORAGE_CAP" });
    expect(storage.lease.acquire).toHaveBeenCalledTimes(1);
    expect(storage.coverage.recordGap).toHaveBeenCalledWith({ range: r(), detail: "STORAGE_CAP" });
    expect(storage.lease.release).toHaveBeenCalledTimes(1);
  });

  it("rechecks storage after a range and preserves source GAP and UNAVAILABLE", async () => {
    const h = setup(); h.storage.check.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    expect(await h.worker.run({ enabled: true, ranges: [r(), r(A, 11n, 20n)] })).toMatchObject({ stopReason: "STORAGE_CAP", attempted: 1 });
    expect(h.coverage.recordGap).toHaveBeenCalledWith({ range: r(A, 11n, 20n), detail: "STORAGE_CAP" });
    expect(h.lease.acquire).toHaveBeenCalledTimes(1); expect(h.lease.release).toHaveBeenCalledTimes(1);
    for (const status of ["GAP", "UNAVAILABLE"] as const) {
      const source = setup({ captureStatus: status });
      expect(await source.worker.run({ enabled: true, ranges: [r(), r(A, 11n, 20n)] })).toMatchObject({ stopReason: status === "GAP" ? "SOURCE_GAP" : "SOURCE_UNAVAILABLE" });
      expect(source.capture.capture).toHaveBeenCalledTimes(1);
      expect(source.lease.release).toHaveBeenCalledTimes(1);
    }
  });

  it("stops if lease renewal fails after capture or before writing a storage gap", async () => {
    const afterCapture = setup();
    afterCapture.lease.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(await afterCapture.worker.run({ enabled: true, ranges: [r(), r(A, 11n, 20n)] })).toMatchObject({ stopReason: "LEASE_LOST", attempted: 1 });
    expect(afterCapture.capture.capture).toHaveBeenCalledTimes(1);
    const beforeGap = setup({ storage: false });
    beforeGap.lease.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await beforeGap.worker.run({ enabled: true, ranges: [r()] })).toMatchObject({ stopReason: "LEASE_LOST" });
    expect(beforeGap.coverage.recordGap).not.toHaveBeenCalled();
    expect(beforeGap.lease.release).toHaveBeenCalledTimes(1);
  });

  it("renews during a long capture and waits for the in-flight renewal before release", async () => {
    let interval: (() => void) | undefined;
    let finishCapture!: (value: { status: "COMPLETE"; rows: number }) => void;
    const h = setup();
    h.lease.ttlMs = 90;
    h.capture.capture.mockImplementationOnce(() => new Promise((resolve) => { finishCapture = resolve; }));
    const worker = new PublicSwapCaptureWorker({
      capture: h.capture, lease: h.lease, budget: h.budget, storage: h.storage, coverage: h.coverage,
      allowlist: [r(A, 1n, 100n)], enabled: true,
      setInterval: ((callback: TimerHandler) => { interval = callback as () => void; return 1 as unknown as ReturnType<typeof setInterval>; }) as typeof setInterval,
      clearInterval: vi.fn(),
    });
    const pending = worker.run({ enabled: true, ranges: [r()] });
    await vi.waitFor(() => expect(finishCapture).toBeDefined());
    interval?.();
    await vi.waitFor(() => expect(h.lease.confirm).toHaveBeenCalledTimes(4));
    finishCapture({ status: "COMPLETE", rows: 1 });
    expect(await pending).toMatchObject({ status: "COMPLETE", complete: 1 });
    expect(h.lease.release).toHaveBeenCalledTimes(1);
  });

  it("rejects completion when renewal loses ownership during capture", async () => {
    let interval: (() => void) | undefined;
    let finishCapture!: (value: { status: "COMPLETE"; rows: number }) => void;
    const h = setup();
    h.capture.capture.mockImplementationOnce(async (_range, options) => {
      const pending = new Promise<{ status: "COMPLETE"; rows: number }>((resolve) => { finishCapture = resolve; });
      const result = await pending;
      await options?.assertLease();
      return result;
    });
    h.lease.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const worker = new PublicSwapCaptureWorker({
      capture: h.capture, lease: h.lease, budget: h.budget, storage: h.storage, coverage: h.coverage,
      allowlist: [r(A, 1n, 100n)], enabled: true,
      setInterval: ((callback: TimerHandler) => { interval = callback as () => void; return 1 as unknown as ReturnType<typeof setInterval>; }) as typeof setInterval,
      clearInterval: vi.fn(),
    });
    const pending = worker.run({ enabled: true, ranges: [r()] });
    await vi.waitFor(() => expect(finishCapture).toBeDefined());
    interval?.();
    await vi.waitFor(() => expect(h.lease.confirm).toHaveBeenCalledTimes(4));
    finishCapture({ status: "COMPLETE", rows: 1 });
    expect(await pending).toMatchObject({ status: "STOPPED", stopReason: "LEASE_LOST", attempted: 1, complete: 0 });
    expect(h.lease.release).toHaveBeenCalledTimes(1);
  });

  it("aborts publication and releases the owner when Redis renewal fails mid-capture", async () => {
    let interval: (() => void) | undefined;
    let finishCapture!: (value: { status: "COMPLETE"; rows: number }) => void;
    const h = setup();
    h.capture.capture.mockImplementationOnce(async (_range, options) => {
      const result = await new Promise<{ status: "COMPLETE"; rows: number }>((resolve) => { finishCapture = resolve; });
      await options?.assertLease();
      return result;
    });
    h.lease.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("Redis offline"));
    const worker = new PublicSwapCaptureWorker({
      capture: h.capture, lease: h.lease, budget: h.budget, storage: h.storage, coverage: h.coverage,
      allowlist: [r(A, 1n, 100n)], enabled: true,
      setInterval: ((callback: TimerHandler) => { interval = callback as () => void; return 1 as unknown as ReturnType<typeof setInterval>; }) as typeof setInterval,
      clearInterval: vi.fn(),
    });
    const pending = worker.run({ enabled: true, ranges: [r()] });
    await vi.waitFor(() => expect(finishCapture).toBeDefined());
    interval?.();
    await vi.waitFor(() => expect(h.lease.confirm).toHaveBeenCalledTimes(4));
    finishCapture({ status: "COMPLETE", rows: 1 });
    expect(await pending).toMatchObject({ status: "STOPPED", stopReason: "LEASE_LOST", attempted: 1, complete: 0 });
    expect(h.lease.release).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed allowlists before acquiring the invocation lease", async () => {
    const malformed = new PublicSwapCaptureWorker({
      capture: { capture: vi.fn(async () => ({ status: "COMPLETE" as const, rows: 1 })) },
      lease: { acquire: vi.fn(async () => "owner"), confirm: vi.fn(async () => true), release: vi.fn(async () => {}) },
      budget: { reserve: vi.fn(async () => true) }, storage: { check: vi.fn(async () => ({ allowed: true })) },
      coverage: { recordGap: vi.fn(async () => {}) }, allowlist: [{ ...r(), chainId: 1 }], enabled: true,
    });
    expect(await malformed.run({ enabled: true, ranges: [r()] })).toMatchObject({ status: "INVALID" });
    expect(malformed["deps"].lease.acquire).not.toHaveBeenCalled();
  });

  it("propagates coverage failures without source calls and releases owner tokens without masking errors", async () => {
    const h = setup({ budget: false }); h.coverage.recordGap.mockRejectedValueOnce(new Error("coverage failed"));
    await expect(h.worker.run({ enabled: true, ranges: [r()] })).rejects.toThrow("coverage failed");
    expect(h.capture.capture).not.toHaveBeenCalled(); expect(h.lease.release).toHaveBeenCalledWith(expect.any(String), "owner");
    const failure = setup(); failure.capture.capture.mockRejectedValueOnce(new Error("capture failed")); failure.lease.release.mockRejectedValueOnce(new Error("release failed"));
    await expect(failure.worker.run({ enabled: true, ranges: [r()] })).rejects.toThrow("capture failed");
    const releaseOnly = setup(); releaseOnly.lease.release.mockRejectedValueOnce(new Error("release failed"));
    await expect(releaseOnly.worker.run({ enabled: true, ranges: [r()] })).rejects.toThrow("release failed");
  });

  it("allows idempotent capture replay through the injected capture interface", async () => {
    const h = setup();
    await h.worker.run({ enabled: true, ranges: [r()] });
    await h.worker.run({ enabled: true, ranges: [r()] });
    expect(h.capture.capture).toHaveBeenCalledTimes(2);
    expect(h.capture.capture.mock.calls[0]?.[0]).toEqual(h.capture.capture.mock.calls[1]?.[0]);
  });
});
