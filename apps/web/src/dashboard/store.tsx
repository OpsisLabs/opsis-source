import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  currentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  walletChallenge,
  walletLogin,
} from "./api";
import { connectWallet, signSignInMessage } from "./wallet";
import type { User } from "./types";

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
    setUser(currentUser());
    setLoading(false);
  }, []);

  const signInWithWallet = async (username?: string) => {
    if (!pending.current) {
      const { address } = await connectWallet();
      const challenge = await walletChallenge(address);
      const signature = await signSignInMessage(address, challenge.message);
      pending.current = { nonce: challenge.nonce, signature };
    }
    const { nonce, signature } = pending.current;
    try {
      setUser(await walletLogin(nonce, signature, username));
      pending.current = null;
    } catch (error) {
      // Keep the signature so the username retry does not re-prompt the wallet.
      throw error;
    }
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

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
