import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { exportSnapshot } from "./open-data-export.mjs";
const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/open-data/swaps.json", import.meta.url),
    "utf8",
  ),
);
const metadata = JSON.parse(
  await readFile(
    new URL("./fixtures/open-data/metadata.json", import.meta.url),
    "utf8",
  ),
);

test("fixed Swap fixture has a pinned CSV hash, independent of snapshot order", async () => {
  const a = await exportSnapshot(fixture, metadata);
  const b = await exportSnapshot([...fixture].reverse(), metadata);
  assert.deepEqual(a, b);
  assert.equal(
    a.report.sha256,
    "8da0569f3c8403bf5c12345b3c77c64cb71779c737fe0afe16cd684abf44225c",
  );
  const csv = new TextDecoder().decode(a.bytes);
  assert.ok(csv.includes(`"${fixture[0].amount0}"`));
  assert.ok(csv.includes(`"${fixture[0].amount1}"`));
  assert.equal(a.report.targetFormat, "parquet");
  assert.equal(a.report.rowCount, 2);
  assert.equal(a.manifest, undefined);
});
test("rejects malformed, duplicate, conflicting and out-of-range observations before exporting", async () => {
  for (const rows of [
    [{ ...fixture[0], amount0: 42 }],
    [{ ...fixture[0], amount1: "-0" }],
    [{ ...fixture[0], blockNumber: "102" }],
    [{ ...fixture[0], blockNumber: 100 }],
    [{ ...fixture[0], extra: true }],
    [fixture[0], fixture[0]],
    [
      fixture[0],
      { ...fixture[0], logIndex: 3, blockHash: `0x${"33".repeat(32)}` },
    ],
  ])
    await assert.rejects(exportSnapshot(rows, metadata));
  await assert.rejects(exportSnapshot(fixture, { ...metadata, id: "../bad" }));
});
test("manual CLI writes only local CSV and Parquet target metadata, refusing overwrite", async () => {
  const output = await mkdtemp(join(tmpdir(), "opsis-dataset-test-"));
  try {
    const args = [
      "scripts/open-data-export.mjs",
      "scripts/fixtures/open-data/swaps.json",
      "scripts/fixtures/open-data/metadata.json",
      output,
    ];
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const files = await readdir(output);
    assert.equal(files.length, 2);
    assert.ok(files.includes("parquet-target.json"));
    assert.ok(files.some((f) => f.endsWith(".csv")));
    assert.equal(spawnSync(process.execPath, args).status, 1);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
