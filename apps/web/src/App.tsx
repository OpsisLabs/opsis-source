import { isWatchEnabled } from "./product/availability";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import Home from "./pages/Home";
import RouteMetadata from "./RouteMetadata";
import { isOpenDataApiEnabled } from "./product/availability";
import { useI18n } from "./i18n";

const OpsisApp = lazy(() => import("./opsis/OpsisApp"));
const Roadmap = lazy(() => import("./pages/Roadmap"));
const SwapPreview = lazy(() => import("./pages/SwapPreview"));
const TradeSimulator = lazy(() => import("./simulator/TradeSimulator"));
const CardPriceCheck = lazy(() => import("./deals/CardPriceCheck"));
const BiggestTrades = lazy(() => import("./trades/BiggestTrades"));
const KolTracker = lazy(() => import("./kol/KolTracker"));
const SituationRoom = lazy(() => import("./situation/SituationRoom"));
const WatchPage = lazy(() => import("./watch/WatchPage"));
const StressTest = lazy(() => import("./stress/StressTest"));
const ExitCheck = lazy(() => import("./exit-check/ExitCheck"));
const PrivateExplorer = lazy(() => import("./pages/PrivateExplorer"));
const VaultPage = lazy(() => import("./pages/Vault"));
const PrivateDealPreview = lazy(() => import("./deals/PrivatePreview"));
const RwaVerify = lazy(() => import("./pages/RwaVerify"));
const FeatureGuide = lazy(() => import("./pages/FeatureGuide"));
const TechnicalDocs = lazy(() => import("./pages/TechnicalDocs"));
const Faq = lazy(() => import("./pages/Faq"));
const Developers = lazy(() => import("./pages/Developers"));
const ProductShell = lazy(() => import("./product/ProductShell"));
const AppShell = lazy(() => import("./dashboard/AppShell"));
const AccountPrivacyPage = lazy(() => import("./dashboard/AccountPrivacyPage"));
const PrivacyPage = lazy(() =>
  import("./pages/Legal").then((module) => ({ default: module.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import("./pages/Legal").then((module) => ({ default: module.TermsPage })),
);
const LoginPage = lazy(() =>
  import("./dashboard/AuthPages").then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = lazy(() =>
  import("./dashboard/AuthPages").then((module) => ({
    default: module.RegisterPage,
  })),
);
const CloudProviders = lazy(() =>
  import("./dashboard/CloudRoutes").then((module) => ({
    default: module.CloudProviders,
  })),
);
const RequireAuth = lazy(() =>
  import("./dashboard/CloudRoutes").then((module) => ({
    default: module.RequireAuth,
  })),
);
const DashboardIndex = lazy(() =>
  import("./dashboard/CloudRoutes").then((module) => ({
    default: module.DashboardIndex,
  })),
);
const ChatRoute = lazy(() =>
  import("./dashboard/CloudRoutes").then((module) => ({
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
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export default function App() {
  if (import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true") return <DeferredPage><OpsisApp /></DeferredPage>;
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
                <RwaVerify />
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
