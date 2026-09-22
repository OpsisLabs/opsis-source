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

function item(watch: VaultWatch, status: WatchInboxStatus, evidenceId: string, titleCode: WatchInboxItem["titleCode"], detailCode: WatchInboxItem["detailCode"], capturedAt: string, blockNumber: number | null, now: number, conditionId?: string, notCheckedSince = capturedAt, assetContract: string | null = null, titleValues?: Record<string, string>, detailValues?: Record<string, string>): WatchInboxItem {
  return { id: evidenceId, evidenceId, watchId: watch.id, label: watch.label, address: watch.address, assetContract, status, titleCode, titleValues, detailCode, detailValues, title: titleCode, detail: detailCode, capturedAt, notCheckedSince, blockNumber, ...actionFor(watch, evidenceId, now), ...(conditionId ? { conditionId } : {}) };
}

/** Derive the private inbox from retained snapshots. No network request or clock polling is performed. */
export function deriveWatchInbox(watches: VaultWatch[], now = Date.now()): WatchInboxItem[] {
  const result: WatchInboxItem[] = [];
  for (const watch of watches) {
    const latest = watch.snapshots.at(-1)!;
    const previous = watch.snapshots.at(-2);
    if (!previous) {
      result.push(item(watch, "unfinished", `${watch.id}:baseline:${latest.anchor.blockHash}`, "baseline", "baseline", latest.anchor.fetchedAt, latest.anchor.blockNumber, now));
      for (const condition of watch.conditions ?? []) result.push(item(watch, "unknown", `${watch.id}:${latest.anchor.blockHash}:condition-missing:${condition.id}`, "conditionMissing", "conditionMissing", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, condition.id));
      continue;
    }
    const comparison = compareSnapshots(previous, latest);
    for (const row of comparison.rows.filter((entry) => entry.status === "changed")) {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:balance:${row.key}`;
      result.push(item(watch, "changed", evidenceId, "balanceChanged", "balanceDelta", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, row.contract, { label: row.label }, { before: row.before ?? "unknown", after: row.after ?? "unknown", delta: row.delta ?? "unknown" }));
    }
    for (const row of comparison.rows.filter((entry) => entry.delta === null)) {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:unknown:${row.key}`;
      result.push(item(watch, "unknown", evidenceId, "coverageUnknown", "notComparable", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, row.contract, { label: row.label }));
    }
    if (comparison.gaps.length) {
      const evidenceId = `${watch.id}:${latest.anchor.blockHash}:coverage`;
      result.push(item(watch, "unknown", evidenceId, "coverageAttention", "coverage", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, undefined, latest.anchor.fetchedAt, null, undefined, { gaps: comparison.gaps.join(", ") }));
    }
    for (const condition of watch.conditions ?? []) {
      if (condition.kind !== "balance-change") continue;
      const matchedRow = comparison.rows.find((row) => row.key === condition.assetKey);
      if (!matchedRow) {
        const evidenceId = `${watch.id}:${latest.anchor.blockHash}:condition-missing:${condition.id}`;
        result.push(item(watch, "unknown", evidenceId, "conditionMissing", "conditionMissing", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, condition.id, latest.anchor.fetchedAt, condition.assetKey));
        continue;
      }
      const matches = [matchesCondition(condition, matchedRow)];
      if (matches.some((value) => value === true)) {
        const evidenceId = `${watch.id}:${latest.anchor.blockHash}:condition:${condition.id}`;
        result.push(item(watch, "changed", evidenceId, "conditionMet", "conditionMet", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, condition.id, latest.anchor.fetchedAt, matchedRow.contract, { asset: condition.assetKey }, { threshold: condition.threshold, unit: condition.unit }));
      } else if (matches.some((value) => value === "unknown")) {
        const evidenceId = `${watch.id}:${latest.anchor.blockHash}:condition-unknown:${condition.id}`;
        result.push(item(watch, "unknown", evidenceId, "conditionUnknown", "conditionUnknown", latest.anchor.fetchedAt, latest.anchor.blockNumber, now, condition.id, latest.anchor.fetchedAt, matchedRow.contract));
      }
    }
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
