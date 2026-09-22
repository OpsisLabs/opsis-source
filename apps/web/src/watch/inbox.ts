import type { VaultWatch, VaultWatchCondition, VaultWatchInboxAction } from "../vault/types";
import { compareSnapshots, type BalanceChange } from "./model";

export type WatchInboxStatus = "changed" | "unfinished" | "unknown";

export interface WatchInboxItem {
  id: string;
  evidenceId: string;
  watchId: string;
  label: string;
  address: string;
  assetContract: string | null;
  status: WatchInboxStatus;
  titleCode: "baseline" | "balanceChanged" | "coverageUnknown" | "coverageAttention" | "conditionMet" | "conditionUnknown" | "conditionMissing";
  titleValues?: Record<string, string>;
  detailCode: "baseline" | "balanceDelta" | "notComparable" | "coverage" | "conditionMet" | "conditionUnknown" | "conditionMissing";
  detailValues?: Record<string, string>;
  /** Deprecated render aliases retained for existing callers; values are message codes. */
  title: string;
  detail: string;
  capturedAt: string;
  notCheckedSince: string;
  blockNumber: number | null;
  /** Hash of the captured block that produced this evidence. */
  anchorHash: string | null;
  acknowledged: boolean;
  snoozed: boolean;
  conditionId?: string;
}

const DECIMAL = /^\d{1,78}(?:\.\d{1,78})?$/;

function compareDecimal(a: string, b: string): number {
  const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split("."), scale = Math.max(af.length, bf.length);
  const left = BigInt(aw + af.padEnd(scale, "0"));
  const right = BigInt(bw + bf.padEnd(scale, "0"));
  return left < right ? -1 : left > right ? 1 : 0;
}

function matchesCondition(condition: VaultWatchCondition, row: BalanceChange): boolean | "unknown" {
  if (row.before === null || row.after === null || row.delta === null) return "unknown";
  if (!DECIMAL.test(condition.threshold)) return "unknown";
  if (condition.decimals !== row.decimals) return "unknown";
  const magnitude = row.delta.startsWith("-") ? row.delta.slice(1) : row.delta.startsWith("+") ? row.delta.slice(1) : row.delta;
  if (condition.direction === "increase" && !row.delta.startsWith("+")) return false;
  if (condition.direction === "decrease" && !row.delta.startsWith("-")) return false;
  return compareDecimal(magnitude, condition.threshold) >= 0;
}

function actionFor(watch: VaultWatch, evidenceId: string, now: number): { acknowledged: boolean; snoozed: boolean } {
  const action = (watch.inboxActions ?? []).find((item) => item.evidenceId === evidenceId);
  return {
    acknowledged: Boolean(action?.acknowledgedAt),
    snoozed: Boolean(action?.snoozedUntil && Date.parse(action.snoozedUntil) > now),
  };
}

function item(watch: VaultWatch, status: WatchInboxStatus, evidenceId: string, titleCode: WatchInboxItem["titleCode"], detailCode: WatchInboxItem["detailCode"], capturedAt: string, blockNumber: number | null, now: number, conditionId?: string, notCheckedSince = capturedAt, assetContract: string | null = null, titleValues?: Record<string, string>, detailValues?: Record<string, string>, anchorHash: string | null = null): WatchInboxItem {
  return { id: evidenceId, evidenceId, watchId: watch.id, label: watch.label, address: watch.address, assetContract, status, titleCode, titleValues, detailCode, detailValues, title: titleCode, detail: detailCode, capturedAt, notCheckedSince, blockNumber, anchorHash, ...actionFor(watch, evidenceId, now), ...(conditionId ? { conditionId } : {}) };
}

const MAX_EVALUATION_AGE_MS = 600_000;

function snapshotStale(snapshot: VaultWatch["snapshots"][number], now: number): boolean {
  const fetched = Date.parse(snapshot.anchor.fetchedAt);
  const captured = Date.parse(snapshot.anchor.timestamp);
  return !Number.isFinite(fetched) || !Number.isFinite(captured)
    || now - fetched > MAX_EVALUATION_AGE_MS
    || now - captured > MAX_EVALUATION_AGE_MS
    || fetched - now > 120_000
    || captured - now > 120_000;
}

/** Evaluate saved conditions against retained evidence only. This never fetches or mutates. */
export function evaluateWatchConditions(watch: VaultWatch, now = Date.now()): WatchInboxItem[] {
  const latest = watch.snapshots.at(-1);
  if (!latest) return [];
  const previous = watch.snapshots.at(-2);
  const base = (condition: VaultWatchCondition, status: WatchInboxStatus, code: "conditionUnknown" | "conditionMissing", reason: string, row?: BalanceChange) =>
    item(watch, status, `${watch.id}:${latest.anchor.blockHash}:condition-${code === "conditionUnknown" ? "unknown" : "missing"}:${condition.id}`, code, code, latest.anchor.fetchedAt, latest.anchor.blockNumber, now, condition.id, latest.anchor.fetchedAt, row?.contract ?? (condition.assetKey === "native" ? null : condition.assetKey), undefined, {
      reason,
      assetKey: condition.assetKey,
      decimals: String(condition.decimals),
      anchorHash: latest.anchor.blockHash,
      ...(row?.before !== undefined ? { before: row.before ?? "unknown" } : {}),
      ...(row?.after !== undefined ? { after: row.after ?? "unknown" } : {}),
      ...(row?.delta !== undefined ? { delta: row.delta ?? "unknown" } : {}),
    }, latest.anchor.blockHash);
  if (!previous) return (watch.conditions ?? []).map((condition) => base(condition, "unknown", "conditionMissing", "baseline"));
  let comparison;
  try { comparison = compareSnapshots(previous, latest); } catch { return (watch.conditions ?? []).map((condition) => base(condition, "unknown", "conditionUnknown", "invalid-anchor")); }
  const stale = snapshotStale(latest, now);
  const hasGaps = comparison.gaps.length > 0;
  return (watch.conditions ?? []).flatMap((condition) => {
    if (condition.kind !== "balance-change") return [];
    const row = comparison.rows.find((entry) => entry.key === condition.assetKey);
    if (!row) return [base(condition, "unknown", "conditionMissing", stale ? "stale" : hasGaps ? "coverage-gap" : "missing")];
    if (stale) return [base(condition, "unknown", "conditionUnknown", "stale", row)];
    if (hasGaps) return [base(condition, "unknown", "conditionUnknown", "coverage-gap", row)];
    const matches = matchesCondition(condition, row);
    if (matches === true) return [item(watch, "changed", `${watch.id}:${latest.anchor.blockHash}:condition:${condition.id}`, "conditionMet", "conditionMet", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, condition.id, latest.anchor.fetchedAt, row.contract, { asset: condition.assetKey, decimals: String(condition.decimals), anchorHash: latest.anchor.blockHash }, { threshold: condition.threshold, unit: condition.unit, assetKey: condition.assetKey, decimals: String(condition.decimals), before: row.before ?? "unknown", after: row.after ?? "unknown", delta: row.delta ?? "unknown", anchorHash: latest.anchor.blockHash }, latest.anchor.blockHash)];
    if (matches === "unknown") return [base(condition, "unknown", "conditionUnknown", row.decimals !== condition.decimals ? "decimals-changed" : "not-comparable", row)];
    return [];
  });
}

/** Derive the private inbox from retained snapshots. No network request or clock polling is performed. */
export function deriveWatchInbox(watches: VaultWatch[], now = Date.now()): WatchInboxItem[] {
  const result: WatchInboxItem[] = [];
  for (const watch of watches) {
    const latest = watch.snapshots.at(-1);
    if (!latest) continue;
    const previous = watch.snapshots.at(-2);
    if (!previous) {
      result.push(item(watch, "unfinished", `${watch.id}:baseline:${latest.anchor.blockHash}`, "baseline", "baseline", latest.anchor.fetchedAt, latest.anchor.blockNumber, now));
      result.push(...evaluateWatchConditions(watch, now));
      continue;
    }
    let comparison;
    try {
      comparison = compareSnapshots(previous, latest);
    } catch {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:coverage:invalid-anchor`;
      result.push(item(watch, "unknown", evidenceId, "coverageAttention", "coverage", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, null, undefined, { gaps: "invalid-anchor", anchorHash: latest.anchor.blockHash }, latest.anchor.blockHash));
      result.push(...evaluateWatchConditions(watch, now));
      continue;
    }
    for (const row of comparison.rows.filter((entry) => entry.status === "changed")) {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:balance:${row.key}`;
      result.push(item(watch, "changed", evidenceId, "balanceChanged", "balanceDelta", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, row.contract, { label: row.label }, { before: row.before ?? "unknown", after: row.after ?? "unknown", delta: row.delta ?? "unknown", anchorHash: latest.anchor.blockHash }, latest.anchor.blockHash));
    }
    for (const row of comparison.rows.filter((entry) => entry.delta === null)) {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:unknown:${row.key}`;
      result.push(item(watch, "unknown", evidenceId, "coverageUnknown", "notComparable", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, row.contract, { label: row.label }, undefined, latest.anchor.blockHash));
    }
    if (comparison.gaps.length) {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:coverage`;
      result.push(item(watch, "unknown", evidenceId, "coverageAttention", "coverage", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, null, undefined, { gaps: comparison.gaps.join(", "), anchorHash: latest.anchor.blockHash }, latest.anchor.blockHash));
    }
    result.push(...evaluateWatchConditions(watch, now));
  }
  return result.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

export function setInboxAction(watch: VaultWatch, evidenceId: string, action: Pick<VaultWatchInboxAction, "acknowledgedAt" | "snoozedUntil">): VaultWatch {
  const actions = (watch.inboxActions ?? []).filter((entry) => entry.evidenceId !== evidenceId);
  actions.push({ evidenceId, ...action });
  return { ...watch, inboxActions: actions.slice(-200), updatedAt: new Date().toISOString() };
}

export function clearInboxAction(watch: VaultWatch, evidenceId: string): VaultWatch {
  return { ...watch, inboxActions: (watch.inboxActions ?? []).filter((entry) => entry.evidenceId !== evidenceId), updatedAt: new Date().toISOString() };
}
