import type { Prisma, PrismaClient } from "@prisma/client";
import { publicSwapContentDigest, PUBLIC_SWAP_HISTORY_STORAGE_ENABLED } from "./public-swap-history.js";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BLOCKS = 100n;
const MAX_ROWS = 100;

export type PublicSwapHistoryRequest = {
  chainId: 4663;
  poolAddress: string;
  fromBlock: bigint;
  toBlock: bigint;
  source: string;
};

export type PublicSwapHistoryRead =
  | { state: "complete"; evidence: PublicSwapHistoryEvidence; events: Record<string, unknown>[] }
  | { state: "empty"; evidence: PublicSwapHistoryEvidence; events: [] }
  | { state: "gap" }
  | { state: "unavailable" };

export type PublicSwapHistoryEvidence = {
  kind: "observed";
  chain: "eip155:4663";
  instrumentId: string;
  observedAt: string;
  sourceId: string;
  sourceVersion: "unknown";
  decoderVersion: "uniswap-v3-swap-abi-v1";
  anchor: { height: string; hash: string; semantics: "current-not-final" };
  coverage: { state: "complete" | "empty"; scope: { fromBlock: string; toBlock: string };
    caps: { maxBlocks: number; maxEvents: number }; gaps: [] };
  freshness: { state: "unknown"; checkedAt: string };
  units: { amount0: "raw-token-units"; amount1: "raw-token-units"; sqrtPriceX96: "Q64.96";
    liquidity: "raw-pool-liquidity"; tick: "ticks" };
  limitations: string[];
};

type ReaderDb = Pick<PrismaClient, "publicSwapHistoryCoverage" | "publicSwapObservation">;

/** Read only exact, committed history. It never contacts a chain source. */
export class PublicSwapHistoryReader {
  constructor(private readonly prisma: ReaderDb, private readonly enabled = PUBLIC_SWAP_HISTORY_STORAGE_ENABLED) {}

  async read(request: PublicSwapHistoryRequest, now = new Date()): Promise<PublicSwapHistoryRead> {
    if (!this.enabled) return { state: "unavailable" };
    if (request.chainId !== 4663 || !ADDRESS.test(request.poolAddress) || request.fromBlock < 0n
      || request.toBlock < request.fromBlock || request.toBlock - request.fromBlock + 1n > MAX_BLOCKS
      || !SOURCE_ID.test(request.source) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return { state: "gap" };

    const range = { chainId: 4663, poolAddress: request.poolAddress.toLowerCase(), fromBlock: request.fromBlock,
      toBlock: request.toBlock, source: request.source };
    const coverage = await this.prisma.publicSwapHistoryCoverage.findFirst({
      where: range, orderBy: { revision: "desc" },
    });
    if (!coverage) return { state: "gap" };
    if (coverage.status === "GAP" || coverage.status === "PARTIAL") return { state: "gap" };
    if (coverage.status === "UNAVAILABLE") return { state: "unavailable" };
    if (coverage.status !== "COMPLETE" && coverage.status !== "EMPTY") return { state: "gap" };
    if (coverage.canonicalStatus !== "CANONICAL") return { state: "gap" };
    const expectedEventCount = coverage.expectedEventCount;
    if ((coverage.retentionExpiresAt !== null && (!(coverage.retentionExpiresAt instanceof Date)
      || coverage.retentionExpiresAt.getTime() <= now.getTime()))
      || typeof expectedEventCount !== "number" || !Number.isSafeInteger(expectedEventCount) || expectedEventCount < 0
      || typeof coverage.contentDigest !== "string" || !/^[a-f0-9]{64}$/.test(coverage.contentDigest)
      || (coverage.status === "EMPTY" ? expectedEventCount !== 0 : expectedEventCount < 1)) return { state: "gap" };

    const rows = await this.prisma.publicSwapObservation.findMany({
      where: { chainId: 4663, poolAddress: range.poolAddress, source: request.source, canonicalStatus: "CANONICAL",
        blockNumber: { gte: request.fromBlock, lte: request.toBlock } },
      orderBy: [{ blockNumber: "asc" }, { blockHash: "asc" }, { transactionHash: "asc" }, { logIndex: "asc" }],
      take: MAX_ROWS + 1,
    });
    if (rows.length > MAX_ROWS || rows.length !== expectedEventCount) return { state: "gap" };
    const seen = new Set<string>();
    for (const row of rows) {
      const identity = `${row.blockHash}:${row.transactionHash}:${row.logIndex}`;
      if (seen.has(identity) || row.canonicalStatus !== "CANONICAL" || row.chainId !== 4663
        || row.poolAddress !== range.poolAddress || row.source !== request.source
        || typeof row.blockNumber !== "bigint" || row.blockNumber < request.fromBlock || row.blockNumber > request.toBlock
        || (row.blockNumber === request.toBlock && row.blockHash !== coverage.blockHash)
        || !(row.blockTimestamp instanceof Date) || !Number.isFinite(row.blockTimestamp.getTime())
        || !(row.observedAt instanceof Date) || !Number.isFinite(row.observedAt.getTime())
        || (row.retentionExpiresAt !== null && (!(row.retentionExpiresAt instanceof Date)
          || row.retentionExpiresAt.getTime() <= now.getTime()))
        || !ADDRESS.test(row.poolAddress) || !/^0x[0-9a-f]{64}$/.test(row.blockHash)
        || !/^0x[0-9a-f]{64}$/.test(row.transactionHash) || !Number.isSafeInteger(row.logIndex) || row.logIndex < 0
        || !Number.isInteger(row.tick) || !/^-?(0|[1-9][0-9]*)$/.test(decimalString(row.amount0))
        || !/^-?(0|[1-9][0-9]*)$/.test(decimalString(row.amount1))
        || !/^(0|[1-9][0-9]*)$/.test(decimalString(row.sqrtPriceX96))
        || !/^(0|[1-9][0-9]*)$/.test(decimalString(row.liquidity))) return { state: "gap" };
      seen.add(identity);
    }
    if (publicSwapContentDigest(rows) !== coverage.contentDigest) return { state: "gap" };
    const latest = await this.prisma.publicSwapHistoryCoverage.findFirst({ where: range, orderBy: { revision: "desc" } });
    if (!latest || latest.id !== coverage.id || latest.revision !== coverage.revision || latest.status !== coverage.status
      || latest.contentDigest !== coverage.contentDigest || latest.expectedEventCount !== coverage.expectedEventCount
      || latest.blockHash !== coverage.blockHash || !(latest.observedAt instanceof Date)
      || latest.observedAt.getTime() !== coverage.observedAt?.getTime()
      || latest.canonicalStatus !== "CANONICAL") return { state: "gap" };
    if (!(coverage.observedAt instanceof Date) || !Number.isFinite(coverage.observedAt.getTime())
      || typeof coverage.blockHash !== "string" || !/^0x[0-9a-f]{64}$/.test(coverage.blockHash)) return { state: "gap" };
    const evidence: PublicSwapHistoryEvidence = {
      kind: "observed",
      chain: "eip155:4663",
      instrumentId: `eip155:4663/pool:${range.poolAddress}`,
      observedAt: coverage.observedAt.toISOString(),
      sourceId: coverage.source,
      sourceVersion: "unknown",
      decoderVersion: "uniswap-v3-swap-abi-v1",
      anchor: { height: coverage.toBlock.toString(), hash: coverage.blockHash, semantics: "current-not-final" },
      coverage: { state: coverage.status === "EMPTY" ? "empty" : "complete",
        scope: { fromBlock: coverage.fromBlock.toString(), toBlock: coverage.toBlock.toString() },
        caps: { maxBlocks: Number(MAX_BLOCKS), maxEvents: MAX_ROWS }, gaps: [] },
      freshness: { state: "unknown", checkedAt: now.toISOString() },
      units: { amount0: "raw-token-units", amount1: "raw-token-units", sqrtPriceX96: "Q64.96",
        liquidity: "raw-pool-liquidity", tick: "ticks" },
      limitations: ["Pool identity does not identify token contracts or token decimals.",
        "Source version, redistribution rights, and freshness are not established by stored coverage.",
        "Swap observations are not OHLC candles or USD prices."],
    };
    if (coverage.status === "EMPTY") return rows.length === 0 ? { state: "empty", evidence, events: [] } : { state: "gap" };
    return rows.length > 0 ? { state: "complete", evidence, events: rows.map(publicEvent) } : { state: "gap" };
  }
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && "toFixed" in value && typeof (value as Prisma.Decimal).toFixed === "function") {
    return (value as Prisma.Decimal).toFixed(0);
  }
  return "";
}

function publicEvent(row: Record<string, any>): Record<string, unknown> {
  return {
    chainId: row.chainId, poolAddress: row.poolAddress, blockNumber: row.blockNumber.toString(), blockHash: row.blockHash,
    transactionHash: row.transactionHash, logIndex: row.logIndex, blockTimestamp: row.blockTimestamp.toISOString(),
    amount0: decimalString(row.amount0), amount1: decimalString(row.amount1), sqrtPriceX96: decimalString(row.sqrtPriceX96),
    liquidity: decimalString(row.liquidity), tick: row.tick,
  };
}
