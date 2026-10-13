const reloadMarker = "opsisCodeReloadAt";
const reloadWindow = 30_000;

export function isLoadFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error) || typeof error.message !== "string") return false;
  return /^(?:Failed to fetch dynamically imported module(?::|$)|Importing a module script failed[.]?$|error loading dynamically imported module(?::|$)|Unable to preload CSS for\b)/i.test(error.message);
}

/** A null result means this history entry was reloaded recently. */
export function codeReloadState(state: unknown, now: number): Record<string, unknown> | null {
  const previous = state && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown> : {};
  const marker = previous[reloadMarker];
  if (typeof marker === "number" && Number.isFinite(marker) && marker >= 0 && now - marker >= 0 && now - marker < reloadWindow) return null;
  return { ...previous, [reloadMarker]: now };
}

export function reloadAfterCodeFailure(): void {
  const state = codeReloadState(window.history.state, Date.now());
  if (!state) return;
  window.history.replaceState(state, "");
  window.location.reload();
}

type RecoveryHandler = { shell: boolean; recover: () => void };
const handlers = new Set<RecoveryHandler>();

function onPreloadError(event: Event) {
  event.preventDefault();
  // Route recovery owns failures once the shell has mounted, retaining its chrome.
  const handler = [...handlers].find((entry) => entry.shell) ?? [...handlers][0];
  handler?.recover();
}

export function listenForPreloadError(handler: RecoveryHandler): () => void {
  if (handlers.size === 0) window.addEventListener("vite:preloadError", onPreloadError);
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) window.removeEventListener("vite:preloadError", onPreloadError);
  };
}
