import { afterEach, describe, expect, it, vi } from "vitest";
import { codeReloadState, isLoadFailure, listenForPreloadError, reloadAfterCodeFailure } from "./load-recovery";

afterEach(() => vi.unstubAllGlobals());

describe("code download failure detection", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.test/chunk.js",
    "Importing a module script failed.",
    "error loading dynamically imported module: https://example.test/chunk.js",
    "Unable to preload CSS for /assets/page.css",
  ])("recognizes %s", (message) => expect(isLoadFailure(new TypeError(message))).toBe(true));

  it.each([new Error("render bug"), new TypeError("Failed to fetch"), new Error("A lookup failed: Failed to fetch dynamically imported module"), null, "Importing a module script failed."])("does not recover unrelated errors (%s)", (error) => {
    expect(isLoadFailure(error)).toBe(false);
  });
});

describe("history entry reload guard", () => {
  const now = 100_000;
  it("adds a marker while preserving router state", () => {
    const state = { idx: 3, key: "route", usr: { context: "public" } };
    expect(codeReloadState(state, now)).toEqual({ ...state, opsisCodeReloadAt: now });
    expect(state).not.toHaveProperty("opsisCodeReloadAt");
  });
  it("blocks a fresh marker", () => {
    expect(codeReloadState({ opsisCodeReloadAt: now }, now)).toBeNull();
    expect(codeReloadState({ opsisCodeReloadAt: now - 29_999 }, now)).toBeNull();
  });
  it("replaces a stale marker at the thirty-second boundary", () => {
    expect(codeReloadState({ opsisCodeReloadAt: now - 30_000, idx: 1 }, now)).toEqual({ opsisCodeReloadAt: now, idx: 1 });
  });
  it.each([null, undefined, "bad state", 3, [], { opsisCodeReloadAt: "100000" }, { opsisCodeReloadAt: NaN }, { opsisCodeReloadAt: Infinity }, { opsisCodeReloadAt: -1 }, { opsisCodeReloadAt: now + 1 }])("handles malformed state (%s)", (state) => {
    expect(codeReloadState(state, now)).toHaveProperty("opsisCodeReloadAt", now);
  });
  it("records before reloading and reloads only once", () => {
    const reload = vi.fn();
    const history = { state: { idx: 2 }, replaceState: vi.fn((state) => { history.state = state; }) };
    vi.stubGlobal("window", { history, location: { reload } });
    reloadAfterCodeFailure();
    reloadAfterCodeFailure();
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.state).toMatchObject({ idx: 2, opsisCodeReloadAt: expect.any(Number) });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(history.replaceState.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  });
});

describe("Vite preload error handling", () => {
  it("prevents Vite throwing and delegates to the shell even when the root mounts later", () => {
    const events = new EventTarget();
    vi.stubGlobal("window", events);
    const shell = vi.fn(), root = vi.fn();
    const stopShell = listenForPreloadError({ shell: true, recover: shell });
    const stopRoot = listenForPreloadError({ shell: false, recover: root });
    const event = new Event("vite:preloadError", { cancelable: true });
    events.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(shell).toHaveBeenCalledTimes(1);
    expect(root).not.toHaveBeenCalled();
    stopShell();
    events.dispatchEvent(new Event("vite:preloadError"));
    expect(root).toHaveBeenCalledTimes(1);
    stopRoot();
    events.dispatchEvent(new Event("vite:preloadError"));
    expect(root).toHaveBeenCalledTimes(1);
  });
});
