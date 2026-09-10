import { createWalletClient, custom, defineChain, type Address } from "viem";
import { translateCurrent } from "../i18n/translate";

export const RH_CHAIN_ID = 4663;

export const robinhoodChain = defineChain({
  id: RH_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export interface WalletState {
  address: Address;
  chainId: number;
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/** MetaMask only. Handles the multi-provider (EIP-6963-style) case where
 *  window.ethereum.providers holds several injected wallets (Phantom, etc.). */
export function getProvider(): EthereumProvider | null {
  const eth = (window as unknown as { ethereum?: EthereumProvider & { isMetaMask?: boolean; providers?: (EthereumProvider & { isMetaMask?: boolean })[] } })
    .ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    return mm ?? null;
  }
  return eth.isMetaMask ? eth : null;
}

export function hasMetaMask(): boolean {
  return getProvider() !== null;
}

/** Request accounts and make sure the wallet is on Robinhood Chain (adds it if needed). No signing happens here; see signSignInMessage. */
export async function connectWallet(): Promise<WalletState> {
  const provider = getProvider();
  if (!provider) throw new Error(translateCurrent("cloud.wallet.error.notDetected"));

  const client = createWalletClient({ chain: robinhoodChain, transport: custom(provider as never) });
  const [address] = await client.requestAddresses();

  let chainId = Number(await provider.request({ method: "eth_chainId" }));
  if (chainId !== RH_CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${RH_CHAIN_ID.toString(16)}` }],
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${RH_CHAIN_ID.toString(16)}`,
              chainName: "Robinhood Chain",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
              blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
            },
          ],
        });
      } else {
        throw err;
      }
    }
    chainId = RH_CHAIN_ID;
  }
  return { address, chainId };
}

/**
 * Sign a plain-text sign-in message to prove control of the address.
 *
 * This is a `personal_sign`, not a transaction: it moves no funds, grants no
 * token approvals, and costs no gas. It is the only signature the app ever
 * requests.
 */
export async function signSignInMessage(address: Address, message: string): Promise<`0x${string}`> {
  const provider = getProvider();
  if (!provider) throw new Error(translateCurrent("cloud.wallet.error.notDetected"));
  const client = createWalletClient({ account: address, chain: robinhoodChain, transport: custom(provider as never) });
  try {
    return await client.signMessage({ message });
  } catch (err) {
    // 4001 is the EIP-1193 user-rejection code.
    if ((err as { code?: number }).code === 4001) throw new Error(translateCurrent("cloud.wallet.error.signatureRejected"));
    throw err;
  }
}

/** Ask MetaMask to revoke account permission (supported on recent versions); falls back silently. */
export async function disconnectWallet(): Promise<void> {
  const provider = getProvider();
  if (!provider) return;
  try {
    await provider.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* older MetaMask: local state cleared by caller */
  }
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function onWalletEvents(handlers: {
  accounts: (a: string[]) => void;
  chain: (chainId: string) => void;
}): () => void {
  const provider = getProvider();
  if (!provider?.on) return () => {};
  provider.on("accountsChanged", handlers.accounts as never);
  provider.on("chainChanged", handlers.chain as never);
  return () => {
    provider.removeListener?.("accountsChanged", handlers.accounts as never);
    provider.removeListener?.("chainChanged", handlers.chain as never);
  };
}
