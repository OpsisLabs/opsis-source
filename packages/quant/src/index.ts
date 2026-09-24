export type Clock = "daily_crypto_24_7";

export interface InstrumentIdentity {
  chainId: number;
  address: string;
  symbol: string;
  name?: string;
}

export interface DatasetProvenance {
  source: string;
  observedAt: string;
  sourceUrl?: string;
}

export interface PriceObservation {
  date: string;
  price: number;
}

export interface PriceDataset {
  schemaVersion: 1;
  instrument: InstrumentIdentity;
  quoteCurrency: string;
  clock: Clock;
  provenance: DatasetProvenance;
  observations: PriceObservation[];
  synthetic?: boolean;
}

export type DatasetIssueCode =
  | "malformed"
  | "unsupported_clock"
  | "duplicate_date"
  | "out_of_order"
  | "gap"
  | "incomplete_current_observation"
  | "invalid_price"
  | "insufficient_history";

export interface DatasetIssue {
  code: DatasetIssueCode;
  message: string;
  index?: number;
}

export interface DatasetValidation {
  ok: boolean;
  dataset?: PriceDataset;
  issues: DatasetIssue[];
  returns: number;
}

export interface ExperimentSpec {
  bootstrapRuns: number;
  seed: number;
  researchMode: boolean;
  confidence: number;
  model?: "historical_iid_bootstrap" | "historical_moving_block_bootstrap";
  blockLength?: number;
}

export interface RealizedStats {
  returns: number;
  totalReturn: number;
  volatilityAnnualized: number;
  maxDrawdown: number;
  tailCount: number;
  warnings: string[];
}

export interface ObservedDrawdown {
  points: Array<{ date: string; peakDate: string; drawdown: number }>;
  maxDrawdown: number;
}

/** Dated peak-to-trough loss on the observed instrument, with no gap filling. */
export function observedDrawdown(dataset: PriceDataset): ObservedDrawdown {
  const checked = validateDataset(dataset);
  if (!checked.ok || !checked.dataset)
    throw new Error(checked.issues.map((item) => item.message).join(" "));
  let peak = checked.dataset.observations[0]!.price;
  let peakDate = checked.dataset.observations[0]!.date;
  let maxDrawdown = 0;
  const points = checked.dataset.observations.map(({ date, price }) => {
    if (price > peak) {
      peak = price;
      peakDate = date;
    }
    const ratio = price / peak;
    if (!Number.isFinite(ratio) || ratio <= 0)
      throw new Error("Price ratios exceed numeric precision limits.");
    const drawdown = ratio - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    return { date, peakDate, drawdown };
  });
  return { points, maxDrawdown };
}

export interface ReturnHistogram {
  observations: number;
  /** Inclusive lower edges and a final exclusive edge; the final bin includes its upper edge. */
  edges: number[];
  counts: number[];
  tailThreshold: number;
  negativeTailCount: number;
  positiveTailCount: number;
}

/** Summarize observed simple returns with deterministic equal-width sample bins. */
export function observedReturnHistogram(
  returns: readonly number[],
  binCount = 12,
  tailThreshold = 0.05,
): ReturnHistogram {
  if (!Array.isArray(returns) || returns.length === 0 || returns.some((value) => !Number.isFinite(value) || value <= -1))
    throw new Error("Observed returns must be a non-empty list of finite values greater than -1.");
  if (!Number.isSafeInteger(binCount) || binCount < 1 || binCount > 100)
    throw new Error("Bin count must be an integer from 1 to 100.");
  if (!Number.isFinite(tailThreshold) || tailThreshold <= 0)
    throw new Error("Tail threshold must be a positive finite return fraction.");
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const halfWidth = max === min ? Math.max(Math.abs(min) * 0.01, 0.005) : 0;
  const lower = min - halfWidth;
  const upper = max + halfWidth;
  const width = (upper - lower) / binCount;
  const edges = Array.from({ length: binCount + 1 }, (_, index) =>
    index === binCount ? upper : lower + width * index,
  );
  if (edges.some((edge, index) => index > 0 && edge <= edges[index - 1]!))
    throw new Error("Histogram bins cannot be represented as distinct numeric edges for this sample.");
  const counts = Array.from({ length: binCount }, () => 0);
  for (const value of returns) {
    const index = Math.min(binCount - 1, Math.floor((value - lower) / width));
    counts[Math.max(0, index)]!++;
  }
  return {
    observations: returns.length,
    edges,
    counts,
    tailThreshold,
    negativeTailCount: returns.filter((value) => value <= -tailThreshold).length,
    positiveTailCount: returns.filter((value) => value >= tailThreshold).length,
  };
}

export interface BootstrapResult {
  runs: number;
  seed: number;
  horizon: number;
  confidence: number;
  terminal: { low: number; median: number; high: number };
  path: Array<{ date: string; low: number; median: number; high: number;
    bands: Array<{ confidence: 0.5 | 0.8 | 0.95; low: number; high: number }> }>;
}

export interface QuantRun {
  datasetHash: string;
  manifest: {
    seed: number;
    model: "historical_iid_bootstrap" | "historical_moving_block_bootstrap";
    modelVersion: "1";
    blockLength?: number;
    bootstrapRuns: number;
    confidence: number;
    researchMode: boolean;
    horizon: number;
    units: "normalized_wealth";
    inputRefs: { instrument: string; quoteCurrency: string };
    assumptions: string[];
  };
  stats: RealizedStats;
  bootstrap: BootstrapResult;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OBSERVATIONS = 10_000;
const MAX_RUNS = 2_000;

function issue(
  code: DatasetIssueCode,
  message: string,
  index?: number,
): DatasetIssue {
  return index === undefined ? { code, message } : { code, message, index };
}

function finiteString(value: unknown, max = 180): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

export function validateDataset(
  value: unknown,
  now = new Date(),
  options: { minimumReturns?: number } = {},
): DatasetValidation {
  const issues: DatasetIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      issues: [
        issue(
          "malformed",
          "Dataset must be an object with explicit metadata and observations.",
        ),
      ],
      returns: 0,
    };
  }
  const v = value as Record<string, unknown>;
  const instrument = v.instrument;
  const provenance = v.provenance;
  if (
    v.schemaVersion !== 1 ||
    !instrument ||
    typeof instrument !== "object" ||
    Array.isArray(instrument)
  )
    issues.push(
      issue(
        "malformed",
        "schemaVersion 1 and instrument identity are required.",
      ),
    );
  if (
    !finiteString(v.quoteCurrency, 12) ||
    !/^[A-Z0-9._-]+$/.test(v.quoteCurrency)
  )
    issues.push(
      issue("malformed", "quoteCurrency must be an explicit currency code."),
    );
  if (v.clock !== "daily_crypto_24_7")
    issues.push(
      issue(
        "unsupported_clock",
        "Only daily crypto 24/7 observations are supported.",
      ),
    );
  if (
    !provenance ||
    typeof provenance !== "object" ||
    Array.isArray(provenance)
  )
    issues.push(
      issue("malformed", "source and observedAt provenance are required."),
    );
  const i =
    instrument && typeof instrument === "object" && !Array.isArray(instrument)
      ? (instrument as Record<string, unknown>)
      : {};
  if (
    !Number.isSafeInteger(i.chainId) ||
    (i.chainId as number) <= 0 ||
    !finiteString(i.address, 128) ||
    !/^0x[0-9a-fA-F]{40}$/.test(i.address) ||
    !finiteString(i.symbol, 32)
  )
    issues.push(
      issue(
        "malformed",
        "Instrument needs a safe chainId, 20-byte address and symbol.",
      ),
    );
  const p =
    provenance && typeof provenance === "object" && !Array.isArray(provenance)
      ? (provenance as Record<string, unknown>)
      : {};
  if (
    !finiteString(p.source) ||
    !finiteString(p.observedAt, 64) ||
    (p.sourceUrl !== undefined &&
      (!finiteString(p.sourceUrl, 500) ||
        !/^https:\/\/[^\s:@]+(?:\/|$)/.test(p.sourceUrl)))
  )
    issues.push(
      issue(
        "malformed",
        "Provenance needs source, safe observedAt and an optional HTTPS source URL.",
      ),
    );
  if (v.synthetic !== undefined && typeof v.synthetic !== "boolean")
    issues.push(issue("malformed", "synthetic must be boolean when present."));
  const obs = v.observations;
  if (!Array.isArray(obs) || obs.length > MAX_OBSERVATIONS)
    issues.push(
      issue(
        "malformed",
        `observations must be an array of at most ${MAX_OBSERVATIONS} rows.`,
      ),
    );
  if (!Array.isArray(obs) || obs.length > MAX_OBSERVATIONS)
    return { ok: false, issues, returns: 0 };
  const rows = obs;
  let previous = "";
  const seen = new Set<string>();
  for (let n = 0; n < rows.length; n += 1) {
    const row = rows[n];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      issues.push(
        issue("malformed", "Each observation must contain date and price.", n),
      );
      continue;
    }
    const r = row as Record<string, unknown>;
    const date = r.date;
    const price = r.price;
    if (
      typeof date !== "string" ||
      !DATE.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      issues.push(
        issue("malformed", "Dates must use YYYY-MM-DD calendar dates.", n),
      );
    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > Number.MAX_VALUE / 4
    )
      issues.push(
        issue(
          "invalid_price",
          "Price must be finite, positive and within numeric bounds.",
          n,
        ),
      );
    if (typeof date === "string" && DATE.test(date)) {
      if (seen.has(date))
        issues.push(
          issue(
            "duplicate_date",
            `Duplicate date ${date}; rows are never silently merged.`,
            n,
          ),
        );
      if (previous && date <= previous)
        issues.push(
          issue(
            "out_of_order",
            "Dates must be strictly ascending; rows are never silently sorted.",
            n,
          ),
        );
      seen.add(date);
      previous = date;
    }
  }
  if (rows.length > 0 && finiteString(p.observedAt, 64)) {
    const lastDate = (rows[rows.length - 1] as Record<string, unknown>)?.date;
    if (
      typeof lastDate === "string" &&
      DATE.test(lastDate) &&
      lastDate >= now.toISOString().slice(0, 10)
    )
      issues.push(
        issue(
          "incomplete_current_observation",
          "The current UTC day is incomplete; provide a closed daily observation.",
        ),
      );
    if (
      typeof p.observedAt === "string" &&
      (Number.isNaN(Date.parse(p.observedAt)) ||
        !/^\d{4}-\d{2}-\d{2}T/.test(p.observedAt))
    )
      issues.push(issue("malformed", "observedAt must be an ISO timestamp."));
    if (
      typeof p.observedAt === "string" &&
      !Number.isNaN(Date.parse(p.observedAt)) &&
      typeof lastDate === "string" &&
      (Date.parse(p.observedAt) <
        Date.parse(`${lastDate}T00:00:00Z`) + 86400000 ||
        Date.parse(p.observedAt) > now.getTime())
    )
      issues.push(
        issue(
          "malformed",
          "observedAt must be on or after the final closed observation.",
        ),
      );
  }
  for (let n = 1; n < rows.length; n += 1) {
    const a = (rows[n - 1] as Record<string, unknown>)?.date;
    const b = (rows[n] as Record<string, unknown>)?.date;
    if (
      typeof a === "string" &&
      typeof b === "string" &&
      DATE.test(a) &&
      DATE.test(b)
    ) {
      const days =
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
        86_400_000;
      if (days !== 1)
        issues.push(
          issue(
            "gap",
            `Expected consecutive daily observations between ${a} and ${b}; found ${days} days.`,
            n,
          ),
        );
    }
  }
  const returns = Math.max(0, rows.length - 1);
  const minimumReturns = options.minimumReturns ?? 30;
  if (returns < minimumReturns)
    issues.push(
      issue(
        "insufficient_history",
        `At least ${minimumReturns} daily returns are required for this method.`,
      ),
    );
  if (issues.length > 0) return { ok: false, issues, returns };
  const clean: PriceDataset = {
    schemaVersion: 1,
    instrument: {
      chainId: i.chainId as number,
      address: i.address as string,
      symbol: i.symbol as string,
      ...(finiteString(i.name, 120) ? { name: i.name } : {}),
    },
    quoteCurrency: String(v.quoteCurrency ?? "")
      .trim()
      .toUpperCase(),
    clock: "daily_crypto_24_7",
    provenance: {
      source: p.source as string,
      observedAt: p.observedAt as string,
      ...(finiteString(p.sourceUrl, 500) ? { sourceUrl: p.sourceUrl } : {}),
    },
    observations: rows.map((row) => {
      const r = row as Record<string, unknown>;
      return { date: r.date as string, price: r.price as number };
    }),
    ...(v.synthetic === true ? { synthetic: true } : {}),
  };
  return {
    ok: issues.length === 0,
    dataset: issues.length === 0 ? clean : undefined,
    issues,
    returns,
  };
}

export function parseCsv(
  text: string,
  metadata: Omit<PriceDataset, "observations">,
): PriceDataset {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2)
    throw new Error("CSV needs a header and at least one row.");
  if (lines.length > MAX_OBSERVATIONS + 1)
    throw new Error(`CSV is limited to ${MAX_OBSERVATIONS} observations.`);
  const header = lines[0]!.split(",").map((x) => x.trim().toLowerCase());
  const dateIndex = header.indexOf("date");
  const priceIndex = header.indexOf("price");
  if (dateIndex < 0 || priceIndex < 0)
    throw new Error("CSV must have date and price columns.");
  const observations = lines.slice(1).map((line) => {
    const values = line.split(",");
    return {
      date: values[dateIndex]?.trim() ?? "",
      price: Number(values[priceIndex]),
    };
  });
  return { ...metadata, observations };
}

export function canonicalDataset(dataset: PriceDataset): string {
  return JSON.stringify({
    schemaVersion: 1,
    instrument: {
      chainId: dataset.instrument.chainId,
      address: dataset.instrument.address.toLowerCase(),
      symbol: dataset.instrument.symbol,
      ...(dataset.instrument.name ? { name: dataset.instrument.name } : {}),
    },
    quoteCurrency: dataset.quoteCurrency,
    clock: dataset.clock,
    provenance: {
      source: dataset.provenance.source,
      observedAt: dataset.provenance.observedAt,
      ...(dataset.provenance.sourceUrl
        ? { sourceUrl: dataset.provenance.sourceUrl }
        : {}),
    },
    observations: dataset.observations.map(({ date, price }) => ({
      date,
      price,
    })),
    synthetic: Boolean(dataset.synthetic),
  });
}

export async function datasetHash(dataset: PriceDataset): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDataset(dataset));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  throw new Error(
    "SHA-256 is unavailable; refusing an unverifiable dataset hash.",
  );
}

function quantile(sorted: number[], q: number): number {
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function realizedStats(dataset: PriceDataset): RealizedStats {
  const checked = validateDataset(dataset);
  if (!checked.ok)
    throw new Error(checked.issues.map((x) => x.message).join(" "));
  const prices = dataset.observations.map((x) => x.price);
  const returns = prices.slice(1).map((price, n) => price / prices[n]! - 1);
  if (returns.some((x) => !Number.isFinite(x) || x <= -1))
    throw new Error("Price ratios exceed numeric precision limits.");
  const mean = returns.reduce((sum, x) => sum + x, 0) / returns.length;
  const variance =
    returns.length > 1
      ? returns.reduce((sum, x) => sum + (x - mean) ** 2, 0) /
        (returns.length - 1)
      : 0;
  let peak = prices[0]!;
  let maxDrawdown = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    maxDrawdown = Math.min(maxDrawdown, price / peak - 1);
  }
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const tailCount = returns.filter(
    (x) => x <= quantile(sortedReturns, 0.05),
  ).length;
  if (
    ![
      mean,
      variance,
      prices[prices.length - 1]! / prices[0]! - 1,
      Math.sqrt(variance * 365),
    ].every(Number.isFinite)
  )
    throw new Error("Statistics exceed numeric precision limits.");
  return {
    returns: returns.length,
    totalReturn: prices[prices.length - 1]! / prices[0]! - 1,
    volatilityAnnualized: Math.sqrt(Math.max(0, variance) * 365),
    maxDrawdown,
    tailCount,
    warnings:
      tailCount < 20
        ? ["Tail count is below 20; tail interpretation is unstable."]
        : [],
  };
}

export function runQuant(
  dataset: PriceDataset,
  spec: ExperimentSpec,
  cancelled: () => boolean = () => false,
): Omit<QuantRun, "datasetHash"> {
  if (
    !Number.isSafeInteger(spec.seed) ||
    spec.seed < 0 ||
    spec.seed > 4294967295 ||
    !Number.isSafeInteger(spec.bootstrapRuns) ||
    spec.bootstrapRuns < 1 ||
    spec.bootstrapRuns > MAX_RUNS ||
    !Number.isFinite(spec.confidence) ||
    spec.confidence < 0.5 ||
    spec.confidence > 0.99 ||
    typeof spec.researchMode !== "boolean"
  )
    throw new Error(
      "Seed, bootstrap runs, mode and confidence must be finite bounded values.",
    );
  const validation = validateDataset(dataset, new Date(), {
    minimumReturns: spec.researchMode ? 30 : 180,
  });
  if (!validation.ok)
    throw new Error(validation.issues.map((x) => x.message).join(" "));
  const stats = realizedStats(dataset);
  const runs = spec.bootstrapRuns;
  const confidence = spec.confidence;
  const returns = dataset.observations
    .slice(1)
    .map((row, n) => row.price / dataset.observations[n]!.price - 1);
  if (returns.length > 730)
    throw new Error("This bounded v1 run supports at most 730 daily returns.");
  const model = spec.model ?? "historical_iid_bootstrap";
  if (model !== "historical_iid_bootstrap" && model !== "historical_moving_block_bootstrap")
    throw new Error("Unsupported bootstrap model.");
  if (model === "historical_iid_bootstrap" && spec.blockLength !== undefined)
    throw new Error("Block length applies only to moving-block bootstrap.");
  const blockLength = model === "historical_moving_block_bootstrap" ? spec.blockLength : undefined;
  const maxBlockLength = Math.min(30, Math.floor(returns.length / 2));
  if (model === "historical_moving_block_bootstrap" &&
    (!Number.isSafeInteger(blockLength) || blockLength! < 2 || blockLength! > maxBlockLength))
    throw new Error(`Block length must be an integer from 2 to ${maxBlockLength} for this history window.`);
  const draws: number[][] = Array.from(
    { length: dataset.observations.length },
    () => [],
  );
  const terminal: number[] = [];
  const random = rng(spec.seed);
  const alpha = (1 - confidence) / 2;
  for (let run = 0; run < runs; run += 1) {
    let value = 1;
    let blockStart = 0;
    for (let step = 0; step < returns.length; step += 1) {
      if (cancelled()) throw new Error("cancelled");
      if (blockLength !== undefined && step % blockLength === 0)
        blockStart = Math.floor(random() * (returns.length - blockLength + 1));
      const sampled = blockLength === undefined
        ? returns[Math.floor(random() * returns.length)]!
        : returns[blockStart + (step % blockLength)]!;
      value *= 1 + sampled;
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Numeric overflow or underflow in bootstrap path.");
      draws[step + 1]!.push(value);
    }
    terminal.push(value);
  }
  const dates = dataset.observations.map((_, n) => `step-${n}`);
  const path = dates.map((date, n) => {
    const sorted = [...draws[n]!].sort((a, b) => a - b);
    const bands = ([0.5, 0.8, 0.95] as const).map((bandConfidence) => {
      const tail = (1 - bandConfidence) / 2;
      return { confidence: bandConfidence,
        low: n === 0 ? 1 : quantile(sorted, tail),
        high: n === 0 ? 1 : quantile(sorted, 1 - tail) };
    });
    return {
      date,
      low: n === 0 ? 1 : quantile(sorted, alpha),
      median: n === 0 ? 1 : quantile(sorted, 0.5),
      high: n === 0 ? 1 : quantile(sorted, 1 - alpha),
      bands,
    };
  });
  const sortedTerminal = terminal.sort((a, b) => a - b);
  return {
    manifest: {
      seed: spec.seed,
      model,
      modelVersion: "1",
      ...(blockLength === undefined ? {} : { blockLength }),
      bootstrapRuns: runs,
      confidence,
      researchMode: spec.researchMode,
      horizon: returns.length,
      units: "normalized_wealth",
      inputRefs: {
        instrument: `${dataset.instrument.chainId}:${dataset.instrument.address}`,
        quoteCurrency: dataset.quoteCurrency,
      },
      assumptions: [
        "Daily crypto 24/7 clock",
        ...(blockLength === undefined
          ? ["IID resampling of observed daily returns"]
          : [`Moving-block resampling of contiguous observed daily returns (length ${blockLength}); the final block is truncated to the horizon`]),
        "Bands are pointwise intervals over normalized paths, not predictions",
      ],
    },
    stats,
    bootstrap: {
      runs,
      seed: spec.seed,
      horizon: returns.length,
      confidence,
      terminal: {
        low: quantile(sortedTerminal, alpha),
        median: quantile(sortedTerminal, 0.5),
        high: quantile(sortedTerminal, 1 - alpha),
      },
      path,
    },
  };
}

export interface JointPortfolioPosition {
  dataset: PriceDataset;
  /** Positive integer share of a daily rebalanced portfolio; all positions sum to 10,000. */
  weightBps: number;
}

export interface JointPortfolioRun {
  manifest: {
    seed: number;
    model: "joint_portfolio_iid_bootstrap" | "joint_portfolio_moving_block_bootstrap";
    modelVersion: "1";
    blockLength?: number;
    bootstrapRuns: number;
    confidence: number;
    researchMode: boolean;
    horizon: number;
    units: "normalized_wealth";
    quoteCurrency: string;
    clock: Clock;
    inputRefs: Array<{
      instrument: string;
      datasetHash: string;
      weightBps: number;
      source: string;
      observedAt: string;
      synthetic: boolean;
    }>;
    assumptions: string[];
  };
  stats: RealizedStats;
  bootstrap: BootstrapResult;
}

/** Resample one historical day (or contiguous block) jointly across all assets. */
export async function runJointPortfolio(
  positions: readonly JointPortfolioPosition[],
  spec: ExperimentSpec,
  cancelled: () => boolean = () => false,
): Promise<JointPortfolioRun> {
  if (!Array.isArray(positions) || positions.length < 2 || positions.length > 8)
    throw new Error("Joint portfolio needs two to eight distinct instruments.");
  if (positions.some((position) => !Number.isSafeInteger(position.weightBps) || position.weightBps <= 0) ||
      positions.reduce((sum, position) => sum + position.weightBps, 0) !== 10_000)
    throw new Error("Positive portfolio weights must sum to exactly 10,000 basis points.");
  if (!Number.isSafeInteger(spec.seed) || spec.seed < 0 || spec.seed > 4_294_967_295 ||
      !Number.isSafeInteger(spec.bootstrapRuns) || spec.bootstrapRuns < 1 || spec.bootstrapRuns > MAX_RUNS ||
      !Number.isFinite(spec.confidence) || spec.confidence < 0.5 || spec.confidence > 0.99 ||
      typeof spec.researchMode !== "boolean")
    throw new Error("Seed, bootstrap runs, mode and confidence must be finite bounded values.");
  const model = spec.model ?? "historical_iid_bootstrap";
  if (model !== "historical_iid_bootstrap" && model !== "historical_moving_block_bootstrap")
    throw new Error("Unsupported joint portfolio bootstrap model.");
  if (model === "historical_iid_bootstrap" && spec.blockLength !== undefined)
    throw new Error("Block length applies only to moving-block bootstrap.");

  const minimumReturns = spec.researchMode ? 30 : 180;
  const checked = positions.map(({ dataset }) => validateDataset(dataset, new Date(), { minimumReturns }));
  for (const validation of checked) {
    if (!validation.ok) throw new Error(validation.issues.map((item) => item.message).join(" "));
  }
  const first = checked[0]!.dataset!;
  const observations = first.observations.length;
  const horizon = observations - 1;
  if (horizon > 730) throw new Error("Joint portfolio runs support at most 730 daily returns.");
  const keys = new Set<string>();
  const datasets = checked.map((item) => item.dataset!);
  for (const dataset of datasets) {
    const key = `${dataset.instrument.chainId}:${dataset.instrument.address.toLowerCase()}`;
    if (keys.has(key)) throw new Error("Joint portfolio instruments must be distinct.");
    keys.add(key);
    if (dataset.quoteCurrency !== first.quoteCurrency || dataset.clock !== first.clock)
      throw new Error("Joint portfolio datasets must use the same quote currency and clock.");
    if (dataset.observations.length !== observations ||
        dataset.observations.some((row, index) => row.date !== first.observations[index]!.date))
      throw new Error("Joint portfolio dates must align exactly; missing days are never filled or intersected silently.");
  }
  const blockLength = model === "historical_moving_block_bootstrap" ? spec.blockLength : undefined;
  const maxBlockLength = Math.min(30, Math.floor(horizon / 2));
  if (model === "historical_moving_block_bootstrap" &&
      (!Number.isSafeInteger(blockLength) || blockLength! < 2 || blockLength! > maxBlockLength))
    throw new Error(`Block length must be an integer from 2 to ${maxBlockLength} for this history window.`);
  const assetReturns = datasets.map((dataset) => dataset.observations.slice(1).map((row, index) =>
    row.price / dataset.observations[index]!.price - 1));
  if (assetReturns.some((series) => series.some((value) => !Number.isFinite(value) || value <= -1)))
    throw new Error("Joint portfolio price ratios exceed numeric precision limits.");
  const portfolioReturns = Array.from({ length: horizon }, (_, day) =>
    positions.reduce((sum, position, asset) => sum + position.weightBps / 10_000 * assetReturns[asset]![day]!, 0));
  if (portfolioReturns.some((value) => !Number.isFinite(value) || value <= -1))
    throw new Error("Joint portfolio returns exceed numeric precision limits.");
  const observedPath = [1];
  for (const value of portfolioReturns) {
    const next = observedPath[observedPath.length - 1]! * (1 + value);
    if (!Number.isFinite(next) || next <= 0) throw new Error("Observed portfolio path exceeds numeric precision limits.");
    observedPath.push(next);
  }
  const mean = portfolioReturns.reduce((sum, value) => sum + value, 0) / horizon;
  const variance = portfolioReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (horizon - 1);
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of observedPath) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  }
  const sortedObserved = [...portfolioReturns].sort((a, b) => a - b);
  const tailCount = portfolioReturns.filter((value) => value <= quantile(sortedObserved, 0.05)).length;

  const draws: number[][] = Array.from({ length: observations }, () => []);
  const terminal: number[] = [];
  const random = rng(spec.seed);
  for (let run = 0; run < spec.bootstrapRuns; run += 1) {
    let wealth = 1;
    let blockStart = 0;
    for (let step = 0; step < horizon; step += 1) {
      if (cancelled()) throw new Error("cancelled");
      if (blockLength !== undefined && step % blockLength === 0)
        blockStart = Math.floor(random() * (horizon - blockLength + 1));
      const sampledDay = blockLength === undefined
        ? Math.floor(random() * horizon)
        : blockStart + (step % blockLength);
      // The same sampled day is used for every asset, preserving observed co-movement.
      wealth *= 1 + portfolioReturns[sampledDay]!;
      if (!Number.isFinite(wealth) || wealth <= 0)
        throw new Error("Numeric overflow or underflow in joint portfolio path.");
      draws[step + 1]!.push(wealth);
    }
    terminal.push(wealth);
  }
  const alpha = (1 - spec.confidence) / 2;
  const path = draws.map((values, step) => {
    const sorted = [...values].sort((a, b) => a - b);
    const bands = ([0.5, 0.8, 0.95] as const).map((confidence) => {
      const tail = (1 - confidence) / 2;
      return { confidence,
        low: step === 0 ? 1 : quantile(sorted, tail),
        high: step === 0 ? 1 : quantile(sorted, 1 - tail) };
    });
    return {
      date: `step-${step}`,
      low: step === 0 ? 1 : quantile(sorted, alpha),
      median: step === 0 ? 1 : quantile(sorted, 0.5),
      high: step === 0 ? 1 : quantile(sorted, 1 - alpha),
      bands,
    };
  });
  const sortedTerminal = terminal.sort((a, b) => a - b);
  const hashes = await Promise.all(datasets.map((dataset) => datasetHash(dataset)));
  const stats: RealizedStats = {
    returns: horizon,
    totalReturn: observedPath[observedPath.length - 1]! - 1,
    volatilityAnnualized: Math.sqrt(variance * 365),
    maxDrawdown,
    tailCount,
    warnings: tailCount < 20 ? ["Tail count is below 20; tail interpretation is unstable."] : [],
  };
  if (![stats.totalReturn, stats.volatilityAnnualized, stats.maxDrawdown].every(Number.isFinite))
    throw new Error("Joint portfolio statistics exceed numeric precision limits.");
  return {
    manifest: {
      seed: spec.seed,
      model: model === "historical_iid_bootstrap" ? "joint_portfolio_iid_bootstrap" : "joint_portfolio_moving_block_bootstrap",
      modelVersion: "1",
      ...(blockLength === undefined ? {} : { blockLength }),
      bootstrapRuns: spec.bootstrapRuns,
      confidence: spec.confidence,
      researchMode: spec.researchMode,
      horizon,
      units: "normalized_wealth",
      quoteCurrency: first.quoteCurrency,
      clock: first.clock,
      inputRefs: positions.map((position, index) => ({
        instrument: `${datasets[index]!.instrument.chainId}:${datasets[index]!.instrument.address.toLowerCase()}`,
        datasetHash: hashes[index]!,
        weightBps: position.weightBps,
        source: datasets[index]!.provenance.source,
        observedAt: datasets[index]!.provenance.observedAt,
        synthetic: Boolean(datasets[index]!.synthetic),
      })),
      assumptions: [
        "Daily crypto 24/7 clock; exact shared dates and quote currency",
        "Constant-mix portfolio rebalanced to the stated basis-point weights every day; no fees or taxes",
        blockLength === undefined
          ? "Joint IID resampling of observed days preserves cross-asset co-movement"
          : `Joint moving-block resampling of observed contiguous days (length ${blockLength}) preserves cross-asset co-movement and within-block order`,
        "Pointwise bands are hypothetical normalized-wealth intervals, not predictions",
      ],
    },
    stats,
    bootstrap: {
      runs: spec.bootstrapRuns,
      seed: spec.seed,
      horizon,
      confidence: spec.confidence,
      terminal: {
        low: quantile(sortedTerminal, alpha),
        median: quantile(sortedTerminal, 0.5),
        high: quantile(sortedTerminal, 1 - alpha),
      },
      path,
    },
  };
}

export function exportRun(dataset: PriceDataset, run: QuantRun): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), dataset, run },
    null,
    2,
  );
}
