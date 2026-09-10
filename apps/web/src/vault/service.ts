import {
  changeVaultPassphrase,
  createAsset,
  createBackup,
  createCollectibleContext,
  createMarketContext,
  createPortfolioContext,
  createVault,
  decryptVaultRecord,
  encryptAsset,
  encryptCollectibleContext,
  encryptMarketContext,
  encryptPortfolioContext,
  encryptConversation,
  encryptWatch,
  parseBackup,
  recoverVault,
  unlockVault,
  verifyBackup,
  verifyBackupWithKey,
  VaultError
} from "./crypto";
import { translateCurrent } from "../i18n/translate";
import {
  deleteLocalVault,
  initializeVault,
  readVaultSnapshot,
  readVaultMeta,
  removeEncryptedRecord,
  removeEncryptedRecords,
  replaceVault,
  writeEncryptedRecord,
  writeEncryptedRecords,
  writeVaultMeta
} from "./db";
import {
  VAULT_MAX_BACKUP_BYTES,
  type EncryptedVaultRecord,
  type VaultAsset,
  type VaultAssetDraft,
  type VaultBackup,
  type VaultCollectibleContext,
  type VaultCollectibleContextDraft,
  type VaultMeta,
  type VaultMarketContext,
  type VaultMarketContextDraft,
  type VaultPortfolioContext,
  type VaultPortfolioContextDraft,
  type VaultConversation,
  type VaultWatch
} from "./types";

export interface UnlockedVault {
  meta: VaultMeta;
  key: CryptoKey;
  assets: VaultAsset[];
  portfolios: VaultPortfolioContext[];
  collectibles: VaultCollectibleContext[];
  markets: VaultMarketContext[];
  conversations?: VaultConversation[];
  watches?: VaultWatch[];
}

export interface CreatedVault extends UnlockedVault {
  recoverySecret: string;
}

export async function bootstrapVault(): Promise<VaultMeta | null> {
  return readVaultMeta();
}

export async function createLocalVault(passphrase: string): Promise<CreatedVault> {
  const created = await createVault(passphrase);
  await initializeVault(created.meta);
  return { ...created, assets: [], portfolios: [], collectibles: [], markets: [] };
}

export async function unlockLocalVault(meta: VaultMeta, passphrase: string): Promise<UnlockedVault> {
  const snapshot = await readVaultSnapshot(meta.vaultId, meta.revision);
  const key = await unlockVault(snapshot.meta, passphrase);
  const records = await decryptRecords(snapshot.meta, key, snapshot.records);
  return { meta: snapshot.meta, key, ...records };
}

export async function saveVaultPortfolio(
  unlocked: UnlockedVault,
  draft: VaultPortfolioContextDraft,
  existing?: VaultPortfolioContext,
  assertActive: () => void = () => undefined
): Promise<{ portfolio: VaultPortfolioContext; meta: VaultMeta }> {
  const portfolio = createPortfolioContext(draft, existing);
  const meta = nextMeta(unlocked.meta);
  const encrypted = await encryptPortfolioContext(unlocked.meta, unlocked.key, portfolio);
  assertActive();
  await writeEncryptedRecord(
    encrypted,
    meta,
    unlocked.meta.revision,
    assertActive
  );
  return { portfolio, meta };
}

export async function saveVaultConversation(
  unlocked: UnlockedVault,
  conversation: VaultConversation,
  assertActive: () => void = () => undefined
): Promise<VaultMeta> {
  const meta = nextMeta(unlocked.meta);
  const encrypted = await encryptConversation(unlocked.meta, unlocked.key, conversation);
  assertActive();
  await writeEncryptedRecord(encrypted, meta, unlocked.meta.revision, assertActive);
  return meta;
}

export async function saveVaultWatch(unlocked: UnlockedVault, watch: VaultWatch, assertActive: () => void = () => undefined): Promise<VaultMeta> {
  const existing = unlocked.watches ?? [];
  const prior = existing.find(item => item.id === watch.id);
  if ((!prior && existing.length >= 10) || (prior && prior.address !== watch.address)
    || existing.some(item => item.id !== watch.id && item.address === watch.address)) {
    throw new VaultError("INVALID_WATCH", translateCurrent("watch.error.duplicateOrLimit"));
  }
  const meta = nextMeta(unlocked.meta);
  const encrypted = await encryptWatch(unlocked.meta, unlocked.key, watch);
  assertActive();
  await writeEncryptedRecord(encrypted, meta, unlocked.meta.revision, assertActive);
  return meta;
}

export async function saveVaultCollectibleContext(
  unlocked: UnlockedVault,
  draft: VaultCollectibleContextDraft,
  existing?: VaultCollectibleContext,
  assertActive: () => void = () => undefined
): Promise<{ collectible: VaultCollectibleContext; meta: VaultMeta }> {
  const collectible = createCollectibleContext(draft, existing);
  const meta = nextMeta(unlocked.meta);
  const encrypted = await encryptCollectibleContext(unlocked.meta, unlocked.key, collectible);
  assertActive();
  await writeEncryptedRecord(encrypted, meta, unlocked.meta.revision, assertActive);
  return { collectible, meta };
}

export async function saveVaultMarketContext(
  unlocked: UnlockedVault,
  draft: VaultMarketContextDraft,
  existing?: VaultMarketContext,
  assertActive: () => void = () => undefined
): Promise<{ market: VaultMarketContext; meta: VaultMeta }> {
  const market = createMarketContext(draft, existing);
  const meta = nextMeta(unlocked.meta);
  const encrypted = await encryptMarketContext(unlocked.meta, unlocked.key, market);
  assertActive();
  await writeEncryptedRecord(encrypted, meta, unlocked.meta.revision, assertActive);
  return { market, meta };
}

export async function saveVaultAsset(
  unlocked: UnlockedVault,
  draft: VaultAssetDraft,
  existing?: VaultAsset,
  assertActive: () => void = () => undefined
): Promise<{ asset: VaultAsset; meta: VaultMeta }> {
  const asset = createAsset(draft, existing);
  const meta = nextMeta(unlocked.meta);
  const encrypted = await encryptAsset(unlocked.meta, unlocked.key, asset);
  assertActive();
  await writeEncryptedRecord(encrypted, meta, unlocked.meta.revision, assertActive);
  return { asset, meta };
}

export async function saveVaultAssets(
  unlocked: UnlockedVault,
  drafts: VaultAssetDraft[],
  assertActive: () => void = () => undefined
): Promise<{ assets: VaultAsset[]; meta: VaultMeta }> {
  if (drafts.length === 0) return { assets: [], meta: unlocked.meta };
  const assets = drafts.map((draft) => createAsset(draft));
  const meta = nextMeta(unlocked.meta);
  const encrypted = await Promise.all(
    assets.map((asset) => encryptAsset(unlocked.meta, unlocked.key, asset))
  );
  assertActive();
  await writeEncryptedRecords(encrypted, meta, unlocked.meta.revision, assertActive);
  return { assets, meta };
}

export async function deleteVaultAsset(unlocked: UnlockedVault, id: string): Promise<VaultMeta> {
  const meta = nextMeta(unlocked.meta);
  await removeEncryptedRecord(id, meta, unlocked.meta.revision);
  return meta;
}

export async function deleteVaultAssets(
  unlocked: UnlockedVault,
  ids: string[],
  assertActive: () => void = () => undefined
): Promise<VaultMeta> {
  if (ids.length === 0) return unlocked.meta;
  const meta = nextMeta(unlocked.meta);
  await removeEncryptedRecords(ids, meta, unlocked.meta.revision, assertActive);
  return meta;
}

export async function updateVaultPassphrase(
  unlocked: UnlockedVault,
  currentPassphrase: string,
  nextPassphrase: string
): Promise<VaultMeta> {
  const meta = await changeVaultPassphrase(unlocked.meta, currentPassphrase, nextPassphrase);
  await writeVaultMeta(meta, unlocked.meta.revision);
  return meta;
}

export async function recoverLocalVault(
  meta: VaultMeta,
  recoverySecret: string,
  nextPassphrase: string
): Promise<CreatedVault> {
  const snapshot = await readVaultSnapshot(meta.vaultId, meta.revision);
  const recovered = await recoverVault(snapshot.meta, recoverySecret, nextPassphrase);
  const records = await decryptRecords(recovered.meta, recovered.key, snapshot.records);
  await writeVaultMeta(recovered.meta, snapshot.meta.revision);
  return { ...recovered, ...records };
}

export async function recoverVaultBackup(
  backup: VaultBackup,
  recoverySecret: string,
  nextPassphrase: string,
  expectedCurrent: VaultMeta | null
): Promise<CreatedVault> {
  const recovered = await recoverVault(backup.vault, recoverySecret, nextPassphrase);
  await verifyBackupWithKey(backup, recovered.key);
  const rotatedBackup = await createBackup(recovered.meta, recovered.key, backup.records);
  const meta = await replaceVault(rotatedBackup, expectedCurrent && {
    vaultId: expectedCurrent.vaultId,
    revision: expectedCurrent.revision
  });
  const records = await decryptRecords(meta, recovered.key, backup.records);
  return { meta, key: recovered.key, ...records, recoverySecret: recovered.recoverySecret };
}

export async function exportVault(unlocked: UnlockedVault): Promise<VaultBackup> {
  const snapshot = await readVaultSnapshot(unlocked.meta.vaultId, unlocked.meta.revision);
  await Promise.all(snapshot.records.map((record) => decryptVaultRecord(snapshot.meta, unlocked.key, record)));
  return createBackup(snapshot.meta, unlocked.key, snapshot.records);
}

export async function parseVaultBackup(file: File): Promise<VaultBackup> {
  if (file.size > VAULT_MAX_BACKUP_BYTES) throw backupError(translateCurrent("vault.service.backupTooLarge"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw backupError(translateCurrent("vault.service.invalidJson"));
  }
  return parseBackup(parsed);
}

export async function importVaultBackup(
  backup: VaultBackup,
  passphrase: string,
  expectedCurrent: VaultMeta | null
): Promise<UnlockedVault> {
  const key = await verifyBackup(backup, passphrase);
  const meta = await replaceVault(backup, expectedCurrent && {
    vaultId: expectedCurrent.vaultId,
    revision: expectedCurrent.revision
  });
  const records = await decryptRecords(backup.vault, key, backup.records);
  return { meta, key, ...records };
}

export async function destroyLocalVault(onBlocked?: () => void): Promise<void> {
  await deleteLocalVault(onBlocked);
}

function backupError(message: string): VaultError {
  return new VaultError("INVALID_BACKUP", message);
}

function nextMeta(meta: VaultMeta): VaultMeta {
  return { ...meta, revision: meta.revision + 1 };
}

async function decryptRecords(
  meta: VaultMeta,
  key: CryptoKey,
  encrypted: EncryptedVaultRecord[]
): Promise<{ assets: VaultAsset[]; portfolios: VaultPortfolioContext[]; collectibles: VaultCollectibleContext[]; markets: VaultMarketContext[]; conversations: VaultConversation[]; watches: VaultWatch[] }> {
  const records = await Promise.all(encrypted.map((record) => decryptVaultRecord(meta, key, record)));
  const assets = records.filter((record): record is VaultAsset => !("kind" in record));
  const portfolios = records.filter((record): record is VaultPortfolioContext => "kind" in record && record.kind === "portfolio-context");
  const collectibles = records.filter((record): record is VaultCollectibleContext => "kind" in record && record.kind === "collectible-context");
  const markets = records.filter((record): record is VaultMarketContext => "kind" in record && record.kind === "market-context");
  const conversations = records.filter((record): record is VaultConversation => "kind" in record && record.kind === "conversation");
  const watches = records.filter((record): record is VaultWatch => "kind" in record && record.kind === "watch");
  watches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  conversations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  assets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  portfolios.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  collectibles.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  markets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { assets, portfolios, collectibles, markets, conversations, watches };
}
