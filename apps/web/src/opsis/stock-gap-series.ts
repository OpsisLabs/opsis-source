import { stockGap } from "./stock-gap";

export type StockGapSeries = {
  schemaVersion: 1;
  instrument: { chainId: number; address: string; symbol?: string };
  quoteCurrency: "USD" | "USDG";
  referenceType: "underlying" | "oracle";
  sourceName: string;
  observedAt: string;
  observations: Array<{
    timestamp: string;
    dexPrice: string;
    referencePrice: string;
    multiplier: string | null;
    gapPercent: string;
    chartGapPercent: number;
    session: "open" | "closed" | "unknown";
    oracleAgeMinutes: number | null;
    corporateAction: {
      state: "none_reported" | "announced" | "effective" | "unknown";
      description?: string;
    };
  }>;
  warnings: string[];
};

const MAX_OBSERVATIONS = 730;
const MAX_GAP_PERCENT = 1_000_000;
const DECIMAL = /^(?:0|[1-9]\d{0,35})(?:\.\d{1,36})?$/;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label} contains an unsupported field`);
}

function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > max)
    throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  return value;
}

function timestamp(value: unknown, label: string): { value: string; ms: number } {
  const valueText = text(value, label, 24);
  const ms = Date.parse(valueText);
  if (!UTC_ISO.test(valueText) || !Number.isFinite(ms) || new Date(ms).toISOString() !== normalizeIso(valueText))
    throw new Error(`${label} must be a valid ISO UTC timestamp`);
  return { value: valueText, ms };
}

function normalizeIso(value: string): string {
  return value.includes(".") ? `${value.slice(0, -1).padEnd(23, "0")}Z` : `${value.slice(0, -1)}.000Z`;
}

function positiveDecimal(value: unknown, label: string): string {
  if (typeof value !== "string" || !DECIMAL.test(value) || /^0(?:\.0+)?$/.test(value))
    throw new Error(`${label} must be a positive decimal string`);
  return value;
}

/** Validates and calculates a bounded local stock-token series. Input values are untrusted data. */
export function parseStockGapSeries(raw: unknown): StockGapSeries {
  const root = record(raw, "series");
  onlyKeys(root, ["schemaVersion", "instrument", "quoteCurrency", "referenceQuoteCurrency", "referenceType", "sourceName", "observedAt", "observations"], "series");
  if (root.schemaVersion !== 1) throw new Error("Unsupported schemaVersion");
  const instrumentRaw = record(root.instrument, "instrument");
  onlyKeys(instrumentRaw, ["chainId", "address", "symbol"], "instrument");
  const chainId = instrumentRaw.chainId;
  if (chainId !== 4663) throw new Error("instrument.chainId must be Robinhood Chain (4663)");
  const address = text(instrumentRaw.address, "instrument.address", 128);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("instrument.address must be a 20-byte EVM address");
  const symbol = instrumentRaw.symbol === undefined ? undefined : text(instrumentRaw.symbol, "instrument.symbol", 24);
  const quoteCurrency = root.quoteCurrency;
  if (quoteCurrency !== "USD" && quoteCurrency !== "USDG") throw new Error("quoteCurrency must be USD or USDG");
  if (root.referenceQuoteCurrency !== quoteCurrency) throw new Error("reference and DEX quote currencies must match");
  const referenceType = root.referenceType;
  if (referenceType !== "underlying" && referenceType !== "oracle") throw new Error("referenceType must be underlying or oracle");
  const sourceName = text(root.sourceName, "sourceName");
  const sourceObservedAt = timestamp(root.observedAt, "observedAt").value;
  if (!Array.isArray(root.observations) || root.observations.length < 2 || root.observations.length > MAX_OBSERVATIONS)
    throw new Error(`observations must contain 2 to ${MAX_OBSERVATIONS} rows`);

  const warnings = ["source_provenance_unverified"];
  const observations: StockGapSeries["observations"] = [];
  let previousTime = -Infinity;
  let latestObservationTime = -Infinity;
  for (const [index, item] of root.observations.entries()) {
    const row = record(item, `observations[${index}]`);
    onlyKeys(row, ["timestamp", "dexPrice", "referencePrice", "multiplier", "session", "oracleObservedAt", "corporateAction"], `observations[${index}]`);
    const time = timestamp(row.timestamp, `observations[${index}].timestamp`);
    if (time.ms <= previousTime) throw new Error("observation timestamps must be unique and strictly increasing");
    previousTime = time.ms;
    latestObservationTime = time.ms;
    const dex = positiveDecimal(row.dexPrice, `observations[${index}].dexPrice`);
    const reference = positiveDecimal(row.referencePrice, `observations[${index}].referencePrice`);
    if (referenceType === "oracle" && row.multiplier !== undefined) throw new Error("oracle rows must not include a multiplier");
    if (referenceType === "underlying" && row.oracleObservedAt !== undefined) throw new Error("underlying rows must not include oracleObservedAt");
    const multiplier = referenceType === "underlying"
      ? positiveDecimal(row.multiplier, `observations[${index}].multiplier`)
      : "1";
    const session = row.session;
    if (session !== "open" && session !== "closed" && session !== "unknown") throw new Error("session must be open, closed, or unknown");
    if (session === "unknown" && !warnings.includes("session_unknown")) warnings.push("session_unknown");
    const oracleAgeMinutes = referenceType === "oracle"
      ? (() => {
          const observed = timestamp(row.oracleObservedAt, `observations[${index}].oracleObservedAt`);
          if (observed.ms > time.ms) throw new Error("oracleObservedAt must not be later than timestamp");
          const age = (time.ms - observed.ms) / 60_000;
          return age;
        })()
      : null;
    const gapPercent = stockGap({ dex, reference, multiplier, mode: referenceType, unit: quoteCurrency, referenceUnit: quoteCurrency });
    const chartGapPercent = Number(gapPercent);
    if (!Number.isFinite(chartGapPercent) || Math.abs(chartGapPercent) > MAX_GAP_PERCENT)
      throw new Error("gap is outside the safe chart range");
    let corporateAction: StockGapSeries["observations"][number]["corporateAction"] = { state: "unknown" };
    if (row.corporateAction !== undefined) {
      const action = record(row.corporateAction, `observations[${index}].corporateAction`);
      onlyKeys(action, ["state", "description"], `observations[${index}].corporateAction`);
      if (!["none_reported", "announced", "effective", "unknown"].includes(String(action.state)))
        throw new Error("corporateAction.state must be none_reported, announced, effective, or unknown");
      if (action.state === "announced" || action.state === "effective") {
        corporateAction = { state: action.state as "announced" | "effective", description: text(action.description, "corporateAction.description", 160) };
      } else {
        if (action.description !== undefined) throw new Error("corporateAction.description is only allowed for announced or effective actions");
        corporateAction = { state: action.state as "none_reported" | "unknown" };
      }
    }
    if (corporateAction.state === "unknown" && !warnings.includes("corporate_action_state_unknown")) warnings.push("corporate_action_state_unknown");
    observations.push({ timestamp: time.value, dexPrice: dex, referencePrice: reference, multiplier: referenceType === "underlying" ? multiplier : null, gapPercent, chartGapPercent, session, oracleAgeMinutes, corporateAction });
  }
  if (timestamp(root.observedAt, "observedAt").ms < latestObservationTime)
    throw new Error("observedAt must be at or after every observation timestamp");
  return {
    schemaVersion: 1,
    instrument: { chainId: chainId as number, address, ...(symbol ? { symbol } : {}) },
    quoteCurrency,
    referenceType,
    sourceName,
    observedAt: sourceObservedAt,
    observations,
    warnings,
  };
}
