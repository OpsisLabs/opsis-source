import { afterEach, describe, expect, it, vi } from "vitest";
import { codeReloadState, isLoadFailure, refetchPageCode, reloadAfterCodeFailure } from "./load-recovery";

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
  it("records before reloading and reloads only once", async () => {
    const reload = vi.fn();
    const history = { state: { idx: 2 }, replaceState: vi.fn((state) => { history.state = state; }) };
    vi.stubGlobal("window", { history, location: { reload, origin: "https://opsis.example" } });
    vi.stubGlobal("document", { querySelectorAll: () => [] });
    reloadAfterCodeFailure();
    reloadAfterCodeFailure();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.state).toMatchObject({ idx: 2, opsisCodeReloadAt: expect.any(Number) });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(history.replaceState.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  });
});

describe("fresh code before a reload", () => {
  const origin = "https://opsis.example";
  const link = (href: string) => ({ href });

  it("fetches each of the page's own code and style links once, past the cache", async () => {
    const fetcher = vi.fn(async () => undefined);
    await refetchPageCode([link(`${origin}/assets/Research-a.js`), link(`${origin}/assets/Research-a.js`), link(`${origin}/assets/index-b.css`), link("https://other.example/x.js")], origin, fetcher);
    expect(fetcher.mock.calls).toEqual([
      [`${origin}/assets/Research-a.js`, { cache: "reload", credentials: "same-origin" }],
      [`${origin}/assets/index-b.css`, { cache: "reload", credentials: "same-origin" }],
    ]);
  });

  it("does nothing without links and tolerates failed fetches", async () => {
    const fetcher = vi.fn(async () => { throw new Error("offline"); });
    await refetchPageCode([], origin, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(refetchPageCode([link(`${origin}/assets/a.js`)], origin, fetcher)).resolves.toBeUndefined();
  });

  it("stops waiting after the limit when the connection is still down", async () => {
    const started = Date.now();
    await refetchPageCode([link(`${origin}/assets/a.js`)], origin, () => new Promise(() => undefined), 30);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("asks for at most eighty files", async () => {
    const fetcher = vi.fn(async () => undefined);
    await refetchPageCode(Array.from({ length: 200 }, (_, index) => link(`${origin}/assets/${index}.js`)), origin, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(80);
  });
});
