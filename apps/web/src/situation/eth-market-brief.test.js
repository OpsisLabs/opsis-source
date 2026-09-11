import { test } from "vitest";
import assert from "node:assert/strict";
import captured from "./eth-market-brief.json";
import {
  evaluateEthMarketSnapshot,
  formatEthChange,
  formatUsd,
  formatUtcRange,
  parseEthMarketSnapshot,
  selectCompleteHourlyCandles,
} from "./eth-market-brief.js";

const CAPTURE_MS = Date.parse(captured.capturedAt);

const clone = (value) => JSON.parse(JSON.stringify(value));

test("accepts the real captured Coinbase dataset while fresh", () => {
  const fresh = evaluateEthMarketSnapshot(captured, Date.parse("2026-09-11T14:50:00.000Z"));
  assert.equal(fresh.status, "valid");
  assert.equal(fresh.pair, "ETH/USD");
  assert.equal(fresh.venue, "Coinbase");
  assert.equal(fresh.scope, "single venue");
  assert.equal(fresh.stats.last, 2606.31);
  assert.equal(fresh.hourlyCandles.length, 25);
  assert.equal(fresh.candleGaps.length, 0);
  assert.ok(Math.abs(fresh.statsChangePercent - 6.67) < 0.01);
  assert.equal(fresh.ageMinutes, 6.983333333333333);
});

test("marks the capture as stale after the freshness window", () => {
  const stale = evaluateEthMarketSnapshot(captured, Date.parse("2026-09-11T16:00:00.000Z"));
  assert.equal(stale.status, "stale");
  assert.ok(Math.abs(stale.ageMinutes - 76.98333333333333) < 1e-9);
});

test("flags a missing snapshot as missing", () => {
  assert.equal(evaluateEthMarketSnapshot(null).status, "missing");
  assert.equal(evaluateEthMarketSnapshot(undefined).status, "missing");
});

test("future capture validation is deterministic through evaluate(now)", () => {
  const future = clone(captured);
  future.capturedAt = "2026-09-11T15:00:00.000Z";
  future.snapshotDate = "2026-09-11";
  const before = parseEthMarketSnapshot(future, CAPTURE_MS);
  const after = parseEthMarketSnapshot(future, Date.parse("2026-09-11T16:00:00.000Z"));
  assert.equal(before.status, "invalid");
  assert.equal(after.status, "valid");
});

test("rejects malformed, non-hourly and incomplete candles", () => {
  const complete = [1789131600, 2489.41, 2644.91, 2509.8, 2629.32, 35524.55];
  const captureMs = Date.parse("2026-09-11T14:43:01.000Z");

  const missingHigh = clone(complete);
  missingHigh[2] = null;
  assert.equal(selectCompleteHourlyCandles(captureMs, [missingHigh]).candles.length, 0);

  const inverted = clone(complete);
  inverted[1] = 2700;
  assert.equal(selectCompleteHourlyCandles(captureMs, [inverted]).candles.length, 0);

  const openOutOfRange = clone(complete);
  openOutOfRange[3] = 100;
  assert.equal(selectCompleteHourlyCandles(captureMs, [openOutOfRange]).candles.length, 0);

  const unaligned = clone(complete);
  unaligned[0] = complete[0] + 60;
  assert.equal(selectCompleteHourlyCandles(captureMs, [unaligned]).candles.length, 0);

  const missingVolume = clone(complete);
  missingVolume[5] = undefined;
  assert.equal(selectCompleteHourlyCandles(captureMs, [missingVolume]).candles.length, 0);

  const incomplete = clone(complete);
  incomplete[0] = 1789135200;
  assert.equal(selectCompleteHourlyCandles(captureMs, [incomplete]).candles.length, 0);

  const rejected = selectCompleteHourlyCandles(captureMs, [
    missingHigh,
    inverted,
    openOutOfRange,
    unaligned,
    missingVolume,
    incomplete,
  ]);
  assert.equal(rejected.candles.length, 0);
  assert.equal(rejected.rejectedCount, 6);
});

test("detects hourly gaps without bridging them", () => {
  const base = 1789131600;
  const rows = [
    [base, 2489.41, 2644.91, 2509.8, 2629.32, 35524.55],
    [base + 3600 * 3, 2600, 2700, 2629.32, 2650.11, 1234.56],
  ];
  const result = selectCompleteHourlyCandles(Date.parse("2026-09-11T20:00:00.000Z"), rows);
  assert.equal(result.candles.length, 2);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].missingHours, 2);
  assert.equal(result.gaps[0].afterStart, base * 1000);
  assert.equal(result.gaps[0].beforeStart, (base + 3600 * 3) * 1000);
  assert.equal(result.candles[1].startAt - result.candles[0].startAt, 3600 * 3);
});

test("deduplicates identical candle buckets and rejects conflicting ones", () => {
  const captureMs = Date.parse("2026-09-11T14:43:01.000Z");
  const row = [1789131600, 2489.41, 2644.91, 2509.8, 2629.32, 35524.55];

  const identical = selectCompleteHourlyCandles(captureMs, [row, [...row]]);
  assert.equal(identical.candles.length, 1);
  assert.equal(identical.conflicts.length, 0);
  assert.equal(identical.rejectedCount, 0);

  const conflicting = selectCompleteHourlyCandles(captureMs, [
    row,
    [1789131600, 2490, 2645, 2510, 2629.5, 35524.66],
  ]);
  assert.equal(conflicting.candles.length, 0);
  assert.equal(conflicting.conflicts.length, 1);
  assert.equal(conflicting.conflicts[0].startAt, 1789131600);
  assert.equal(conflicting.conflicts[0].start, 1789131600 * 1000);
  assert.equal(conflicting.conflicts[0].variants, 2);
  assert.equal(conflicting.rejectedCount, 2);
});

test("discloses rejected conflicting candle buckets without accepting the first", () => {
  const payload = clone(captured);
  const row = payload.hourlyCandles[1];
  payload.hourlyCandles.push([row[0], row[1] + 1, row[2], row[3], row[4], row[5]]);
  const result = parseEthMarketSnapshot(payload, CAPTURE_MS);
  assert.equal(result.status, "valid");
  assert.equal(result.value.candleConflicts.length, 1);
  assert.equal(result.value.hourlyCandles.length, 24);
});

test("rejects booleans and blank strings in parsed numeric fields", () => {
  const captureMs = Date.parse("2026-09-11T14:43:01.000Z");
  const row = [1789131600, 2489.41, 2644.91, 2509.8, 2629.32, 35524.55];

  const boolStat = clone(captured);
  boolStat.globalReference.stats.last = true;
  assert.equal(parseEthMarketSnapshot(boolStat, CAPTURE_MS).status, "invalid");

  const blankStat = clone(captured);
  blankStat.globalReference.stats.open = "  ";
  assert.equal(parseEthMarketSnapshot(blankStat, CAPTURE_MS).status, "invalid");

  const boolStart = clone(row);
  boolStart[0] = true;
  assert.equal(selectCompleteHourlyCandles(captureMs, [boolStart]).candles.length, 0);

  const boolOpen = clone(row);
  boolOpen[3] = false;
  assert.equal(selectCompleteHourlyCandles(captureMs, [boolOpen]).candles.length, 0);

  const blankVolume = clone(row);
  blankVolume[5] = "   ";
  assert.equal(selectCompleteHourlyCandles(captureMs, [blankVolume]).candles.length, 0);
});

test("rejects insecure, credentialed and off-path reference URLs", () => {
  const cases = [
    "http://api.exchange.coinbase.com/products/ETH-USD/stats",
    "https://user:pass@api.exchange.coinbase.com/products/ETH-USD/stats",
    "https://api.exchange.coinbase.com/products/BTC-USD/stats",
    "https://api.exchange.coinbase.com/products/ETH-USD/ticker",
    "https://api.exchange.coinbase.com.evil.example/products/ETH-USD/stats",
  ];
  for (const url of cases) {
    const payload = clone(captured);
    payload.globalReference.source.url = url;
    assert.equal(parseEthMarketSnapshot(payload, CAPTURE_MS).status, "invalid", url);
  }
});

test("rejects unknown context and out-of-scope candles", () => {
  const badContext = clone(captured);
  badContext.newsContext[0].url = "https://example.com/news";
  assert.equal(parseEthMarketSnapshot(badContext, CAPTURE_MS).status, "invalid");

  const noCandles = clone(captured);
  noCandles.hourlyCandles = [[1789135200, 2598.41, 2667.01, 2629, 2605.69, 48053.46]];
  assert.equal(parseEthMarketSnapshot(noCandles, CAPTURE_MS).status, "invalid");
});

test("formats positive, zero and negative 24h changes", () => {
  assert.equal(formatEthChange(6.67), "+6.67%");
  assert.equal(formatEthChange(0), "0.00%");
  assert.equal(formatEthChange(-1.25), "−1.25%");
  assert.equal(formatEthChange(Number.NaN), "—");
});

test("formatUsd only renders real finite numbers and numeric strings", () => {
  assert.equal(formatUsd(2606.31), "$2,606.31");
  assert.equal(formatUsd("2606.31"), "$2,606.31");
  assert.equal(formatUsd(0), "$0.00");
  for (const value of [null, undefined, true, false, "", "   ", "abc", [], {}, Number.NaN, Infinity]) {
    assert.equal(formatUsd(value), "—", `value ${String(value)}`);
  }
});

test("formats a clean UTC range without stray characters", () => {
  const range = formatUtcRange(
    Date.parse("2026-09-10T13:00:00.000Z"),
    Date.parse("2026-09-11T14:00:00.000Z"),
  );
  assert.equal(range, "2026-09-10 13:00 UTC to 2026-09-11 14:00 UTC");
});
