import { useEffect, useSyncExternalStore } from "react";

type VaultVisualizations = typeof import("./VaultVisualizations");

let loaded: VaultVisualizations | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Starts loading the chart code once; a failed load can be retried. */
export function preloadVaultVisualizations(): Promise<void> {
  loading ??= import("./VaultVisualizations").then(
    (module) => {
      loaded = module;
      listeners.forEach((notify) => notify());
    },
    () => {
      loading = undefined;
    },
  );
  return loading;
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/**
 * The chart components once their code has loaded, otherwise undefined.
 *
 * Call it in a component that mounts before the charts are needed (the page,
 * before a Vault is unlocked) so the charts render in the same commit as the
 * data. A chart revealed later pushes the page down under the pointer.
 */
export function useVaultVisualizations(): VaultVisualizations | undefined {
  useEffect(() => {
    void preloadVaultVisualizations();
  }, []);
  return useSyncExternalStore(subscribe, () => loaded, () => loaded);
}
