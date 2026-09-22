import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalVault,
  saveVaultWatch,
  saveVaultAsset,
  unlockLocalVault,
  exportVault,
  importVaultBackup,
  recoverVaultBackup,
  deleteVaultAssets,
} from "../vault/service";
import { deleteLocalVault, listEncryptedRecords } from "../vault/db";
import {
  decryptWatch,
  encryptWatch,
  parseBackup,
  validateWatch,
} from "../vault/crypto";
import { captureWatch } from "./model";
import { watchFixture } from "./fixture";
const passphrase = "watch-test-only-passphrase";

describe("encrypted Scout Watch lifecycle", () => {
  beforeEach(async () => {
    await deleteLocalVault();
  });
  it("persists watches encrypted beside existing assets and reopens with the same passphrase", async () => {
    const created = await createLocalVault(passphrase);
    const saved = await saveVaultAsset(created, {
      name: "Existing asset",
      assetType: "other",
      identifier: "",
      notes: "untouched",
      lots: [
        {
          quantity: "1",
          unitPrice: "0",
          currency: "USD",
          acquiredAt: "2026-09-10",
        },
      ],
    });
    const vault = { ...created, meta: saved.meta };
    const watch = {
      ...captureWatch(watchFixture(), "私密标签 WATCH-CANARY"),
      conditions: [
        {
          id: crypto.randomUUID(),
          kind: "balance-change" as const,
          assetKey: "native",
          direction: "increase" as const,
          threshold: "71.12501",
          unit: "ETH",
          decimals: 18,
          createdAt: new Date().toISOString(),
        },
      ],
      inboxActions: [
        {
          evidenceId: "PRIVATE-INBOX-EVIDENCE",
          acknowledgedAt: new Date().toISOString(),
        },
      ],
    };
    const meta = await saveVaultWatch(vault, watch);
    const ciphertext = JSON.stringify(await listEncryptedRecords());
    expect(ciphertext).not.toContain(watch.address);
    expect(ciphertext).not.toContain(watch.label);
    expect(ciphertext).not.toContain("71.12501");
    expect(ciphertext).not.toContain("PRIVATE-INBOX-EVIDENCE");
    const reopened = await unlockLocalVault(meta, passphrase);
    expect(reopened.watches).toEqual([watch]);
    expect(reopened.assets[0].name).toBe("Existing asset");
    const backup = parseBackup(await exportVault(reopened));
    await deleteLocalVault();
    const restored = await importVaultBackup(backup, passphrase, null);
    expect(restored.watches).toEqual([watch]);
    const nextMeta = await deleteVaultAssets(restored, [watch.id]);
    const deleted = await unlockLocalVault(nextMeta, passphrase);
    expect(deleted.watches).toEqual([]);
    expect(deleted.assets).toHaveLength(1);
    await deleteLocalVault();
    const recovered = await recoverVaultBackup(
      backup,
      created.recoverySecret,
      "replacement-watch-passphrase",
      null,
    );
    expect(recovered.watches).toEqual([watch]);
  });
  it("rejects stale revisions, writes after lock, duplicate addresses and excessive watches", async () => {
    const vault = await createLocalVault(passphrase),
      watch = captureWatch(watchFixture(), "Private label");
    const meta = await saveVaultWatch(vault, watch);
    await expect(saveVaultWatch(vault, watch)).rejects.toMatchObject({
      code: "VAULT_CONFLICT",
    });
    const current = { ...vault, meta, watches: [watch] };
    await expect(
      saveVaultWatch(current, { ...watch, id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "INVALID_WATCH" });
    await expect(
      saveVaultWatch(current, watch, () => {
        throw Error("locked");
      }),
    ).rejects.toThrow("locked");
    const extra = {
      ...watch,
      id: crypto.randomUUID(),
      address: `0x${"2".repeat(40)}`,
      snapshots: watch.snapshots.map((s) => ({
        ...s,
        address: `0x${"2".repeat(40)}`,
      })),
    };
    await expect(
      saveVaultWatch({ ...current, watches: Array(10).fill(watch) }, extra),
    ).rejects.toThrow();
    expect(await listEncryptedRecords()).toHaveLength(1);
  });
  it("authenticates record ID/version and fails closed on malformed or overlong history", async () => {
    const vault = await createLocalVault(passphrase),
      watch = captureWatch(watchFixture(), "Private label");
    const encrypted = await encryptWatch(vault.meta, vault.key, watch);
    expect(encrypted.version).toBe(6);
    await expect(
      decryptWatch(vault.meta, vault.key, {
        ...encrypted,
        id: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      decryptWatch(vault.meta, vault.key, {
        ...encrypted,
        ciphertext: "AAAA" + encrypted.ciphertext.slice(4),
      }),
    ).rejects.toThrow();
    expect(() =>
      validateWatch({ ...watch, snapshots: Array(4).fill(watch.snapshots[0]) }),
    ).toThrow();
    expect(() =>
      validateWatch({
        ...watch,
        snapshots: [watch.snapshots[0], watch.snapshots[0]],
      }),
    ).toThrow();
    expect(() => validateWatch({ ...watch, label: "x".repeat(81) })).toThrow();
    const invalid = watchFixture();
    invalid.tokens[0].rawBalance = "0";
    expect(() => validateWatch({ ...watch, snapshots: [invalid] })).toThrow();
    const backup = await exportVault(vault);
    expect(() =>
      parseBackup({ ...backup, records: [{ ...encrypted, version: 99 }] }),
    ).toThrow();
  });
});
