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
 * - A known contract is never followed. Address objects that explicitly carry
 *   `is_contract: true` are excluded; `is_contract: false` supports a wallet.
 *   When classification is unknown the address is treated as an unverified
 *   *public address*, never as a proven wallet or EOA.
 */
export const WATCH_SUPPORTED_CHAIN_IDS = [4663] as const;
export type WatchChainId = (typeof WATCH_SUPPORTED_CHAIN_IDS)[number];

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

/** A known contract is excluded; an unknown address stays an honest public address. */
export type WalletClassification = "wallet" | "contract" | "unknown";

export type FollowableWallet = {
  /** The public address exactly as handed to the user. */
  address: string;
  chainId: number;
  classification: WalletClassification;
};

export type ParticipantSide = "from" | "to";

/** A transaction participant also records which side(s) of the transfer it was on. */
export type FollowableParticipant = FollowableWallet & {
  sides: ParticipantSide[];
};

/** The panel renders at most this many participants, with a visible remainder count. */
export const FOLLOW_PARTICIPANT_LIMIT = 8;

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

/**
 * Reads an explicit classification from an address object (Blockscout returns
 * `{ hash, is_contract }` for internal calls) instead of dropping it. Returns
 * undefined when the caller must stay at the honest "unknown" default.
 */
export function classificationFromAddressObject(
  value: unknown,
): WalletClassification | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { is_contract?: unknown; isContract?: unknown };
  const flag = record.is_contract ?? record.isContract;
  if (flag === true) return "contract";
  if (flag === false) return "wallet";
  return undefined;
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

/** Adds one from/to side, honoring any explicit is_contract classification. */
function addSide(
  out: Map<string, FollowableParticipant>,
  value: unknown,
  side: ParticipantSide,
  chainId: number,
): void {
  const wallet = toFollowableWallet({
    address: addressOf(value),
    chainId,
    classification: classificationFromAddressObject(value),
  });
  if (!wallet) return;
  const key = wallet.address.toLowerCase();
  const existing = out.get(key);
  if (existing) {
    if (!existing.sides.includes(side)) existing.sides.push(side);
    return;
  }
  out.set(key, { ...wallet, sides: [side] });
}

/** Reads from/to pairs out of a fact list without inventing fields. */
function addPairs(
  out: Map<string, FollowableParticipant>,
  list: unknown,
  chainId: number,
): void {
  for (const row of rows(list)) {
    addSide(out, row.from, "from", chainId);
    addSide(out, row.to, "to", chainId);
  }
}

/**
 * Collects the distinct, followable public addresses observed in a transaction
 * result's facts: the top-level from/to plus token transfers and internal calls.
 * Ordering is deterministic (top-level first, then transfer, then internal) and
 * an address seen on both sides records both sides once.
 */
export function collectTransactionParticipants(
  facts: Record<string, unknown> | undefined,
  options: { chainId: number },
): FollowableParticipant[] {
  if (!facts) return [];
  const found = new Map<string, FollowableParticipant>();
  addPairs(found, [facts], options.chainId);
  addPairs(found, facts.tokenTransfers, options.chainId);
  addPairs(found, facts.internalTransactions, options.chainId);
  return [...found.values()];
}
