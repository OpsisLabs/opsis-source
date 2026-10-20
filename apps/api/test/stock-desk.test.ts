import Fastify from "fastify";
import { describe, it, expect, vi } from "vitest";
import type { ReceiptBody } from "@rh-chain/shared";
import {
  StockDeskService,
  STOCK_DESK_ASSETS,
  offHours,
  type DeskEngines,
} from "../src/stock-desk/service.js";
import { gap, notionalAmount } from "../src/stock-desk/math.js";
import { reserveBudget } from "../src/stock-desk/budget.js";
import { loadEnv } from "../src/config/env.js";
import { AppError, installErrorHandler } from "../src/http/errors.js";
import { stockDeskRoutes } from "../src/routes/stock-desk.js";
import type { RwaVerification } from "../src/rwa/service.js";
import type { ExitCheckResponse } from "../src/exit-check/service.js";
import { ReceiptService } from "../src/receipts/service.js";
import { privateKeyToAccount } from "viem/accounts";
import {
  verifyReceipt,
  receiptDigest,
  receiptBody,
  canonicalize,
} from "@rh-chain/shared";
import { keccak256, recoverAddress } from "viem";

const NOW = Date.parse("2026-10-19T15:00:00.000Z");
const TIME = new Date(NOW).toISOString();
const HASH = `0x${"ab".repeat(32)}`;
const ADDRESS = STOCK_DESK_ASSETS[0]!.address.toLowerCase();
function fixture(
  options: {
    embedded?: boolean | null;
    decimals?: number;
    reference?: string;
    stale?: boolean;
    paused?: boolean;
    official?: boolean;
    conflict?: boolean;
    missingPool?: boolean;
    cap?: boolean;
    lowBudget?: boolean;
    usdg?: string | null;
    badConversionTime?: boolean;
    noHolders?: boolean;
    noSchedule?: boolean;
  } = {},
) {
  const rwa = {
    verify: vi.fn(
      async (
        address: string,
        opts?: { desk?: boolean; rpcCalls?: ReceiptBody["rpcCalls"] },
      ) => {
        opts?.rpcCalls?.push({
          method: "eth_call",
          paramsSha256: HASH as `0x${string}`,
        });
        return {
          kind:
            options.official === false ? "unsupported_contract" : "stock_token",
          address,
          headline: "fixture",
          summary: "fixture",
          anchor: {
            chainId: 4663,
            blockNumber: 100,
            blockHash: HASH,
            timestamp: TIME,
            capturedAt: TIME,
            finality: "current_non_final",
          },
          checks: [
            {
              id: "canonical",
              status: options.conflict ? "conflict" : "confirmed",
            },
            { id: "actions", status: "confirmed" },
          ],
          stock:
            options.official === false
              ? undefined
              : {
                  symbol: "SAMPLE",
                  decimals: options.decimals ?? 18,
                  currentMultiplier: "2",
                  pendingMultiplier: options.noSchedule ? null : "3",
                  pendingEffectiveAt: "2026-10-22T15:00:00.000Z",
                  oraclePaused: options.paused ?? false,
                  underlyingQuote: null,
                  corporateActions: [],
                  oracle: {
                    feed: ADDRESS,
                    value: options.reference ?? "100",
                    updatedAt: new Date(
                      NOW - (options.stale ? 7200 : 60) * 1000,
                    ).toISOString(),
                    heartbeatSeconds: 3600,
                    multiplierEmbedded:
                      options.embedded === undefined ? true : options.embedded,
                    state: "current",
                  },
                },
          sources: [
            {
              id: "robinhood-actions",
              url: "https://issuer.example/actions",
              fetchedAt: TIME,
            },
            {
              id: "chainlink-rdd",
              url: "https://chainlink.example/directory",
              fetchedAt: TIME,
            },
          ],
          limitations: [],
        } as RwaVerification;
      },
    ),
  };
  const exit = {
    quote: vi.fn(
      async (input: {
        token: string;
        amount: string;
        outputToken?: string;
      }) => {
        if (options.lowBudget)
          throw new AppError("EXIT_CHECK_DAILY_BUDGET_EXCEEDED", 503, "budget");
        if (options.cap)
          throw new AppError("EXIT_CHECK_RPC_LIMIT_EXCEEDED", 503, "cap");
        return {
          supported: !options.missingPool,
          input: { contract: input.token, amount: input.amount },
          output: { symbol: input.outputToken },
          quote: options.missingPool
            ? null
            : {
                amountOutDisplay: String(Number(input.amount) * 101),
                priceImpactBps: "1",
                pool: { pool: ADDRESS },
              },
          coverage: { poolsDiscoveryFailed: [], poolsFailed: [] },
          anchor: { blockNumber: 101, blockHash: HASH, timestamp: TIME },
          expiresAt: new Date(NOW + 30_000).toISOString(),
        } as ExitCheckResponse;
      },
    ),
  };
  const market = {
    market: vi.fn(async () => ({
      source: "blockscout",
      observedAt: new Date(
        NOW - (options.badConversionTime ? 120_000 : 0),
      ).toISOString(),
      priceUsd: options.usdg === undefined ? "0.99" : options.usdg,
      concentration: options.noHolders
        ? { state: "unknown" as const, reason: "unavailable" }
        : {
            state: "available" as const,
            value: {
              top10Percent: 20,
              poolPercent: 30,
              burnPercent: 5,
              holdersAnalyzed: 50,
              source: "blockscout",
              observedAt: TIME,
            },
          },
    })),
  };
  const engines: DeskEngines = { rwa, exit, market };
  const reserve = vi.fn(async () => engines);
  return {
    engines,
    reserve,
    rwa,
    exit,
    market,
    service: new StockDeskService(
      engines,
      reserve,
      300,
      undefined,
      undefined,
      () => NOW,
    ),
  };
}

describe("Stock Token Desk", () => {
  it("uses embedded per-token reference once, exact USDG conversion and independent evidence", async () => {
    const f = fixture();
    const d = await f.service.desk(ADDRESS);
    expect(d.reference).toMatchObject({
      state: "available",
      value: { priceUsd: "100", multiplierEmbedded: true },
    });
    expect(d.pool).toMatchObject({
      value: { priceUsdG: "101", notionalUsd: "100", outputUnit: "USDG" },
    });
    expect(d.gapBps).toMatchObject({ value: "-1" }); // 101 USDG * .99 USD = 99.99 USD
    expect(
      d.gapBps.state === "available" && d.gapBps.evidence.map((e) => e.block),
    ).toEqual(expect.arrayContaining([101, 100, null]));
    expect(f.exit.quote.mock.calls.map(([q]) => q.amount)).toEqual([
      "1",
      "10",
      "100",
      "1000",
    ]);
    expect(
      f.exit.quote.mock.calls.every(([q]) => q.outputToken === "USDG"),
    ).toBe(true);
    expect(d.concentration).toMatchObject({
      value: { top10Percent: 20, poolPercent: 30, burnPercent: 5 },
    });
    expect(
      d.gapBps.state === "available" &&
        d.gapBps.evidence.some(
          (e) => e.value === "0.99" && e.unit === "USD per USDG",
        ),
    ).toBe(true);
    expect(d.history).toEqual({
      state: "unavailable",
      reason: "history unavailable in this release",
    });
    expect(d.disclaimer).toContain("it is not a share");
    expect(f.rwa.verify).toHaveBeenCalledWith(ADDRESS, {
      desk: true,
      rpcCalls: undefined,
    });
    expect(d).not.toHaveProperty("underlyingQuote");
  });
  it("applies the multiplier only with an explicit nonembedded directory flag", async () => {
    expect(
      (await fixture({ embedded: false }).service.desk(ADDRESS)).reference,
    ).toMatchObject({ value: { priceUsd: "200" } });
    const f = fixture({ embedded: null });
    expect((await f.service.desk(ADDRESS)).reference).toEqual({
      state: "unknown",
      reason: "FEED_MULTIPLIER_BASIS_UNKNOWN",
    });
    expect(f.exit.quote).not.toHaveBeenCalled();
  });
  it.each([
    { stale: true },
    { paused: true },
    { conflict: true },
    { official: false },
  ])("refuses comparisons for %j", async (options) => {
    const f = fixture(options),
      d = await f.service.desk(ADDRESS);
    expect(d.gapBps.state).toBe("unknown");
    expect(f.exit.quote).not.toHaveBeenCalled();
    if (options.official === false)
      expect(d.canonical).toBe("not_on_official_list");
  });
  it.each([{ missingPool: true }, { cap: true }])(
    "keeps capped/missing depth unknown: %j",
    async (options) => {
      const d = await fixture(options).service.desk(ADDRESS);
      expect(d.depth).toHaveLength(3);
      expect(d.depth.every((row) => row.quote.state === "unknown")).toBe(true);
    },
  );
  it.each([{ usdg: null }, { usdg: "0" }, { badConversionTime: true }])(
    "does not invent a USDG peg for %j",
    async (options) => {
      const d = await fixture(options).service.desk(ADDRESS);
      expect(d.pool.state).toBe("available");
      expect(d.gapBps.state).toBe("unknown");
    },
  );
  it("retains a valid reference when input precision prevents a depth quote", async () => {
    const f = fixture({ decimals: 0, reference: "301" });
    const d = await f.service.desk(ADDRESS);
    expect(d.reference.state).toBe("available");
    expect(d.depth.every((row) => row.quote.state === "unknown")).toBe(true);
    expect(f.exit.quote).not.toHaveBeenCalled();
  });

  it("keeps unavailable concentration unknown", async () => {
    expect(
      (await fixture({ noHolders: true }).service.desk(ADDRESS)).concentration
        .state,
    ).toBe("unknown");
  });
  it("coalesces and caches a bounded index, then refreshes after expiry", async () => {
    const f = fixture();
    let clock = NOW;
    const service = new StockDeskService(
      f.engines,
      f.reserve,
      300,
      undefined,
      undefined,
      () => clock,
    );
    const [a, b] = await Promise.all([service.index(), service.index()]);
    expect(a).toEqual(b);
    expect(f.reserve).toHaveBeenCalledTimes(1);
    expect(f.rwa.verify).toHaveBeenCalledTimes(10);
    expect(a.entries).toHaveLength(10);
    expect(a.gaps).toHaveLength(10);
    expect(a.multiplierEvents).toHaveLength(10);
    expect(a.staleFeeds).toEqual([]);
    expect(a.entries[0]?.href).toMatch(/^\/rwa\?desk=0x/);
    await service.index();
    expect(f.reserve).toHaveBeenCalledTimes(1);
    clock += 301_000;
    await service.index();
    expect(f.reserve).toHaveBeenCalledTimes(2);
  });
  it("lists a token that still fails after one retry as unavailable instead of failing the index", async () => {
    const f = fixture();
    const original = f.rwa.verify.getMockImplementation()!;
    const calls = new Map<string, number>();
    f.rwa.verify.mockImplementation(async (address: string, opts?: { desk?: boolean; rpcCalls?: ReceiptBody["rpcCalls"] }) => {
      const n = (calls.get(address) ?? 0) + 1;
      calls.set(address, n);
      const index = STOCK_DESK_ASSETS.findIndex((a) => a.address.toLowerCase() === address.toLowerCase());
      if (index === 0) throw Object.assign(new Error("PROVIDER_HTTP_429"), { retryable: true });
      if (index === 1 && n === 1) throw Object.assign(new Error("PROVIDER_HTTP_429"), { retryable: true });
      return original(address, opts);
    });
    const index = await f.service.index();
    expect(index.entries).toHaveLength(9);
    expect(index.coverage.complete).toBe(false);
    expect(index.unavailable).toEqual([{ address: STOCK_DESK_ASSETS[0]!.address.toLowerCase(), reason: expect.any(String) }]);
    expect(calls.get(STOCK_DESK_ASSETS[1]!.address.toLowerCase()) ?? calls.get(STOCK_DESK_ASSETS[1]!.address)).toBe(2);
  });
  it("prefers the on-chain Chainlink USDG/USD rate, anchored to the token read, for the gap", async () => {
    const f = fixture();
    const original = f.rwa.verify.getMockImplementation()!;
    f.rwa.verify.mockImplementation(async (address: string, opts?: { desk?: boolean; rpcCalls?: ReceiptBody["rpcCalls"] }) => {
      const result = await original(address, opts);
      return { ...result, stock: { ...result.stock!, usdgUsd: { feed: "0x61b7e5650328764b076a108eff5fa7282a1b9ad2", value: "1.0000529", updatedAt: TIME, heartbeatSeconds: 86400, state: "current" as const } } };
    });
    const desk = await f.service.desk(STOCK_DESK_ASSETS[0]!.address);
    expect(desk.gapBps.state).toBe("available");
    if (desk.gapBps.state === "available") {
      const conversion = desk.gapBps.evidence.find((e) => e.source.startsWith("chainlink:") && e.source.endsWith(":USDG/USD"));
      expect(conversion).toMatchObject({ value: "1.0000529", unit: "USD per USDG" });
      expect(conversion?.block).not.toBeNull();
    }
    expect(f.market.market).not.toHaveBeenCalledWith(expect.stringMatching(/^0x5fc5360d/i));
  });
  it("keeps a quote when an empty pool reverts but refuses one with a read failure", async () => {
    for (const [reason, expected] of [["reverted:0x08c379a0", "available"], ["rpc_unavailable", "unknown"]] as const) {
      const f = fixture();
      const original = f.exit.quote.getMockImplementation()!;
      f.exit.quote.mockImplementation(async (input: Parameters<typeof original>[0]) => {
        const q = await original(input);
        return { ...q, coverage: { ...q.coverage, poolsFailed: [{ fee: 100, pool: "0x0000000000000000000000000000000000000001", reason }] } };
      });
      const desk = await f.service.desk(STOCK_DESK_ASSETS[0]!.address);
      expect(desk.pool.state).toBe(expected);
    }
  });
  it("reports stale feeds without treating off-hours as fresh", async () => {
    const f = fixture({ stale: true });
    const index = await f.service.index();
    expect(index.staleFeeds).toHaveLength(10);
    expect(index.gaps).toEqual([]);
    expect(
      offHours(new Date("2026-10-17T15:00:00.000Z")).expectedOffHours,
    ).toBe(true);
    expect(
      offHours(new Date("2026-10-19T15:00:00.000Z")).expectedOffHours,
    ).toBe(false);
    expect(
      offHours(new Date("2026-10-19T22:00:00.000Z")).offHoursBasis,
    ).toContain("reference holding");
  });
  it("refuses before a scan when reservation fails and never caches a failed partial scan", async () => {
    const f = fixture();
    const reserve = vi
      .fn()
      .mockRejectedValueOnce(
        new AppError("RWA_DAILY_BUDGET_EXCEEDED", 503, "budget"),
      )
      .mockResolvedValue(f.engines);
    const service = new StockDeskService(
      f.engines,
      reserve,
      300,
      undefined,
      undefined,
      () => NOW,
    );
    await expect(service.index()).rejects.toMatchObject({
      code: "RWA_DAILY_BUDGET_EXCEEDED",
    });
    expect(f.rwa.verify).not.toHaveBeenCalled();
    await service.index();
    expect(reserve).toHaveBeenCalledTimes(2);
    const low = fixture({ lowBudget: true });
    await expect(low.service.index()).rejects.toMatchObject({
      code: "EXIT_CHECK_DAILY_BUDGET_EXCEEDED",
    });
    await expect(low.service.index()).rejects.toThrow();
    expect(low.reserve).toHaveBeenCalledTimes(2);
  });
  it("charges reservations once and refuses overruns", async () => {
    const parent = { consume: vi.fn(async () => undefined) };
    const child = await reserveBudget(parent, 4);
    await child.consume(3);
    await child.consume(1);
    await expect(child.consume(1)).rejects.toMatchObject({
      code: "STOCK_DESK_RESERVATION_EXCEEDED",
    });
    expect(parent.consume).toHaveBeenCalledExactlyOnceWith(4);
  });
  it("uses integer arithmetic with sub-bps precision and refuses invalid/coarse sizing", () => {
    expect(gap("100.000001", "100", "1")).toBe("0.0001");
    expect(gap("99.999999", "100", "1")).toBe("-0.0001");
    expect(gap("1", "0", "1")).toBeNull();
    expect(notionalAmount("3", 0, "1000")).toBeNull();
    expect(notionalAmount("100", 18, "100000")).toBe("1000");
  });
  it("attaches a verifiable receipt and retains it on an index cache hit", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const keys = [
      {
        address: account.address,
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
      },
    ];
    const receipts = new ReceiptService(
      {
        address: account.address,
        signDigest: (hash) => account.sign({ hash }),
      },
      keys,
      "a".repeat(40),
      () => NOW,
    );
    const f = fixture();
    const service = new StockDeskService(
      f.engines,
      f.reserve,
      300,
      receipts,
      undefined,
      () => NOW,
    );
    const d = await service.desk(ADDRESS);
    expect(d.receipt?.outputs).not.toHaveProperty("receipt");
    expect(d.receipt?.rpcCalls).toHaveLength(1);
    expect(
      d.receipt &&
        (await verifyReceipt(canonicalize(d.receipt), keys, {
          keccak256,
          recoverAddress,
        })),
    ).toMatchObject({ valid: true, signature: true });
    const a = await service.index(),
      b = await service.index();
    expect(a.entries[0]?.desk.receipt).toEqual(b.entries[0]?.desk.receipt);
    expect(
      d.receipt && receiptDigest(receiptBody(d.receipt), { keccak256 }),
    ).toMatch(/^0x/);
  });
  it("defaults off, gates parents and validates route bodies before engine work", async () => {
    expect(loadEnv({ NODE_ENV: "test" }).STOCK_DESK_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: "test" }).STOCK_DESK_CACHE_SECONDS).toBe(300);
    expect(() =>
      loadEnv({ NODE_ENV: "test", STOCK_DESK_CACHE_SECONDS: "1801" }),
    ).toThrow();
    for (const flags of [
      {},
      { STOCK_DESK_ENABLED: "true", RWA_VERIFY_ENABLED: "true" },
      {
        STOCK_DESK_ENABLED: "true",
        RWA_VERIFY_ENABLED: "true",
        EXIT_CHECK_ENABLED: "true",
      },
    ]) {
      const app = Fastify();
      installErrorHandler(app);
      const f = fixture();
      await stockDeskRoutes(
        app,
        loadEnv({ NODE_ENV: "test", ...flags }),
        f.service,
      );
      const response = await app.inject({
        method: "POST",
        url: "/v1/private/stock-desk/token",
        payload: { address: ADDRESS },
      });
      expect(response.statusCode).toBe(flags.EXIT_CHECK_ENABLED ? 200 : 503);
      if (!flags.EXIT_CHECK_ENABLED)
        expect(f.rwa.verify).not.toHaveBeenCalled();
      const index = await app.inject({
        method: "POST",
        url: "/v1/private/stock-desk/index",
        payload: { unexpected: true },
      });
      expect(index.statusCode).toBe(flags.EXIT_CHECK_ENABLED ? 400 : 503);
      await app.close();
    }
  });
});
