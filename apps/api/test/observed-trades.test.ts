import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { encodeAbiParameters, type Hex } from "viem";
import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler, AppError } from "../src/http/errors.js";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import {
  ObservedTradesService,
  OBSERVED_TRADES_FEES,
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
const multicallOutputAbi = [
  {
    type: "tuple[]",
    components: [
      { name: "success", type: "bool" },
      { name: "returnData", type: "bytes" },
    ],
  },
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

function aggregate(entries: Array<{ success: boolean; returnData: Hex }>): Hex {
  return encodeAbiParameters(multicallOutputAbi, [entries]);
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
  budgetUnits?: number;
  env?: Record<string, string>;
}) {
  let ethCallRound = 0;
  let logAttempt = 0;
  let consumed = 0;
  const selectedPool =
    options.poolAddress === null ? null : options.poolAddress ?? POOL;
  const rpc: ProviderHttp = {
    async requestJson(_url: string, init?: RequestInit): Promise<unknown> {
      const body = JSON.parse(String(init?.body ?? "null"));
      if (Array.isArray(body)) {
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
              const blockNumber = override?.blockNumber ?? ANCHOR_NUMBER;
              return {
                jsonrpc: "2.0",
                id: entry.id,
                result: {
                  hash: override?.hash ?? hash,
                  blockHash: override?.blockHash ?? ANCHOR_HASH,
                  blockNumber: `0x${blockNumber.toString(16)}`,
                  from,
                },
              };
            }
            if (entry.method === "eth_getBlockByNumber") {
              const number = Number.parseInt(String(entry.params[0]), 16);
              return {
                jsonrpc: "2.0",
                id: entry.id,
                result: header(
                  number,
                  number === ANCHOR_NUMBER ? ANCHOR_HASH : OTHER_HASH,
                ),
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
            return { jsonrpc: "2.0", id: entry.id, result: null };
          },
        );
      }
      const method = body.method as string;
      if (method === "eth_getBlockByNumber") {
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
          return { jsonrpc: "2.0", id: 1, result: "0x600160015500" };
        }
        return { jsonrpc: "2.0", id: 1, result: options.codes?.[address] ?? "0x" };
      }
      if (method === "eth_call") {
        ethCallRound += 1;
        if (ethCallRound === 1) {
          const entries = OBSERVED_TRADES_FEES.map((_, index) => ({
            success: true,
            returnData:
              index === 0 && selectedPool
                ? addressReturn(selectedPool)
                : addressReturn(ZERO),
          }));
          return { jsonrpc: "2.0", id: 1, result: aggregate(entries) };
        }
        return {
          jsonrpc: "2.0",
          id: 1,
          result: aggregate([
            { success: true, returnData: addressReturn(options.token0 ?? TOKEN0) },
            { success: true, returnData: addressReturn(options.token1 ?? TOKEN1) },
          ]),
        };
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
  return { service, env, rpc, attempts: () => logAttempt };
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
    expect(result.privacy.disclosure).toContain("public transaction hashes");
    expect(result.privacy.disclosure).toContain("not your wallet");
  });

  it("reports poolsRequested to match the requested fee tier", async () => {
    const { service } = createHarness({ logs: [] });
    const result = await service.observe({ chainId: 4663, fee: 500 });
    expect(result.coverage.poolsRequested).toBe(1);
    expect(result.pair.fee).toBe(500);
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
