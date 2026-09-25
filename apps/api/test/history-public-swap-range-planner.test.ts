import { describe, expect, it } from "vitest";
import { planPublicSwapHistoryRanges, type HistoryRangePlanInput, type PlannerCoverage } from "../src/history/public-swap-history-range-planner.js";

const POOL = "0x1111111111111111111111111111111111111111";
const BASE = { chainId: 4663, poolAddress: POOL, source: "capture-a", fromBlock: 10n, toBlock: 219n, maxRanges: 10, asOf: new Date("2026-09-24T00:00:00Z") };
let rowId = 0;
const coverage = (fromBlock: bigint, toBlock: bigint, status: PlannerCoverage["status"], canonicalStatus = "CANONICAL"): PlannerCoverage => ({
  id: `cov-${++rowId}`, revision: 1, blockHash: `0x${"a".repeat(64)}`,
  chainId: 4663, poolAddress: POOL, source: "capture-a", fromBlock, toBlock, status, canonicalStatus,
  expectedEventCount: status === "EMPTY" ? 0 : 1, contentDigest: "a".repeat(64), retentionExpiresAt: null, readVerified: true,
});
const plan = (overrides: Partial<HistoryRangePlanInput> = {}) => planPublicSwapHistoryRanges({ ...BASE, coverage: [], ...overrides });
const span = (result: ReturnType<typeof plan>) => result.ranges.map(({ fromBlock, toBlock }) => [fromBlock, toBlock]);

describe("public Swap history range planner", () => {
  it("splits inclusive ranges at exact 100-block boundaries", () => {
    const result = plan({ fromBlock: 0n, toBlock: 199n });
    expect(span(result)).toEqual([[0n, 99n], [100n, 199n]]);
    expect(result.hasMore).toBe(false);
  });

  it("skips only exact verified COMPLETE or EMPTY coverage and fills partial edges", () => {
    const result = plan({ fromBlock: 0n, toBlock: 9n, coverage: [
      coverage(2n, 3n, "COMPLETE"), coverage(6n, 7n, "EMPTY"),
    ] });
    expect(span(result)).toEqual([[0n, 1n], [4n, 5n], [8n, 9n]]);
  });

  it.each(["GAP", "UNAVAILABLE", "PARTIAL", "COMPLETE", "EMPTY"])("retries %s coverage while unverified", (status) => {
    expect(span(plan({ fromBlock: 5n, toBlock: 7n, coverage: [coverage(5n, 7n, status, "UNKNOWN")] }))).toEqual([[5n, 7n]]);
  });

  it("returns only the requested cap and signals remaining work", () => {
    const result = plan({ fromBlock: 0n, toBlock: 499n, maxRanges: 2 });
    expect(span(result)).toEqual([[0n, 99n], [100n, 199n]]);
    expect(result.hasMore).toBe(true);
  });

  it("replans expired, missing or malformed commitments even when marked canonical", () => {
    const row = coverage(10n, 12n, "COMPLETE");
    const cases = [
      { ...row, retentionExpiresAt: new Date("2026-09-23T00:00:00Z") },
      { ...row, expectedEventCount: null }, { ...row, contentDigest: "bad" },
      { ...row, readVerified: false }, { ...row, blockHash: null },
    ];
    for (const value of cases) expect(span(plan({ fromBlock: 10n, toBlock: 12n, coverage: [value] }))).toEqual([[10n, 12n]]);
  });

  it("rejects invalid bounds, chain, pool, source, cap and malformed coverage", () => {
    const badInputs: Partial<HistoryRangePlanInput>[] = [
      { chainId: 1 },
      { poolAddress: "0xABC" }, { source: "bad source" }, { maxRanges: 0 },
      { maxRanges: 101 }, { fromBlock: -1n }, { toBlock: 9n }, { toBlock: 9_223_372_036_854_775_808n },
      { coverage: [coverage(11n, 12n, "COMPLETE"), coverage(10n, 10n, "EMPTY")] },
      { coverage: [coverage(10n, 12n, "COMPLETE"), coverage(12n, 13n, "EMPTY")] },
      { coverage: [{ ...coverage(10n, 11n, "COMPLETE"), chainId: 1 }] },
      { coverage: [{ ...coverage(10n, 11n, "COMPLETE"), poolAddress: "0x2222222222222222222222222222222222222222" }] },
      { coverage: [{ ...coverage(10n, 11n, "COMPLETE"), source: "capture-b" }] },
    ];
    badInputs.forEach((bad, index) => expect(() => plan(bad), `invalid input ${index}`).toThrow(TypeError));
  });

  it("is deterministic across repeated calls", () => {
    const input = { fromBlock: 0n, toBlock: 250n, maxRanges: 2, coverage: [coverage(50n, 70n, "GAP")] };
    expect(plan(input)).toEqual(plan(input));
  });
});
