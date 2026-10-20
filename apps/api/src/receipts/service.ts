import { canonicalBytes, signReceipt, type Hex, type Receipt, type ReceiptBody, type ReceiptSigner, type ReceiptKey } from "@rh-chain/shared";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "../config/env.js";
export type { ReceiptSigner } from "@rh-chain/shared";
export class ReceiptService {
  constructor(private readonly signer: ReceiptSigner, readonly keys: ReceiptKey[], private readonly codeSha: string, private readonly now: () => number = Date.now) {}
  async issue(input: Omit<ReceiptBody, "version" | "codeSha" | "issuedAt">): Promise<Receipt> {
    // Snapshot before awaiting a signer, so mutable caller data cannot change signed bytes.
    const body: ReceiptBody = JSON.parse(new TextDecoder().decode(canonicalBytes({ ...input, version: "opsis-receipt/1", codeSha: this.codeSha, issuedAt: new Date(this.now()).toISOString() })));
    if (!this.keys.some((key) => key.address === this.signer.address && key.validFrom <= body.issuedAt && (key.validTo === null || body.issuedAt < key.validTo))) throw new Error("Receipt signing key outside validity window");
    return signReceipt(body, this.signer, { keccak256 });
  }
}
export function configuredReceiptService(env: Env): ReceiptService | undefined {
  if (!env.RECEIPTS_ENABLED) return undefined;
  const account = privateKeyToAccount(env.RECEIPT_SIGNING_KEY as Hex);
  return new ReceiptService({ address: account.address, signDigest: (hash) => account.sign({ hash }) }, [{ address: account.address, validFrom: env.RECEIPT_KEY_VALID_FROM, validTo: null }], (env.BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA)!);
}
