import {
  decodeAbiParameters,
  decodeEventLog,
  encodeFunctionData,
  formatUnits,
  isAddress,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import {
  createProviderHttp,
  ProviderRequestError,
  type ProviderHttp,
} from "../chain/provider-http.js";
import { AppError } from "../http/errors.js";
import {
  createObservedTradesBudget,
  type ObservedTradesBudget,
} from "./observed-trades-budget.js";

// Official Uniswap deployments on Robinhood Chain 4663, verified against the
// Uniswap SDK address registry and live eth_getCode/selector checks.
export const OBSERVED_TRADES_CHAIN_ID = 4663 as const;
export const OBSERVED_TRADES_FACTORY =
  "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
export const OBSERVED_TRADES_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
export const OBSERVED_TRADES_FEES = [100, 500, 3000, 10000] as const;
export const OBSERVED_TRADES_ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";
export const OBSERVED_TRADES_DEAD_ADDRESS =
  "0x000000000000000000000000000000000000dead";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]*$/;

const factoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const satisfies Abi;

const poolAbi = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const satisfies Abi;

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const satisfies Abi;

const swapAbi = [
  {
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
  },
] as const satisfies Abi;

export type ObservedTradesInput = {
  chainId: 4663;
  contract?: string;
  fee?: (typeof OBSERVED_TRADES_FEES)[number];
  windowBlocks?: number;
};

export type ObservedTradeToken = {
  address: string;
  symbol: string | null;
  decimals: number;
  reviewed: boolean;
};

export type ObservedTradeSide = "buy" | "sell";

export type ObservedTradeObservation = {
  id: string;
  side: ObservedTradeSide;
  pool: string;
  fee: number;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  blockTime: string | null;
  logIndex: number;
  baseToken: ObservedTradeToken;
  quoteToken: ObservedTradeToken;
  baseAmount: string;
  quoteAmount: string;
  notionalQuote: string;
  eventSender: string | null;
  eventRecipient: string | null;
  transactionSender: string | null;
  transactionSenderType: "eoa" | "contract" | "unknown";
  followable: boolean;
};

export type ObservedTradesResponse = {
  schemaVersion: 1;
  state: "observed" | "empty";
  chain: { id: 4663; slug: "robinhood"; name: "Robinhood Chain" };
  pair: {
    base: ObservedTradeToken;
    quote: ObservedTradeToken;
    pool: string;
    fee: number;
    factory: string;
    factoryVerified: true;
  };
  window: {
    fromBlock: number;
    toBlock: number;
    fromTime: string | null;
    toTime: string;
    requestedBlocks: number;
    blockCount: number;
    capped: boolean;
    narrowed: boolean;
    notes: string[];
  };
  coverage: {
    poolsRequested: number;
    poolVerified: boolean;
    logsScanned: number;
    matchedLogs: number;
    topRows: number;
    logCap: number;
    blockCap: number;
    logCapReached: boolean;
    rpcUnits: number;
  };
  classification: {
    method: "uniswap_v3_swap_signed_amounts";
    transfersUsed: false;
  };
  observations: ObservedTradeObservation[];
  limitations: string[];
  fetchedAt: string;
  privacy: {
    accountRequired: false;
    walletConnectionRequired: false;
    serverStorage: "none";
    modelProvider: "none";
    providerDestinations: string[];
    disclosure: string;
  };
};

type Dependencies = {
  rpc: ProviderHttp;
  budget: ObservedTradesBudget;
  now: () => Date;
};

type RpcCall = { id: string; method: string; params: unknown[] };
type RpcRun = { rpcUnits: number };
type CapturedAnchor = {
  number: number;
  hex: string;
  hash: string;
  timestamp: number;
};
type ResolvedTokens = {
  token0: string;
  token1: string;
  base: ObservedTradeToken;
  quote: ObservedTradeToken;
};
type PoolTokenIdentity = { token0: string; token1: string };

const POOL_TOKEN_CACHE_MAX_ENTRIES = 128;
type RawObservation = {
  side: ObservedTradeSide;
  baseAmountRaw: bigint;
  quoteAmountRaw: bigint;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  eventSender: string | null;
  eventRecipient: string | null;
  transactionSender: string | null;
  transactionSenderType: "eoa" | "contract" | "unknown";
  blockTime: string | null;
};

export interface ObservedTradesSource {
  observe(input: ObservedTradesInput): Promise<ObservedTradesResponse>;
}

export class ObservedTradesService implements ObservedTradesSource {
  private readonly dependencies: Dependencies;
  private readonly inflight = new Map<string, Promise<ObservedTradesResponse>>();
  private readonly poolTokenCache = new Map<string, PoolTokenIdentity>();

  constructor(
    private readonly env: Env,
    dependencies?: Partial<Dependencies>,
  ) {
    const oneAttemptEnv: Env = { ...env, PROVIDER_MAX_RETRIES: 0 };
    this.dependencies = {
      rpc:
        dependencies?.rpc ??
        createProviderHttp(oneAttemptEnv, "observed-trades-rpc", 2 * 1024 * 1024, "observed-trades"),
      budget: dependencies?.budget ?? createObservedTradesBudget(env),
      now: dependencies?.now ?? (() => new Date()),
    };
  }

  async observe(input: ObservedTradesInput): Promise<ObservedTradesResponse> {
    const requestedWindow = clampWindowBlocks(
      input.windowBlocks ?? this.env.OBSERVED_TRADES_MAX_BLOCKS,
      this.env.OBSERVED_TRADES_MIN_BLOCKS,
      this.env.OBSERVED_TRADES_MAX_BLOCKS,
    );
    const pair = resolvePair(input.contract);
    const key = `${pair.base.address}:${pair.quote.address}:${input.fee ?? "all"}:${requestedWindow}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const operation = this.observeFresh(pair, input.fee, requestedWindow)
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, operation);
    return operation;
  }

  private async observeFresh(
    pair: ReturnType<typeof resolvePair>,
    fee: ObservedTradesInput["fee"],
    requestedWindow: number,
  ): Promise<ObservedTradesResponse> {
    const run: RpcRun = { rpcUnits: 0 };
    const anchor = await this.captureAnchor(run);
    const pool = await this.resolvePool(pair, fee, anchor, run);
    const tokens = await this.resolveTokens(
      pool.address,
      pool.codeHash,
      pair,
      anchor,
      run,
    );
    const logs = await this.fetchBoundedLogs(pool.address, anchor, requestedWindow, run);
    const decoded = logs.logs.map((log) =>
      decodeObservation(log, pool.address, tokens, anchor, logs.fromBlock),
    );
    validateLogSet(decoded);
    const ranked = sortObservations(decoded);
    const top = ranked.slice(0, this.env.OBSERVED_TRADES_TOP_ROWS);
    const verifiedBlockTimes = await this.enrichTopRows(
      top,
      logs.fromBlock,
      anchor,
      run,
    );
    const fromTime =
      logs.fromBlock === anchor.number
        ? new Date(anchor.timestamp * 1_000).toISOString()
        : verifiedBlockTimes.get(logs.fromBlock) ?? null;
    await this.recheckAnchor(anchor, run);
    const windowBlockCount = anchor.number - logs.fromBlock + 1;
    return {
      schemaVersion: 1,
      state: ranked.length > 0 ? "observed" : "empty",
      chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
      pair: {
        base: tokens.base,
        quote: tokens.quote,
        pool: pool.address,
        fee: pool.fee,
        factory: OBSERVED_TRADES_FACTORY,
        factoryVerified: true,
      },
      window: {
        fromBlock: logs.fromBlock,
        toBlock: anchor.number,
        fromTime,
        toTime: new Date(anchor.timestamp * 1_000).toISOString(),
        requestedBlocks: requestedWindow,
        blockCount: windowBlockCount,
        capped: logs.narrowed,
        narrowed: logs.narrowed,
        notes: logs.narrowed
          ? [
              "The requested range matched more logs than the public RPC returns, so ChainScout observed a smaller complete window instead of an incomplete larger one.",
            ]
          : [],
      },
      coverage: {
        poolsRequested: pool.poolsRequested,
        poolVerified: true,
        logsScanned: logs.logs.length,
        matchedLogs: ranked.length,
        topRows: top.length,
        logCap: this.env.OBSERVED_TRADES_MAX_LOGS,
        blockCap: this.env.OBSERVED_TRADES_MAX_BLOCKS,
        logCapReached: false,
        rpcUnits: run.rpcUnits,
      },
      classification: {
        method: "uniswap_v3_swap_signed_amounts",
        transfersUsed: false,
      },
      observations: top.map((observation) => ({
        id: `${observation.txHash}:${observation.logIndex}`,
        side: observation.side,
        pool: pool.address,
        fee: pool.fee,
        txHash: observation.txHash,
        blockNumber: observation.blockNumber,
        blockHash: observation.blockHash,
        blockTime: observation.blockTime,
        logIndex: observation.logIndex,
        baseToken: tokens.base,
        quoteToken: tokens.quote,
        baseAmount: formatUnits(observation.baseAmountRaw, tokens.base.decimals),
        quoteAmount: formatUnits(
          observation.quoteAmountRaw,
          tokens.quote.decimals,
        ),
        notionalQuote: formatUnits(
          observation.quoteAmountRaw,
          tokens.quote.decimals,
        ),
        eventSender: observation.eventSender,
        eventRecipient: observation.eventRecipient,
        transactionSender: observation.transactionSender,
        transactionSenderType: observation.transactionSenderType,
        followable:
          observation.transactionSenderType === "eoa" &&
          isFollowableAddress(observation.transactionSender),
      })),
      limitations: [
        "Observed from one factory-verified Uniswap V3 pool; this is not a chain-wide or all-venue ranking.",
        "The window is a bounded recent block range, not a UTC day and not complete coverage. Missing logs are never zero.",
        "Each row is one signed V3 Swap event for this pool, classified from amount0/amount1 only, never from token transfers.",
        "A single transaction can contain multiple Swaps, flash loans, or multi-hop routes; a row is not a trader's net position, profit, identity, or coordination.",
        "Event sender and recipient are pool-event addresses. The transaction sender is the paying account for one transaction, not necessarily a real person or the beneficial owner.",
        "Nothing here is a safety verdict, price, recommendation, or smart-money signal.",
      ],
      fetchedAt: this.dependencies.now().toISOString(),
      privacy: {
        accountRequired: false,
        walletConnectionRequired: false,
        serverStorage: "none",
        modelProvider: "none",
        providerDestinations: ["Robinhood Public RPC"],
        disclosure:
          "Your clicked request sent the public token contract, the factory-derived pool address, and a bounded block range to the Robinhood Public RPC, which returned public Swap logs and transaction data for displayed rows. Dense displayed blocks may be returned with all their public transactions; their hashes are checked for consistency, only displayed transactions are used to label rows, and unused transaction data is not retained. Public sender addresses and account code may be read for displayed rows. These are public chain identifiers, not your wallet. No private wallet, Vault, label, note, ownership, or AI data was sent.",
      },
    };
  }

  private async captureAnchor(run: RpcRun): Promise<CapturedAnchor> {
    const header = asRecord(
      await this.rpcSingle("eth_getBlockByNumber", ["latest", false], run),
    );
    const number = parseHexNumber(header.number);
    const hash =
      typeof header.hash === "string" && HASH.test(header.hash)
        ? header.hash.toLowerCase()
        : null;
    const timestamp = parseHexNumber(header.timestamp);
    if (number === null || hash === null || timestamp === null) {
      throw new AppError(
        "OBSERVED_TRADES_PROVIDER_UNAVAILABLE",
        503,
        "A current Robinhood Chain block anchor could not be captured",
      );
    }
    return { number, hex: `0x${number.toString(16)}`, hash, timestamp };
  }

  private async recheckAnchor(anchor: CapturedAnchor, run: RpcRun): Promise<void> {
    const header = asRecord(
      await this.rpcSingle("eth_getBlockByNumber", [anchor.hex, false], run),
    );
    if (
      typeof header.hash !== "string" ||
      header.hash.toLowerCase() !== anchor.hash
    ) {
      throw new AppError(
        "OBSERVED_TRADES_REORGED",
        503,
        "The captured block changed during observation; reload before relying on these trades",
      );
    }
  }

  private async resolvePool(
    pair: ReturnType<typeof resolvePair>,
    fee: ObservedTradesInput["fee"],
    anchor: CapturedAnchor,
    run: RpcRun,
  ): Promise<{ address: string; fee: number; poolsRequested: number; codeHash: string }> {
    const fees = fee ? [fee] : [...OBSERVED_TRADES_FEES];
    // One JSON-RPC batch of direct eth_call reads, never a contract multicall:
    // the SDK's Robinhood multicall address does not implement aggregate3.
    const calls: RpcCall[] = fees.map((candidate) => ({
      id: `pool:${candidate}`,
      method: "eth_call",
      params: [
        {
          to: OBSERVED_TRADES_FACTORY,
          data: encodeFunctionData({
            abi: factoryAbi,
            functionName: "getPool",
            args: [
              pair.base.address as Address,
              pair.quote.address as Address,
              candidate,
            ],
          }),
        },
        anchor.hex,
      ],
    }));
    const results = await this.rpcBatch(calls, run);
    let failedRead = false;
    for (const candidateFee of fees) {
      const read = readGetPoolResult(results.get(`pool:${candidateFee}`)?.result);
      if (read.state === "zero") continue;
      if (read.state === "failed") {
        // A missing, errored, or malformed result is an unavailable read, not
        // proof that no pool exists. Keep checking the remaining fee tiers.
        failedRead = true;
        continue;
      }
      const code = await this.rpcSingle(
        "eth_getCode",
        [read.address, anchor.hex],
        run,
      );
      if (typeof code !== "string" || !HEX.test(code)) {
        failedRead = true;
        continue;
      }
      if (code === "0x" || code === "0x0") {
        failedRead = true;
        continue;
      }
      let codeHash: string;
      try {
        if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error("invalid bytecode");
        codeHash = keccak256(code as Hex).toLowerCase();
      } catch {
        failedRead = true;
        continue;
      }
      return {
        address: read.address,
        fee: candidateFee,
        poolsRequested: fees.length,
        codeHash,
      };
    }
    if (failedRead) {
      throw new AppError(
        "OBSERVED_TRADES_PROVIDER_UNAVAILABLE",
        503,
        "One or more factory pool reads failed at the captured block; this is not proof that no pool exists",
      );
    }
    throw new AppError(
      "OBSERVED_TRADES_POOL_NOT_FOUND",
      404,
      "No factory-verified Uniswap V3 pool exists for this token pair at the standard fee tiers",
    );
  }

  private async resolveTokens(
    pool: string,
    codeHash: string,
    pair: ReturnType<typeof resolvePair>,
    anchor: CapturedAnchor,
    run: RpcRun,
  ): Promise<ResolvedTokens> {
    const call = (id: string, to: string, data: Hex): RpcCall => ({
      id,
      method: "eth_call",
      params: [{ to, data }, anchor.hex],
    });
    // Official V3 pool token0/token1 are constructor immutables embedded in
    // runtime code. The freshly checked factory address and code hash bound
    // reuse to that exact pool identity; ERC-20 decimals remain fresh reads.
    const cacheKey = `${OBSERVED_TRADES_CHAIN_ID}:${OBSERVED_TRADES_FACTORY}:${pool}:${codeHash}`;
    const cachedTokens = this.getCachedPoolTokens(cacheKey);
    const calls: RpcCall[] = cachedTokens
      ? []
      : [
          call("token0", pool, encodeFunctionData({ abi: poolAbi, functionName: "token0" })),
          call("token1", pool, encodeFunctionData({ abi: poolAbi, functionName: "token1" })),
        ];
    if (!pair.base.reviewed) {
      calls.push(
        call(
          "decimals:base",
          pair.base.address,
          encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }),
        ),
      );
    }
    if (!pair.quote.reviewed) {
      calls.push(
        call(
          "decimals:quote",
          pair.quote.address,
          encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }),
        ),
      );
    }
    const results = calls.length > 0 ? await this.rpcBatch(calls, run) : new Map();
    const token0 = cachedTokens?.token0 ?? decodeCallAddress(results.get("token0")?.result);
    const token1 = cachedTokens?.token1 ?? decodeCallAddress(results.get("token1")?.result);
    if (!token0 || !token1) {
      throw new AppError(
        "OBSERVED_TRADES_MALFORMED",
        503,
        "The pool did not return readable token addresses at the captured block",
      );
    }
    const baseDecimals = pair.base.reviewed
      ? pair.base.decimals
      : decodeCallDecimals(results.get("decimals:base")?.result);
    const quoteDecimals = pair.quote.reviewed
      ? pair.quote.decimals
      : decodeCallDecimals(results.get("decimals:quote")?.result);
    if (baseDecimals === null || quoteDecimals === null) {
      throw new AppError(
        "OBSERVED_TRADES_MALFORMED",
        503,
        "A pool token did not return a readable decimals value at the captured block",
      );
    }
    const matches =
      (token0 === pair.base.address && token1 === pair.quote.address) ||
      (token0 === pair.quote.address && token1 === pair.base.address);
    if (!matches) {
      throw new AppError(
        "OBSERVED_TRADES_MALFORMED",
        503,
        "The factory pool tokens did not match the requested pair",
      );
    }
    if (!cachedTokens) this.cachePoolTokens(cacheKey, { token0, token1 });
    return {
      token0,
      token1,
      base: { ...pair.base, decimals: baseDecimals },
      quote: { ...pair.quote, decimals: quoteDecimals },
    };
  }

  private getCachedPoolTokens(key: string): PoolTokenIdentity | undefined {
    const value = this.poolTokenCache.get(key);
    if (!value) return undefined;
    this.poolTokenCache.delete(key);
    this.poolTokenCache.set(key, value);
    return value;
  }

  private cachePoolTokens(key: string, value: PoolTokenIdentity): void {
    this.poolTokenCache.delete(key);
    this.poolTokenCache.set(key, value);
    if (this.poolTokenCache.size > POOL_TOKEN_CACHE_MAX_ENTRIES) {
      const oldest = this.poolTokenCache.keys().next().value;
      if (oldest !== undefined) this.poolTokenCache.delete(oldest);
    }
  }

  private async fetchBoundedLogs(
    pool: string,
    anchor: CapturedAnchor,
    requestedWindow: number,
    run: RpcRun,
  ): Promise<{
    logs: unknown[];
    fromBlock: number;
    narrowed: boolean;
  }> {
    let windowBlocks = requestedWindow;
    let narrowed = false;
    let lastMessage = "";
    // The window is inclusive of both bounds, so `windowBlocks` counts
    // `toBlock - fromBlock + 1`. One bounded narrowing is permitted.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const fromBlock = Math.max(0, anchor.number - windowBlocks + 1);
      const record = asRecord(
        await this.rpcRecord(
          "eth_getLogs",
          [
            {
              address: pool,
              topics: [OBSERVED_TRADES_SWAP_TOPIC],
              fromBlock: `0x${fromBlock.toString(16)}`,
              toBlock: anchor.hex,
            },
          ],
          run,
        ),
      );
      if (record.error !== undefined) {
        lastMessage = String(asRecord(record.error).message ?? "");
        if (
          isCapError(lastMessage) &&
          !narrowed &&
          windowBlocks > this.env.OBSERVED_TRADES_MIN_BLOCKS
        ) {
          windowBlocks = Math.max(
            this.env.OBSERVED_TRADES_MIN_BLOCKS,
            Math.floor(windowBlocks / 2),
          );
          narrowed = true;
          continue;
        }
        if (isCapError(lastMessage)) {
          throw new AppError(
            "OBSERVED_TRADES_RANGE_TOO_WIDE",
            503,
            "The requested block range matched more logs than the public RPC returns; request a smaller window",
          );
        }
        throw new AppError(
          "OBSERVED_TRADES_PROVIDER_UNAVAILABLE",
          503,
          "The bounded log query failed at the captured block",
        );
      }
      if (!Array.isArray(record.result)) {
        throw new AppError(
          "OBSERVED_TRADES_MALFORMED",
          503,
          "The log query returned a malformed result",
        );
      }
      const logs = record.result;
      if (logs.length >= this.env.OBSERVED_TRADES_MAX_LOGS) {
        if (
          !narrowed &&
          windowBlocks > this.env.OBSERVED_TRADES_MIN_BLOCKS
        ) {
          windowBlocks = Math.max(
            this.env.OBSERVED_TRADES_MIN_BLOCKS,
            Math.floor(windowBlocks / 2),
          );
          narrowed = true;
          continue;
        }
        throw new AppError(
          "OBSERVED_TRADES_LOGS_CAPPED",
          503,
          "This range matched at least the matched-log cap; a smaller window is required before any ranking",
        );
      }
      return { logs, fromBlock, narrowed };
    }
    throw new AppError(
      "OBSERVED_TRADES_RANGE_TOO_WIDE",
      503,
      "The requested block range could not be bounded within the public RPC limits",
    );
  }

  private async enrichTopRows(
    top: RawObservation[],
    fromBlock: number,
    anchor: CapturedAnchor,
    run: RpcRun,
  ): Promise<Map<number, string>> {
    const txHashes = [...new Set(top.map((row) => row.txHash))];
    const expected = new Map<
      string,
      { blockHash: string; blockNumber: number }
    >();
    for (const row of top) {
      const prior = expected.get(row.txHash);
      if (
        prior &&
        (prior.blockHash !== row.blockHash ||
          prior.blockNumber !== row.blockNumber)
      ) {
        throw new AppError(
          "OBSERVED_TRADES_MALFORMED_LOG",
          503,
          "The same transaction hash appeared with inconsistent block evidence",
        );
      }
      expected.set(row.txHash, {
        blockHash: row.blockHash,
        blockNumber: row.blockNumber,
      });
    }
    const blockNumbers = [
      ...new Set(
        [...top.map((row) => row.blockNumber), fromBlock]
          .filter((blockNumber) => blockNumber !== anchor.number),
      ),
    ];
    const groupedHashes = new Map<number, string[]>();
    for (const hash of txHashes) {
      const blockNumber = expected.get(hash)!.blockNumber;
      if (blockNumber === anchor.number) continue;
      const group = groupedHashes.get(blockNumber) ?? [];
      group.push(hash);
      groupedHashes.set(blockNumber, group);
    }
    const batchTxHashes = txHashes.filter((hash) => {
      const blockNumber = expected.get(hash)!.blockNumber;
      return blockNumber === anchor.number || (groupedHashes.get(blockNumber)?.length ?? 0) < 4;
    });
    const calls: RpcCall[] = [
      ...batchTxHashes.map((hash) => ({
        id: `tx:${hash}`,
        method: "eth_getTransactionByHash",
        params: [hash],
      })),
      ...blockNumbers.map((blockNumber) => ({
        id: `block:${blockNumber}`,
        method: "eth_getBlockByNumber",
        params: [`0x${blockNumber.toString(16)}`, false],
      })),
    ];
    const results =
      calls.length > 0
        ? await this.rpcBatch(calls, run)
        : new Map<string, Record<string, unknown>>();
    const senders = new Map<string, string>();
    const verifiedTransactions = new Map<string, unknown>();
    const individuallyRequested = new Set(batchTxHashes);
    for (const hash of batchTxHashes) {
      verifiedTransactions.set(hash, results.get(`tx:${hash}`)?.result);
    }
    const blockHeaders = new Map<number, Record<string, unknown>>();
    for (const blockNumber of blockNumbers) {
      blockHeaders.set(blockNumber, asRecord(results.get(`block:${blockNumber}`)?.result));
    }

    // A full block is useful only when the independently checked hash-only
    // header proves it contains every requested transaction and stays small.
    const fullBlockGroups = [...groupedHashes.entries()].filter(([number, hashes]) => {
      if (hashes.length < 4) return false;
      const header = blockHeaders.get(number) ?? {};
      const transactions = header.transactions;
      return Array.isArray(transactions) && transactions.length <= 64 &&
        transactions.every((hash) => typeof hash === "string" && HASH.test(hash)) &&
        hashes.every((hash) => transactions.some((candidate) =>
          typeof candidate === "string" && candidate.toLowerCase() === hash.toLowerCase()));
    });
    if (fullBlockGroups.length > 0) {
      let fullResults: Map<string, Record<string, unknown>> | null = null;
      try {
        fullResults = await this.rpcBatch(fullBlockGroups.map(([number]) => ({
          id: `full-block:${number}`,
          method: "eth_getBlockByNumber",
          params: [`0x${number.toString(16)}`, true],
        })), run);
      } catch (error) {
        // Optional full blocks can exceed a provider's response-size limit.
        // AppErrors and provider budget/circuit failures represent deliberate
        // service states. Only oversized or malformed responses fall back;
        // rate limits and provider outages must not trigger more requests.
        if (error instanceof AppError) throw error;
        if (!(error instanceof ProviderRequestError) || !(
          error.code === "PROVIDER_RESPONSE_TOO_LARGE" ||
          error.code === "PROVIDER_MALFORMED_RESPONSE" ||
          error.code === "PROVIDER_HTTP_413"
        )) throw error;
      }
      for (const [number, hashes] of fullBlockGroups) {
        const result = fullResults?.get(`full-block:${number}`);
        const full = asRecord(result?.result);
        const header = blockHeaders.get(number) ?? {};
        const fullHash = typeof full.hash === "string" ? full.hash.toLowerCase() : null;
        const headerHash = typeof header.hash === "string" ? header.hash.toLowerCase() : null;
        const fullNumber = parseHexNumber(full.number);
        if (result?.error === undefined && fullHash && headerHash &&
            (fullHash !== headerHash || (fullNumber !== null && fullNumber !== number))) {
          throw new AppError("OBSERVED_TRADES_REORGED", 503,
            "A displayed trade block changed during observation; reload before relying on these trades");
        }
        const transactions = full.transactions;
        const headerTransactions = header.transactions;
        const transactionHashes = Array.isArray(transactions)
          ? transactions.map((tx) => asRecord(tx).hash).filter(
              (hash): hash is string => typeof hash === "string" && HASH.test(hash),
            )
          : [];
        const headerHashes = Array.isArray(headerTransactions)
          ? headerTransactions.filter(
              (hash): hash is string => typeof hash === "string" && HASH.test(hash),
            )
          : [];
        const valid = result?.error === undefined && fullHash === headerHash &&
          fullNumber === number && Array.isArray(transactions) &&
          transactions.length <= 64 && Array.isArray(headerTransactions) &&
          transactionHashes.length === transactions.length &&
          transactionHashes.length === headerTransactions.length &&
          headerHashes.length === headerTransactions.length &&
          new Set(transactionHashes.map((hash) => hash.toLowerCase())).size === transactionHashes.length &&
          new Set(headerHashes.map((hash) => hash.toLowerCase())).size === headerHashes.length &&
          transactionHashes.every((hash) => headerHashes.some((candidate) =>
            candidate.toLowerCase() === hash.toLowerCase()));
        if (!valid) continue; // Malformed/full-block failure falls back to tx lookups.
        for (const hash of hashes) {
          const tx = transactions.map(asRecord).find((entry) =>
            typeof entry.hash === "string" && entry.hash.toLowerCase() === hash.toLowerCase());
          if (tx) verifiedTransactions.set(hash, tx);
        }
      }
    }
    const fallbackHashes = txHashes.filter((hash) =>
      !individuallyRequested.has(hash) && verifiedTransactions.get(hash) === undefined,
    );
    if (fallbackHashes.length > 0) {
      const fallbackResults = await this.rpcBatch(fallbackHashes.map((hash) => ({
        id: `tx:${hash}`, method: "eth_getTransactionByHash", params: [hash],
      })), run);
      for (const hash of fallbackHashes) verifiedTransactions.set(hash, fallbackResults.get(`tx:${hash}`)?.result);
    }
    for (const hash of txHashes) {
      const want = expected.get(hash);
      const entry = asRecord(verifiedTransactions.get(hash));
      const returnedHash =
        typeof entry.hash === "string" ? entry.hash.toLowerCase() : null;
      const returnedBlockHash =
        typeof entry.blockHash === "string"
          ? entry.blockHash.toLowerCase()
          : null;
      const returnedBlockNumber = parseHexNumber(entry.blockNumber);
      const from =
        typeof entry.from === "string" && ADDRESS.test(entry.from)
          ? entry.from.toLowerCase()
          : null;
      // A returned transaction is trusted only when its hash, block hash and
      // block number all match the requested log. Otherwise the sender stays
      // unknown and is never labelled from mismatched evidence.
      if (
        !want ||
        returnedHash !== hash.toLowerCase() ||
        returnedBlockHash !== want.blockHash ||
        returnedBlockNumber !== want.blockNumber ||
        !from
      ) {
        continue;
      }
      senders.set(hash, from);
    }
    const codeAddresses = [
      ...new Set([...senders.values()].filter(isFollowableAddress)),
    ];
    const codeResults =
      codeAddresses.length > 0
        ? await this.rpcBatch(
            codeAddresses.map((address) => ({
              id: `code:${address}`,
              method: "eth_getCode",
              params: [address, anchor.hex],
            })),
            run,
          )
        : new Map<string, Record<string, unknown>>();
    const verifiedBlockTime = new Map<number, string>();
    for (const blockNumber of blockNumbers) {
      const result = results.get(`block:${blockNumber}`);
      const entry = blockHeaders.get(blockNumber) ?? {};
      const hash =
        typeof entry.hash === "string" ? entry.hash.toLowerCase() : null;
      const timestamp = parseHexNumber(entry.timestamp);
      if (result?.error !== undefined || !hash || timestamp === null) {
        throw new AppError(
          "OBSERVED_TRADES_PROVIDER_UNAVAILABLE",
          503,
          "A displayed trade block could not be re-read at the captured anchor",
        );
      }
      const expectedHash = top.find(
        (row) => row.blockNumber === blockNumber,
      )?.blockHash;
      if (expectedHash && hash !== expectedHash) {
        throw new AppError(
          "OBSERVED_TRADES_REORGED",
          503,
          "A displayed trade block changed during observation; reload before relying on these trades",
        );
      }
      verifiedBlockTime.set(
        blockNumber,
        new Date(timestamp * 1_000).toISOString(),
      );
    }
    for (const row of top) {
      const sender = senders.get(row.txHash) ?? null;
      row.transactionSender = sender;
      if (!sender || !isFollowableAddress(sender)) {
        row.transactionSenderType = "unknown";
      } else {
        const codeResult = codeResults.get(`code:${sender}`);
        const code = codeResult?.result;
        // Missing, errored, or non-hex code is never labelled a contract.
        row.transactionSenderType =
          codeResult?.error !== undefined ||
          typeof code !== "string" ||
          !HEX.test(code)
            ? "unknown"
            : code === "0x" || code === "0x0"
              ? "eoa"
              : "contract";
      }
      row.blockTime =
        row.blockNumber === anchor.number
          ? new Date(anchor.timestamp * 1_000).toISOString()
          : verifiedBlockTime.get(row.blockNumber) ?? null;
    }
    return verifiedBlockTime;
  }

  private async rpcSingle(
    method: string,
    params: unknown[],
    run: RpcRun,
  ): Promise<unknown> {
    const record = asRecord(await this.rpcRecord(method, params, run));
    if (record.error !== undefined || record.result === undefined) {
      throw new AppError(
        "OBSERVED_TRADES_PROVIDER_UNAVAILABLE",
        503,
        "A direct Robinhood Chain read failed",
      );
    }
    return record.result;
  }

  private async rpcRecord(
    method: string,
    params: unknown[],
    run: RpcRun,
  ): Promise<unknown> {
    await this.consumeRpc(1, run);
    return this.dependencies.rpc.requestJson(this.env.ROBINHOOD_PUBLIC_RPC_URL, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "observed-trades",
        method,
        params,
      }),
    });
  }

  private async rpcBatch(
    calls: RpcCall[],
    run: RpcRun,
  ): Promise<Map<string, Record<string, unknown>>> {
    await this.consumeRpc(calls.length, run);
    const response = await this.dependencies.rpc.requestJson(
      this.env.ROBINHOOD_PUBLIC_RPC_URL,
      {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          calls.map((call) => ({
            jsonrpc: "2.0",
            id: call.id,
            method: call.method,
            params: call.params,
          })),
        ),
      },
    );
    if (!Array.isArray(response)) {
      throw new AppError(
        "OBSERVED_TRADES_MALFORMED",
        503,
        "The batched RPC response was malformed",
      );
    }
    return new Map(
      response
        .map((value) => asRecord(value))
        .filter((value) => typeof value.id === "string")
        .map((value) => [String(value.id), value]),
    );
  }

  private async consumeRpc(units: number, run: RpcRun): Promise<void> {
    if (run.rpcUnits + units > this.env.OBSERVED_TRADES_MAX_RPC_SUBCALLS) {
      throw new AppError(
        "OBSERVED_TRADES_RPC_LIMIT_EXCEEDED",
        503,
        "The observation exceeded its RPC safety limit",
      );
    }
    run.rpcUnits += units;
    await this.dependencies.budget.consume(units);
  }
}

export function resolvePair(contract?: string): {
  base: ObservedTradeToken;
  quote: ObservedTradeToken;
} {
  const weth = reviewedToken("WETH");
  const usdg = reviewedToken("USDG");
  if (!contract || contract === "") {
    return { base: weth, quote: usdg };
  }
  const normalized = contract.trim().toLowerCase();
  if (!isAddress(normalized) || !ADDRESS.test(normalized)) {
    throw new AppError(
      "INVALID_OBSERVED_TRADES_CONTRACT",
      400,
      "Provide one complete Robinhood Chain token contract",
    );
  }
  if (normalized === weth.address || normalized === usdg.address) {
    return { base: weth, quote: usdg };
  }
  return {
    base: {
      address: normalized,
      symbol: null,
      decimals: 0,
      reviewed: false,
    },
    quote: weth,
  };
}

function reviewedToken(symbol: "WETH" | "USDG"): ObservedTradeToken {
  const token = CHAINSCOUT_REVIEWED_ASSETS[symbol];
  return {
    address: token.address.toLowerCase(),
    symbol: token.symbol,
    decimals: token.decimals,
    reviewed: true,
  };
}

export function clampWindowBlocks(
  requested: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(requested)) return maximum;
  const rounded = Math.floor(requested);
  if (rounded < minimum) return minimum;
  if (rounded > maximum) return maximum;
  return rounded;
}

export function isCapError(message: string): boolean {
  return /exceeds (?:the )?(?:limit|maximum)|more than \d+|query returned more than|too many|response size|result set/i.test(
    message,
  );
}

export function sortObservations(
  observations: RawObservation[],
): RawObservation[] {
  return [...observations].sort((left, right) => {
    if (left.quoteAmountRaw !== right.quoteAmountRaw) {
      return left.quoteAmountRaw > right.quoteAmountRaw ? -1 : 1;
    }
    if (left.txHash !== right.txHash) return left.txHash < right.txHash ? -1 : 1;
    return left.logIndex - right.logIndex;
  });
}

export function isFollowableAddress(address: string | null): boolean {
  return (
    typeof address === "string" &&
    ADDRESS.test(address) &&
    address.toLowerCase() !== OBSERVED_TRADES_ZERO_ADDRESS &&
    address.toLowerCase() !== OBSERVED_TRADES_DEAD_ADDRESS
  );
}

export function validateLogSet(observations: RawObservation[]): void {
  const ids = new Set<string>();
  const blocks = new Map<number, string>();
  for (const observation of observations) {
    const id = `${observation.txHash}:${observation.logIndex}`;
    if (ids.has(id)) {
      throw new AppError(
        "OBSERVED_TRADES_MALFORMED_LOG",
        503,
        "The log query returned a duplicate transaction/log-index pair",
      );
    }
    ids.add(id);
    const known = blocks.get(observation.blockNumber);
    if (known && known !== observation.blockHash) {
      throw new AppError(
        "OBSERVED_TRADES_MALFORMED_LOG",
        503,
        "The log query returned inconsistent block hashes for one block number",
      );
    }
    blocks.set(observation.blockNumber, observation.blockHash);
  }
}

function decodeObservation(
  raw: unknown,
  pool: string,
  tokens: ResolvedTokens,
  anchor: CapturedAnchor,
  fromBlock: number,
): RawObservation {
  const log = asRecord(raw);
  const address =
    typeof log.address === "string" ? log.address.toLowerCase() : null;
  const topics = Array.isArray(log.topics) ? log.topics : null;
  const txHash = typeof log.transactionHash === "string" ? log.transactionHash.toLowerCase() : null;
  const blockHash =
    typeof log.blockHash === "string" ? log.blockHash.toLowerCase() : null;
  const blockNumber = parseHexNumber(log.blockNumber);
  const logIndex = parseHexNumber(log.logIndex);
  if (
    address !== pool ||
    log.removed === true ||
    !topics ||
    topics.length !== 3 ||
    String(topics[0]).toLowerCase() !== OBSERVED_TRADES_SWAP_TOPIC ||
    !txHash ||
    !HASH.test(txHash) ||
    !blockHash ||
    !HASH.test(blockHash) ||
    blockNumber === null ||
    blockNumber < fromBlock ||
    blockNumber > anchor.number ||
    (blockNumber === anchor.number && blockHash !== anchor.hash) ||
    logIndex === null ||
    typeof log.data !== "string" ||
    !HEX.test(log.data)
  ) {
    throw new AppError(
      "OBSERVED_TRADES_MALFORMED_LOG",
      503,
      "A matched log did not match the strict pool, topic, window, index, hash, or block contract",
    );
  }
  let args: {
    sender: string;
    recipient: string;
    amount0: bigint;
    amount1: bigint;
  };
  try {
    const decoded = decodeEventLog({
      abi: swapAbi,
      eventName: "Swap",
      data: log.data as Hex,
      topics: topics as [Hex, ...Hex[]],
    });
    const rawArgs = decoded.args as unknown as {
      sender: string;
      recipient: string;
      amount0: bigint;
      amount1: bigint;
    };
    args = {
      sender: rawArgs.sender,
      recipient: rawArgs.recipient,
      amount0: rawArgs.amount0,
      amount1: rawArgs.amount1,
    };
  } catch {
    throw new AppError(
      "OBSERVED_TRADES_MALFORMED_LOG",
      503,
      "A matched Swap log could not be decoded from its signed amounts",
    );
  }
  if (
    args.amount0 === 0n ||
    args.amount1 === 0n ||
    (args.amount0 > 0n) === (args.amount1 > 0n)
  ) {
    throw new AppError(
      "OBSERVED_TRADES_MALFORMED_LOG",
      503,
      "A matched Swap log did not carry opposite nonzero signed amounts",
    );
  }
  const baseIsToken0 = tokens.token0 === tokens.base.address;
  const baseDelta = baseIsToken0 ? args.amount0 : args.amount1;
  const quoteDelta = baseIsToken0 ? args.amount1 : args.amount0;
  const side: ObservedTradeSide = baseDelta < 0n ? "buy" : "sell";
  const baseAmountRaw = baseDelta < 0n ? -baseDelta : baseDelta;
  const quoteAmountRaw = quoteDelta < 0n ? -quoteDelta : quoteDelta;
  return {
    side,
    baseAmountRaw,
    quoteAmountRaw,
    txHash,
    blockNumber,
    blockHash,
    logIndex,
    eventSender:
      typeof args.sender === "string" ? args.sender.toLowerCase() : null,
    eventRecipient:
      typeof args.recipient === "string" ? args.recipient.toLowerCase() : null,
    transactionSender: null,
    transactionSenderType: "unknown",
    blockTime: null,
  };
}

type GetPoolRead =
  | { state: "pool"; address: string }
  | { state: "zero" }
  | { state: "failed" };

/**
 * Distinguishes a valid ABI-encoded zero address (this fee tier has no pool)
 * from a missing, errored, or malformed read (discovery unavailable). Without
 * this split a provider failure would be misreported as "no pool exists".
 */
function readGetPoolResult(result: unknown): GetPoolRead {
  if (typeof result !== "string" || !HEX.test(result) || result.length < 42) {
    return { state: "failed" };
  }
  try {
    const decoded = decodeAbiParameters([{ type: "address" }], result as Hex)[0];
    if (typeof decoded !== "string" || !ADDRESS.test(decoded)) {
      return { state: "failed" };
    }
    const address = decoded.toLowerCase();
    return address === OBSERVED_TRADES_ZERO_ADDRESS
      ? { state: "zero" }
      : { state: "pool", address };
  } catch {
    return { state: "failed" };
  }
}

function decodeCallAddress(result: unknown): string | null {
  if (typeof result !== "string" || !HEX.test(result) || result.length < 42) {
    return null;
  }
  try {
    const decoded = decodeAbiParameters([{ type: "address" }], result as Hex)[0];
    if (typeof decoded !== "string" || !ADDRESS.test(decoded)) return null;
    const address = decoded.toLowerCase();
    return address === OBSERVED_TRADES_ZERO_ADDRESS ? null : address;
  } catch {
    return null;
  }
}

function decodeCallDecimals(result: unknown): number | null {
  if (typeof result !== "string" || !HEX.test(result)) return null;
  try {
    const decoded = decodeAbiParameters([{ type: "uint8" }], result as Hex)[0];
    return typeof decoded === "number" &&
      Number.isInteger(decoded) &&
      decoded >= 0 &&
      decoded <= 255
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function parseHexNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const number = Number(BigInt(value));
  return Number.isSafeInteger(number) ? number : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
