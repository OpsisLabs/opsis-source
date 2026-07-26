import { Routes, Route, Navigate, useLocation } from "react-router";
import Home from "./pages/Home";
import { PrivacyPage, TermsPage } from "./pages/Legal";
import { AuthProvider, useAuth } from "./dashboard/store";
import { WalletProvider } from "./dashboard/walletStore";
import { LoginPage, RegisterPage } from "./dashboard/AuthPages";
import AppShell from "./dashboard/AppShell";
import ChatPage from "./dashboard/ChatPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div className="hud flex min-h-screen items-center justify-center">
        <span className="h-2 w-2 animate-ping rounded-full bg-[#3fd0ff]" />
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

function DashboardIndex() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-[460px] text-center">
        <p className="hud-key text-[#3fd0ff]">ROBINHOOD CHAIN · 4663</p>
        <h2 className="mt-4 text-[26px] font-light tracking-[-0.02em] text-[#eaf7ff]">
          Acquire a target to begin
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#6d8ba3]">
          Paste a wallet, transaction hash, token, or contract into the scanner above,
          or resume a session from the log.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="chat/:sessionId" element={<ChatPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WalletProvider>
    </AuthProvider>
  );
}
