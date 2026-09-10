import { Navigate, Outlet, useLocation, useParams } from "react-router";
import { AuthProvider, useAuth } from "./store";
import { WalletProvider } from "./walletStore";
import ChatPage from "./ChatPage";
import { useI18n } from "../i18n";

export function CloudProviders() {
  return (
    <AuthProvider>
      <WalletProvider>
        <Outlet />
      </WalletProvider>
    </AuthProvider>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1d1d1d]">
        <span
          className="h-2 w-2 animate-ping rounded-full bg-[#fa6c34]"
          aria-label={t("cloud.routes.loadingWorkspace")}
        />
      </div>
    );
  }
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export function DashboardIndex() {
  const { t } = useI18n();
  return (
    <div className="dots flex flex-1 items-center justify-center">
      <div className="max-w-[420px] text-center">
        <p className="font-mono-d text-[11px] tracking-wider text-[#635d5a]">
          {t("cloud.routes.chain")}
        </p>
        <h2 className="mt-4 text-[26px] font-medium tracking-[-0.02em] text-[#e9e0d1]">
          {t("cloud.routes.emptyTitle")}
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#9a938a]">
          {t("cloud.routes.emptyBody")}
        </p>
      </div>
    </div>
  );
}

export function ChatRoute() {
  const { sessionId } = useParams();
  return <ChatPage key={sessionId} />;
}
