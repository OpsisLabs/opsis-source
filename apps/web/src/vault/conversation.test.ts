import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalVault,
  unlockLocalVault,
  saveVaultConversation,
  exportVault,
  importVaultBackup,
  saveVaultAsset,
  recoverVaultBackup,
} from "./service";
import { deleteLocalVault, listEncryptedRecords, readVaultMeta } from "./db";
import {
  decryptConversation,
  encryptConversation,
  validateConversation,
  parseBackup,
} from "./crypto";
import type { VaultConversation } from "./types";

const passphrase = "test-only-local-chat-passphrase";
function fixture(): VaultConversation {
  const now = new Date().toISOString();
  return {
    kind: "conversation",
    id: crypto.randomUUID(),
    title: "LOCAL-CHAT-PRIVATE-TITLE",
    createdAt: now,
    updatedAt: now,
    turns: [
      {
        question: "SECRET-QUESTION-CANARY",
        entity: `0x${"1".repeat(40)}`,
        answer: "PRIVATE-ANSWER-CANARY",
        bullets: ["Known coverage only."],
        savedAt: now,
        sources: [
          { label: "RPC", url: "https://example.com/evidence", fetchedAt: now },
        ],
      },
    ],
  };
}

describe("encrypted local conversation retention", () => {
  beforeEach(async () => {
    await deleteLocalVault();
  });
  it("persists ciphertext, reopens with the same passphrase, and preserves existing asset records", async () => {
    let vault = await createLocalVault(passphrase);
    const asset = await saveVaultAsset(vault, {
      name: "Existing asset",
      assetType: "other",
      identifier: "",
      notes: "Keep me",
      lots: [
        {
          quantity: "1",
          unitPrice: "0",
          currency: "USD",
          acquiredAt: "2026-09-06",
        },
      ],
    });
    vault = { ...vault, meta: asset.meta };
    const conversation = fixture();
    const meta = await saveVaultConversation(vault, conversation);
    const serialized = JSON.stringify(await listEncryptedRecords());
    for (const canary of [
      conversation.title,
      conversation.turns[0].question,
      conversation.turns[0].answer,
    ])
      expect(serialized).not.toContain(canary);
    const reopened = await unlockLocalVault(meta, passphrase);
    expect(reopened.conversations).toEqual([conversation]);
    expect(reopened.assets[0].name).toBe("Existing asset");
    await expect(
      unlockLocalVault(meta, "wrong-passphrase-test-only"),
    ).rejects.toBeTruthy();
  });
  it("exports, deletes, restores, and recovers chats through the authenticated Vault backup", async () => {
    const vault = await createLocalVault(passphrase);
    const conversation = fixture();
    const meta = await saveVaultConversation(vault, conversation);
    const backup = parseBackup(await exportVault({ ...vault, meta }));
    expect(JSON.stringify(backup)).not.toContain("PRIVATE-ANSWER-CANARY");
    await deleteLocalVault();
    const restored = await importVaultBackup(backup, passphrase, null);
    expect(restored.conversations).toEqual([conversation]);
    await deleteLocalVault();
    const recovered = await recoverVaultBackup(
      backup,
      vault.recoverySecret,
      "replacement-test-passphrase",
      null,
    );
    expect(recovered.conversations).toEqual([conversation]);
    const reopened = await unlockLocalVault(
      recovered.meta,
      "replacement-test-passphrase",
    );
    expect(reopened.conversations).toEqual([conversation]);
  });
  it("rejects damaged or transplanted ciphertext and unknown record versions", async () => {
    const vault = await createLocalVault(passphrase);
    const record = await encryptConversation(vault.meta, vault.key, fixture());
    await expect(
      decryptConversation(vault.meta, vault.key, {
        ...record,
        id: crypto.randomUUID(),
      }),
    ).rejects.toBeTruthy();
    await expect(
      decryptConversation(vault.meta, vault.key, {
        ...record,
        ciphertext: "AAAA" + record.ciphertext.slice(4),
      }),
    ).rejects.toBeTruthy();
    const backup = await exportVault(vault);
    expect(() =>
      parseBackup({ ...backup, records: [{ ...record, version: 99 }] }),
    ).toThrow();
  });
  it("does not overwrite a newer revision or commit after locking", async () => {
    const vault = await createLocalVault(passphrase);
    const conversation = fixture();
    const meta = await saveVaultConversation(vault, conversation);
    await expect(saveVaultConversation(vault, fixture())).rejects.toMatchObject(
      { code: "VAULT_CONFLICT" },
    );
    await expect(
      saveVaultConversation({ ...vault, meta }, fixture(), () => {
        throw new Error("locked");
      }),
    ).rejects.toThrow("locked");
    expect((await listEncryptedRecords()).length).toBe(1);
    expect((await readVaultMeta())?.revision).toBe(meta.revision);
  });
  it("fails closed on hostile links, unbounded histories, and malformed plaintext", () => {
    const value = fixture();
    expect(() =>
      validateConversation({
        ...value,
        turns: Array(101).fill(value.turns[0]),
      }),
    ).toThrow();
    expect(() =>
      validateConversation({
        ...value,
        turns: [
          {
            ...value.turns[0],
            sources: [
              {
                label: "bad",
                url: "javascript:alert(1)",
                fetchedAt: value.updatedAt,
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateConversation({
        ...value,
        turns: [{ ...value.turns[0], entity: "not-an-address" }],
      }),
    ).toThrow();
  });
  it("rejects an old unlocked tab after replacing the Vault with the same revision", async () => {
    const oldVault = await createLocalVault(passphrase);
    await deleteLocalVault();
    const replacement = await createLocalVault(
      "replacement-only-test-passphrase",
    );
    await expect(
      saveVaultConversation(oldVault, fixture()),
    ).rejects.toMatchObject({ code: "VAULT_CONFLICT" });
    expect((await readVaultMeta())?.vaultId).toBe(replacement.meta.vaultId);
    expect(await listEncryptedRecords()).toEqual([]);
  });
});

it("round-trips optional Opsis routing context in ciphertext and rejects unsupported context", async () => {
  await deleteLocalVault();
  const vault = await createLocalVault(passphrase);
  const report = fixture();
  report.turns[0].opsis = { workspace: "check", token: true, chainId: 4663 };
  const encrypted = await encryptConversation(vault.meta, vault.key, report);
  expect(await decryptConversation(vault.meta, vault.key, encrypted)).toEqual(report);
  for (const invalid of [null, { workspace: "trade", token: true, chainId: 4663 }, { workspace: "check", token: true, chainId: 1 }, { workspace: "check", token: "true", chainId: 4663 }]) {
    expect(() => validateConversation({ ...report, turns: [{ ...report.turns[0], opsis: invalid }] })).toThrow();
  }
});
