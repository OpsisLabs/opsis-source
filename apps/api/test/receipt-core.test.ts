import { describe, expect, it } from "vitest";
import { canonicalize, canonicalBytes, sha256, concat, fromHex, receiptBody, receiptDigest, buildReceiptBatch, verifyMerkle, verifyReceipt, validateReceipt, validateKeys, type Receipt } from "@rh-chain/shared";
import { keccak256, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const crypto = { keccak256, recoverAddress };
export async function fixture() {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const body = { version: "opsis-receipt/1" as const, tool: "tokenControls", inputs: { amount: "1000000000000000001" }, chainId: 4663,
    block: { number: "32", hash: `0x${"aa".repeat(32)}` as const, timestamp: "2026-10-19T00:00:00.000Z" }, rpcCalls: [], sources: [], outputs: { state: "unknown" }, codeSha: "a".repeat(40), labelsetVersion: "none", issuedAt: "2026-10-19T00:00:01.000Z" };
  const receipt: Receipt = { ...body, signature: { kind: "secp256k1", keyId: account.address, value: await account.sign({ hash: receiptDigest(body, crypto) }) } };
  const keys = [{ address: account.address, validFrom: "2026-10-19T00:00:00.000Z", validTo: null as string | null }];
  return { receipt, keys, account };
}
describe("RFC 8785 canonical JSON vectors", () => {
  it("serializes the section 3.2.2 primitive sample", () => {
    expect(canonicalize({ numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27], string: "€$\u000f\nA'B\"\\\"/", literals: [null, true, false] }))
      .toBe('{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\\"\\\\\\\"/"}');
  });
  it("sorts the section 3.2.3 property vector by UTF-16", () => {
    expect(canonicalize({ "€": "Euro Sign", "\r": "Carriage Return", "דּ": "Hebrew Letter Dalet With Dagesh", "1": "One", "😀": "Emoji: Grinning Face", "\u0080": "Control", "ö": "Latin Small Letter O With Diaeresis" }))
      .toBe('{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}');
  });
  it.each([
    ["0000000000000000", "0"], ["8000000000000000", "0"], ["0000000000000001", "5e-324"], ["8000000000000001", "-5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"], ["ffefffffffffffff", "-1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"], ["c340000000000000", "-9007199254740992"],
    ["4430000000000000", "295147905179352830000"], ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"], ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4e", "999999999999999700000"], ["444b1ae4d6e2ef4f", "999999999999999900000"], ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"], ["3eb0c6f7a0b5ed8d", "0.000001"],
  ])("serializes appendix B IEEE-754 vector %s", (bits, expected) => {
    const bytes = Uint8Array.from(bits.match(/../g)!, (h) => parseInt(h, 16));
    expect(canonicalize(new DataView(bytes.buffer).getFloat64(0))).toBe(expected);
  });
  it("rejects non-JSON objects, values, holes, accessors and invalid Unicode", () => {
    const cycle: unknown[] = []; cycle.push(cycle);
    for (const value of [NaN, Infinity, -Infinity, undefined, 1n, Symbol(), () => {}, new Date(), new Map(), new Uint8Array(), { a: undefined }, [undefined], [,], cycle, "\ud800", { "\udfff": 1 }, Object.defineProperty({}, "x", { enumerable: true, get: () => 1 })]) expect(() => canonicalize(value)).toThrow();
  });
  it("preserves Unicode without normalization and sorts nested objects", () => {
    expect(canonicalize({ z: [{ b: 2, a: "e\u0301" }], a: "é" })).toBe('{"a":"é","z":[{"a":"é","b":2}]}');
  });
});
describe("receipt schema, signing and key authorization", () => {
  it("uses the exact domain prefix and excludes both envelopes", async () => {
    const { receipt, keys } = await fixture();
    expect(receiptDigest(receiptBody(receipt), crypto)).toBe(keccak256(concat(new TextEncoder().encode("OPSIS-RECEIPT-V1\n"), canonicalBytes(receiptBody(receipt)))));
    expect((await verifyReceipt(canonicalize(receipt), keys, crypto)).valid).toBe(true);
    receipt.outputs = { state: "observed" };
    expect((await verifyReceipt(canonicalize(receipt), keys, crypto)).signature).toBe(false);
  });
  it("rejects malformed schemas and unsupported signature encodings", async () => {
    const { receipt } = await fixture();
    for (const patch of [{ version: "other" }, { chainId: 0 }, { codeSha: "unknown" }, { extra: 1 }, { block: { ...receipt.block, number: 32 } }, { issuedAt: "2026-02-30T00:00:00.000Z" }, { signature: { ...receipt.signature, value: "0x1234" } }]) expect(() => validateReceipt({ ...receipt, ...patch })).toThrow();
    expect(() => validateKeys([{ address: receipt.signature.keyId, validFrom: receipt.issuedAt, validTo: receipt.issuedAt }])).toThrow();
  });
  it("rejects duplicate keys, alternate escapes and whitespace as noncanonical", async () => {
    const { receipt, keys } = await fixture(); const text = canonicalize(receipt);
    for (const raw of [` ${text}`, text.replace('"tool":"tokenControls"', '"tool":"tokenControls","tool":"tokenControls"'), text.replace('"tokenControls"', '"\\u0074okenControls"')]) expect((await verifyReceipt(raw, keys, crypto)).canonical).toBe(false);
  });
  it("checks key windows, missing keys, wrong keys, and keyId checksum", async () => {
    const { receipt, keys } = await fixture();
    for (const list of [[], [{ ...keys[0], validFrom: "2026-10-20T00:00:00.000Z" }], [{ ...keys[0], validTo: receipt.issuedAt }], [{ ...keys[0], address: `0x${"22".repeat(20)}` }]]) expect((await verifyReceipt(canonicalize(receipt), list, crypto)).keyValidity).toBe(false);
    receipt.signature.keyId = receipt.signature.keyId.toLowerCase();
    expect((await verifyReceipt(canonicalize(receipt), keys, crypto)).signature).toBe(false);
  });
});
describe("SHA-256 Merkle batching", () => {
  it("uses independent leaf/node vectors and promotes an odd leaf", async () => {
    const digests = ["11", "22", "33"].map((h) => `0x${h.repeat(32)}` as const);
    const [a, b, c] = await Promise.all(digests.map((d) => sha256(concat(new Uint8Array([0]), fromHex(d)))));
    const pair = await sha256(concat(new Uint8Array([1]), fromHex(a!), fromHex(b!)));
    const root = await sha256(concat(new Uint8Array([1]), fromHex(pair), fromHex(c!)));
    const batch = await buildReceiptBatch(digests);
    expect(batch.root).toBe(root);
    expect(batch.proofs[2]).toEqual({ index: 2, siblings: [null, pair] });
    for (let i = 0; i < 3; i++) expect(await verifyMerkle(digests[i]!, root, batch.proofs[i]!)).toBe(true);
    expect(await verifyMerkle(digests[2]!, root, { index: 3, siblings: batch.proofs[2]!.siblings })).toBe(false);
    expect(await verifyMerkle(digests[0]!, root, { index: 0, siblings: [...batch.proofs[0]!.siblings].reverse() })).toBe(false);
  });
  it("handles singletons and all positions through repeated odd levels", async () => {
    await expect(buildReceiptBatch([])).rejects.toThrow();
    for (const size of [1, 2, 5, 7, 9]) {
      const digests = Array.from({ length: size }, (_, i) => `0x${i.toString(16).padStart(64, "0")}` as const);
      const batch = await buildReceiptBatch(digests);
      for (let i = 0; i < size; i++) expect(await verifyMerkle(digests[i]!, batch.root, batch.proofs[i]!)).toBe(true);
    }
  });
  it("does not confuse pending or opaque attested claims with timestamp verification", async () => {
    const { receipt, keys } = await fixture();
    const digest = receiptDigest(receiptBody(receipt), crypto), batch = await buildReceiptBatch([digest]);
    receipt.timestamp = { kind: "opentimestamps", status: "attested", root: batch.root, proof: batch.proofs[0]!, calendars: ["https://calendar.example"], otsProofBase64: "AQID" };
    const result = await verifyReceipt(canonicalize(receipt), keys, crypto);
    expect(result.valid).toBe(true); expect(result.timestamp).toBe("attested (Bitcoin attestation not verified in this version)");
    receipt.timestamp.root = `0x${"ff".repeat(32)}`;
    expect((await verifyReceipt(canonicalize(receipt), keys, crypto)).merkle).toBe(false);
  });
});
