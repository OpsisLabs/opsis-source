import { normalizeSavedIdentifiers } from "../vault/compatibility";
import type {
  ApprovedMerchantDirectoryEntry,
  ApprovedMerchantDirectoryResponse,
  MerchantInventoryResponse,
  PortfolioSnapshot,
} from "@rh-chain/shared";
import type { SwapDirection } from "../swap/api";
import type { VaultAsset } from "../vault/types";
import { translateCurrent } from "../i18n/translate";

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const HASH = /^0x[0-9a-f]{64}$/;

export type TradeReplayCandidate = {
  id: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: string | null;
  suggestedDirection: SwapDirection;
  evidence: "complete_supported_movement_pattern";
};

export type PurchaseReplaySelection = {
  asset: Pick<VaultAsset, "id" | "name" | "identifier">;
  merchant: ApprovedMerchantDirectoryEntry;
  mapping: ApprovedMerchantDirectoryEntry["mappings"][number];
};

export type CurrentPurchaseOffer = {
  merchantId: string;
  merchantName: string;
  canonicalAssetId: string;
  title: string;
  url: string;
  sku: string;
  productId: string;
  condition: string;
  unitPrice: string;
  currency: string;
  inventoryState: "provider_available" | "provider_low_stock";
  fetchedAt: string;
  freshForMs: number;
};

export function deriveTradeReplayCandidates(
  snapshots: Array<PortfolioSnapshot | null | undefined>,
): TradeReplayCandidate[] {
  const candidates = snapshots.flatMap((snapshot) => {
    if (
      !snapshot ||
      snapshot.chain.id !== 4663 ||
      snapshot.schemaVersion !== 1 ||
      snapshot.reconciliation.truncatedSections.length > 0
    )
      return [];
    return snapshot.transactions.flatMap((transaction): TradeReplayCandidate[] => {
      if (
        transaction.status !== "success" ||
        transaction.movementCoverage !== "complete" ||
        transaction.direction !== "mixed" ||
        !HASH.test(transaction.hash) ||
        transaction.movementCount !== 2
      ) return [];
      const movements = snapshot.movements.filter(
        (movement) => movement.transactionHash === transaction.hash,
      );
      if (
        movements.length !== transaction.movementCount ||
        movements.some(
          (movement) =>
            movement.kind !== "erc20" ||
            movement.tokenId !== null ||
            !movement.contract ||
            ![WETH, USDG].includes(movement.contract.toLowerCase()) ||
            !["in", "out"].includes(movement.direction) ||
            movement.blockNumber !== transaction.blockNumber ||
            !positiveDecimal(movement.quantity),
        )
      ) return [];
      const wethOut = movements.filter(
        (movement) => movement.contract?.toLowerCase() === WETH && movement.direction === "out",
      ).length;
      const usdgIn = movements.filter(
        (movement) => movement.contract?.toLowerCase() === USDG && movement.direction === "in",
      ).length;
      const usdgOut = movements.filter(
        (movement) => movement.contract?.toLowerCase() === USDG && movement.direction === "out",
      ).length;
      const wethIn = movements.filter(
        (movement) => movement.contract?.toLowerCase() === WETH && movement.direction === "in",
      ).length;
      const suggestedDirection = wethOut === 1 && usdgIn === 1
        ? "WETH_TO_USDG"
        : usdgOut === 1 && wethIn === 1
          ? "USDG_TO_WETH"
          : null;
      if (!suggestedDirection) return [];
      return [{
        id: `${snapshot.address}:${transaction.hash}`,
        transactionHash: transaction.hash,
        blockNumber: transaction.blockNumber,
        timestamp: transaction.timestamp,
        suggestedDirection,
        evidence: "complete_supported_movement_pattern",
      }];
    });
  });
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()]
    .sort((left, right) => right.blockNumber - left.blockNumber);
}

export function purchaseAssets(assets: VaultAsset[]): VaultAsset[] {
  return assets.filter(
    (asset) =>
      asset.identifier.trim().length >= 3 &&
      asset.lots.some((lot) => positiveDecimal(lot.quantity)),
  );
}

export function purchaseSelections(
  assets: VaultAsset[],
  directory: ApprovedMerchantDirectoryResponse,
): PurchaseReplaySelection[] {
  directory = normalizeSavedIdentifiers(directory) as ApprovedMerchantDirectoryResponse;
  if (
    directory?.schemaVersion !== 1 ||
    directory.source !== "opsis_reviewed_registry" ||
    !validTimestamp(directory.loadedAt) ||
    !Array.isArray(directory.limitations) ||
    directory.limitations.some((item) => typeof item !== "string" || item.length > 500) ||
    !Array.isArray(directory.merchants) ||
    directory.merchants.length > 50
  ) throw new Error(translateCurrent("actions.replay.directoryInvalid"));
  const eligible = purchaseAssets(assets);
  const merchantIds = new Set<string>();
  const merchantOrigins = new Set<string>();
  return directory.merchants.flatMap((merchant) => {
    assertMerchant(merchant);
    const origin = urlOrigin(merchant.permissionEvidenceUrl);
    if (merchantIds.has(merchant.id) || merchantOrigins.has(origin))
      throw new Error(translateCurrent("actions.replay.directoryAmbiguous"));
    merchantIds.add(merchant.id);
    merchantOrigins.add(origin);
    const mappingKeys = new Set<string>();
    const productIds = new Set<string>();
    return merchant.mappings.flatMap((mapping) => {
      assertMapping(mapping, origin);
      const mappingKey = mapping.canonicalAssetId;
      if (mappingKeys.has(mappingKey) || productIds.has(mapping.productId))
        throw new Error(translateCurrent("actions.replay.mappingAmbiguous"));
      mappingKeys.add(mappingKey);
      productIds.add(mapping.productId);
      const asset = eligible.find((candidate) => candidate.identifier === mapping.canonicalAssetId);
      return asset ? [{
        asset: { id: asset.id, name: asset.name, identifier: asset.identifier },
        merchant,
        mapping,
      }] : [];
    });
  });
}

export function currentPurchaseOffer(
  selection: PurchaseReplaySelection,
  response: MerchantInventoryResponse,
  now = Date.now(),
): CurrentPurchaseOffer {
  const offer = response?.offer;
  const fetchedAt = Date.parse(response?.fetchedAt);
  const elapsedMs = Math.max(0, now - fetchedAt);
  if (
    response.schemaVersion !== 1 ||
    response.state !== "exact_match" ||
    response.merchant?.id !== selection.merchant.id ||
    response.merchant?.name !== selection.merchant.name ||
    response.merchant?.provider !== "woocommerce" ||
    response.canonicalAssetId !== selection.asset.identifier ||
    response.mapping?.sku !== selection.mapping.sku ||
    response.mapping?.productId !== selection.mapping.productId ||
    response.mapping?.reviewedAt !== selection.mapping.reviewedAt ||
    response.mapping?.evidenceUrl !== selection.mapping.evidenceUrl ||
    response.fetchedAt !== offer?.fetchedAt ||
    response.freshForMs !== offer?.freshForMs ||
    response.source?.provider !== "woocommerce" ||
    response.source?.url !== offer?.url ||
    !Array.isArray(response.limitations) ||
    response.limitations.length > 20 ||
    response.limitations.some((item) => typeof item !== "string" || item.length > 500) ||
    response.privacy?.accountRequired !== false ||
    response.privacy?.walletConnectionRequired !== false ||
    response.privacy?.serverStorage !== "none" ||
    response.privacy?.modelProvider !== "none" ||
    !Array.isArray(response.privacy?.providerDestinations) ||
    response.privacy.providerDestinations.length !== 1 ||
    response.privacy.providerDestinations[0] !== selection.merchant.name ||
    typeof response.privacy?.disclosure !== "string" ||
    response.privacy.disclosure.length < 1 ||
    response.privacy.disclosure.length > 1_500 ||
    !offer ||
    offer.provider !== "woocommerce" ||
    offer.identityConfidence !== "reviewed_simple_product_mapping" ||
    offer.merchantId !== selection.merchant.id ||
    offer.merchantName !== selection.merchant.name ||
    offer.canonicalAssetId !== selection.asset.identifier ||
    offer.sku !== selection.mapping.sku ||
    offer.productId !== selection.mapping.productId ||
    offer.mappingReviewedAt !== selection.mapping.reviewedAt ||
    offer.mappingEvidenceUrl !== selection.mapping.evidenceUrl ||
    offer.variantLabel !== selection.mapping.variantLabel ||
    offer.condition !== selection.mapping.condition ||
    (offer.inventoryState !== "provider_available" && offer.inventoryState !== "provider_low_stock") ||
    !Number.isFinite(offer.freshForMs) ||
    offer.freshForMs <= 0 ||
    offer.freshForMs > 300_000 ||
    !Number.isFinite(fetchedAt) ||
    fetchedAt > now + 30_000 ||
    elapsedMs >= offer.freshForMs ||
    typeof offer.title !== "string" ||
    offer.title.length < 1 ||
    offer.title.length > 240 ||
    typeof offer.merchantName !== "string" ||
    offer.merchantName.length < 1 ||
    offer.merchantName.length > 120 ||
    typeof offer.variantLabel !== "string" ||
    offer.variantLabel.length > 160 ||
    typeof offer.condition !== "string" ||
    offer.condition.length > 160 ||
    !positiveDecimal(offer.unitPrice) ||
    !/^[A-Z]{3,12}$/.test(offer.currency) ||
    !safeProductUrl(offer.url, selection.merchant.permissionEvidenceUrl)
  ) throw new Error(translateCurrent("actions.replay.offerUnmatched"));
  return {
    merchantId: offer.merchantId,
    merchantName: offer.merchantName,
    canonicalAssetId: offer.canonicalAssetId,
    title: offer.title,
    url: offer.url,
    sku: offer.sku,
    productId: offer.productId,
    condition: `${offer.variantLabel} · ${offer.condition}`,
    unitPrice: offer.unitPrice,
    currency: offer.currency,
    inventoryState: offer.inventoryState,
    fetchedAt: offer.fetchedAt,
    freshForMs: offer.freshForMs - elapsedMs,
  };
}

function assertMerchant(merchant: ApprovedMerchantDirectoryEntry): void {
  if (
    !merchant ||
    !/^[a-z0-9-]{2,64}$/.test(merchant.id) ||
    typeof merchant.name !== "string" ||
    merchant.name.length < 1 ||
    merchant.name.length > 120 ||
    !date(merchant.permissionReviewedAt) ||
    !httpsUrl(merchant.permissionEvidenceUrl) ||
    !Array.isArray(merchant.mappings) ||
    merchant.mappings.length > 100
  ) throw new Error(translateCurrent("actions.replay.directoryInvalid"));
}

function assertMapping(
  mapping: ApprovedMerchantDirectoryEntry["mappings"][number],
  merchantOrigin: string,
): void {
  if (
    !mapping ||
    typeof mapping.canonicalAssetId !== "string" ||
    mapping.canonicalAssetId.length < 3 ||
    mapping.canonicalAssetId.length > 200 ||
    typeof mapping.sku !== "string" ||
    mapping.sku.length < 1 ||
    mapping.sku.length > 100 ||
    !/^\d{1,20}$/.test(mapping.productId) ||
    !date(mapping.reviewedAt) ||
    !httpsUrl(mapping.evidenceUrl) ||
    urlOrigin(mapping.evidenceUrl) !== merchantOrigin
  ) throw new Error(translateCurrent("actions.replay.mappingInvalid"));
}

function safeProductUrl(value: string, permissionEvidence: string): boolean {
  try {
    const product = new URL(value);
    const permission = new URL(permissionEvidence);
    if (
      product.protocol !== "https:" ||
      product.origin !== permission.origin ||
      product.username ||
      product.password ||
      product.hash ||
      product.search ||
      /\/(?:cart|checkout|order)(?:\/|$)/i.test(product.pathname)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function urlOrigin(value: string): string {
  return new URL(value).origin;
}

function positiveDecimal(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) &&
    /[1-9]/.test(value)
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
