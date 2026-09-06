import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  currentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  walletChallenge,
  walletLogin,
} from "./api";
import { clearLegacyBrowserCredentials } from "./http";
import { connectWallet, signSignInMessage } from "./wallet";
import type { User } from "./types";
import { cloudWorkspaceEnabled, cloudUnavailableMessage } from "./cloudAvailability";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (e: string, p: string) => Promise<void>;
  register: (e: string, p: string) => Promise<void>;
  /**
   * Connect, sign, and exchange the signature for a session. A wallet that has
   * not been seen before rejects with code USERNAME_REQUIRED; call again with a
   * username to finish. The signature is reused for that second call, so the
   * user only ever approves one signature request.
   */
  signInWithWallet: (username?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pending = useRef<{ nonce: string; signature: string } | null>(null);

  useEffect(() => {
    let active = true;
    clearLegacyBrowserCredentials();
    currentUser()
      .then((next) => {
        if (active) setUser(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signInWithWallet = async (username?: string) => {
    if (!cloudWorkspaceEnabled) throw new Error(cloudUnavailableMessage);
    if (!pending.current) {
      const { address } = await connectWallet();
      const challenge = await walletChallenge(address);
      const signature = await signSignInMessage(address, challenge.message);
      pending.current = { nonce: challenge.nonce, signature };
    }
    const { nonce, signature } = pending.current;
    // On failure, keep the signature so a username retry does not re-prompt
    // the wallet. Only clear it after the login exchange succeeds.
    setUser(await walletLogin(nonce, signature, username));
    pending.current = null;
  };

  const value: AuthCtx = {
    user,
    loading,
    login: async (e, p) => setUser(await apiLogin(e, p)),
    register: async (e, p) => setUser(await apiRegister(e, p)),
    signInWithWallet,
    logout: async () => {
      await apiLogout();
      pending.current = null;
      setUser(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Context hooks intentionally live beside their provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
