let pendingPath = "";
const listeners = new Set<() => void>();
export function beginNavigation(path: string) {
  pendingPath = path;
  listeners.forEach((notify) => notify());
}
export function finishNavigation() {
  pendingPath = "";
  listeners.forEach((notify) => notify());
}
export const navigationSnapshot = () => pendingPath;
export function subscribeNavigation(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

function chunk<T>(path: string, importer: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  let loaded = false;
  const prefetch = () => {
    promise ??= importer().then((module) => {
      loaded = true;
      return module;
    }).catch((error: unknown) => {
      promise = undefined;
      throw error;
    });
    return promise;
  };
  return { path, prefetch, load: () => {
    // Lazy render can start after a programmatic or front-door navigation.
    // Notify outside render so the retained workspace can show progress too.
    if (!loaded) queueMicrotask(() => beginNavigation(path));
    return prefetch();
  } };
}
export const chunks = {
  Lab: chunk("/lab", () => import("./Lab")),
  SituationRoom: chunk("/research/events", () => import("../situation/SituationRoom")),
  Research: chunk("/research", () => import("./Research")),
  TradeCheck: chunk("/check", () => import("./TradeCheck")),
  Watch: chunk("/watch", () => import("../watch/WatchPage")),
  Saved: chunk("/saved", () => import("./SavedWorkspace")),
  Rwa: chunk("/rwa", () => import("../pages/RwaVerify")),
  Trades: chunk("/biggest-trades", () => import("../trades/BiggestTrades")),
  Explorer: chunk("/research/details", () => import("../pages/PrivateExplorer")),
  Swap: chunk("/swap", () => import("../pages/SwapPreview")),
  Privacy: chunk("/privacy", () => import("../pages/Legal").then((m) => ({ default: m.PrivacyPage }))),
  Simulator: chunk("/simulate", () => import("../simulator/TradeSimulator")),
  Stress: chunk("/stress-test", () => import("../stress/StressTest")),
  Terms: chunk("/terms", () => import("../pages/Legal").then((m) => ({ default: m.TermsPage }))),
  Guide: chunk("/guide", () => import("./Guide")),
  Community: chunk("/community", () => import("./Community")),
  PerpScenario: chunk("/check/perp-scenario", () => import("./PerpScenario")),
};
export function prefetchRoute(path: string) {
  const route = Object.values(chunks).find((entry) => entry.path === path);
  void route?.prefetch().catch(() => { /* Navigation can retry a failed prefetch. */ });
}
