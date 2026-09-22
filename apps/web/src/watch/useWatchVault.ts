import { useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import {
  bootstrapVault,
  createLocalVault,
  unlockLocalVault,
  saveVaultWatch,
  deleteVaultAssets,
  exportVault,
  type UnlockedVault,
} from "../vault/service";
import { requestPersistentStorage } from "../vault/db";
import { useBackupDownload } from "../vault/useBackupDownload";
import type { VaultWatch, VaultWatchCondition } from "../vault/types";
import { privateApi } from "../dashboard/http";
import { translateCurrent as t } from "../i18n/translate";
import type { TranslationKey } from "../i18n";
import { assertWatchSnapshot, captureWatch, WATCH_LIMIT } from "./model";
import { clearInboxAction, setInboxAction } from "./inbox";

export function useWatchVault() {
  const [phase, setPhase] = useState<
    "loading" | "empty" | "locked" | "unlocked"
  >("loading");
  const [watches, setWatches] = useState<VaultWatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [recovery, setRecovery] = useState("");
  const [epoch, setEpoch] = useState(0);
  const vault = useRef<UnlockedVault | null>(null);
  const generation = useRef(0),
    operation = useRef(false),
    activity = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const { download, prepare, clear } = useBackupDownload();
  const lock = useCallback(
    (notify = true) => {
      const meta = vault.current?.meta;
      generation.current++;
      controller.current?.abort();
      vault.current = null;
      setWatches([]);
      setRecovery("");
      setError("");
      setNotice(null);
      clear();
      setEpoch((value) => value + 1);
      setPhase((value) => (value === "empty" ? "empty" : "locked"));
      if (notify && meta)
        channel.current?.postMessage({ event: "lock", vaultId: meta.vaultId });
    },
    [clear],
  );

  useEffect(() => {
    let mounted = true;
    const epochRef = generation;
    activity.current = Date.now();
    const expected = generation.current;
    void bootstrapVault()
      .then((meta) => {
        if (mounted && generation.current === expected)
          setPhase(meta ? "locked" : "empty");
      })
      .catch(() => {
        if (mounted) {
          setPhase("locked");
          setError(t("watch.error.storage"));
        }
      });
    const bus =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("chainscout-vault-control-v1");
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
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) lock();
    };
    const touch = () => {
      activity.current = Date.now();
    };
    const timer = window.setInterval(() => {
      if (vault.current && Date.now() - activity.current >= 600_000) lock();
    }, 15_000);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", show);
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      mounted = false;
      epochRef.current++;
      vault.current = null;
      controller.current?.abort();
      bus?.close();
      channel.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [lock]);

  const enter = async (passphrase: string, create: boolean) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    const expected = generation.current;
    try {
      const meta = await bootstrapVault();
      if (Boolean(meta) === create) {
        setPhase(meta ? "locked" : "empty");
        throw new Error(t("watch.error.vaultChanged"));
      }
      const value = create
        ? await createLocalVault(passphrase)
        : await unlockLocalVault(meta!, passphrase);
      if (expected !== generation.current) return;
      vault.current = value;
      setWatches(value.watches ?? []);
      setPhase("unlocked");
      activity.current = Date.now();
      if ("recoverySecret" in value) setRecovery(String(value.recoverySecret));
      await requestPersistentStorage();
    } catch (cause) {
      if (expected === generation.current)
        setError(
          cause instanceof Error ? cause.message : t("watch.error.storage"),
        );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const run = async (
    task: (
      current: UnlockedVault,
      assertActive: () => void,
      signal: AbortSignal,
    ) => Promise<void>,
  ) => {
    if (operation.current || !vault.current || recovery) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice(null);
    const expected = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    const assertActive = () => {
      if (generation.current !== expected || !vault.current)
        throw new Error(t("watch.error.locked"));
    };
    try {
      await task(vault.current, assertActive, abort.signal);
    } catch (cause) {
      if (generation.current === expected) {
        if (
          cause &&
          typeof cause === "object" &&
          "code" in cause &&
          cause.code === "VAULT_CONFLICT"
        ) {
          lock(false);
          setError(t("watch.error.vaultChanged"));
        } else
          setError(
            cause instanceof Error ? cause.message : t("watch.error.refresh"),
          );
      }
    } finally {
      if (controller.current === abort) controller.current = null;
      operation.current = false;
      setBusy(false);
    }
  };
  const commit = async (
    current: UnlockedVault,
    item: VaultWatch,
    assertActive: () => void,
  ) => {
    const meta = await saveVaultWatch(current, item, assertActive);
    assertActive();
    const next = [
      item,
      ...(current.watches ?? []).filter((row) => row.id !== item.id),
    ];
    vault.current = { ...current, meta, watches: next };
    setWatches(next);
    clear();
    channel.current?.postMessage({
      event: "changed",
      vaultId: meta.vaultId,
      revision: meta.revision,
    });
  };
  const refresh = (address: string, label: string, id?: string) =>
    run(async (current, assertActive, signal) => {
      const previous = id
        ? current.watches?.find((row) => row.id === id)
        : undefined;
      if (id && !previous) throw new Error(t("watch.error.vaultChanged"));
      if (
        !previous &&
        ((current.watches?.length ?? 0) >= WATCH_LIMIT ||
          current.watches?.some((row) => row.address === address))
      )
        throw new Error(t("watch.error.duplicateOrLimit"));
      assertActive();
      const snapshot = await privateApi<PortfolioSnapshot>(
        "/v1/private/watch/snapshot",
        { address },
        signal,
      );
      assertActive();
      assertWatchSnapshot(snapshot, address);
      await commit(
        current,
        captureWatch(snapshot, label, previous),
        assertActive,
      );
      setNotice(previous ? "watch.savedRefresh" : "watch.savedBaseline");
    });
  const rename = (id: string, label: string) =>
    run(async (current, assertActive) => {
      const item = current.watches?.find((row) => row.id === id);
      if (!item || !label.trim()) throw new Error(t("watch.error.label"));
      await commit(
        current,
        {
          ...item,
          label: label.trim().slice(0, 80),
          updatedAt: new Date().toISOString(),
        },
        assertActive,
      );
      setNotice("watch.renamed");
    });
  const remove = (id: string) =>
    run(async (current, assertActive) => {
      if (!current.watches?.some((row) => row.id === id))
        throw new Error(t("watch.error.vaultChanged"));
      const meta = await deleteVaultAssets(current, [id], assertActive);
      assertActive();
      const next = current.watches.filter((row) => row.id !== id);
      vault.current = { ...current, meta, watches: next };
      setWatches(next);
      clear();
      channel.current?.postMessage({
        event: "changed",
        vaultId: meta.vaultId,
        revision: meta.revision,
      });
      setNotice("watch.removed");
    });
  const updateWatch = (id: string, update: (watch: VaultWatch) => VaultWatch) =>
    run(async (current, assertActive) => {
      const item = current.watches?.find((row) => row.id === id);
      if (!item) throw new Error(t("watch.error.vaultChanged"));
      await commit(current, update(item), assertActive);
    });
  const acknowledge = (id: string, evidenceId: string) =>
    updateWatch(id, (watch) => setInboxAction(watch, evidenceId, { acknowledgedAt: new Date().toISOString() }));
  const snooze = (id: string, evidenceId: string, until: string) =>
    updateWatch(id, (watch) => setInboxAction(watch, evidenceId, { snoozedUntil: until }));
  const restore = (id: string, evidenceId: string) =>
    updateWatch(id, (watch) => clearInboxAction(watch, evidenceId));
  const saveConditions = (id: string, conditions: VaultWatchCondition[]) =>
    updateWatch(id, (watch) => ({ ...watch, conditions, updatedAt: new Date().toISOString() }));
  const backup = () =>
    run(async (current, assertActive) => {
      const value = await exportVault(current);
      assertActive();
      prepare(value);
      setNotice("watch.backupReady");
    });
  return {
    phase,
    watches,
    busy,
    error,
    notice,
    recovery,
    epoch,
    enter,
    lock,
    refresh,
    rename,
    remove,
    acknowledge,
    snooze,
    restore,
    saveConditions,
    backup,
    download,
    acknowledgeRecovery: () => setRecovery(""),
  };
}
