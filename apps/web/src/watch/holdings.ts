import type { PortfolioSnapshot, PortfolioTokenHolding, PortfolioTransaction, PortfolioMovement, PortfolioApproval } from "@rh-chain/shared";
import {
  hasHiddenCharacters, lookalikeAsset, reviewedAsset,
  visibleTokenText, wellKnownUnreviewedSymbol,
} from "../opsis/explorer-facts";

export function tokenFlags(token: PortfolioTokenHolding) {
  return {
    reviewed: reviewedAsset(token.contract),
    lookalike: lookalikeAsset(token.symbol, token.contract),
    wellKnown: wellKnownUnreviewedSymbol(token.symbol, token.contract),
    hidden: hasHiddenCharacters(token.name) || hasHiddenCharacters(token.symbol),
    scam: token.reputation === "scam",
  };
}

export function orderTokens(tokens: PortfolioTokenHolding[]) {
  const rank = (token: PortfolioTokenHolding) => {
    const flags = tokenFlags(token);
    return flags.reviewed ? 0 : flags.lookalike || flags.wellKnown || flags.hidden || flags.scam ? 1 : 2;
  };
  return [...tokens].sort((left, right) => rank(left) - rank(right));
}

export function tokenLabel(token: PortfolioTokenHolding, c: (en: string, zh: string) => string) {
  const label = `${visibleTokenText(token.name)} · ${visibleTokenText(token.symbol)}`;
  return lookalikeAsset(token.symbol, token.contract) ? `${label} · ${c("Lookalike", "同符号不同合约")}` : label;
}

export type WatchTimelineEntry = {
  hash: string;
  blockNumber: number | null;
  timestamp: string | null;
  transaction?: PortfolioTransaction;
  movements: PortfolioMovement[];
  approvals: PortfolioApproval[];
};

export function watchActivitySummary(entry: WatchTimelineEntry, c: (en: string, zh: string) => string) {
  if (entry.transaction?.status === "failed") return c("Failed transaction", "交易失败");
  if (entry.approvals.length || /approve|setApproval/i.test(entry.transaction?.method ?? "")) return c("Approval activity", "授权活动");
  if (entry.movements.length) return c("Observed transfer", "已观察转账");
  if (!entry.transaction) return c("Observed activity", "已观察活动");
  return entry.transaction.direction === "out" ? c("Sent", "已发送")
    : entry.transaction.direction === "in" ? c("Received", "已收到")
      : entry.transaction.direction === "self" ? c("Self transfer", "自身转账")
        : c("Mixed activity", "混合活动");
}

/** Group evidence by transaction; block order remains authoritative when dates are missing. */
export function watchTimeline(snapshot: PortfolioSnapshot): WatchTimelineEntry[] {
  const entries = new Map<string, WatchTimelineEntry>();
  const get = (hash: string) => {
    const key = hash.toLowerCase();
    if (!entries.has(key)) entries.set(key, { hash, blockNumber: null, timestamp: null, movements: [], approvals: [] });
    return entries.get(key)!;
  };
  for (const transaction of snapshot.transactions) {
    Object.assign(get(transaction.hash), { transaction, blockNumber: transaction.blockNumber, timestamp: transaction.timestamp });
  }
  for (const movement of snapshot.movements) {
    const entry = get(movement.transactionHash);
    if (!entry.transaction) {
      entry.blockNumber = movement.blockNumber;
      entry.timestamp = movement.timestamp;
    }
    entry.movements.push(movement);
  }
  for (const approval of snapshot.approvals) get(approval.transactionHash).approvals.push(approval);
  return [...entries.values()].sort((left, right) =>
    (right.blockNumber ?? -1) - (left.blockNumber ?? -1)
    || (Date.parse(right.timestamp ?? "") || 0) - (Date.parse(left.timestamp ?? "") || 0)
    || left.hash.localeCompare(right.hash));
}
