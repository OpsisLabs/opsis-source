import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateReport, writeReport } from "./stock-desk-report.mjs";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL("./fixtures/stock-desk-snapshot.json", import.meta.url),
      "utf8",
    ),
  );

test("fixture snapshot generates deterministic Markdown and JSON with number evidence", () => {
  const snapshot = fixture();
  const a = generateReport(snapshot),
    b = generateReport(snapshot);
  assert.deepEqual(a, b);
  assert.match(a.markdown, /State of Robinhood Chain: Stock Tokens/);
  assert.match(a.markdown, /block 100/);
  assert.match(a.markdown, /fixture:chainlink-rpc/);
  assert.match(a.markdown, /2026-10-19T15:00:00.000Z/);
  const report = JSON.parse(a.json);
  assert.equal(report.largestGaps.length, 1);
  assert.equal(report.multiplierEvents.length, 1);
  assert.equal(report.staleFeeds.length, 1);
  assert.equal(report.observations[0].receiptDigest, null);
  assert.match(a.markdown, /not a share/);
});
test("writes two artifacts without overwriting an existing report", () => {
  const dir = mkdtempSync(join(tmpdir(), "stock-desk-report-"));
  try {
    const input = new URL(
      "./fixtures/stock-desk-snapshot.json",
      import.meta.url,
    );
    const result = writeReport(input, join(dir, "weekly"));
    assert.equal(readFileSync(join(dir, "weekly.md"), "utf8"), result.markdown);
    assert.equal(readFileSync(join(dir, "weekly.json"), "utf8"), result.json);
    assert.throws(() => writeReport(input, join(dir, "weekly")), /EEXIST/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("receipts enabled refuses missing receipts; digest changes with supplied content", () => {
  const snapshot = fixture();
  assert.throws(
    () => generateReport(snapshot, { receiptsEnabled: true }),
    /receipt is missing/,
  );
  snapshot.entries[0].desk.receipt = {
    fixture: "synthetic receipt; digest only",
  };
  const a = JSON.parse(
    generateReport(snapshot, { receiptsEnabled: true }).json,
  );
  assert.match(a.observations[0].receiptDigest, /^sha256:[a-f0-9]{64}$/);
  snapshot.entries[0].desk.receipt.fixture += " changed";
  const b = JSON.parse(
    generateReport(snapshot, { receiptsEnabled: true }).json,
  );
  assert.notEqual(
    a.observations[0].receiptDigest,
    b.observations[0].receiptDigest,
  );
});
test("unknown facts stay unknown and incomplete/malformed/hosted snapshots refuse", () => {
  const snapshot = fixture();
  snapshot.entries[0].desk.gapBps = {
    state: "unknown",
    reason: "fixture unavailable",
  };
  const result = generateReport(snapshot);
  assert.deepEqual(JSON.parse(result.json).largestGaps, []);
  assert.match(result.markdown, /unknown: fixture unavailable/);
  snapshot.coverage.complete = false;
  assert.throws(() => generateReport(snapshot), /Complete bounded/);
  const malformed = fixture();
  delete malformed.entries[0].desk.feed.evidence;
  assert.throws(() => generateReport(malformed), /evidence/);
  const hosted = fixture();
  hosted.entries[0].desk.underlyingQuote = { bid: "100" };
  assert.throws(() => generateReport(hosted), /Hosted price payload excluded/);
});
test("orders absolute gaps exactly, escapes Markdown and accepts a single desk", () => {
  const a = fixture();
  const b = structuredClone(a.entries[0]);
  b.desk.address = `0x${"2".repeat(40)}`;
  b.desk.symbol = "[fixture](x)|<script>";
  b.desk.gapBps.value = "10.000001";
  a.entries.push(b);
  a.coverage.addresses.push(b.desk.address);
  const result = generateReport(a);
  assert.equal(JSON.parse(result.json).largestGaps[0], b.desk.address);
  assert.doesNotMatch(result.markdown, /<script>|\[fixture\]/);
  assert.equal(
    JSON.parse(generateReport(a.entries[0].desk).json).observations.length,
    1,
  );
});
