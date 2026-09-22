import type { PortfolioSnapshot } from "@rh-chain/shared";
import { validateWatchSnapshot } from "../vault/crypto";
import type { VaultWatch } from "../vault/types";
import { translateCurrent as t } from "../i18n/translate";

export const WATCH_LIMIT = 10;
export const WATCH_HISTORY = 3;
const DECIMAL = /^\d{1,78}(?:\.\d{1,78})?$/;

/** Exact decimal subtraction; never route token quantities through floating point. */
export function difference(after: string, before: string): string {
  if (!DECIMAL.test(after) || !DECIMAL.test(before))
    throw new Error(t("watch.error.invalidSnapshot"));
  const [aw, af = ""] = after.split("."),
    [bw, bf = ""] = before.split(".");
  const scale = Math.max(af.length, bf.length);
  const value =
    BigInt(aw + af.padEnd(scale, "0")) - BigInt(bw + bf.padEnd(scale, "0"));
  if (!value) return "0";
  const digits = (value < 0n ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  const body = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "")
    : digits;
  return `${value < 0n ? "-" : "+"}${body}`;
}

export function assertWatchSnapshot(value: PortfolioSnapshot, address: string) {
  validateWatchSnapshot(value, address);
}

export function captureWatch(
  snapshot: PortfolioSnapshot,
  label: string,
  previous?: VaultWatch,
  now = Date.now(),
): VaultWatch {
  assertWatchSnapshot(snapshot, previous?.address ?? snapshot.address);
  const age = now - Date.parse(snapshot.anchor.fetchedAt);
  if (
    age > 600_000 ||
    age < -120_000 ||
    now - Date.parse(snapshot.anchor.timestamp) > 600_000 ||
    Date.parse(snapshot.anchor.timestamp) > now + 120_000
  )
    throw new Error(t("watch.error.stale"));
  const last = previous?.snapshots.at(-1);
  if (last) {
    if (snapshot.anchor.blockNumber < last.anchor.blockNumber)
      throw new Error(t("watch.error.older"));
    if (snapshot.anchor.blockNumber === last.anchor.blockNumber) {
      if (snapshot.anchor.blockHash !== last.anchor.blockHash)
        throw new Error(t("watch.error.reorg"));
      throw new Error(t("watch.error.sameBlock"));
    }
  }
  const date = new Date(now).toISOString();
  return {
    kind: "watch",
    id: previous?.id ?? crypto.randomUUID(),
    address: snapshot.address,
    label: label.trim().slice(0, 80) || snapshot.address,
    snapshots: [...(previous?.snapshots ?? []), snapshot].slice(-WATCH_HISTORY),
    createdAt: previous?.createdAt ?? date,
    updatedAt: date,
    ...(previous?.conditions ? { conditions: previous.conditions } : {}),
    ...(previous?.inboxActions ? { inboxActions: previous.inboxActions } : {}),
  };
}

export type BalanceChange = {
  key: string;
  label: string;
  contract: string | null;
  decimals: number | null;
  before: string | null;
  after: string | null;
  delta: string | null;
  status:
    | "changed"
    | "unchanged"
    | "newly-observed"
    | "unavailable"
    | "metadata-changed";
};

export function compareSnapshots(
  before: PortfolioSnapshot,
  after: PortfolioSnapshot,
) {
  assertWatchSnapshot(before, before.address);
  assertWatchSnapshot(after, before.address);
  if (after.anchor.blockNumber <= before.anchor.blockNumber)
    throw new Error(t("watch.error.order"));
  const rows: BalanceChange[] = [];
  const add = (
    key: string,
    label: string,
    contract: string | null,
    decimals: number | null,
    oldValue: string | null,
    newValue: string | null,
    compatible = true,
  ) => {
    const delta =
      oldValue !== null && newValue !== null && compatible
        ? difference(newValue, oldValue)
        : null;
    rows.push({
      key,
      label,
      contract,
      decimals,
      before: oldValue,
      after: newValue,
      delta,
      status: !compatible
        ? "metadata-changed"
        : oldValue === null
          ? "newly-observed"
          : newValue === null
            ? "unavailable"
            : delta === "0"
              ? "unchanged"
              : "changed",
    });
  };
  add("native", "ETH", null, 18, before.nativeBalanceEth, after.nativeBalanceEth);
  const oldTokens = new Map(before.tokens.map((row) => [row.contract, row]));
  const newTokens = new Map(after.tokens.map((row) => [row.contract, row]));
  for (const contract of new Set([...oldTokens.keys(), ...newTokens.keys()])) {
    const old = oldTokens.get(contract),
      current = newTokens.get(contract);
    add(
      contract,
      current?.symbol || old?.symbol || contract,
      contract,
      current?.decimals ?? old?.decimals ?? null,
      old?.quantity ?? null,
      current?.quantity ?? null,
      !old || !current || old.decimals === current.decimals,
    );
  }
  const nftKey = (row: PortfolioSnapshot["nfts"][number]) =>
    `${row.kind}:${row.contract}:${row.tokenId}`;
  const oldNfts = new Map(before.nfts.map((row) => [nftKey(row), row]));
  const newNfts = new Map(after.nfts.map((row) => [nftKey(row), row]));
  for (const key of new Set([...oldNfts.keys(), ...newNfts.keys()])) {
    const old = oldNfts.get(key),
      current = newNfts.get(key),
      row = current ?? old!;
    add(
      key,
      `${row.symbol || row.name || row.kind} #${row.tokenId}`,
      row.contract,
      null,
      old?.quantity ?? null,
      current?.quantity ?? null,
    );
  }
  const knownHashes = new Set(before.transactions.map((row) => row.hash));
  const observed = after.transactions
    .filter((row) => !knownHashes.has(row.hash))
    .map((row) => ({
      ...row,
      afterBaseline: row.blockNumber > before.anchor.blockNumber,
    }));
  return {
    rows,
    observed,
    changed: rows.filter((row) => row.status === "changed").length,
    unknown: rows.filter((row) => row.delta === null).length,
    gaps: [
      ...new Set([
        ...before.reconciliation.degradedSources,
        ...before.reconciliation.truncatedSections,
        ...after.reconciliation.degradedSources,
        ...after.reconciliation.truncatedSections,
      ]),
    ],
  };
}
