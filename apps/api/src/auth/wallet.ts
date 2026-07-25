import jwt from "jsonwebtoken";
import { verifyMessage, isAddress, getAddress } from "viem";
import type { Env } from "../config/env.js";

/**
 * Sign-in with a wallet, EIP-4361 style.
 *
 * The nonce is a short-lived JWT rather than a database row, so the flow stays
 * stateless across API instances. It is bound to the address it was issued for
 * and expires in five minutes, which bounds replay to that window; a signature
 * captured inside it cannot be reused afterwards. If single-use nonces become
 * necessary, record the `jti` in Redis on verify and reject repeats.
 */

const NONCE_TTL_SECONDS = 300;
const ISSUER = "rh-chain-ai-explorer";
const AUDIENCE = "rh-chain-ai-explorer-wallet";

export type NoncePayload = { address: string; nonce: string };

export class WalletAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WalletAuthError";
    this.code = code;
  }
}

/** Checksummed address, or a WalletAuthError if the input is not an address. */
export function normalizeAddress(value: string): string {
  if (!isAddress(value)) throw new WalletAuthError("INVALID_ADDRESS", "That is not a valid wallet address");
  return getAddress(value);
}

/** The exact text the wallet is asked to sign. Deliberately explicit that it
 *  authorizes nothing on-chain, since the user sees this in MetaMask. */
export function buildSignInMessage(address: string, nonce: string, origin: string): string {
  return [
    `${origin} wants you to sign in with your wallet.`,
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    "",
    "Signing proves you control this address. It is not a transaction, moves no",
    "funds, and grants no token approvals.",
  ].join("\n");
}

/** Issue a nonce for an address and the message the client should sign. */
export function issueNonce(env: Env, rawAddress: string): { address: string; nonce: string; message: string } {
  const address = normalizeAddress(rawAddress);
  const nonce = jwt.sign({ address }, env.JWT_ACCESS_SECRET, {
    expiresIn: NONCE_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return { address, nonce, message: buildSignInMessage(address, nonce, env.APP_ORIGIN) };
}

/**
 * Verify that `signature` covers the message built from `nonce`, and that the
 * signer is the address the nonce was issued to. Returns the checksummed
 * address on success.
 */
export async function verifySignedNonce(env: Env, nonce: string, signature: string): Promise<string> {
  let address: string;
  try {
    ({ address } = jwt.verify(nonce, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as NoncePayload);
  } catch {
    throw new WalletAuthError("NONCE_EXPIRED", "That sign-in request expired. Try again.");
  }

  const message = buildSignInMessage(address, nonce, env.APP_ORIGIN);
  let valid = false;
  try {
    valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) throw new WalletAuthError("INVALID_SIGNATURE", "Signature did not match the wallet address");
  return address;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/** Usernames are display identity, so keep them narrow and unambiguous. */
export function normalizeUsername(value: string): string {
  const trimmed = value.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new WalletAuthError(
      "INVALID_USERNAME",
      "Username must be 3-20 characters: letters, numbers, or underscores.",
    );
  }
  return trimmed;
}
