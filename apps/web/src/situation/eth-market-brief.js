const COINBASE_HOST = "api.exchange.coinbase.com";
const COINBASE_STATS_PATH = "/products/ETH-USD/stats";
const CONTEXT_HOST = "ct.com";
const REVIEWED_CONTEXT_PATHS = new Set([
  "/markets/bitcoin-etfs-282m-biggest-outflow-july",
  "/news/sky-value-token-holders-standard-chartered",
]);

const NORMALIZED_PAIR = "ETH/USD";
const CANDLE_SECONDS = 3600;
const DEFAULT_STALE_MINUTES = 60;

const safeUrl = (value) => {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isSecureUrl = (parsed) =>
  parsed.protocol === "https:" &&
  parsed.username === "" &&
  parsed.password === "" &&
  (parsed.port === "" || parsed.port === "443");

const isStatsSourceUrl = (value) => {
  const parsed = safeUrl(value);
  if (!parsed || !isSecureUrl(parsed)) return false;
  return parsed.hostname === COINBASE_HOST && parsed.pathname === COINBASE_STATS_PATH;
};

const isAllowedContextUrl = (value) => {
  const parsed = safeUrl(value);
  if (!parsed || !isSecureUrl(parsed)) return false;
  return (
    parsed.hostname === CONTEXT_HOST &&
    parsed.pathname &&
    !parsed.search &&
    !parsed.hash &&
    REVIEWED_CONTEXT_PATHS.has(parsed.pathname)
  );
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isExactIsoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const isFinitePositive = (value) => Number.isFinite(value) && value > 0;

const sanitizePair = (pair) =>
  typeof pair === "string" ? pair.replace(/\s+/g, "").toUpperCase() : "";

const toSnapshotDate = (capturedAt) => {
  const date = new Date(capturedAt);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
};

const parseStrictNumber = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRequiredPositive = (value) => {
  const parsed = parseStrictNumber(value);
  return isFinitePositive(parsed) ? parsed : null;
};

const parseRequiredVolume = (value) => {
  const parsed = parseStrictNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

export function selectCompleteHourlyCandles(capturedAtMs, rawCandles) {
  const result = { candles: [], gaps: [], conflicts: [], rejectedCount: 0 };
  if (!Array.isArray(rawCandles) || !Number.isFinite(capturedAtMs)) return result;

  const captureSeconds = Math.floor(capturedAtMs / 1000);
  const accepted = [];
  for (const raw of rawCandles) {
    if (!Array.isArray(raw) || raw.length < 6) {
      result.rejectedCount += 1;
      continue;
    }
    const start = parseStrictNumber(raw[0]);
    const low = parseRequiredPositive(raw[1]);
    const high = parseRequiredPositive(raw[2]);
    const open = parseRequiredPositive(raw[3]);
    const close = parseRequiredPositive(raw[4]);
    const volume = parseRequiredVolume(raw[5]);

    const valid =
      Number.isInteger(start) &&
      start > 0 &&
      start % CANDLE_SECONDS === 0 &&
      low !== null &&
      high !== null &&
      open !== null &&
      close !== null &&
      volume !== null &&
      low <= open &&
      low <= close &&
      high >= open &&
      high >= close &&
      high >= low &&
      start + CANDLE_SECONDS <= captureSeconds;
    if (!valid) {
      result.rejectedCount += 1;
      continue;
    }
    accepted.push({ start: start * 1000, startAt: start, open, close, low, high, volume });
  }

  accepted.sort((a, b) => a.startAt - b.startAt);

  const buckets = new Map();
  for (const candle of accepted) {
    if (!buckets.has(candle.startAt)) buckets.set(candle.startAt, []);
    buckets.get(candle.startAt).push(candle);
  }

  const sameCandle = (a, b) =>
    a.open === b.open &&
    a.close === b.close &&
    a.low === b.low &&
    a.high === b.high &&
    a.volume === b.volume;

  for (const [startAt, rows] of buckets) {
    const identical = rows.every((row) => sameCandle(row, rows[0]));
    if (!identical) {
      result.conflicts.push({ startAt, start: rows[0].start, variants: rows.length });
      result.rejectedCount += rows.length;
      continue;
    }
    const candle = rows[0];
    const previous = result.candles.at(-1);
    if (previous) {
      const deltaSeconds = candle.startAt - previous.startAt;
      if (deltaSeconds > CANDLE_SECONDS) {
        result.gaps.push({
          afterStart: previous.start,
          beforeStart: candle.start,
          missingHours: deltaSeconds / CANDLE_SECONDS - 1,
        });
      }
    }
    result.candles.push(candle);
  }
  return result;
}

const parseContext = (input) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      title: typeof item?.title === "string" ? item.title : "",
      source: typeof item?.source === "string" ? item.source : "",
      url: typeof item?.url === "string" ? item.url : "",
      date: typeof item?.date === "string" ? item.date : "",
      summary: typeof item?.summary === "string" ? item.summary : "",
      originalTitle:
        typeof item?.originalTitle === "string" ? item.originalTitle : "",
      whyItMatters:
        typeof item?.whyItMatters === "string" ? item.whyItMatters : "",
    }))
    .filter(
      (item) =>
        item.title.trim() &&
        item.source.trim() &&
        item.url.trim() &&
        isExactIsoDate(item.date) &&
        item.summary.trim() &&
        item.originalTitle.trim() &&
        item.whyItMatters.trim() &&
        isAllowedContextUrl(item.url),
    );
};

export function parseEthMarketSnapshot(input, nowMs = Date.now()) {
  if (input === null || input === undefined) return { status: "missing", value: null };
  if (typeof input !== "object") return { status: "invalid", value: null };
  if (!Number.isFinite(nowMs)) return { status: "invalid", value: null };

  const capturedAt = Date.parse(input.capturedAt);
  if (!Number.isFinite(capturedAt)) return { status: "invalid", value: null };
  if (capturedAt > nowMs) return { status: "invalid", value: null };

  const snapshotDate = toSnapshotDate(capturedAt);
  if (!snapshotDate) return { status: "invalid", value: null };
  if (input.snapshotDate && String(input.snapshotDate) !== snapshotDate)
    return { status: "invalid", value: null };

  const reference = input.globalReference;
  if (!reference || typeof reference !== "object") return { status: "invalid", value: null };
  if (sanitizePair(reference.pair) !== NORMALIZED_PAIR) return { status: "invalid", value: null };
  if (!isStatsSourceUrl(reference.source?.url)) return { status: "invalid", value: null };

  const open = parseRequiredPositive(reference.stats?.open);
  const high = parseRequiredPositive(reference.stats?.high);
  const low = parseRequiredPositive(reference.stats?.low);
  const last = parseRequiredPositive(reference.stats?.last);
  if (open === null || high === null || low === null || last === null)
    return { status: "invalid", value: null };
  if (!(low <= open && low <= last && high >= open && high >= last && high >= low))
    return { status: "invalid", value: null };

  const { candles, gaps, conflicts } = selectCompleteHourlyCandles(
    capturedAt,
    input.hourlyCandles,
  );
  if (candles.length === 0) return { status: "invalid", value: null };

  if (!Array.isArray(input.newsContext) || input.newsContext.length === 0)
    return { status: "invalid", value: null };
  const context = parseContext(input.newsContext);
  if (context.length !== input.newsContext.length) return { status: "invalid", value: null };

  const staleAfterMinutes =
    Number.isFinite(input.staleAfterMinutes) && input.staleAfterMinutes > 0
      ? input.staleAfterMinutes
      : DEFAULT_STALE_MINUTES;

  return {
    status: "valid",
    value: {
      capturedAt,
      snapshotDate,
      pair: NORMALIZED_PAIR,
      venue: typeof reference.venue === "string" && reference.venue ? reference.venue : "Coinbase",
      scope:
        typeof reference.scope === "string" && reference.scope
          ? reference.scope
          : "single venue",
      sourceLabel:
        typeof reference.source?.name === "string" && reference.source.name
          ? reference.source.name
          : "Coinbase Exchange product stats",
      sourceUrl: reference.source.url,
      stats: { open, high, low, last },
      hourlyCandles: candles,
      candleGaps: gaps,
      candleConflicts: conflicts,
      statsChangeUsd: last - open,
      statsChangePercent: ((last - open) / open) * 100,
      newsContext: context,
      notLiveReason:
        typeof input.notLiveReason === "string" && input.notLiveReason
          ? input.notLiveReason
          : "Captured snapshot (not live)",
      staleAfterMinutes,
    },
  };
}

export function evaluateEthMarketSnapshot(input, now = Date.now()) {
  const { status, value } = parseEthMarketSnapshot(input, now);
  if (status !== "valid" || !value) return { ...(value ?? {}), status };

  const ageMinutes = (now - value.capturedAt) / 60000;
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0)
    return { ...value, status: "invalid", ageMinutes };
  if (ageMinutes > value.staleAfterMinutes)
    return { ...value, status: "stale", ageMinutes };

  return { ...value, status: "valid", ageMinutes };
}

export const formatUsd = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return "—";
  if (typeof value === "string" && value.trim() === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `$${parsed.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return `${hours}h${remaining ? ` ${remaining}m` : ""}`;
};

export const formatEthChange = (value) => {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

export const formatUtcRange = (startMs, endMs) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
  const from = new Date(startMs).toISOString().slice(0, 16).replace("T", " ");
  const to = new Date(endMs).toISOString().slice(0, 16).replace("T", " ");
  return `${from} UTC to ${to} UTC`;
};
