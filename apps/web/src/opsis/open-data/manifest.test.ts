import { describe, expect, it } from "vitest";
import { parseOpenDatasetManifest } from "@rh-chain/shared";
import { dataset } from "./fixture.test-support";
describe("published dataset manifest", () => {
  it("accepts versioned empty and block/time manifests", () => {
    expect(
      parseOpenDatasetManifest({ version: 1, datasets: [] }).datasets,
    ).toEqual([]);
    expect(
      parseOpenDatasetManifest({ version: 1, datasets: [dataset] }).datasets,
    ).toHaveLength(1);
    const time = {
      ...dataset,
      range: {
        kind: "time",
        from: "2026-10-18T00:00:00.000Z",
        to: dataset.generatedAt,
      },
    };
    expect(
      parseOpenDatasetManifest({ version: 1, datasets: [time] }).datasets,
    ).toHaveLength(1);
  });
  it.each([
    { unknown: true },
    { sha256: "f".repeat(63) },
    { sha256: "A".repeat(64) },
    { sha256: `0x${"f".repeat(64)}` },
    { codeSha: "abc123" },
    { generatedAt: "2026-02-30T00:00:00.000Z" },
    { generatedAt: "2026-10-19" },
    { fileName: "../data.parquet" },
    { fileName: "https://example.invalid/file.parquet" },
    { fileName: "x.csv" },
    { id: 'x"; DROP TABLE x' },
    { chain: { id: 1, name: "unknown" } },
    { chain: { ...dataset.chain, extra: true } },
    { range: { kind: "block", from: "102", to: "100" } },
    { range: { kind: "block", from: "01", to: "100" } },
    { range: { kind: "block", from: "100", to: "101", extra: true } },
    { range: { kind: "block", from: 100, to: 101 } },
    {
      range: {
        kind: "time",
        from: "2026-10-19T00:00:00.000Z",
        to: "2026-10-20T00:00:00.000Z",
      },
    },
    {
      range: {
        kind: "time",
        from: "2026-10-18T00:00:00.000Z",
        to: "2026-10-17T00:00:00.000Z",
      },
    },
    { rowCount: -1 },
    { rowCount: 1.5 },
    { rowCount: Number.MAX_SAFE_INTEGER + 1 },
    { limitations: [] },
    { limitations: [""] },
  ])("rejects malformed or inconsistent entry %j", (patch) => {
    expect(() =>
      parseOpenDatasetManifest({
        version: 1,
        datasets: [{ ...dataset, ...patch }],
      }),
    ).toThrow();
  });
  it("rejects unknown versions, root fields, duplicate IDs/files and oversized lists", () => {
    for (const value of [
      null,
      [],
      { version: 2, datasets: [] },
      { version: 1, datasets: [], extra: 1 },
      { version: 1, datasets: [dataset, dataset] },
      { version: 1, datasets: [dataset, { ...dataset, id: "other" }] },
      { version: 1, datasets: Array(33).fill(dataset) },
    ])
      expect(() => parseOpenDatasetManifest(value)).toThrow();
  });
});
