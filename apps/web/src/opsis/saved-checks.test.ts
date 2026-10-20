import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrivateAnalysis } from "../private/api";
import type { ExitCheckQuote } from "../exit-check/api";
import {
  parseSavedCheck,
  type SavedResearchCheck,
  type SavedTradeCheck,
} from "../vault/saved-check";
import {
  captureResearchCheck,
  captureTradeCheck,
  compareSavedChecks,
  savedCheckComparisonsEnabled,
} from "./saved-checks";
import { researchReport, tradeReport } from "./reports";
import { fixture, research } from "./test-fixtures";
import type { Capabilities } from "./model";

const quote = () => fixture() as ExitCheckQuote;
function pair(): [SavedTradeCheck, SavedTradeCheck] {
  const a = captureTradeCheck(quote(), "WETH") as SavedTradeCheck;
  a.observedAt = "2026-10-19T10:00:00.000Z";
  a.expiresAt = "2026-10-19T10:00:30.000Z";
  const b = structuredClone(a);
  b.observedAt = "2026-10-19T10:01:00.000Z";
  b.expiresAt = "2026-10-19T10:01:30.000Z";
  b.anchor = { height: a.anchor.height + 1, hash: `0x${"c".repeat(64)}` };
  return [a, b];
}
function token(): PrivateAnalysis {
  const value = research();
  value.entity.facts = {
    ...value.entity.facts,
    ...{
      sourceCoverage: "explorer_metadata",
      holderCoverage: "top_holders",
      activityCoverage: "indexed_window",
      holders: 120,
      holdersAnalyzed: 50,
      top1WalletShare: 5.4,
      verified: false,
      proxy: true,
      explorerObservedAt: "2026-10-19T10:00:00.000Z",
    },
  };
  return value as unknown as PrivateAnalysis;
}
function researchPair(): [SavedResearchCheck, SavedResearchCheck] {
  const a = captureResearchCheck(token()) as SavedResearchCheck;
  return [
    a,
    {
      ...a,
      observedAt: "2026-10-19T10:01:00.000Z",
      holders: "123",
      top1WalletShare: "6.1",
      verified: true,
    },
  ];
}
afterEach(() => vi.unstubAllEnvs());

describe("local saved evidence capture", () => {
  it("uses locale-independent ordering when all four pool fee tiers are found", () => {
    const q = quote();
    q.coverage.poolsFound = [
      { fee: 100, pool: `0x${"d".repeat(40)}` },
      { fee: 500, pool: `0x${"e".repeat(40)}` },
      { fee: 3000, pool: q.quote!.pool.pool },
      { fee: 10000, pool: `0x${"f".repeat(40)}` },
    ];
    q.coverage.poolsQuoted = q.coverage.poolsFound.map((p) => ({
      ...p,
      amountOut: q.quote!.amountOut,
      amountOutDisplay: q.quote!.amountOutDisplay,
    }));
    q.coverage.poolsMissing = [];
    const saved = captureTradeCheck(q, "WETH") as SavedTradeCheck;
    expect(saved).not.toBeNull();
    expect(saved.coverage.found.map((p) => Number(p.split(":")[0]))).toEqual([
      10000, 100, 3000, 500,
    ]);
    expect(parseSavedCheck(saved)).toEqual(saved);
  });
  it("requires both explicit flags and does not retrofit prose-only reports", () => {
    for (const frontend of [undefined, "false", "TRUE", "true"]) {
      vi.stubEnv("VITE_SAVED_CHECK_COMPARISONS_ENABLED", frontend);
      for (const server of [undefined, false, true]) {
        expect(
          savedCheckComparisonsEnabled({
            savedCheckComparisons: server,
          } as Capabilities),
        ).toBe(frontend === "true" && server === true);
      }
    }
    expect(tradeReport(quote(), "WETH").comparison).toBeUndefined();
    expect(researchReport(token()).comparison).toBeUndefined();
    expect(tradeReport(quote(), "WETH", true).comparison?.kind).toBe("check");
    expect(researchReport(token(), true).comparison?.kind).toBe("research");
    expect(compareSavedChecks(undefined, pair()[1])).toEqual({
      state: "unavailable",
      reason: "legacy",
    });
  });
  it("captures only bounded facts, preserves source time, and excludes wallet/transaction evidence", () => {
    const value = token();
    value.entity.facts.privateNote = "PRIVATE-NOTE-CANARY";
    expect(captureResearchCheck(value)).toMatchObject({
      observedAt: "2026-10-19T10:00:00.000Z",
      top1WalletShare: "5.4",
      verified: false,
    });
    expect(JSON.stringify(captureResearchCheck(value))).not.toContain(
      "PRIVATE-NOTE-CANARY",
    );
    expect(
      captureResearchCheck({
        ...value,
        entity: { ...value.entity, type: "wallet" },
      }),
    ).toBeNull();
    const missing = token();
    missing.entity.facts = {
      decimals: 6,
      sourceCoverage: "rpc_sample_only",
      verified: false,
      proxy: false,
    };
    expect(captureResearchCheck(missing)).toMatchObject({
      holders: null,
      verified: null,
      proxy: null,
    });
    value.entity.facts.holders = Number.MAX_SAFE_INTEGER + 1;
    expect(captureResearchCheck(value)).toMatchObject({ holders: null });
  });
  it("rejects malformed, oversized, future-version, extra-field and contradictory evidence", () => {
    const [a] = pair();
    for (const bad of [
      null,
      { ...a, version: 2 },
      { ...a, chainId: 1 },
      { ...a, inputRaw: "01" },
      { ...a, inputRaw: (1n << 256n).toString() },
      { ...a, inputDecimals: 37 },
      { ...a, observedAt: "today" },
      { ...a, privateNote: "private" },
      { ...a, providers: ["x".repeat(9000)] },
      { ...a, coverage: { ...a.coverage, quoted: [] } },
      { ...a, coverage: { ...a.coverage, discoveryFailed: [100] } },
      { ...a, expiresAt: "2026-10-19T10:01:00.000Z" },
      { ...a, output: { ...a.output, address: a.identifier } },
    ]) {
      expect(parseSavedCheck(bad)).toBeNull();
    }
    const clone = parseSavedCheck(a) as SavedTradeCheck;
    clone.coverage.tested.pop();
    expect(a.coverage.tested).toHaveLength(4);
    const [r] = researchPair();
    for (const bad of [
      { ...r, top1WalletShare: "100.1" },
      { ...r, holderCoverage: "unavailable" },
      { ...r, sourceCoverage: "rpc_sample_only" },
    ])
      expect(parseSavedCheck(bad)).toBeNull();
  });
});

describe("historical comparisons", () => {
  it("subtracts exact raw units beyond Number precision without rounding away a one-unit change", () => {
    const [a, b] = pair();
    a.amountOut = "9007199254740993123456789";
    b.amountOut = "9007199254740993123456790";
    a.priceImpactBps = "-2";
    b.priceImpactBps = "3";
    expect(compareSavedChecks(a, b)).toMatchObject({
      state: "compared",
      rows: [
        {
          before: "9007199.254740993123456789",
          after: "9007199.25474099312345679",
          delta: "+0.000000000000000001",
          status: "changed",
        },
        { before: "-2", after: "3", delta: "+5" },
      ],
    });
    b.amountOut = "0";
    b.priceImpactBps = null;
    expect(compareSavedChecks(a, b)).toMatchObject({
      rows: [
        { after: "0", status: "changed" },
        { after: null, delta: null, status: "unknown" },
      ],
    });
  });
  it("uses percentage points, distinguishes false/zero/unknown, and requires matching known samples", () => {
    const [a, b] = researchPair();
    expect(compareSavedChecks(a, b)).toMatchObject({
      state: "compared",
      rows: [
        { delta: "+3" },
        { before: "5.4", after: "6.1", delta: "+0.7" },
        { before: false, after: true, status: "changed" },
        { status: "unchanged" },
      ],
    });
    for (const sample of ["49", "0", null]) {
      expect(
        compareSavedChecks(a, { ...b, holdersAnalyzed: sample }),
      ).toMatchObject({
        rows: [
          {},
          { before: null, after: null, delta: null, status: "unknown" },
          {},
          {},
        ],
      });
    }
    expect(
      compareSavedChecks(
        { ...a, top1WalletShare: "0.0", holders: "0" },
        { ...b, top1WalletShare: "0", holders: null },
      ),
    ).toMatchObject({
      rows: [
        { status: "unknown" },
        { delta: "0", status: "unchanged" },
        {},
        {},
      ],
    });
  });
  it("refuses incompatible identity, source, units, size, chronology, anchors, pools and coverage", () => {
    const [a, b] = pair();
    const cases: Array<[unknown, string]> = [
      [{ ...b, version: 7 }, "invalid"],
      [{ ...b, identifier: `0x${"2".repeat(40)}` }, "different_subject"],
      [{ ...b, providers: ["another-rpc"] }, "different_source"],
      [{ ...b, inputDecimals: 5 }, "different_units"],
      [{ ...b, output: { ...b.output, decimals: 17 } }, "different_units"],
      [{ ...b, inputRaw: "1500001" }, "different_size"],
      [
        { ...b, observedAt: a.observedAt, expiresAt: a.expiresAt },
        "same_observation",
      ],
      [{ ...b, anchor: a.anchor }, "same_observation"],
      [
        { ...b, anchor: { ...b.anchor, height: a.anchor.height } },
        "conflicting_anchor",
      ],
      [
        { ...b, anchor: { ...b.anchor, hash: a.anchor.hash } },
        "conflicting_anchor",
      ],
      [
        { ...b, anchor: { ...b.anchor, height: a.anchor.height - 1 } },
        "nonchronological",
      ],
      [
        {
          ...b,
          coverage: {
            ...b.coverage,
            missing: [500, 10000],
            discoveryFailed: [100],
          },
        },
        "different_coverage",
      ],
    ];
    for (const [later, reason] of cases)
      expect(compareSavedChecks(a, later)).toEqual({
        state: "unavailable",
        reason,
      });
    expect(compareSavedChecks(b, a)).toEqual({
      state: "unavailable",
      reason: "nonchronological",
    });
    const pool = { address: `0x${"d".repeat(40)}`, fee: 3000 };
    expect(
      compareSavedChecks(a, {
        ...b,
        pool,
        coverage: {
          ...b.coverage,
          found: [`3000:${pool.address}`],
          quoted: [`3000:${pool.address}`],
        },
      }),
    ).toEqual({ state: "unavailable", reason: "different_pool" });
    const [r, s] = researchPair();
    expect(compareSavedChecks(a, s)).toMatchObject({
      reason: "different_tool",
    });
    expect(
      compareSavedChecks(r, { ...s, activityCoverage: "unavailable" }),
    ).toMatchObject({ reason: "different_coverage" });
    expect(
      compareSavedChecks(r, {
        ...s,
        sourceCoverage: "rpc_sample_only",
        verified: null,
        proxy: null,
      }),
    ).toMatchObject({ reason: "different_source" });
    expect(compareSavedChecks(r, { ...s, decimals: null })).toMatchObject({
      reason: "different_units",
    });
  });
  it("never converts two unsupported quotes or unavailable research samples into zero changes", () => {
    const unsupported = (v: SavedTradeCheck): SavedTradeCheck => ({
      ...v,
      supported: false,
      pool: null,
      amountOut: null,
      priceImpactBps: null,
      coverage: { ...v.coverage, quoted: [], failed: v.coverage.found },
    });
    const [a, b] = pair().map(unsupported);
    expect(compareSavedChecks(a, b)).toMatchObject({
      state: "compared",
      rows: [
        { status: "unknown", delta: null },
        { status: "unknown", delta: null },
      ],
    });
  });
  it("compares imported evidence regardless of JSON property insertion order", () => {
    const [a, b] = pair();
    b.output = { decimals: b.output.decimals, address: b.output.address };
    b.pool = { fee: b.pool!.fee, address: b.pool!.address };
    b.coverage = Object.fromEntries(
      Object.entries(b.coverage).reverse(),
    ) as SavedTradeCheck["coverage"];
    expect(compareSavedChecks(a, b)).toMatchObject({
      state: "compared",
      rows: [{ status: "unchanged" }, { status: "unchanged" }],
    });
  });
});
