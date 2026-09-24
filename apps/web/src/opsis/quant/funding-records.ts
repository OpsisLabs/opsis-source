export type FundingRecord = {
  venue: string;
  instrument: { chainId: number; market: string };
  timestamp: string;
  status: "realized" | "predicted";
  quotedIntervalSeconds: number;
  paidIntervalSeconds: number;
  direction: "paid" | "received";
  notionalConvention: string;
  notional: string;
  quoteUnit: string;
  amount: string;
  provenance: { source: string; observedAt: string };
};

export type FundingAnalysis = {
  records: FundingRecord[];
  cumulativeByRecord: string[];
  chartData: Array<{ timestamp: string; value: number }> | null;
  realizedNet: string;
  realizedCount: number;
  predictedCount: number;
  venue: string;
  chainId: number;
  market: string;
  quoteUnit: string;
};

const MAX_BYTES = 1_000_000;
const MAX_RECORDS = 500;
const DECIMAL = /^(?:0|[1-9]\d{0,23})(?:\.\d{1,18})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function fail(message: string): never { throw new Error(message); }
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}
function parsedDate(value: unknown, label: string): number {
  if (typeof value !== "string" || !DATE.test(value)) fail(`${label} must be an explicit UTC timestamp.`);
  const ms = Date.parse(value);
  const fraction = value.match(/\.(\d{1,3})Z$/)?.[1] ?? "000";
  const normalized = value.replace(/(?:\.\d{1,3})?Z$/, `.${fraction.padEnd(3, "0")}Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== normalized) fail(`${label} is invalid.`);
  return ms;
}
function decimal(value: unknown, label: string): { units: bigint; scale: number; text: string } {
  if (typeof value !== "string" || !DECIMAL.test(value)) fail(`${label} must be a plain non-negative decimal string with at most 18 fractional digits.`);
  const [whole, fraction = ""] = value.split(".");
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length, text: value };
}
function signedUnits(record: FundingRecord, scale: number): bigint {
  const parsed = decimal(record.amount, "amount");
  const aligned = parsed.units * 10n ** BigInt(scale - parsed.scale);
  return record.direction === "paid" ? -aligned : aligned;
}
function formatUnits(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const remainder = absolute % divisor;
  const fraction = scale ? `.${remainder.toString().padStart(scale, "0")}`.replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction === "." ? "" : fraction}`;
}

export function analyzeFundingRecords(input: unknown): FundingAnalysis {
  if (!isObject(input) || input.schemaVersion !== 1 || !Array.isArray(input.records)) fail("Expected funding JSON schemaVersion 1 with a records array.");
  if (input.records.length < 1 || input.records.length > MAX_RECORDS) fail(`Record count must be between 1 and ${MAX_RECORDS}.`);
  const records: FundingRecord[] = [];
  let previous = -Infinity;
  let identity = "";
  let unit = "";
  let convention = "";
  let scale = 0;
  let realizedCount = 0;
  let predictedCount = 0;
  for (const raw of input.records) {
    if (!isObject(raw) || !isObject(raw.instrument) || !isObject(raw.provenance)) fail("Each record must include instrument and provenance objects.");
    const r = raw as unknown as FundingRecord;
    if (!validText(r.venue) || !Number.isSafeInteger(r.instrument.chainId) || r.instrument.chainId <= 0 || !validText(r.instrument.market) || !r.instrument.market.includes(":")) fail("Venue and chain-qualified market identity are required.");
    if (r.status !== "realized" && r.status !== "predicted") fail("Status must be realized or predicted.");
    if (r.direction !== "paid" && r.direction !== "received") fail("Direction must explicitly be paid or received.");
    if (!validText(r.notionalConvention) || !validText(r.quoteUnit) || !validText(r.provenance.source)) fail("Notional convention, quote unit, and provenance source are required.");
    const stamp = parsedDate(r.timestamp, "timestamp");
    const observedAt = parsedDate(r.provenance.observedAt, "observedAt");
    if (r.status === "realized" && observedAt < stamp) fail("Realized provenance observedAt cannot precede settlement timestamp.");
    if (stamp <= previous) fail("Timestamps must be strictly increasing with no duplicates.");
    previous = stamp;
    for (const [name, value] of [["quotedIntervalSeconds", r.quotedIntervalSeconds], ["paidIntervalSeconds", r.paidIntervalSeconds]] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 31_536_000) fail(`${name} must be between 1 second and 365 days.`);
    }
    const amount = decimal(r.amount, "amount");
    const notional = decimal(r.notional, "notional");
    const commonScale = Math.max(amount.scale, notional.scale);
    const amountAligned = amount.units * 10n ** BigInt(commonScale - amount.scale);
    const notionalAligned = notional.units * 10n ** BigInt(commonScale - notional.scale);
    if (amount.units <= 0n || notional.units <= 0n || amountAligned > notionalAligned) fail("Amount and notional must be positive, and amount cannot exceed notional.");
    const key = `${r.venue}\u0000${r.instrument.chainId}\u0000${r.instrument.market}\u0000${r.notionalConvention}`;
    if (!identity) { identity = key; unit = r.quoteUnit; convention = r.notionalConvention; scale = amount.scale; }
    if (key !== identity || r.quoteUnit !== unit || r.notionalConvention !== convention) fail("Records must use one venue, chain-qualified market, notional convention, and quote unit.");
    scale = Math.max(scale, amount.scale);
    records.push(r);
    if (r.status === "realized") realizedCount++;
    else predictedCount++;
  }
  // Recompute at final common decimal scale so every displayed cumulative point aligns exactly.
  let cumulative = 0n;
  let chartAvailable = true;
  const cumulativeByRecord = records.map((r) => {
    if (r.status === "realized") cumulative += signedUnits(r, scale);
    return r.status === "realized" ? formatUnits(cumulative, scale) : "";
  });
  const net = cumulative;
  if (net > 10n ** 42n || net < -(10n ** 42n)) fail("Cumulative amount exceeds the supported exact arithmetic bound.");
  const chartData: Array<{ timestamp: string; value: number }> = [];
  cumulative = 0n;
  for (const r of records) {
    if (r.status !== "realized") continue;
    cumulative += signedUnits(r, scale);
    let chartUnits = cumulative;
    let chartScale = scale;
    while (chartScale > 0 && chartUnits % 10n === 0n) { chartUnits /= 10n; chartScale--; }
    if (chartUnits > BigInt(Number.MAX_SAFE_INTEGER) || chartUnits < BigInt(Number.MIN_SAFE_INTEGER)) { chartAvailable = false; break; }
    const value = Number(chartUnits) / 10 ** chartScale;
    if (!Number.isFinite(value)) { chartAvailable = false; break; }
    chartData.push({ timestamp: r.timestamp, value });
  }
  const first = records[0]!;
  return { records, cumulativeByRecord, chartData: chartAvailable ? chartData : null, realizedNet: formatUnits(net, scale), realizedCount, predictedCount, venue: first.venue, chainId: first.instrument.chainId, market: first.instrument.market, quoteUnit: unit };
}

export async function readFundingFile(file: File): Promise<FundingAnalysis> {
  if (file.size > MAX_BYTES) fail("File exceeds the 1 MB local import limit.");
  const text = await file.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES) fail("File exceeds the 1 MB local import limit.");
  let json: unknown;
  try { json = JSON.parse(text); } catch { fail("File is not valid JSON."); }
  return analyzeFundingRecords(json);
}
