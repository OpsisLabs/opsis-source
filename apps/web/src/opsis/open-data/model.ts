import {
  canonicalize,
  sha256,
  type Json,
  type OpenDataset,
} from "@rh-chain/shared";
import { guardQuery } from "./query-guard";
export const RESULT_LIMIT = 10_000;
export const TIME_LIMIT_MS = 30_000;
export type SqlResult = {
  columns: { name: string; type: string }[];
  rows: Json[][];
  truncated: boolean;
};
export type LocalRef = {
  kind: "local";
  name: string;
  sha256: string;
  bytes: number;
};
export type RunInput = { id: string; sha256: string } | LocalRef;
export type LocalFile = LocalRef & { id: string; buffer: Uint8Array };
export type SqlInput = OpenDataset | LocalFile;
export type TableInfo = {
  name: string;
  rowCount: string;
  columns: { name: string; type: string }[];
};
export type SqlRunManifest = {
  version: "opsis-sql-run/1";
  datasets: RunInput[];
  query: string;
  duckdbVersion: string;
  resultLimit: number;
  rowCount: number;
  truncated: boolean;
  resultSha256: string;
};
export type SqlRun = {
  result: SqlResult;
  manifest: SqlRunManifest;
  tables?: TableInfo[];
};
export type ErrorCode =
  | "localLimit"
  | "csvError"
  | "unavailable"
  | "parquetUnavailable"
  | "manifestError"
  | "fileError"
  | "hashError"
  | "refused"
  | "timeout"
  | "cancelled"
  | "engineError"
  | "unsupported"
  | "replayError";
export class OpenDataError extends Error {
  readonly code: ErrorCode;
  readonly fileName?: string;
  constructor(code: ErrorCode, fileName?: string) {
    super(code);
    this.code = code;
    this.fileName = fileName;
  }
}
export const hashBytes = async (bytes: Uint8Array) =>
  (await sha256(bytes)).slice(2);
export async function verifyDatasetBytes(
  bytes: Uint8Array,
  expected: string,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(expected) || (await hashBytes(bytes)) !== expected)
    throw new OpenDataError("hashError");
}
export async function makeSqlRun(
  datasets: SqlInput[],
  query: string,
  duckdbVersion: string,
  resultLimit: number,
  result: SqlResult,
): Promise<SqlRun> {
  return {
    result,
    manifest: {
      version: "opsis-sql-run/1",
      datasets: inputRefs(datasets),
      query,
      duckdbVersion,
      resultLimit,
      rowCount: result.rows.length,
      truncated: result.truncated,
      resultSha256: await hashBytes(
        new TextEncoder().encode(canonicalize(result)),
      ),
    },
  };
}
export function parseSqlRun(value: unknown): SqlRunManifest {
  const bad = (): never => {
    throw new OpenDataError("replayError");
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const r = value as SqlRunManifest;
  if (
    Object.keys(r).sort().join() !==
      "datasets,duckdbVersion,query,resultLimit,resultSha256,rowCount,truncated,version" ||
    r.version !== "opsis-sql-run/1" ||
    !Array.isArray(r.datasets) ||
    !r.datasets.length ||
    r.datasets.length > 4 ||
    r.datasets.some((d) => !validRef(d)) ||
    (r.datasets.some((d) => "kind" in d) &&
      !r.datasets.every((d) => "kind" in d)) ||
    (r.datasets.every((d) => "kind" in d) &&
      r.datasets.reduce((n, d) => n + ("bytes" in d ? d.bytes : 0), 0) >
        100_000_000) ||
    (r.datasets.every((d) => "id" in d) &&
      new Set(r.datasets.map((d) => ("id" in d ? d.id : ""))).size !==
        r.datasets.length) ||
    typeof r.query !== "string" ||
    typeof r.duckdbVersion !== "string" ||
    !/^v?\d+\.\d+\.\d+(?:[a-z0-9.+-]*)$/.test(r.duckdbVersion) ||
    !Number.isInteger(r.resultLimit) ||
    r.resultLimit < 1 ||
    r.resultLimit > RESULT_LIMIT ||
    !Number.isInteger(r.rowCount) ||
    r.rowCount < 0 ||
    r.rowCount > r.resultLimit ||
    typeof r.truncated !== "boolean" ||
    (r.truncated && r.rowCount !== r.resultLimit) ||
    typeof r.resultSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(r.resultSha256)
  )
    return bad();
  try {
    guardQuery(r.query);
    canonicalize(r);
  } catch {
    return bad();
  }
  return r;
}
export function replayMatches(
  expected: SqlRunManifest,
  actual: SqlRunManifest,
): boolean {
  // Published order is immaterial. Local order derives deduplicated table names;
  // result row order is always part of the commitment.
  const normalize = (r: SqlRunManifest) => ({
    ...r,
    datasets: r.datasets.some((d) => "kind" in d)
      ? r.datasets
      : [...r.datasets].sort((a, b) =>
          "id" in a && "id" in b && a.id < b.id ? -1 : 1,
        ),
  });
  return canonicalize(normalize(expected)) === canonicalize(normalize(actual));
}

function validRef(d: RunInput): boolean {
  if (
    !d ||
    typeof d !== "object" ||
    Array.isArray(d) ||
    typeof d.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(d.sha256)
  )
    return false;
  if ("kind" in d)
    return (
      Object.keys(d).sort().join() === "bytes,kind,name,sha256" &&
      d.kind === "local" &&
      typeof d.name === "string" &&
      d.name.length > 0 &&
      d.name.length <= 255 &&
      !Array.from(d.name).some(
        (c) => c.charCodeAt(0) < 32 || c === "/" || c === "\\",
      ) &&
      /\.csv$/i.test(d.name) &&
      Number.isInteger(d.bytes) &&
      d.bytes > 0 &&
      d.bytes <= 50_000_000
    );
  return (
    Object.keys(d).sort().join() === "id,sha256" &&
    typeof d.id === "string" &&
    /^[a-z][a-z0-9_]{0,62}$/.test(d.id)
  );
}
export function inputRefs(inputs: SqlInput[]): RunInput[] {
  if (inputs.some((d) => "kind" in d))
    return inputs.map((d) => {
      if (!("kind" in d)) throw new OpenDataError("refused");
      return { kind: "local", name: d.name, sha256: d.sha256, bytes: d.bytes };
    });
  return inputs
    .map(({ id, sha256 }) => ({ id, sha256 }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function inputsMatch(expected: RunInput[], inputs: SqlInput[]): boolean {
  return (
    canonicalize(
      expected.some((d) => "kind" in d)
        ? expected
        : [...expected].sort((a, b) =>
            "id" in a && "id" in b && a.id < b.id ? -1 : 1,
          ),
    ) === canonicalize(inputRefs(inputs))
  );
}
