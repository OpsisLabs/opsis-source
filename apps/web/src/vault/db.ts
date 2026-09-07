import type {
  EncryptedVaultRecord,
  VaultBackup,
  VaultMeta,
  VaultStorageStatus
} from "./types";
import { assertVaultCapacity, VaultError } from "./crypto";

export const VAULT_DATABASE_NAME = "chainscout-private-vault";
const DATABASE_VERSION = 1;
const META_STORE = "meta";
const RECORD_STORE = "records";

export async function readVaultMeta(): Promise<VaultMeta | null> {
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const result = await requestResult<VaultMeta | undefined>(transaction.objectStore(META_STORE).get("vault"));
    await transactionDone(transaction);
    return result ?? null;
  } finally {
    db.close();
  }
}

export async function readVaultSnapshot(expectedVaultId: string, expectedRevision: number): Promise<{
  meta: VaultMeta;
  records: EncryptedVaultRecord[];
}> {
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction([META_STORE, RECORD_STORE], "readonly");
    const metaRequest = transaction.objectStore(META_STORE).get("vault");
    const recordsRequest = transaction.objectStore(RECORD_STORE).getAll();
    const [meta, records] = await Promise.all([
      requestResult<VaultMeta | undefined>(metaRequest),
      requestResult<EncryptedVaultRecord[]>(recordsRequest)
    ]);
    await transactionDone(transaction);
    if (!meta || meta.vaultId !== expectedVaultId || meta.revision !== expectedRevision) {
      throw new VaultError("VAULT_CONFLICT", "This vault changed in another tab. Unlock again before continuing.");
    }
    return { meta, records };
  } finally {
    db.close();
  }
}

export async function writeVaultMeta(meta: VaultMeta, expectedRevision: number): Promise<void> {
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction([META_STORE, RECORD_STORE], "readwrite", { durability: "strict" });
    const metaStore = transaction.objectStore(META_STORE);
    await assertRevision(metaStore, expectedRevision, meta.vaultId, transaction);
    const records = await requestResult<EncryptedVaultRecord[]>(transaction.objectStore(RECORD_STORE).getAll());
    assertVaultCapacity(meta, records);
    metaStore.put(meta);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function initializeVault(meta: VaultMeta): Promise<void> {
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction([META_STORE, RECORD_STORE], "readwrite", { durability: "strict" });
    const metaStore = transaction.objectStore(META_STORE);
    const existing = await requestResult<VaultMeta | undefined>(metaStore.get("vault"));
    if (existing) {
      transaction.abort();
      throw new VaultError("VAULT_EXISTS", "A local vault already exists in this browser.");
    }
    metaStore.put(meta);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function listEncryptedRecords(): Promise<EncryptedVaultRecord[]> {
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction(RECORD_STORE, "readonly");
    const records = await requestResult<EncryptedVaultRecord[]>(transaction.objectStore(RECORD_STORE).getAll());
    await transactionDone(transaction);
    return records;
  } finally {
    db.close();
  }
}

export async function writeEncryptedRecord(
  record: EncryptedVaultRecord,
  meta: VaultMeta,
  expectedRevision: number,
  assertActive: () => void = () => undefined
): Promise<void> {
  await writeEncryptedRecords([record], meta, expectedRevision, assertActive);
}

export async function writeEncryptedRecords(
  recordsToWrite: EncryptedVaultRecord[],
  meta: VaultMeta,
  expectedRevision: number,
  assertActive: () => void = () => undefined
): Promise<void> {
  if (recordsToWrite.length === 0) return;
  if (new Set(recordsToWrite.map((record) => record.id)).size !== recordsToWrite.length) {
    throw new VaultError("INVALID_VAULT", "Encrypted records must have unique identities.");
  }
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction([META_STORE, RECORD_STORE], "readwrite", { durability: "strict" });
    await assertRevision(transaction.objectStore(META_STORE), expectedRevision, meta.vaultId, transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const records = await requestResult<EncryptedVaultRecord[]>(recordStore.getAll());
    try {
      assertActive();
    } catch (error) {
      transaction.abort();
      throw error;
    }
    const ids = new Set(recordsToWrite.map((record) => record.id));
    const nextRecords = [...recordsToWrite, ...records.filter((existing) => !ids.has(existing.id))];
    assertVaultCapacity(meta, nextRecords);
    recordsToWrite.forEach((record) => recordStore.put(record));
    transaction.objectStore(META_STORE).put(meta);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function removeEncryptedRecord(id: string, meta: VaultMeta, expectedRevision: number): Promise<void> {
  await removeEncryptedRecords([id], meta, expectedRevision);
}

export async function removeEncryptedRecords(
  idsToRemove: string[],
  meta: VaultMeta,
  expectedRevision: number,
  assertActive: () => void = () => undefined
): Promise<void> {
  if (idsToRemove.length === 0) return;
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction([META_STORE, RECORD_STORE], "readwrite", { durability: "strict" });
    await assertRevision(transaction.objectStore(META_STORE), expectedRevision, meta.vaultId, transaction);
    try {
      assertActive();
    } catch (error) {
      transaction.abort();
      throw error;
    }
    const recordStore = transaction.objectStore(RECORD_STORE);
    new Set(idsToRemove).forEach((id) => recordStore.delete(id));
    transaction.objectStore(META_STORE).put(meta);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function replaceVault(
  backup: VaultBackup,
  expectedCurrent: { vaultId: string; revision: number } | null
): Promise<VaultMeta> {
  const db = await openVaultDatabase();
  try {
    const transaction = db.transaction([META_STORE, RECORD_STORE], "readwrite", { durability: "strict" });
    const completion = transactionDone(transaction);
    const metaStore = transaction.objectStore(META_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const current = await requestResult<VaultMeta | undefined>(metaStore.get("vault"));
    const currentMatches = expectedCurrent === null
      ? current === undefined
      : current?.vaultId === expectedCurrent.vaultId && current.revision === expectedCurrent.revision;
    if (!currentMatches) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new VaultError("VAULT_CONFLICT", "This vault changed in another tab. Unlock again before replacing it.");
    }
    const highestRevision = Math.max(current?.revision ?? -1, backup.vault.revision);
    if (highestRevision >= Number.MAX_SAFE_INTEGER) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw new VaultError("INVALID_BACKUP", "The encrypted-vault backup revision is out of range.");
    }
    const importedMeta: VaultMeta = { ...backup.vault, revision: highestRevision + 1 };
    assertVaultCapacity(importedMeta, backup.records);
    try {
      metaStore.clear();
      recordStore.clear();
      metaStore.put(importedMeta);
      backup.records.forEach((record) => recordStore.put(record));
    } catch (error) {
      transaction.abort();
      await completion.catch(() => undefined);
      throw error;
    }
    await completion;
    return importedMeta;
  } finally {
    db.close();
  }
}

export async function deleteLocalVault(onBlocked?: () => void): Promise<void> {
  requireIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(VAULT_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB deletion failed"));
    // An IndexedDB delete request cannot be cancelled after it becomes blocked.
    // Keep this promise pending and report that it is waiting; claiming failure
    // would be dishonest because closing the blocker can still complete deletion.
    request.onblocked = () => onBlocked?.();
  });
}

export async function readStorageStatus(): Promise<VaultStorageStatus> {
  if (typeof indexedDB === "undefined") {
    return { supported: false, persistent: null, usage: null, quota: null };
  }
  const storage = navigator.storage;
  if (!storage) return { supported: true, persistent: null, usage: null, quota: null };
  const [persistent, estimate] = await Promise.all([
    storage.persisted?.().catch(() => false) ?? Promise.resolve(null),
    storage.estimate?.().catch((): StorageEstimate => ({})) ?? Promise.resolve({} as StorageEstimate)
  ]);
  return {
    supported: true,
    persistent,
    usage: typeof estimate.usage === "number" ? estimate.usage : null,
    quota: typeof estimate.quota === "number" ? estimate.quota : null
  };
}

export async function requestPersistentStorage(): Promise<VaultStorageStatus> {
  if (!navigator.storage?.persist) return readStorageStatus();
  try {
    await navigator.storage.persist();
  } catch {
    // Persistence is an optional browser hint. A denial or browser error must
    // never prevent the user from continuing with honest best-effort storage.
  }
  return readStorageStatus();
}

function openVaultDatabase(): Promise<IDBDatabase> {
  requireIndexedDb();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(RECORD_STORE)) db.createObjectStore(RECORD_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new VaultError(
      "VAULT_OPEN_BLOCKED",
      "Another ChainScout tab is upgrading the vault. Close it, then try again."
    ));
  });
}

async function assertRevision(store: IDBObjectStore, expectedRevision: number, expectedVaultId: string, transaction: IDBTransaction): Promise<void> {
  const current = await requestResult<VaultMeta | undefined>(store.get("vault"));
  if (!current || current.vaultId !== expectedVaultId || current.revision !== expectedRevision) {
    transaction.abort();
    throw new VaultError(
      "VAULT_CONFLICT",
      "This vault changed in another tab. Lock and unlock again before saving."
    );
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function requireIndexedDb(): void {
  if (typeof indexedDB === "undefined") {
    throw new VaultError(
      "UNSUPPORTED_BROWSER",
      "This browser does not provide IndexedDB, so ChainScout cannot safely create a local vault."
    );
  }
}
