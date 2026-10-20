import { afterEach, describe, expect, it, vi } from "vitest";
import { chunks, finishNavigation, navigationSnapshot, prefetchRoute } from "./route-chunks";
import { importPage } from "../product/page-imports";

vi.mock("../product/page-imports", () => ({ importPage: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); finishNavigation(); });

describe("route chunk loading", () => {
  it("shares pending prefetches, clears final failures and retains navigation progress", async () => {
    const failure = new TypeError("Importing a module script failed.");
    vi.mocked(importPage).mockRejectedValueOnce(failure).mockResolvedValueOnce({ default: "page" });
    const first = chunks.Research.prefetch();
    expect(chunks.Research.prefetch()).toBe(first);
    await expect(first).rejects.toBe(failure);
    const next = chunks.Research.load();
    await expect(next).resolves.toEqual({ default: "page" });
    expect(navigationSnapshot()).toBe("/research");
    expect(importPage).toHaveBeenCalledTimes(2);
    finishNavigation();
    expect(chunks.Research.load()).toBe(next);
    await Promise.resolve();
    expect(navigationSnapshot()).toBe("");
  });
  it("absorbs background prefetch failures so a later load can try again", async () => {
    vi.mocked(importPage).mockRejectedValueOnce(new TypeError("Importing a module script failed.")).mockResolvedValueOnce({ default: "guide" });
    prefetchRoute("/guide");
    await expect(chunks.Guide.prefetch()).rejects.toThrow("Importing a module script failed.");
    await expect(chunks.Guide.load()).resolves.toEqual({ default: "guide" });
    expect(importPage).toHaveBeenCalledTimes(2);
  });
});

it("loads Launch Radar through the guarded page importer", async () => {
  vi.mocked(importPage).mockResolvedValueOnce({ default: "launch feed" });
  expect(chunks.LaunchRadar.path).toBe("/research/launches");
  await expect(chunks.LaunchRadar.load()).resolves.toEqual({ default: "launch feed" });
  expect(importPage).toHaveBeenCalledWith("/src/opsis/LaunchRadar.tsx", expect.any(Function));
});
