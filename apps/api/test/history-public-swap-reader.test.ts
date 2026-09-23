import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { publicSwapContentDigest } from "../src/history/public-swap-history.js";
import { PublicSwapCapture } from "../src/history/public-swap-capture.js";
import { PublicSwapHistoryReader } from "../src/history/public-swap-reader.js";
import { encodeAbiParameters } from "viem";
import { OBSERVED_TRADES_SWAP_TOPIC } from "../src/market/observed-trades.js";

const POOL = `0x${"11".repeat(20)}`;
const HASH = `0x${"aa".repeat(32)}`;
const TX = `0x${"cc".repeat(32)}`;
const now = new Date("2026-09-23T12:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1", chainId: 4663, poolAddress: POOL, blockNumber: 101n, blockHash: HASH,
    transactionHash: TX, logIndex: 2, blockTimestamp: new Date("2026-09-23T11:59:00.000Z"),
    amount0: new Prisma.Decimal("-12"), amount1: new Prisma.Decimal("34"),
    sqrtPriceX96: new Prisma.Decimal("5"), liquidity: new Prisma.Decimal("7"), tick: -2,
    source: "reviewed-source", observedAt: new Date("2026-09-23T12:00:00.000Z"),
    retentionExpiresAt: null, canonicalStatus: "CANONICAL", ...overrides,
  };
}

function setup(options: { rows?: Record<string, any>[]; committedRows?: Record<string, any>[]; status?: string; commitment?: boolean; coverageExpiry?: Date | null; coverageCanonicalStatus?: string } = {}) {
  const rows = options.rows ?? [row()];
  const committedRows = options.committedRows ?? rows;
  const coveredStatus = options.status ?? "COMPLETE";
  const coverage: Record<string, any> = {
    id: "coverage-1", chainId: 4663, poolAddress: POOL, fromBlock: 100n, toBlock: 101n, blockHash: HASH,
    source: "reviewed-source", status: coveredStatus, revision: 1, canonicalStatus: options.coverageCanonicalStatus ?? "CANONICAL",
    observedAt: new Date("2026-09-23T12:00:00.000Z"),
    retentionExpiresAt: options.coverageExpiry ?? null,
    expectedEventCount: committedRows.length, contentDigest: publicSwapContentDigest(committedRows as any),
  };
  if (options.commitment === false) {
    coverage.expectedEventCount = null;
    coverage.contentDigest = null;
  }
  const coverages = [coverage];
  const findCoverage = vi.fn(async ({ where }: any) => coverages.filter((item) => item.chainId === where.chainId
    && item.poolAddress === where.poolAddress && item.fromBlock === where.fromBlock && item.toBlock === where.toBlock
    && item.source === where.source).sort((a, b) => b.revision - a.revision)[0] ?? null);
  const findRows = vi.fn(async ({ take, where }: any) => rows.filter((item) => (!where.canonicalStatus || item.canonicalStatus === where.canonicalStatus)).slice(0, take));
  const reader = new PublicSwapHistoryReader({
    publicSwapHistoryCoverage: { findFirst: findCoverage }, publicSwapObservation: { findMany: findRows },
  } as any, true);
  return { reader, rows, coverages, findCoverage, findRows };
}

const request = { chainId: 4663 as const, poolAddress: POOL, fromBlock: 100n, toBlock: 101n, source: "reviewed-source" };

describe("public Swap exact covered history reader", () => {
  it("commits exact large integer values equally before and after decimal storage", () => {
    const large = "1" + "0".repeat(77);
    const stored = row({ amount0: new Prisma.Decimal(large) });
    expect(publicSwapContentDigest([{ ...stored, amount0: large }])).toBe(publicSwapContentDigest([stored]));
  });

  it("returns only committed canonical complete observations and committed empty ranges", async () => {
    const complete = setup();
    await expect(complete.reader.read(request, now)).resolves.toMatchObject({ state: "complete",
      evidence: { kind: "observed", chain: "eip155:4663", instrumentId: `eip155:4663/pool:${POOL}`,
        sourceId: "reviewed-source", sourceVersion: "unknown", decoderVersion: "uniswap-v3-swap-abi-v1",
        anchor: { height: "101", hash: HASH, semantics: "current-not-final" },
        coverage: { state: "complete", scope: { fromBlock: "100", toBlock: "101" }, gaps: [] },
        freshness: { state: "unknown", checkedAt: now.toISOString() } },
      events: [{ amount0: "-12", amount1: "34" }] });
    const empty = setup({ rows: [], status: "EMPTY" });
    await expect(empty.reader.read(request, now)).resolves.toMatchObject({ state: "empty", events: [],
      evidence: { coverage: { state: "empty" }, anchor: { height: "101", hash: HASH }, units: { amount0: "raw-token-units" } } });
  });

  it("fails closed when evidence timestamps or the retained range anchor are absent or inconsistent", async () => {
    const noObservedAt = setup();
    noObservedAt.coverages[0].observedAt = null;
    await expect(noObservedAt.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const noAnchor = setup();
    noAnchor.coverages[0].blockHash = null;
    await expect(noAnchor.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const changedAnchor = setup();
    changedAnchor.findCoverage.mockImplementationOnce(async () => changedAnchor.coverages[0]).mockImplementationOnce(async () => ({
      ...changedAnchor.coverages[0], blockHash: `0x${"bb".repeat(32)}`,
    }));
    await expect(changedAnchor.reader.read(request, now)).resolves.toEqual({ state: "gap" });
  });

  it("keeps empty ranges unreadable until their anchor is independently promoted and rejects forked coverage", async () => {
    const unverified = setup({ rows: [], status: "EMPTY", coverageCanonicalStatus: "UNKNOWN" });
    await expect(unverified.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    unverified.coverages[0].canonicalStatus = "CANONICAL";
    await expect(unverified.reader.read(request, now)).resolves.toMatchObject({ state: "empty", events: [], evidence: { coverage: { state: "empty" } } });

    const forked = setup({ rows: [], status: "EMPTY", coverageCanonicalStatus: "ORPHANED" });
    await expect(forked.reader.read(request, now)).resolves.toEqual({ state: "gap" });
  });

  it("keeps a repeat capture readable when its observation timestamp changes", async () => {
    const observations: Record<string, any>[] = [];
    const coverages: Record<string, any>[] = [];
    const history = {
      ingestObservation: async (input: Record<string, any>) => {
        const existing = observations.find((item) => item.blockHash === input.blockHash
          && item.transactionHash === input.transactionHash && item.logIndex === input.logIndex);
        if (existing) return existing;
        const stored = { ...input, amount0: new Prisma.Decimal(input.amount0), amount1: new Prisma.Decimal(input.amount1),
          sqrtPriceX96: new Prisma.Decimal(input.sqrtPriceX96), liquidity: new Prisma.Decimal(input.liquidity), canonicalStatus: "UNKNOWN", retentionExpiresAt: null };
        observations.push(stored);
        return stored;
      },
      recordCoverage: async (input: Record<string, any>) => {
        const prior = coverages.at(-1);
        if (prior && prior.status === input.status && prior.contentDigest === input.contentDigest) return prior;
        const coverage = { ...input, id: `coverage-${coverages.length + 1}`, revision: coverages.length + 1,
          canonicalStatus: "UNKNOWN", observedAt: new Date("2026-09-23T12:00:00.000Z"), retentionExpiresAt: null };
        coverages.push(coverage);
        return coverage;
      },
    };
    const capture = new PublicSwapCapture({ scan: async () => ({ state: "complete", toBlockHash: HASH, logs: [{
      address: POOL, blockNumber: 101n, blockHash: HASH, transactionHash: TX, logIndex: 2,
      blockTimestamp: new Date("2026-09-23T11:59:00.000Z"), topics: [OBSERVED_TRADES_SWAP_TOPIC,
        `0x${"00".repeat(12)}${"22".repeat(20)}`, `0x${"00".repeat(12)}${"22".repeat(20)}`],
      data: encodeAbiParameters([{ type: "int256" }, { type: "int256" }, { type: "uint160" },
        { type: "uint128" }, { type: "int24" }], [-12n, 34n, 5n, 7n, -2]),
    }] }) }, history as any, true);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-23T12:00:00.000Z"));
      await capture.capture(request);
      vi.setSystemTime(new Date("2026-09-23T12:01:00.000Z"));
      await capture.capture(request);
    } finally {
      vi.useRealTimers();
    }
    observations[0].canonicalStatus = "CANONICAL";
    coverages.at(-1)!.canonicalStatus = "CANONICAL";
    const reader = new PublicSwapHistoryReader({
      publicSwapHistoryCoverage: { findFirst: async () => coverages.at(-1) },
      publicSwapObservation: { findMany: async () => observations.filter((item) => item.canonicalStatus === "CANONICAL") },
    } as any, true);
    await expect(reader.read(request, now)).resolves.toMatchObject({ state: "complete", events: [{ amount0: "-12" }] });
  });

  it("rejects old uncommitted coverage, non-success coverage, and a newer gap revision", async () => {
    const old = setup({ commitment: false });
    await expect(old.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const failed = setup({ status: "UNAVAILABLE" });
    await expect(failed.reader.read(request, now)).resolves.toEqual({ state: "unavailable" });
    const revised = setup();
    revised.coverages.push({ ...revised.coverages[0], id: "coverage-2", revision: 2, status: "GAP", contentDigest: null, expectedEventCount: null });
    await expect(revised.reader.read(request, now)).resolves.toEqual({ state: "gap" });
  });

  it("fails closed for deleted, noncanonical, duplicate, expired, or malformed observations", async () => {
    const cases = [
      setup({ rows: [row({ canonicalStatus: "UNKNOWN" })] }),
      setup({ rows: [row({ canonicalStatus: "ORPHANED" })] }),
      setup({ rows: [row({ retentionExpiresAt: new Date(now.getTime()) })] }),
      setup({ rows: [row({ blockNumber: 99n })] }),
      setup({ rows: [row({ blockHash: `0x${"bb".repeat(32)}` })] }),
    ];
    for (const testCase of cases) await expect(testCase.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const deleted = setup();
    deleted.rows.length = 0;
    await expect(deleted.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const expiredCoverage = setup({ coverageExpiry: new Date(now.getTime()) });
    await expect(expiredCoverage.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const malformed = setup();
    malformed.rows[0].blockTimestamp = new Date("invalid");
    await expect(malformed.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const duplicate = setup({ rows: [row(), row({ id: "event-2" })] });
    await expect(duplicate.reader.read(request, now)).resolves.toEqual({ state: "gap" });
  });

  it("reads revised canonical content while ignoring stale orphaned observations", async () => {
    const orphan = row({ id: "orphan", blockHash: `0x${"bb".repeat(32)}`, transactionHash: `0x${"dd".repeat(32)}`, canonicalStatus: "ORPHANED" });
    const canonical = row({ id: "canonical", amount0: new Prisma.Decimal("-99"), canonicalStatus: "CANONICAL" });
    const revised = setup({ rows: [orphan, canonical], committedRows: [canonical] });
    await expect(revised.reader.read(request, now)).resolves.toMatchObject({ state: "complete", events: [{ amount0: "-99" }] });
  });

  it("rejects mismatched content digests, more than 100 rows, and invalid ranges", async () => {
    const mismatch = setup();
    mismatch.coverages[0].contentDigest = "0".repeat(64);
    await expect(mismatch.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const tooMany = setup({ rows: Array.from({ length: 101 }, (_, i) => row({
      id: `event-${i}`, transactionHash: `0x${i.toString(16).padStart(64, "0")}`,
    })) });
    await expect(tooMany.reader.read(request, now)).resolves.toEqual({ state: "gap" });
    const invalid = setup();
    await expect(invalid.reader.read({ ...request, chainId: 1 } as any, now)).resolves.toEqual({ state: "gap" });
    expect(invalid.findRows).not.toHaveBeenCalled();
  });

  it("fails closed if a newer coverage revision appears while rows are being read", async () => {
    const changed = setup();
    changed.findCoverage.mockImplementationOnce(async () => changed.coverages[0]).mockImplementationOnce(async () => ({
      ...changed.coverages[0], id: "coverage-2", revision: 2, status: "GAP",
    }));
    await expect(changed.reader.read(request, now)).resolves.toEqual({ state: "gap" });
  });
});
