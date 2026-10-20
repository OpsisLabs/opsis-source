import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalize,
  parseOpenDatasetManifest,
} from "../packages/shared/dist/index.js";

function snapshotRows(value, metadata) {
  if (!Array.isArray(value) || value.length > 100_000)
    throw new Error("Invalid snapshot");
  if (metadata.range.kind !== "block")
    throw new Error("Swap snapshots require a block range");
  const seen = new Set();
  const hashes = new Map();
  return value
    .map((row) => {
      if (
        !row ||
        Object.keys(row).sort().join() !==
          "amount0,amount1,blockHash,blockNumber,logIndex,pool" ||
        !/^(0|[1-9]\d{0,19})$/.test(row.blockNumber) ||
        typeof row.blockNumber !== "string" ||
        !/^0x[a-f0-9]{64}$/.test(row.blockHash) ||
        !/^0x[a-f0-9]{40}$/.test(row.pool) ||
        !Number.isSafeInteger(row.logIndex) ||
        row.logIndex < 0 ||
        row.logIndex > 1_000_000 ||
        [row.amount0, row.amount1].some(
          (v) => typeof v !== "string" || !/^(0|-?[1-9]\d{0,77})$/.test(v),
        )
      )
        throw new Error("Invalid Swap observation");
      if (
        BigInt(row.blockNumber) < BigInt(metadata.range.from) ||
        BigInt(row.blockNumber) > BigInt(metadata.range.to)
      )
        throw new Error("Observation outside range");
      const identity = `${row.blockNumber}:${row.logIndex}`;
      if (
        seen.has(identity) ||
        (hashes.has(row.blockNumber) &&
          hashes.get(row.blockNumber) !== row.blockHash)
      )
        throw new Error("Duplicate or conflicting observation");
      seen.add(identity);
      hashes.set(row.blockNumber, row.blockHash);
      return row;
    })
    .sort((a, b) =>
      BigInt(a.blockNumber) < BigInt(b.blockNumber)
        ? -1
        : BigInt(a.blockNumber) > BigInt(b.blockNumber)
          ? 1
          : a.logIndex - b.logIndex,
    );
}
export async function exportSnapshot(snapshot, metadata) {
  // Validate metadata before it can enter SQL. Output fields are derived here.
  const candidate = {
    ...metadata,
    rowCount: 0,
    fileName: `${metadata.id}.parquet`,
    sha256: "0".repeat(64),
  };
  parseOpenDatasetManifest({ version: 1, datasets: [candidate] });
  const rows = snapshotRows(snapshot, metadata);
  const columns = [
    "blockNumber",
    "blockHash",
    "logIndex",
    "pool",
    "amount0",
    "amount1",
  ];
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv =
    [columns, ...rows.map((row) => columns.map((key) => row[key]))]
      .map((row) => row.map(quote).join(","))
      .join("\r\n") + "\r\n";
  const bytes = new TextEncoder().encode(csv);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // This is a conversion target, never a publishable Parquet manifest entry.
  const report = {
    version: "opsis-dataset-csv-preparation/1",
    format: "csv",
    targetFormat: "parquet",
    metadata,
    rowCount: rows.length,
    fileName: `${metadata.id}-${sha256}.csv`,
    sha256,
    limitation:
      "The pinned offline EH engine lacks the Parquet extension. CSV is local preparation only; no published manifest is generated.",
  };
  return { bytes, report };
}
async function main() {
  const [snapshotFile, metadataFile, output] = process.argv.slice(2);
  if (!snapshotFile || !metadataFile || !output || process.argv.length !== 5)
    throw new Error(
      "Usage: node scripts/open-data-export.mjs <snapshot.json> <metadata.json> <output-directory>",
    );
  const result = await exportSnapshot(
    JSON.parse(await readFile(snapshotFile, "utf8")),
    JSON.parse(await readFile(metadataFile, "utf8")),
  );
  await mkdir(output, { recursive: true });
  // Exclusive creation protects any existing reviewed artifact from replacement.
  await writeFile(join(output, result.report.fileName), result.bytes, {
    flag: "wx",
  });
  await writeFile(
    join(output, "parquet-target.json"),
    canonicalize(result.report),
    { flag: "wx" },
  );
  console.log(
    "Local CSV and Parquet target metadata written; no publication performed.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "Dataset export failed. Check usage, snapshot, metadata and output destination.",
    );
    process.exitCode = 1;
  });
