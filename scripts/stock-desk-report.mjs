import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TITLE = "State of Robinhood Chain: Stock Tokens";
const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sort(value[key])]),
    );
  return value;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const iso = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
function evidence(rows) {
  assert(
    Array.isArray(rows) && rows.length > 0 && rows.length <= 30,
    "Fact evidence required",
  );
  return rows.map((e) => {
    assert(
      (e.block === null || (Number.isSafeInteger(e.block) && e.block >= 0)) &&
        (e.blockHash === null || /^0x[0-9a-f]{64}$/i.test(e.blockHash)) &&
        iso(e.time) &&
        typeof e.source === "string" &&
        e.source.length > 0 &&
        e.source.length < 2048,
      "Invalid fact evidence",
    );
    return {
      ...(typeof e.value === "string" && typeof e.unit === "string"
        ? { value: e.value, unit: e.unit }
        : {}),
      block: e.block,
      blockHash: e.blockHash,
      time: e.time,
      source: e.source,
    };
  });
}
function fact(f) {
  assert(f && ["available", "unknown"].includes(f.state), "Invalid fact state");
  if (f.state === "unknown") {
    assert(
      typeof f.reason === "string" && f.reason.length > 0,
      "Unknown needs a reason",
    );
    return { state: "unknown", reason: f.reason };
  }
  assert(f.value !== undefined, "Fact value required");
  return { state: "available", value: f.value, evidence: evidence(f.evidence) };
}
function noHosted(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(
      !/^(underlyingQuote|bid|ask|hostedPrice|priceDocument)$/i.test(key),
      "Hosted price payload excluded",
    );
    noHosted(child);
  }
}
const escape = (value) =>
  String(value)
    .replace(/[&<>|`*\[\]\\]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/[\r\n]/g, " ");
export function generateReport(snapshot, { receiptsEnabled = false } = {}) {
  assert(
    snapshot &&
      typeof snapshot === "object" &&
      Buffer.byteLength(JSON.stringify(snapshot)) <= 2_000_000,
    "Bounded snapshot required",
  );
  noHosted(snapshot);
  const index = Array.isArray(snapshot.entries);
  assert(
    snapshot.schemaVersion === 1 && iso(snapshot.observedAt),
    "Invalid snapshot header",
  );
  if (index)
    assert(
      snapshot.coverage?.complete === true &&
        snapshot.entries.length > 0 &&
        snapshot.entries.length <= 10 &&
        snapshot.coverage.addresses.length === snapshot.entries.length,
      "Complete bounded index required",
    );
  const desks = index ? snapshot.entries.map((e) => e.desk) : [snapshot];
  receiptsEnabled = receiptsEnabled || desks.some((d) => Boolean(d?.receipt));
  const addresses = new Set();
  const observations = desks
    .map((d) => {
      assert(
        d &&
          /^0x[0-9a-f]{40}$/i.test(d.address) &&
          !addresses.has(d.address.toLowerCase()) &&
          iso(d.observedAt),
        "Invalid or duplicate desk",
      );
      addresses.add(d.address.toLowerCase());
      assert(
        typeof d.disclaimer === "string" &&
          d.disclaimer.includes("not a share"),
        "Stock Token disclaimer required",
      );
      const receiptDigest = d.receipt
        ? `sha256:${createHash("sha256").update(canonical(d.receipt)).digest("hex")}`
        : null;
      assert(
        !receiptsEnabled || receiptDigest,
        "Receipts enabled but a desk receipt is missing",
      );
      return {
        address: d.address.toLowerCase(),
        symbol: d.symbol,
        observedAt: d.observedAt,
        canonical: d.canonical,
        gapBps: fact(d.gapBps),
        reference: fact(d.reference),
        pool: fact(d.pool),
        multiplier: fact(d.multiplier),
        corporateActions: fact(d.corporateActions),
        feed: fact(d.feed),
        receiptDigest,
        disclaimer: d.disclaimer,
      };
    })
    .sort((a, b) => a.address.localeCompare(b.address));
  if (index)
    assert(
      snapshot.coverage.addresses.every((a) => addresses.has(a.toLowerCase())),
      "Index coverage mismatch",
    );
  const abs = (value) => {
    assert(/^-?\d+(?:\.\d{1,6})?$/.test(value), "Invalid gap decimal");
    const [w, f = ""] = value.replace(/^-/, "").split(".");
    return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, "0"));
  };
  const gaps = observations
    .filter((d) => d.gapBps.state === "available")
    .sort((a, b) => {
      const x = abs(a.gapBps.value),
        y = abs(b.gapBps.value);
      return x === y ? a.address.localeCompare(b.address) : x > y ? -1 : 1;
    });
  const events = observations.filter(
    (d) =>
      d.multiplier.state === "available" &&
      d.multiplier.value.scheduled !== null &&
      (d.multiplier.value.effectiveAt === null ||
        Date.parse(d.multiplier.value.effectiveAt) >
          Date.parse(snapshot.observedAt)),
  );
  const stale = observations.filter(
    (d) => d.feed.state === "available" && d.feed.value.stale === true,
  );
  const report = {
    title: TITLE,
    schemaVersion: 1,
    observedAt: snapshot.observedAt,
    label: "data, not advice",
    coverage: index ? snapshot.coverage.basis : "One token snapshot",
    receiptsEnabled,
    largestGaps: gaps.map((d) => d.address),
    multiplierEvents: events.map((d) => d.address),
    staleFeeds: stale.map((d) => d.address),
    observations,
    limitations:
      "No network access or publishing. USDG units are not dollars. Independent non-final anchors; explorer block and upstream calculation time unknown. Receipt digests identify supplied receipts; signature and timestamp verification are separate.",
  };
  const lines = [
    `# ${TITLE}`,
    "",
    `Snapshot: ${escape(report.observedAt)}. data, not advice.`,
    "",
    escape(report.coverage),
    "",
    report.limitations,
    "",
  ];
  const section = (title, rows, fields) => {
    lines.push(
      `## ${title}`,
      "",
      "| Token | Observation | Block, time and source | Receipt digest |",
      "| --- | --- | --- | --- |",
    );
    for (const d of rows)
      for (const key of fields) {
        const f = d[key];
        lines.push(
          `| ${escape(d.symbol ?? d.address)} · ${d.address} | ${key}: ${escape(f.state === "available" ? canonical(f.value) : `unknown: ${f.reason}`)} | ${f.state === "available" ? f.evidence.map((e) => `block ${e.block ?? "unknown"} (${e.blockHash ?? "unknown hash"}); ${escape(e.time)}; ${escape(e.source)}${e.value ? `; ${escape(e.value)} ${escape(e.unit)}` : ""}`).join("; ") : "unknown"} | ${d.receiptDigest ?? "receipts off"} |`,
        );
      }
    if (!rows.length)
      lines.push(
        "| No matching entries in this snapshot | Unknown facts remain unknown | — | — |",
      );
    lines.push("");
  };
  section("Largest absolute gaps (bps)", gaps, ["gapBps", "reference", "pool"]);
  section("Multiplier events", events, ["multiplier", "corporateActions"]);
  section("Stale feeds", stale, ["feed"]);
  section("Snapshot coverage and unknowns", observations, [
    "gapBps",
    "multiplier",
    "corporateActions",
    "feed",
  ]);
  lines.push(
    ...[...new Set(observations.map((d) => escape(d.disclaimer)))],
    "",
  );
  return {
    markdown: lines.join("\n"),
    json: `${JSON.stringify(sort(report), null, 2)}\n`,
  };
}
export function writeReport(input, outputPrefix, options) {
  const body = readFileSync(input, "utf8");
  assert(Buffer.byteLength(body) <= 2_000_000, "Snapshot too large");
  const result = generateReport(JSON.parse(body), options);
  writeFileSync(`${outputPrefix}.md`, result.markdown, { flag: "wx" });
  writeFileSync(`${outputPrefix}.json`, result.json, { flag: "wx" });
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , input, outputPrefix, flag] = process.argv;
  assert(
    input &&
      outputPrefix &&
      (!flag || flag === "--receipts") &&
      process.argv.length <= 5,
    "Usage: node scripts/stock-desk-report.mjs snapshot.json output-prefix [--receipts]",
  );
  writeReport(input, outputPrefix, { receiptsEnabled: flag === "--receipts" });
}
