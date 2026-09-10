import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapVault,
  unlockLocalVault,
  saveVaultConversation,
  exportVault,
  deleteVaultAssets,
  type UnlockedVault,
} from "../vault/service";
import { requestPersistentStorage } from "../vault/db";
import type { VaultConversation, VaultConversationTurn } from "../vault/types";
import { useBackupDownload } from "../vault/useBackupDownload";
import { translateCurrent } from "../i18n/translate";

// The key lives only in this mounted page. No localStorage flag or key permits
// automatic decryption after restarting the browser.
export function useLocalHistory(onLock: () => void) {
  const { download, prepare: prepareDownload, clear: clearDownload } = useBackupDownload();
  const [phase, setPhase] = useState<
    "loading" | "empty" | "locked" | "unlocked"
  >("loading");
  const [conversations, setConversations] = useState<VaultConversation[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockEpoch, setLockEpoch] = useState(0);
  const unlocked = useRef<UnlockedVault | null>(null);
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const onLockRef = useRef(onLock);
  const operation = useRef(false);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const lock = useCallback((notify = true) => {
    clearDownload();
    generation.current++;
    setLockEpoch((value) => value + 1);
    const meta = unlocked.current?.meta;
    unlocked.current = null;
    setConversations([]);
    setPhase((current) => (current === "empty" ? "empty" : "locked"));
    setNotice(translateCurrent("cloud.history.notice.locked"));
    setError("");
    onLockRef.current();
    if (notify && meta)
      channel.current?.postMessage({ event: "lock", vaultId: meta.vaultId });
  }, [clearDownload]);

  useEffect(() => {
    let active = true;
    const epoch = generation;
    bootstrapVault()
      .then((meta) => {
        if (active) setPhase(meta ? "locked" : "empty");
      })
      .catch(() => {
        if (active) {
          setPhase("locked");
          setError(
            translateCurrent("cloud.history.error.unavailable"),
          );
        }
      });
    const bus =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("chainscout-vault-control-v1")
        : null;
    channel.current = bus;
    if (bus)
      bus.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data as { event?: string } | null;
        if (
          data &&
          ["lock", "changed", "deleting", "deleted"].includes(data.event ?? "")
        )
          lock(false);
      };
    const hide = () => {
      if (document.hidden) lock();
    };
    const leave = () => lock();
    const show = (event: PageTransitionEvent) => { if (event.persisted) lock(); };
    let lastActivity = Date.now();
    const activity = () => {
      lastActivity = Date.now();
    };
    const timer = window.setInterval(() => {
      if (unlocked.current && Date.now() - lastActivity >= 600_000) lock();
    }, 15_000);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", show);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    return () => {
      active = false;
      epoch.current++;
      unlocked.current = null;
      bus?.close();
      channel.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, [lock]);

  const unlock = async (passphrase: string) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    const expected = generation.current;
    try {
      const meta = await bootstrapVault();
      if (!meta) {
        setPhase("empty");
        throw new Error(
          translateCurrent("cloud.history.error.createFirst"),
        );
      }
      const value = await unlockLocalVault(meta, passphrase);
      if (generation.current !== expected) return;
      unlocked.current = value;
      setConversations(value.conversations ?? []);
      setPhase("unlocked");
      setNotice(
        translateCurrent("cloud.history.notice.autosave"),
      );
      // Denial does not prevent honest best-effort storage, nor make a guarantee.
      await requestPersistentStorage();
    } catch (cause) {
      if (generation.current === expected)
        setError(
          cause instanceof Error
            ? cause.message
            : translateCurrent("cloud.history.error.unlock"),
        );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const save = async (
    turn: VaultConversationTurn,
    id: string | null,
    expected: number,
  ): Promise<string> => {
    if (operation.current)
      throw new Error(
        translateCurrent("cloud.history.error.operationRunning"),
      );
    const assertActive = () => {
      if (generation.current !== expected || !unlocked.current)
        throw new Error(
          translateCurrent("cloud.history.error.lockedBeforeSave"),
        );
    };
    assertActive();
    operation.current = true;
    try {
      const current = unlocked.current!;
      const previous = id
        ? current.conversations?.find((item) => item.id === id)
        : undefined;
      const conversation: VaultConversation = {
        kind: "conversation",
        id: previous?.id ?? crypto.randomUUID(),
        title: previous?.title ?? (turn.question || turn.entity).slice(0, 120),
        createdAt: previous?.createdAt ?? turn.savedAt,
        updatedAt: turn.savedAt,
        turns: [...(previous?.turns ?? []), turn],
      };
      const meta = await saveVaultConversation(
        current,
        conversation,
        assertActive,
      );
      assertActive();
      const next = [
        conversation,
        ...(current.conversations ?? []).filter(
          (item) => item.id !== conversation.id,
        ),
      ];
      unlocked.current = { ...current, meta, conversations: next };
      setConversations(next);
      setNotice(translateCurrent("cloud.history.notice.saved"));
      channel.current?.postMessage({
        event: "changed",
        vaultId: meta.vaultId,
        revision: meta.revision,
      });
      return conversation.id;
    } finally {
      operation.current = false;
    }
  };

  const backup = async () => {
    if (operation.current || !unlocked.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    const expected = generation.current;
    try {
      const value = await exportVault(unlocked.current);
      if (generation.current !== expected) return;
      prepareDownload(value);
      setNotice(
        translateCurrent("cloud.history.notice.backupPrepared"),
      );
    } catch {
      if (generation.current === expected)
        setError(
          translateCurrent("cloud.history.error.backup"),
        );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (operation.current || !unlocked.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    const expected = generation.current;
    const assertActive = () => {
      if (generation.current !== expected || !unlocked.current)
        throw new Error(translateCurrent("cloud.history.error.changed"));
    };
    try {
      const current = unlocked.current;
      const meta = await deleteVaultAssets(current, [id], assertActive);
      assertActive();
      const next = (current.conversations ?? []).filter(
        (item) => item.id !== id,
      );
      unlocked.current = { ...current, meta, conversations: next };
      setConversations(next);
      channel.current?.postMessage({
        event: "changed",
        vaultId: meta.vaultId,
        revision: meta.revision,
      });
      setNotice(
        translateCurrent("cloud.history.notice.deleted"),
      );
    } catch {
      if (generation.current === expected)
        setError(translateCurrent("cloud.history.error.delete"));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return {
    phase,
    conversations,
    error,
    notice,
    busy,
    generation,
    lockEpoch,
    unlock,
    lock,
    save,
    backup,
    download,
    remove,
  };
}
