import type { PortfolioSnapshot } from "@rh-chain/shared";
import type { VaultWatch } from "../vault/types";
import { assertWatchSnapshot, difference } from "./model";

export type SharedHolding = {
  wallet: Pick<VaultWatch, "id" | "address" | "label">;
  quantity: string;
  decimals: number;
  captured: PortfolioSnapshot["anchor"];
  previousAt: string | null;
  delta: string | null;
  change: "changed" | "unchanged" | "baseline" | "missing" | "metadata";
};
export type OverlapRow = {
  contract: string;
  symbol: string;
  holders: SharedHolding[];
  incompatible: boolean;
};

/** Match positive ERC20 balances by exact contract on the validated Robinhood chain. */
export function walletOverlap(watches: VaultWatch[], selected: string[]) {
  const ids = new Set(selected),
    seen = new Set<string>();
  const wallets = watches.filter((w) => {
    if (!ids.has(w.id) || seen.has(w.address.toLowerCase())) return false;
    seen.add(w.address.toLowerCase());
    return true;
  });
  const contracts = new Map<string, OverlapRow>();
  let partial = false;
  for (const wallet of wallets) {
    const latest = wallet.snapshots.at(-1)!;
    assertWatchSnapshot(latest, wallet.address);
    const previous = wallet.snapshots.at(-2);
    if (previous) assertWatchSnapshot(previous, wallet.address);
    partial ||=
      latest.reconciliation.degradedSources.length > 0 ||
      latest.reconciliation.truncatedSections.length > 0;
    for (const token of latest.tokens) {
      if (BigInt(token.rawBalance) <= 0n) continue;
      const old = previous?.tokens.find((t) => t.contract === token.contract);
      const compatible = old && old.decimals === token.decimals;
      const delta = compatible
        ? difference(token.quantity, old.quantity)
        : null;
      const row = contracts.get(token.contract) ?? {
        contract: token.contract,
        symbol: token.symbol || token.name || token.contract,
        holders: [],
        incompatible: false,
      };
      row.incompatible ||= row.holders.some(
        (h) =>
          h.decimals !== token.decimals ||
          (h.captured.blockNumber === latest.anchor.blockNumber &&
            h.captured.blockHash !== latest.anchor.blockHash),
      );
      row.holders.push({
        wallet: { id: wallet.id, address: wallet.address, label: wallet.label },
        quantity: token.quantity,
        decimals: token.decimals,
        captured: latest.anchor,
        previousAt: previous?.anchor.fetchedAt ?? null,
        delta,
        change: !previous
          ? "baseline"
          : !old
            ? "missing"
            : !compatible
              ? "metadata"
              : delta === "0"
                ? "unchanged"
                : "changed",
      });
      contracts.set(token.contract, row);
    }
  }
  const rows = [...contracts.values()]
    .filter((row) => row.holders.length >= 2)
    .sort(
      (a, b) =>
        b.holders.length - a.holders.length ||
        a.contract.localeCompare(b.contract),
    );
  return { wallets, rows, partial };
}
