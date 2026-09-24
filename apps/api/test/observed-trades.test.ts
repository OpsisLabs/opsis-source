import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { encodeAbiParameters, type Hex } from "viem";
import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler, AppError } from "../src/http/errors.js";
import { ProviderRequestError, type ProviderHttp } from "../src/chain/provider-http.js";
import {
  ObservedTradesService,
  OBSERVED_TRADES_FACTORY,
  OBSERVED_TRADES_SWAP_TOPIC,
  clampWindowBlocks,
  isCapError,
  resolvePair,
  sortObservations,
  validateLogSet,
} from "../src/market/observed-trades.js";
import { marketRoutes } from "../src/routes/market.js";

const ANCHOR_NUMBER = 1000;
const ANCHOR_HASH = `0x${"11".repeat(32)}`;
const OTHER_HASH = `0x${"22".repeat(32)}`;
const POOL = `0x${"5a".repeat(20)}`;
const TOKEN0 = CHAINSCOUT_REVIEWED_ASSETS.WETH.address.toLowerCase();
const TOKEN1 = CHAINSCOUT_REVIEWED_ASSETS.USDG.address.toLowerCase();
const EOA_SENDER = `0x${"aa".repeat(20)}`;
const CONTRACT_SENDER = `0x${"bb".repeat(20)}`;
const RECIPIENT = `0x${"cc".repeat(20)}`;
const ZERO = "0x0000000000000000000000000000000000000000";

const swapDataAbi = [
  { type: "int256" },
  { type: "int256" },
  { type: "uint160" },
  { type: "uint128" },
  { type: "int24" },
] as const;
function topicFor(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function header(number: number, hash: string) {
  return {
    number: `0x${number.toString(16)}`,
    hash,
    timestamp: `0x${(1_700_000_000 + number).toString(16)}`,
  };
}

function addressReturn(address: string): Hex {
  return encodeAbiParameters([{ type: "address" }], [address as `0x${string}`]);
}

function txHash(seed: string): string {
  return `0x${seed.repeat(64).slice(0, 64)}`;
}

function swapLog(input: {
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  logIndex?: number;
  sender?: string;
  recipient?: string;
  amount0: bigint;
  amount1: bigint;
  address?: string;
  removed?: boolean;
}) {
  return {
    address: input.address ?? POOL,
    topics: [
      OBSERVED_TRADES_SWAP_TOPIC,
      topicFor(input.sender ?? EOA_SENDER),
      topicFor(input.recipient ?? RECIPIENT),
    ],
    data: encodeAbiParameters(swapDataAbi, [
      input.amount0,
      input.amount1,
      0n,
      0n,
      0,
    ]),
    transactionHash: input.txHash,
    blockHash: input.blockHash ?? ANCHOR_HASH,
    blockNumber: `0x${(input.blockNumber ?? ANCHOR_NUMBER).toString(16)}`,
    logIndex: `0x${(input.logIndex ?? 0).toString(16)}`,
    removed: input.removed ?? false,
  };
}

type TxEvidence = {
  hash?: string;
  blockHash?: string;
  blockNumber?: number;
  from?: string | null;
  error?: boolean;
};

function createHarness(options: {
  logs?:
    | unknown[]
    | { error: string }
    | ((attempt: number) => unknown[] | { error: string });
  poolAddress?: string | null;
  token0?: string;
  token1?: string;
  recheckHash?: string;
  senders?: Record<string, string>;
  codes?: Record<string, string>;
  txEvidence?: Record<string, TxEvidence>;
  headerTransactions?: "valid" | "malformed";
  fullBlockError?: boolean;
  fullBlockIncomplete?: boolean;
  fullBlockHash?: string;
  fullBlockTransportCode?: string;
  poolRead?: "error" | "malformed" | "first-error";
  poolTokenRead?: "malformed";
  decimalsRead?: "malformed";
  poolCode?: string | ((read: number) => string);
  budgetUnits?: number;
  env?: Record<string, string>;
}) {
  let logAttempt = 0;
  let consumed = 0;
  let factoryReads = 0;
  let poolCodeReads = 0;
  let rpcSubcalls = 0;
  let anchorReads = 0;
  let poolTokenReads = 0;
  let decimalsReads = 0;
  const selectedPool =
    options.poolAddress === null ? null : options.poolAddress ?? POOL;
  const ethCalls: Array<{ to: string; data: string }> = [];
  const ethCallResult = (params: unknown[]): Hex => {
    const call = (params[0] ?? {}) as { to?: unknown; data?: unknown };
    const to = String(call.to ?? "").toLowerCase();
    const data = String(call.data ?? "").toLowerCase();
    ethCalls.push({ to, data });
    if (to === OBSERVED_TRADES_FACTORY.toLowerCase()) {
      return addressReturn(selectedPool ?? ZERO);
    }
    if (to === POOL.toLowerCase()) {
      if (data.startsWith("0x0dfe1681")) {
        poolTokenReads += 1;
        if (options.poolTokenRead === "malformed") return "0x1234" as Hex;
        return addressReturn(options.token0 ?? TOKEN0);
      }
      if (data.startsWith("0xd21220a7")) {
        poolTokenReads += 1;
        if (options.poolTokenRead === "malformed") return "0x1234" as Hex;
        return addressReturn(options.token1 ?? TOKEN1);
      }
    }
    if (data.startsWith("0x313ce567")) {
      decimalsReads += 1;
      if (options.decimalsRead === "malformed") return "0x1234" as Hex;
    }
    if (to === TOKEN0.toLowerCase()) {
      return encodeAbiParameters([{ type: "uint8" }], [18]);
    }
    if (to === TOKEN1.toLowerCase()) {
      return encodeAbiParameters([{ type: "uint8" }], [6]);
    }
    return encodeAbiParameters([{ type: "uint8" }], [18]);
  };
  const rpc: ProviderHttp = {
    async requestJson(_url: string, init?: RequestInit): Promise<unknown> {
      const body = JSON.parse(String(init?.body ?? "null"));
      if (Array.isArray(body)) {
        rpcSubcalls += body.length;
        if (options.fullBlockTransportCode && body.some(
          (entry: { method: string; params: unknown[] }) =>
            entry.method === "eth_getBlockByNumber" && entry.params[1] === true,
        )) {
          throw new ProviderRequestError(options.fullBlockTransportCode, false);
        }
        return body.map(
          (entry: { id: string; method: string; params: unknown[] }) => {
            if (entry.method === "eth_getTransactionByHash") {
              const hash = String(entry.params[0]);
              const override = options.txEvidence?.[hash];
              if (override?.error) {
                return {
                  jsonrpc: "2.0",
                  id: entry.id,
                  error: { code: -32000, message: "transaction unavailable" },
                };
              }
              const from =
                override?.from !== undefined
                  ? override.from
                  : options.senders?.[hash] ?? null;
              if (from === null) {
                return { jsonrpc: "2.0", id: entry.id, result: null };
              }
              const sourceLog = ((options.logs ?? []) as unknown[]).find((value) =>
                (value as { transactionHash?: string }).transactionHash === hash,
              ) as { blockNumber?: string; blockHash?: string } | undefined;
              const blockNumber = override?.blockNumber ?? Number.parseInt(String(sourceLog?.blockNumber ?? `0x${ANCHOR_NUMBER.toString(16)}`), 16);
              return {
                jsonrpc: "2.0",
                id: entry.id,
                result: {
                  hash: override?.hash ?? hash,
                  blockHash: override?.blockHash ?? sourceLog?.blockHash ?? ANCHOR_HASH,
                  blockNumber: `0x${blockNumber.toString(16)}`,
                  from,
                },
              };
            }
            if (entry.method === "eth_getBlockByNumber") {
              const number = Number.parseInt(String(entry.params[0]), 16);
              if (entry.params[1] === true) {
                if (options.fullBlockError) {
                  return { jsonrpc: "2.0", id: entry.id, error: { code: -32000, message: "block unavailable" } };
                }
                const hashes = (options.logs ?? []) as unknown[];
                const txs = hashes.filter((value) => {
                  const log = value as { blockNumber?: string };
                  return Number.parseInt(String(log.blockNumber ?? "0"), 16) === number;
                }).map((value) => {
                  const log = value as { transactionHash: string };
                  const hash = log.transactionHash;
                  const override = options.txEvidence?.[hash];
                  return {
                    hash: override?.hash ?? hash,
                    blockHash: override?.blockHash ?? (number === ANCHOR_NUMBER ? ANCHOR_HASH : OTHER_HASH),
                    blockNumber: `0x${(override?.blockNumber ?? number).toString(16)}`,
                    from: override?.from ?? options.senders?.[hash] ?? EOA_SENDER,
                  };
                });
                if (options.fullBlockIncomplete) txs.pop();
                return {
                  jsonrpc: "2.0", id: entry.id,
                  result: { ...header(number, options.fullBlockHash ?? (number === ANCHOR_NUMBER ? ANCHOR_HASH : OTHER_HASH)), transactions: txs },
                };
              }
              const transactions = options.headerTransactions === "valid"
                ? ((options.logs ?? []) as unknown[]).filter((value) => {
                    const log = value as { blockNumber?: string };
                    return Number.parseInt(String(log.blockNumber ?? "0"), 16) === number;
                  }).map((value) => (value as { transactionHash: string }).transactionHash)
                : options.headerTransactions === "malformed" ? ["not-a-hash"] : undefined;
              return {
                jsonrpc: "2.0",
                id: entry.id,
                result: {
                  ...header(number, number === ANCHOR_NUMBER ? ANCHOR_HASH : OTHER_HASH),
                  ...(transactions ? { transactions } : {}),
                },
              };
            }
            if (entry.method === "eth_getCode") {
              const address = String(entry.params[0]).toLowerCase();
              return {
                jsonrpc: "2.0",
                id: entry.id,
                result: options.codes?.[address] ?? "0x",
              };
            }
            if (entry.method === "eth_call") {
              const call = (entry.params[0] ?? {}) as {
                to?: unknown;
                data?: unknown;
              };
              const to = String(call.to ?? "").toLowerCase();
              if (to === OBSERVED_TRADES_FACTORY.toLowerCase()) {
                factoryReads += 1;
                if (
                  options.poolRead === "error" ||
                  (options.poolRead === "first-error" && factoryReads === 1)
                ) {
                  ethCalls.push({
                    to,
                    data: String(call.data ?? "").toLowerCase(),
                  });
                  return {
                    jsonrpc: "2.0",
                    id: entry.id,
                    error: { code: 3, message: "execution reverted" },
                  };
                }
                if (options.poolRead === "malformed") {
                  ethCalls.push({
                    to,
                    data: String(call.data ?? "").toLowerCase(),
                  });
                  return { jsonrpc: "2.0", id: entry.id, result: "0x1234" };
                }
                return {
                  jsonrpc: "2.0",
                  id: entry.id,
                  result: ethCallResult(entry.params),
                };
              }
              return {
                jsonrpc: "2.0",
                id: entry.id,
                result: ethCallResult(entry.params),
              };
            }
            return { jsonrpc: "2.0", id: entry.id, result: null };
          },
        );
      }
      rpcSubcalls += 1;
      const method = body.method as string;
      if (method === "eth_getBlockByNumber") {
        anchorReads += 1;
        const tag = body.params[0];
        if (tag === "latest") {
          return {
            jsonrpc: "2.0",
            id: 1,
            result: header(ANCHOR_NUMBER, ANCHOR_HASH),
          };
        }
        const number = Number.parseInt(String(tag), 16);
        if (number === ANCHOR_NUMBER) {
          return {
            jsonrpc: "2.0",
            id: 1,
            result: header(ANCHOR_NUMBER, options.recheckHash ?? ANCHOR_HASH),
          };
        }
        return { jsonrpc: "2.0", id: 1, result: header(number, OTHER_HASH) };
      }
      if (method === "eth_getCode") {
        const address = String(body.params[0]).toLowerCase();
        if (address === POOL) {
          poolCodeReads += 1;
          const poolCode = options.poolCode ?? "0x600160015500";
          return {
            jsonrpc: "2.0",
            id: 1,
            result: typeof poolCode === "function" ? poolCode(poolCodeReads) : poolCode,
          };
        }
        return { jsonrpc: "2.0", id: 1, result: options.codes?.[address] ?? "0x" };
      }
      if (method === "eth_call") {
        return { jsonrpc: "2.0", id: 1, result: ethCallResult(body.params) };
      }
      if (method === "eth_getLogs") {
        logAttempt += 1;
        const value =
          typeof options.logs === "function"
            ? options.logs(logAttempt)
            : options.logs ?? [];
        if (!Array.isArray(value)) {
          return {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32005, message: value.error },
          };
        }
        return { jsonrpc: "2.0", id: 1, result: value };
      }
      throw new Error(`unexpected method ${method}`);
    },
  };
  const budget = {
    async consume(units: number): Promise<void> {
      consumed += units;
      if (options.budgetUnits !== undefined && consumed > options.budgetUnits) {
        throw new AppError(
          "OBSERVED_TRADES_DAILY_BUDGET_EXCEEDED",
          503,
          "Today's free observed-trades budget has been reached",
        );
      }
    },
  };
  const env = loadEnv({
    NODE_ENV: "test",
    OBSERVED_TRADES_ENABLED: "true",
    OBSERVED_TRADES_MAX_RPC_SUBCALLS: "60",
    ...options.env,
  });
  const service = new ObservedTradesService(env, {
    rpc,
    budget,
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  });
  return {
    service,
    env,
    rpc,
    attempts: () => logAttempt,
    rpcSubcalls: () => rpcSubcalls,
    ethCalls,
    poolTokenReads: () => poolTokenReads,
    decimalsReads: () => decimalsReads,
    poolCodeReads: () => poolCodeReads,
    anchorReads: () => anchorReads,
  };
}

describe("observed trades pure helpers", () => {
  it("clamps the window into the bounded supported range", () => {
    expect(clampWindowBlocks(0, 50, 1000)).toBe(50);
    expect(clampWindowBlocks(4321, 50, 1000)).toBe(1000);
    expect(clampWindowBlocks(500.9, 50, 1000)).toBe(500);
    expect(clampWindowBlocks(Number.NaN, 50, 1000)).toBe(1000);
  });

  it("recognizes only explicit provider cap messages", () => {
    expect(isCapError("logs matched by query exceeds limit of 10000")).toBe(true);
    expect(isCapError("query returned more than 10000 results")).toBe(true);
    expect(isCapError("backend timeout")).toBe(false);
  });

  it("ranks by signed quote notional and never uses floating point", () => {
    const rows = [
      { quoteAmountRaw: 2n, txHash: "0x02", logIndex: 0 },
      { quoteAmountRaw: 10n, txHash: "0x01", logIndex: 0 },
      { quoteAmountRaw: 10n, txHash: "0x00", logIndex: 3 },
    ] as unknown as Parameters<typeof sortObservations>[0];
    const ranked = sortObservations(rows);
    expect(ranked.map((row) => row.txHash)).toEqual(["0x00", "0x01", "0x02"]);
  });

  it("rejects duplicate ids and inconsistent block hashes in a log set", () => {
    const base = {
      txHash: txHash("a"),
      logIndex: 1,
      blockNumber: 900,
      blockHash: ANCHOR_HASH,
    } as unknown as Parameters<typeof validateLogSet>[0][number];
    expect(() => validateLogSet([base])).not.toThrow();
    expect(() =>
      validateLogSet([base, { ...base } as typeof base]),
    ).toThrow(/duplicate transaction\/log-index/);
    expect(() =>
      validateLogSet([
        base,
        { ...base, txHash: txHash("b"), blockHash: OTHER_HASH } as typeof base,
      ]),
    ).toThrow(/inconsistent block hashes/);
  });

  it("defaults WETH/USDG and rejects an invalid contract", () => {
    const pair = resolvePair(undefined);
    expect(pair.base.symbol).toBe("WETH");
    expect(pair.quote.symbol).toBe("USDG");
    expect(() => resolvePair("0x123")).toThrow(
      /complete Robinhood Chain token contract/,
    );
  });
});

describe("observed trades service", () => {
  it("coalesces concurrent identical public observations without reusing a completed result", async () => {
    const { service, attempts } = createHarness({ logs: [] });
    const [first, second] = await Promise.all([
      service.observe({ chainId: 4663, windowBlocks: 50 }),
      service.observe({ chainId: 4663, windowBlocks: 50 }),
    ]);
    expect(first).toEqual(second);
    expect(attempts()).toBe(1);
    await service.observe({ chainId: 4663, windowBlocks: 50 });
    expect(attempts()).toBe(2);
  });

  it("decodes signed V3 swaps at full precision, verifies blocks, and classifies from amounts only", async () => {
    const sellTx = txHash("b");
    const buyTx = txHash("a");
    const { service } = createHarness({
      logs: [
        swapLog({
          txHash: buyTx,
          logIndex: 1,
          sender: CONTRACT_SENDER,
          amount0: -1234567890123456789n,
          amount1: 3141592653n,
        }),
        swapLog({
          txHash: sellTx,
          logIndex: 7,
          sender: EOA_SENDER,
          amount0: 2000000000000000000n,
          amount1: -5100000000n,
        }),
      ],
      senders: { [sellTx]: EOA_SENDER, [buyTx]: CONTRACT_SENDER },
      codes: { [EOA_SENDER]: "0x", [CONTRACT_SENDER]: "0x6001" },
    });
    const result = await service.observe({ chainId: 4663 });
    const anchorTime = new Date((1_700_000_000 + 1000) * 1_000).toISOString();
    expect(result.state).toBe("observed");
    expect(result.pair.fee).toBe(100);
    expect(result.coverage.poolsRequested).toBe(4);
    expect(result.coverage.matchedLogs).toBe(2);
    expect(result.coverage.topRows).toBe(2);
    expect(result.observations[0]).toMatchObject({
      side: "sell",
      baseAmount: "2",
      quoteAmount: "5100",
      notionalQuote: "5100",
      txHash: sellTx,
      transactionSender: EOA_SENDER,
      transactionSenderType: "eoa",
      followable: true,
      blockTime: anchorTime,
    });
    expect(result.observations[1]).toMatchObject({
      side: "buy",
      baseAmount: "1.234567890123456789",
      quoteAmount: "3141.592653",
      notionalQuote: "3141.592653",
      transactionSenderType: "contract",
      followable: false,
      blockTime: anchorTime,
    });
    expect(result.observations[1]?.baseToken.decimals).toBe(18);
    expect(result.observations[1]?.quoteToken.decimals).toBe(6);
    expect(result.classification).toEqual({
      method: "uniswap_v3_swap_signed_amounts",
      transfersUsed: false,
    });
    expect(result.privacy.disclosure).toContain("only displayed transactions are used to label rows");
    expect(result.privacy.disclosure).toContain("not your wallet");
  });

  it("reports poolsRequested to match the requested fee tier", async () => {
    const { service } = createHarness({ logs: [] });
    const result = await service.observe({ chainId: 4663, fee: 500 });
    expect(result.coverage.poolsRequested).toBe(1);
    expect(result.pair.fee).toBe(500);
  });

  it("uses direct per-target eth_call reads and never a contract multicall", async () => {
    const { service, ethCalls } = createHarness({ logs: [] });
    await service.observe({ chainId: 4663 });
    const factory = OBSERVED_TRADES_FACTORY.toLowerCase();
    expect(ethCalls.filter((call) => call.to === factory)).toHaveLength(4);
    expect(
      ethCalls.every(
        (call) => call.to !== "0x282a3c4d320cc7f0d5eaf56b8029e4b88338f0a3",
      ),
    ).toBe(true);
    expect(ethCalls.some((call) => call.data.startsWith("0x82ad56cb"))).toBe(
      false,
    );
  });

  it("reuses only pool token identity while keeping each observation anchored and fetching logs", async () => {
    const {
      service,
      rpcSubcalls,
      poolTokenReads,
      poolCodeReads,
      attempts,
      anchorReads,
    } = createHarness({ logs: [] });
    const first = await service.observe({ chainId: 4663, windowBlocks: 50 });
    const beforeSecond = rpcSubcalls();
    const second = await service.observe({ chainId: 4663, windowBlocks: 50 });

    expect(first.coverage.rpcUnits - second.coverage.rpcUnits).toBe(2);
    expect(rpcSubcalls() - beforeSecond).toBe(9);
    expect(second.coverage.rpcUnits).toBe(9);
    expect(poolTokenReads()).toBe(2);
    expect(poolCodeReads()).toBe(2);
    expect(attempts()).toBe(2);
    expect(anchorReads()).toBe(4);
  });

  it("keeps arbitrary token decimals fresh on every observation", async () => {
    const arbitraryToken = `0x${"33".repeat(20)}`;
    const { service, poolTokenReads, decimalsReads } = createHarness({
      logs: [],
      token0: arbitraryToken,
      token1: TOKEN0,
    });
    const input = { chainId: 4663 as const, contract: arbitraryToken };
    await service.observe(input);
    await service.observe(input);

    expect(poolTokenReads()).toBe(2);
    expect(decimalsReads()).toBe(2);
  });

  it("does not cache failed or pair-mismatched pool token reads", async () => {
    const failed = createHarness({ logs: [], poolTokenRead: "malformed" });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(failed.service.observe({ chainId: 4663 })).rejects.toMatchObject({
        code: "OBSERVED_TRADES_MALFORMED",
      });
    }
    expect(failed.poolTokenReads()).toBe(4);

    const mismatched = createHarness({
      logs: [],
      token0: TOKEN0,
      token1: `0x${"44".repeat(20)}`,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(mismatched.service.observe({ chainId: 4663 })).rejects.toMatchObject({
        code: "OBSERVED_TRADES_MALFORMED",
      });
    }
    expect(mismatched.poolTokenReads()).toBe(4);

    const arbitraryToken = `0x${"33".repeat(20)}`;
    const badDecimals = createHarness({
      logs: [],
      decimalsRead: "malformed",
      token0: arbitraryToken,
      token1: TOKEN0,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        badDecimals.service.observe({ chainId: 4663, contract: arbitraryToken }),
      ).rejects.toMatchObject({ code: "OBSERVED_TRADES_MALFORMED" });
    }
    expect(badDecimals.poolTokenReads()).toBe(4);
  });

  it("misses the token cache when the pool bytecode identity changes", async () => {
    const { service, poolTokenReads, poolCodeReads } = createHarness({
      logs: [],
      poolCode: (read) => (read === 1 ? "0x600160015500" : "0x600260025500"),
    });
    await service.observe({ chainId: 4663 });
    await service.observe({ chainId: 4663 });

    expect(poolCodeReads()).toBe(2);
    expect(poolTokenReads()).toBe(4);
  });

  it("keeps pool identity caches scoped to each service instance", async () => {
    const first = createHarness({ logs: [] });
    const second = createHarness({ logs: [] });
    await first.service.observe({ chainId: 4663 });
    await second.service.observe({ chainId: 4663 });

    expect(first.poolTokenReads()).toBe(2);
    expect(second.poolTokenReads()).toBe(2);
  });

  it("reports discovery unavailable, not a missing pool, when every getPool read fails", async () => {
    for (const poolRead of ["error", "malformed"] as const) {
      const { service } = createHarness({ logs: [], poolRead });
      await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
        code: "OBSERVED_TRADES_PROVIDER_UNAVAILABLE",
      });
    }
  });

  it("reports discovery unavailable for a failed requested single fee tier", async () => {
    const { service } = createHarness({ logs: [], poolRead: "error" });
    await expect(
      service.observe({ chainId: 4663, fee: 500 }),
    ).rejects.toMatchObject({ code: "OBSERVED_TRADES_PROVIDER_UNAVAILABLE" });
  });

  it("still finds a valid pool after an earlier failed fee-tier read", async () => {
    const { service, ethCalls } = createHarness({
      logs: [],
      poolRead: "first-error",
    });
    const result = await service.observe({ chainId: 4663 });
    expect(result.pair.fee).toBe(500);
    expect(result.coverage.poolsRequested).toBe(4);
    expect(
      ethCalls.filter(
        (call) => call.to === OBSERVED_TRADES_FACTORY.toLowerCase(),
      ),
    ).toHaveLength(4);
  });

  it("returns only verified top rows while preserving the matched count", async () => {
    const logs = Array.from({ length: 8 }, (_, index) =>
      swapLog({
        txHash: txHash(`${index + 1}`),
        logIndex: index,
        amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
        amount1: BigInt(index + 1) * 1_000_000n,
      }),
    );
    const { service } = createHarness({ logs });
    const result = await service.observe({ chainId: 4663 });
    expect(result.coverage.matchedLogs).toBe(8);
    expect(result.coverage.topRows).toBe(6);
    expect(result.observations).toHaveLength(6);
    const notionals = result.observations.map((row) => Number(row.notionalQuote));
    expect(notionals).toEqual([8, 7, 6, 5, 4, 3]);
  });

  it("reuses a displayed from-block verification read for the window timestamp", async () => {
    const { service, rpcSubcalls } = createHarness({
      logs: [
        swapLog({
          txHash: txHash("9"),
          blockNumber: 951,
          blockHash: OTHER_HASH,
          amount0: -1_000_000_000_000_000_000n,
          amount1: 1_000_000n,
        }),
      ],
    });
    const result = await service.observe({ chainId: 4663, windowBlocks: 50 });
    expect(result.window.fromTime).toBe(
      new Date((1_700_000_000 + 951) * 1_000).toISOString(),
    );
    expect(result.observations[0]?.blockTime).toBe(result.window.fromTime);
    // Anchor, four fee-tier reads, pool code, token reads, logs, transaction,
    // one shared from-block read, sender code, and anchor recheck: 12 total.
    expect(rpcSubcalls()).toBe(12);
  });

  it("uses one bounded full-block read for four displayed transactions in a shared block", async () => {
    const logs = Array.from({ length: 4 }, (_, index) => swapLog({
      txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
      logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
      amount1: BigInt(index + 1) * 1_000_000n,
    }));
    const senders = Object.fromEntries(logs.map((log) => [log.transactionHash, EOA_SENDER]));
    const baseline = createHarness({ logs, senders });
    const optimizedWithSenders = createHarness({ logs, senders, headerTransactions: "valid" });
    const result = await optimizedWithSenders.service.observe({ chainId: 4663 });
    const baselineResult = await baseline.service.observe({ chainId: 4663 });
    expect({ ...result, coverage: { ...result.coverage, rpcUnits: 0 } }).toEqual({
      ...baselineResult,
      coverage: { ...baselineResult.coverage, rpcUnits: 0 },
    });
    expect(optimizedWithSenders.rpcSubcalls()).toBe(baseline.rpcSubcalls() - 3);
  });

  it("falls back to individual transaction reads when the full-block call fails", async () => {
    const logs = Array.from({ length: 4 }, (_, index) => swapLog({
      txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
      logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
      amount1: BigInt(index + 1) * 1_000_000n,
    }));
    const senders = Object.fromEntries(logs.map((log) => [log.transactionHash, EOA_SENDER]));
    const { service } = createHarness({ logs, senders, headerTransactions: "valid", fullBlockError: true });
    const result = await service.observe({ chainId: 4663 });
    expect(result.observations).toHaveLength(4);
    expect(result.observations.every((row) => row.transactionSender === EOA_SENDER)).toBe(true);
  });

  it("propagates a budget failure on the optional full-block request", async () => {
    const logs = Array.from({ length: 4 }, (_, index) => swapLog({
      txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
      logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
      amount1: BigInt(index + 1) * 1_000_000n,
    }));
    const { service } = createHarness({ logs, headerTransactions: "valid", budgetUnits: 11 });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_DAILY_BUDGET_EXCEEDED",
    });
  });

  it("does not issue fallback reads after the provider rate-limits a full block", async () => {
    const logs = Array.from({ length: 4 }, (_, index) => swapLog({
      txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
      logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
      amount1: BigInt(index + 1) * 1_000_000n,
    }));
    const { service, rpcSubcalls } = createHarness({
      logs, headerTransactions: "valid", fullBlockTransportCode: "PROVIDER_HTTP_429",
    });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "PROVIDER_HTTP_429",
    });
    expect(rpcSubcalls()).toBe(12);
  });

  it("falls back when the full-block transaction list is incomplete", async () => {
    const logs = Array.from({ length: 4 }, (_, index) => swapLog({
      txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
      logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
      amount1: BigInt(index + 1) * 1_000_000n,
    }));
    const senders = Object.fromEntries(logs.map((log) => [log.transactionHash, EOA_SENDER]));
    const { service } = createHarness({
      logs, senders, headerTransactions: "valid", fullBlockIncomplete: true,
    });
    const result = await service.observe({ chainId: 4663 });
    expect(result.observations).toHaveLength(4);
    expect(result.observations.every((row) => row.transactionSender === EOA_SENDER)).toBe(true);
  });

  it("fails closed when a full-block response has a different block hash", async () => {
    const logs = Array.from({ length: 4 }, (_, index) => swapLog({
      txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
      logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
      amount1: BigInt(index + 1) * 1_000_000n,
    }));
    const { service } = createHarness({ logs, headerTransactions: "valid", fullBlockHash: ANCHOR_HASH });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({ code: "OBSERVED_TRADES_REORGED" });
  });

  it("keeps two and three transaction groups on individual lookups", async () => {
    for (const count of [2, 3]) {
      const logs = Array.from({ length: count }, (_, index) => swapLog({
        txHash: txHash(String(index + 1)), blockNumber: 900, blockHash: OTHER_HASH,
        logIndex: index, amount0: -BigInt(index + 1) * 1_000_000_000_000_000_000n,
        amount1: BigInt(index + 1) * 1_000_000n,
      }));
      const { service, rpcSubcalls } = createHarness({ logs, headerTransactions: "valid" });
      const baseline = createHarness({ logs });
      await service.observe({ chainId: 4663 });
      await baseline.service.observe({ chainId: 4663 });
      expect(rpcSubcalls()).toBe(baseline.rpcSubcalls());
    }
  });

  it("narrows the inclusive block window once instead of returning an incomplete capped set", async () => {
    const { service, attempts } = createHarness({
      logs: (attempt) =>
        attempt === 1
          ? { error: "logs matched by query exceeds limit of 10000" }
          : [],
    });
    const result = await service.observe({ chainId: 4663, windowBlocks: 1000 });
    expect(attempts()).toBe(2);
    expect(result.window.narrowed).toBe(true);
    expect(result.window.fromBlock).toBe(501);
    expect(result.window.blockCount).toBe(500);
    expect(result.window.notes.length).toBeGreaterThan(0);
    expect(result.state).toBe("empty");
  });

  it("fails honestly when even the smallest window reaches the matched-log cap", async () => {
    const tenLogs = Array.from({ length: 10 }, (_, index) =>
      swapLog({
        txHash: txHash(`${index % 10}`),
        logIndex: index,
        amount0: -1n,
        amount1: 1n,
      }),
    );
    const { service } = createHarness({
      logs: tenLogs,
      env: {
        OBSERVED_TRADES_MAX_LOGS: "10",
        OBSERVED_TRADES_MIN_BLOCKS: "50",
        OBSERVED_TRADES_MAX_BLOCKS: "50",
      },
    });
    await expect(
      service.observe({ chainId: 4663, windowBlocks: 50 }),
    ).rejects.toMatchObject({ code: "OBSERVED_TRADES_LOGS_CAPPED" });
  });

  it("fails closed when the captured anchor reorgs", async () => {
    const { service } = createHarness({
      logs: [swapLog({ txHash: txHash("c"), amount0: -1n, amount1: 1n })],
      recheckHash: OTHER_HASH,
    });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_REORGED",
    });
  });

  it("stops at the injected RPC budget instead of looping", async () => {
    const { service } = createHarness({ logs: [], budgetUnits: 0 });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_DAILY_BUDGET_EXCEEDED",
    });
  });

  it("rejects a malformed matched log instead of guessing", async () => {
    const { service } = createHarness({
      logs: [
        swapLog({
          txHash: txHash("d"),
          amount0: -1n,
          amount1: 1n,
          address: `0x${"99".repeat(20)}`,
        }),
      ],
    });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_MALFORMED_LOG",
    });
  });

  it("rejects removed logs, out-of-window logs, same-sign amounts, and anchor hash mismatches", async () => {
    const cases: Array<unknown> = [
      swapLog({ txHash: txHash("e"), amount0: -1n, amount1: 1n }),
      swapLog({ txHash: txHash("f"), blockNumber: 500, amount0: -1n, amount1: 1n }),
      swapLog({ txHash: txHash("1"), amount0: 1n, amount1: 1n }),
      swapLog({ txHash: txHash("2"), amount0: -1n, amount1: -1n }),
      swapLog({
        txHash: txHash("3"),
        blockNumber: ANCHOR_NUMBER,
        blockHash: OTHER_HASH,
        amount0: -1n,
        amount1: 1n,
      }),
    ];
    const removed = cases[0];
    if (removed && typeof removed === "object") {
      (removed as Record<string, unknown>).removed = true;
    }
    for (const log of cases) {
      const { service } = createHarness({ logs: [log] });
      await expect(
        service.observe({ chainId: 4663, windowBlocks: 10 }),
      ).rejects.toMatchObject({ code: "OBSERVED_TRADES_MALFORMED_LOG" });
    }
  });

  it("rejects duplicate transaction/log-index pairs quietly", async () => {
    const log = swapLog({ txHash: txHash("4"), logIndex: 2, amount0: -1n, amount1: 1n });
    const { service } = createHarness({ logs: [log, { ...log }] });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_MALFORMED_LOG",
    });
  });

  it("rejects inconsistent block hashes for one non-anchor block", async () => {
    const { service } = createHarness({
      logs: [
        swapLog({
          txHash: txHash("5"),
          blockNumber: 900,
          blockHash: ANCHOR_HASH,
          amount0: -1n,
          amount1: 1n,
        }),
        swapLog({
          txHash: txHash("6"),
          blockNumber: 900,
          blockHash: OTHER_HASH,
          amount0: -2n,
          amount1: 2n,
        }),
      ],
    });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_MALFORMED_LOG",
    });
  });

  it("leaves the sender unknown when tx evidence mismatches and never labels malformed code as a contract", async () => {
    const mismatchTx = txHash("7");
    const mismatch = createHarness({
      logs: [
        swapLog({ txHash: mismatchTx, sender: EOA_SENDER, amount0: -1n, amount1: 1n }),
      ],
      senders: { [mismatchTx]: EOA_SENDER },
      txEvidence: { [mismatchTx]: { blockHash: OTHER_HASH } },
    });
    const mismatchResult = await mismatch.service.observe({ chainId: 4663 });
    expect(mismatchResult.observations[0]).toMatchObject({
      transactionSender: null,
      transactionSenderType: "unknown",
      followable: false,
    });

    const badCodeTx = txHash("8");
    const badCode = createHarness({
      logs: [
        swapLog({ txHash: badCodeTx, sender: EOA_SENDER, amount0: -1n, amount1: 1n }),
      ],
      senders: { [badCodeTx]: EOA_SENDER },
      codes: { [EOA_SENDER]: "not-hex" },
    });
    const badCodeResult = await badCode.service.observe({ chainId: 4663 });
    expect(badCodeResult.observations[0]).toMatchObject({
      transactionSender: EOA_SENDER,
      transactionSenderType: "unknown",
      followable: false,
    });
  });

  it("returns an explicit empty state when the pool has no swaps in the window", async () => {
    const { service } = createHarness({ logs: [] });
    const result = await service.observe({ chainId: 4663 });
    expect(result.state).toBe("empty");
    expect(result.observations).toEqual([]);
    expect(result.coverage.logsScanned).toBe(0);
  });

  it("reports a missing factory pool instead of inventing a target", async () => {
    const { service } = createHarness({ logs: [], poolAddress: null });
    await expect(service.observe({ chainId: 4663 })).rejects.toMatchObject({
      code: "OBSERVED_TRADES_POOL_NOT_FOUND",
    });
  });
});

describe("observed trades route", () => {
  it("is disabled with a 404 and never calls the source by default", async () => {
    const app = Fastify();
    installErrorHandler(app);
    const observe = vi.fn();
    try {
      await marketRoutes(app, loadEnv({ NODE_ENV: "test" }), undefined, undefined, {
        observe,
      });
      const response = await app.inject({
        method: "POST",
        url: "/v1/private/market/observed-trades",
        payload: { chainId: 4663 },
      });
      expect(response.statusCode).toBe(404);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(observe).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("rejects private extras and forwards only the bounded public request when enabled", async () => {
    const app = Fastify();
    installErrorHandler(app);
    const observe = vi
      .fn()
      .mockResolvedValue({ schemaVersion: 1, state: "empty" });
    try {
      await marketRoutes(
        app,
        loadEnv({ NODE_ENV: "test", OBSERVED_TRADES_ENABLED: "true" }),
        undefined,
        undefined,
        { observe },
      );
      const rejected = await app.inject({
        method: "POST",
        url: "/v1/private/market/observed-trades",
        payload: { chainId: 4663, wallet: "0x123" },
      });
      expect(rejected.statusCode).toBe(400);
      const accepted = await app.inject({
        method: "POST",
        url: "/v1/private/market/observed-trades",
        payload: { chainId: 4663, windowBlocks: 500 },
      });
      expect(accepted.statusCode).toBe(200);
      expect(observe).toHaveBeenCalledWith({ chainId: 4663, windowBlocks: 500 });
    } finally {
      await app.close();
    }
  });
});
