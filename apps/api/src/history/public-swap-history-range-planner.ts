import type { CanonicalCoverage } from "./public-swap-canonical-verifier.js";
import type { WorkerRange } from "./public-swap-capture-worker.js";

const CHAIN_ID = 4663;
const MAX_BLOCKS_PER_RANGE = 100n;
const MAX_RANGES_PER_CALL = 100;
const MAX_BLOCK = 9_223_372_036_854_775_807n;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type PlannerCoverage = Pick<CanonicalCoverage,
  "chainId" | "poolAddress" | "fromBlock" | "toBlock" | "source" | "status" | "canonicalStatus">
  & Pick<CanonicalCoverage, "id" | "revision" | "blockHash">
  & { expectedEventCount?: number | null; contentDigest?: string | null; retentionExpiresAt?: Date | null;
    /** Caller assertion after an exact reader check; this planner does not verify stored rows. */
    readVerified: boolean };

export type HistoryRangePlanInput = {
  chainId: number;
  poolAddress: string;
  source: string;
  fromBlock: bigint;
  toBlock: bigint;
  maxRanges: number;
  asOf: Date;
  coverage: readonly PlannerCoverage[];
};

export type HistoryRangePlan = {
  source: string;
  ranges: readonly WorkerRange[];
  hasMore: boolean;
};

/** Pure preparation only: caller must verify stored coverage; emitted ranges still need explicit worker allowlisting. */
export function planPublicSwapHistoryRanges(input: HistoryRangePlanInput): HistoryRangePlan {
  validateInput(input);

  const ranges: WorkerRange[] = [];
  let cursor = input.fromBlock;
  for (const row of input.coverage) {
    if (ranges.length > input.maxRanges) break;
    if (cursor < row.fromBlock) {
      appendUncovered(ranges, input, cursor, row.fromBlock - 1n);
    }
    if (isVerifiedComplete(row, input.asOf)) {
      cursor = row.toBlock + 1n;
    } else {
      appendUncovered(ranges, input, row.fromBlock, row.toBlock);
      cursor = row.toBlock + 1n;
    }
  }
  if (ranges.length <= input.maxRanges && cursor <= input.toBlock) appendUncovered(ranges, input, cursor, input.toBlock);

  return {
    source: input.source,
    hasMore: ranges.length > input.maxRanges,
    ranges: ranges.slice(0, input.maxRanges),
  };
}

function validateInput(input: HistoryRangePlanInput): void {
  if (!input || input.chainId !== CHAIN_ID || typeof input.poolAddress !== "string"
    || !ADDRESS.test(input.poolAddress) || input.poolAddress !== input.poolAddress.toLowerCase()
    || typeof input.source !== "string" || !SOURCE_ID.test(input.source)
    || typeof input.fromBlock !== "bigint" || typeof input.toBlock !== "bigint"
    || input.fromBlock < 0n || input.toBlock < input.fromBlock || input.toBlock > MAX_BLOCK
    || !Number.isSafeInteger(input.maxRanges) || input.maxRanges < 1 || input.maxRanges > MAX_RANGES_PER_CALL
    || !(input.asOf instanceof Date) || !Number.isFinite(input.asOf.getTime())
    || !Array.isArray(input.coverage)) {
    throw new TypeError("Invalid public Swap history range plan input");
  }

  let previousTo: bigint | undefined;
  for (const row of input.coverage) {
    if (!row || row.chainId !== input.chainId || row.poolAddress !== input.poolAddress || row.source !== input.source
      || typeof row.fromBlock !== "bigint" || typeof row.toBlock !== "bigint"
      || row.fromBlock < input.fromBlock || row.toBlock > input.toBlock || row.fromBlock < 0n || row.toBlock > MAX_BLOCK
      || row.toBlock < row.fromBlock || !isKnownStatus(row.status)
      || !["CANONICAL", "UNKNOWN", "ORPHANED"].includes(row.canonicalStatus)
      || typeof row.id !== "string" || row.id.length === 0
      || !Number.isSafeInteger(row.revision) || row.revision < 1
      || typeof row.readVerified !== "boolean") {
      throw new TypeError("Invalid or foreign public Swap history coverage row");
    }
    if (previousTo !== undefined && row.fromBlock <= previousTo) {
      throw new TypeError("Public Swap history coverage must be sorted and non-overlapping");
    }
    previousTo = row.toBlock;
  }
}

function appendUncovered(ranges: WorkerRange[], input: HistoryRangePlanInput, fromBlock: bigint, toBlock: bigint): void {
  for (let start = fromBlock; start <= toBlock && ranges.length <= input.maxRanges; start += MAX_BLOCKS_PER_RANGE) {
    const end = start + MAX_BLOCKS_PER_RANGE - 1n < toBlock
      ? start + MAX_BLOCKS_PER_RANGE - 1n
      : toBlock;
    ranges.push({ chainId: CHAIN_ID, poolAddress: input.poolAddress, source: input.source, fromBlock: start, toBlock: end });
  }
}

function isVerifiedComplete(row: PlannerCoverage, asOf: Date): boolean {
  return (row.status === "COMPLETE" || row.status === "EMPTY") && row.canonicalStatus === "CANONICAL"
    && row.readVerified && typeof row.blockHash === "string" && /^0x[0-9a-f]{64}$/.test(row.blockHash)
    && Number.isSafeInteger(row.expectedEventCount) && row.expectedEventCount! >= 0
    && typeof row.contentDigest === "string" && /^[a-f0-9]{64}$/.test(row.contentDigest)
    && (row.status === "EMPTY" ? row.expectedEventCount === 0 : row.expectedEventCount! > 0)
    && (row.retentionExpiresAt === null || (row.retentionExpiresAt instanceof Date
      && Number.isFinite(row.retentionExpiresAt.getTime()) && row.retentionExpiresAt.getTime() > asOf.getTime()));
}

function isKnownStatus(status: string): boolean {
  return ["COMPLETE", "EMPTY", "PARTIAL", "GAP", "UNAVAILABLE"].includes(status);
}
