import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { JsonCache } from "../src/cache/service.js";
import {
  ProviderRequestError,
  type ProviderHttp,
} from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { exitCheckRoutes } from "../src/routes/exit-check.js";
import {
  EXIT_CHECK_OUTPUTS,
  UNISWAP_MULTICALL3,
} from "../src/exit-check/constants.js";
import { curveAmounts, ExitCheckService } from "../src/exit-check/service.js";
import {
  feeAmountRaw,
  formatBps,
  parseExitAmount,
  priceImpactBps,
  spotAmountOutRaw,
} from "../src/exit-check/math.js";

const WETH = EXIT_CHECK_OUTPUTS.WETH.address.toLowerCase();
const USDG = EXIT_CHECK_OUTPUTS.USDG.address.toLowerCase();
const POOL_100 = "0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca";
const POOL_500 = `0x${"1".repeat(40)}`;
const POOL_3000 = `0x${"2".repeat(40)}`;
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const APPS: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(APPS.splice(0).map((app) => app.close()));
});

describe("exit-check exact BigInt math", () => {
  it("parses amounts with the validated token decimals and rejects excess precision", () => {
    expect(parseExitAmount("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseExitAmount("1.234567", 6)).toBe(1_234_567n);
    expect(() => parseExitAmount("1.0000001", 6)).toThrow();
    expect(() => parseExitAmount("0", 18)).toThrow();
    expect(() => parseExitAmount("-1", 18)).toThrow();
    expect(() => parseExitAmount("1e3", 18)).toThrow();
  });

  it("computes exact spot output from sqrtPriceX96 with no Number rounding", () => {
    const sqrtPriceX96 = 4_014_000_000_000_000_000_000_000n;
    const zeroForOne = spotAmountOutRaw({
      amountInRaw: 1_000_000_000_000_000n,
      sqrtPriceX96,
      zeroForOne: true,
    });
    const oneForZero = spotAmountOutRaw({
      amountInRaw: 1_000_000n,
      sqrtPriceX96,
      zeroForOne: false,
    });
    expect(zeroForOne).toBe(
      (1_000_000_000_000_000n * sqrtPriceX96 * sqrtPriceX96) / (1n << 192n),
    );
    expect(oneForZero).toBe(
      (1_000_000n * (1n << 192n)) / (sqrtPriceX96 * sqrtPriceX96),
    );
  });

  it("computes integer price impact and pool fee exactly", () => {
    expect(
      priceImpactBps({ spotAmountOut: 10_000n, quotedAmountOut: 9_996n }),
    ).toBe(4n);
    expect(
      priceImpactBps({ spotAmountOut: 10_000n, quotedAmountOut: 10_001n }),
    ).toBe(0n);
    expect(
      priceImpactBps({ spotAmountOut: 0n, quotedAmountOut: 1n }),
    ).toBeNull();
    expect(formatBps(4n)).toBe("0.04");
    expect(formatBps(40n)).toBe("0.4");
    expect(formatBps(400n)).toBe("4");
    expect(feeAmountRaw(1_000_000n, 100)).toBe(100n);
  });
});

describe("exit-check service", () => {
  it("selects the best successful standard pool with exact coverage and no invented liquidity", async () => {
    const rpc = mockRpc({
      pools: { 100: POOL_100, 500: POOL_500 },
      quotes: { 100: 2_567_029n, 500: 2_560_000n },
      sqrtPriceX96: 4_014_000_000_000_000_000_000_000n,
      liquidity: 12_345_678_901_234_567_890n,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      {
        rpc,
        budget: allowBudget(),
        now: () => new Date("2026-09-11T12:00:00Z"),
      },
    );
    const quote = await service.quote({
      token: WETH,
      amount: "0.001",
      outputToken: "USDG",
    });

    expect(quote.supported).toBe(true);
    expect(quote.reason).toBe("ok");
    expect(quote.chain.id).toBe(4663);
    expect(quote.input).toMatchObject({
      contract: WETH,
      symbol: "WETH",
      decimals: 18,
      amount: "0.001",
      rawAmount: "1000000000000000",
    });
    expect(quote.output).toMatchObject({
      symbol: "USDG",
      address: EXIT_CHECK_OUTPUTS.USDG.address,
      decimals: 6,
    });
    expect(quote.quote?.pool).toEqual({ fee: 100, pool: POOL_100 });
    expect(quote.quote?.amountOut).toBe("2567029");
    expect(quote.quote?.amountOutDisplay).toBe("2.567029");
    expect(quote.quote?.feeTier).toBe(100);
    expect(quote.quote?.feePercent).toBe("0.01");
    expect(quote.quote?.feeAmount).toBe("100000000000");
    expect(quote.quote?.activeLiquidity).toBe("12345678901234567890");
    expect(quote.coverage.poolsFound).toHaveLength(2);
    expect(quote.coverage.poolsQuoted.map((pool) => pool.fee).sort()).toEqual([
      100, 500,
    ]);
    expect(quote.coverage.poolsMissing).toEqual([3000, 10_000]);
    expect(quote.coverage.poolsFailed).toEqual([]);
    expect(quote.quoteIsNotSellabilityProof).toBe(true);
    expect(quote.provider).toEqual({
      name: "robinhood-public-rpc",
      cached: false,
    });
    expect(Date.parse(quote.expiresAt) - Date.parse(quote.quotedAt)).toBe(
      30_000,
    );
    // No dollar liquidity was fabricated and the impact is an exact basis-point floor.
    expect(JSON.stringify(quote)).not.toMatch(
      /liquidityUsd|usdLiquidity|liquidity_usd|\$/i,
    );
  });

  it("returns an opt-in three-point ladder from one block anchor", async () => {
    const rpc = mockRpc({
      pools: { 100: POOL_100 },
      quotes: { 100: 2_567_029n },
      quoteByAmount: {
        "500000000000000": 1_280_000n,
        "1000000000000000": 2_567_029n,
        "2000000000000000": 5_000_000n,
      },
      sqrtPriceX96: 4_014_000_000_000_000_000_000_000n,
      liquidity: 12_345n,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      {
        rpc,
        budget: allowBudget(),
        now: () => new Date("2026-09-11T12:00:00Z"),
      },
    );
    const quote = await service.quote({
      token: WETH,
      amount: "0.001",
      outputToken: "USDG",
      curve: true,
    });
    expect(quote.curve?.points).toHaveLength(3);
    expect(quote.curve?.requestedAmount).toBe("0.001");
    expect(quote.curve?.points.map((point) => point.rawAmount)).toEqual([
      "500000000000000",
      "1000000000000000",
      "2000000000000000",
    ]);
    expect(
      new Set(quote.curve?.points.map((point) => point.amountOut)).size,
    ).toBe(3);
    expect(quote.anchor.blockHash).toBe(HASH_A);
    expect(quote.quote?.amountOut).toBe(quote.curve?.points[1]?.amountOut);
    expect(quote.quote?.amountOutDisplay).toBe(
      quote.curve?.points[1]?.amountOutDisplay,
    );
  });

  it("deduplicates the one-raw-unit point and omits uint256 overflow", () => {
    expect(curveAmounts(1n)).toEqual([1n, 2n]);
    const max = 2n ** 256n - 1n;
    expect(curveAmounts(max)).toEqual([max / 2n, max]);
  });

  it("keeps a four-pool curve within the cap by fixing auxiliary quotes to the main winner, preserves reorg checks and separates cache keys", async () => {
    const cfg = {
      pools: {
        100: POOL_100,
        500: POOL_500,
        3000: POOL_3000,
        10000: `0x${"4".repeat(40)}`,
      },
      quotes: { 100: 123n, 500: 120n, 3000: 100n, 10000: 90n },
    };
    const fixed = () => new Date("2026-09-11T12:00:00Z");
    const observedQuotes: Array<{ fee: number; amount: bigint }> = [];
    const capped = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      {
        rpc: mockRpc({ ...cfg, observedQuotes }),
        budget: allowBudget(),
        now: fixed,
      },
    );
    const boundedCurve = await capped.quote({
      token: WETH,
      amount: "0.001",
      outputToken: "USDG",
      curve: true,
    });
    expect(boundedCurve.curve?.scope).toEqual({
      strategy: "selected_pool",
      pool: { fee: 100, pool: POOL_100 },
    });
    expect(
      observedQuotes.filter((call) => call.amount !== 1_000_000_000_000_000n),
    ).toEqual([
      { fee: 100, amount: 500_000_000_000_000n },
      { fee: 100, amount: 2_000_000_000_000_000n },
    ]);
    const ordinary = await new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc: mockRpc(cfg), budget: allowBudget(), now: fixed },
    ).quote({ token: WETH, amount: "0.001", outputToken: "USDG" });
    expect(boundedCurve.quote?.amountOut).toBe(ordinary.quote?.amountOut);
    const tight = new ExitCheckService(
      loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        EXIT_CHECK_ENABLED: "true",
        EXIT_CHECK_MAX_RPC_SUBCALLS: "19",
      }),
      new JsonCache(undefined, 15),
      { rpc: mockRpc(cfg), budget: allowBudget(), now: fixed },
    );
    await expect(
      tight.quote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDG",
        curve: true,
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_RPC_LIMIT_EXCEEDED" });
    const arbitrary = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352";
    const arbitraryCurve = await new ExitCheckService(
      loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        EXIT_CHECK_ENABLED: "true",
        EXIT_CHECK_MAX_RPC_SUBCALLS: "22",
      }),
      new JsonCache(undefined, 15),
      {
        rpc: mockRpc({
          ...cfg,
          token: { address: arbitrary, decimals: 18, code: "0x60006000" },
        }),
        budget: allowBudget(),
        now: fixed,
      },
    ).quote({
      token: arbitrary,
      amount: "0.001",
      outputToken: "USDG",
      curve: true,
    });
    expect(arbitraryCurve.curve?.scope.strategy).toBe("selected_pool");
    const reorg = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      {
        rpc: mockRpc({
          pools: { 100: POOL_100 },
          quotes: { 100: 123n },
          reorg: true,
        }),
        budget: allowBudget(),
        now: fixed,
      },
    );
    await expect(
      reorg.quote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDG",
        curve: true,
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_REORGED" });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      {
        rpc: mockRpc({
          pools: { 100: POOL_100 },
          quotes: { 100: 123n },
          quoteByAmount: { "500000000000000": 62n, "2000000000000000": 0n },
        }),
        budget: allowBudget(),
        now: fixed,
      },
    );
    const request = {
      token: WETH,
      amount: "0.001",
      outputToken: "USDG" as const,
    };
    expect((await service.quote(request)).curve).toBeNull();
    const curve = await service.quote({ ...request, curve: true });
    expect(curve.curve!.points[2]!.status).toBe("unavailable");
    expect(curve.quote!.amountOut).toBe("123");
    expect((await service.quote(request)).curve).toBeNull();
  });

  it("reads validated decimals for an arbitrary factory-supported V3 token", async () => {
    const token = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352".toLowerCase();
    const rpc = mockRpc({
      token: { address: token, decimals: 6, code: "0x60006000" },
      pools: { 3000: POOL_3000 },
      quotes: { 3000: 999_000n },
      sqrtPriceX96: 1_000_000_000_000_000_000_000_000_000n,
      liquidity: 5n,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    const quote = await service.quote({
      token,
      amount: "1.5",
      outputToken: "WETH",
    });
    expect(quote.supported).toBe(true);
    expect(quote.input).toMatchObject({
      contract: token,
      symbol: null,
      decimals: 6,
      rawAmount: "1500000",
    });
    expect(quote.quote?.amountOutDisplay).toBe("0.000000000000999");
    expect(quote.coverage.poolsQuoted[0]).toMatchObject({
      fee: 3000,
      pool: POOL_3000,
    });
  });

  it("reports a v4-only token as unsupported without a quote or money liquidity", async () => {
    const token = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352".toLowerCase();
    const rpc = mockRpc({
      token: { address: token, decimals: 18, code: "0x60006000" },
      pools: {},
      quotes: {},
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    const quote = await service.quote({
      token,
      amount: "1",
      outputToken: "WETH",
    });
    expect(quote.supported).toBe(false);
    expect(quote.reason).toBe("no_v3_pool");
    expect(quote.output).toBeNull();
    expect(quote.quote).toBeNull();
    expect(quote.coverage.poolsMissing).toEqual([100, 500, 3000, 10_000]);
    expect(quote.limitations.join(" ")).toMatch(/v4/i);
  });

  it("fails closed when an arbitrary token does not expose validated decimals", async () => {
    const token = "0x1234567890abcdef1234567890abcdef12345678";
    const rpc = mockRpc({
      token: { address: token, decimals: null, code: "0x60006000" },
      pools: {},
      quotes: {},
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    const quote = await service.quote({
      token,
      amount: "1",
      outputToken: "USDG",
    });
    expect(quote.supported).toBe(false);
    expect(quote.reason).toBe("unknown_decimals");
    expect(quote.quote).toBeNull();
    // The factory was never reached, so no fee tier is claimed tested or missing.
    expect(quote.coverage.feeTiersTested).toEqual([]);
    expect(quote.coverage.poolsMissing).toEqual([]);
    expect(quote.coverage.poolsDiscoveryFailed).toEqual([]);
    // A real anchor is captured before identity reads; no zero block/hash is fabricated.
    expect(quote.anchor.blockNumber).toBe(100);
    expect(quote.anchor.blockHash).toBe(HASH_A);
  });

  it("treats an errored code read as a provider problem, not a missing contract", async () => {
    const token = "0x1234567890abcdef1234567890abcdef12345678";
    const rpc = mockRpc({
      token: { address: token, decimals: 18, code: "0x60006000" },
      pools: {},
      quotes: {},
      codeError: true,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    await expect(
      service.quote({ token, amount: "1", outputToken: "WETH" }),
    ).rejects.toMatchObject({
      code: "EXIT_CHECK_PROVIDER_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("treats a true empty code result as a missing contract", async () => {
    const token = "0x1234567890abcdef1234567890abcdef12345678";
    const rpc = mockRpc({
      token: { address: token, decimals: 18, code: "0x" },
      pools: {},
      quotes: {},
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    await expect(
      service.quote({ token, amount: "1", outputToken: "WETH" }),
    ).rejects.toMatchObject({
      code: "EXIT_CHECK_INVALID_TOKEN",
      statusCode: 400,
    });
  });

  it("fails closed when factory discovery reverts instead of claiming no V3 pool", async () => {
    const token = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352".toLowerCase();
    const rpc = mockRpc({
      token: { address: token, decimals: 18, code: "0x60006000" },
      pools: {},
      quotes: {},
      factoryReverts: true,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    await expect(
      service.quote({ token, amount: "1", outputToken: "WETH" }),
    ).rejects.toMatchObject({
      code: "EXIT_CHECK_POOL_DISCOVERY_FAILED",
      statusCode: 503,
    });
  });

  it("rejects a malformed aggregate result count", async () => {
    const rpc = mockRpc({
      pools: { 100: POOL_100 },
      quotes: { 100: 1n },
      aggregateCountOverride: 3,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    await expect(
      service.quote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toMatchObject({
      code: "EXIT_CHECK_MALFORMED_POOL",
      statusCode: 503,
    });
  });

  it("excludes a quote that ended on a price boundary instead of proving full execution", async () => {
    const rpc = mockRpc({
      pools: { 100: POOL_100 },
      quotes: { 100: 2_567_029n },
      quoterSqrtAfter: 4295128739n,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    const quote = await service.quote({
      token: WETH,
      amount: "0.001",
      outputToken: "USDG",
    });
    expect(quote.supported).toBe(false);
    expect(quote.reason).toBe("quote_failed");
    expect(quote.quote).toBeNull();
    expect(quote.coverage.poolsFailed[0]).toMatchObject({
      fee: 100,
      reason: "price_boundary_reached",
    });
    expect(quote.limitations.join(" ")).toMatch(/partial fill/i);
  });

  it("rejects invalid amount syntax before cache lookup and rejects above uint256", async () => {
    const requestJson = vi.fn();
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc: { requestJson }, budget: allowBudget() },
    );
    await expect(
      service.quote({ token: WETH, amount: "0.001.0", outputToken: "USDG" }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_AMOUNT" });
    await expect(
      service.quote({ token: WETH, amount: "0", outputToken: "USDG" }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_AMOUNT" });
    await expect(
      service.quote({
        token: WETH,
        amount: "9".repeat(79),
        outputToken: "USDG",
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_AMOUNT" });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("expires based on anchor capture time instead of response completion", async () => {
    const rpc = mockRpc({
      pools: { 100: POOL_100 },
      quotes: { 100: 1_000_000n },
    });
    let calls = 0;
    const start = Date.parse("2026-09-11T12:00:00Z");
    // The anchor capture happens at t0; finalize happens after the 30s window
    // and must refuse to present the old block.
    const now = () => new Date(start + (calls++ < 1 ? 0 : 31_000));
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget(), now },
    );
    await expect(
      service.quote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_STALE", statusCode: 503 });
  });

  it("fails closed on a reorg instead of returning a stale-block estimate", async () => {
    const rpc = mockRpc({
      pools: { 100: POOL_100 },
      quotes: { 100: 1n },
      reorg: true,
    });
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget: allowBudget() },
    );
    await expect(
      service.quote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_REORGED", statusCode: 503 });
  });

  it("maps an upstream 429 to a clear cooldown instead of retrying", async () => {
    const requestJson = vi
      .fn()
      .mockRejectedValue(new ProviderRequestError("PROVIDER_HTTP_429", true));
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc: { requestJson }, budget: allowBudget() },
    );
    await expect(
      service.quote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toMatchObject({
      code: "EXIT_CHECK_RATE_LIMITED",
      statusCode: 503,
    });
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the reviewed RPC budget is exhausted", async () => {
    const rpc = mockRpc({ pools: { 100: POOL_100 }, quotes: { 100: 1n } });
    const budget = {
      consume: vi
        .fn()
        .mockRejectedValue(new Error("EXIT_CHECK_DAILY_BUDGET_EXCEEDED")),
    };
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc, budget },
    );
    await expect(
      service.quote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toThrow();
  });

  it("rejects malformed and unsupported inputs before any RPC call", async () => {
    const requestJson = vi.fn();
    const service = new ExitCheckService(
      testEnv(),
      new JsonCache(undefined, 15),
      { rpc: { requestJson }, budget: allowBudget() },
    );
    await expect(
      service.quote({
        token: "not-an-address",
        amount: "1",
        outputToken: "WETH",
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_TOKEN" });
    await expect(
      service.quote({
        token: "0x0000000000000000000000000000000000000000",
        amount: "1",
        outputToken: "WETH",
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_TOKEN" });
    await expect(
      service.quote({
        token: "0x000000000000000000000000000000000000dead",
        amount: "1",
        outputToken: "WETH",
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_TOKEN" });
    await expect(
      service.quote({ token: WETH, amount: "0.001", outputToken: "WETH" }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_TOKEN" });
    await expect(
      service.quote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDC" as "USDG",
      }),
    ).rejects.toMatchObject({ code: "EXIT_CHECK_INVALID_OUTPUT" });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("keeps execution, wallet fields, and provider credentials out of the feature", () => {
    const source = [
      new URL("../src/exit-check/service.ts", import.meta.url),
      new URL("../src/exit-check/math.ts", import.meta.url),
      new URL("../src/routes/exit-check.ts", import.meta.url),
      new URL("../../web/src/exit-check/api.ts", import.meta.url),
      new URL("../../web/src/exit-check/ExitCheck.tsx", import.meta.url),
    ]
      .map((url) => readFileSync(url, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /signTransaction|sendTransaction|eth_sendRawTransaction|wallet_sendCalls|privateKey|mnemonic/,
    );
    expect(source).not.toMatch(/liquidityUsd|totalLiquidityUsd/);
  });
});

describe("exit-check route", () => {
  it("is hidden by default with a 404 and never calls a provider when off", async () => {
    const source = { quote: vi.fn() };
    const app = Fastify({ logger: false });
    APPS.push(app);
    installErrorHandler(app);
    await exitCheckRoutes(
      app,
      loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }),
      new JsonCache(undefined, 15),
      source,
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/private/exit-check/quote",
      payload: { token: WETH, amount: "0.001" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
    expect(source.quote).not.toHaveBeenCalled();
  });

  it("rejects wallet, rpc, and execution fields at the strict boundary", async () => {
    const source = { quote: vi.fn() };
    const app = Fastify({ logger: false });
    APPS.push(app);
    installErrorHandler(app);
    await exitCheckRoutes(app, testEnv(), new JsonCache(undefined, 15), source);
    for (const field of [
      "wallet",
      "rpcUrl",
      "calldata",
      "transactionHash",
      "privateKey",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/private/exit-check/quote",
        payload: { token: WETH, amount: "0.001", [field]: "x" },
      });
      expect(response.statusCode, field).toBe(400);
    }
    expect(source.quote).not.toHaveBeenCalled();
  });

  it("serves a fresh read-only estimate with no-store headers", async () => {
    const source = {
      quote: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        supported: false,
        reason: "no_v3_pool",
      }),
    };
    const app = Fastify({ logger: false });
    APPS.push(app);
    installErrorHandler(app);
    await exitCheckRoutes(app, testEnv(), new JsonCache(undefined, 15), source);
    const response = await app.inject({
      method: "POST",
      url: "/v1/private/exit-check/quote",
      payload: { token: WETH, amount: "0.001", outputToken: "USDG" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(source.quote).toHaveBeenCalledWith({
      token: WETH,
      amount: "0.001",
      outputToken: "USDG",
    });
  });
});

describe("exit check on the admitted dRPC transport", () => {
  it("quotes through the credential-free dRPC URL and reports the drpc provider", async () => {
    const key = "test-drpc-key-0123456789abcdef";
    const rpc = mockRpc({
      pools: { 100: POOL_100 },
      quotes: { 100: 2_567_029n },
      sqrtPriceX96: 4_014_000_000_000_000_000_000_000n,
      liquidity: 12_345_678_901_234_567_890n
    });
    const requestJson = vi.spyOn(rpc, "requestJson");
    const env = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", EXIT_CHECK_ENABLED: "true", ROBINHOOD_RPC_PROVIDER: "drpc", DRPC_API_KEY: key });
    const service = new ExitCheckService(env, new JsonCache(undefined, 15), { rpc, budget: allowBudget(), now: () => new Date("2026-09-11T12:00:00Z") });

    const quote = await service.quote({ token: WETH, amount: "0.001", outputToken: "USDG" });

    expect(quote.supported).toBe(true);
    expect(quote.provider).toEqual({ name: "drpc", cached: false });
    expect(new Set(requestJson.mock.calls.map(([url]) => url))).toEqual(new Set(["https://lb.drpc.live/robinhood"]));
    expect(JSON.stringify(quote)).not.toContain(key);
  });
});

function testEnv() {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    EXIT_CHECK_ENABLED: "true",
  });
}

function allowBudget() {
  return { consume: async () => undefined };
}

type MockConfig = {
  token?: { address: string; decimals: number | null; code: string };
  pools?: Record<number, string>;
  quotes?: Record<number, bigint>;
  quoteByAmount?: Record<string, bigint>;
  observedQuotes?: Array<{ fee: number; amount: bigint }>;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  quoteFailures?: number[];
  reorg?: boolean;
  failGetCode?: boolean;
  codeError?: boolean;
  factoryReverts?: boolean;
  quoterSqrtAfter?: bigint;
  aggregateCountOverride?: number;
};

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const combinedAbi = [
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
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

function mockRpc(config: MockConfig): ProviderHttp {
  return {
    requestJson: async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as unknown;
      if (Array.isArray(body))
        return Promise.all(
          body.map((request) => handleSingle(request as RpcLike, config)),
        );
      return handleSingle(body as RpcLike, config);
    },
  };
}

type RpcLike = { id?: string; method: string; params: unknown[] };

function handleSingle(request: RpcLike, config: MockConfig): unknown {
  if (request.method === "eth_getCode") {
    if (config.codeError)
      return {
        id: request.id,
        error: { code: -32000, message: "execution reverted" },
      };
    if (config.failGetCode)
      return { id: request.id, error: { message: "rpc error" } };
    return { id: request.id, result: config.token?.code ?? "0x60006000" };
  }
  if (request.method === "eth_call") {
    const call = request.params[0] as { to: string; data: string };
    if (call.to.toLowerCase() === UNISWAP_MULTICALL3.toLowerCase()) {
      return { id: request.id, result: handleMulticall(call.data, config) };
    }
    const suffix =
      config.token?.decimals === null
        ? "0x"
        : encodeAbiParameters(parseAbiParameters("uint256"), [
            BigInt(config.token?.decimals ?? 18),
          ]);
    return { id: request.id, result: suffix };
  }
  if (request.method === "eth_getBlockByNumber") {
    const tag = request.params[0];
    const hash = tag === "latest" || !config.reorg ? HASH_A : HASH_B;
    return {
      id: request.id,
      result: { number: "0x64", hash, timestamp: "0x6a000000" },
    };
  }
  return { id: request.id, error: { message: `unexpected ${request.method}` } };
}

function handleMulticall(data: string, config: MockConfig): string {
  const decoded = decodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    data: data as `0x${string}`,
  });
  const calls = decoded.args[0] as readonly {
    target: string;
    allowFailure: boolean;
    callData: string;
  }[];
  const results = calls.map((call) => {
    try {
      const inner = decodeFunctionData({
        abi: combinedAbi,
        data: call.callData as `0x${string}`,
      });
      if (inner.functionName === "getPool") {
        if (config.factoryReverts)
          return { success: false, returnData: "0x" as const };
        const fee = Number((inner.args as readonly unknown[])[2]);
        const pool = config.pools?.[fee];
        if (!pool)
          return {
            success: true,
            returnData: encodeFunctionResult({
              abi: combinedAbi,
              functionName: "getPool",
              result: `0x${"0".repeat(40)}`,
            }),
          };
        return {
          success: true,
          returnData: encodeFunctionResult({
            abi: combinedAbi,
            functionName: "getPool",
            result: pool as `0x${string}`,
          }),
        };
      }
      if (inner.functionName === "slot0") {
        return {
          success: true,
          returnData: encodeFunctionResult({
            abi: combinedAbi,
            functionName: "slot0",
            result: [
              config.sqrtPriceX96 ?? 4_014_000_000_000_000_000_000_000n,
              0,
              0,
              0,
              0,
              0,
              true,
            ],
          }),
        };
      }
      if (inner.functionName === "liquidity") {
        return {
          success: true,
          returnData: encodeFunctionResult({
            abi: combinedAbi,
            functionName: "liquidity",
            result: config.liquidity ?? 1n,
          }),
        };
      }
      if (inner.functionName === "quoteExactInputSingle") {
        const params = (inner.args as readonly unknown[])[0] as {
          fee: number;
          amountIn: bigint;
        };
        const fee = Number(params.fee);
        config.observedQuotes?.push({ fee, amount: params.amountIn });
        if (config.quoteFailures?.includes(fee))
          return { success: false, returnData: "0xdeadbeef" as const };
        const baseline =
          config.quoteByAmount?.[params.amountIn.toString()] ??
          config.quotes?.[fee];
        const amountOut = baseline;
        if (amountOut === undefined)
          return { success: false, returnData: "0x" as const };
        return {
          success: true,
          returnData: encodeFunctionResult({
            abi: combinedAbi,
            functionName: "quoteExactInputSingle",
            result: [
              amountOut,
              config.quoterSqrtAfter ?? 4_014_000_000_000_000_000_000_000n,
              0,
              0n,
            ],
          }),
        };
      }
    } catch {
      return { success: false, returnData: "0x" as const };
    }
    return { success: false, returnData: "0x" as const };
  });
  const finalResults =
    config.aggregateCountOverride === undefined
      ? results
      : Array.from(
          { length: config.aggregateCountOverride },
          (_, index) =>
            results[index] ?? { success: false, returnData: "0x" as const },
        );
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    result: finalResults,
  });
}
