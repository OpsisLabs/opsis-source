import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createVault, encryptAsset, recoverVault } from "./crypto";
import { recoverLocalVault } from "./service";
import {
  LEGACY_VAULT_DATABASE_NAME,
  deleteLocalVault,
  initializeVault,
  listEncryptedRecords,
  readVaultMeta,
  readVaultSnapshot,
  removeEncryptedRecord,
  removeEncryptedRecords,
  replaceVault,
  writeEncryptedRecord,
  writeEncryptedRecords,
  writeVaultMeta
} from "./db";
import { createBackup } from "./crypto";
import type { VaultAsset } from "./types";

describe("encrypted vault IndexedDB", () => {
  beforeEach(async () => {
    await deleteLocalVault().catch(() => undefined);
  });

  it("stores only ciphertext and rejects stale-tab revisions", async () => {
    const created = await createVault("correct horse battery staple");
    await initializeVault(created.meta);
    const asset = fixtureAsset();
    const record = await encryptAsset(created.meta, created.key, asset);
    const revisionOne = { ...created.meta, revision: 1 };
    await writeEncryptedRecord(record, revisionOne, 0);

    expect(await readVaultMeta()).toMatchObject({ revision: 1 });
    expect(await listEncryptedRecords()).toEqual([record]);
    await expect(readVaultSnapshot(created.meta.vaultId, 1)).resolves.toMatchObject({
      meta: { vaultId: created.meta.vaultId, revision: 1 },
      records: [record]
    });
    await expect(readVaultSnapshot(created.meta.vaultId, 0)).rejects.toMatchObject({ code: "VAULT_CONFLICT" });
    expect(JSON.stringify(await rawDatabase())).not.toContain("INDEXEDDB-PLAINTEXT-CANARY");

    const staleRevision = { ...created.meta, revision: 1, vaultId: "stale-tab-should-not-win" };
    await expect(writeVaultMeta(staleRevision, 0)).rejects.toMatchObject({ code: "VAULT_CONFLICT" });
    expect(await readVaultMeta()).toMatchObject({ vaultId: created.meta.vaultId, revision: 1 });
  });

  it("aborts an encrypted write when the Vault session expires inside the transaction", async () => {
    const created = await createVault("correct horse battery staple");
    await initializeVault(created.meta);
    const record = await encryptAsset(created.meta, created.key, fixtureAsset());
    await expect(writeEncryptedRecord(record, { ...created.meta, revision: 1 }, 0, () => {
      throw new Error("vault session expired");
    })).rejects.toThrow("vault session expired");
    expect(await listEncryptedRecords()).toEqual([]);
    expect(await readVaultMeta()).toMatchObject({ revision: 0 });
  });

  it("adds and removes a demo-sized record set in one revision without exposing plaintext", async () => {
    const created = await createVault("correct horse battery staple");
    await initializeVault(created.meta);
    const first = fixtureAsset();
    const second = {
      ...fixtureAsset(),
      id: "95f6d521-cf7e-4f32-8e72-af9805a25dfd",
      name: "SECOND-PLAINTEXT-CANARY",
    };
    const records = await Promise.all([
      encryptAsset(created.meta, created.key, first),
      encryptAsset(created.meta, created.key, second),
    ]);
    const revisionOne = { ...created.meta, revision: 1 };

    await writeEncryptedRecords(records, revisionOne, 0);
    expect(await readVaultMeta()).toMatchObject({ revision: 1 });
    expect(await listEncryptedRecords()).toHaveLength(2);
    expect(JSON.stringify(await rawDatabase())).not.toContain("SECOND-PLAINTEXT-CANARY");

    const revisionTwo = { ...revisionOne, revision: 2 };
    await removeEncryptedRecords(records.map((record) => record.id), revisionTwo, 1);
    expect(await listEncryptedRecords()).toEqual([]);
    expect(await readVaultMeta()).toMatchObject({ revision: 2 });
  });

  it("replaces a verified backup atomically and deletes only the vault database", async () => {
    const first = await createVault("correct horse battery staple");
    await initializeVault(first.meta);
    const second = await createVault("another secure vault passphrase");
    const record = await encryptAsset(second.meta, second.key, fixtureAsset());
    const importedMeta = await replaceVault(
      await createBackup(second.meta, second.key, [record]),
      { vaultId: first.meta.vaultId, revision: first.meta.revision }
    );
    expect(importedMeta).toMatchObject({ vaultId: second.meta.vaultId, revision: 1 });
    expect(await readVaultMeta()).toEqual(importedMeta);
    expect(await listEncryptedRecords()).toEqual([record]);

    const revisionTwo = { ...importedMeta, revision: 2 };
    await removeEncryptedRecord(record.id, revisionTwo, importedMeta.revision);
    expect(await listEncryptedRecords()).toEqual([]);
    await deleteLocalVault();
    expect(await readVaultMeta()).toBeNull();
  });

  it("rolls back an import transaction when a replacement record cannot be stored", async () => {
    const original = await createVault("correct horse battery staple");
    await initializeVault(original.meta);
    const originalRecord = await encryptAsset(original.meta, original.key, fixtureAsset());
    await writeEncryptedRecord(originalRecord, { ...original.meta, revision: 1 }, 0);

    const replacement = await createVault("another secure vault passphrase");
    const backup = await createBackup(replacement.meta, replacement.key, []);
    const invalidBackup = {
      ...backup,
      records: [{ version: 1, iv: "", ciphertext: "" }]
    } as unknown as typeof backup;

    await expect(replaceVault(invalidBackup, { vaultId: original.meta.vaultId, revision: 1 })).rejects.toBeTruthy();
    expect(await readVaultMeta()).toMatchObject({ vaultId: original.meta.vaultId, revision: 1 });
    expect(await listEncryptedRecords()).toEqual([originalRecord]);
  });

  it("rejects replacement when the current vault changed after import confirmation", async () => {
    const current = await createVault("correct horse battery staple");
    await initializeVault(current.meta);
    const replacement = await createVault("another secure vault passphrase");
    const backup = await createBackup(replacement.meta, replacement.key, []);

    await expect(replaceVault(backup, null)).rejects.toMatchObject({ code: "VAULT_CONFLICT" });
    await writeVaultMeta({ ...current.meta, revision: 1 }, 0);
    await expect(replaceVault(backup, { vaultId: current.meta.vaultId, revision: 0 })).rejects.toMatchObject({ code: "VAULT_CONFLICT" });
    expect(await readVaultMeta()).toMatchObject({ vaultId: current.meta.vaultId, revision: 1 });
  });

  it("keeps a blocked deletion pending and completes only after the blocker closes", async () => {
    const created = await createVault("correct horse battery staple");
    await initializeVault(created.meta);
    const blocker = await openRawDatabase();
    let releaseBlocked!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseBlocked = resolve; });
    const deletion = deleteLocalVault(releaseBlocked);

    await blocked;
    expect(blocker.objectStoreNames.contains("meta")).toBe(true);
    blocker.close();
    await deletion;
    expect(await readVaultMeta()).toBeNull();
  });

  it("does not rotate recovery material when a local encrypted record is corrupt", async () => {
    const created = await createVault("correct horse battery staple");
    await initializeVault(created.meta);
    const record = await encryptAsset(created.meta, created.key, fixtureAsset());
    const corrupted = {
      ...record,
      ciphertext: `${record.ciphertext.slice(0, -1)}${record.ciphertext.endsWith("A") ? "B" : "A"}`
    };
    const storedMeta = { ...created.meta, revision: 1 };
    await writeEncryptedRecord(corrupted, storedMeta, 0);

    await expect(recoverLocalVault(
      storedMeta,
      created.recoverySecret,
      "new recovered passphrase 2026"
    )).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
    expect(await readVaultMeta()).toEqual(storedMeta);
    await expect(recoverVault(
      storedMeta,
      created.recoverySecret,
      "another recovered passphrase"
    )).resolves.toMatchObject({ meta: { revision: 2 } });
  });
});

async function rawDatabase(): Promise<unknown> {
  const db = await openRawDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(["meta", "records"], "readonly");
      const meta = transaction.objectStore("meta").getAll();
      const records = transaction.objectStore("records").getAll();
      transaction.oncomplete = () => resolve({ meta: meta.result, records: records.result });
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function openRawDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_VAULT_DATABASE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function fixtureAsset(): VaultAsset {
  return {
    id: "8aa1d087-f087-4e2d-88b8-efbd0fbb9292",
    name: "INDEXEDDB-PLAINTEXT-CANARY",
    assetType: "rwa",
    identifier: "PRIVATE-ID-CANARY",
    lots: [{ id: "2163ca34-6550-4835-879e-9dbc4be2ead1", quantity: "1", unitPrice: "99.99", currency: "USD", acquiredAt: "2026-08-10" }],
    notes: "PRIVATE-NOTE-CANARY",
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z"
  };
}
