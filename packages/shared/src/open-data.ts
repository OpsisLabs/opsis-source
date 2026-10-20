/** Public dataset metadata only. No query or private input is accepted by a server. */
export type OpenDataset = {
  id: string;
  title: string;
  source: string;
  chain: { id: 4663; name: "Robinhood Chain" };
  range:
    | { kind: "block"; from: string; to: string }
    | { kind: "time"; from: string; to: string };
  rowCount: number;
  fileName: string;
  sha256: string;
  generatedAt: string;
  codeSha: string;
  limitations: string[];
};
export type OpenDatasetManifest = { version: 1; datasets: OpenDataset[] };
const invalid = (): never => {
  throw new Error("Invalid dataset manifest");
};
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    return invalid();
  return value as Record<string, unknown>;
}
const text = (value: unknown, max = 1000): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const timestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
export function parseOpenDatasetManifest(value: unknown): OpenDatasetManifest {
  const manifest = object(value, ["version", "datasets"]);
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.datasets) ||
    manifest.datasets.length > 32
  )
    return invalid();
  const ids = new Set<string>(),
    files = new Set<string>();
  for (const raw of manifest.datasets) {
    const d = object(raw, [
      "id",
      "title",
      "source",
      "chain",
      "range",
      "rowCount",
      "fileName",
      "sha256",
      "generatedAt",
      "codeSha",
      "limitations",
    ]);
    const chain = object(d.chain, ["id", "name"]);
    const range = object(d.range, ["kind", "from", "to"]);
    if (
      typeof d.id !== "string" ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(d.id) ||
      ids.has(d.id) ||
      !text(d.title, 200) ||
      !text(d.source) ||
      chain.id !== 4663 ||
      chain.name !== "Robinhood Chain" ||
      !Number.isSafeInteger(d.rowCount) ||
      (d.rowCount as number) < 0 ||
      (d.rowCount as number) > 10_000_000 ||
      typeof d.fileName !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,150}\.parquet$/.test(d.fileName) ||
      files.has(d.fileName) ||
      typeof d.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(d.sha256) ||
      !timestamp(d.generatedAt) ||
      typeof d.codeSha !== "string" ||
      !/^[a-f0-9]{40}$/.test(d.codeSha) ||
      !Array.isArray(d.limitations) ||
      d.limitations.length < 1 ||
      d.limitations.length > 32 ||
      !d.limitations.every((v) => text(v))
    )
      return invalid();
    if (range.kind === "block") {
      if (
        typeof range.from !== "string" ||
        typeof range.to !== "string" ||
        !/^(0|[1-9]\d{0,19})$/.test(range.from) ||
        !/^(0|[1-9]\d{0,19})$/.test(range.to) ||
        BigInt(range.from) > BigInt(range.to)
      )
        return invalid();
    } else if (range.kind === "time") {
      if (
        !timestamp(range.from) ||
        !timestamp(range.to) ||
        range.from > range.to ||
        range.to > d.generatedAt
      )
        return invalid();
    } else return invalid();
    ids.add(d.id);
    files.add(d.fileName);
  }
  return value as OpenDatasetManifest;
}
