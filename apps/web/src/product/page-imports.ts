import { retryImport } from "./lazy-retry";

// Failed module URLs can stay in the browser's module map. Two statically
// bundled variants give the retries distinct URLs in development and production.
const secondAttempt = import.meta.glob([
  "/src/dashboard/AccountPrivacyPage.tsx",
  "/src/dashboard/AppShell.tsx",
  "/src/dashboard/AuthPages.tsx",
  "/src/dashboard/CloudRoutes.tsx",
  "/src/deals/CardPriceCheck.tsx",
  "/src/deals/PrivatePreview.tsx",
  "/src/exit-check/ExitCheck.tsx",
  "/src/kol/KolTracker.tsx",
  "/src/opsis/Community.tsx",
  "/src/opsis/Guide.tsx",
  "/src/opsis/Lab.tsx",
  "/src/opsis/LaunchRadar.tsx",
  "/src/opsis/OpsisApp.tsx",
  "/src/opsis/PerpScenario.tsx",
  "/src/opsis/ReceiptVerify.tsx",
  "/src/opsis/Research.tsx",
  "/src/opsis/SavedWorkspace.tsx",
  "/src/opsis/TradeCheck.tsx",
  "/src/pages/Developers.tsx",
  "/src/pages/Faq.tsx",
  "/src/pages/FeatureGuide.tsx",
  "/src/pages/Legal.tsx",
  "/src/pages/PrivateExplorer.tsx",
  "/src/pages/Roadmap.tsx",
  "/src/pages/StockTokenCheck.tsx",
  "/src/pages/SwapPreview.tsx",
  "/src/pages/TechnicalDocs.tsx",
  "/src/pages/Vault.tsx",
  "/src/product/ProductShell.tsx",
  "/src/simulator/TradeSimulator.tsx",
  "/src/situation/SituationRoom.tsx",
  "/src/stress/StressTest.tsx",
  "/src/trades/BiggestTrades.tsx",
  "/src/watch/WatchPage.tsx",
], { query: "?opsis-code-retry=1" });
const thirdAttempt = import.meta.glob([
  "/src/dashboard/AccountPrivacyPage.tsx",
  "/src/dashboard/AppShell.tsx",
  "/src/dashboard/AuthPages.tsx",
  "/src/dashboard/CloudRoutes.tsx",
  "/src/deals/CardPriceCheck.tsx",
  "/src/deals/PrivatePreview.tsx",
  "/src/exit-check/ExitCheck.tsx",
  "/src/kol/KolTracker.tsx",
  "/src/opsis/Community.tsx",
  "/src/opsis/Guide.tsx",
  "/src/opsis/Lab.tsx",
  "/src/opsis/LaunchRadar.tsx",
  "/src/opsis/OpsisApp.tsx",
  "/src/opsis/PerpScenario.tsx",
  "/src/opsis/ReceiptVerify.tsx",
  "/src/opsis/Research.tsx",
  "/src/opsis/SavedWorkspace.tsx",
  "/src/opsis/TradeCheck.tsx",
  "/src/pages/Developers.tsx",
  "/src/pages/Faq.tsx",
  "/src/pages/FeatureGuide.tsx",
  "/src/pages/Legal.tsx",
  "/src/pages/PrivateExplorer.tsx",
  "/src/pages/Roadmap.tsx",
  "/src/pages/StockTokenCheck.tsx",
  "/src/pages/SwapPreview.tsx",
  "/src/pages/TechnicalDocs.tsx",
  "/src/pages/Vault.tsx",
  "/src/product/ProductShell.tsx",
  "/src/simulator/TradeSimulator.tsx",
  "/src/situation/SituationRoom.tsx",
  "/src/stress/StressTest.tsx",
  "/src/trades/BiggestTrades.tsx",
  "/src/watch/WatchPage.tsx",
], { query: "?opsis-code-retry=2" });

export function importPage<T>(path: string, importer: () => Promise<T>): Promise<T> {
  let attempt = 0;
  return retryImport(() => {
    const retry = [secondAttempt, thirdAttempt][attempt++ - 1]?.[path];
    return retry ? retry() as Promise<T> : importer();
  })();
}
