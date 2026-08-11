import {
  changeVaultPassphrase,
  createAsset,
  createBackup,
  createVault,
  decryptAsset,
  encryptAsset,
  parseBackup,
  recoverVault,
  unlockVault,
  verifyBackup,
  verifyBackupWithKey,
  VaultError
} from "./crypto";
import {
  deleteLocalVault,
  initializeVault,
  readVaultSnapshot,
  readVaultMeta,
  removeEncryptedRecord,
  replaceVault,
  writeEncryptedRecord,
  writeVaultMeta
} from "./db";
import {
  VAULT_MAX_BACKUP_BYTES,
  type VaultAsset,
  type VaultAssetDraft,
  type VaultBackup,
  type VaultMeta
} from "./types";

export interface UnlockedVault {
  meta: VaultMeta;
  key: CryptoKey;
  assets: VaultAsset[];
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
  return { ...created, assets: [] };
}

export async function unlockLocalVault(meta: VaultMeta, passphrase: string): Promise<UnlockedVault> {
  const snapshot = await readVaultSnapshot(meta.vaultId, meta.revision);
  const key = await unlockVault(snapshot.meta, passphrase);
  const assets = await Promise.all(snapshot.records.map((record) => decryptAsset(snapshot.meta, key, record)));
  assets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { meta: snapshot.meta, key, assets };
}

export async function saveVaultAsset(
  unlocked: UnlockedVault,
  draft: VaultAssetDraft,
  existing?: VaultAsset
): Promise<{ asset: VaultAsset; meta: VaultMeta }> {
  const asset = createAsset(draft, existing);
  const meta = nextMeta(unlocked.meta);
  await writeEncryptedRecord(await encryptAsset(unlocked.meta, unlocked.key, asset), meta, unlocked.meta.revision);
  return { asset, meta };
}

export async function deleteVaultAsset(unlocked: UnlockedVault, id: string): Promise<VaultMeta> {
  const meta = nextMeta(unlocked.meta);
  await removeEncryptedRecord(id, meta, unlocked.meta.revision);
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
  const assets = await Promise.all(snapshot.records.map((record) => decryptAsset(recovered.meta, recovered.key, record)));
  assets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await writeVaultMeta(recovered.meta, snapshot.meta.revision);
  return { ...recovered, assets };
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
  const assets = await Promise.all(backup.records.map((record) => decryptAsset(meta, recovered.key, record)));
  assets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { meta, key: recovered.key, assets, recoverySecret: recovered.recoverySecret };
}

export async function exportVault(unlocked: UnlockedVault): Promise<VaultBackup> {
  const snapshot = await readVaultSnapshot(unlocked.meta.vaultId, unlocked.meta.revision);
  await Promise.all(snapshot.records.map((record) => decryptAsset(snapshot.meta, unlocked.key, record)));
  return createBackup(snapshot.meta, unlocked.key, snapshot.records);
}

export async function parseVaultBackup(file: File): Promise<VaultBackup> {
  if (file.size > VAULT_MAX_BACKUP_BYTES) throw backupError("Encrypted vault backups are limited to 32 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw backupError("The selected file is not valid JSON.");
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
  const assets = await Promise.all(backup.records.map((record) => decryptAsset(backup.vault, key, record)));
  assets.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { meta, key, assets };
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
