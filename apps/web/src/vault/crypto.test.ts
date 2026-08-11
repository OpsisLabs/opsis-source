import { describe, expect, it } from "vitest";
import {
  changeVaultPassphrase,
  createAsset,
  createBackup,
  createPortfolioContext,
  createVault,
  decryptAsset,
  decryptPortfolioContext,
  estimateVaultBackupBytes,
  encryptAsset,
  encryptPortfolioContext,
  parseBackup,
  recoverVault,
  unlockVault,
  vaultErrorMessage,
  verifyBackup,
  assertVaultCapacity,
  VaultError
} from "./crypto";
import { VAULT_FORMAT, VAULT_KDF_ITERATIONS, type VaultAsset, type VaultPortfolioContext } from "./types";

const passphrase = "correct horse battery staple";

describe("encrypted vault cryptography", () => {
  it("creates a nonextractable session key and decrypts exact lots, notes, and photos", async () => {
    const created = await createVault(passphrase);
    expect(created.key.extractable).toBe(false);
    expect(created.meta).toMatchObject({
      format: VAULT_FORMAT,
      schemaVersion: 1,
      revision: 0,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: VAULT_KDF_ITERATIONS },
      wrappedKey: { algorithm: "AES-GCM" },
      recovery: { algorithm: "AES-GCM" }
    });
    expect(created.recoverySecret).toMatch(/^CSV1-[A-Za-z0-9_-]{43}\.[0-9a-f]{16}$/);
    expect(JSON.stringify(created.meta)).not.toContain(created.recoverySecret);

    const asset = fixtureAsset();
    const first = await encryptAsset(created.meta, created.key, asset);
    const second = await encryptAsset(created.meta, created.key, { ...asset, notes: "Changed note" });
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain("PRIVATE-NOTE-CANARY");
    expect(await decryptAsset(created.meta, created.key, first)).toEqual(asset);
  });

  it("rejects the wrong passphrase, tampered ciphertext, and record identity changes", async () => {
    const created = await createVault(passphrase);
    await expect(unlockVault(created.meta, "another secure passphrase")).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    const encrypted = await encryptAsset(created.meta, created.key, fixtureAsset());
    const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` };
    await expect(decryptAsset(created.meta, created.key, tampered)).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
    await expect(decryptAsset(created.meta, created.key, { ...encrypted, id: crypto.randomUUID() })).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
  });

  it("normalizes passphrases consistently and requires the exact fixed KDF work factor", async () => {
    const composed = "vault-passphrase-é-2026";
    const decomposed = "vault-passphrase-e\u0301-2026";
    const created = await createVault(composed);
    expect((await unlockVault(created.meta, decomposed)).extractable).toBe(false);
    const hostile = structuredClone(created.meta);
    hostile.kdf.iterations = VAULT_KDF_ITERATIONS + 1;
    await expect(unlockVault(hostile, composed)).rejects.toMatchObject({ code: "INVALID_VAULT" });
  });

  it("changes a passphrase only with the current passphrase", async () => {
    const created = await createVault(passphrase);
    await expect(changeVaultPassphrase(created.meta, "wrong but twelve chars", "new secure passphrase 2026")).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    const changed = await changeVaultPassphrase(created.meta, passphrase, "new secure passphrase 2026");
    expect(changed.revision).toBe(1);
    await expect(unlockVault(changed, passphrase)).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    expect((await unlockVault(changed, "new secure passphrase 2026")).extractable).toBe(false);
  });

  it("recovers a vault, then rotates both passphrase and recovery code", async () => {
    const created = await createVault(passphrase);
    const recovered = await recoverVault(created.meta, created.recoverySecret, "recovered passphrase 2026");
    expect(recovered.meta.revision).toBe(1);
    expect(recovered.recoverySecret).not.toBe(created.recoverySecret);
    expect(recovered.key.extractable).toBe(false);
    await expect(unlockVault(recovered.meta, passphrase)).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    await expect(recoverVault(recovered.meta, created.recoverySecret, "another recovered pass 2026")).rejects.toMatchObject({ code: "RECOVERY_FAILED" });
    await expect(recoverVault(recovered.meta, recovered.recoverySecret, "another recovered pass 2026")).resolves.toMatchObject({ meta: { revision: 2 } });
  });

  it("validates every encrypted record before accepting a backup", async () => {
    const created = await createVault(passphrase);
    const encrypted = await encryptAsset(created.meta, created.key, fixtureAsset());
    const backup = await createBackup(created.meta, created.key, [encrypted]);
    expect(parseBackup(backup)).toEqual(backup);
    expect((await verifyBackup(backup, passphrase)).extractable).toBe(false);
    expect(() => parseBackup({ ...backup, records: [encrypted, encrypted] })).toThrowError(VaultError);
    await expect(verifyBackup({ ...backup, records: [{ ...encrypted, ciphertext: "AAAAAAAAAAAAAAAAAAAA" }] }, passphrase)).rejects.toMatchObject({ code: "INVALID_BACKUP" });
    await expect(verifyBackup({ ...backup, records: [] }, passphrase)).rejects.toMatchObject({ code: "INVALID_BACKUP" });
    await expect(verifyBackup({ ...backup, vault: { ...backup.vault, revision: backup.vault.revision + 1 } }, passphrase)).rejects.toMatchObject({ code: "INVALID_BACKUP" });
  });

  it("keeps legacy asset records compatible while binding portfolio v2 records to their version", async () => {
    const created = await createVault(passphrase);
    const assetRecord = await encryptAsset(created.meta, created.key, fixtureAsset());
    const portfolio = fixturePortfolio();
    const portfolioRecord = await encryptPortfolioContext(created.meta, created.key, portfolio);

    expect(assetRecord.version).toBe(1);
    expect(portfolioRecord.version).toBe(2);
    expect(JSON.stringify(portfolioRecord)).not.toContain("PRIVATE-PORTFOLIO-LABEL");
    expect(JSON.stringify(portfolioRecord)).not.toContain("123.456789");
    expect(await decryptAsset(created.meta, created.key, assetRecord)).toEqual(fixtureAsset());
    expect(await decryptPortfolioContext(created.meta, created.key, portfolioRecord)).toEqual(portfolio);
    await expect(decryptPortfolioContext(created.meta, created.key, { ...portfolioRecord, version: 1 })).rejects.toMatchObject({ code: "CORRUPT_RECORD" });

    const backup = await createBackup(created.meta, created.key, [assetRecord, portfolioRecord]);
    await expect(verifyBackup(backup, passphrase)).resolves.toMatchObject({ extractable: false });
  });

  it("preserves exact decimal strings without Number conversion", () => {
    const created = createAsset({
      name: "Exact-value card",
      assetType: "collectible",
      identifier: "PSA-123",
      lots: [{ quantity: "9007199254740993000000000000000000001.000000000000000001", unitPrice: "0.000000000000000000000000000000000001", currency: "USD", acquiredAt: "2026-08-10" }],
      notes: "exact",
    });
    expect(created.lots[0]).toMatchObject({
      quantity: "9007199254740993000000000000000000001.000000000000000001",
      unitPrice: "0.000000000000000000000000000000000001"
    });
    expect(() => createAsset({
      name: "Invalid empty quantity",
      assetType: "collectible",
      identifier: "",
      lots: [{ quantity: "", unitPrice: "1", currency: "USD", acquiredAt: "" }],
      notes: ""
    })).toThrowError(VaultError);
    expect(() => createAsset({
      name: "Invalid calendar date",
      assetType: "collectible",
      identifier: "",
      lots: [{ quantity: "1", unitPrice: "1", currency: "USD", acquiredAt: "2026-02-30" }],
      notes: ""
    })).toThrowError(VaultError);
  });

  it("turns browser quota failures into an actionable local-only message", () => {
    const message = vaultErrorMessage(new DOMException("full", "QuotaExceededError"));
    expect(message).toContain("out of storage space");
    expect(message).toContain("encrypted backup");
  });

  it("enforces an exact export-size and record-count budget before saving", async () => {
    const created = await createVault(passphrase);
    const record = await encryptAsset(created.meta, created.key, fixtureAsset());
    const exactBytes = estimateVaultBackupBytes(created.meta, [record]);
    expect(() => assertVaultCapacity(created.meta, [record], exactBytes)).not.toThrow();
    expect(() => assertVaultCapacity(created.meta, [record], exactBytes - 1)).toThrowError(VaultError);
    expect(() => assertVaultCapacity(created.meta, new Array(2_001).fill(record))).toThrowError(VaultError);
  });
});

function fixtureAsset(): VaultAsset {
  return {
    id: "2a2d9930-d937-4f3e-bda7-b0d2ddb4b644",
    name: "Vault Canary Card",
    assetType: "collectible",
    identifier: "PSA-CHAINSCOUT-42",
    lots: [{
      id: "f9c68a33-20aa-4fc7-9318-f4306a82b11c",
      quantity: "1",
      unitPrice: "1234.56",
      currency: "USD",
      acquiredAt: "2026-08-10"
    }],
    notes: "PRIVATE-NOTE-CANARY",
    photo: {
      name: "canary.png",
      mimeType: "image/png",
      size: 8,
      dataUrl: "data:image/png;base64,iVBORw0KGgo="
    },
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z"
  };
}

function fixturePortfolio(): VaultPortfolioContext {
  return createPortfolioContext({
    address: "0x1111111111111111111111111111111111111111",
    label: "PRIVATE-PORTFOLIO-LABEL",
    valuations: [{
      id: "6d35fd63-cf71-4e6c-9e85-2b31303070f0",
      assetKey: "token:0x3333333333333333333333333333333333333333",
      unitPrice: "123.456789",
      currency: "USD",
      updatedAt: "2026-08-10T12:00:00.000Z"
    }],
    latestSnapshot: null,
    receipts: [{
      id: "e3b28dc2-d696-4649-b87e-6005b044f67d",
      address: "0x1111111111111111111111111111111111111111",
      providerDestinations: ["robinhood_public_rpc", "blockscout"],
      disclosure: "Public address sent transiently; private context stays local.",
      approvedAt: "2026-08-10T12:00:00.000Z",
      outcome: "completed",
      resolvedAt: "2026-08-10T12:00:01.000Z"
    }]
  });
}
