import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalize } from "@rh-chain/shared";
import { fetchDataset, fetchDatasetManifest } from "./data";
import {
  hashBytes,
  makeSqlRun,
  parseSqlRun,
  replayMatches,
  verifyDatasetBytes,
  type SqlResult,
} from "./model";
import { startSqlRun as startRun } from "./runner";
import { dataset } from "./fixture.test-support";
const startSqlRun = (...args: Parameters<typeof startRun>) =>
  startRun(args[0], args[1], args[2], args[3], args[4], args[5], true);
const bytes = new Uint8Array([1, 2, 3]);
const result: SqlResult = {
  columns: [{ name: "amount0", type: "Utf8" }],
  rows: [["9007199254740993123456789"]],
  truncated: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("SQL file and run commitments", () => {
  it("refuses a tampered file before engine creation", async () => {
    const hash = await hashBytes(bytes);
    await expect(verifyDatasetBytes(bytes, hash)).resolves.toBeUndefined();
    await expect(
      verifyDatasetBytes(new Uint8Array([1, 2, 4]), hash),
    ).rejects.toMatchObject({ code: "hashError" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 4]))),
    );
    const factory = vi.fn();
    await expect(
      startSqlRun([{ ...dataset, sha256: hash }], "SELECT 1", 10_000, factory)
        .promise,
    ).rejects.toMatchObject({ code: "hashError" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("commits canonical result types and ordered rows deterministically", async () => {
    const a = await makeSqlRun(
      [dataset],
      "SELECT amount0 FROM example_swaps",
      "v1.4.3",
      10_000,
      result,
    );
    const b = await makeSqlRun(
      [dataset],
      a.manifest.query,
      "v1.4.3",
      10_000,
      JSON.parse(canonicalize(result)),
    );
    expect(a.manifest).toEqual(b.manifest);
    expect(parseSqlRun(JSON.parse(canonicalize(a.manifest)))).toEqual(
      a.manifest,
    );
    const changed = await makeSqlRun(
      [dataset],
      a.manifest.query,
      "v1.4.3",
      10_000,
      { ...result, rows: [["9007199254740993123456790"]] },
    );
    expect(changed.manifest.resultSha256).not.toBe(a.manifest.resultSha256);
    for (const patch of [
      { duckdbVersion: "v9.0.0" },
      { rowCount: 0 },
      { query: "SELECT 2" },
      { resultLimit: 1 },
      { truncated: true },
    ])
      expect(replayMatches(a.manifest, { ...a.manifest, ...patch })).toBe(
        false,
      );
    for (const patch of [
      { extra: true },
      { resultSha256: "bad" },
      { resultLimit: 10_001 },
      { rowCount: -1 },
      { query: "LOAD x" },
      { datasets: [a.manifest.datasets[0], a.manifest.datasets[0]] },
      { truncated: true },
    ])
      expect(() => parseSqlRun({ ...a.manifest, ...patch })).toThrow();
  });
  it("fetches only fixed same-origin files with redirects and credentials refused", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response("<html/>", { headers: { "content-type": "text/html" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: 1, datasets: [dataset] })),
      )
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await fetchDatasetManifest(signal, true)).toBeNull();
    expect(await fetchDatasetManifest(signal, true)).toBeNull();
    expect((await fetchDatasetManifest(signal, true))?.datasets).toHaveLength(
      1,
    );
    await fetchDataset({ ...dataset, sha256: await hashBytes(bytes) }, signal);
    expect(fetch).toHaveBeenLastCalledWith(
      "/data/opsis/example_swaps.parquet",
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal,
      }),
    );
    expect(
      fetch.mock.calls.every(([url]) => url.startsWith("/data/opsis/")),
    ).toBe(true);
    await expect(
      fetchDataset({ ...dataset, fileName: "../private" }, signal),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("refuses corrupt manifests, unavailable/oversized files and counts above the selection bound", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}")));
    await expect(
      fetchDatasetManifest(new AbortController().signal, true),
    ).rejects.toMatchObject({ code: "manifestError" });
    for (const response of [
      new Response(null, { status: 500 }),
      new Response(bytes, { headers: { "content-length": "33554433" } }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(
        fetchDataset(dataset, new AbortController().signal),
      ).rejects.toMatchObject({ code: "fileError" });
    }
    const factory = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() =>
      startSqlRun([dataset], "INSTALL httpfs", 10_000, factory),
    ).toThrow();
    expect(() => startSqlRun([], "SELECT 1", 10_000, factory)).toThrow();
    expect(() =>
      startSqlRun(Array(5).fill(dataset), "SELECT 1", 10_000, factory),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });
  it("replays at the worker boundary and refuses changed inputs, results and engine versions", async () => {
    const data = { ...dataset, sha256: await hashBytes(bytes) };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(bytes)),
    );
    const terminate = vi.fn();
    const engineRun = vi.fn().mockResolvedValue({ version: "v1.4.3", result });
    const factory = () => ({ run: engineRun, terminate });
    const first = await startSqlRun([data], "SELECT 1", 10_000, factory)
      .promise;
    await expect(
      startSqlRun([data], first.manifest.query, 10_000, factory, first.manifest)
        .promise,
    ).resolves.toEqual(first);
    engineRun.mockResolvedValueOnce({ version: "v9.0.0", result });
    await expect(
      startSqlRun([data], first.manifest.query, 10_000, factory, first.manifest)
        .promise,
    ).rejects.toMatchObject({ code: "replayError" });
    engineRun.mockResolvedValueOnce({
      version: "v1.4.3",
      result: { ...result, rows: [["changed"]] },
    });
    await expect(
      startSqlRun([data], first.manifest.query, 10_000, factory, first.manifest)
        .promise,
    ).rejects.toMatchObject({ code: "replayError" });
    expect(() =>
      startSqlRun(
        [dataset],
        first.manifest.query,
        10_000,
        factory,
        first.manifest,
      ),
    ).toThrow();
    expect(terminate).toHaveBeenCalledTimes(4);
  });
  it("cancels and times out the actual engine owner, terminating it and aborting pending loads", async () => {
    const data = { ...dataset, sha256: await hashBytes(bytes) };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(bytes)),
    );
    for (const action of ["cancel", "timeout"]) {
      vi.useFakeTimers();
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const terminate = vi.fn();
      const job = startSqlRun(
        [data],
        "SELECT 1",
        10_000,
        () => ({
          run: () => {
            started();
            return new Promise(() => {});
          },
          terminate,
        }),
        undefined,
        50,
      );
      const rejection = expect(job.promise).rejects.toMatchObject({
        code: action === "cancel" ? "cancelled" : "timeout",
      });
      await ready;
      if (action === "cancel") job.cancel();
      else await vi.advanceTimersByTimeAsync(51);
      await rejection;
      expect(terminate).toHaveBeenCalled();
      vi.useRealTimers();
    }
    const fetch = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const factory = vi.fn();
    const pending = startSqlRun([data], "SELECT 1", 10_000, factory);
    const rejected = expect(pending.promise).rejects.toMatchObject({
      code: "cancelled",
    });
    pending.cancel();
    await rejected;
    expect(factory).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
