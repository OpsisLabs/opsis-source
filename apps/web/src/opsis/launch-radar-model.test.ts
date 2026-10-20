import { afterEach, describe, expect, it, vi } from "vitest";
import type { LaunchEntry, LaunchFeed } from "./launch-model";
import {
  filterLaunches,
  launchRowKey,
  startLaunchRadar,
  type LaunchRadarState,
  type LaunchWindow,
} from "./launch-radar-model";

const row = (adapter: string, digit = "a"): LaunchEntry => ({
  adapter,
  token: `0x${digit.repeat(40)}`,
  launchpad: "Fixture launchpad",
  deployer: null,
  created: { blockNumber: 100, timestamp: "2026-10-20T00:00:00.000Z" },
  t0: null,
  unknownReasons: {},
});
const feed = (entries: LaunchEntry[], minutes = 10): LaunchFeed => ({
  entries,
  minutes,
  anchor: { blockNumber: 100, timestamp: "2026-10-20T00:00:00.000Z" },
  observedAt: "2026-10-20T00:00:00.000Z",
  expiresAt: "2026-10-20T00:01:00.000Z",
  coverage: { state: "partial" },
});
const stops: Array<() => void> = [];
function setup(initialVisibility: DocumentVisibilityState = "visible") {
  vi.useFakeTimers();
  const visibility = Object.assign(new EventTarget(), {
    visibilityState: initialVisibility,
  });
  const read = vi
    .fn<(minutes: LaunchWindow, signal: AbortSignal) => Promise<LaunchFeed>>()
    .mockImplementation(async (minutes) => feed([row("pons")], minutes));
  const states: LaunchRadarState[] = [];
  const model = startLaunchRadar({
    visibility,
    read,
    onChange: (state) => states.push(state),
  });
  stops.push(model.stop);
  return {
    model,
    read,
    states,
    state: () => states.at(-1)!,
    visibility(value: DocumentVisibilityState) {
      visibility.visibilityState = value;
      visibility.dispatchEvent(new Event("visibilitychange"));
    },
  };
}
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});

describe("Launch Radar filters and refresh", () => {
  it("filters returned adapter IDs, grouping both Launcher adapters without inferring a frontend", () => {
    const entries = [
      row("pons"),
      row("long"),
      row("launcher"),
      row("instant"),
      row("unknown"),
    ];
    expect(filterLaunches(entries, "all")).toEqual(entries);
    expect(filterLaunches(entries, "pons")).toEqual([entries[0]]);
    expect(filterLaunches(entries, "long")).toEqual([entries[1]]);
    expect(filterLaunches(entries, "launcher")).toEqual(entries.slice(2, 4));
    expect(filterLaunches([], "pons")).toEqual([]);
    expect(entries).toHaveLength(5);
  });

  it("starts with live off, polls at 60 seconds only when enabled, and stops when disabled", async () => {
    const f = setup();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.state().ageSeconds).toBe(120);
    f.model.setLive(true);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(f.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.state().ageSeconds).toBe(0);
    f.model.setLive(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.read).toHaveBeenCalledTimes(2);
  });

  it("does no hidden-tab reads, aborts on hiding, and resumes live with a fresh request", async () => {
    const f = setup("hidden");
    f.model.setLive(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.read).not.toHaveBeenCalled();
    f.visibility("visible");
    expect(f.read).toHaveBeenCalledTimes(1);
    const signal = f.read.mock.calls[0]![1];
    f.visibility("hidden");
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.read).toHaveBeenCalledTimes(1);
    f.visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.state().feed).toBeDefined();
  });

  it("aborts overlapping reads and ignores late success and failure from superseded requests", async () => {
    const f = setup();
    await vi.advanceTimersByTimeAsync(0);
    let resolve!: (value: LaunchFeed) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const old = f.model.refresh();
    const signal = f.read.mock.calls.at(-1)![1];
    f.model.setMinutes(360);
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    resolve(feed([row("long")], 10));
    await old;
    expect(f.state().feed?.minutes).toBe(360);
    expect(f.state().newRows.size).toBe(0);
    let reject!: (reason: Error) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const failed = f.model.refresh();
    f.model.setMinutes(60);
    reject(new Error("Superseded read"));
    await failed;
    expect(f.state().error).toBe(false);
    expect(f.state().feed?.minutes).toBe(60);
  });

  it("aborts a slow polling request before starting the next interval", async () => {
    const f = setup();
    await vi.advanceTimersByTimeAsync(0);
    f.read.mockImplementation(() => new Promise(() => {}));
    f.model.setLive(true);
    await vi.advanceTimersByTimeAsync(60_000);
    const previous = f.read.mock.calls.at(-1)![1];
    await vi.advanceTimersByTimeAsync(60_000);
    expect(previous.aborted).toBe(true);
    expect(f.read).toHaveBeenCalledTimes(3);
  });

  it("marks only new events for one successful refresh and resets the baseline on window changes", async () => {
    const f = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.state().newRows.size).toBe(0);
    const added = row("launcher", "b");
    f.read.mockResolvedValue(feed([row("pons"), added]));
    await f.model.refresh();
    expect([...f.state().newRows]).toEqual([launchRowKey(added)]);
    await f.model.refresh();
    expect(f.state().newRows.size).toBe(0);
    f.model.setMinutes(60);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.state().newRows.size).toBe(0);
    expect(f.read.mock.calls.at(-1)![0]).toBe(60);
    expect(launchRowKey(row("pons"))).toBe(
      launchRowKey({
        ...row("pons"),
        token: row("pons").token.toUpperCase(),
        created: { blockNumber: 100, timestamp: null },
      }),
    );
    expect(launchRowKey(added)).not.toBe(
      launchRowKey({
        ...added,
        created: { ...added.created, logIndex: 1 },
      }),
    );
  });

  it("keeps the previous read and age on failure, pauses live, and permits an explicit retry", async () => {
    const f = setup();
    await vi.advanceTimersByTimeAsync(0);
    const previous = f.state();
    f.model.setLive(true);
    f.read.mockRejectedValueOnce(new Error("Read limit"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.state()).toMatchObject({
      error: true,
      live: false,
      updatedAt: previous.updatedAt,
      feed: previous.feed,
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.read).toHaveBeenCalledTimes(2);
    await f.model.refresh();
    expect(f.state().error).toBe(false);
    expect(f.state().ageSeconds).toBe(0);
  });

  it("cleans up requests, timers and visibility listeners on unmount", async () => {
    const f = setup();
    const signal = f.read.mock.calls[0]![1];
    f.model.setLive(true);
    f.model.stop();
    const updates = f.states.length;
    expect(signal.aborted).toBe(true);
    f.visibility("hidden");
    f.visibility("visible");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.states).toHaveLength(updates);
    expect(vi.getTimerCount()).toBe(0);
  });
});
