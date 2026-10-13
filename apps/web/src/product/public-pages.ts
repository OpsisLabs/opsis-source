/** Always-available public pages: the only ones the sitemap lists and a search engine may index. */
export const PUBLIC_PAGE_PATHS = [
  "/",
  "/research",
  "/check",
  "/check/perp-scenario",
  "/watch",
  "/lab",
  "/guide",
  "/community",
  "/status",
  "/privacy",
  "/terms",
] as const;

/**
 * Search indexing is switched on per build with VITE_OPSIS_INDEXABLE=true, so a
 * preview or a temporary host stays out of search results by default. Even then
 * only the pages above are indexable; saved data, results and tools behind a
 * capability are not.
 */
export function robotsDirective(pathname: string, indexableSetting: string | undefined): "index, follow" | "noindex, nofollow" {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return indexableSetting === "true" && (PUBLIC_PAGE_PATHS as readonly string[]).includes(path)
    ? "index, follow"
    : "noindex, nofollow";
}
