import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { useI18n } from "../i18n";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { beginNavigation, chunks, finishNavigation, navigationSnapshot, prefetchRoute, subscribeNavigation } from "./route-chunks";
import { landingTools, researchToolPaths, routeName, tradeToolPaths } from "./shell-model";

export default function NavigationFeedback({ capabilities }: { capabilities: Capabilities }) {
  const path = useSyncExternalStore(subscribeNavigation, navigationSnapshot);
  const { locale } = useI18n();
  const c = useCopy();
  useEffect(() => {
    const destination = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) return null;
      const url = new URL(link.href);
      return url.origin === window.location.origin ? url : null;
    };
    const warm = (event: Event) => {
      const url = destination(event);
      if (url) prefetchRoute(url.pathname);
    };
    const navigate = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const url = destination(event);
      if (url && (url.pathname !== window.location.pathname || url.search !== window.location.search)) beginNavigation(url.pathname);
    };
    document.addEventListener("pointerenter", warm, true);
    document.addEventListener("focusin", warm);
    document.addEventListener("touchstart", warm, { passive: true });
    document.addEventListener("click", navigate, true);
    const allowed = new Set([
      ...researchToolPaths(capabilities), ...tradeToolPaths(capabilities),
      ...landingTools(capabilities).map((tool) => ({ quant: "/lab", world: "/research/events", check: "/check" }[tool] ?? `/${tool}`)),
      "/privacy", "/terms", "/guide", "/community",
    ]);
    const remaining = Object.values(chunks).filter((entry) => allowed.has(entry.path));
    let idle = 0;
    let timer = 0;
    let cancelled = false;
    const schedule = () => {
      if (!remaining.length || cancelled) return;
      if (window.requestIdleCallback) idle = window.requestIdleCallback(warmNext, { timeout: 2000 });
      else timer = window.setTimeout(warmNext, 1000);
    };
    const warmNext = () => {
      if (cancelled) return;
      const next = remaining.shift();
      // One chunk per idle interval keeps interaction ahead of prefetch work.
      void next?.prefetch().catch(() => {}).finally(schedule);
    };
    schedule();
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(idle);
      clearTimeout(timer);
      document.removeEventListener("pointerenter", warm, true);
      document.removeEventListener("focusin", warm);
      document.removeEventListener("touchstart", warm);
      document.removeEventListener("click", navigate, true);
      finishNavigation();
    };
  }, [capabilities]);
  return (
    <div className="opsis-navigation-progress" data-pending={Boolean(path)} data-testid="opsis-navigation-progress">
      {path && <span className="opsis-progress-line" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {path ? c(`Loading ${routeName(path, locale)}…`, `正在加载${routeName(path, locale)}…`) : ""}
      </span>
    </div>
  );
}

/** Inside Suspense: completion and heading focus wait for the route to commit. */
export function RouteReady() {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => { finishNavigation(); }, [pathname, search]);
  useEffect(() => {
    if (pathname === "/") {
      // Focusing the frame resets focus inside it, so leave it alone when the
      // film has already returned focus to the control that opened the tool.
      const film = document.querySelector<HTMLIFrameElement>(".opsis-original-film");
      if (film && document.activeElement !== film) film.focus({ preventScroll: true });
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const surface = document.getElementById("opsis-content");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      surface?.animate?.(
        [{ opacity: 0.55 }, { opacity: 1 }],
        { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
    }
    const heading = document.querySelector<HTMLElement>("#opsis-content h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    } else document.getElementById("opsis-content")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

// The native shell is hidden while the front door is visible. Keep first-tool
// navigation feedback above the frame until the router commits the workspace.
export function FrontDoorProgress() {
  const path = useSyncExternalStore(subscribeNavigation, navigationSnapshot);
  const { pathname } = useLocation();
  const { locale } = useI18n();
  const c = useCopy();
  if (pathname !== "/" || !path) return null;
  return <div className="opsis-front-door-progress" aria-live="polite">
    <span aria-hidden="true" />
    <span className="sr-only">{c(`Loading ${routeName(path, locale)}…`, `正在加载${routeName(path, locale)}…`)}</span>
  </div>;
}
