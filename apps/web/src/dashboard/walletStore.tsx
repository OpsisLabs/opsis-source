import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { connectWallet, disconnectWallet, getProvider, onWalletEvents, RH_CHAIN_ID, type WalletState } from "./wallet";

interface WalletCtx {
  wallet: WalletState | null;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  // restore silently if the user already authorized this site
  useEffect(() => {
    const provider = getProvider();
    if (!provider) return;
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setWallet({ address: list[0] as `0x${string}`, chainId: RH_CHAIN_ID });
      })
      .catch(() => {});

    return onWalletEvents({
      accounts: (a) => {
        const list = a as string[];
        setWallet(list.length > 0 ? { address: list[0] as `0x${string}`, chainId: RH_CHAIN_ID } : null);
      },
      chain: (c) => {
        const id = Number(c as string);
        setWallet((w) => (w ? { ...w, chainId: id } : w));
      },
    });
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError("");
    try {
      setWallet(await connectWallet());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await disconnectWallet();
    setWallet(null);
  };

  return <Ctx.Provider value={{ wallet, connecting, error, connect, disconnect }}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}
