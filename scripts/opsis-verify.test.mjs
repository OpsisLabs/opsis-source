import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalize } from "../packages/shared/dist/receipts.js";
import { receiptFixture } from "./receipt-fixture.mjs";
async function run(change = () => {}, options = {}) {
  const { receipt, keys } = await receiptFixture(); change(receipt, keys);
  const dir = await mkdtemp(join(tmpdir(), "receipt-test-"));
  try {
    await writeFile(join(dir, "receipt.json"), options.raw ?? canonicalize(receipt));
    await writeFile(join(dir, "keys.json"), JSON.stringify(keys));
    return spawnSync(process.execPath, ["scripts/opsis-verify.mjs", join(dir, "receipt.json"), ...(options.noKeys ? [] : ["--keys", join(dir, "keys.json")])], { encoding: "utf8" });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
test("valid fixture and pending timestamp", async () => { const r = await run(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /"timestamp":"pending"/); });
test("tampered field", async () => assert.equal((await run((r) => { r.outputs.amount = "1"; })).status, 1));
test("wrong key", async () => assert.equal((await run((_r, k) => { k[0].address = `0x${"33".repeat(20)}`; })).status, 1));
test("expired key, exclusive upper bound", async () => assert.equal((await run((r, k) => { k[0].validTo = r.issuedAt; })).status, 1));
test("malformed signature", async () => assert.equal((await run((r) => { r.signature.value = "0x1234"; })).status, 1));
test("broken Merkle proof", async () => assert.equal((await run((r) => { r.timestamp.proof.siblings[0] = `0x${"00".repeat(32)}`; })).status, 1));
test("noncanonical file", async () => assert.equal((await run(() => {}, { raw: JSON.stringify((await receiptFixture()).receipt, null, 2) })).status, 1));
test("missing trust list fails closed", async () => assert.equal((await run(() => {}, { noKeys: true })).status, 1));
test("attested remains explicitly unverified", async () => { const r = await run((r) => { r.timestamp.status = "attested"; r.timestamp.otsProofBase64 = "AQID"; }); assert.equal(r.status, 0); assert.match(r.stdout, /Bitcoin attestation not verified in this version/); });
test("usage exits 2", () => { for (const args of [[], ["--help"], ["receipt.json", "--bad", "keys.json"]]) assert.equal(spawnSync(process.execPath, ["scripts/opsis-verify.mjs", ...args]).status, 2); });
