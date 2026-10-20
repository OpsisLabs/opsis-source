import { isWatchEnabled } from "./product/availability";
import { lazy, Suspense, type ReactNode } from "react";
import { importPage } from "./product/page-imports";
import { LoadBoundary } from "./product/LoadRecovery";
import { Navigate, Route, Routes } from "react-router";
import Home from "./pages/Home";
import RouteMetadata from "./RouteMetadata";
import { isOpenDataApiEnabled } from "./product/availability";
import { useI18n } from "./i18n";

const PublicPages = lazy(() => importPage("/src/opsis/publications/PublicPages.tsx", () => import("./opsis/publications/PublicPages")));
const OpsisApp = lazy(() => importPage("/src/opsis/OpsisApp.tsx", () => import("./opsis/OpsisApp")));
const Roadmap = lazy(() => importPage("/src/pages/Roadmap.tsx", () => import("./pages/Roadmap")));
const SwapPreview = lazy(() => importPage("/src/pages/SwapPreview.tsx", () => import("./pages/SwapPreview")));
const TradeSimulator = lazy(() => importPage("/src/simulator/TradeSimulator.tsx", () => import("./simulator/TradeSimulator")));
const CardPriceCheck = lazy(() => importPage("/src/deals/CardPriceCheck.tsx", () => import("./deals/CardPriceCheck")));
const BiggestTrades = lazy(() => importPage("/src/trades/BiggestTrades.tsx", () => import("./trades/BiggestTrades")));
const KolTracker = lazy(() => importPage("/src/kol/KolTracker.tsx", () => import("./kol/KolTracker")));
const SituationRoom = lazy(() => importPage("/src/situation/SituationRoom.tsx", () => import("./situation/SituationRoom")));
const WatchPage = lazy(() => importPage("/src/watch/WatchPage.tsx", () => import("./watch/WatchPage")));
const StressTest = lazy(() => importPage("/src/stress/StressTest.tsx", () => import("./stress/StressTest")));
const ExitCheck = lazy(() => importPage("/src/exit-check/ExitCheck.tsx", () => import("./exit-check/ExitCheck")));
const PrivateExplorer = lazy(() => importPage("/src/pages/PrivateExplorer.tsx", () => import("./pages/PrivateExplorer")));
const VaultPage = lazy(() => importPage("/src/pages/Vault.tsx", () => import("./pages/Vault")));
const PrivateDealPreview = lazy(() => importPage("/src/deals/PrivatePreview.tsx", () => import("./deals/PrivatePreview")));
const StockTokenCheck = lazy(() => importPage("/src/pages/StockTokenCheck.tsx", () => import("./pages/StockTokenCheck")));
const FeatureGuide = lazy(() => importPage("/src/pages/FeatureGuide.tsx", () => import("./pages/FeatureGuide")));
const TechnicalDocs = lazy(() => importPage("/src/pages/TechnicalDocs.tsx", () => import("./pages/TechnicalDocs")));
const Faq = lazy(() => importPage("/src/pages/Faq.tsx", () => import("./pages/Faq")));
const Developers = lazy(() => importPage("/src/pages/Developers.tsx", () => import("./pages/Developers")));
const ProductShell = lazy(() => importPage("/src/product/ProductShell.tsx", () => import("./product/ProductShell")));
const AppShell = lazy(() => importPage("/src/dashboard/AppShell.tsx", () => import("./dashboard/AppShell")));
const AccountPrivacyPage = lazy(() => importPage("/src/dashboard/AccountPrivacyPage.tsx", () => import("./dashboard/AccountPrivacyPage")));
const PrivacyPage = lazy(() =>
  importPage("/src/pages/Legal.tsx", () => import("./pages/Legal")).then((module) => ({ default: module.PrivacyPage })),
);
const TermsPage = lazy(() =>
  importPage("/src/pages/Legal.tsx", () => import("./pages/Legal")).then((module) => ({ default: module.TermsPage })),
);
const LoginPage = lazy(() =>
  importPage("/src/dashboard/AuthPages.tsx", () => import("./dashboard/AuthPages")).then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = lazy(() =>
  importPage("/src/dashboard/AuthPages.tsx", () => import("./dashboard/AuthPages")).then((module) => ({
    default: module.RegisterPage,
  })),
);
const CloudProviders = lazy(() =>
  importPage("/src/dashboard/CloudRoutes.tsx", () => import("./dashboard/CloudRoutes")).then((module) => ({
    default: module.CloudProviders,
  })),
);
const RequireAuth = lazy(() =>
  importPage("/src/dashboard/CloudRoutes.tsx", () => import("./dashboard/CloudRoutes")).then((module) => ({
    default: module.RequireAuth,
  })),
);
const DashboardIndex = lazy(() =>
  importPage("/src/dashboard/CloudRoutes.tsx", () => import("./dashboard/CloudRoutes")).then((module) => ({
    default: module.DashboardIndex,
  })),
);
const ChatRoute = lazy(() =>
  importPage("/src/dashboard/CloudRoutes.tsx", () => import("./dashboard/CloudRoutes")).then((module) => ({
    default: module.ChatRoute,
  })),
);

function PageFallback() {
  const { t } = useI18n();
  if (import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true") return (
    <div style={{ minHeight: "100dvh", background: "#1000ff", color: "#fff", fontFamily: "sans-serif", padding: "24px 36px" }}>
      <strong style={{ fontSize: 28 }}>OPSIS</strong>
      <div style={{ marginTop: 24, borderTop: "2px solid #d1ceff", paddingTop: 24 }} role="status">{t("common.loadingPage")}</div>
    </div>
  );
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1d1d1d]">
      <span
        className="h-2 w-2 animate-ping rounded-full bg-[#fa6c34]"
        aria-label={t("common.loadingPage")}
      />
    </div>
  );
}

function DeferredPage({ children }: { children: ReactNode }) {
  return <LoadBoundary><Suspense fallback={<PageFallback />}>{children}</Suspense></LoadBoundary>;
}

export default function App() {
  if (import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true") return (
    <Routes>
      <Route path="/docs" element={<DeferredPage><PublicPages /></DeferredPage>} />
      <Route path="/whitepaper" element={<DeferredPage><PublicPages /></DeferredPage>} />
      <Route path="*" element={<DeferredPage><OpsisApp /></DeferredPage>} />
    </Routes>
  );
  return (
    <>
      <RouteMetadata />
      <Routes>
        <Route path="/_preview/deals" element={<DeferredPage><PrivateDealPreview /></DeferredPage>} />
        <Route path="/" element={<Home />} />
        <Route
          path="/roadmap"
          element={
            <DeferredPage>
              <Roadmap />
            </DeferredPage>
          }
        />
        <Route
          element={
            <DeferredPage>
              <ProductShell />
            </DeferredPage>
          }
        >
          <Route
            path="/swap"
            element={
              <DeferredPage>
                <SwapPreview />
              </DeferredPage>
            }
          />
          <Route path="/simulate" element={import.meta.env.VITE_TRADE_SIMULATOR_ENABLED === "true" ? <DeferredPage><TradeSimulator /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/card-prices" element={import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED === "true" ? <DeferredPage><CardPriceCheck /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/biggest-trades" element={import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true" ? <DeferredPage><BiggestTrades /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/kol-tracker" element={import.meta.env.VITE_KOL_TRACKER_ENABLED === "true" ? <DeferredPage><KolTracker /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/situation-room" element={import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true" ? <DeferredPage><SituationRoom /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/watch" element={isWatchEnabled() ? <DeferredPage><WatchPage /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/stress-test" element={import.meta.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true" ? <DeferredPage><StressTest /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/exit-check" element={import.meta.env.VITE_EXIT_CHECK_ENABLED === "true" ? <DeferredPage><ExitCheck /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route
            path="/app"
            element={
              <DeferredPage>
                <PrivateExplorer />
              </DeferredPage>
            }
          />
          <Route
            path="/vault"
            element={
              <DeferredPage>
                <VaultPage />
              </DeferredPage>
            }
          />
          <Route
            path="/rwa"
            element={
              <DeferredPage>
                <StockTokenCheck />
              </DeferredPage>
            }
          />
          <Route
            path="/guide"
            element={
              <DeferredPage>
                <FeatureGuide />
              </DeferredPage>
            }
          />
          <Route
            path="/docs"
            element={
              <DeferredPage>
                <TechnicalDocs />
              </DeferredPage>
            }
          />
          <Route
            path="/faq"
            element={
              <DeferredPage>
                <Faq />
              </DeferredPage>
            }
          />
          <Route
            path="/developers"
            element={
              isOpenDataApiEnabled() ? (
                <DeferredPage>
                  <Developers />
                </DeferredPage>
              ) : (
                <Navigate to="/guide#open-data-api" replace />
              )
            }
          />
        </Route>
        <Route
          path="/privacy"
          element={
            <DeferredPage>
              <PrivacyPage />
            </DeferredPage>
          }
        />
        <Route
          path="/terms"
          element={
            <DeferredPage>
              <TermsPage />
            </DeferredPage>
          }
        />
        <Route
          element={
            <DeferredPage>
              <CloudProviders />
            </DeferredPage>
          }
        >
          <Route
            path="/login"
            element={
              <DeferredPage>
                <LoginPage />
              </DeferredPage>
            }
          />
          <Route
            path="/register"
            element={
              <DeferredPage>
                <RegisterPage />
              </DeferredPage>
            }
          />
          <Route
            path="/cloud"
            element={
              <DeferredPage>
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              </DeferredPage>
            }
          >
            <Route
              index
              element={
                <DeferredPage>
                  <DashboardIndex />
                </DeferredPage>
              }
            />
            <Route
              path="chat/:sessionId"
              element={
                <DeferredPage>
                  <ChatRoute />
                </DeferredPage>
              }
            />
            <Route
              path="privacy"
              element={
                <DeferredPage>
                  <AccountPrivacyPage />
                </DeferredPage>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
