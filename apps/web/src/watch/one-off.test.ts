import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPublicWallet } from "./one-off";
import { WATCH_TEST_ADDRESS, watchFixture } from "./fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Watch one-off public lookup", () => {
  it("returns a validated snapshot without opening IndexedDB or writing localStorage", async () => {
    const open = vi.spyOn(indexedDB, "open");
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const add = vi.spyOn(IDBObjectStore.prototype, "add");
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const snapshot = watchFixture();
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(snapshot), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await checkPublicWallet(WATCH_TEST_ADDRESS)).toEqual(snapshot);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/v1/private/watch/snapshot");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      address: WATCH_TEST_ADDRESS,
    });
    expect(open).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
  it("rejects invalid input before a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(checkPublicWallet("invalid")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects mismatched snapshots and provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ...watchFixture(),
              address: `0x${"2".repeat(40)}`,
            }),
          ),
        )
        .mockResolvedValueOnce(new Response("{}", { status: 503 })),
    );
    await expect(checkPublicWallet(WATCH_TEST_ADDRESS)).rejects.toThrow();
    await expect(checkPublicWallet(WATCH_TEST_ADDRESS)).rejects.toThrow();
  });
});
