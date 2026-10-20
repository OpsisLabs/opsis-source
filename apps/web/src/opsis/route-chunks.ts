import { importPage } from "../product/page-imports";

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
  Lab: chunk("/lab", () => importPage("/src/opsis/Lab.tsx", () => import("./Lab"))),
  SituationRoom: chunk("/research/events", () => importPage("/src/situation/SituationRoom.tsx", () => import("../situation/SituationRoom"))),
  Research: chunk("/research", () => importPage("/src/opsis/Research.tsx", () => import("./Research"))),
  TradeCheck: chunk("/check", () => importPage("/src/opsis/TradeCheck.tsx", () => import("./TradeCheck"))),
  Watch: chunk("/watch", () => importPage("/src/watch/WatchPage.tsx", () => import("../watch/WatchPage"))),
  Saved: chunk("/saved", () => importPage("/src/opsis/SavedWorkspace.tsx", () => import("./SavedWorkspace"))),
  Rwa: chunk("/rwa", () => importPage("/src/pages/StockTokenCheck.tsx", () => import("../pages/StockTokenCheck"))),
  Trades: chunk("/biggest-trades", () => importPage("/src/trades/BiggestTrades.tsx", () => import("../trades/BiggestTrades"))),
  Explorer: chunk("/research/details", () => importPage("/src/pages/PrivateExplorer.tsx", () => import("../pages/PrivateExplorer"))),
  Swap: chunk("/swap", () => importPage("/src/pages/SwapPreview.tsx", () => import("../pages/SwapPreview"))),
  Privacy: chunk("/privacy", () => importPage("/src/pages/Legal.tsx", () => import("../pages/Legal")).then((m) => ({ default: m.PrivacyPage }))),
  Simulator: chunk("/simulate", () => importPage("/src/simulator/TradeSimulator.tsx", () => import("../simulator/TradeSimulator"))),
  Stress: chunk("/stress-test", () => importPage("/src/stress/StressTest.tsx", () => import("../stress/StressTest"))),
  Terms: chunk("/terms", () => importPage("/src/pages/Legal.tsx", () => import("../pages/Legal")).then((m) => ({ default: m.TermsPage }))),
  Guide: chunk("/guide", () => importPage("/src/opsis/Guide.tsx", () => import("./Guide"))),
  Community: chunk("/community", () => importPage("/src/opsis/Community.tsx", () => import("./Community"))),
  PerpScenario: chunk("/check/perp-scenario", () => importPage("/src/opsis/PerpScenario.tsx", () => import("./PerpScenario"))),
  ReceiptVerify: chunk("/verify", () => importPage("/src/opsis/ReceiptVerify.tsx", () => import("./ReceiptVerify"))),
};
export function prefetchRoute(path: string) {
  const route = Object.values(chunks).find((entry) => entry.path === path);
  void route?.prefetch().catch(() => { /* Navigation can retry a failed prefetch. */ });
}
