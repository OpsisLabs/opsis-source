import { useCallback, useEffect, useRef, useState } from "react";
import { bootstrapVault, unlockLocalVault } from "../vault/service";
import {
  extractImportCandidates,
  type ImportCandidate,
  type ManualEntry,
} from "./import";
import { translateCurrent as t } from "../i18n/translate";

export type StressVaultPhase = "loading" | "empty" | "locked" | "unlocked";

// Read-only Vault chooser. The decrypted key is dropped the moment candidate
// values are extracted, so only the selected reference values can live on past
// unlock. Those values are cleared on hide, page exit, idle, or any Vault
// control event from this or another tab. Nothing is ever persisted.
export function useStressVaultImport(onLock: () => void) {
  const [phase, setPhase] = useState<StressVaultPhase>("loading");
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [manual, setManual] = useState<Record<string, ManualEntry>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  const operation = useRef(false);
  const activity = useRef(0);
  const privateActive = useRef(false);
  const unlocked = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const onLockRef = useRef(onLock);

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const release = useCallback(() => {
    generation.current += 1;
    unlocked.current = false;
    setCandidates([]);
    setManual({});
    setError("");
    setRevision((value) => value + 1);
  }, []);

  const settle = useCallback(
    (next: StressVaultPhase) => setPhase(next),
    [],
  );

  const panic = useCallback(() => {
    release();
    privateActive.current = false;
    onLockRef.current();
    void bootstrapVault()
      .then((meta) => {
        if (mounted.current) settle(meta ? "locked" : "empty");
      })
      .catch(() => {
        if (mounted.current) settle("locked");
      });
  }, [release, settle]);

  useEffect(() => {
    mounted.current = true;
    const expected = generation.current;
    activity.current = Date.now();
    void bootstrapVault()
      .then((meta) => {
        if (mounted.current && generation.current === expected)
          settle(meta ? "locked" : "empty");
      })
      .catch(() => {
        if (mounted.current) {
          settle("locked");
          setError(t("stress.import.error.storage"));
        }
      });
    const bus =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("opsis-vault-control-v1");
    channel.current = bus;
    if (bus)
      bus.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data as { event?: string } | null;
        if (
          data &&
          ["lock", "changed", "deleting", "deleted"].includes(data.event ?? "")
        )
          panic();
      };
    const hide = () => {
      if (document.hidden) panic();
    };
    const leave = () => panic();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) panic();
    };
    const touch = () => {
      activity.current = Date.now();
    };
    const timer = window.setInterval(() => {
      if (
        (privateActive.current || unlocked.current) &&
        Date.now() - activity.current >= 600_000
      )
        panic();
    }, 15_000);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", show);
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      mounted.current = false;
      generation.current += 1;
      privateActive.current = false;
      unlocked.current = false;
      bus?.close();
      channel.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [panic, settle]);

  const unlock = async (passphrase: string) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    const expected = generation.current;
    try {
      const meta = await bootstrapVault();
      if (!mounted.current || generation.current !== expected) return;
      if (!meta) {
        settle("empty");
        throw new Error(t("stress.import.error.missing"));
      }
      const value = await unlockLocalVault(meta, passphrase);
      if (!mounted.current || generation.current !== expected) return;
      const extracted = extractImportCandidates(
        value.assets ?? [],
        value.portfolios ?? [],
      );
      setCandidates(extracted);
      setManual({});
      unlocked.current = true;
      settle("unlocked");
      activity.current = Date.now();
    } catch (cause) {
      if (mounted.current && generation.current === expected)
        setError(
          cause instanceof Error
            ? cause.message
            : t("stress.import.error.unlock"),
        );
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const setManualValue = (id: string, value: string) =>
    setManual((current) => ({
      ...current,
      [id]: { value, date: current[id]?.date ?? "" },
    }));

  const setManualDate = (id: string, date: string) =>
    setManual((current) => ({
      ...current,
      [id]: { value: current[id]?.value ?? "", date },
    }));

  // Keep the selected/imported values active so hide/idle/cross-tab still clear
  // them after the chooser itself has released its decrypted candidates.
  const markImported = () => {
    privateActive.current = true;
    activity.current = Date.now();
  };

  const close = () => {
    release();
    settle("locked");
  };

  const clearPrivateData = () => {
    privateActive.current = false;
    release();
    onLockRef.current();
    settle("locked");
  };

  return {
    phase,
    candidates,
    manual,
    error,
    busy,
    revision,
    unlock,
    close,
    panic,
    markImported,
    clearPrivateData,
    setManualValue,
    setManualDate,
  };
}
