import type { ProviderHttp } from "../chain/provider-http.js";
import { OBSERVED_TRADES_SWAP_TOPIC } from "../market/observed-trades.js";
import type { CapturedSwapLog, PublicSwapRangeSource, SwapRangeRequest, SwapRangeScan } from "./public-swap-capture.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BLOCKS = 100n;
const MAX_LOGS = 100;
const MAX_HEADERS = 100;

export type RpcSwapRangeAdmission = {
  /** Code-side assertion only; provider terms, limits, and capacity still need review. */
  allowCompleteRangeLogs: boolean;
  /** Documented provider response cap for this exact method/query, in logs. */
  documentedProviderLogCap: number;
};

/**
 * One explicit pool/window request with no pagination assumptions. This adapter
 * is inert unless admission is explicitly asserted and never logs RPC payloads.
 */
export class RpcSwapRangeSource implements PublicSwapRangeSource {
  constructor(
    private readonly http: ProviderHttp,
    private readonly endpoint: string,
    private readonly admission: RpcSwapRangeAdmission = { allowCompleteRangeLogs: false, documentedProviderLogCap: 0 },
  ) {}

  async scan(request: SwapRangeRequest): Promise<SwapRangeScan> {
    if (!this.admission.allowCompleteRangeLogs || !Number.isSafeInteger(this.admission.documentedProviderLogCap)
      || this.admission.documentedProviderLogCap < MAX_LOGS + 1) return { state: "unavailable" };
    if (!validRequest(request)) return { state: "gap" };
    try {
      const chain = await this.call("eth_chainId", []);
      if (!isQuantity(chain) || BigInt(chain) !== 4663n) return { state: "gap" };

      const anchor = await this.readHeader(request.toBlock);
      if (!anchor) return { state: "gap" };
      const rawLogs = await this.call("eth_getLogs", [{
        address: request.poolAddress,
        fromBlock: hex(request.fromBlock),
        toBlock: hex(request.toBlock),
        topics: [OBSERVED_TRADES_SWAP_TOPIC],
      }]);
      if (!Array.isArray(rawLogs) || rawLogs.length >= MAX_LOGS) return { state: "gap" };

      const logs: CapturedSwapLog[] = [];
      const positions = new Set<string>();
      const hashesByBlock = new Map<bigint, string>();
      const distinctBlocks = new Set<bigint>();
      for (const raw of rawLogs) {
        const parsed = parseLog(raw, request);
        if (!parsed) return { state: "gap" };
        const position = `${parsed.blockNumber}:${parsed.logIndex}`;
        if (positions.has(position)) return { state: "gap" };
        positions.add(position);
        distinctBlocks.add(parsed.blockNumber);
        const existingHash = hashesByBlock.get(parsed.blockNumber);
        if (existingHash !== undefined && existingHash !== parsed.blockHash.toLowerCase()) return { state: "gap" };
        hashesByBlock.set(parsed.blockNumber, parsed.blockHash.toLowerCase());
        logs.push(parsed);
      }
      if (distinctBlocks.size > MAX_HEADERS) return { state: "gap" };

      const timestamps = new Map<bigint, Date>();
      for (const number of distinctBlocks) {
        const header = await this.readHeader(number);
        if (!header || header.hash !== hashesByBlock.get(number)) return { state: "gap" };
        timestamps.set(number, header.timestamp);
      }
      for (const log of logs) log.blockTimestamp = timestamps.get(log.blockNumber)!;

      const finalAnchor = await this.readHeader(request.toBlock);
      if (!finalAnchor || finalAnchor.hash !== anchor.hash) return { state: "gap" };
      return { state: "complete", toBlockHash: anchor.hash, logs };
    } catch {
      return { state: "unavailable" };
    }
  }

  private async readHeader(number: bigint): Promise<{ hash: string; timestamp: Date } | null> {
    const value = await this.call("eth_getBlockByNumber", [hex(number), false]);
    if (!isRecord(value) || value.number !== hex(number) || typeof value.hash !== "string" || !HASH.test(value.hash)
      || !isQuantity(value.timestamp)) return null;
    const seconds = BigInt(value.timestamp);
    if (seconds > BigInt(Math.floor(8_640_000_000_000_000 / 1000))) return null;
    return { hash: value.hash.toLowerCase(), timestamp: new Date(Number(seconds) * 1000) };
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const id = `opsis-swap-${++this.nextId}`;
    const response = await this.http.requestJson(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!isRecord(response) || response.jsonrpc !== "2.0" || response.id !== id || "error" in response || !("result" in response)) {
      throw new Error("Invalid RPC response");
    }
    return response.result;
  }

  private nextId = 0;
}

function validRequest(request: SwapRangeRequest): boolean {
  return request.chainId === 4663 && ADDRESS.test(request.poolAddress)
    && request.fromBlock >= 0n && request.toBlock >= request.fromBlock
    && request.toBlock - request.fromBlock + 1n <= MAX_BLOCKS
    && SOURCE_ID.test(request.source);
}

function parseLog(value: unknown, request: SwapRangeRequest): CapturedSwapLog | null {
  if (!isRecord(value) || typeof value.address !== "string" || !ADDRESS.test(value.address)
    || value.address.toLowerCase() !== request.poolAddress.toLowerCase()
    || !isQuantity(value.blockNumber) || !isQuantity(value.logIndex)
    || !isQuantity(value.transactionIndex) || typeof value.blockHash !== "string" || !HASH.test(value.blockHash)
    || typeof value.transactionHash !== "string" || !HASH.test(value.transactionHash)
    || !Array.isArray(value.topics) || value.topics.length !== 3
    || value.topics.some((topic) => typeof topic !== "string" || !HASH.test(topic))
    || (value.topics[0] as string).toLowerCase() !== OBSERVED_TRADES_SWAP_TOPIC
    || typeof value.data !== "string" || !HEX_DATA.test(value.data) || value.data.length !== 322
    || (value.removed !== undefined && typeof value.removed !== "boolean") || value.removed === true) return null;
  const blockNumber = BigInt(value.blockNumber as string);
  const logIndex = BigInt(value.logIndex as string);
  if (blockNumber < request.fromBlock || blockNumber > request.toBlock || logIndex > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    address: value.address,
    blockNumber,
    blockHash: value.blockHash,
    transactionHash: value.transactionHash,
    logIndex: Number(logIndex),
    blockTimestamp: new Date(0),
    removed: value.removed as boolean | undefined,
    topics: value.topics as string[],
    data: value.data,
  };
}

function isQuantity(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);
}

function hex(value: bigint): string { return `0x${value.toString(16)}`; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
