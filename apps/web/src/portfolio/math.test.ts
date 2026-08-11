import { describe, expect, it } from "vitest";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import type { VaultAsset, VaultPortfolioValuation } from "../vault/types";
import { allocationPercent, buildPortfolioMath, formatDisplayDecimal, valueTotals } from "./math";

const TOKEN = "0x3333333333333333333333333333333333333333";
const NFT = "0x4444444444444444444444444444444444444444";

describe("exact local portfolio math", () => {
  it("computes same-currency cost and change without floating point conversion", () => {
    const rows = buildPortfolioMath(snapshot("3.000000000000000001"), [asset([
      { quantity: "1.000000000000000001", unitPrice: "0.000000000000000001", currency: "USD" },
      { quantity: "2", unitPrice: "1000000000000000000.000000000000000001", currency: "USD" }
    ])], [valuation("1000000000000000001.000000000000000001", "USD")]);
    const row = rows.find((candidate) => candidate.assetKey === `token:${TOKEN}`)!;

    expect(row.quantityMatches).toBe(true);
    expect(row.acquisition).toEqual([{ currency: "USD", cost: "2000000000000000000.000000000000000003000000000000000001", complete: true }]);
    expect(row.currentValue).toBe("3000000000000000004.000000000000000004000000000000000001");
    expect(row.unrealizedGain).toBe("1000000000000000004.000000000000000001");
    expect(valueTotals(rows)).toContainEqual({ currency: "USD", value: row.currentValue });
  });

  it("refuses to invent P&L for quantity mismatch or mixed currencies", () => {
    const rows = buildPortfolioMath(snapshot("3"), [asset([
      { quantity: "1", unitPrice: "10", currency: "USD" },
      { quantity: "1", unitPrice: "8", currency: "EUR" }
    ])], [valuation("20", "USD")]);
    const row = rows.find((candidate) => candidate.assetKey === `token:${TOKEN}`)!;
    expect(row.quantityMatches).toBe(false);
    expect(row.unrealizedGain).toBeNull();
    expect(row.gainUnavailableReason).toContain("do not match");
  });

  it("rounds only for display while retaining exact stored values", () => {
    expect(formatDisplayDecimal("123.4567895", 6)).toBe("123.45679");
    expect(formatDisplayDecimal("-0.0000006", 6)).toBe("-0.000001");
    expect(allocationPercent("1", "3")).toBe("33.33");
    expect(allocationPercent("0", "0")).toBeNull();
  });

  it("links NFT lots only by contract and token id, never to every item in a collection", () => {
    const nftSnapshot = snapshot("0");
    nftSnapshot.nfts = [
      { kind: "erc721", contract: NFT, tokenId: "7", name: "Test NFT", symbol: "TNFT", quantity: "1", sourceIds: [] },
      { kind: "erc721", contract: NFT, tokenId: "8", name: "Test NFT", symbol: "TNFT", quantity: "1", sourceIds: [] }
    ];
    const collectionOnly = asset([{ quantity: "1", unitPrice: "100", currency: "USD" }], NFT);
    const exactToken = asset([{ quantity: "1", unitPrice: "200", currency: "USD" }], `${NFT}:7`);
    const rows = buildPortfolioMath(nftSnapshot, [collectionOnly, exactToken], []);

    expect(rows.find((row) => row.assetKey === `nft:${NFT}:7`)?.linkedAsset?.id).toBe(exactToken.id);
    expect(rows.find((row) => row.assetKey === `nft:${NFT}:8`)?.linkedAsset).toBeNull();
  });
});

function snapshot(quantity: string): PortfolioSnapshot {
  return {
    schemaVersion: 1,
    chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
    address: "0x1111111111111111111111111111111111111111",
    finality: { tag: "finalized", blockNumber: 1, blockHash: `0x${"a".repeat(64)}`, timestamp: "2026-08-10T12:00:00.000Z", fetchedAt: "2026-08-10T12:01:00.000Z" },
    nativeBalanceEth: "0",
    tokens: [{ kind: "erc20", contract: TOKEN, name: "Token", symbol: "TKN", decimals: 18, quantity, rawBalance: "1", sourceIds: [] }],
    nfts: [],
    transactions: [],
    movements: [],
    approvals: [],
    attention: [],
    reconciliation: { tokenCandidates: 1, tokenConfirmed: 1, nftCandidates: 0, nftConfirmed: 0, activityCandidates: 0, activityConfirmed: 0, approvalCandidates: 0, approvalConfirmed: 0, degradedSources: [], truncatedSections: [] },
    citations: [],
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "client_encrypted_vault", providerDestinations: ["alchemy"], disclosure: "test" }
  };
}

function valuation(unitPrice: string, currency: string): VaultPortfolioValuation {
  return { id: crypto.randomUUID(), assetKey: `token:${TOKEN}`, unitPrice, currency, updatedAt: "2026-08-10T12:00:00.000Z" };
}

function asset(lots: Array<{ quantity: string; unitPrice: string; currency: string }>, identifier = TOKEN): VaultAsset {
  return {
    id: crypto.randomUUID(),
    name: "Linked token",
    assetType: "crypto",
    identifier,
    lots: lots.map((lot) => ({ id: crypto.randomUUID(), ...lot, acquiredAt: "2026-08-10" })),
    notes: "",
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z"
  };
}
