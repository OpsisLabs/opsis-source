import type { PortfolioApproval } from "@rh-chain/shared";

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
      throw new Error("Conflicting permission evidence. Refresh before reviewing permissions.");
    } else unique.set(key, { ...prior, sourceIds: [...new Set([...prior.sourceIds, ...row.sourceIds])] });
  }
  return [...unique.values()];
}

export function permissionMeaning(row: PortfolioApproval): string {
  if (!row.active) return "This discovered permission was inactive at the captured block. This is not a wallet safety verdict.";
  if (row.kind === "operator") return "This operator can transfer assets across this NFT collection, including future holdings while the permission remains active.";
  if (row.kind === "erc721-token") return `Permission for NFT ${row.tokenId ?? "(token ID unavailable in this older snapshot)"}. This is not collection-wide access.`;
  if (row.unlimited) return "Unlimited token allowance: this spender may transfer current and future token holdings while this permission remains active.";
  return `Limited token allowance: ${row.currentAmount} raw base units. This is not a dollar amount or a human-readable token quantity.`;
}
