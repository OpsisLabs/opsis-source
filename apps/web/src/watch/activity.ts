import type {
  PortfolioMovement,
  PortfolioSnapshot,
  PortfolioTransaction,
} from "@rh-chain/shared";
import type { VaultWatch } from "../vault/types";
import { assertWatchSnapshot } from "./model";

export type ActivityKind = "all" | "native" | "tokens" | "nfts";
export type Observation = {
  wallet: Pick<VaultWatch, "id" | "address" | "label">;
  transaction: PortfolioTransaction;
  movements: PortfolioMovement[];
  captured: PortfolioSnapshot["anchor"];
  discovery: "baseline" | "later" | "older";
  partial: boolean;
  conflict: boolean;
};
export type ActivityEvent = {
  hash: string;
  block: number;
  observations: Observation[];
  conflict: boolean;
};

/** Only retained, validated local evidence. No lookups, ownership inference or trade classification. */
export function savedActivity(watches: VaultWatch[]): ActivityEvent[] {
  const events = new Map<string, ActivityEvent>();
  const addresses = new Set<string>();
  for (const wallet of watches) {
    if (addresses.has(wallet.address.toLowerCase())) continue;
    addresses.add(wallet.address.toLowerCase());
    const seen = new Map<string, Observation>();
    const snapshots = [...wallet.snapshots].sort(
      (a, b) => a.anchor.blockNumber - b.anchor.blockNumber,
    );
    for (const [index, snapshot] of snapshots.entries()) {
      assertWatchSnapshot(snapshot, wallet.address);
      for (const transaction of snapshot.transactions) {
        const previous = seen.get(transaction.hash);
        seen.set(transaction.hash, {
          wallet: {
            id: wallet.id,
            address: wallet.address,
            label: wallet.label,
          },
          transaction,
          // A failed transaction is not a successful asset movement.
          movements:
            transaction.status === "success"
              ? snapshot.movements.filter(
                  (m) => m.transactionHash === transaction.hash,
                )
              : [],
          captured: snapshot.anchor,
          discovery:
            previous?.discovery ??
            (index === 0
              ? "baseline"
              : transaction.blockNumber >
                  snapshots[index - 1].anchor.blockNumber
                ? "later"
                : "older"),
          partial:
            transaction.movementCoverage === "partial" ||
            snapshot.reconciliation.degradedSources.length > 0 ||
            snapshot.reconciliation.truncatedSections.length > 0,
          conflict: Boolean(
            previous &&
            (previous.conflict ||
              previous.transaction.blockNumber !== transaction.blockNumber ||
              previous.transaction.status !== transaction.status),
          ),
        });
      }
    }
    for (const observation of seen.values()) {
      const tx = observation.transaction;
      const event = events.get(tx.hash) ?? {
        hash: tx.hash,
        block: tx.blockNumber,
        observations: [],
        conflict: false,
      };
      event.conflict ||=
        observation.conflict ||
        event.observations.some(
          (other) =>
            other.transaction.blockNumber !== tx.blockNumber ||
            other.transaction.status !== tx.status ||
            (other.captured.blockNumber === observation.captured.blockNumber &&
              other.captured.blockHash !== observation.captured.blockHash),
        );
      event.observations.push(observation);
      event.block = Math.max(event.block, tx.blockNumber);
      events.set(tx.hash, event);
    }
  }
  return [...events.values()].sort(
    (a, b) => b.block - a.block || a.hash.localeCompare(b.hash),
  );
}

export function filterActivity(
  events: ActivityEvent[],
  walletId: string,
  kind: ActivityKind,
  query: string,
): ActivityEvent[] {
  const search = query.trim().toLowerCase();
  return events.flatMap((event) => {
    const observations = event.observations.filter((row) => {
      if (walletId && row.wallet.id !== walletId) return false;
      if (
        kind !== "all" &&
        !row.movements.some((m) =>
          kind === "native"
            ? m.kind === "native"
            : kind === "tokens"
              ? m.kind === "erc20"
              : m.kind === "erc721" || m.kind === "erc1155",
        )
      )
        return false;
      return (
        !search ||
        [
          event.hash,
          row.wallet.address,
          ...row.movements.flatMap((m) => [
            m.contract ?? "",
            m.symbol,
            m.tokenId ?? "",
          ]),
        ].some((value) => value.toLowerCase().includes(search))
      );
    });
    return observations.length ? [{ ...event, observations }] : [];
  });
}
