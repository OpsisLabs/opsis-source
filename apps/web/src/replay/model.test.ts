import { describe, expect, it } from "vitest";
import type { ApprovedMerchantDirectoryResponse, MerchantInventoryResponse, PortfolioSnapshot } from "@rh-chain/shared";
import type { VaultAsset } from "../vault/types";
import { currentPurchaseOffer, deriveTradeReplayCandidates, purchaseSelections } from "./model";

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const HASH = `0x${"ab".repeat(32)}`;
const NOW = Date.parse("2026-08-12T12:01:00.000Z");

describe("local replay intent", () => {
  it("derives only a complete supported two-token movement pattern and never carries the old amounts", () => {
    const candidates = deriveTradeReplayCandidates([snapshot()]);
    expect(candidates).toEqual([expect.objectContaining({
      transactionHash: HASH,
      suggestedDirection: "WETH_TO_USDG",
      evidence: "complete_supported_movement_pattern",
    })]);
    expect(JSON.stringify(candidates)).not.toContain("3.25");
    expect(JSON.stringify(candidates)).not.toContain("12.75");
  });

  it.each([
    { status: "failed" },
    { movementCoverage: "partial" },
    { direction: "out" },
    { movementCount: 3 },
  ])("rejects unsafe transaction state %o", (override) => {
    const value = snapshot();
    Object.assign(value.transactions[0]!, override);
    expect(deriveTradeReplayCandidates([value])).toEqual([]);
  });

  it("rejects any snapshot with truncated coverage", () => {
    const value = snapshot();
    value.reconciliation.truncatedSections.push("movements: 40 of 41");
    expect(deriveTradeReplayCandidates([value])).toEqual([]);
  });

  it("rejects missing, zero, mismatched-block, self, native, NFT, third-token, and incomplete movement rows", () => {
    for (const mutate of [
      (value: PortfolioSnapshot) => value.movements.pop(),
      (value: PortfolioSnapshot) => { value.movements[0]!.quantity = "0"; },
      (value: PortfolioSnapshot) => { value.movements[0]!.blockNumber = 98; },
      (value: PortfolioSnapshot) => { value.movements[0]!.direction = "self"; },
      (value: PortfolioSnapshot) => { value.movements[0]!.kind = "native"; value.movements[0]!.contract = null; },
      (value: PortfolioSnapshot) => { value.movements[0]!.kind = "erc721"; value.movements[0]!.tokenId = "1"; },
      (value: PortfolioSnapshot) => { value.movements[0]!.contract = "0x1111111111111111111111111111111111111111"; },
    ]) {
      const value = snapshot();
      mutate(value);
      expect(deriveTradeReplayCandidates([value])).toEqual([]);
    }
  });

  it("requires a lot-linked exact asset and a current reviewed available product handoff", () => {
    const selections = purchaseSelections([asset()], directory());
    expect(selections).toHaveLength(1);
    const current = currentPurchaseOffer(selections[0]!, response(), NOW);
    expect(current).toMatchObject({ merchantId: "sample-store", productId: "42", inventoryState: "provider_available" });
    expect(current.url).toBe("https://merchant.example/product/card/");
  });

  it("rejects imported or changed mapping, unavailable stock, stale bounds, and checkout-like URLs", () => {
    const selection = purchaseSelections([asset()], directory())[0]!;
    for (const mutate of [
      (value: MerchantInventoryResponse) => { value.mapping.productId = "99"; },
      (value: MerchantInventoryResponse) => { value.merchant.name = "Changed Store"; },
      (value: MerchantInventoryResponse) => { value.offer!.merchantName = "Changed Store"; },
      (value: MerchantInventoryResponse) => { value.offer!.variantLabel = "Non-holo"; },
      (value: MerchantInventoryResponse) => { value.offer!.condition = "Poor"; },
      (value: MerchantInventoryResponse) => { value.privacy.serverStorage = "cached" as "none"; },
      (value: MerchantInventoryResponse) => { value.privacy.providerDestinations = ["Other Store"]; },
      (value: MerchantInventoryResponse) => { value.offer!.inventoryState = "provider_unavailable"; },
      (value: MerchantInventoryResponse) => { value.state = "valid_empty"; value.offer = null; },
      (value: MerchantInventoryResponse) => { value.offer!.freshForMs = 300_001; },
      (value: MerchantInventoryResponse) => { value.offer!.url = "https://merchant.example/checkout/?add-to-cart=42"; },
      (value: MerchantInventoryResponse) => { value.offer!.url = "https://evil.example/product/card/"; },
      (value: MerchantInventoryResponse) => { value.source.url = "https://merchant.example/product/other/"; },
      (value: MerchantInventoryResponse) => { value.fetchedAt = "2026-08-12T12:00:01.000Z"; },
    ]) {
      const value = response();
      mutate(value);
      expect(() => currentPurchaseOffer(selection, value, NOW)).toThrow(/could not be matched safely/);
    }
    expect(() => currentPurchaseOffer(selection, response(), Date.parse("2026-08-12T12:05:00.000Z"))).toThrow(/could not be matched safely/);
    expect(() => currentPurchaseOffer(selection, response(), Date.parse("2026-08-12T11:59:29.000Z"))).toThrow(/could not be matched safely/);
  });

  it("rejects ambiguous directories and mapping evidence on another origin", () => {
    const duplicate = directory();
    duplicate.merchants.push({ ...duplicate.merchants[0]! });
    expect(() => purchaseSelections([asset()], duplicate)).toThrow(/ambiguous/);
    const wrongOrigin = directory();
    wrongOrigin.merchants[0]!.mappings[0]!.evidenceUrl = "https://other.example/product/card/";
    expect(() => purchaseSelections([asset()], wrongOrigin)).toThrow(/invalid/);
  });
});

function snapshot(): PortfolioSnapshot {
  return {
    schemaVersion: 1,
    chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
    address: "0x2222222222222222222222222222222222222222",
    anchor: { tag: "latest", blockNumber: 100, blockHash: `0x${"cd".repeat(32)}`, timestamp: "2026-08-12T12:00:00.000Z", fetchedAt: "2026-08-12T12:00:01.000Z" },
    nativeBalanceEth: "0",
    tokens: [], nfts: [], approvals: [], attention: [], citations: [],
    transactions: [{ hash: HASH, blockNumber: 99, timestamp: "2026-08-12T11:59:00.000Z", status: "success", method: "swap", direction: "mixed", counterparty: null, nativeValueEth: "0", movementCount: 2, movementCoverage: "complete", sourceIds: ["receipt"] }],
    movements: [
      { transactionHash: HASH, blockNumber: 99, timestamp: "2026-08-12T11:59:00.000Z", direction: "out", kind: "erc20", symbol: "WETH", quantity: "3.25", contract: WETH, tokenId: null, counterparty: null, sourceIds: ["receipt"] },
      { transactionHash: HASH, blockNumber: 99, timestamp: "2026-08-12T11:59:00.000Z", direction: "in", kind: "erc20", symbol: "USDG", quantity: "12.75", contract: USDG, tokenId: null, counterparty: null, sourceIds: ["receipt"] },
    ],
    reconciliation: { tokenCandidates: 0, tokenConfirmed: 0, nftCandidates: 0, nftConfirmed: 0, activityCandidates: 1, activityConfirmed: 1, approvalCandidates: 0, approvalConfirmed: 0, degradedSources: [], truncatedSections: [] },
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "client_encrypted_vault", providerDestinations: [], disclosure: "fixture" },
  };
}

function asset(): VaultAsset {
  return { id: "00000000-0000-4000-8000-000000000001", name: "Card", assetType: "collectible", identifier: "tcgdex:en:base1-4", lots: [{ id: "00000000-0000-4000-8000-000000000002", quantity: "1", unitPrice: "100", currency: "USD", acquiredAt: "2026-08-01" }], notes: "private", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
}

function directory(): ApprovedMerchantDirectoryResponse {
  return { schemaVersion: 1, source: "opsis_reviewed_registry", loadedAt: "2026-08-12T12:00:00.000Z", limitations: [], merchants: [{ id: "sample-store", name: "Sample Store", permissionReviewedAt: "2026-08-01", permissionEvidenceUrl: "https://merchant.example/permission/", mappings: [{ canonicalAssetId: "tcgdex:en:base1-4", sku: "CARD-4", productId: "42", variantLabel: "Holo", condition: "Near mint", reviewedAt: "2026-08-01", evidenceUrl: "https://merchant.example/product/card/" }] }] };
}

function response(): MerchantInventoryResponse {
  return { schemaVersion: 1, merchant: { id: "sample-store", name: "Sample Store", provider: "woocommerce" }, canonicalAssetId: "tcgdex:en:base1-4", mapping: { sku: "CARD-4", productId: "42", reviewedAt: "2026-08-01", evidenceUrl: "https://merchant.example/product/card/" }, state: "exact_match", fetchedAt: "2026-08-12T12:00:00.000Z", freshForMs: 300_000, source: { provider: "woocommerce", url: "https://merchant.example/product/card/" }, limitations: [], privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", modelProvider: "none", providerDestinations: ["Sample Store"], disclosure: "fixture" }, offer: { provider: "woocommerce", merchantId: "sample-store", merchantName: "Sample Store", canonicalAssetId: "tcgdex:en:base1-4", identityConfidence: "reviewed_simple_product_mapping", productId: "42", sku: "CARD-4", title: "Card", variantLabel: "Holo", condition: "Near mint", mappingReviewedAt: "2026-08-01", mappingEvidenceUrl: "https://merchant.example/product/card/", url: "https://merchant.example/product/card/", currency: "USD", unitPrice: "125", inventoryState: "provider_available", exactQuantity: null, productRating: null, fetchedAt: "2026-08-12T12:00:00.000Z", freshForMs: 300_000 } };
}

it("accepts the legacy merchant registry provenance for local replay", () => {
  const legacy = { ...directory(), source: "chainscout_reviewed_registry" } as unknown as ApprovedMerchantDirectoryResponse;
  expect(purchaseSelections([asset()], legacy)).toEqual(purchaseSelections([asset()], directory()));
  expect(legacy.source).toBe("chainscout_reviewed_registry");
});
