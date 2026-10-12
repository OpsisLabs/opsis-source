import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importer = vi.fn();

function deferredModule() {
  let resolve!: (module: { default: () => null }) => void;
  const promise = new Promise<{ default: () => null }>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve({ default: () => null }) };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  importer.mockReset();
  vi.doMock("./Lab", () => importer());
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("navigation progress ordering", () => {
  it("does not notify during capture or intervening microtask checkpoints", async () => {
    const { beginNavigation, navigationSnapshot, subscribeNavigation } = await import("./route-chunks");
    const order: string[] = [];
    subscribeNavigation(() => order.push("progress"));

    order.push("document capture");
    beginNavigation("/saved");
    await Promise.resolve();
    expect(navigationSnapshot()).toBe("");
    expect(order).toEqual(["document capture"]);
    order.push("router click");
    await Promise.resolve();
    expect(order).toEqual(["document capture", "router click"]);

    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("/saved");
    expect(order).toEqual(["document capture", "router click", "progress"]);
  });

  it("cancels a deferred start when RouteReady commits an instant route", async () => {
    const { beginNavigation, finishNavigation, navigationSnapshot, subscribeNavigation } = await import("./route-chunks");
    const snapshots: string[] = [];
    subscribeNavigation(() => snapshots.push(navigationSnapshot()));
    beginNavigation("/saved");
    finishNavigation();
    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("");
    expect(snapshots).not.toContain("/saved");
  });

  it("keeps only the latest start and clears visible progress on completion", async () => {
    const { beginNavigation, finishNavigation, navigationSnapshot } = await import("./route-chunks");
    beginNavigation("/saved");
    beginNavigation("/check");
    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("/check");
    finishNavigation();
    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("");
  });

  it("supports unsubscribe before the deferred notification", async () => {
    const { beginNavigation, subscribeNavigation } = await import("./route-chunks");
    const notify = vi.fn();
    const unsubscribe = subscribeNavigation(notify);
    beginNavigation("/saved");
    unsubscribe();
    vi.runOnlyPendingTimers();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("lazy route progress", () => {
  it("shows progress while a programmatic lazy navigation is blocked, until RouteReady", async () => {
    const module = deferredModule();
    importer.mockReturnValue(module.promise);
    const { chunks, finishNavigation, navigationSnapshot } = await import("./route-chunks");
    let resolved = false;
    const loading = chunks.Lab.load();
    void loading.then(() => { resolved = true; });
    await Promise.resolve();
    expect(navigationSnapshot()).toBe("");
    vi.runOnlyPendingTimers();
    expect(resolved).toBe(false);
    expect(navigationSnapshot()).toBe("/lab");
    module.resolve();
    await loading;
    // Resolving the import alone is not a route commit.
    expect(navigationSnapshot()).toBe("/lab");
    finishNavigation();
    expect(navigationSnapshot()).toBe("");
  });

  it("does not resurrect progress after a fast lazy route commits", async () => {
    importer.mockResolvedValue({ default: () => null });
    const { chunks, finishNavigation, navigationSnapshot } = await import("./route-chunks");
    await chunks.Lab.load();
    finishNavigation();
    await Promise.resolve();
    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("");
  });

  it("does not start progress when prefetch finishes or a prefetched route loads", async () => {
    importer.mockResolvedValue({ default: () => null });
    const { chunks, navigationSnapshot } = await import("./route-chunks");
    await chunks.Lab.prefetch();
    await chunks.Lab.load();
    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight prefetch while still showing slow navigation progress", async () => {
    const module = deferredModule();
    importer.mockReturnValue(module.promise);
    const { chunks, finishNavigation, navigationSnapshot } = await import("./route-chunks");
    const prefetched = chunks.Lab.prefetch();
    const loading = chunks.Lab.load();
    expect(loading).toBe(prefetched);
    vi.runOnlyPendingTimers();
    expect(navigationSnapshot()).toBe("/lab");
    module.resolve();
    await loading;
    finishNavigation();
    expect(navigationSnapshot()).toBe("");
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
