import { Routes, Route, Navigate, Outlet, useLocation, useParams } from "react-router";
import Home from "./pages/Home";
import Roadmap from "./pages/Roadmap";
import ScoutSwap from "./pages/ScoutSwap";
import { PrivacyPage, TermsPage } from "./pages/Legal";
import { AuthProvider, useAuth } from "./dashboard/store";
import { WalletProvider } from "./dashboard/walletStore";
import { LoginPage, RegisterPage } from "./dashboard/AuthPages";
import AppShell from "./dashboard/AppShell";
import ChatPage from "./dashboard/ChatPage";
import PrivateExplorer from "./pages/PrivateExplorer";
import AccountPrivacyPage from "./dashboard/AccountPrivacyPage";
import VaultPage from "./pages/Vault";
import RwaVerify from "./pages/RwaVerify";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1d1d1d]">
        <span className="h-2 w-2 animate-ping rounded-full bg-[#fa6c34]" />
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

function DashboardIndex() {
  return (
    <div className="dots flex flex-1 items-center justify-center">
      <div className="max-w-[420px] text-center">
        <p className="font-mono-d text-[11px] tracking-wider text-[#635d5a]">ROBINHOOD CHAIN · 4663</p>
        <h2 className="mt-4 text-[26px] font-medium tracking-[-0.02em] text-[#e9e0d1]">
          Start a session or resolve an entity
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#9a938a]">
          Paste a wallet, transaction hash, token, or contract in the search bar above, or pick
          a session from the left rail.
        </p>
      </div>
    </div>
  );
}

function ChatRoute() {
  const { sessionId } = useParams();
  // React Router reuses the route element when only the parameter changes.
  // Remounting prevents any card, explorer URL, or pending request state from
  // leaking from the previous saved session.
  return <ChatPage key={sessionId} />;
}

function CloudProviders() {
  return (
    <AuthProvider>
      <WalletProvider>
        <Outlet />
      </WalletProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/swap" element={<ScoutSwap />} />
      <Route path="/app" element={<PrivateExplorer />} />
      <Route path="/vault" element={<VaultPage />} />
      <Route path="/rwa" element={<RwaVerify />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route element={<CloudProviders />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/cloud"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="chat/:sessionId" element={<ChatRoute />} />
            <Route path="privacy" element={<AccountPrivacyPage />} />
          </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
