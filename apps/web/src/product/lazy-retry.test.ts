import { afterEach, describe, expect, it, vi } from "vitest";
import { retryImport } from "./lazy-retry";

afterEach(() => vi.useRealTimers());

describe("retrying a page import", () => {
  it.each([1, 2, 3])("succeeds on attempt %s with only the necessary delays", async (attempt) => {
    const module = { default: "page" };
    const importer = vi.fn<() => Promise<typeof module>>();
    for (let i = 1; i < attempt; i++) importer.mockRejectedValueOnce(new TypeError("download interrupted"));
    importer.mockResolvedValue(module);
    const wait = vi.fn(async () => {});
    await expect(retryImport(importer, wait)()).resolves.toBe(module);
    expect(importer).toHaveBeenCalledTimes(attempt);
    expect(wait.mock.calls).toEqual([600, 1500].slice(0, attempt - 1).map((milliseconds) => [milliseconds]));
  });

  it("rejects with the final error after three attempts", async () => {
    const last = new Error("last failure");
    const importer = vi.fn().mockRejectedValueOnce(new Error("first")).mockRejectedValueOnce(new Error("second")).mockRejectedValueOnce(last);
    const wait = vi.fn(async () => {});
    await expect(retryImport(importer, wait)()).rejects.toBe(last);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[600], [1500]]);
  });

  it("uses the default 600 ms and 1500 ms timers", async () => {
    vi.useFakeTimers();
    const importer = vi.fn().mockRejectedValueOnce(new Error()).mockRejectedValueOnce(new Error()).mockResolvedValue("page");
    const pending = retryImport(importer)();
    await vi.advanceTimersByTimeAsync(599);
    expect(importer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(importer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1499);
    expect(importer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("page");
  });
});
