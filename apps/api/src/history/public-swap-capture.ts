import { decodeEventLog, type Hex } from "viem";
import { OBSERVED_TRADES_SWAP_TOPIC } from "../market/observed-trades.js";
import { publicSwapContentDigest, type PublicSwapHistoryRepository, type PublicSwapObservationInput } from "./public-swap-history.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const DATA = /^0x[0-9a-fA-F]{320}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BLOCKS = 100n;
const MAX_LOGS = 100;

const swapAbi = [{
  type: "event",
  name: "Swap",
  inputs: [
    { name: "sender", type: "address", indexed: true },
    { name: "recipient", type: "address", indexed: true },
    { name: "amount0", type: "int256", indexed: false },
    { name: "amount1", type: "int256", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "liquidity", type: "uint128", indexed: false },
    { name: "tick", type: "int24", indexed: false },
  ],
}] as const;

export type CapturedSwapLog = {
  address: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  blockTimestamp: Date;
  removed?: boolean;
  topics: readonly string[];
  data: string;
};

export type SwapRangeRequest = {
  chainId: 4663;
  poolAddress: string;
  fromBlock: bigint;
  toBlock: bigint;
  source: string;
};

export type SwapRangeScan =
  | { state: "complete"; toBlockHash: string; logs: readonly CapturedSwapLog[] }
  | { state: "gap" | "unavailable" };

export interface PublicSwapRangeSource {
  /** Only return complete after all pages and the range's block anchor are checked. */
  scan(request: SwapRangeRequest): Promise<SwapRangeScan>;
}

type HistoryWriter = Pick<PublicSwapHistoryRepository, "ingestObservation" | "recordCoverage">;

export class PublicSwapCapture {
  constructor(
    private readonly source: PublicSwapRangeSource,
    private readonly history: HistoryWriter,
    private readonly enabled = false,
  ) {}

  async capture(request: SwapRangeRequest, options?: { assertLease: () => Promise<void> }): Promise<{ status: "COMPLETE" | "EMPTY" | "GAP" | "UNAVAILABLE"; rows: number }> {
    if (!this.enabled) throw new Error("Public Swap capture is disabled");
    assertRequest(request);
    const normalized = { ...request, poolAddress: request.poolAddress.toLowerCase() };
    const coverage = async (status: "COMPLETE" | "EMPTY" | "GAP" | "UNAVAILABLE", blockHash: string | null = null, rows?: PublicSwapObservationInput[]) => {
      // This check sits directly before the coverage write so stale workers cannot
      // publish a valid range after their Redis owner token has expired.
      await options?.assertLease();
      await this.history.recordCoverage({
        ...normalized,
        blockHash,
        status,
        expectedEventCount: rows ? rows.length : null,
        contentDigest: rows ? publicSwapContentDigest(rows) : null,
        detail: status === "GAP" ? "INCOMPLETE_OR_INVALID_RANGE" : status === "UNAVAILABLE" ? "SOURCE_UNAVAILABLE" : null,
      });
    };

    let scanned: SwapRangeScan;
    try {
      scanned = await this.source.scan(normalized);
    } catch {
      await coverage("UNAVAILABLE");
      return { status: "UNAVAILABLE", rows: 0 };
    }
    if (scanned.state !== "complete") {
      const status = scanned.state === "gap" ? "GAP" : "UNAVAILABLE";
      await coverage(status);
      return { status, rows: 0 };
    }

    let observations: PublicSwapObservationInput[];
    try {
      if (!HASH.test(scanned.toBlockHash) || scanned.logs.length > MAX_LOGS) throw new TypeError("Invalid range anchor or cap");
      const identities = new Set<string>();
      const observedAt = new Date();
      observations = scanned.logs.map((log) => {
        const observation = decodeSwapLog(normalized, scanned.toBlockHash, log);
        const identity = `${observation.blockHash}:${observation.transactionHash}:${observation.logIndex}`;
        if (identities.has(identity)) throw new TypeError("Duplicate event in one range");
        identities.add(identity);
        return { ...observation, observedAt };
      });
    } catch {
      await coverage("GAP");
      return { status: "GAP", rows: 0 };
    }

    try {
      for (const observation of observations) await this.history.ingestObservation(observation);
    } catch {
      // Previously inserted rows remain UNKNOWN. Readers must require complete
      // coverage, which is recorded only after every insert succeeds.
      await coverage("GAP");
      return { status: "GAP", rows: 0 };
    }
    const status = observations.length ? "COMPLETE" : "EMPTY";
    await coverage(status, scanned.toBlockHash.toLowerCase(), observations);
    return { status, rows: observations.length };
  }
}

function assertRequest(request: SwapRangeRequest): void {
  if (request.chainId !== 4663 || !ADDRESS.test(request.poolAddress)
    || request.fromBlock < 0n || request.toBlock < request.fromBlock
    || request.toBlock - request.fromBlock + 1n > MAX_BLOCKS
    || !SOURCE_ID.test(request.source)) {
    throw new TypeError("Invalid bounded Swap range request");
  }
}

function decodeSwapLog(request: SwapRangeRequest, toBlockHash: string, log: CapturedSwapLog): PublicSwapObservationInput {
  if (!ADDRESS.test(log.address) || log.address.toLowerCase() !== request.poolAddress
    || log.blockNumber < request.fromBlock || log.blockNumber > request.toBlock
    || !HASH.test(log.blockHash) || !HASH.test(log.transactionHash)
    || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0
    || !(log.blockTimestamp instanceof Date) || !Number.isFinite(log.blockTimestamp.getTime())
    || log.removed === true
    || log.topics.length !== 3 || log.topics[0]?.toLowerCase() !== OBSERVED_TRADES_SWAP_TOPIC
    || !HASH.test(log.topics[1] ?? "") || !HASH.test(log.topics[2] ?? "")
    || !DATA.test(log.data)
    || (log.blockNumber === request.toBlock && log.blockHash.toLowerCase() !== toBlockHash.toLowerCase())) {
    throw new TypeError("Invalid Swap event evidence");
  }
  const decoded = decodeEventLog({
    abi: swapAbi,
    eventName: "Swap",
    topics: log.topics as [Hex, ...Hex[]],
    data: log.data as Hex,
    strict: true,
  });
  return {
    chainId: request.chainId,
    poolAddress: request.poolAddress,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    blockTimestamp: log.blockTimestamp,
    amount0: decoded.args.amount0.toString(),
    amount1: decoded.args.amount1.toString(),
    sqrtPriceX96: decoded.args.sqrtPriceX96.toString(),
    liquidity: decoded.args.liquidity.toString(),
    tick: decoded.args.tick,
    source: request.source,
  };
}
