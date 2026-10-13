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

/**
 * Fetches again, past the cache, the code and styles this page tried to load.
 * WebKit keeps a failed download and reuses it after a reload, so without this
 * a reload on Safari repeats the failure even when the connection is back. The
 * wait is bounded so a connection that is still down does not hold the reload.
 */
export async function refetchPageCode(
  links: Iterable<{ href: string }> = document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"], link[rel="stylesheet"]'),
  origin: string = window.location.origin,
  fetcher: (url: string, init: RequestInit) => Promise<unknown> = (url, init) => fetch(url, init),
  limitMs = 4_000,
): Promise<void> {
  const urls = [...new Set([...links].map((link) => link.href))].filter((href) => href.startsWith(`${origin}/`)).slice(0, 80);
  if (urls.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(urls.map((url) => fetcher(url, { cache: "reload", credentials: "same-origin" }))),
    new Promise((resolve) => { timer = setTimeout(resolve, limitMs); }),
  ]);
  clearTimeout(timer);
}

/** Reloads now that the browser has been asked for fresh copies of the page's code. */
export function reloadWithFreshCode(): void {
  void refetchPageCode().catch(() => undefined).finally(() => window.location.reload());
}

export function reloadAfterCodeFailure(): void {
  const state = codeReloadState(window.history.state, Date.now());
  if (!state) return;
  window.history.replaceState(state, "");
  reloadWithFreshCode();
}
