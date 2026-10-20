import { retryAfterSeconds } from "../dashboard/http";

export class PreviewAccessError extends Error {
  readonly status: number;
  readonly retryAfter?: number;

  constructor(status: number, retryAfter?: number) {
    super("Preview unavailable");
    this.name = "PreviewAccessError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Only public identifiers cross workspace URLs. Never spread search params. */
export function publicIdentity(value: string | null): string {
  const candidate = value?.trim() ?? "";
  return /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(candidate)
    ? candidate
    : "";
}
export function researchInputMatchesChoice(value: string, entityType: "unknown" | "token"): boolean {
  const candidate = value.trim();
  return entityType === "token"
    ? /^0x[a-fA-F0-9]{40}$/.test(candidate)
    : /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(candidate);
}
export function workspaceLink(
  path: "/research" | "/research/details" | "/check",
  value: string,
): string {
  const id = publicIdentity(value);
  const parameter = path === "/check" ? "token" : "entity";
  return id && (path !== "/check" || id.length === 42)
    ? `${path}?${parameter}=${encodeURIComponent(id)}`
    : path;
}
/** Accept legacy entity links, but never read amounts or other context. */
export function workspaceIdentity(path: "/research" | "/check", search: string): string {
  const params = new URLSearchParams(search);
  const id = publicIdentity(path === "/check" ? params.get("token") ?? params.get("entity") : params.get("entity"));
  return path === "/check" && id.length !== 42 ? "" : id;
}
export type CapabilityId = "networkPulse" | "research" | "contractFacts" | "tokenControls" | "exitCheck" | "watch" | "rwa" | "observedTrades" | "swapPreview" | "perpHandoff" | "savedCheckComparisons" | "receipts" | "publicCards" | "publicMcp" | "telegramBot" | "stockDesk" | "launchCards" | "linkedWallets" | "claimCheck" | "openDataSql" | "openDataDatasets" | "alerts";
export type CapabilityStatus = { id: CapabilityId; enabled: boolean; scope: string; origin: string; freshness: string; coverage: string; limits: string };
export type CapabilityManifest = { version: 1; chain: { id: 4663; name: string }; build: string | null; capabilities: CapabilityStatus[] };
export type Capabilities = {
  expiresAt: string;
  chainId: 4663;
  research: boolean;
  networkPulse?: boolean;
  tokenControls?: boolean;
  contractFacts?: boolean;
  exitCheck: boolean;
  watch: boolean;
  rwa: boolean;
  observedTrades: boolean;
  swapPreview?: boolean;
  perpHandoff?: boolean;
  savedCheckComparisons?: boolean;
  openDataSql?: boolean;
  openDataDatasets?: boolean;
  launchCards?: boolean;
  receipts?: boolean;
  claimCheck?: boolean;
  publicCards?: boolean;
  publicMcp?: boolean;
  telegramBot?: boolean;
  linkedWallets?: boolean;
  alerts?: boolean;
  stockDesk?: boolean;
  perpExecution: false;
  manifest?: CapabilityManifest;
};

const requiredCapabilityIds: CapabilityId[] = ["research", "tokenControls", "exitCheck", "watch", "rwa", "observedTrades"];
// Optional rows let a newer browser build work with an older server manifest.
const optionalCapabilityIds: CapabilityId[] = ["contractFacts", "networkPulse", "swapPreview", "perpHandoff", "savedCheckComparisons", "receipts", "publicCards", "publicMcp", "telegramBot", "stockDesk", "launchCards", "linkedWallets", "claimCheck", "openDataSql", "openDataDatasets", "alerts"];
const capabilityIds: CapabilityId[] = [...requiredCapabilityIds, ...optionalCapabilityIds];
function parseManifest(value: unknown): CapabilityManifest | undefined {
  if (value === undefined) return undefined; // Older preview fixtures expose the same server-derived booleans.
  if (!value || typeof value !== "object") throw new Error("Invalid preview response");
  const manifest = value as Record<string, unknown>;
  if (manifest.version !== 1 || !manifest.chain || typeof manifest.chain !== "object" || (manifest.chain as Record<string, unknown>).id !== 4663 || (manifest.chain as Record<string, unknown>).name !== "Robinhood Chain" || (manifest.build !== null && (typeof manifest.build !== "string" || !/^[a-f0-9]{40}$/i.test(manifest.build))) || !Array.isArray(manifest.capabilities)) throw new Error("Invalid preview response");
  const rows = manifest.capabilities as unknown[];
  if (rows.length < requiredCapabilityIds.length || rows.length > capabilityIds.length) throw new Error("Invalid preview response");
  const capabilities = rows.map((item): CapabilityStatus => {
    if (!item || typeof item !== "object") throw new Error("Invalid preview response");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "coverage,enabled,freshness,id,limits,origin,scope" || !capabilityIds.includes(row.id as CapabilityId) || typeof row.enabled !== "boolean" || ["scope", "origin", "freshness", "coverage", "limits"].some((key) => typeof row[key] !== "string" || !row[key])) throw new Error("Invalid preview response");
    return row as CapabilityStatus;
  });
  if (new Set(capabilities.map((item) => item.id)).size !== capabilities.length || requiredCapabilityIds.some((id) => !capabilities.some((item) => item.id === id))) throw new Error("Invalid preview response");
  return { version: 1, chain: { id: 4663, name: "Robinhood Chain" }, build: manifest.build as string | null, capabilities };
}
export async function unlockPreview(
  key: string,
  signal: AbortSignal,
): Promise<Capabilities> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/private/opsis/access`,
    {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: {
        ...(key ? { authorization: `Preview ${key}` } : {}),
        "content-type": "application/json",
        "x-opsis-csrf": "1",
      },
      body: "{}",
    },
  );
  if (!response.ok) throw new PreviewAccessError(
    response.status,
    retryAfterSeconds(response.headers.get("retry-after")),
  );
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== "object") throw new Error("Invalid preview response");
  const data = raw as Capabilities;
  const manifest = parseManifest((raw as Record<string, unknown>).manifest);
  const expires = Date.parse(data.expiresAt);
  const receivedAt = Date.now();
  // HTTP Date has whole-second precision. Validate the server's lifetime against
  // its own clock, then cap our local session to one hour independently.
  const dateHeader = response.headers.get("date");
  const serverNow = dateHeader === null ? receivedAt : Date.parse(dateHeader);
  const latestExpiry = serverNow + 3_600_000 + (dateHeader === null ? 0 : 999);
  if (
    !Number.isFinite(expires) ||
    !Number.isFinite(serverNow) ||
    expires <= receivedAt ||
    expires > latestExpiry ||
    data.chainId !== 4663 ||
    (data.tokenControls !== undefined &&
      typeof data.tokenControls !== "boolean") ||
    (data.swapPreview !== undefined &&
      typeof data.swapPreview !== "boolean") ||
    [data.contractFacts, data.networkPulse, data.publicCards, data.publicMcp, data.telegramBot, data.stockDesk, data.launchCards, data.linkedWallets, data.claimCheck, data.openDataSql, data.openDataDatasets, data.alerts].some((flag) => flag !== undefined && typeof flag !== "boolean") ||
    (data.receipts !== undefined && typeof data.receipts !== "boolean") ||
    (data.perpHandoff !== undefined &&
      typeof data.perpHandoff !== "boolean") ||
    (data.savedCheckComparisons !== undefined && typeof data.savedCheckComparisons !== "boolean") ||
    data.perpExecution !== false ||
    [
      data.research,
      data.exitCheck,
      data.watch,
      data.rwa,
      data.observedTrades,
    ].some((v) => typeof v !== "boolean")
  ) {
    throw new Error("Invalid preview response");
  }
  if (manifest) {
    const legacyFlags: Record<CapabilityId, boolean> = {
      networkPulse: data.networkPulse ?? false,
      research: data.research,
      tokenControls: data.tokenControls ?? false,
      contractFacts: data.contractFacts ?? false,
      exitCheck: data.exitCheck,
      watch: data.watch,
      rwa: data.rwa,
      observedTrades: data.observedTrades,
      swapPreview: data.swapPreview ?? false,
      perpHandoff: data.perpHandoff ?? false,
      savedCheckComparisons: data.savedCheckComparisons ?? false,
      openDataSql: data.openDataSql ?? false,
      openDataDatasets: data.openDataDatasets ?? false,
      launchCards: data.launchCards ?? false,
      receipts: data.receipts ?? false,
      claimCheck: data.claimCheck ?? false,
      publicCards: data.publicCards ?? false,
      publicMcp: data.publicMcp ?? false,
      telegramBot: data.telegramBot ?? false,
      alerts: data.alerts ?? false,
      stockDesk: data.stockDesk ?? false,
      linkedWallets: data.linkedWallets ?? false,
    };
    if (["contractFacts", "networkPulse", "perpHandoff", "savedCheckComparisons", "receipts", "publicCards", "publicMcp", "telegramBot", "stockDesk", "launchCards", "linkedWallets", "claimCheck", "openDataSql", "openDataDatasets", "alerts"].some(id => legacyFlags[id as CapabilityId] && !manifest.capabilities.some(entry => entry.id === id)) || manifest.capabilities.some((entry) => entry.enabled !== legacyFlags[entry.id])) throw new Error("Invalid preview response");
  }
  return {
    ...data,
    ...(manifest ? { manifest } : {}),
    expiresAt: new Date(
      Math.min(expires, receivedAt + 3_600_000),
    ).toISOString(),
  };
}

/** Preserve only a known local workspace selector in legacy Vault redirects. */
export function savedLink(search: string): string {
  const view = new URLSearchParams(search).get("view");
  return view &&
    [
      "reports",
      "assets",
      "portfolio",
      "collectibles",
      "market",
      "approvals",
      "replay",
      "deals",
    ].includes(view)
    ? `/saved?view=${view}`
    : "/saved";
}
