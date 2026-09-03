import { Navigate, Outlet, useLocation, useParams } from "react-router";
import { AuthProvider, useAuth } from "./store";
import { WalletProvider } from "./walletStore";
import ChatPage from "./ChatPage";

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
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1d1d1d]">
        <span
          className="h-2 w-2 animate-ping rounded-full bg-[#fa6c34]"
          aria-label="Loading workspace"
        />
      </div>
    );
  }
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export function DashboardIndex() {
  return (
    <div className="dots flex flex-1 items-center justify-center">
      <div className="max-w-[420px] text-center">
        <p className="font-mono-d text-[11px] tracking-wider text-[#635d5a]">
          ROBINHOOD CHAIN · 4663
        </p>
        <h2 className="mt-4 text-[26px] font-medium tracking-[-0.02em] text-[#e9e0d1]">
          Start a session or resolve an entity
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#9a938a]">
          Paste a wallet, transaction hash, token, or contract in the search bar
          above, or pick a session from the left rail.
        </p>
      </div>
    </div>
  );
}

export function ChatRoute() {
  const { sessionId } = useParams();
  return <ChatPage key={sessionId} />;
}
