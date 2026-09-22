import {
  VAULT_FORMAT,
  VAULT_KDF_ITERATIONS,
  VAULT_MAX_BACKUP_BYTES,
  VAULT_MAX_PHOTO_BYTES,
  VAULT_MAX_RECORDS,
  VAULT_COLLECTIBLE_RECORD_VERSION,
  VAULT_MARKET_RECORD_VERSION,
  VAULT_CONVERSATION_RECORD_VERSION,
  VAULT_WATCH_RECORD_VERSION,
  type VaultWatch,
  type VaultConversation,
  VAULT_PORTFOLIO_RECORD_VERSION,
  VAULT_RECORD_VERSION,
  VAULT_SCHEMA_VERSION,
  type EncryptedVaultRecord,
  type VaultAsset,
  type VaultAssetDraft,
  type VaultBackup,
  type VaultBackupIntegrity,
  type VaultCollectibleContext,
  type VaultCollectibleContextDraft,
  type VaultMeta,
  type VaultMarketComparison,
  type VaultMarketContext,
  type VaultMarketContextDraft,
  type VaultPortfolioContext,
  type VaultPortfolioContextDraft,
  type VaultRecoveryWrapper,
  type VaultWrappedKey,
} from "./types";
import { translateCurrent } from "../i18n/translate";

const encoder = new TextEncoder();
const decoder = new TextDecoder(undefined, { fatal: true });
const DECIMAL = /^\d{1,78}(?:\.\d{1,78})?$/;
const CURRENCY = /^[A-Za-z0-9._-]{1,12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  return (
    globalThis.isSecureContext === true &&
    typeof globalThis.indexedDB !== "undefined" &&
    Boolean(globalThis.crypto?.subtle) &&
    typeof globalThis.crypto?.randomUUID === "function"
  );
}

export async function createVault(
  passphrase: string,
): Promise<{ meta: VaultMeta; key: CryptoKey; recoverySecret: string }> {
  validatePassphrase(passphrase);
  requireWebCrypto();
  const vaultId = crypto.randomUUID();
  const extractableKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const salt = randomBytes(16);
  const kdf = {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
  };
  const wrappedKey = await wrapWithPassphrase(
    extractableKey,
    passphrase,
    kdf,
    vaultId,
  );
  const recoveryBytes = randomBytes(32);
  const recoverySecret = await formatRecoverySecret(recoveryBytes);
  const recovery = await wrapWithRecoveryKey(
    extractableKey,
    recoveryBytes,
    vaultId,
  );
  const meta: VaultMeta = {
    key: "vault",
    format: VAULT_FORMAT,
    schemaVersion: VAULT_SCHEMA_VERSION,
    vaultId,
    revision: 0,
    kdf,
    wrappedKey,
    recovery,
  };
  const key = await unlockVault(meta, passphrase);
  return {
    key,
    meta,
    recoverySecret,
  };
}

export async function unlockVault(
  meta: VaultMeta,
  passphrase: string,
): Promise<CryptoKey> {
  validateVaultMeta(meta);
  validatePassphrase(passphrase);
  try {
    return await unwrapWithPassphrase(meta, passphrase, false);
  } catch {
    throw new VaultError(
      "WRONG_PASSPHRASE",
      translateCurrent("vault.crypto.wrongPassphrase"),
    );
  }
}

export async function changeVaultPassphrase(
  meta: VaultMeta,
  currentPassphrase: string,
  nextPassphrase: string,
): Promise<VaultMeta> {
  validateVaultMeta(meta);
  validatePassphrase(currentPassphrase);
  validatePassphrase(nextPassphrase);
  let key: CryptoKey;
  try {
    key = await unwrapWithPassphrase(meta, currentPassphrase, true);
  } catch {
    throw new VaultError(
      "WRONG_PASSPHRASE",
      translateCurrent("vault.crypto.currentPassphrase"),
    );
  }
  const salt = randomBytes(16);
  const kdf = {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
  };
  return {
    ...meta,
    revision: meta.revision + 1,
    kdf,
    wrappedKey: await wrapWithPassphrase(
      key,
      nextPassphrase,
      kdf,
      meta.vaultId,
    ),
  };
}

export async function recoverVault(
  meta: VaultMeta,
  recoverySecret: string,
  nextPassphrase: string,
): Promise<{ meta: VaultMeta; key: CryptoKey; recoverySecret: string }> {
  validateVaultMeta(meta);
  validatePassphrase(nextPassphrase);
  const recoveryBytes = await parseRecoverySecret(
    recoverySecret,
    meta.recovery.checksum,
  );
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
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new VaultError(
      "RECOVERY_FAILED",
      translateCurrent("vault.crypto.recoveryFailed"),
    );
  }
  const salt = randomBytes(16);
  const kdf = {
    name: "PBKDF2" as const,
    hash: "SHA-256" as const,
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
  };
  const nextRecoveryBytes = randomBytes(32);
  const nextRecoverySecret = await formatRecoverySecret(nextRecoveryBytes);
  const nextMeta: VaultMeta = {
    ...meta,
    revision: meta.revision + 1,
    kdf,
    wrappedKey: await wrapWithPassphrase(
      extractableKey,
      nextPassphrase,
      kdf,
      meta.vaultId,
    ),
    recovery: await wrapWithRecoveryKey(
      extractableKey,
      nextRecoveryBytes,
      meta.vaultId,
    ),
  };
  return {
    meta: nextMeta,
    key: await unlockVault(nextMeta, nextPassphrase),
    recoverySecret: nextRecoverySecret,
  };
}

export async function encryptAsset(
  meta: VaultMeta,
  key: CryptoKey,
  asset: VaultAsset,
): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validateAsset(asset);
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(asset));
  const version = asset.collectible
    ? VAULT_COLLECTIBLE_RECORD_VERSION
    : VAULT_RECORD_VERSION;
  const encrypted = await crypto.subtle.encrypt(
    aesParams(iv, recordAad(meta.vaultId, asset.id, version)),
    key,
    plaintext,
  );
  return {
    id: asset.id,
    version,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptAsset(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord,
): Promise<VaultAsset> {
  validateEncryptedRecord(record);
  if (
    record.version !== VAULT_RECORD_VERSION &&
    record.version !== VAULT_COLLECTIBLE_RECORD_VERSION
  ) {
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.notAssetRecord"),
    );
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      aesParams(
        base64ToBytes(record.iv),
        recordAad(meta.vaultId, record.id, record.version),
      ),
      key,
      base64ToBytes(record.ciphertext),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
    validateAsset(parsed);
    if (
      record.version === VAULT_RECORD_VERSION &&
      parsed.collectible !== undefined
    )
      throw new Error("legacy asset contains catalog fields");
    if (
      record.version === VAULT_COLLECTIBLE_RECORD_VERSION &&
      parsed.collectible === undefined
    )
      throw new Error("catalog asset is missing catalog fields");
    if (parsed.id !== record.id) throw new Error("record identity mismatch");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.corruptRecord"),
    );
  }
}

export async function encryptCollectibleContext(
  meta: VaultMeta,
  key: CryptoKey,
  context: VaultCollectibleContext,
): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validateCollectibleContext(context);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    aesParams(
      iv,
      recordAad(meta.vaultId, context.id, VAULT_COLLECTIBLE_RECORD_VERSION),
    ),
    key,
    encoder.encode(JSON.stringify(context)),
  );
  return {
    id: context.id,
    version: VAULT_COLLECTIBLE_RECORD_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptCollectibleRecord(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord,
): Promise<VaultAsset | VaultCollectibleContext> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_COLLECTIBLE_RECORD_VERSION) {
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.notCollectibleRecord"),
    );
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      aesParams(
        base64ToBytes(record.iv),
        recordAad(meta.vaultId, record.id, record.version),
      ),
      key,
      base64ToBytes(record.ciphertext),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
    if (!isRecord(parsed))
      throw new Error("collectible record is not an object");
    if (parsed.kind === "collectible-context")
      validateCollectibleContext(parsed);
    else if (!("kind" in parsed)) validateAsset(parsed);
    else throw new Error("unknown collectible record kind");
    if (parsed.id !== record.id) throw new Error("record identity mismatch");
    if (!("kind" in parsed) && parsed.collectible === undefined)
      throw new Error("catalog asset is missing catalog fields");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.corruptCollectibleRecord"),
    );
  }
}

export async function encryptMarketContext(
  meta: VaultMeta,
  key: CryptoKey,
  context: VaultMarketContext,
): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validateMarketContext(context);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    aesParams(
      iv,
      recordAad(meta.vaultId, context.id, VAULT_MARKET_RECORD_VERSION),
    ),
    key,
    encoder.encode(JSON.stringify(context)),
  );
  return {
    id: context.id,
    version: VAULT_MARKET_RECORD_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptMarketContext(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord,
): Promise<VaultMarketContext> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_MARKET_RECORD_VERSION) {
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.notMarketRecord"),
    );
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      aesParams(
        base64ToBytes(record.iv),
        recordAad(meta.vaultId, record.id, record.version),
      ),
      key,
      base64ToBytes(record.ciphertext),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
    validateMarketContext(parsed);
    if (parsed.id !== record.id) throw new Error("record identity mismatch");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.corruptMarketRecord"),
    );
  }
}

export async function encryptPortfolioContext(
  meta: VaultMeta,
  key: CryptoKey,
  context: VaultPortfolioContext,
): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validatePortfolioContext(context);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    aesParams(
      iv,
      recordAad(meta.vaultId, context.id, VAULT_PORTFOLIO_RECORD_VERSION),
    ),
    key,
    encoder.encode(JSON.stringify(context)),
  );
  return {
    id: context.id,
    version: VAULT_PORTFOLIO_RECORD_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptPortfolioContext(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord,
): Promise<VaultPortfolioContext> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_PORTFOLIO_RECORD_VERSION) {
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.notPortfolioRecord"),
    );
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      aesParams(
        base64ToBytes(record.iv),
        recordAad(meta.vaultId, record.id, record.version),
      ),
      key,
      base64ToBytes(record.ciphertext),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as unknown;
    validatePortfolioContext(parsed);
    if (parsed.id !== record.id) throw new Error("record identity mismatch");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(
      "CORRUPT_RECORD",
      translateCurrent("vault.crypto.corruptPortfolioRecord"),
    );
  }
}

export function validateConversation(value: unknown): asserts value is VaultConversation {
  const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
  const date = (v: unknown) => typeof v === "string" && ISO_DATE_TIME.test(v) && Number.isFinite(Date.parse(v));
  if (!isRecord(value) || value.kind !== "conversation" || !text(value.id, 36) || !UUID.test(value.id as string)
    || !text(value.title, 120) || !date(value.createdAt) || !date(value.updatedAt)
    || !Array.isArray(value.turns) || value.turns.length < 1 || value.turns.length > 100
    || JSON.stringify(value).length > 1_000_000
    || value.turns.some((turn: unknown) => {
      if (!isRecord(turn) || !text(turn.question, 500) || !text(turn.entity, 66)
        || !/^0x[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(turn.entity as string)
        || !text(turn.answer, 50_000) || !date(turn.savedAt)
        || !Array.isArray(turn.bullets) || turn.bullets.length > 100 || turn.bullets.some(v => !text(v, 10_000))
        || !Array.isArray(turn.sources) || turn.sources.length > 100) return true;
      if (turn.opsis !== undefined && (!isRecord(turn.opsis)
        || !["research", "check"].includes(String(turn.opsis.workspace))
        || typeof turn.opsis.token !== "boolean" || turn.opsis.chainId !== 4663)) return true;
      return turn.sources.some((source: unknown) => {
        if (!isRecord(source) || !text(source.label, 1000) || !date(source.fetchedAt)) return true;
        if (source.url === null) return false;
        if (!text(source.url, 2048)) return true;
        try { const url = new URL(source.url as string); return url.protocol !== "https:" || Boolean(url.username || url.password); }
        catch { return true; }
      });
    })) throw new VaultError("INVALID_CONVERSATION", translateCurrent("vault.crypto.invalidConversation"));
}

export async function encryptConversation(meta: VaultMeta, key: CryptoKey, conversation: VaultConversation): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validateConversation(conversation);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    aesParams(iv, recordAad(meta.vaultId, conversation.id, VAULT_CONVERSATION_RECORD_VERSION)),
    key, encoder.encode(JSON.stringify(conversation))
  );
  return { id: conversation.id, version: VAULT_CONVERSATION_RECORD_VERSION, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) };
}

export async function decryptConversation(meta: VaultMeta, key: CryptoKey, record: EncryptedVaultRecord): Promise<VaultConversation> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_CONVERSATION_RECORD_VERSION) throw new VaultError("CORRUPT_RECORD", translateCurrent("vault.crypto.notConversationRecord"));
  try {
    const plaintext = await crypto.subtle.decrypt(aesParams(base64ToBytes(record.iv), recordAad(meta.vaultId, record.id, record.version)), key, base64ToBytes(record.ciphertext));
    const value: unknown = JSON.parse(decoder.decode(plaintext));
    validateConversation(value);
    if (value.id !== record.id) throw new Error("record identity mismatch");
    return value;
  } catch { throw new VaultError("CORRUPT_RECORD", translateCurrent("vault.crypto.corruptConversation")); }
}

export function validateWatch(value: unknown): asserts value is VaultWatch {
  if (!isRecord(value) || value.kind !== "watch" || typeof value.id !== "string" || !UUID.test(value.id)
    || typeof value.address !== "string" || !/^0x[0-9a-f]{40}$/.test(value.address)
    || typeof value.label !== "string" || !value.label.trim() || value.label.length > 80
    || typeof value.createdAt !== "string" || !ISO_DATE_TIME.test(value.createdAt)
    || typeof value.updatedAt !== "string" || !ISO_DATE_TIME.test(value.updatedAt)
    || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))
    || !Array.isArray(value.snapshots) || value.snapshots.length < 1 || value.snapshots.length > 3
    || JSON.stringify(value).length > 1_000_000) {
    throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.invalidRecord"));
  }
  if (value.conditions !== undefined) {
    if (!Array.isArray(value.conditions) || value.conditions.length > 20)
      throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.invalidRecord"));
    for (const condition of value.conditions) {
      if (!isRecord(condition) || typeof condition.id !== "string" || !UUID.test(condition.id)
        || condition.kind !== "balance-change"
        || typeof condition.assetKey !== "string" || !(/^(native|0x[0-9a-f]{40})$/.test(condition.assetKey))
        || (condition.direction !== "any" && condition.direction !== "increase" && condition.direction !== "decrease")
        || typeof condition.threshold !== "string" || !/^\d{1,78}(?:\.\d{1,78})?$/.test(condition.threshold)
        || !/[1-9]/.test(String(condition.threshold))
        || typeof condition.unit !== "string" || !condition.unit.length || condition.unit.length > 32
        || typeof condition.decimals !== "number" || !Number.isInteger(condition.decimals) || condition.decimals < 0 || condition.decimals > 78
        || (condition.sourceReportId !== undefined && (typeof condition.sourceReportId !== "string" || !UUID.test(condition.sourceReportId)))
        || typeof condition.createdAt !== "string" || !ISO_DATE_TIME.test(condition.createdAt))
        throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.invalidRecord"));
    }
  }
  if (value.inboxActions !== undefined) {
    if (!Array.isArray(value.inboxActions) || value.inboxActions.length > 200)
      throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.invalidRecord"));
    for (const action of value.inboxActions) {
      if (!isRecord(action) || typeof action.evidenceId !== "string" || action.evidenceId.length < 3 || action.evidenceId.length > 300
        || (action.acknowledgedAt !== undefined && (typeof action.acknowledgedAt !== "string" || !ISO_DATE_TIME.test(action.acknowledgedAt)))
        || (action.snoozedUntil !== undefined && (typeof action.snoozedUntil !== "string" || !ISO_DATE_TIME.test(action.snoozedUntil))))
        throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.invalidRecord"));
    }
  }
  let previous = -1;
  for (const snapshot of value.snapshots) {
    validateWatchSnapshot(snapshot, value.address);
    if (snapshot.anchor.blockNumber <= previous) throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.order"));
    previous = snapshot.anchor.blockNumber;
  }
}

export async function encryptWatch(meta: VaultMeta, key: CryptoKey, watch: VaultWatch): Promise<EncryptedVaultRecord> {
  validateVaultMeta(meta);
  validateWatch(watch);
  const iv = randomBytes(12);
  const bytes = await crypto.subtle.encrypt(aesParams(iv, recordAad(meta.vaultId, watch.id, VAULT_WATCH_RECORD_VERSION)), key, encoder.encode(JSON.stringify(watch)));
  return { id: watch.id, version: VAULT_WATCH_RECORD_VERSION, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(bytes)) };
}

export function validateWatchSnapshot(value: unknown, address: string): asserts value is VaultWatch["snapshots"][number] {
  validatePortfolioSnapshot(value, address);
  const snapshot = value as VaultWatch["snapshots"][number];
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  if (!unique(snapshot.tokens.map(row => row.contract)) || !unique(snapshot.nfts.map(row => `${row.kind}:${row.contract}:${row.tokenId}`))
    || !unique(snapshot.transactions.map(row => row.hash)) || snapshot.anchor.blockNumber < 0
    || !Number.isFinite(Date.parse(snapshot.anchor.fetchedAt)) || !Number.isFinite(Date.parse(snapshot.anchor.timestamp))
    || snapshot.transactions.some(row => row.blockNumber > snapshot.anchor.blockNumber)
    || snapshot.tokens.some(row => {
      const [whole, fraction = ""] = row.quantity.split(".");
      return fraction.length > row.decimals || BigInt(whole + fraction.padEnd(row.decimals, "0")) !== BigInt(row.rawBalance);
    })) throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.invalidSnapshot"));
}

export async function decryptWatch(meta: VaultMeta, key: CryptoKey, record: EncryptedVaultRecord): Promise<VaultWatch> {
  validateEncryptedRecord(record);
  if (record.version !== VAULT_WATCH_RECORD_VERSION) throw new VaultError("CORRUPT_RECORD", translateCurrent("watch.error.invalidRecord"));
  try {
    const bytes = await crypto.subtle.decrypt(aesParams(base64ToBytes(record.iv), recordAad(meta.vaultId, record.id, record.version)), key, base64ToBytes(record.ciphertext));
    const value: unknown = JSON.parse(decoder.decode(bytes));
    validateWatch(value);
    if (value.id !== record.id) throw new Error("record identity mismatch");
    return value;
  } catch { throw new VaultError("CORRUPT_RECORD", translateCurrent("watch.error.invalidRecord")); }
}

export async function decryptVaultRecord(
  meta: VaultMeta,
  key: CryptoKey,
  record: EncryptedVaultRecord,
): Promise<
  | VaultAsset
  | VaultPortfolioContext
  | VaultCollectibleContext
  | VaultMarketContext
  | VaultConversation
  | VaultWatch
> {
  if (record.version === VAULT_WATCH_RECORD_VERSION)
    return decryptWatch(meta, key, record);
  if (record.version === VAULT_CONVERSATION_RECORD_VERSION)
    return decryptConversation(meta, key, record);
  if (record.version === VAULT_RECORD_VERSION)
    return decryptAsset(meta, key, record);
  if (record.version === VAULT_PORTFOLIO_RECORD_VERSION)
    return decryptPortfolioContext(meta, key, record);
  if (record.version === VAULT_COLLECTIBLE_RECORD_VERSION)
    return decryptCollectibleRecord(meta, key, record);
  if (record.version === VAULT_MARKET_RECORD_VERSION)
    return decryptMarketContext(meta, key, record);
  throw new VaultError(
    "INVALID_BACKUP",
    translateCurrent("vault.crypto.unsupportedRecordVersion"),
  );
}

export function createAsset(
  draft: VaultAssetDraft,
  existing?: VaultAsset,
): VaultAsset {
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
      acquiredAt: lot.acquiredAt,
    })),
    notes: draft.notes.trim(),
    ...(draft.photo ? { photo: draft.photo } : {}),
    ...(draft.collectible
      ? { collectible: normalizeCollectibleDetails(draft.collectible) }
      : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  validateAsset(asset);
  return asset;
}

export function createCollectibleContext(
  draft: VaultCollectibleContextDraft,
  existing?: VaultCollectibleContext,
): VaultCollectibleContext {
  const now = new Date().toISOString();
  const context: VaultCollectibleContext = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: "collectible-context",
    receipts: draft.receipts.slice(-50).map((receipt) => ({
      ...receipt,
      query: receipt.query.trim(),
      providerDestinations: ["TCGdex"],
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  validateCollectibleContext(context);
  return context;
}

export function createPortfolioContext(
  draft: VaultPortfolioContextDraft,
  existing?: VaultPortfolioContext,
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
      currency: valuation.currency.trim().toUpperCase(),
    })),
    latestSnapshot: draft.latestSnapshot,
    receipts: draft.receipts.map((receipt) => ({
      ...receipt,
      address: receipt.address.toLowerCase(),
      providerDestinations: [
        ...new Set(
          receipt.providerDestinations.map((provider) =>
            provider.trim().toLowerCase(),
          ),
        ),
      ],
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  validatePortfolioContext(context);
  return context;
}

export function createMarketContext(
  draft: VaultMarketContextDraft,
  existing?: VaultMarketContext,
): VaultMarketContext {
  const now = new Date().toISOString();
  const context: VaultMarketContext = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: "market-context",
    cryptoObservations: structuredClone(draft.cryptoObservations),
    merchantObservations: structuredClone(draft.merchantObservations),
    comparisons: draft.comparisons.map(normalizeMarketComparison),
    receipts: draft.receipts.map((receipt) => ({
      ...receipt,
      publicIdentifier: receipt.publicIdentifier.trim().toLowerCase(),
      providerDestinations: [
        ...new Set(
          receipt.providerDestinations.map((provider) => provider.trim()),
        ),
      ],
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  validateMarketContext(context);
  return context;
}

export async function createBackup(
  meta: VaultMeta,
  key: CryptoKey,
  records: EncryptedVaultRecord[],
): Promise<VaultBackup> {
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
    integrity,
  };
}

export function parseBackup(value: unknown): VaultBackup {
  if (
    !isRecord(value) ||
    value.format !== VAULT_FORMAT ||
    value.schemaVersion !== VAULT_SCHEMA_VERSION
  ) {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.invalidBackupFormat"),
    );
  }
  if (
    typeof value.exportedAt !== "string" ||
    !Array.isArray(value.records) ||
    value.records.length > VAULT_MAX_RECORDS
  ) {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.backupIncomplete"),
    );
  }
  validateVaultMeta(value.vault);
  value.records.forEach(validateEncryptedRecord);
  assertVaultCapacity(value.vault, value.records);
  validateBackupIntegrity(value.integrity);
  const ids = new Set(value.records.map((record) => record.id));
  if (ids.size !== value.records.length) {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.backupDuplicateRecords"),
    );
  }
  return value as unknown as VaultBackup;
}

export async function verifyBackup(
  backup: VaultBackup,
  passphrase: string,
): Promise<CryptoKey> {
  const key = await unlockVault(backup.vault, passphrase);
  await verifyBackupWithKey(backup, key);
  return key;
}

export async function verifyBackupWithKey(
  backup: VaultBackup,
  key: CryptoKey,
): Promise<void> {
  await verifyBackupManifest(backup, key);
  await Promise.all(
    backup.records.map((record) =>
      decryptVaultRecord(backup.vault, key, record),
    ),
  );
}

export function estimateVaultBackupBytes(
  meta: VaultMeta,
  records: EncryptedVaultRecord[],
): number {
  const exportedAt = "2026-08-10T00:00:00.000Z";
  const manifest = {
    format: "chainscout.encrypted-vault-manifest",
    version: 1,
    exportedAt,
    vaultMetaDigest: "A".repeat(44),
    records: records.map((record) => ({
      id: record.id,
      digest: "A".repeat(44),
    })),
  };
  const manifestBytes =
    encoder.encode(JSON.stringify(manifest)).byteLength + 16;
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
      ciphertext: "A".repeat(integrityCiphertextLength),
    },
  };
  return encoder.encode(JSON.stringify(shape, null, 2)).byteLength;
}

export function assertVaultCapacity(
  meta: VaultMeta,
  records: EncryptedVaultRecord[],
  maxBytes = VAULT_MAX_BACKUP_BYTES,
  maxRecords = VAULT_MAX_RECORDS,
): void {
  if (records.length > maxRecords) {
    throw new VaultError(
      "VAULT_CAPACITY",
      translateCurrent("vault.crypto.capacityRecords", { max: maxRecords.toLocaleString("en-US") }),
    );
  }
  if (estimateVaultBackupBytes(meta, records) > maxBytes) {
    throw new VaultError(
      "VAULT_CAPACITY",
      translateCurrent("vault.crypto.capacitySize"),
    );
  }
}

export function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 12) {
    throw new VaultError(
      "WEAK_PASSPHRASE",
      translateCurrent("vault.crypto.passphraseTooShort"),
    );
  }
  if (passphrase.length > 256) {
    throw new VaultError(
      "INVALID_PASSPHRASE",
      translateCurrent("vault.crypto.passphraseTooLong"),
    );
  }
}

export function vaultErrorMessage(error: unknown): string {
  if (error instanceof VaultError) return error.message;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return translateCurrent("vault.crypto.quotaExceeded");
  }
  if (error instanceof DOMException && error.name === "VersionError") {
    return translateCurrent("vault.crypto.versionError");
  }
  return translateCurrent("vault.crypto.generic");
}

function validateVaultMeta(value: unknown): asserts value is VaultMeta {
  if (
    !isRecord(value) ||
    value.key !== "vault" ||
    value.format !== VAULT_FORMAT ||
    value.schemaVersion !== VAULT_SCHEMA_VERSION ||
    typeof value.vaultId !== "string" ||
    !UUID.test(value.vaultId) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !isRecord(value.kdf) ||
    value.kdf.name !== "PBKDF2" ||
    value.kdf.hash !== "SHA-256" ||
    typeof value.kdf.iterations !== "number" ||
    value.kdf.iterations !== VAULT_KDF_ITERATIONS ||
    typeof value.kdf.salt !== "string" ||
    !isRecord(value.wrappedKey) ||
    value.wrappedKey.algorithm !== "AES-GCM" ||
    typeof value.wrappedKey.iv !== "string" ||
    typeof value.wrappedKey.ciphertext !== "string" ||
    !isRecord(value.recovery) ||
    value.recovery.algorithm !== "AES-GCM" ||
    typeof value.recovery.iv !== "string" ||
    typeof value.recovery.ciphertext !== "string" ||
    typeof value.recovery.checksum !== "string"
  ) {
    throw new VaultError(
      "INVALID_VAULT",
      translateCurrent("vault.crypto.invalidVaultMeta"),
    );
  }
  const iv = base64ToBytes(value.wrappedKey.iv);
  const recoveryIv = base64ToBytes(value.recovery.iv);
  const salt = base64ToBytes(value.kdf.salt);
  if (
    iv.byteLength !== 12 ||
    recoveryIv.byteLength !== 12 ||
    salt.byteLength !== 16 ||
    value.recovery.checksum.length !== 16 ||
    value.wrappedKey.ciphertext.length > 256 ||
    value.recovery.ciphertext.length > 256
  ) {
    throw new VaultError(
      "INVALID_VAULT",
      translateCurrent("vault.crypto.invalidVaultCrypto"),
    );
  }
}

function validateEncryptedRecord(
  value: unknown,
): asserts value is EncryptedVaultRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    (value.version !== VAULT_RECORD_VERSION &&
      value.version !== VAULT_PORTFOLIO_RECORD_VERSION &&
      value.version !== VAULT_COLLECTIBLE_RECORD_VERSION &&
      value.version !== VAULT_MARKET_RECORD_VERSION &&
      value.version !== VAULT_CONVERSATION_RECORD_VERSION &&
      value.version !== VAULT_WATCH_RECORD_VERSION) ||
    typeof value.iv !== "string" ||
    base64ToBytes(value.iv).byteLength !== 12 ||
    typeof value.ciphertext !== "string" ||
    value.ciphertext.length < 20 ||
    value.ciphertext.length > 8 * 1024 * 1024
  ) {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.invalidBackupRecord"),
    );
  }
}

function validatePortfolioContext(
  value: unknown,
): asserts value is VaultPortfolioContext {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    value.kind !== "portfolio-context" ||
    typeof value.address !== "string" ||
    !/^0x[0-9a-f]{40}$/.test(value.address) ||
    typeof value.label !== "string" ||
    value.label.length > 120 ||
    !Array.isArray(value.valuations) ||
    value.valuations.length > 200 ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > 50 ||
    typeof value.createdAt !== "string" ||
    !ISO_DATE_TIME.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !ISO_DATE_TIME.test(value.updatedAt)
  ) {
    throw new VaultError(
      "INVALID_PORTFOLIO",
      translateCurrent("vault.crypto.invalidPortfolioContext"),
    );
  }
  const valuationIds = new Set<string>();
  for (const valuation of value.valuations) {
    if (
      !isRecord(valuation) ||
      typeof valuation.id !== "string" ||
      !UUID.test(valuation.id) ||
      valuationIds.has(valuation.id) ||
      typeof valuation.assetKey !== "string" ||
      valuation.assetKey.length < 1 ||
      valuation.assetKey.length > 200 ||
      typeof valuation.unitPrice !== "string" ||
      !DECIMAL.test(valuation.unitPrice) ||
      typeof valuation.currency !== "string" ||
      !CURRENCY.test(valuation.currency) ||
      typeof valuation.updatedAt !== "string" ||
      !ISO_DATE_TIME.test(valuation.updatedAt)
    ) {
      throw new VaultError(
        "INVALID_PORTFOLIO",
        translateCurrent("vault.crypto.invalidValuations"),
      );
    }
    valuationIds.add(valuation.id);
  }
  const receiptIds = new Set<string>();
  for (const receipt of value.receipts) {
    if (
      !isRecord(receipt) ||
      typeof receipt.id !== "string" ||
      !UUID.test(receipt.id) ||
      receiptIds.has(receipt.id) ||
      typeof receipt.address !== "string" ||
      !/^0x[0-9a-f]{40}$/.test(receipt.address) ||
      !Array.isArray(receipt.providerDestinations) ||
      receipt.providerDestinations.length < 1 ||
      receipt.providerDestinations.length > 10 ||
      receipt.providerDestinations.some(
        (provider) =>
          typeof provider !== "string" ||
          provider.length < 1 ||
          provider.length > 60,
      ) ||
      typeof receipt.disclosure !== "string" ||
      receipt.disclosure.length < 1 ||
      receipt.disclosure.length > 1_000 ||
      typeof receipt.approvedAt !== "string" ||
      !ISO_DATE_TIME.test(receipt.approvedAt) ||
      !["approved", "completed", "failed"].includes(String(receipt.outcome)) ||
      !(
        receipt.resolvedAt === undefined ||
        (typeof receipt.resolvedAt === "string" &&
          ISO_DATE_TIME.test(receipt.resolvedAt))
      ) ||
      (receipt.outcome === "approved" && receipt.resolvedAt !== undefined) ||
      (receipt.outcome !== "approved" && receipt.resolvedAt === undefined)
    ) {
      throw new VaultError(
        "INVALID_PORTFOLIO",
        translateCurrent("vault.crypto.invalidPrivacyReceipts"),
      );
    }
    receiptIds.add(receipt.id);
  }
  if (value.latestSnapshot !== null)
    validatePortfolioSnapshot(value.latestSnapshot, value.address);
}

function validateMarketContext(
  value: unknown,
): asserts value is VaultMarketContext {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    value.kind !== "market-context" ||
    !Array.isArray(value.cryptoObservations) ||
    value.cryptoObservations.length > 10 ||
    !Array.isArray(value.merchantObservations) ||
    value.merchantObservations.length > 50 ||
    !Array.isArray(value.comparisons) ||
    value.comparisons.length > 100 ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > 50 ||
    typeof value.createdAt !== "string" ||
    !ISO_DATE_TIME.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !ISO_DATE_TIME.test(value.updatedAt) ||
    JSON.stringify(value).length > 1_000_000
  ) {
    throw new VaultError(
      "INVALID_MARKET",
      translateCurrent("vault.crypto.invalidMarketContext"),
    );
  }
  const cryptoIds = new Set<string>();
  for (const observation of value.cryptoObservations) {
    validateCryptoMarketObservation(observation);
    if (cryptoIds.has(observation.canonicalAssetId))
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.duplicateCryptoObservations"),
      );
    cryptoIds.add(observation.canonicalAssetId);
  }
  const merchantIds = new Set<string>();
  for (const observation of value.merchantObservations) {
    validateMerchantObservation(observation);
    const identity = `${observation.merchant.id}:${observation.canonicalAssetId}`;
    if (merchantIds.has(identity))
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.duplicateMerchantObservations"),
      );
    merchantIds.add(identity);
  }
  const comparisonIds = new Set<string>();
  for (const comparison of value.comparisons) {
    validateMarketComparison(comparison);
    if (comparisonIds.has(comparison.id))
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.duplicateComparisons"),
      );
    comparisonIds.add(comparison.id);
  }
  const receiptIds = new Set<string>();
  for (const receipt of value.receipts) {
    if (
      !isRecord(receipt) ||
      typeof receipt.id !== "string" ||
      !UUID.test(receipt.id) ||
      receiptIds.has(receipt.id) ||
      !["crypto", "merchant"].includes(String(receipt.operation)) ||
      typeof receipt.publicIdentifier !== "string" ||
      receipt.publicIdentifier.length < 3 ||
      receipt.publicIdentifier.length > 240 ||
      !Array.isArray(receipt.providerDestinations) ||
      receipt.providerDestinations.length < 1 ||
      receipt.providerDestinations.length > 3 ||
      receipt.providerDestinations.some(
        (provider) =>
          typeof provider !== "string" ||
          provider.length < 2 ||
          provider.length > 100,
      ) ||
      typeof receipt.disclosure !== "string" ||
      receipt.disclosure.length < 1 ||
      receipt.disclosure.length > 1_500 ||
      typeof receipt.approvedAt !== "string" ||
      !ISO_DATE_TIME.test(receipt.approvedAt) ||
      !["approved", "completed", "failed"].includes(String(receipt.outcome)) ||
      !(
        receipt.resolvedAt === undefined ||
        (typeof receipt.resolvedAt === "string" &&
          ISO_DATE_TIME.test(receipt.resolvedAt))
      ) ||
      (receipt.outcome === "approved" && receipt.resolvedAt !== undefined) ||
      (receipt.outcome !== "approved" && receipt.resolvedAt === undefined)
    ) {
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.invalidMarketReceipt"),
      );
    }
    const merchantReceipt = receipt.operation === "merchant";
    if (
      merchantReceipt !== isRecord(receipt.merchantMapping) ||
      (merchantReceipt &&
        (!isRecord(receipt.merchantMapping) ||
          typeof receipt.merchantMapping.sku !== "string" ||
          receipt.merchantMapping.sku.length < 1 ||
          receipt.merchantMapping.sku.length > 100 ||
          typeof receipt.merchantMapping.productId !== "string" ||
          !/^\d{1,20}$/.test(receipt.merchantMapping.productId) ||
          typeof receipt.merchantMapping.reviewedAt !== "string" ||
          !DATE.test(receipt.merchantMapping.reviewedAt)))
    ) {
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.invalidReceiptMapping"),
      );
    }
    receiptIds.add(receipt.id);
  }
}

function validateCryptoMarketObservation(
  value: unknown,
): asserts value is VaultMarketContext["cryptoObservations"][number] {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.chain) ||
    value.chain.id !== 4663 ||
    value.chain.slug !== "robinhood" ||
    value.chain.name !== "Robinhood Chain" ||
    typeof value.contract !== "string" ||
    !/^0x[0-9a-f]{40}$/.test(value.contract) ||
    value.canonicalAssetId !== `eip155:4663/erc20:${value.contract}` ||
    value.identityConfidence !== "exact_contract" ||
    !Array.isArray(value.pairs) ||
    value.pairs.length > 20 ||
    value.pairsShown !== value.pairs.length ||
    typeof value.truncated !== "boolean" ||
    typeof value.fetchedAt !== "string" ||
    !ISO_DATE_TIME.test(value.fetchedAt) ||
    typeof value.freshForMs !== "number" ||
    !Number.isInteger(value.freshForMs) ||
    value.freshForMs < 1_000 ||
    value.freshForMs > 3_600_000 ||
    !isRecord(value.source) ||
    value.source.provider !== "dexscreener" ||
    typeof value.source.url !== "string" ||
    !validDexUrl(value.source.url) ||
    !Array.isArray(value.limitations) ||
    value.limitations.length < 1 ||
    value.limitations.length > 10 ||
    value.limitations.some(
      (item) =>
        typeof item !== "string" || item.length < 1 || item.length > 300,
    ) ||
    !validMarketPrivacy(value.privacy, ["DEX Screener"])
  ) {
    throw new VaultError(
      "INVALID_MARKET",
      translateCurrent("vault.crypto.invalidCryptoObservation"),
    );
  }
  const pairIds = new Set<string>();
  for (const candidate of value.pairs) {
    if (
      !isRecord(candidate) ||
      typeof candidate.pairAddress !== "string" ||
      !/^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(candidate.pairAddress) ||
      pairIds.has(candidate.pairAddress) ||
      typeof candidate.dexId !== "string" ||
      candidate.dexId.length < 1 ||
      candidate.dexId.length > 60 ||
      typeof candidate.url !== "string" ||
      !validDexUrl(candidate.url) ||
      !Array.isArray(candidate.labels) ||
      candidate.labels.length > 8 ||
      candidate.labels.some(
        (label) => typeof label !== "string" || label.length > 40,
      ) ||
      !validMarketToken(candidate.baseToken) ||
      !validMarketToken(candidate.quoteToken) ||
      candidate.pricedTokenAddress !==
        (candidate.baseToken as Record<string, unknown>).address ||
      !validNullableDecimal(candidate.baseTokenPriceUsd, false) ||
      !validNullableDecimal(candidate.baseTokenPriceInQuote, false) ||
      !validNullableDecimal(candidate.liquidityUsd, false) ||
      !validNullableDecimal(candidate.volume24hUsd, false) ||
      !validNullableDecimal(candidate.priceChange24hPercent, true) ||
      !(
        candidate.pairCreatedAt === null ||
        (typeof candidate.pairCreatedAt === "string" &&
          ISO_DATE_TIME.test(candidate.pairCreatedAt))
      )
    ) {
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.invalidDexPair"),
      );
    }
    pairIds.add(candidate.pairAddress);
  }
}

function validateMerchantObservation(
  value: unknown,
): asserts value is VaultMarketContext["merchantObservations"][number] {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.merchant) ||
    typeof value.merchant.id !== "string" ||
    !/^[a-z0-9-]{2,64}$/.test(value.merchant.id) ||
    typeof value.merchant.name !== "string" ||
    value.merchant.name.length < 2 ||
    value.merchant.name.length > 100 ||
    value.merchant.provider !== "woocommerce" ||
    typeof value.canonicalAssetId !== "string" ||
    value.canonicalAssetId.length < 3 ||
    value.canonicalAssetId.length > 200 ||
    !isRecord(value.mapping) ||
    typeof value.mapping.sku !== "string" ||
    value.mapping.sku.length < 1 ||
    value.mapping.sku.length > 100 ||
    typeof value.mapping.productId !== "string" ||
    !/^\d{1,20}$/.test(value.mapping.productId) ||
    typeof value.mapping.reviewedAt !== "string" ||
    !DATE.test(value.mapping.reviewedAt) ||
    typeof value.mapping.evidenceUrl !== "string" ||
    !validHttpsUrl(value.mapping.evidenceUrl, 1_000) ||
    !["exact_match", "valid_empty"].includes(String(value.state)) ||
    typeof value.fetchedAt !== "string" ||
    !ISO_DATE_TIME.test(value.fetchedAt) ||
    typeof value.freshForMs !== "number" ||
    !Number.isInteger(value.freshForMs) ||
    value.freshForMs < 1_000 ||
    value.freshForMs > 86_400_000 ||
    !isRecord(value.source) ||
    value.source.provider !== "woocommerce" ||
    typeof value.source.url !== "string" ||
    !validHttpsUrl(value.source.url, 1_000) ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > 10 ||
    value.limitations.some(
      (limitation) => typeof limitation !== "string" || limitation.length > 500,
    ) ||
    !validMarketPrivacyReceipt(value.privacy) ||
    (value.state === "valid_empty" && value.offer !== null) ||
    (value.state === "exact_match" && !isRecord(value.offer))
  ) {
    throw new VaultError(
      "INVALID_MARKET",
      translateCurrent("vault.crypto.invalidMerchantObservation"),
    );
  }
  if (value.offer !== null) {
    const offer = value.offer;
    validateMerchantOffer(offer);
    if (
      offer.merchantId !== value.merchant.id ||
      offer.merchantName !== value.merchant.name ||
      offer.canonicalAssetId !== value.canonicalAssetId ||
      offer.sku !== value.mapping.sku ||
      offer.productId !== value.mapping.productId ||
      offer.mappingReviewedAt !== value.mapping.reviewedAt ||
      offer.mappingEvidenceUrl !== value.mapping.evidenceUrl ||
      offer.fetchedAt !== value.fetchedAt ||
      offer.freshForMs !== value.freshForMs ||
      offer.url !== value.source.url
    ) {
      throw new VaultError(
        "INVALID_MARKET",
        translateCurrent("vault.crypto.merchantOfferConflict"),
      );
    }
  }
}

function validateMerchantOffer(
  value: unknown,
): asserts value is NonNullable<
  VaultMarketContext["merchantObservations"][number]["offer"]
> {
  if (
    !isRecord(value) ||
    value.provider !== "woocommerce" ||
    typeof value.merchantId !== "string" ||
    !/^[a-z0-9-]{2,64}$/.test(value.merchantId) ||
    typeof value.merchantName !== "string" ||
    value.merchantName.length < 2 ||
    value.merchantName.length > 100 ||
    typeof value.canonicalAssetId !== "string" ||
    value.canonicalAssetId.length < 3 ||
    value.canonicalAssetId.length > 200 ||
    value.identityConfidence !== "reviewed_simple_product_mapping" ||
    typeof value.productId !== "string" ||
    !/^\d{1,20}$/.test(value.productId) ||
    typeof value.sku !== "string" ||
    value.sku.length < 1 ||
    value.sku.length > 100 ||
    typeof value.title !== "string" ||
    value.title.length < 1 ||
    value.title.length > 200 ||
    typeof value.variantLabel !== "string" ||
    value.variantLabel.length < 1 ||
    value.variantLabel.length > 120 ||
    typeof value.condition !== "string" ||
    value.condition.length < 1 ||
    value.condition.length > 80 ||
    typeof value.mappingReviewedAt !== "string" ||
    !DATE.test(value.mappingReviewedAt) ||
    typeof value.mappingEvidenceUrl !== "string" ||
    !validHttpsUrl(value.mappingEvidenceUrl, 1_000) ||
    typeof value.url !== "string" ||
    !validHttpsUrl(value.url, 1_000) ||
    typeof value.currency !== "string" ||
    !CURRENCY.test(value.currency) ||
    typeof value.unitPrice !== "string" ||
    !DECIMAL.test(value.unitPrice) ||
    ![
      "provider_available",
      "provider_low_stock",
      "provider_unavailable",
      "unknown",
    ].includes(String(value.inventoryState)) ||
    value.exactQuantity !== null ||
    typeof value.fetchedAt !== "string" ||
    !ISO_DATE_TIME.test(value.fetchedAt) ||
    typeof value.freshForMs !== "number" ||
    !Number.isInteger(value.freshForMs) ||
    value.freshForMs < 1_000 ||
    value.freshForMs > 86_400_000 ||
    !validProductRating(value.productRating)
  ) {
    throw new VaultError(
      "INVALID_MARKET",
      translateCurrent("vault.crypto.invalidMerchantOffer"),
    );
  }
}

function validMarketPrivacyReceipt(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.accountRequired === false &&
    value.walletConnectionRequired === false &&
    value.serverStorage === "none" &&
    value.modelProvider === "none" &&
    Array.isArray(value.providerDestinations) &&
    value.providerDestinations.length >= 1 &&
    value.providerDestinations.length <= 3 &&
    value.providerDestinations.every(
      (provider) =>
        typeof provider === "string" &&
        provider.length >= 2 &&
        provider.length <= 100,
    ) &&
    typeof value.disclosure === "string" &&
    value.disclosure.length >= 1 &&
    value.disclosure.length <= 1_500
  );
}

function validateMarketComparison(
  value: unknown,
): asserts value is VaultMarketComparison {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.canonicalAssetId !== "string" ||
    !(
      value.canonicalAssetId === "" ||
      (value.canonicalAssetId.length >= 3 &&
        value.canonicalAssetId.length <= 200)
    ) ||
    typeof value.label !== "string" ||
    value.label.trim().length < 1 ||
    value.label.length > 160 ||
    !["provider_offer", "owner_entered"].includes(String(value.sourceKind)) ||
    !["exact_provider_mapping", "owner_linked", "candidate"].includes(
      String(value.identityConfidence),
    ) ||
    typeof value.providerName !== "string" ||
    value.providerName.length < 1 ||
    value.providerName.length > 100 ||
    typeof value.sourceUrl !== "string" ||
    !validHttpsUrl(value.sourceUrl, 1_000) ||
    typeof value.observedAt !== "string" ||
    !ISO_DATE_TIME.test(value.observedAt) ||
    typeof value.freshForMs !== "number" ||
    !Number.isInteger(value.freshForMs) ||
    value.freshForMs < 1_000 ||
    value.freshForMs > 7 * 86_400_000 ||
    typeof value.currency !== "string" ||
    !CURRENCY.test(value.currency) ||
    typeof value.itemUnitPrice !== "string" ||
    !DECIMAL.test(value.itemUnitPrice) ||
    typeof value.quantity !== "string" ||
    !isPositiveDecimal(value.quantity) ||
    !validOptionalCost(value.shipping) ||
    !validOptionalCost(value.tax) ||
    !validOptionalCost(value.duty) ||
    !validOptionalCost(value.fees) ||
    !validOptionalCost(value.discount) ||
    ![
      "provider_available",
      "provider_low_stock",
      "provider_unavailable",
      "owner_available",
      "unknown",
    ].includes(String(value.inventoryState)) ||
    typeof value.condition !== "string" ||
    value.condition.length > 120 ||
    typeof value.region !== "string" ||
    value.region.length > 120 ||
    typeof value.returnNotes !== "string" ||
    value.returnNotes.length > 500 ||
    typeof value.createdAt !== "string" ||
    !ISO_DATE_TIME.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !ISO_DATE_TIME.test(value.updatedAt)
  ) {
    throw new VaultError(
      "INVALID_MARKET",
      translateCurrent("vault.crypto.invalidComparison"),
    );
  }
  const providerOffer = value.sourceKind === "provider_offer";
  const mapping = value.merchantMapping;
  const validMapping =
    isRecord(mapping) &&
    typeof mapping.merchantId === "string" &&
    /^[a-z0-9-]{2,64}$/.test(mapping.merchantId) &&
    typeof mapping.sku === "string" &&
    mapping.sku.length >= 1 &&
    mapping.sku.length <= 100 &&
    typeof mapping.productId === "string" &&
    /^\d{1,20}$/.test(mapping.productId) &&
    typeof mapping.reviewedAt === "string" &&
    DATE.test(mapping.reviewedAt) &&
    typeof mapping.evidenceUrl === "string" &&
    validHttpsUrl(mapping.evidenceUrl, 1_000);
  if (
    providerOffer !== (value.identityConfidence === "exact_provider_mapping") ||
    providerOffer !== validMapping ||
    (!providerOffer && mapping !== null) ||
    (value.identityConfidence !== "candidate" &&
      value.canonicalAssetId === "") ||
    (providerOffer &&
      ![
        "provider_available",
        "provider_low_stock",
        "provider_unavailable",
        "unknown",
      ].includes(String(value.inventoryState))) ||
    (!providerOffer &&
      !["owner_linked", "candidate"].includes(
        String(value.identityConfidence),
      )) ||
    (!providerOffer &&
      !["owner_available", "unknown"].includes(String(value.inventoryState)))
  ) {
    throw new VaultError(
      "INVALID_MARKET",
      translateCurrent("vault.crypto.inconsistentComparison"),
    );
  }
}

function normalizeMarketComparison(
  value: VaultMarketComparison,
): VaultMarketComparison {
  return {
    ...value,
    canonicalAssetId: value.canonicalAssetId.trim().toLowerCase(),
    label: value.label.trim(),
    providerName: value.providerName.trim(),
    sourceUrl: value.sourceUrl.trim(),
    currency: value.currency.trim().toUpperCase(),
    itemUnitPrice: value.itemUnitPrice.trim(),
    quantity: value.quantity.trim(),
    shipping: value.shipping.trim(),
    tax: value.tax.trim(),
    duty: value.duty.trim(),
    fees: value.fees.trim(),
    discount: value.discount.trim(),
    condition: value.condition.trim(),
    region: value.region.trim(),
    returnNotes: value.returnNotes.trim(),
    merchantMapping: value.merchantMapping
      ? {
          merchantId: value.merchantMapping.merchantId.trim().toLowerCase(),
          sku: value.merchantMapping.sku.trim(),
          productId: value.merchantMapping.productId.trim(),
          reviewedAt: value.merchantMapping.reviewedAt,
          evidenceUrl: value.merchantMapping.evidenceUrl.trim(),
        }
      : null,
  };
}

function validMarketToken(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.address === "string" &&
    /^0x[0-9a-f]{40}$/.test(value.address) &&
    typeof value.name === "string" &&
    value.name.length >= 1 &&
    value.name.length <= 120 &&
    typeof value.symbol === "string" &&
    value.symbol.length >= 1 &&
    value.symbol.length <= 30
  );
}

function validNullableDecimal(value: unknown, signed: boolean): boolean {
  if (value === null) return true;
  return (
    typeof value === "string" &&
    (signed ? /^-?\d{1,78}(?:\.\d{1,78})?$/.test(value) : DECIMAL.test(value))
  );
}

function validOptionalCost(value: unknown): boolean {
  return typeof value === "string" && (value === "" || DECIMAL.test(value));
}

function validProductRating(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.average === "string" &&
      DECIMAL.test(value.average) &&
      /^(?:[0-4](?:\.\d+)?|5(?:\.0+)?)$/.test(value.average) &&
      typeof value.count === "number" &&
      Number.isSafeInteger(value.count) &&
      value.count >= 0 &&
      value.sourceLabel === "merchant_reported_product_rating")
  );
}

function validMarketPrivacy(value: unknown, providers: string[]): boolean {
  return (
    isRecord(value) &&
    value.accountRequired === false &&
    value.walletConnectionRequired === false &&
    value.serverStorage === "none" &&
    value.modelProvider === "none" &&
    Array.isArray(value.providerDestinations) &&
    value.providerDestinations.length === providers.length &&
    providers.every(
      (provider, index) =>
        (value.providerDestinations as unknown[])[index] === provider,
    ) &&
    typeof value.disclosure === "string" &&
    value.disclosure.length >= 1 &&
    value.disclosure.length <= 1_500
  );
}

function validDexUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === "https://dexscreener.com" &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function validatePortfolioSnapshot(value: unknown, address: string): void {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.address !== address ||
    !isRecord(value.chain) ||
    value.chain.id !== 4663 ||
    !isRecord(value.anchor) ||
    value.anchor.tag !== "latest" ||
    typeof value.anchor.blockNumber !== "number" ||
    !Number.isSafeInteger(value.anchor.blockNumber) ||
    typeof value.anchor.blockHash !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(value.anchor.blockHash) ||
    typeof value.anchor.timestamp !== "string" ||
    !ISO_DATE_TIME.test(value.anchor.timestamp) ||
    typeof value.anchor.fetchedAt !== "string" ||
    !ISO_DATE_TIME.test(value.anchor.fetchedAt) ||
    typeof value.nativeBalanceEth !== "string" ||
    !DECIMAL.test(value.nativeBalanceEth) ||
    !Array.isArray(value.tokens) ||
    value.tokens.length > 10 ||
    !Array.isArray(value.nfts) ||
    value.nfts.length > 10 ||
    !Array.isArray(value.transactions) ||
    value.transactions.length > 10 ||
    !Array.isArray(value.movements) ||
    value.movements.length > 40 ||
    !Array.isArray(value.approvals) ||
    value.approvals.length > 10 ||
    !Array.isArray(value.attention) ||
    value.attention.length > 20 ||
    !Array.isArray(value.citations) ||
    value.citations.length > 10 ||
    !isRecord(value.reconciliation) ||
    !isRecord(value.privacy) ||
    value.privacy.serverStorage !== "none" ||
    value.privacy.browserStorage !== "client_encrypted_vault" ||
    JSON.stringify(value).length > 1_000_000
  ) {
    throw new VaultError(
      "INVALID_PORTFOLIO",
      translateCurrent("vault.crypto.invalidPortfolioSnapshot"),
    );
  }
  const validAddress = (candidate: unknown) =>
    typeof candidate === "string" && /^0x[0-9a-f]{40}$/.test(candidate);
  const validNullableAddress = (candidate: unknown) =>
    candidate === null || validAddress(candidate);
  const validHash = (candidate: unknown) =>
    typeof candidate === "string" && /^0x[0-9a-f]{64}$/.test(candidate);
  const validDecimal = (candidate: unknown) =>
    typeof candidate === "string" && DECIMAL.test(candidate);
  const validInteger = (candidate: unknown) =>
    typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate >= 0;
  const validNullableTimestamp = (candidate: unknown) =>
    candidate === null ||
    (typeof candidate === "string" && ISO_DATE_TIME.test(candidate));
  const validSources = (candidate: unknown) =>
    Array.isArray(candidate) &&
    candidate.length <= 12 &&
    candidate.every(
      (source) =>
        typeof source === "string" &&
        source.length >= 1 &&
        source.length <= 120,
    );
  const validBoundedText = (candidate: unknown, max = 160) =>
    typeof candidate === "string" && candidate.length <= max;
  const reconciliation = value.reconciliation as Record<string, unknown>;
  const privacy = value.privacy as Record<string, unknown>;
  const invalidToken = value.tokens.some((candidate) => {
    const token = isRecord(candidate) ? candidate : {};
    return (
      token.kind !== "erc20" ||
      !validAddress(token.contract) ||
      !validBoundedText(token.name, 120) ||
      !validBoundedText(token.symbol, 120) ||
      !validInteger(token.decimals) ||
      Number(token.decimals) > 255 ||
      !validDecimal(token.quantity) ||
      typeof token.rawBalance !== "string" ||
      !/^\d{1,78}$/.test(token.rawBalance) ||
      !validSources(token.sourceIds)
    );
  });
  const invalidNft = value.nfts.some((candidate) => {
    const nft = isRecord(candidate) ? candidate : {};
    return (
      !["erc721", "erc1155"].includes(String(nft.kind)) ||
      !validAddress(nft.contract) ||
      typeof nft.tokenId !== "string" ||
      !/^\d{1,78}$/.test(nft.tokenId) ||
      !validBoundedText(nft.name, 120) ||
      !validBoundedText(nft.symbol, 120) ||
      !validDecimal(nft.quantity) ||
      !validSources(nft.sourceIds)
    );
  });
  const invalidTransaction = value.transactions.some((candidate) => {
    const transaction = isRecord(candidate) ? candidate : {};
    return (
      !validHash(transaction.hash) ||
      !validInteger(transaction.blockNumber) ||
      !validNullableTimestamp(transaction.timestamp) ||
      !["success", "failed"].includes(String(transaction.status)) ||
      !(
        transaction.method === null || validBoundedText(transaction.method, 120)
      ) ||
      !["in", "out", "self", "mixed"].includes(String(transaction.direction)) ||
      !validNullableAddress(transaction.counterparty) ||
      !validDecimal(transaction.nativeValueEth) ||
      !validInteger(transaction.movementCount) ||
      !["complete", "partial"].includes(String(transaction.movementCoverage)) ||
      !validSources(transaction.sourceIds)
    );
  });
  const invalidMovement = value.movements.some((candidate) => {
    const movement = isRecord(candidate) ? candidate : {};
    return (
      !validHash(movement.transactionHash) ||
      !validInteger(movement.blockNumber) ||
      !validNullableTimestamp(movement.timestamp) ||
      !["in", "out", "self"].includes(String(movement.direction)) ||
      !["native", "erc20", "erc721", "erc1155"].includes(
        String(movement.kind),
      ) ||
      !validBoundedText(movement.symbol, 120) ||
      !validDecimal(movement.quantity) ||
      !validNullableAddress(movement.contract) ||
      !(
        movement.tokenId === null ||
        (typeof movement.tokenId === "string" &&
          /^\d{1,78}$/.test(movement.tokenId))
      ) ||
      !validNullableAddress(movement.counterparty) ||
      !validSources(movement.sourceIds)
    );
  });
  const invalidApproval = value.approvals.some((candidate) => {
    const approval = isRecord(candidate) ? candidate : {};
    return (
      !validHash(approval.transactionHash) ||
      !validAddress(approval.contract) ||
      !validAddress(approval.spender) ||
      !["erc20", "erc721-token", "operator"].includes(String(approval.kind)) ||
      !validBoundedText(approval.symbol, 120) ||
      typeof approval.active !== "boolean" ||
      typeof approval.unlimited !== "boolean" ||
      typeof approval.currentAmount !== "string" ||
      (approval.tokenId !== undefined && (typeof approval.tokenId !== "string" || !/^\d{1,78}$/.test(approval.tokenId))) ||
      approval.currentAmount.length > 120 ||
      !validSources(approval.sourceIds)
    );
  });
  const invalidAttention = value.attention.some((candidate) => {
    const attention = isRecord(candidate) ? candidate : {};
    return (
      !["info", "medium", "high"].includes(String(attention.severity)) ||
      !validBoundedText(attention.title, 160) ||
      !validBoundedText(attention.detail, 1_000) ||
      !validSources(attention.sourceIds)
    );
  });
  const reconciliationCounts = [
    "tokenCandidates",
    "tokenConfirmed",
    "nftCandidates",
    "nftConfirmed",
    "activityCandidates",
    "activityConfirmed",
    "approvalCandidates",
    "approvalConfirmed",
  ];
  const invalidReconciliation =
    reconciliationCounts.some((key) => !validInteger(reconciliation[key])) ||
    !Array.isArray(reconciliation.degradedSources) ||
    reconciliation.degradedSources.length > 10 ||
    reconciliation.degradedSources.some(
      (source: unknown) => typeof source !== "string" || source.length > 120,
    ) ||
    !Array.isArray(reconciliation.truncatedSections) ||
    reconciliation.truncatedSections.length > 10 ||
    reconciliation.truncatedSections.some(
      (section: unknown) => typeof section !== "string" || section.length > 200,
    );
  const invalidCitation = value.citations.some((candidate) => {
    const citation = isRecord(candidate) ? candidate : {};
    return (
      !validBoundedText(citation.id, 120) ||
      !["robinhood", "blockscout"].includes(String(citation.provider)) ||
      !validBoundedText(citation.url, 1_000) ||
      !validBoundedText(citation.description, 500) ||
      typeof citation.fetchedAt !== "string" ||
      !ISO_DATE_TIME.test(citation.fetchedAt)
    );
  });
  const invalidPrivacy =
    privacy.accountRequired !== false ||
    privacy.walletConnectionRequired !== false ||
    !Array.isArray(privacy.providerDestinations) ||
    privacy.providerDestinations.length < 1 ||
    privacy.providerDestinations.length > 10 ||
    privacy.providerDestinations.some(
      (provider: unknown) =>
        typeof provider !== "string" || provider.length > 60,
    ) ||
    !validBoundedText(privacy.disclosure, 1_000);
  if (
    invalidToken ||
    invalidNft ||
    invalidTransaction ||
    invalidMovement ||
    invalidApproval ||
    invalidAttention ||
    invalidReconciliation ||
    invalidCitation ||
    invalidPrivacy
  ) {
    throw new VaultError(
      "INVALID_PORTFOLIO",
      translateCurrent("vault.crypto.malformedPortfolioSnapshot"),
    );
  }
}

function validateBackupIntegrity(
  value: unknown,
): asserts value is VaultBackupIntegrity {
  if (
    !isRecord(value) ||
    value.algorithm !== "AES-GCM" ||
    typeof value.iv !== "string" ||
    base64ToBytes(value.iv).byteLength !== 12 ||
    typeof value.ciphertext !== "string" ||
    value.ciphertext.length < 20 ||
    value.ciphertext.length > 512 * 1024
  ) {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.invalidBackupIntegrity"),
    );
  }
}

function validateAsset(value: unknown): asserts value is VaultAsset {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.length > 120 ||
    !["crypto", "collectible", "rwa", "nft", "other"].includes(
      String(value.assetType),
    ) ||
    typeof value.identifier !== "string" ||
    value.identifier.length > 200 ||
    !Array.isArray(value.lots) ||
    value.lots.length < 1 ||
    value.lots.length > 100 ||
    typeof value.notes !== "string" ||
    value.notes.length > 5_000 ||
    typeof value.createdAt !== "string" ||
    !ISO_DATE_TIME.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !ISO_DATE_TIME.test(value.updatedAt)
  ) {
    throw new VaultError(
      "INVALID_ASSET",
      translateCurrent("vault.crypto.invalidAsset"),
    );
  }
  const lotIds = new Set<string>();
  for (const lot of value.lots) {
    if (
      !isRecord(lot) ||
      typeof lot.id !== "string" ||
      !UUID.test(lot.id) ||
      lotIds.has(lot.id) ||
      typeof lot.quantity !== "string" ||
      !isPositiveDecimal(lot.quantity) ||
      typeof lot.unitPrice !== "string" ||
      (lot.unitPrice !== "" && !DECIMAL.test(lot.unitPrice)) ||
      typeof lot.currency !== "string" ||
      !CURRENCY.test(lot.currency) ||
      typeof lot.acquiredAt !== "string" ||
      !isValidOptionalDate(lot.acquiredAt)
    ) {
      throw new VaultError(
        "INVALID_ASSET",
        translateCurrent("vault.crypto.invalidLots"),
      );
    }
    lotIds.add(lot.id);
  }
  if (value.photo !== undefined) {
    if (
      !isRecord(value.photo) ||
      typeof value.photo.name !== "string" ||
      value.photo.name.length > 160 ||
      typeof value.photo.mimeType !== "string" ||
      !ALLOWED_PHOTOS.has(value.photo.mimeType) ||
      typeof value.photo.size !== "number" ||
      value.photo.size < 0 ||
      value.photo.size > VAULT_MAX_PHOTO_BYTES ||
      typeof value.photo.dataUrl !== "string" ||
      value.photo.dataUrl.length >
        Math.ceil((VAULT_MAX_PHOTO_BYTES * 4) / 3) + 100 ||
      !validPhotoData(
        value.photo.mimeType,
        value.photo.size,
        value.photo.dataUrl,
      )
    ) {
      throw new VaultError(
        "INVALID_PHOTO",
        translateCurrent("vault.crypto.invalidPhoto"),
      );
    }
  }
  if (value.collectible !== undefined)
    validateCollectibleDetails(
      value.collectible,
      value as unknown as VaultAsset,
    );
}

function validateCollectibleContext(
  value: unknown,
): asserts value is VaultCollectibleContext {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    value.kind !== "collectible-context" ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > 50 ||
    typeof value.createdAt !== "string" ||
    !ISO_DATE_TIME.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !ISO_DATE_TIME.test(value.updatedAt)
  ) {
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.invalidCollectibleContext"),
    );
  }
  const ids = new Set<string>();
  for (const receipt of value.receipts) {
    if (
      !isRecord(receipt) ||
      typeof receipt.id !== "string" ||
      !UUID.test(receipt.id) ||
      ids.has(receipt.id) ||
      !["search", "detail"].includes(String(receipt.operation)) ||
      receipt.language !== "en" ||
      typeof receipt.query !== "string" ||
      receipt.query.length < 1 ||
      receipt.query.length > 200 ||
      !Array.isArray(receipt.providerDestinations) ||
      receipt.providerDestinations.length !== 1 ||
      receipt.providerDestinations[0] !== "TCGdex" ||
      typeof receipt.disclosure !== "string" ||
      receipt.disclosure.length < 1 ||
      receipt.disclosure.length > 1_000 ||
      typeof receipt.approvedAt !== "string" ||
      !ISO_DATE_TIME.test(receipt.approvedAt) ||
      !["approved", "completed", "failed"].includes(String(receipt.outcome)) ||
      !(
        receipt.resolvedAt === undefined ||
        (typeof receipt.resolvedAt === "string" &&
          ISO_DATE_TIME.test(receipt.resolvedAt))
      ) ||
      (receipt.outcome === "approved" && receipt.resolvedAt !== undefined) ||
      (receipt.outcome !== "approved" && receipt.resolvedAt === undefined)
    ) {
      throw new VaultError(
        "INVALID_COLLECTIBLE",
        translateCurrent("vault.crypto.invalidCollectibleReceipt"),
      );
    }
    ids.add(receipt.id);
  }
}

function validateCollectibleDetails(value: unknown, asset: VaultAsset): void {
  if (
    asset.assetType !== "collectible" ||
    !isRecord(value) ||
    !(value.catalog === null || isRecord(value.catalog)) ||
    typeof value.ownerPrinting !== "string" ||
    value.ownerPrinting.length > 120 ||
    ![
      "unknown",
      "poor",
      "played",
      "good",
      "excellent",
      "near-mint",
      "mint",
    ].includes(String(value.condition)) ||
    !["ungraded", "psa", "cgc", "bgs", "other"].includes(
      String(value.grader),
    ) ||
    typeof value.grade !== "string" ||
    value.grade.length > 40 ||
    typeof value.certificate !== "string" ||
    value.certificate.length > 80 ||
    !(
      value.photoSource === null ||
      value.photoSource === "owner_supplied" ||
      value.photoSource === "tcgdex_catalog"
    ) ||
    !(
      value.photoAddedAt === null ||
      (typeof value.photoAddedAt === "string" &&
        ISO_DATE_TIME.test(value.photoAddedAt))
    ) ||
    !Array.isArray(value.references) ||
    value.references.length > 20
  ) {
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.invalidCollectibleDetails"),
    );
  }
  if (isRecord(value.catalog)) {
    validateCatalogCard(value.catalog);
    if (
      asset.identifier !==
      `tcgdex:${String(value.catalog.language)}:${String(value.catalog.catalogId)}`
    ) {
      throw new VaultError(
        "INVALID_COLLECTIBLE",
        translateCurrent("vault.crypto.collectibleIdentifierMismatch"),
      );
    }
    if (
      value.photoSource === "tcgdex_catalog" &&
      !(typeof value.catalog.imageUrl === "string" &&
        validTcgdexCatalogImageUrl(
          value.catalog.imageUrl,
          String(value.catalog.set && isRecord(value.catalog.set) ? value.catalog.set.id : ""),
          String(value.catalog.number),
        ))
    ) {
      throw new VaultError(
        "INVALID_COLLECTIBLE",
        translateCurrent("vault.crypto.catalogThumbnailProvenance"),
      );
    }
  } else if (value.photoSource === "tcgdex_catalog") {
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.catalogThumbnailRequiresIdentity"),
    );
  }
  if (
    (asset.photo === undefined) !== (value.photoSource === null) ||
    (asset.photo === undefined) !== (value.photoAddedAt === null)
  ) {
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.photoMetadataMismatch"),
    );
  }
  const graded = value.grader !== "ungraded";
  if (
    (!graded && (value.grade !== "" || value.certificate !== "")) ||
    (graded &&
      (value.grade.trim().length < 1 || value.certificate.trim().length < 1)) ||
    (graded && (asset.lots.length !== 1 || asset.lots[0]?.quantity !== "1"))
  ) {
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.gradedCertificate"),
    );
  }
  const referenceIds = new Set<string>();
  for (const reference of value.references) {
    if (
      !isRecord(reference) ||
      typeof reference.id !== "string" ||
      !UUID.test(reference.id) ||
      referenceIds.has(reference.id) ||
      typeof reference.value !== "string" ||
      !DECIMAL.test(reference.value) ||
      typeof reference.currency !== "string" ||
      !CURRENCY.test(reference.currency) ||
      typeof reference.observedAt !== "string" ||
      !isValidOptionalDate(reference.observedAt) ||
      reference.observedAt.length === 0 ||
      typeof reference.sourceUrl !== "string" ||
      !validHttpsUrl(reference.sourceUrl, 1_000) ||
      typeof reference.label !== "string" ||
      reference.label.trim().length < 1 ||
      reference.label.length > 120
    ) {
      throw new VaultError(
        "INVALID_COLLECTIBLE",
        translateCurrent("vault.crypto.invalidReferences"),
      );
    }
    referenceIds.add(reference.id);
  }
}

function validateCatalogCard(value: Record<string, unknown>): void {
  if (
    value.provider !== "tcgdex" ||
    typeof value.catalogId !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(value.catalogId) ||
    value.language !== "en" ||
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.length > 120 ||
    typeof value.number !== "string" ||
    value.number.length < 1 ||
    value.number.length > 24 ||
    typeof value.category !== "string" ||
    value.category.length < 1 ||
    value.category.length > 40 ||
    !isRecord(value.set) ||
    typeof value.set.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(value.set.id) ||
    typeof value.set.name !== "string" ||
    value.set.name.length < 1 ||
    value.set.name.length > 120 ||
    !validCatalogCount(value.set.officialCount) ||
    !validCatalogCount(value.set.totalCount) ||
    Number(value.set.totalCount) < Number(value.set.officialCount) ||
    value.catalogId !== `${value.set.id}-${value.number}` ||
    !(
      value.rarity === null ||
      (typeof value.rarity === "string" && value.rarity.length <= 80)
    ) ||
    !(
      value.illustrator === null ||
      (typeof value.illustrator === "string" && value.illustrator.length <= 120)
    ) ||
    !(
      value.imageUrl === undefined ||
      value.imageUrl === null ||
      validTcgdexCatalogImageUrl(value.imageUrl, value.set.id, value.number)
    ) ||
    !(
      value.catalogUpdatedAt === null ||
      (typeof value.catalogUpdatedAt === "string" &&
        ISO_DATE_TIME.test(value.catalogUpdatedAt))
    ) ||
    typeof value.fetchedAt !== "string" ||
    !ISO_DATE_TIME.test(value.fetchedAt) ||
    typeof value.sourceUrl !== "string" ||
    value.sourceUrl !== "https://api.tcgdex.net/v2/graphql" ||
    !validHttpsUrl(value.sourceUrl, 1_000) ||
    value.licenseUrl !==
      "https://github.com/tcgdex/cards-database/blob/master/LICENSE"
  ) {
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.invalidCatalogIdentity"),
    );
  }
}

function validTcgdexCatalogImageUrl(value: unknown, setId: unknown, number: unknown): boolean {
  if (typeof value !== "string" || value.length > 540 || typeof setId !== "string" || typeof number !== "string") return false;
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:"
      && url.hostname === "assets.tcgdex.net"
      && url.port === ""
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && segments.length === 5
      && segments[0] === "en"
      && segments[2] === setId
      && segments[3] === number
      && segments[4] === "low.png";
  } catch {
    return false;
  }
}

function normalizeCollectibleDetails(
  value: VaultAsset["collectible"],
): NonNullable<VaultAsset["collectible"]> {
  if (!value)
    throw new VaultError(
      "INVALID_COLLECTIBLE",
      translateCurrent("vault.crypto.collectibleDetailsRequired"),
    );
  return {
    catalog: value.catalog ? structuredClone(value.catalog) : null,
    ownerPrinting: value.ownerPrinting.trim(),
    condition: value.condition,
    grader: value.grader,
    grade: value.grade.trim(),
    certificate: value.certificate.trim(),
    photoSource: value.photoSource,
    photoAddedAt: value.photoAddedAt,
    references: value.references.map((reference) => ({
      ...reference,
      value: reference.value.trim(),
      currency: reference.currency.trim().toUpperCase(),
      sourceUrl: reference.sourceUrl.trim(),
      label: reference.label.trim(),
    })),
  };
}

function validCatalogCount(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 100_000
  );
}

function validHttpsUrl(value: string, maxLength: number): boolean {
  if (value.length < 1 || value.length > maxLength) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
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
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= days[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

async function deriveWrappingKey(
  passphrase: string,
  kdf: VaultMeta["kdf"],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: kdf.hash,
      salt: base64ToBytes(kdf.salt),
      iterations: kdf.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrapWithPassphrase(
  key: CryptoKey,
  passphrase: string,
  kdf: VaultMeta["kdf"],
  vaultId: string,
): Promise<VaultWrappedKey> {
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(passphrase, kdf);
  const ciphertext = await crypto.subtle.wrapKey(
    "raw",
    key,
    wrappingKey,
    aesParams(iv, keyAad(vaultId)),
  );
  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function unwrapWithPassphrase(
  meta: VaultMeta,
  passphrase: string,
  extractable: boolean,
): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(passphrase, meta.kdf);
  return crypto.subtle.unwrapKey(
    "raw",
    base64ToBytes(meta.wrappedKey.ciphertext),
    wrappingKey,
    aesParams(base64ToBytes(meta.wrappedKey.iv), keyAad(meta.vaultId)),
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

async function wrapWithRecoveryKey(
  key: CryptoKey,
  recoveryBytes: Uint8Array<ArrayBuffer>,
  vaultId: string,
): Promise<VaultRecoveryWrapper> {
  const iv = randomBytes(12);
  const recoveryKey = await importRecoveryKey(recoveryBytes);
  const ciphertext = await crypto.subtle.wrapKey(
    "raw",
    key,
    recoveryKey,
    aesParams(iv, recoveryAad(vaultId)),
  );
  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    checksum: await recoveryChecksum(recoveryBytes),
  };
}

async function importRecoveryKey(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function formatRecoverySecret(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  return `${RECOVERY_PREFIX}-${bytesToBase64Url(bytes)}.${await recoveryChecksum(bytes)}`;
}

async function parseRecoverySecret(
  value: string,
  expectedChecksum: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const match = /^CSV1-([A-Za-z0-9_-]{43})\.([0-9a-f]{16})$/i.exec(
    value.trim(),
  );
  if (!match)
    throw new VaultError(
      "RECOVERY_FAILED",
      translateCurrent("vault.crypto.recoveryFailed"),
    );
  const bytes = base64UrlToBytes(match[1]);
  const checksum = await recoveryChecksum(bytes);
  if (
    checksum !== match[2].toLowerCase() ||
    checksum !== expectedChecksum.toLowerCase()
  ) {
    throw new VaultError(
      "RECOVERY_FAILED",
      translateCurrent("vault.crypto.recoveryFailed"),
    );
  }
  return bytes;
}

async function recoveryChecksum(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.subarray(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function aesParams(
  iv: Uint8Array<ArrayBuffer>,
  additionalData: Uint8Array<ArrayBuffer>,
): AesGcmParams {
  return { name: "AES-GCM", iv, additionalData, tagLength: 128 };
}

function keyAad(vaultId: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`chainscout:vault-key:v1:${vaultId}`);
}

function recordAad(
  vaultId: string,
  recordId: string,
  version: 1 | 2 | 3 | 4 | 5 | 6,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `chainscout:vault-record:v${version}:${vaultId}:${recordId}`,
  );
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
  exportedAt: string,
): Promise<VaultBackupIntegrity> {
  const iv = randomBytes(12);
  const manifest = await backupManifest(meta, records, exportedAt);
  const ciphertext = await crypto.subtle.encrypt(
    aesParams(iv, backupAad(meta.vaultId)),
    key,
    encoder.encode(JSON.stringify(manifest)),
  );
  return {
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function verifyBackupManifest(
  backup: VaultBackup,
  key: CryptoKey,
): Promise<void> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      aesParams(
        base64ToBytes(backup.integrity.iv),
        backupAad(backup.vault.vaultId),
      ),
      key,
      base64ToBytes(backup.integrity.ciphertext),
    );
  } catch {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.backupManifestDamaged"),
    );
  }
  const expected = JSON.stringify(
    await backupManifest(backup.vault, backup.records, backup.exportedAt),
  );
  let received: string;
  try {
    received = decoder.decode(plaintext);
  } catch {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.backupManifestDamaged"),
    );
  }
  if (received !== expected) {
    throw new VaultError(
      "INVALID_BACKUP",
      translateCurrent("vault.crypto.backupRecordSetChanged"),
    );
  }
}

async function backupManifest(
  meta: VaultMeta,
  records: EncryptedVaultRecord[],
  exportedAt: string,
): Promise<{
  format: "chainscout.encrypted-vault-manifest";
  version: 1;
  exportedAt: string;
  vaultMetaDigest: string;
  records: Array<{ id: string; digest: string }>;
}> {
  const digests = await Promise.all(
    records.map(async (record) => ({
      id: record.id,
      digest: await sha256Base64(
        JSON.stringify({
          id: record.id,
          version: record.version,
          iv: record.iv,
          ciphertext: record.ciphertext,
        }),
      ),
    })),
  );
  digests.sort((left, right) => left.id.localeCompare(right.id));
  return {
    format: "chainscout.encrypted-vault-manifest",
    version: 1,
    exportedAt,
    vaultMetaDigest: await sha256Base64(
      JSON.stringify({
        key: meta.key,
        format: meta.format,
        schemaVersion: meta.schemaVersion,
        vaultId: meta.vaultId,
        revision: meta.revision,
        kdf: meta.kdf,
        wrappedKey: meta.wrappedKey,
        recovery: meta.recovery,
      }),
    ),
    records: digests,
  };
}

async function sha256Base64(value: string): Promise<string> {
  return bytesToBase64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
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
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new VaultError(
      "INVALID_BASE64",
      translateCurrent("vault.crypto.malformedBinary"),
    );
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(padded);
}

function requireWebCrypto(): void {
  if (
    !globalThis.crypto?.subtle ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new VaultError(
      "UNSUPPORTED_BROWSER",
      translateCurrent("vault.crypto.noWebCrypto"),
    );
  }
}

function validPhotoData(
  mimeType: string,
  declaredSize: number,
  dataUrl: string,
): boolean {
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) return false;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(dataUrl.slice(prefix.length));
  } catch {
    return false;
  }
  if (
    bytes.byteLength !== declaredSize ||
    bytes.byteLength > VAULT_MAX_PHOTO_BYTES
  )
    return false;
  if (mimeType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png")
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
