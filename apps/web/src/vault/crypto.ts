import {
  VAULT_FORMAT,
  VAULT_KDF_ITERATIONS,
  VAULT_MAX_BACKUP_BYTES,
  VAULT_MAX_PHOTO_BYTES,
  VAULT_MAX_RECORDS,
  VAULT_PORTFOLIO_RECORD_VERSION,
  VAULT_RECORD_VERSION,
  VAULT_SCHEMA_VERSION,
  type EncryptedVaultRecord,
  type VaultAsset,
  type VaultAssetDraft,
  type VaultBackup,
  type VaultBackupIntegrity,
  type VaultMeta,
  type VaultPortfolioContext,
  type VaultPortfolioContextDraft,
  type VaultRecoveryWrapper,
  type VaultWrappedKey
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder(undefined, { fatal: true });
const DECIMAL = /^\d{1,78}(?:\.\d{1,78})?$/;
const CURRENCY = /^[A-Za-z0-9._-]{1,12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PHOTOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const RECOVERY_PREFIX = "CSV1";

export class VaultError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

export function isVaultPlatformSupported(): boolean {
  return globalThis.isSecureContext === true
    && typeof globalThis.indexedDB !== "undefined"
    && Boolean(globalThis.crypto?.subtle)
    && typeof globalThis.crypto?.randomUUID === "function";
}

export async function createVault(passphrase: string): Promise<{ meta: VaultMeta; key: CryptoKey; recoverySecret: string }> {
  validatePassphrase(passphrase);
  requireWebCrypto();
  const vaultId = crypto.randomUUID();
  const extractableKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const salt = randomBytes(16);
  const kdf = {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt)
  };
  const wrappedKey = await wrapWithPassphrase(extractableKey, passphrase, kdf, vaultId);
  const recoveryBytes = randomBytes(32);
  const recoverySecret = await formatRecoverySecret(recoveryBytes);
  const recovery = await wrapWithRecoveryKey(extractableKey, recoveryBytes, vaultId);
  const meta: VaultMeta = {
    key: "vault",
    format: VAULT_FORMAT,
    schemaVersion: VAULT_SCHEMA_VERSION,
    vaultId,
    revision: 0,
    kdf,
    wrappedKey,
    recovery
  };
  const key = await unlockVault(meta, passphrase);
  return {
    key,
    meta,
    recoverySecret
  };
}

export async function unlockVault(meta: VaultMeta, passphrase: string): Promise<CryptoKey> {
  validateVaultMeta(meta);
  validatePassphrase(passphrase);
  try {
    return await unwrapWithPassphrase(meta, passphrase, false);
  } catch {
    throw new VaultError("WRONG_PASSPHRASE", "That passphrase could not unlock this vault.");
  }
}

export async function changeVaultPassphrase(
  meta: VaultMeta,
  currentPassphrase: string,
  nextPassphrase: string
): Promise<VaultMeta> {
  validateVaultMeta(meta);
  validatePassphrase(currentPassphrase);
  validatePassphrase(nextPassphrase);
  let key: CryptoKey;
  try {
    key = await unwrapWithPassphrase(meta, currentPassphrase, true);
  } catch {
    throw new VaultError("WRONG_PASSPHRASE", "The current passphrase did not match this vault.");
  }
  const salt = randomBytes(16);
  const kdf = {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt)
  };
  return {
    ...meta,
    revision: meta.revision + 1,
    kdf,
    wrappedKey: await wrapWithPassphrase(key, nextPassphrase, kdf, meta.vaultId)
  };
}

export async function recoverVault(
  meta: VaultMeta,
  recoverySecret: string,
  nextPassphrase: string
): Promise<{ meta: VaultMeta; key: CryptoKey; recoverySecret: string }> {
  validateVaultMeta(meta);
  validatePassphrase(nextPassphrase);
  const recoveryBytes = await parseRecoverySecret(recoverySecret, meta.recovery.checksum);
  let extractableKey: CryptoKey;
  try {
    const recoveryKey = await importRecoveryKey(recoveryBytes);
    extractableKey = await crypto.subtle.unwrapKey(
      "raw",
      base64ToBytes(meta.recovery.ciphertext),
      recoveryKey,
      aesParams(base64ToBytes(meta.recovery.iv), recoveryAad(meta.vaultId)),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  } catch {
    throw new VaultError("RECOVERY_FAILED", "That recovery code is invalid or the vault is damaged.");
  }
  const salt = randomBytes(16);
  const kdf = {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt)
  };
  const nextRecoveryBytes = randomBytes(32);
  const nextRecoverySecret = await formatRecoverySecret(nextRecoveryBytes);
  const nextMeta: VaultMeta = {
    ...meta,
    revision: meta.revision + 1,
    kdf,
    wrappedKey: await wrapWithPassphrase(extractableKey, nextPassphrase, kdf, meta.vaultId),
    recovery: await wrapWithRecoveryKey(extractableKey, nextRecoveryBytes, meta.vaultId)
  };
  return { meta: nextMeta, key: await unlockVault(nextMeta, nextPassphrase), recoverySecret: nextRecoverySecret };
}

export async function encryptAsset(
  meta: VaultMeta,
  key: CryptoKey,
  asset: VaultAsset
): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validateAsset(asset);
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(asset));
  const encrypted = await crypto.subtle.encrypt(
    aesParams(iv, recordAad(meta.vaultId, asset.id, VAULT_RECORD_VERSION)),
    key,
    plaintext
  );
  return {
    id: asset.id,
    version: VAULT_RECORD_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  };
}

export async function decryptAsset(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord
): Promise<VaultAsset> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_RECORD_VERSION) {
    throw new VaultError("CORRUPT_RECORD", "This encrypted record is not an asset record.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      aesParams(base64ToBytes(record.iv), recordAad(meta.vaultId, record.id, record.version)),
      key,
      base64ToBytes(record.ciphertext)
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
    validateAsset(parsed);
    if (parsed.id !== record.id) throw new Error("record identity mismatch");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError("CORRUPT_RECORD", "An encrypted vault record is damaged or belongs to another vault.");
  }
}

export async function encryptPortfolioContext(
  meta: VaultMeta,
  key: CryptoKey,
  context: VaultPortfolioContext
): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validatePortfolioContext(context);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    aesParams(iv, recordAad(meta.vaultId, context.id, VAULT_PORTFOLIO_RECORD_VERSION)),
    key,
    encoder.encode(JSON.stringify(context))
  );
  return {
    id: context.id,
    version: VAULT_PORTFOLIO_RECORD_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  };
}

export async function decryptPortfolioContext(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord
): Promise<VaultPortfolioContext> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_PORTFOLIO_RECORD_VERSION) {
    throw new VaultError("CORRUPT_RECORD", "This encrypted record is not a portfolio record.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      aesParams(base64ToBytes(record.iv), recordAad(meta.vaultId, record.id, record.version)),
      key,
      base64ToBytes(record.ciphertext)
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
    validatePortfolioContext(parsed);
    if (parsed.id !== record.id) throw new Error("record identity mismatch");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError("CORRUPT_RECORD", "An encrypted portfolio record is damaged or belongs to another vault.");
  }
}

export async function decryptVaultRecord(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord
): Promise<VaultAsset | VaultPortfolioContext> {
  if (record.version === VAULT_RECORD_VERSION) return decryptAsset(meta, key, record);
  if (record.version === VAULT_PORTFOLIO_RECORD_VERSION) return decryptPortfolioContext(meta, key, record);
  throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup contains an unsupported record version.");
}

export function createAsset(draft: VaultAssetDraft, existing?: VaultAsset): VaultAsset {
  const now = new Date().toISOString();
  const asset: VaultAsset = {
    id: existing?.id ?? crypto.randomUUID(),
    name: draft.name.trim(),
    assetType: draft.assetType,
    identifier: draft.identifier.trim(),
    lots: draft.lots.map((lot) => ({
      id: lot.id ?? crypto.randomUUID(),
      quantity: lot.quantity.trim(),
      unitPrice: lot.unitPrice.trim(),
      currency: lot.currency.trim().toUpperCase(),
      acquiredAt: lot.acquiredAt
    })),
    notes: draft.notes.trim(),
    ...(draft.photo ? { photo: draft.photo } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  validateAsset(asset);
  return asset;
}

export function createPortfolioContext(
  draft: VaultPortfolioContextDraft,
  existing?: VaultPortfolioContext
): VaultPortfolioContext {
  const now = new Date().toISOString();
  const context: VaultPortfolioContext = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: "portfolio-context",
    address: draft.address.trim().toLowerCase(),
    label: draft.label.trim(),
    valuations: draft.valuations.map((valuation) => ({
      ...valuation,
      assetKey: valuation.assetKey.trim().toLowerCase(),
      unitPrice: valuation.unitPrice.trim(),
      currency: valuation.currency.trim().toUpperCase()
    })),
    latestSnapshot: draft.latestSnapshot,
    receipts: draft.receipts.map((receipt) => ({
      ...receipt,
      address: receipt.address.toLowerCase(),
      providerDestinations: [...new Set(receipt.providerDestinations.map((provider) => provider.trim().toLowerCase()))]
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  validatePortfolioContext(context);
  return context;
}

export async function createBackup(meta: VaultMeta, key: CryptoKey, records: EncryptedVaultRecord[]): Promise<VaultBackup> {
  validateVaultMeta(meta);
  records.forEach(validateEncryptedRecord);
  assertVaultCapacity(meta, records);
  const exportedAt = new Date().toISOString();
  const integrity = await encryptBackupManifest(meta, key, records, exportedAt);
  return {
    format: VAULT_FORMAT,
    schemaVersion: VAULT_SCHEMA_VERSION,
    exportedAt,
    vault: meta,
    records,
    integrity
  };
}

export function parseBackup(value: unknown): VaultBackup {
  if (!isRecord(value) || value.format !== VAULT_FORMAT || value.schemaVersion !== VAULT_SCHEMA_VERSION) {
    throw new VaultError("INVALID_BACKUP", "This is not a supported ChainScout encrypted-vault backup.");
  }
  if (typeof value.exportedAt !== "string" || !Array.isArray(value.records) || value.records.length > VAULT_MAX_RECORDS) {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup is incomplete.");
  }
  validateVaultMeta(value.vault);
  value.records.forEach(validateEncryptedRecord);
  assertVaultCapacity(value.vault, value.records);
  validateBackupIntegrity(value.integrity);
  const ids = new Set(value.records.map((record) => record.id));
  if (ids.size !== value.records.length) {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup contains duplicate records.");
  }
  return value as unknown as VaultBackup;
}

export async function verifyBackup(backup: VaultBackup, passphrase: string): Promise<CryptoKey> {
  const key = await unlockVault(backup.vault, passphrase);
  await verifyBackupWithKey(backup, key);
  return key;
}

export async function verifyBackupWithKey(backup: VaultBackup, key: CryptoKey): Promise<void> {
  await verifyBackupManifest(backup, key);
  await Promise.all(backup.records.map((record) => decryptVaultRecord(backup.vault, key, record)));
}

export function estimateVaultBackupBytes(meta: VaultMeta, records: EncryptedVaultRecord[]): number {
  const exportedAt = "2026-08-10T00:00:00.000Z";
  const manifest = {
    format: "chainscout.encrypted-vault-manifest",
    version: 1,
    exportedAt,
    vaultMetaDigest: "A".repeat(44),
    records: records.map((record) => ({ id: record.id, digest: "A".repeat(44) }))
  };
  const manifestBytes = encoder.encode(JSON.stringify(manifest)).byteLength + 16;
  const integrityCiphertextLength = 4 * Math.ceil(manifestBytes / 3);
  const shape: VaultBackup = {
    format: VAULT_FORMAT,
    schemaVersion: VAULT_SCHEMA_VERSION,
    exportedAt,
    vault: meta,
    records,
    integrity: {
      algorithm: "AES-GCM",
      iv: "A".repeat(16),
      ciphertext: "A".repeat(integrityCiphertextLength)
    }
  };
  return encoder.encode(JSON.stringify(shape, null, 2)).byteLength;
}

export function assertVaultCapacity(
  meta: VaultMeta,
  records: EncryptedVaultRecord[],
  maxBytes = VAULT_MAX_BACKUP_BYTES,
  maxRecords = VAULT_MAX_RECORDS
): void {
  if (records.length > maxRecords) {
    throw new VaultError("VAULT_CAPACITY", `This Vault supports up to ${maxRecords.toLocaleString("en-US")} encrypted records.`);
  }
  if (estimateVaultBackupBytes(meta, records) > maxBytes) {
    throw new VaultError(
      "VAULT_CAPACITY",
      "Saving this asset would make the Vault too large for a supported encrypted backup. Remove or compress a photo, then try again."
    );
  }
}

export function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 12) {
    throw new VaultError("WEAK_PASSPHRASE", "Use at least 12 characters for the vault passphrase.");
  }
  if (passphrase.length > 256) {
    throw new VaultError("INVALID_PASSPHRASE", "Vault passphrases are limited to 256 characters.");
  }
}

export function vaultErrorMessage(error: unknown): string {
  if (error instanceof VaultError) return error.message;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "This browser is out of storage space. Export your encrypted backup, then free space before trying again.";
  }
  if (error instanceof DOMException && error.name === "VersionError") {
    return "This browser has a newer vault format than this build can open. Do not delete it; update ChainScout first.";
  }
  return "The local vault could not complete that action. Nothing was sent to a server.";
}

function validateVaultMeta(value: unknown): asserts value is VaultMeta {
  if (!isRecord(value)
    || value.key !== "vault"
    || value.format !== VAULT_FORMAT
    || value.schemaVersion !== VAULT_SCHEMA_VERSION
    || typeof value.vaultId !== "string"
    || !UUID.test(value.vaultId)
    || typeof value.revision !== "number"
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0
    || !isRecord(value.kdf)
    || value.kdf.name !== "PBKDF2"
    || value.kdf.hash !== "SHA-256"
    || typeof value.kdf.iterations !== "number"
    || value.kdf.iterations !== VAULT_KDF_ITERATIONS
    || typeof value.kdf.salt !== "string"
    || !isRecord(value.wrappedKey)
    || value.wrappedKey.algorithm !== "AES-GCM"
    || typeof value.wrappedKey.iv !== "string"
    || typeof value.wrappedKey.ciphertext !== "string"
    || !isRecord(value.recovery)
    || value.recovery.algorithm !== "AES-GCM"
    || typeof value.recovery.iv !== "string"
    || typeof value.recovery.ciphertext !== "string"
    || typeof value.recovery.checksum !== "string") {
    throw new VaultError("INVALID_VAULT", "The local vault metadata is invalid or uses an unsupported format.");
  }
  const iv = base64ToBytes(value.wrappedKey.iv);
  const recoveryIv = base64ToBytes(value.recovery.iv);
  const salt = base64ToBytes(value.kdf.salt);
  if (iv.byteLength !== 12
    || recoveryIv.byteLength !== 12
    || salt.byteLength !== 16
    || value.recovery.checksum.length !== 16
    || value.wrappedKey.ciphertext.length > 256
    || value.recovery.ciphertext.length > 256) {
    throw new VaultError("INVALID_VAULT", "The local vault cryptographic parameters are invalid.");
  }
}

function validateEncryptedRecord(value: unknown): asserts value is EncryptedVaultRecord {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !UUID.test(value.id)
    || (value.version !== VAULT_RECORD_VERSION && value.version !== VAULT_PORTFOLIO_RECORD_VERSION)
    || typeof value.iv !== "string"
    || base64ToBytes(value.iv).byteLength !== 12
    || typeof value.ciphertext !== "string"
    || value.ciphertext.length < 20
    || value.ciphertext.length > 8 * 1024 * 1024) {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup contains an invalid record.");
  }
}

function validatePortfolioContext(value: unknown): asserts value is VaultPortfolioContext {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !UUID.test(value.id)
    || value.kind !== "portfolio-context"
    || typeof value.address !== "string"
    || !/^0x[0-9a-f]{40}$/.test(value.address)
    || typeof value.label !== "string"
    || value.label.length > 120
    || !Array.isArray(value.valuations)
    || value.valuations.length > 200
    || !Array.isArray(value.receipts)
    || value.receipts.length > 50
    || typeof value.createdAt !== "string"
    || !ISO_DATE_TIME.test(value.createdAt)
    || typeof value.updatedAt !== "string"
    || !ISO_DATE_TIME.test(value.updatedAt)) {
    throw new VaultError("INVALID_PORTFOLIO", "The encrypted portfolio context is invalid.");
  }
  const valuationIds = new Set<string>();
  for (const valuation of value.valuations) {
    if (!isRecord(valuation)
      || typeof valuation.id !== "string"
      || !UUID.test(valuation.id)
      || valuationIds.has(valuation.id)
      || typeof valuation.assetKey !== "string"
      || valuation.assetKey.length < 1
      || valuation.assetKey.length > 200
      || typeof valuation.unitPrice !== "string"
      || !DECIMAL.test(valuation.unitPrice)
      || typeof valuation.currency !== "string"
      || !CURRENCY.test(valuation.currency)
      || typeof valuation.updatedAt !== "string"
      || !ISO_DATE_TIME.test(valuation.updatedAt)) {
      throw new VaultError("INVALID_PORTFOLIO", "One or more encrypted reference valuations are invalid.");
    }
    valuationIds.add(valuation.id);
  }
  const receiptIds = new Set<string>();
  for (const receipt of value.receipts) {
    if (!isRecord(receipt)
      || typeof receipt.id !== "string"
      || !UUID.test(receipt.id)
      || receiptIds.has(receipt.id)
      || typeof receipt.address !== "string"
      || !/^0x[0-9a-f]{40}$/.test(receipt.address)
      || !Array.isArray(receipt.providerDestinations)
      || receipt.providerDestinations.length < 1
      || receipt.providerDestinations.length > 10
      || receipt.providerDestinations.some((provider) => typeof provider !== "string" || provider.length < 1 || provider.length > 60)
      || typeof receipt.disclosure !== "string"
      || receipt.disclosure.length < 1
      || receipt.disclosure.length > 1_000
      || typeof receipt.approvedAt !== "string"
      || !ISO_DATE_TIME.test(receipt.approvedAt)
      || !["approved", "completed", "failed"].includes(String(receipt.outcome))
      || !(receipt.resolvedAt === undefined || typeof receipt.resolvedAt === "string" && ISO_DATE_TIME.test(receipt.resolvedAt))
      || (receipt.outcome === "approved" && receipt.resolvedAt !== undefined)
      || (receipt.outcome !== "approved" && receipt.resolvedAt === undefined)) {
      throw new VaultError("INVALID_PORTFOLIO", "One or more encrypted privacy receipts are invalid.");
    }
    receiptIds.add(receipt.id);
  }
  if (value.latestSnapshot !== null) validatePortfolioSnapshot(value.latestSnapshot, value.address);
}

function validatePortfolioSnapshot(value: unknown, address: string): void {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.address !== address
    || !isRecord(value.chain)
    || value.chain.id !== 4663
    || !isRecord(value.finality)
    || value.finality.tag !== "finalized"
    || typeof value.finality.blockNumber !== "number"
    || !Number.isSafeInteger(value.finality.blockNumber)
    || typeof value.finality.blockHash !== "string"
    || !/^0x[0-9a-f]{64}$/.test(value.finality.blockHash)
    || typeof value.finality.timestamp !== "string"
    || !ISO_DATE_TIME.test(value.finality.timestamp)
    || typeof value.finality.fetchedAt !== "string"
    || !ISO_DATE_TIME.test(value.finality.fetchedAt)
    || typeof value.nativeBalanceEth !== "string"
    || !DECIMAL.test(value.nativeBalanceEth)
    || !Array.isArray(value.tokens)
    || value.tokens.length > 10
    || !Array.isArray(value.nfts)
    || value.nfts.length > 10
    || !Array.isArray(value.transactions)
    || value.transactions.length > 10
    || !Array.isArray(value.movements)
    || value.movements.length > 40
    || !Array.isArray(value.approvals)
    || value.approvals.length > 10
    || !Array.isArray(value.attention)
    || value.attention.length > 20
    || !Array.isArray(value.citations)
    || value.citations.length > 10
    || !isRecord(value.reconciliation)
    || !isRecord(value.privacy)
    || value.privacy.serverStorage !== "none"
    || value.privacy.browserStorage !== "client_encrypted_vault"
    || JSON.stringify(value).length > 1_000_000) {
    throw new VaultError("INVALID_PORTFOLIO", "The encrypted portfolio snapshot is invalid or exceeds its supported bounds.");
  }
  const validAddress = (candidate: unknown) => typeof candidate === "string" && /^0x[0-9a-f]{40}$/.test(candidate);
  const validNullableAddress = (candidate: unknown) => candidate === null || validAddress(candidate);
  const validHash = (candidate: unknown) => typeof candidate === "string" && /^0x[0-9a-f]{64}$/.test(candidate);
  const validDecimal = (candidate: unknown) => typeof candidate === "string" && DECIMAL.test(candidate);
  const validInteger = (candidate: unknown) => typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0;
  const validNullableTimestamp = (candidate: unknown) => candidate === null || typeof candidate === "string" && ISO_DATE_TIME.test(candidate);
  const validSources = (candidate: unknown) => Array.isArray(candidate)
    && candidate.length <= 12
    && candidate.every((source) => typeof source === "string" && source.length >= 1 && source.length <= 120);
  const validBoundedText = (candidate: unknown, max = 160) => typeof candidate === "string" && candidate.length <= max;
  const reconciliation = value.reconciliation as Record<string, unknown>;
  const privacy = value.privacy as Record<string, unknown>;
  const invalidToken = value.tokens.some((candidate) => {
    const token = isRecord(candidate) ? candidate : {};
    return token.kind !== "erc20"
      || !validAddress(token.contract)
      || !validBoundedText(token.name, 120)
      || !validBoundedText(token.symbol, 120)
      || !validInteger(token.decimals)
      || Number(token.decimals) > 255
      || !validDecimal(token.quantity)
      || typeof token.rawBalance !== "string"
      || !/^\d{1,78}$/.test(token.rawBalance)
      || !validSources(token.sourceIds);
  });
  const invalidNft = value.nfts.some((candidate) => {
    const nft = isRecord(candidate) ? candidate : {};
    return !["erc721", "erc1155"].includes(String(nft.kind))
      || !validAddress(nft.contract)
      || typeof nft.tokenId !== "string"
      || !/^\d{1,78}$/.test(nft.tokenId)
      || !validBoundedText(nft.name, 120)
      || !validBoundedText(nft.symbol, 120)
      || !validDecimal(nft.quantity)
      || !validSources(nft.sourceIds);
  });
  const invalidTransaction = value.transactions.some((candidate) => {
    const transaction = isRecord(candidate) ? candidate : {};
    return !validHash(transaction.hash)
      || !validInteger(transaction.blockNumber)
      || !validNullableTimestamp(transaction.timestamp)
      || !["success", "failed"].includes(String(transaction.status))
      || !(transaction.method === null || validBoundedText(transaction.method, 120))
      || !["in", "out", "self", "mixed"].includes(String(transaction.direction))
      || !validNullableAddress(transaction.counterparty)
      || !validDecimal(transaction.nativeValueEth)
      || !validInteger(transaction.movementCount)
      || !["complete", "partial"].includes(String(transaction.movementCoverage))
      || !validSources(transaction.sourceIds);
  });
  const invalidMovement = value.movements.some((candidate) => {
    const movement = isRecord(candidate) ? candidate : {};
    return !validHash(movement.transactionHash)
      || !validInteger(movement.blockNumber)
      || !validNullableTimestamp(movement.timestamp)
      || !["in", "out", "self"].includes(String(movement.direction))
      || !["native", "erc20", "erc721", "erc1155"].includes(String(movement.kind))
      || !validBoundedText(movement.symbol, 120)
      || !validDecimal(movement.quantity)
      || !validNullableAddress(movement.contract)
      || !(movement.tokenId === null || typeof movement.tokenId === "string" && /^\d{1,78}$/.test(movement.tokenId))
      || !validNullableAddress(movement.counterparty)
      || !validSources(movement.sourceIds);
  });
  const invalidApproval = value.approvals.some((candidate) => {
    const approval = isRecord(candidate) ? candidate : {};
    return !validHash(approval.transactionHash)
      || !validAddress(approval.contract)
      || !validAddress(approval.spender)
      || !["erc20", "erc721-token", "operator"].includes(String(approval.kind))
      || !validBoundedText(approval.symbol, 120)
      || typeof approval.active !== "boolean"
      || typeof approval.unlimited !== "boolean"
      || typeof approval.currentAmount !== "string"
      || approval.currentAmount.length > 120
      || !validSources(approval.sourceIds);
  });
  const invalidAttention = value.attention.some((candidate) => {
    const attention = isRecord(candidate) ? candidate : {};
    return !["info", "medium", "high"].includes(String(attention.severity))
      || !validBoundedText(attention.title, 160)
      || !validBoundedText(attention.detail, 1_000)
      || !validSources(attention.sourceIds);
  });
  const reconciliationCounts = [
    "tokenCandidates", "tokenConfirmed", "nftCandidates", "nftConfirmed",
    "activityCandidates", "activityConfirmed", "approvalCandidates", "approvalConfirmed"
  ];
  const invalidReconciliation = reconciliationCounts.some((key) => !validInteger(reconciliation[key]))
    || !Array.isArray(reconciliation.degradedSources)
    || reconciliation.degradedSources.length > 10
    || reconciliation.degradedSources.some((source: unknown) => typeof source !== "string" || source.length > 120)
    || !Array.isArray(reconciliation.truncatedSections)
    || reconciliation.truncatedSections.length > 10
    || reconciliation.truncatedSections.some((section: unknown) => typeof section !== "string" || section.length > 200);
  const invalidCitation = value.citations.some((candidate) => {
    const citation = isRecord(candidate) ? candidate : {};
    return !validBoundedText(citation.id, 120)
      || !["alchemy", "blockscout"].includes(String(citation.provider))
      || !validBoundedText(citation.url, 1_000)
      || !validBoundedText(citation.description, 500)
      || typeof citation.fetchedAt !== "string"
      || !ISO_DATE_TIME.test(citation.fetchedAt);
  });
  const invalidPrivacy = privacy.accountRequired !== false
    || privacy.walletConnectionRequired !== false
    || !Array.isArray(privacy.providerDestinations)
    || privacy.providerDestinations.length < 1
    || privacy.providerDestinations.length > 10
    || privacy.providerDestinations.some((provider: unknown) => typeof provider !== "string" || provider.length > 60)
    || !validBoundedText(privacy.disclosure, 1_000);
  if (invalidToken || invalidNft || invalidTransaction || invalidMovement || invalidApproval || invalidAttention || invalidReconciliation || invalidCitation || invalidPrivacy) {
    throw new VaultError("INVALID_PORTFOLIO", "The encrypted portfolio snapshot contains malformed or unsupported fields.");
  }
}

function validateBackupIntegrity(value: unknown): asserts value is VaultBackupIntegrity {
  if (!isRecord(value)
    || value.algorithm !== "AES-GCM"
    || typeof value.iv !== "string"
    || base64ToBytes(value.iv).byteLength !== 12
    || typeof value.ciphertext !== "string"
    || value.ciphertext.length < 20
    || value.ciphertext.length > 512 * 1024) {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup integrity record is invalid.");
  }
}

function validateAsset(value: unknown): asserts value is VaultAsset {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !UUID.test(value.id)
    || typeof value.name !== "string"
    || value.name.trim().length < 1
    || value.name.length > 120
    || !["crypto", "collectible", "rwa", "nft", "other"].includes(String(value.assetType))
    || typeof value.identifier !== "string"
    || value.identifier.length > 200
    || !Array.isArray(value.lots)
    || value.lots.length < 1
    || value.lots.length > 100
    || typeof value.notes !== "string"
    || value.notes.length > 5_000
    || typeof value.createdAt !== "string"
    || !ISO_DATE_TIME.test(value.createdAt)
    || typeof value.updatedAt !== "string"
    || !ISO_DATE_TIME.test(value.updatedAt)) {
    throw new VaultError("INVALID_ASSET", "Check the asset name, quantities, price, date, currency, and note lengths.");
  }
  const lotIds = new Set<string>();
  for (const lot of value.lots) {
    if (!isRecord(lot)
      || typeof lot.id !== "string"
      || !UUID.test(lot.id)
      || lotIds.has(lot.id)
      || typeof lot.quantity !== "string"
      || !isPositiveDecimal(lot.quantity)
      || typeof lot.unitPrice !== "string"
      || (lot.unitPrice !== "" && !DECIMAL.test(lot.unitPrice))
      || typeof lot.currency !== "string"
      || !CURRENCY.test(lot.currency)
      || typeof lot.acquiredAt !== "string"
      || !isValidOptionalDate(lot.acquiredAt)) {
      throw new VaultError("INVALID_ASSET", "One or more purchase lots contain invalid values.");
    }
    lotIds.add(lot.id);
  }
  if (value.photo !== undefined) {
    if (!isRecord(value.photo)
      || typeof value.photo.name !== "string"
      || value.photo.name.length > 160
      || typeof value.photo.mimeType !== "string"
      || !ALLOWED_PHOTOS.has(value.photo.mimeType)
      || typeof value.photo.size !== "number"
      || value.photo.size < 0
      || value.photo.size > VAULT_MAX_PHOTO_BYTES
      || typeof value.photo.dataUrl !== "string"
      || value.photo.dataUrl.length > Math.ceil(VAULT_MAX_PHOTO_BYTES * 4 / 3) + 100
      || !validPhotoData(value.photo.mimeType, value.photo.size, value.photo.dataUrl)) {
      throw new VaultError("INVALID_PHOTO", "Use one locally processed JPEG, PNG, or WebP image up to 3 MB.");
    }
  }
}

function isPositiveDecimal(value: string): boolean {
  return DECIMAL.test(value) && !/^0+(?:\.0+)?$/.test(value);
}

function isValidOptionalDate(value: string): boolean {
  if (value === "") return true;
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

async function deriveWrappingKey(passphrase: string, kdf: VaultMeta["kdf"]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: kdf.hash, salt: base64ToBytes(kdf.salt), iterations: kdf.iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

async function wrapWithPassphrase(
  key: CryptoKey,
  passphrase: string,
  kdf: VaultMeta["kdf"],
  vaultId: string
): Promise<VaultWrappedKey> {
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(passphrase, kdf);
  const ciphertext = await crypto.subtle.wrapKey(
    "raw",
    key,
    wrappingKey,
    aesParams(iv, keyAad(vaultId))
  );
  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function unwrapWithPassphrase(meta: VaultMeta, passphrase: string, extractable: boolean): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(passphrase, meta.kdf);
  return crypto.subtle.unwrapKey(
    "raw",
    base64ToBytes(meta.wrappedKey.ciphertext),
    wrappingKey,
    aesParams(base64ToBytes(meta.wrappedKey.iv), keyAad(meta.vaultId)),
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

async function wrapWithRecoveryKey(
  key: CryptoKey,
  recoveryBytes: Uint8Array<ArrayBuffer>,
  vaultId: string
): Promise<VaultRecoveryWrapper> {
  const iv = randomBytes(12);
  const recoveryKey = await importRecoveryKey(recoveryBytes);
  const ciphertext = await crypto.subtle.wrapKey(
    "raw",
    key,
    recoveryKey,
    aesParams(iv, recoveryAad(vaultId))
  );
  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    checksum: await recoveryChecksum(recoveryBytes)
  };
}

async function importRecoveryKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

async function formatRecoverySecret(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return `${RECOVERY_PREFIX}-${bytesToBase64Url(bytes)}.${await recoveryChecksum(bytes)}`;
}

async function parseRecoverySecret(value: string, expectedChecksum: string): Promise<Uint8Array<ArrayBuffer>> {
  const match = /^CSV1-([A-Za-z0-9_-]{43})\.([0-9a-f]{16})$/i.exec(value.trim());
  if (!match) throw new VaultError("RECOVERY_FAILED", "That recovery code is invalid or the vault is damaged.");
  const bytes = base64UrlToBytes(match[1]);
  const checksum = await recoveryChecksum(bytes);
  if (checksum !== match[2].toLowerCase() || checksum !== expectedChecksum.toLowerCase()) {
    throw new VaultError("RECOVERY_FAILED", "That recovery code is invalid or the vault is damaged.");
  }
  return bytes;
}

async function recoveryChecksum(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function aesParams(iv: Uint8Array<ArrayBuffer>, additionalData: Uint8Array<ArrayBuffer>): AesGcmParams {
  return { name: "AES-GCM", iv, additionalData, tagLength: 128 };
}

function keyAad(vaultId: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`chainscout:vault-key:v1:${vaultId}`);
}

function recordAad(vaultId: string, recordId: string, version: 1 | 2): Uint8Array<ArrayBuffer> {
  return encoder.encode(`chainscout:vault-record:v${version}:${vaultId}:${recordId}`);
}

function recoveryAad(vaultId: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`chainscout:vault-recovery:v1:${vaultId}`);
}

function backupAad(vaultId: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`chainscout:vault-backup-manifest:v1:${vaultId}`);
}

async function encryptBackupManifest(
  meta: VaultMeta,
  key: CryptoKey,
  records: EncryptedVaultRecord[],
  exportedAt: string
): Promise<VaultBackupIntegrity> {
  const iv = randomBytes(12);
  const manifest = await backupManifest(meta, records, exportedAt);
  const ciphertext = await crypto.subtle.encrypt(
    aesParams(iv, backupAad(meta.vaultId)),
    key,
    encoder.encode(JSON.stringify(manifest))
  );
  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function verifyBackupManifest(backup: VaultBackup, key: CryptoKey): Promise<void> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      aesParams(base64ToBytes(backup.integrity.iv), backupAad(backup.vault.vaultId)),
      key,
      base64ToBytes(backup.integrity.ciphertext)
    );
  } catch {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup manifest is damaged or does not match this vault.");
  }
  const expected = JSON.stringify(await backupManifest(backup.vault, backup.records, backup.exportedAt));
  let received: string;
  try {
    received = decoder.decode(plaintext);
  } catch {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup manifest is damaged or does not match this vault.");
  }
  if (received !== expected) {
    throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup record set is incomplete or has been changed.");
  }
}

async function backupManifest(meta: VaultMeta, records: EncryptedVaultRecord[], exportedAt: string): Promise<{
  format: "chainscout.encrypted-vault-manifest";
  version: 1;
  exportedAt: string;
  vaultMetaDigest: string;
  records: Array<{ id: string; digest: string }>;
}> {
  const digests = await Promise.all(records.map(async (record) => ({
    id: record.id,
    digest: await sha256Base64(JSON.stringify({
      id: record.id,
      version: record.version,
      iv: record.iv,
      ciphertext: record.ciphertext
    }))
  })));
  digests.sort((left, right) => left.id.localeCompare(right.id));
  return {
    format: "chainscout.encrypted-vault-manifest",
    version: 1,
    exportedAt,
    vaultMetaDigest: await sha256Base64(JSON.stringify({
      key: meta.key,
      format: meta.format,
      schemaVersion: meta.schemaVersion,
      vaultId: meta.vaultId,
      revision: meta.revision,
      kdf: meta.kdf,
      wrappedKey: meta.wrappedKey,
      recovery: meta.recovery
    })),
    records: digests
  };
}

async function sha256Base64(value: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new VaultError("INVALID_BASE64", "The encrypted vault contains malformed binary data.");
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  return base64ToBytes(padded);
}

function requireWebCrypto(): void {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.randomUUID !== "function") {
    throw new VaultError("UNSUPPORTED_BROWSER", "This browser does not provide the secure cryptography required by the vault.");
  }
}

function validPhotoData(mimeType: string, declaredSize: number, dataUrl: string): boolean {
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) return false;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(dataUrl.slice(prefix.length));
  } catch {
    return false;
  }
  if (bytes.byteLength !== declaredSize || bytes.byteLength > VAULT_MAX_PHOTO_BYTES) return false;
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
