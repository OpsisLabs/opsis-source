import type { ResearchFacts } from "../private/api";
import type { SourceCitation } from "../dashboard/types";
import { KNOWN_ASSETS } from "./known-assets";

export function explorerNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function explorerCount(value: unknown): number | null {
  const number = explorerNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

export function sharePercent(value: unknown): string | null {
  const number = explorerNumber(value);
  return number !== null && number <= 100 ? `${number.toFixed(1)}%` : null;
}

export function isBurnAddress(value: unknown): boolean {
  return typeof value === "string" && /^0x0{36}(?:0000|dead)$/i.test(value);
}

export function holderShares(facts: ResearchFacts) {
  const holders = facts.topHolders ?? [];
  const wallets = holders.filter((holder) => !holder.isPool && !holder.isBurn && !isBurnAddress(holder.address));
  const sum = (rows: typeof holders) => rows.reduce((total, holder) => total + (explorerNumber(holder.share) ?? 0), 0);
  // Older responses include burns in concentration. Recompute only when a burn is present and the corrected field is absent.
  const legacyBurn = facts.burnedShare === undefined && holders.some((holder) => isBurnAddress(holder.address));
  return {
    largest: legacyBurn ? Math.max(0, ...wallets.map((holder) => explorerNumber(holder.share) ?? 0)) : facts.top1WalletShare,
    ten: legacyBurn ? (wallets.length >= 10 ? sum([...wallets].sort((a, b) => (explorerNumber(b.share) ?? 0) - (explorerNumber(a.share) ?? 0)).slice(0, 10)) : null) : facts.top10WalletShare,
    burned: facts.burnedShare ?? (holders.length ? sum(holders.filter((holder) => holder.isBurn || isBurnAddress(holder.address))) : null),
  };
}

const hiddenCharacters = /\p{Cf}/gu;
export function hasHiddenCharacters(value: unknown): boolean {
  return typeof value === "string" && /\p{Cf}/u.test(value);
}

export function visibleTokenText(value: string): string {
  return value.replace(hiddenCharacters, (character) => `[U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}]`);
}

export function reviewedAsset(address: unknown) {
  return typeof address === "string" ? KNOWN_ASSETS.find((asset) => asset.address.toLowerCase() === address.toLowerCase()) : undefined;
}

export function normalizedTokenSymbol(symbol: string): string {
  return symbol.replace(hiddenCharacters, "").toUpperCase();
}

export function lookalikeAsset(symbol: unknown, address: unknown) {
  if (typeof symbol !== "string") return undefined;
  const normalized = normalizedTokenSymbol(symbol);
  return KNOWN_ASSETS.find((asset) => asset.symbol.toUpperCase() === normalized && asset.address.toLowerCase() !== (typeof address === "string" ? address.toLowerCase() : ""));
}

// Symbols of widely held assets that Opsis has not reviewed on this chain. A
// contract using one of them is not necessarily an impostor, but its name alone
// says nothing about which asset it is.
const WELL_KNOWN_SYMBOLS = ["USDC", "USDT", "DAI", "ETH", "BTC", "WBTC"];

export function wellKnownUnreviewedSymbol(symbol: unknown, address: unknown): string | undefined {
  if (typeof symbol !== "string" || reviewedAsset(address)) return undefined;
  const normalized = normalizedTokenSymbol(symbol);
  return WELL_KNOWN_SYMBOLS.includes(normalized) && !KNOWN_ASSETS.some((asset) => asset.symbol.toUpperCase() === normalized) ? normalized : undefined;
}

export function relativeTime(value: unknown, now: number = Date.now()): { en: string; zh: string; exact: string } | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || !Number.isFinite(now)) return null;
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  const exact = new Date(time).toISOString();
  if (seconds < 60) return { en: "just now", zh: "刚刚", exact };
  const [count, unit, chinese] = seconds < 3600 ? [Math.floor(seconds / 60), "minute", "分钟"]
    : seconds < 86400 ? [Math.floor(seconds / 3600), "hour", "小时"] : [Math.floor(seconds / 86400), "day", "天"];
  return { en: `${count} ${unit}${count === 1 ? "" : "s"} ago`, zh: `${count} ${chinese}前`, exact };
}

export function latestTimestamp(rows: { timestamp?: string }[]): string | undefined {
  return rows.map((row) => row.timestamp).filter((time): time is string => typeof time === "string" && Number.isFinite(Date.parse(time)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

export function transactionDirection(from: string, to: string | null | undefined, wallet: string): "sent" | "received" | "self" | "unknown" {
  const outgoing = from.toLowerCase() === wallet.toLowerCase();
  const incoming = to?.toLowerCase() === wallet.toLowerCase();
  return outgoing && incoming ? "self" : outgoing ? "sent" : incoming ? "received" : "unknown";
}

export function transactionMethod(transaction: { decodedInput?: unknown; method?: string | null }) {
  const decoded = transaction.decodedInput;
  if (decoded && typeof decoded === "object") {
    const record = decoded as Record<string, unknown>;
    const name = record.method_call ?? record.methodCall ?? record.method;
    if (typeof name === "string" && name.length > 0) return { kind: "decoded" as const, text: visibleTokenText(name.split("(")[0]) };
  }
  const method = transaction.method;
  if (!method || method === "0x") return { kind: "transfer" as const };
  return { kind: "contract" as const, text: /^0x[0-9a-f]{8}$/i.test(method) ? method : undefined };
}

/** Keep separate read times and field receipts when a source label repeats. */
export function researchEvidenceGroups(sources: SourceCitation[]) {
  const groups = new Map<string, { label: string; sources: SourceCitation[] }>();
  for (const source of sources) {
    const key = `${source.provider}:${source.label}`;
    const group = groups.get(key) ?? { label: source.label ?? source.provider ?? "", sources: [] };
    group.sources.push(source);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** A missing status remains unknown rather than being counted as a failure. */
export function walletActivity(facts: ResearchFacts) {
  const rows = facts.activityCoverage === "unavailable" ? undefined : facts.recentTransactions;
  return {
    count: rows ? rows.length : null,
    failed: rows && rows.every((row) => ["ok", "error", "failed", "success", "0x0", "0x1"].includes(row.status ?? ""))
      ? rows.filter((row) => ["error", "failed", "0x0"].includes(row.status ?? "")).length : null,
  };
}
