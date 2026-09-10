import type { PortfolioApproval } from "@rh-chain/shared";
import { translateCurrent } from "../i18n/translate";

export function approvalIdentity(row: PortfolioApproval): string {
  return [row.kind, row.contract.toLowerCase(), row.spender.toLowerCase(), row.kind === "erc721-token" ? row.tokenId ?? row.transactionHash : ""].join(":");
}

export function uniqueApprovals(rows: PortfolioApproval[]): PortfolioApproval[] {
  const unique = new Map<string, PortfolioApproval>();
  for (const row of rows) {
    const key = approvalIdentity(row);
    const prior = unique.get(key);
    if (!prior) unique.set(key, row);
    else if (prior.active !== row.active || prior.currentAmount !== row.currentAmount) {
      throw new Error(translateCurrent("actions.approvals.conflict"));
    } else unique.set(key, { ...prior, sourceIds: [...new Set([...prior.sourceIds, ...row.sourceIds])] });
  }
  return [...unique.values()];
}

export function permissionMeaning(row: PortfolioApproval): string {
  if (!row.active) return translateCurrent("actions.approvals.meaningInactive");
  if (row.kind === "operator") return translateCurrent("actions.approvals.meaningOperator");
  if (row.kind === "erc721-token") return translateCurrent("actions.approvals.meaningNftToken", { tokenId: row.tokenId ?? translateCurrent("actions.approvals.meaningNftTokenUnavailable") });
  if (row.unlimited) return translateCurrent("actions.approvals.meaningUnlimited");
  return translateCurrent("actions.approvals.meaningLimited", { amount: row.currentAmount });
}
