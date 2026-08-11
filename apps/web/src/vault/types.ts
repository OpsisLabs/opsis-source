export const VAULT_FORMAT = "chainscout.encrypted-vault" as const;
export const VAULT_SCHEMA_VERSION = 1 as const;
export const VAULT_RECORD_VERSION = 1 as const;
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
  createdAt: string;
  updatedAt: string;
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
  version: typeof VAULT_RECORD_VERSION;
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
}
