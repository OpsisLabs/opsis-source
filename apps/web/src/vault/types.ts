import type {
  CollectibleCardDetail,
  CollectibleLanguage,
  CryptoMarketResponse,
  MerchantInventoryResponse,
  PortfolioSnapshot,
} from "@rh-chain/shared";

export const VAULT_FORMAT = "chainscout.encrypted-vault" as const;
export const VAULT_SCHEMA_VERSION = 1 as const;
export const VAULT_RECORD_VERSION = 1 as const;
export const VAULT_PORTFOLIO_RECORD_VERSION = 2 as const;
export const VAULT_COLLECTIBLE_RECORD_VERSION = 3 as const;
export const VAULT_MARKET_RECORD_VERSION = 4 as const;
export const VAULT_KDF_ITERATIONS = 600_000;
export const VAULT_MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const VAULT_MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const VAULT_MAX_RECORDS = 2_000;

export type VaultAssetType = "crypto" | "collectible" | "rwa" | "nft" | "other";

export interface VaultPhoto {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  dataUrl: string;
}

export interface VaultLot {
  id: string;
  quantity: string;
  unitPrice: string;
  currency: string;
  acquiredAt: string;
}

export interface VaultLotDraft {
  id?: string;
  quantity: string;
  unitPrice: string;
  currency: string;
  acquiredAt: string;
}

export interface VaultAsset {
  id: string;
  name: string;
  assetType: VaultAssetType;
  identifier: string;
  lots: VaultLot[];
  notes: string;
  photo?: VaultPhoto;
  collectible?: VaultCollectibleDetails;
  createdAt: string;
  updatedAt: string;
}

export type VaultCollectibleCondition =
  "unknown" | "poor" | "played" | "good" | "excellent" | "near-mint" | "mint";
export type VaultCollectibleGrader =
  "ungraded" | "psa" | "cgc" | "bgs" | "other";

export interface VaultCollectibleReference {
  id: string;
  value: string;
  currency: string;
  observedAt: string;
  sourceUrl: string;
  label: string;
}

export interface VaultCollectibleDetails {
  catalog: CollectibleCardDetail | null;
  ownerPrinting: string;
  condition: VaultCollectibleCondition;
  grader: VaultCollectibleGrader;
  grade: string;
  certificate: string;
  photoSource: "owner_supplied" | "tcgdex_catalog" | null;
  photoAddedAt: string | null;
  references: VaultCollectibleReference[];
}

export interface VaultCollectibleReceipt {
  id: string;
  operation: "search" | "detail";
  language: CollectibleLanguage;
  query: string;
  providerDestinations: ["TCGdex"];
  disclosure: string;
  approvedAt: string;
  outcome: "approved" | "completed" | "failed";
  resolvedAt?: string;
}

export interface VaultCollectibleContext {
  id: string;
  kind: "collectible-context";
  receipts: VaultCollectibleReceipt[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultCollectibleContextDraft {
  receipts: VaultCollectibleReceipt[];
}

export interface VaultPortfolioValuation {
  id: string;
  assetKey: string;
  unitPrice: string;
  currency: string;
  updatedAt: string;
}

export interface VaultPortfolioReceipt {
  id: string;
  address: string;
  providerDestinations: string[];
  disclosure: string;
  approvedAt: string;
  outcome: "approved" | "completed" | "failed";
  resolvedAt?: string;
}

export interface VaultPortfolioContext {
  id: string;
  kind: "portfolio-context";
  address: string;
  label: string;
  valuations: VaultPortfolioValuation[];
  latestSnapshot: PortfolioSnapshot | null;
  receipts: VaultPortfolioReceipt[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultPortfolioContextDraft {
  address: string;
  label: string;
  valuations: VaultPortfolioValuation[];
  latestSnapshot: PortfolioSnapshot | null;
  receipts: VaultPortfolioReceipt[];
}

export interface VaultMarketReceipt {
  id: string;
  operation: "crypto" | "merchant";
  publicIdentifier: string;
  merchantMapping: {
    sku: string;
    productId: string;
    reviewedAt: string;
  } | null;
  providerDestinations: string[];
  disclosure: string;
  approvedAt: string;
  outcome: "approved" | "completed" | "failed";
  resolvedAt?: string;
}

export type VaultMarketIdentityConfidence =
  "exact_provider_mapping" | "owner_linked" | "candidate";
export type VaultMarketInventoryState =
  | "provider_available"
  | "provider_low_stock"
  | "provider_unavailable"
  | "owner_available"
  | "unknown";

export interface VaultMarketComparison {
  id: string;
  canonicalAssetId: string;
  label: string;
  sourceKind: "provider_offer" | "owner_entered";
  identityConfidence: VaultMarketIdentityConfidence;
  merchantMapping: {
    merchantId: string;
    sku: string;
    productId: string;
    reviewedAt: string;
    evidenceUrl: string;
  } | null;
  providerName: string;
  sourceUrl: string;
  observedAt: string;
  freshForMs: number;
  currency: string;
  itemUnitPrice: string;
  quantity: string;
  shipping: string;
  tax: string;
  duty: string;
  fees: string;
  discount: string;
  inventoryState: VaultMarketInventoryState;
  condition: string;
  region: string;
  returnNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultMarketContext {
  id: string;
  kind: "market-context";
  cryptoObservations: CryptoMarketResponse[];
  merchantObservations: MerchantInventoryResponse[];
  comparisons: VaultMarketComparison[];
  receipts: VaultMarketReceipt[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultMarketContextDraft {
  cryptoObservations: CryptoMarketResponse[];
  merchantObservations: MerchantInventoryResponse[];
  comparisons: VaultMarketComparison[];
  receipts: VaultMarketReceipt[];
}

export interface VaultKdf {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
}

export interface VaultWrappedKey {
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export interface VaultRecoveryWrapper extends VaultWrappedKey {
  checksum: string;
}

export interface VaultMeta {
  key: "vault";
  format: typeof VAULT_FORMAT;
  schemaVersion: typeof VAULT_SCHEMA_VERSION;
  vaultId: string;
  revision: number;
  kdf: VaultKdf;
  wrappedKey: VaultWrappedKey;
  recovery: VaultRecoveryWrapper;
}

export interface EncryptedVaultRecord {
  id: string;
  version:
    | typeof VAULT_RECORD_VERSION
    | typeof VAULT_PORTFOLIO_RECORD_VERSION
    | typeof VAULT_COLLECTIBLE_RECORD_VERSION
    | typeof VAULT_MARKET_RECORD_VERSION;
  iv: string;
  ciphertext: string;
}

export interface VaultBackup {
  format: typeof VAULT_FORMAT;
  schemaVersion: typeof VAULT_SCHEMA_VERSION;
  exportedAt: string;
  vault: VaultMeta;
  records: EncryptedVaultRecord[];
  integrity: VaultBackupIntegrity;
}

export interface VaultBackupIntegrity {
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export interface VaultStorageStatus {
  supported: boolean;
  persistent: boolean | null;
  usage: number | null;
  quota: number | null;
}

export interface VaultAssetDraft {
  name: string;
  assetType: VaultAssetType;
  identifier: string;
  lots: VaultLotDraft[];
  notes: string;
  photo?: VaultPhoto;
  collectible?: VaultCollectibleDetails;
}
