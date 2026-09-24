export const MAX_BASIS_BYTES = 1_000_000;
export const MAX_BASIS_RECORDS = 500;
export const BASIS_DISPLAY_PLACES = 6;
const BASIS_SCALE = 10n ** BigInt(BASIS_DISPLAY_PLACES);

export type BasisPoint = {
  timestamp: string;
  markPrice: string;
  indexPrice: string;
  markProvenance: { source: string; observedAt: string };
  indexProvenance: { source: string; observedAt: string };
  basisBps: string;
  basisUnits: bigint;
};
export type BasisAnalysis = {
  venue: string;
  chainId: number;
  market: string;
  quoteUnit: string;
  points: BasisPoint[];
  chartData: Array<{ timestamp: string; value: number }> | null;
};

function fail(message: string): never { throw new Error(message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return fail(`${label} must be a non-empty string of at most ${max} characters.`);
  return value;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 30);
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?Z$/.exec(result);
  if (!match) return fail(`${label} must be an explicit UTC timestamp ending in Z.`);
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const date = new Date(Date.parse(result));
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour) || date.getUTCMinutes() !== Number(minute) || date.getUTCSeconds() !== Number(second) || date.getUTCMilliseconds() !== Number(fraction.padEnd(3, "0") || 0)) return fail(`${label} must be a valid explicit UTC timestamp ending in Z.`);
  return result;
}
function price(value: unknown, label: string): { text: string; units: bigint; scale: number } {
  const raw = text(value, label, 56);
  if (!/^(?:0|[1-9]\d{0,35})(?:\.\d{1,18})?$/.test(raw)) return fail(`${label} must be a positive plain decimal with at most 18 fractional digits and 36 integer digits.`);
  const [whole, fraction = ""] = raw.split(".");
  const units = BigInt(`${whole}${fraction}`);
  if (units <= 0n) return fail(`${label} must be positive.`);
  return { text: raw, units, scale: fraction.length };
}
function provenance(value: unknown, label: string) {
  const p = object(value);
  return { source: text(p.source, `${label} source`), observedAt: timestamp(p.observedAt, `${label} observedAt`) };
}
function formatBasis(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / BASIS_SCALE;
  const fraction = (absolute % BASIS_SCALE).toString().padStart(BASIS_DISPLAY_PLACES, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function analyzeBasisRecords(value: unknown): BasisAnalysis {
  const root = object(value);
  if (root.schemaVersion !== 1 || !Array.isArray(root.records) || root.records.length < 2 || root.records.length > MAX_BASIS_RECORDS) return fail("Schema version 1 requires between 2 and 500 records.");
  const venue = text(root.venue, "venue");
  const chainId = root.chainId;
  if (!Number.isSafeInteger(chainId) || (chainId as number) <= 0) return fail("chainId must be a positive safe integer.");
  const market = text(root.market, "market", 180);
  if (!market.includes(":")) return fail("market must be an opaque chain-qualified label containing a colon.");
  const quoteUnit = text(root.quoteUnit, "quoteUnit", 32);
  const points: BasisPoint[] = [];
  let previous = -Infinity;
  let chartAvailable = true;
  const chartData: Array<{ timestamp: string; value: number }> = [];
  for (const [index, entry] of root.records.entries()) {
    const row = object(entry);
    const at = timestamp(row.timestamp, `records[${index}].timestamp`);
    const epoch = Date.parse(at);
    if (epoch <= previous) return fail("Record timestamps must be strictly increasing.");
    previous = epoch;
    const mark = price(row.markPrice, `records[${index}].markPrice`);
    const indexPrice = price(row.indexPrice, `records[${index}].indexPrice`);
    const markProvenance = provenance(row.markProvenance, `records[${index}].markProvenance`);
    const indexProvenance = provenance(row.indexProvenance, `records[${index}].indexProvenance`);
    if (markProvenance.observedAt !== at || indexProvenance.observedAt !== at) return fail("Paired mark and index observations must both be observed exactly at the point timestamp; stale or aligned records are refused.");
    const scale = Math.max(mark.scale, indexPrice.scale);
    const markUnits = mark.units * 10n ** BigInt(scale - mark.scale);
    const indexUnits = indexPrice.units * 10n ** BigInt(scale - indexPrice.scale);
    const basisUnits = ((markUnits - indexUnits) * 10_000n * BASIS_SCALE) / indexUnits;
    const point = { timestamp: at, markPrice: mark.text, indexPrice: indexPrice.text, markProvenance, indexProvenance, basisBps: formatBasis(basisUnits), basisUnits };
    points.push(point);
    if (basisUnits > BigInt(Number.MAX_SAFE_INTEGER) || basisUnits < BigInt(Number.MIN_SAFE_INTEGER)) chartAvailable = false;
    else {
      const value = Number(basisUnits) / Number(BASIS_SCALE);
      if (!Number.isFinite(value)) chartAvailable = false;
      chartData.push({ timestamp: at, value });
    }
  }
  return { venue, chainId: chainId as number, market, quoteUnit, points, chartData: chartAvailable ? chartData : null };
}

export async function readBasisFile(file: File): Promise<BasisAnalysis> {
  if (file.size > MAX_BASIS_BYTES) return fail("File exceeds the 1 MB local import limit.");
  const contents = await file.text();
  if (new TextEncoder().encode(contents).length > MAX_BASIS_BYTES) return fail("File exceeds the 1 MB local import limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(contents); } catch { return fail("File is not valid JSON."); }
  return analyzeBasisRecords(parsed);
}
