import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

export const PUBLIC_SWAP_HISTORY_STORAGE_ENABLED = false;

export type PublicSwapObservationInput = {
  chainId: number;
  poolAddress: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  blockTimestamp: Date;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: number;
  source: string;
  observedAt?: Date;
  retentionExpiresAt?: Date | null;
};

export type PublicSwapHistoryCoverageInput = {
  chainId: number;
  poolAddress: string;
  fromBlock: bigint;
  toBlock: bigint;
  blockHash?: string | null;
  source: string;
  status: "COMPLETE" | "EMPTY" | "PARTIAL" | "GAP" | "UNAVAILABLE";
  expectedEventCount?: number | null;
  contentDigest?: string | null;
  detail?: string | null;
  observedAt?: Date;
  retentionExpiresAt?: Date | null;
};

export type PublicSwapCommittedObservation = Pick<PublicSwapObservationInput,
  "chainId" | "poolAddress" | "blockNumber" | "blockHash" | "transactionHash" | "logIndex"
  | "blockTimestamp" | "tick" | "source">
  & { amount0: string | Prisma.Decimal; amount1: string | Prisma.Decimal; sqrtPriceX96: string | Prisma.Decimal; liquidity: string | Prisma.Decimal };

/** SHA-256 of canonical normalized retained content; ordering is independent of source page order. */
export function publicSwapContentDigest(rows: readonly PublicSwapCommittedObservation[]): string {
  const exactDecimal = (value: string | Prisma.Decimal) => typeof value === "string" ? value : value.toFixed(0);
  const sorted = [...rows].sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1
    : a.blockHash.localeCompare(b.blockHash) || a.transactionHash.localeCompare(b.transactionHash) || a.logIndex - b.logIndex);
  const content = sorted.map((row) => [
    row.chainId, row.poolAddress.toLowerCase(), row.blockNumber.toString(), row.blockHash.toLowerCase(),
    row.transactionHash.toLowerCase(), row.logIndex, row.blockTimestamp.toISOString(), exactDecimal(row.amount0),
    exactDecimal(row.amount1), exactDecimal(row.sqrtPriceX96), exactDecimal(row.liquidity), row.tick, row.source,
  ]);
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export class PublicSwapHistoryConflictError extends Error {
  constructor() {
    super("Conflicting payload for an existing public Swap event identity");
    this.name = "PublicSwapHistoryConflictError";
  }
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const INT256_MIN = -(1n << 255n);
const INT256_MAX = (1n << 255n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const DECIMAL_78_MAX = 10n ** 78n - 1n;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function canonicalHex(value: string, pattern: RegExp, name: string): string {
  const normalized = value.toLowerCase();
  assert(pattern.test(normalized), `Invalid ${name}`);
  return normalized;
}

function integer(value: string, name: string): bigint {
  assert(/^-?(0|[1-9][0-9]*)$/.test(value), `${name} must be an exact integer string`);
  const parsed = BigInt(value);
  assert(parsed.toString() === value, `${name} must be canonical`);
  return parsed;
}

function validateObservation(input: PublicSwapObservationInput) {
  assert(Number.isSafeInteger(input.chainId) && input.chainId > 0, "Invalid chainId");
  assert(input.blockNumber >= 0n && input.blockNumber <= POSTGRES_BIGINT_MAX, "Invalid blockNumber");
  assert(Number.isInteger(input.logIndex) && input.logIndex >= 0, "Invalid logIndex");
  assert(Number.isInteger(input.tick) && input.tick >= -(2 ** 23) && input.tick < 2 ** 23, "Invalid tick");
  assert(input.blockTimestamp instanceof Date && Number.isFinite(input.blockTimestamp.getTime()), "Invalid blockTimestamp");
  const amount0 = integer(input.amount0, "amount0");
  const amount1 = integer(input.amount1, "amount1");
  const sqrtPriceX96 = integer(input.sqrtPriceX96, "sqrtPriceX96");
  const liquidity = integer(input.liquidity, "liquidity");
  assert(amount0 >= INT256_MIN && amount0 <= INT256_MAX, "amount0 outside int256 range");
  assert(amount1 >= INT256_MIN && amount1 <= INT256_MAX, "amount1 outside int256 range");
  assert(sqrtPriceX96 >= 0n && sqrtPriceX96 <= UINT160_MAX, "sqrtPriceX96 outside uint160 range");
  assert(liquidity >= 0n && liquidity <= UINT128_MAX, "liquidity outside uint128 range");
  for (const value of [amount0, amount1, sqrtPriceX96, liquidity]) {
    assert(value >= -DECIMAL_78_MAX && value <= DECIMAL_78_MAX, "Integer exceeds decimal storage precision");
  }
  assert(input.source.trim().length > 0 && input.source.length <= 120, "Invalid source");
  return {
    ...input,
    poolAddress: canonicalHex(input.poolAddress, ADDRESS, "poolAddress"),
    blockHash: canonicalHex(input.blockHash, HASH, "blockHash"),
    transactionHash: canonicalHex(input.transactionHash, HASH, "transactionHash"),
    amount0: new Prisma.Decimal(amount0.toString()),
    amount1: new Prisma.Decimal(amount1.toString()),
    sqrtPriceX96: new Prisma.Decimal(sqrtPriceX96.toString()),
    liquidity: new Prisma.Decimal(liquidity.toString()),
  };
}

function validateCoverage(input: PublicSwapHistoryCoverageInput) {
  assert(Number.isSafeInteger(input.chainId) && input.chainId > 0, "Invalid chainId");
  assert(input.fromBlock >= 0n && input.toBlock >= input.fromBlock && input.toBlock <= POSTGRES_BIGINT_MAX, "Invalid block range");
  assert(SOURCE_ID.test(input.source), "Invalid source");
  assert(input.detail == null || input.detail.length <= 500, "Coverage detail is too long");
  assert(input.expectedEventCount == null || (Number.isSafeInteger(input.expectedEventCount) && input.expectedEventCount >= 0), "Invalid expected event count");
  assert(input.contentDigest == null || /^[a-f0-9]{64}$/.test(input.contentDigest), "Invalid content digest");
  if (input.status === "COMPLETE" || input.status === "EMPTY") {
    assert(input.expectedEventCount != null && input.contentDigest != null, "Successful coverage requires a content commitment");
    assert(input.blockHash != null, "Successful coverage requires a range anchor");
    assert(input.status !== "EMPTY" || input.expectedEventCount === 0, "EMPTY coverage must commit zero events");
    assert(input.status !== "COMPLETE" || input.expectedEventCount > 0, "COMPLETE coverage must commit events");
  } else {
    assert(input.expectedEventCount == null && input.contentDigest == null, "Unsuccessful coverage cannot have a content commitment");
  }
  return {
    ...input,
    poolAddress: canonicalHex(input.poolAddress, ADDRESS, "poolAddress"),
    blockHash: input.blockHash == null ? null : canonicalHex(input.blockHash, HASH, "blockHash"),
  };
}

export class PublicSwapHistoryRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly enabled = PUBLIC_SWAP_HISTORY_STORAGE_ENABLED,
  ) {}

  private requireEnabled() {
    if (!this.enabled) throw new Error("Public Swap history storage is disabled");
  }

  async ingestObservation(input: PublicSwapObservationInput) {
    this.requireEnabled();
    const data = validateObservation(input);
    const identity = {
      chainId_poolAddress_blockHash_transactionHash_logIndex: {
        chainId: data.chainId,
        poolAddress: data.poolAddress,
        blockHash: data.blockHash,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
      },
    };
    const existing = await this.prisma.publicSwapObservation.findUnique({ where: identity });
    if (existing) return this.assertSameObservation(existing, data);

    try {
      return await this.prisma.publicSwapObservation.create({ data: { ...data, canonicalStatus: "UNKNOWN" } });
    } catch (error) {
      // A concurrent identical ingest can win the unique insert. Re-read and
      // compare the immutable payload; never use an upsert that rewrites it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const concurrent = await this.prisma.publicSwapObservation.findUnique({ where: identity });
      if (!concurrent) throw error;
      return this.assertSameObservation(concurrent, data);
    }
  }

  private assertSameObservation(existing: {
    blockNumber: bigint;
    blockTimestamp: Date;
    amount0: Prisma.Decimal;
    amount1: Prisma.Decimal;
    sqrtPriceX96: Prisma.Decimal;
    liquidity: Prisma.Decimal;
    tick: number;
    source: string;
  }, incoming: ReturnType<typeof validateObservation>) {
    const same = existing.blockNumber === incoming.blockNumber
      && existing.blockTimestamp.getTime() === incoming.blockTimestamp.getTime()
      && existing.amount0.toFixed(0) === incoming.amount0.toFixed(0)
      && existing.amount1.toFixed(0) === incoming.amount1.toFixed(0)
      && existing.sqrtPriceX96.toFixed(0) === incoming.sqrtPriceX96.toFixed(0)
      && existing.liquidity.toFixed(0) === incoming.liquidity.toFixed(0)
      && existing.tick === incoming.tick
      && existing.source === incoming.source;
    if (!same) throw new PublicSwapHistoryConflictError();
    return existing;
  }

  /** Call only after an independent source has verified the canonical hash at this height. */
  async promoteVerifiedCanonicalBlock(input: { chainId: number; blockNumber: bigint; blockHash: string }) {
    this.requireEnabled();
    assert(Number.isSafeInteger(input.chainId) && input.chainId > 0, "Invalid chainId");
    assert(input.blockNumber >= 0n && input.blockNumber <= POSTGRES_BIGINT_MAX, "Invalid blockNumber");
    const blockHash = canonicalHex(input.blockHash, HASH, "blockHash");
    return this.prisma.$transaction(async (tx) => {
      const matching = await tx.publicSwapObservation.updateMany({
        where: { chainId: input.chainId, blockNumber: input.blockNumber, blockHash },
        data: { canonicalStatus: "CANONICAL" },
      });
      const orphaned = await tx.publicSwapObservation.updateMany({
        where: { chainId: input.chainId, blockNumber: input.blockNumber, blockHash: { not: blockHash } },
        data: { canonicalStatus: "ORPHANED" },
      });
      const matchingCoverage = await tx.publicSwapHistoryCoverage.updateMany({
        where: { chainId: input.chainId, toBlock: input.blockNumber, status: { in: ["COMPLETE", "EMPTY"] }, blockHash },
        data: { canonicalStatus: "CANONICAL" },
      });
      const orphanedCoverage = await tx.publicSwapHistoryCoverage.updateMany({
        where: { chainId: input.chainId, toBlock: input.blockNumber, status: { in: ["COMPLETE", "EMPTY"] }, blockHash: { not: blockHash } },
        data: { canonicalStatus: "ORPHANED" },
      });
      return { canonical: matching.count, orphaned: orphaned.count, canonicalCoverage: matchingCoverage.count, orphanedCoverage: orphanedCoverage.count };
    });
  }

  /**
   * Promote one exact latest coverage revision only after its independently
   * verified block hashes and committed rows agree. The serializable read and
   * conditional write prevent a newer coverage revision from being promoted
   * through a check made before a concurrent recapture.
   */
  async promoteVerifiedCanonicalRange(input: {
    chainId: 4663;
    poolAddress: string;
    fromBlock: bigint;
    toBlock: bigint;
    source: string;
    coverageId: string;
    revision: number;
    blockHash: string;
    verifiedBlocks: readonly { blockNumber: bigint; blockHash: string }[];
  }): Promise<boolean> {
    this.requireEnabled();
    assert(input.chainId === 4663 && input.fromBlock >= 0n && input.toBlock >= input.fromBlock
      && input.toBlock <= POSTGRES_BIGINT_MAX && input.toBlock - input.fromBlock < 100n,
    "Invalid verified history range");
    const poolAddress = canonicalHex(input.poolAddress, ADDRESS, "poolAddress");
    const anchorHash = canonicalHex(input.blockHash, HASH, "blockHash");
    assert(SOURCE_ID.test(input.source) && typeof input.coverageId === "string" && input.coverageId.length > 0
      && input.coverageId.length <= 120 && Number.isSafeInteger(input.revision) && input.revision > 0,
    "Invalid verified coverage identity");
    assert(input.verifiedBlocks.length > 0 && input.verifiedBlocks.length <= 100, "Invalid verified block cap");
    const verified = new Map<bigint, string>();
    for (const block of input.verifiedBlocks) {
      assert(block.blockNumber >= input.fromBlock && block.blockNumber <= input.toBlock
        && !verified.has(block.blockNumber), "Invalid verified block list");
      verified.set(block.blockNumber, canonicalHex(block.blockHash, HASH, "verified blockHash"));
    }
    assert(verified.get(input.toBlock) === anchorHash, "Missing verified range anchor");

    return this.prisma.$transaction(async (tx) => {
      const range = { chainId: input.chainId, poolAddress, fromBlock: input.fromBlock,
        toBlock: input.toBlock, source: input.source };
      const latest = await tx.publicSwapHistoryCoverage.findFirst({ where: range, orderBy: { revision: "desc" } });
      if (!latest || latest.id !== input.coverageId || latest.revision !== input.revision
        || latest.canonicalStatus !== "UNKNOWN" || (latest.status !== "COMPLETE" && latest.status !== "EMPTY")
        || latest.blockHash !== anchorHash || latest.expectedEventCount === null || latest.contentDigest === null) return false;

      const rows = await tx.publicSwapObservation.findMany({
        where: { chainId: input.chainId, poolAddress, source: input.source,
          blockNumber: { gte: input.fromBlock, lte: input.toBlock } },
        take: 101,
      });
      if (rows.length > 100 || rows.some((row) => !verified.has(row.blockNumber))) return false;
      const canonicalRows = rows.filter((row) => row.blockHash === verified.get(row.blockNumber));
      if (canonicalRows.length !== latest.expectedEventCount
        || publicSwapContentDigest(canonicalRows) !== latest.contentDigest
        || (latest.status === "EMPTY" ? canonicalRows.length !== 0 : canonicalRows.length === 0)) return false;

      for (const [blockNumber, blockHash] of verified) {
        const scope = { chainId: input.chainId, poolAddress, source: input.source, blockNumber };
        await tx.publicSwapObservation.updateMany({ where: { ...scope, blockHash }, data: { canonicalStatus: "CANONICAL" } });
        await tx.publicSwapObservation.updateMany({ where: { ...scope, blockHash: { not: blockHash } },
          data: { canonicalStatus: "ORPHANED" } });
      }
      const updated = await tx.publicSwapHistoryCoverage.updateMany({
        where: { id: input.coverageId, revision: input.revision, canonicalStatus: "UNKNOWN" },
        data: { canonicalStatus: "CANONICAL" },
      });
      if (updated.count !== 1) throw new PublicSwapHistoryConflictError();
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recordCoverage(input: PublicSwapHistoryCoverageInput) {
    this.requireEnabled();
    const data = validateCoverage(input);
    return this.prisma.$transaction(async (tx) => {
      const identity = {
        chainId: data.chainId,
        poolAddress: data.poolAddress,
        fromBlock: data.fromBlock,
        toBlock: data.toBlock,
        source: data.source,
      };
      const prior = await tx.publicSwapHistoryCoverage.findFirst({
        where: identity,
        orderBy: { revision: "desc" },
      });
      if (prior && prior.blockHash === data.blockHash && prior.status === data.status && (prior.detail ?? null) === (data.detail ?? null)
        && prior.expectedEventCount === (data.expectedEventCount ?? null)
        && prior.contentDigest === (data.contentDigest ?? null)
        && prior.retentionExpiresAt?.getTime() === data.retentionExpiresAt?.getTime()) return prior;
      return tx.publicSwapHistoryCoverage.create({
        data: { ...data, revision: (prior?.revision ?? 0) + 1 },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
