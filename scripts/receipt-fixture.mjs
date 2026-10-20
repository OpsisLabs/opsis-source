import { createRequire } from "node:module";
import { canonicalize, receiptDigest, buildReceiptBatch } from "../packages/shared/dist/receipts.js";
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { keccak256 } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
/** Public deterministic fixture material, never a deployment key. */
export async function receiptFixture(tool = "tokenControls") {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const body = { version: "opsis-receipt/1", tool, inputs: { contract: `0x${"22".repeat(20)}` }, chainId: 4663,
    block: { number: "32", hash: `0x${"aa".repeat(32)}`, timestamp: "2026-10-19T00:00:00.000Z" },
    rpcCalls: [{ method: "eth_chainId", paramsSha256: `0x${"bb".repeat(32)}` }],
    sources: [{ id: "rpc-1", provider: "fixture", url: "https://rpc.example", fetchedAt: "2026-10-19T00:00:00.000Z", responseSha256: `0x${"cc".repeat(32)}` }],
    outputs: { amount: "12345678901234567890", state: "unknown" }, codeSha: "a".repeat(40), labelsetVersion: "controls-v1", issuedAt: "2026-10-19T00:00:01.000Z" };
  const digest = receiptDigest(body, { keccak256 });
  const batch = await buildReceiptBatch([digest, `0x${"dd".repeat(32)}`, `0x${"ee".repeat(32)}`]);
  const receipt = { ...body, signature: { kind: "secp256k1", keyId: account.address, value: await account.sign({ hash: digest }) }, timestamp: { kind: "opentimestamps", status: "pending", root: batch.root, proof: batch.proofs[0], calendars: ["https://calendar.example"] } };
  const keys = [{ address: account.address, validFrom: "2026-10-19T00:00:00.000Z", validTo: null }];
  return { receipt, keys, text: canonicalize(receipt) };
}
