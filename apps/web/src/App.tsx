import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import Home from "./pages/Home";
import RouteMetadata from "./RouteMetadata";
import { isOpenDataApiEnabled } from "./product/availability";
import { useI18n } from "./i18n";

const Roadmap = lazy(() => import("./pages/Roadmap"));
const ScoutSwap = lazy(() => import("./pages/ScoutSwap"));
const TradeSimulator = lazy(() => import("./simulator/TradeSimulator"));
const CardPriceCheck = lazy(() => import("./deals/CardPriceCheck"));
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
                <ScoutSwap />
              </DeferredPage>
            }
          />
          <Route path="/simulate" element={import.meta.env.VITE_TRADE_SIMULATOR_ENABLED === "true" ? <DeferredPage><TradeSimulator /></DeferredPage> : <Navigate to="/guide" replace />} />
          <Route path="/card-prices" element={import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED === "true" ? <DeferredPage><CardPriceCheck /></DeferredPage> : <Navigate to="/guide" replace />} />
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
