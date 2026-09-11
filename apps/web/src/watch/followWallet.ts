import { isAddress } from "viem";

/**
 * Chain-aware "Follow this wallet" contract shared by the Private Explorer and
 * later workers (for example the Biggest Trades worker). This module is pure and
 * has no React, provider or Vault dependency so any surface can reuse it.
 *
 * Honesty rules:
 * - Only a syntactically valid EVM address on a chain Scout Watch supports can
 *   be followed.
 * - The zero address and the dead/burn address are never followed.
 * - A known contract is never followed. When classification is unknown the
 *   address is treated as an unverified *public address*, never as a proven
 *   wallet or EOA.
 */
export const WATCH_SUPPORTED_CHAIN_IDS = [4663] as const;
export type WatchChainId = (typeof WATCH_SUPPORTED_CHAIN_IDS)[number];

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

/** A caller may know an address is a wallet or a contract; otherwise it is unknown. */
export type WalletClassification = "wallet" | "contract" | "unknown";

export type FollowableWallet = {
  /** The public address exactly as handed to the user. */
  address: string;
  chainId: number;
  classification: WalletClassification;
};

export function isSupportedWatchChain(chainId: number): boolean {
  return (WATCH_SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
}

/**
 * Accepts only a strict 0x address that is neither the zero nor the dead
 * address. Returns the original casing so links keep the address the user saw.
 */
export function normalizePublicAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!isAddress(candidate, { strict: true })) return null;
  const lower = candidate.toLowerCase();
  if (lower === ZERO_ADDRESS || lower === DEAD_ADDRESS) return null;
  return candidate;
}

export function toFollowableWallet(input: {
  address: unknown;
  chainId: number;
  classification?: WalletClassification;
}): FollowableWallet | null {
  if (!isSupportedWatchChain(input.chainId)) return null;
  const classification = input.classification ?? "unknown";
  if (classification === "contract") return null;
  const address = normalizePublicAddress(input.address);
  if (!address) return null;
  return { address, chainId: input.chainId, classification };
}

export function isFollowableWallet(input: {
  address: unknown;
  chainId: number;
  classification?: WalletClassification;
}): boolean {
  return toFollowableWallet(input) !== null;
}

/** Blockscout sometimes returns an address as a string, sometimes as { hash }. */
function addressOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  const hash = (value as { hash?: unknown } | null)?.hash;
  return typeof hash === "string" ? hash : null;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === "object") as Record<string, unknown>[])
    : [];
}

/** Reads from/to pairs out of a fact list without inventing fields. */
function pushPairs(
  out: Map<string, FollowableWallet>,
  list: unknown,
  chainId: number,
): void {
  for (const row of rows(list)) {
    for (const side of [row.from, row.to]) {
      const address = addressOf(side);
      const wallet = toFollowableWallet({ address, chainId, classification: "unknown" });
      if (wallet) out.set(wallet.address.toLowerCase(), wallet);
    }
  }
}

/**
 * Collects the distinct, followable public addresses observed in a transaction
 * result's facts: the top-level from/to plus token transfers and internal calls.
 * Ordering is deterministic (top-level first, then transfer, then internal).
 */
export function collectTransactionParticipants(
  facts: Record<string, unknown> | undefined,
  options: { chainId: number },
): FollowableWallet[] {
  if (!facts) return [];
  const found = new Map<string, FollowableWallet>();
  pushPairs(found, [facts], options.chainId);
  pushPairs(found, facts.tokenTransfers, options.chainId);
  pushPairs(found, facts.internalTransactions, options.chainId);
  return [...found.values()];
}
