import { canonicalize, receiptDigest, buildReceiptBatch, type Receipt, type ReceiptBody } from "@rh-chain/shared";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export async function receiptFixture(tool = "tokenControls") {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const body: ReceiptBody = { version: "opsis-receipt/1", tool, inputs: { amount: "12345678901234567890" }, chainId: 4663, block: { number: "32", hash: `0x${"aa".repeat(32)}`, timestamp: "2026-10-19T00:00:00.000Z" }, rpcCalls: [], sources: [], outputs: { state: "unknown" }, codeSha: "a".repeat(40), labelsetVersion: "none", issuedAt: "2026-10-19T00:00:01.000Z" };
  const digest = receiptDigest(body, { keccak256 }), batch = await buildReceiptBatch([digest]);
  const receipt: Receipt = { ...body, signature: { kind: "secp256k1", keyId: account.address, value: await account.sign({ hash: digest }) }, timestamp: { kind: "opentimestamps", status: "pending", root: batch.root, proof: batch.proofs[0]!, calendars: ["https://calendar.example"] } };
  const keys = [{ address: account.address, validFrom: "2026-10-19T00:00:00.000Z", validTo: null }];
  return { receipt, text: canonicalize(receipt), keys };
}
