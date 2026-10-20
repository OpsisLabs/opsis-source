import { opsisPreviewAuthorization } from "./preview-token";
export type LaunchFact = {
  state: "unknown" | "unavailable" | "available" | "partial";
  reason?: string;
  value?: unknown;
  coverage?: Record<string, unknown>;
};
export type LaunchEntry = {
  token: string;
  launchpad: string;
  deployer: string | null;
  created: { timestamp: string | null; blockNumber?: number };
  t0: { timestamp: string } | null;
  unknownReasons: Record<string, string>;
  partial?: boolean;
  [key: string]: unknown;
};
export type LaunchCardData = {
  observedAt?: string;
  ageSeconds?: number;
  directPools?: LaunchFact;
  token: string;
  anchor: { blockNumber: number; blockHash: string; timestamp: string };
  launch: LaunchFact;
  buyers: LaunchFact;
  supplyByTag: LaunchFact;
  deployerHistory: LaunchFact;
  deployerDistributions: LaunchFact;
  lpStatus: LaunchFact;
  permissions: LaunchFact;
  sellTest: {
    label: string;
    results: Array<Record<string, unknown>>;
    limitations: string[];
    conversion?: unknown;
  };
  disclaimer: string;
};
export type LaunchFeed = {
  minutes: number;
  entries: LaunchEntry[];
  anchor: { blockNumber: number; timestamp: string };
  observedAt: string;
  expiresAt: string;
  coverage: { state: string; [key: string]: unknown };
};
export function correctionUrl(
  value = import.meta.env.VITE_CORRECTION_URL,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export async function readLaunches<T>(
  enabled: boolean,
  token?: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!enabled) throw new Error("Launch cards unavailable");
  if (token !== undefined && !/^0x[0-9a-f]{40}$/i.test(token))
    throw new Error("Invalid token");
  const path = `/v1/private/opsis/launches${token ? `/${token}` : ""}`;
  const auth = opsisPreviewAuthorization(path);
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? ""}${path}`,
    {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: auth ? { authorization: auth } : {},
    },
  );
  if (!response.ok)
    throw new Error(`Launch facts unavailable (${response.status})`);
  const body: unknown = await response.json();
  if (!validLaunchResponse(body, token))
    throw new Error("Launch facts response malformed");
  return body as T;
}
export function sortLaunches(
  entries: LaunchEntry[],
  sort: "time" | "launchpad" | "deployer",
): LaunchEntry[] {
  const newest = (a: LaunchEntry, b: LaunchEntry) =>
    (b.created.blockNumber !== undefined && a.created.blockNumber !== undefined
      ? b.created.blockNumber - a.created.blockNumber
      : (b.created.timestamp ?? "").localeCompare(a.created.timestamp ?? "")) ||
    a.token.localeCompare(b.token);
  return [...entries].sort((a, b) =>
    sort === "time"
      ? newest(a, b)
      : String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) ||
        newest(a, b),
  );
}

function validLaunchResponse(value: unknown, token?: string): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const anchor = data.anchor as Record<string, unknown> | undefined;
  if (
    !anchor ||
    !Number.isSafeInteger(anchor.blockNumber) ||
    Number(anchor.blockNumber) < 0 ||
    typeof anchor.timestamp !== "string" ||
    !Number.isFinite(Date.parse(anchor.timestamp))
  )
    return false;
  if (token !== undefined) {
    if (
      typeof data.token !== "string" ||
      data.token.toLowerCase() !== token.toLowerCase()
    )
      return false;
    for (const key of [
      "launch",
      "buyers",
      "supplyByTag",
      "deployerHistory",
      "deployerDistributions",
      "lpStatus",
      "permissions",
    ]) {
      const fact = data[key] as LaunchFact | undefined;
      if (
        !fact ||
        !["available", "partial", "unknown", "unavailable"].includes(fact.state)
      )
        return false;
    }
    const sell = data.sellTest as LaunchCardData["sellTest"] | undefined;
    return (
      typeof anchor.blockHash === "string" &&
      /^0x[0-9a-f]{64}$/i.test(anchor.blockHash) &&
      !!sell &&
      typeof sell.label === "string" &&
      Array.isArray(sell.results) &&
      sell.results.length <= 9 &&
      sell.results.every(
        (row) =>
          row &&
          typeof row === "object" &&
          ["available", "unavailable", "sell reverted"].includes(
            String(row.state),
          ) &&
          typeof row.label === "string",
      ) &&
      Array.isArray(sell.limitations) &&
      sell.limitations.every((row) => typeof row === "string")
    );
  }
  const feed = data as unknown as LaunchFeed;
  return (
    Number.isInteger(feed.minutes) &&
    feed.minutes >= 1 &&
    feed.minutes <= 60 &&
    !!feed.coverage &&
    ["available", "partial"].includes(feed.coverage.state) &&
    Array.isArray(feed.entries) &&
    feed.entries.length <= 200 &&
    feed.entries.every(
      (entry) =>
        entry &&
        /^0x[0-9a-f]{40}$/i.test(entry.token) &&
        typeof entry.launchpad === "string" &&
        ((typeof entry.created?.timestamp === "string" &&
          Number.isFinite(Date.parse(entry.created.timestamp))) ||
          (entry.created?.timestamp === null &&
            Number.isSafeInteger(entry.created.blockNumber) &&
            Number(entry.created.blockNumber) >= 0)) &&
        !!entry.unknownReasons &&
        typeof entry.unknownReasons === "object",
    )
  );
}
