import type {
  PortfolioCitation,
  PortfolioMovement,
  PortfolioSnapshot,
} from "@rh-chain/shared";
import type { VaultWatch } from "../vault/types";
import { assertWatchSnapshot, compareSnapshots, difference } from "./model";

export type BriefingWallet = Pick<VaultWatch, "id" | "address" | "label">;

export type BriefingCategory =
  | "balance-decrease"
  | "balance-increase"
  | "new-activity"
  | "failed-activity"
  | "older-activity";

export type BriefingAsset = "native" | "erc20" | "nft" | "transaction";

export type BriefingReason =
  "baseline" | "invalid" | "order" | "same-check" | "conflict";

export type BriefingSource = {
  id: string;
  url: string | null;
  description: string;
  fetchedAt: string;
};

export type BriefingMovement = {
  direction: PortfolioMovement["direction"];
  kind: PortfolioMovement["kind"];
  symbol: string;
  quantity: string;
  contract: string | null;
  tokenId: string | null;
};

export type BriefingObservation = {
  wallet: BriefingWallet;
  status: "success" | "failed";
  block: number;
  beforeBlock: number;
  afterBlock: number;
  beforeAt: string;
  afterAt: string;
  afterBaseline: boolean;
  movements: BriefingMovement[];
  partial: boolean;
  gaps: string[];
  sources: BriefingSource[];
};

export type BriefingSharedHolder = {
  wallet: BriefingWallet;
  before: string | null;
  after: string;
  delta: string | null;
  compatible: boolean;
  decimals: number;
  beforeBlock: number | null;
  afterBlock: number;
  beforeAt: string | null;
  afterAt: string;
};

export type BriefingFinding = {
  id: string;
  category: BriefingCategory;
  asset: BriefingAsset;
  label: string;
  contract: string | null;
  tokenId: string | null;
  before: string | null;
  after: string | null;
  delta: string | null;
  beforeBlock: number | null;
  afterBlock: number | null;
  beforeAt: string | null;
  afterAt: string | null;
  block: number;
  wallets: BriefingWallet[];
  transactionHash: string | null;
  transactionStatus: "success" | "failed" | null;
  afterBaseline: boolean | null;
  conflict: boolean;
  windowMixed: boolean;
  incompatible: boolean;
  observations: BriefingObservation[];
  shared: BriefingSharedHolder[] | null;
  sources: BriefingSource[];
  partial: boolean;
  gaps: string[];
};

export type BriefingUnknown = {
  wallet: BriefingWallet;
  key: string;
  label: string;
  contract: string | null;
  tokenId: string | null;
  status: "newly-observed" | "unavailable" | "metadata-changed";
  before: string | null;
  after: string | null;
  beforeBlock: number;
  afterBlock: number;
  beforeAt: string;
  afterAt: string;
};

export type BriefingWalletState = {
  wallet: BriefingWallet;
  status: "comparable" | "baseline" | "unsupported";
  reason: BriefingReason;
  beforeBlock: number | null;
  afterBlock: number | null;
  gaps: string[];
  partial: boolean;
};

export type BriefingPhase = "empty" | "unsupported" | "baseline" | "ready";

export type Briefing = {
  phase: BriefingPhase;
  changed: boolean;
  findings: BriefingFinding[];
  unknowns: BriefingUnknown[];
  wallets: BriefingWalletState[];
  comparable: number;
  baselineOnly: number;
  unsupported: number;
  walletCount: number;
  gaps: string[];
  partial: boolean;
  window: {
    fromBlock: number;
    toBlock: number;
    fromAt: string;
    toAt: string;
  } | null;
};

export type ComparablePair =
  | {
      status: "comparable";
      before: PortfolioSnapshot;
      after: PortfolioSnapshot;
      gaps: string[];
    }
  | { status: "baseline"; gaps: string[] }
  | { status: "unsupported"; reason: BriefingReason; gaps: string[] };

const ORDER: Record<BriefingCategory, number> = {
  "balance-decrease": 0,
  "balance-increase": 1,
  "new-activity": 2,
  "failed-activity": 3,
  "older-activity": 4,
};

const UNKNOWN_STATUSES = new Set([
  "newly-observed",
  "unavailable",
  "metadata-changed",
]);

const walletRef = (wallet: VaultWatch): BriefingWallet => ({
  id: wallet.id,
  label: typeof wallet.label === "string" ? wallet.label : "",
  address: typeof wallet.address === "string" ? wallet.address : "",
});

function gapsOf(snapshot: PortfolioSnapshot) {
  return [
    ...snapshot.reconciliation.degradedSources,
    ...snapshot.reconciliation.truncatedSections,
  ];
}

function citationFrom(citation: PortfolioCitation): BriefingSource {
  return {
    id: citation.id,
    url: citation.url,
    description: citation.description,
    fetchedAt: citation.fetchedAt,
  };
}

function sourceKey(source: BriefingSource) {
  return `${source.id}|${source.fetchedAt}|${source.url ?? ""}`;
}

function sourcesOf(
  snapshots: PortfolioSnapshot[],
  ids?: string[],
): BriefingSource[] {
  const seen = new Set<string>();
  const rows: BriefingSource[] = [];
  for (const snapshot of snapshots) {
    for (const citation of snapshot.citations) {
      const match = !ids || ids.length === 0 || ids.includes(citation.id);
      const source = citationFrom(citation);
      const key = sourceKey(source);
      if (!match || seen.has(key)) continue;
      seen.add(key);
      rows.push(source);
    }
  }
  return rows;
}

function mergeSources(groups: BriefingSource[][]) {
  const seen = new Set<string>();
  const rows: BriefingSource[] = [];
  for (const group of groups) {
    for (const source of group) {
      const key = sourceKey(source);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(source);
    }
  }
  return rows;
}

function movementKey(movement: BriefingMovement) {
  return [
    movement.direction,
    movement.kind,
    movement.contract ?? "native",
    movement.tokenId ?? "",
    movement.quantity,
  ].join("|");
}

function movementOf(movement: PortfolioMovement): BriefingMovement {
  return {
    direction: movement.direction,
    kind: movement.kind,
    symbol: movement.symbol,
    quantity: movement.quantity,
    contract: movement.contract,
    tokenId: movement.tokenId,
  };
}

/** Chronological retained order only. Never reorder evidence to make it comparable. */
export function selectComparablePair(
  snapshots: PortfolioSnapshot[],
  address: string,
): ComparablePair {
  if (!Array.isArray(snapshots) || snapshots.length === 0)
    return { status: "unsupported", reason: "invalid", gaps: [] };
  try {
    for (const snapshot of snapshots) assertWatchSnapshot(snapshot, address);
  } catch {
    return { status: "unsupported", reason: "invalid", gaps: [] };
  }
  const ordered = snapshots;
  const trailing = ordered[ordered.length - 1]!;
  if (ordered.length < 2)
    return { status: "baseline", gaps: gapsOf(trailing) };
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.anchor.blockNumber < previous.anchor.blockNumber)
      return {
        status: "unsupported",
        reason: "order",
        gaps: gapsOf(current),
      };
    if (current.anchor.blockNumber === previous.anchor.blockNumber)
      return {
        status: "unsupported",
        reason:
          current.anchor.blockHash === previous.anchor.blockHash
            ? "same-check"
            : "conflict",
        gaps: gapsOf(current),
      };
  }
  const before = ordered[ordered.length - 2]!;
  const after = trailing;
  let gaps: string[];
  try {
    gaps = compareSnapshots(before, after).gaps;
  } catch {
    return { status: "unsupported", reason: "invalid", gaps: [] };
  }
  return { status: "comparable", before, after, gaps };
}

export function buildBriefing(
  watches: VaultWatch[],
  walletId: string | null = null,
): Briefing {
  const seen = new Set<string>();
  const selected: VaultWatch[] = [];
  for (const wallet of watches) {
    if (walletId && wallet.id !== walletId) continue;
    const address = typeof wallet.address === "string" ? wallet.address : "";
    const key = address.toLowerCase();
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    selected.push(wallet);
  }

  const states: BriefingWalletState[] = [];
  const comparable: Array<{
    wallet: VaultWatch;
    before: PortfolioSnapshot;
    after: PortfolioSnapshot;
    gaps: string[];
  }> = [];

  for (const wallet of selected) {
    const snapshots = Array.isArray(wallet.snapshots) ? wallet.snapshots : [];
    const address = typeof wallet.address === "string" ? wallet.address : "";
    const pair = selectComparablePair(snapshots, address);
    const ref = walletRef(wallet);
    if (pair.status === "comparable") {
      comparable.push({ wallet, ...pair });
      states.push({
        wallet: ref,
        status: "comparable",
        reason: "baseline",
        beforeBlock: pair.before.anchor.blockNumber,
        afterBlock: pair.after.anchor.blockNumber,
        gaps: pair.gaps,
        partial: pair.gaps.length > 0,
      });
    } else if (pair.status === "baseline") {
      states.push({
        wallet: ref,
        status: "baseline",
        reason: "baseline",
        beforeBlock: snapshots.at(-1)?.anchor.blockNumber ?? null,
        afterBlock: snapshots.at(-1)?.anchor.blockNumber ?? null,
        gaps: pair.gaps,
        partial: pair.gaps.length > 0,
      });
    } else {
      states.push({
        wallet: ref,
        status: "unsupported",
        reason: pair.reason,
        beforeBlock: null,
        afterBlock: null,
        gaps: pair.gaps,
        partial: pair.gaps.length > 0,
      });
    }
  }

  const sharedMap = new Map<string, BriefingSharedHolder[]>();
  for (const { wallet, before, after } of comparable) {
    const ref = walletRef(wallet);
    for (const token of after.tokens) {
      if (BigInt(token.rawBalance) <= 0n) continue;
      const old = before.tokens.find((row) => row.contract === token.contract);
      const compatible = Boolean(old) && old!.decimals === token.decimals;
      const holder: BriefingSharedHolder = {
        wallet: ref,
        before: old?.quantity ?? null,
        after: token.quantity,
        delta: compatible ? difference(token.quantity, old!.quantity) : null,
        compatible,
        decimals: token.decimals,
        beforeBlock: before.anchor.blockNumber,
        afterBlock: after.anchor.blockNumber,
        beforeAt: before.anchor.fetchedAt,
        afterAt: after.anchor.fetchedAt,
      };
      const holders = sharedMap.get(token.contract) ?? [];
      holders.push(holder);
      sharedMap.set(token.contract, holders);
    }
  }

  const findings: BriefingFinding[] = [];
  const unknowns: BriefingUnknown[] = [];

  for (const { wallet, before, after, gaps } of comparable) {
    const comparison = compareSnapshots(before, after);
    const ref = walletRef(wallet);
    const partial =
      gaps.length > 0 ||
      gapsOf(after).length > 0 ||
      gapsOf(before).length > 0;
    for (const row of comparison.rows) {
      const nft = row.key.includes(":");
      if (row.status !== "changed" || row.delta === null) {
        if (UNKNOWN_STATUSES.has(row.status))
          unknowns.push({
            wallet: ref,
            key: row.key,
            label: row.label,
            contract: row.contract,
            tokenId: nft ? row.key.split(":").at(-1) ?? null : null,
            status: row.status as BriefingUnknown["status"],
            before: row.before,
            after: row.after,
            beforeBlock: before.anchor.blockNumber,
            afterBlock: after.anchor.blockNumber,
            beforeAt: before.anchor.fetchedAt,
            afterAt: after.anchor.fetchedAt,
          });
        continue;
      }
      const token = row.contract
        ? after.tokens.find((entry) => entry.contract === row.contract)
        : undefined;
      const others =
        token && sharedMap.has(token.contract)
          ? (sharedMap.get(token.contract) ?? []).filter(
              (holder) => holder.wallet.id !== wallet.id,
            )
          : [];
      const incompatible = others.some(
        (holder) => holder.decimals !== token!.decimals,
      );
      findings.push({
        id: `balance:${wallet.id}:${row.key}`,
        category: row.delta.startsWith("-")
          ? "balance-decrease"
          : "balance-increase",
        asset: row.contract === null ? "native" : nft ? "nft" : "erc20",
        label: row.label,
        contract: row.contract,
        tokenId: nft ? row.key.split(":").at(-1) ?? null : null,
        before: row.before,
        after: row.after,
        delta: row.delta,
        beforeBlock: before.anchor.blockNumber,
        afterBlock: after.anchor.blockNumber,
        beforeAt: before.anchor.fetchedAt,
        afterAt: after.anchor.fetchedAt,
        block: after.anchor.blockNumber,
        wallets: [ref],
        transactionHash: null,
        transactionStatus: null,
        afterBaseline: null,
        conflict: false,
        windowMixed: false,
        incompatible,
        observations: [],
        shared:
          others.length > 0
            ? others.map((holder) => ({
                ...holder,
                delta: incompatible ? null : holder.delta,
              }))
            : null,
        sources: sourcesOf([before, after]),
        partial,
        gaps,
      });
    }
  }

  const transactions = new Map<
    string,
    {
      hash: string;
      observations: BriefingObservation[];
    }
  >();

  for (const { wallet, before, after, gaps } of comparable) {
    const comparison = compareSnapshots(before, after);
    const ref = walletRef(wallet);
    const partial =
      gaps.length > 0 ||
      gapsOf(after).length > 0 ||
      gapsOf(before).length > 0;
    for (const tx of comparison.observed) {
      const entry = transactions.get(tx.hash) ?? {
        hash: tx.hash,
        observations: [],
      };
      const movements: BriefingMovement[] = [];
      if (tx.status === "success")
        for (const movement of after.movements.filter(
          (row) => row.transactionHash === tx.hash,
        )) {
          const value = movementOf(movement);
          const key = movementKey(value);
          if (!movements.some((row) => movementKey(row) === key))
            movements.push(value);
        }
      const observation: BriefingObservation = {
        wallet: ref,
        status: tx.status,
        block: tx.blockNumber,
        beforeBlock: before.anchor.blockNumber,
        afterBlock: after.anchor.blockNumber,
        beforeAt: before.anchor.fetchedAt,
        afterAt: after.anchor.fetchedAt,
        afterBaseline: tx.afterBaseline,
        movements,
        partial: partial || tx.movementCoverage === "partial",
        gaps,
        sources: sourcesOf([before, after], tx.sourceIds),
      };
      const existing = entry.observations.findIndex(
        (row) => row.wallet.id === wallet.id,
      );
      if (existing === -1) entry.observations.push(observation);
      else entry.observations[existing] = observation;
      transactions.set(tx.hash, entry);
    }
  }

  for (const entry of transactions.values()) {
    const statuses = new Set(
      entry.observations.map((row) => row.status),
    );
    const blocks = new Set(entry.observations.map((row) => row.block));
    const windows = new Set(
      entry.observations.map((row) => row.afterBaseline),
    );
    const conflict = statuses.size > 1 || blocks.size > 1;
    const windowMixed = windows.size > 1;
    const afterBaseline = windows.size === 1 ? windows.has(true) : null;
    const category: BriefingCategory =
      statuses.has("failed")
        ? "failed-activity"
        : afterBaseline === false
          ? "older-activity"
          : "new-activity";
    const observations = conflict
      ? entry.observations.map((row) => ({ ...row, movements: [] }))
      : entry.observations;
    const wallets: BriefingWallet[] = [];
    for (const row of observations)
      if (!wallets.some((wallet) => wallet.id === row.wallet.id))
        wallets.push(row.wallet);
    const block = Math.max(...observations.map((row) => row.block));
    const beforeBlock = Math.min(
      ...observations.map((row) => row.beforeBlock),
    );
    const afterBlock = Math.max(
      ...observations.map((row) => row.afterBlock),
    );
    const anchor =
      observations.find((row) => row.block === block) ?? observations[0]!;
    findings.push({
      id: `activity:${entry.hash}`,
      category,
      asset: "transaction",
      label: anchor.movements[0]?.symbol ?? "",
      contract: anchor.movements[0]?.contract ?? null,
      tokenId: anchor.movements[0]?.tokenId ?? null,
      before: null,
      after: null,
      delta: null,
      beforeBlock,
      afterBlock,
      beforeAt: anchor.beforeAt,
      afterAt: anchor.afterAt,
      block,
      wallets,
      transactionHash: entry.hash,
      transactionStatus: statuses.has("failed") ? "failed" : "success",
      afterBaseline,
      conflict,
      windowMixed,
      incompatible: false,
      observations,
      shared: null,
      sources: mergeSources(observations.map((row) => row.sources)),
      partial: observations.some((row) => row.partial),
      gaps: [...new Set(observations.flatMap((row) => row.gaps))],
    });
  }

  findings.sort(
    (a, b) =>
      ORDER[a.category] - ORDER[b.category] ||
      b.block - a.block ||
      a.id.localeCompare(b.id),
  );

  const comparableStates = states.filter((row) => row.status === "comparable");
  const window =
    comparableStates.length > 0
      ? {
          fromBlock: Math.min(
            ...comparableStates.map((row) => row.beforeBlock ?? 0),
          ),
          toBlock: Math.max(
            ...comparableStates.map((row) => row.afterBlock ?? 0),
          ),
          fromAt:
            comparable
              .map((row) => row.before.anchor.fetchedAt)
              .sort()[0] ?? "",
          toAt:
            comparable
              .map((row) => row.after.anchor.fetchedAt)
              .sort()
              .at(-1) ?? "",
        }
      : null;

  const gaps = [
    ...new Set([
      ...states.flatMap((row) => row.gaps),
      ...comparable.flatMap((row) => row.gaps),
    ]),
  ];

  const baselineOnly = states.filter(
    (row) => row.status === "baseline",
  ).length;
  const unsupported = states.filter(
    (row) => row.status === "unsupported",
  ).length;
  const phase: BriefingPhase =
    selected.length === 0
      ? "empty"
      : comparable.length > 0
        ? "ready"
        : baselineOnly > 0
          ? "baseline"
          : unsupported > 0
            ? "unsupported"
            : "baseline";

  return {
    phase,
    changed: findings.length > 0,
    findings,
    unknowns,
    wallets: states,
    comparable: comparable.length,
    baselineOnly,
    unsupported,
    walletCount: selected.length,
    gaps,
    partial:
      gaps.length > 0 ||
      unknowns.length > 0 ||
      findings.some((row) => row.partial),
    window,
  };
}
