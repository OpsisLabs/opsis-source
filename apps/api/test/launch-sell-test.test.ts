import { describe, it, expect, vi } from "vitest";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  encodeEventTopics,
  keccak256,
  parseAbiParameters,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { REVIEWED_ASSETS } from "@rh-chain/shared";
import {
  encodeV4Swap,
  routerAbi,
  v3Abi,
  runSellTest,
  sellContracts,
  nativeCurrency,
  multicallAbi,
  keyParameters,
  ratio,
  type PoolKey,
} from "../src/launches/sell-test.js";
import { LaunchReader, aggregateAbi, multicall3 } from "../src/launches/reader.js";
import { loadEnv } from "../src/config/env.js";
import { AppError } from "../src/http/errors.js";
import { stockPairUsdPrice } from "../src/rwa/service.js";
import { events, type Launch } from "../src/launches/registry.js";
import {
  jsonRpcUnits,
  RobinhoodRpcHttp,
  robinhoodRpcEndpoint,
} from "../src/chain/robinhood-rpc.js";
const token = `0x${"1".repeat(40)}` as Address,
  pool = `0x${"2".repeat(40)}` as Address,
  feeWallet = `0x${"3".repeat(40)}` as Address;
const anchor = {
  number: 12345,
  hash: `0x${"a".repeat(64)}`,
  seconds: 1792454400,
};
const word = (n: bigint) => toHex(n, { size: 32 });
const pair = REVIEWED_ASSETS.WETH.address.toLowerCase() as Address;
const key: PoolKey = {
  currency0: token,
  currency1: pair,
  fee: 3000,
  tickSpacing: 60,
  hooks: `0x${"4".repeat(40)}`,
};
const launch = (extra: Partial<Launch> = {}): Launch => ({
  adapter: "v3",
  token,
  launchpad: "Uniswap v3",
  factory: pool,
  deployer: null,
  pool,
  curve: null,
  pairToken: pair,
  poolId: null,
  hook: null,
  finalPositionRecipient: null,
  created: {
    blockNumber: 1,
    blockHash: anchor.hash,
    timestamp: new Date(anchor.seconds * 1000).toISOString(),
    transactionHash: anchor.hash,
    logIndex: 0,
  },
  t0: null,
  t0Rule: "fixture",
  confirmation: "fixture",
  registryVersion: "fixture",
  sourceNote: "fixture",
  reviewDate: "2026-10-20",
  unknownReasons: {},
  fee: 3000,
  ...extra,
});
function transfer(from: Address, to: Address, n: bigint) {
  return {
    address: token,
    topics: encodeEventTopics({
      abi: [events.transfer],
      eventName: "Transfer",
      args: { from, to },
    }),
    data: encodeAbiParameters(parseAbiParameters("uint256"), [n]),
  };
}
type Mode =
  | "normal"
  | "tax"
  | "revert"
  | "time"
  | "unsupported"
  | "malformed"
  | "replay"
  | "partial";
function fixture(mode: Mode = "normal", denied = false, usdSlot?: number) {
  const seen: Array<{ method: string; params: any[] }> = [];
  const budget = {
    consume: vi.fn(async (_n: number) => {
      if (denied)
        throw new AppError(
          "LAUNCH_CARDS_DAILY_BUDGET_EXCEEDED",
          503,
          "Read budget reached",
        );
    }),
  };
  const config = loadEnv({ NODE_ENV: "test" });
  const requestJson = vi.fn(async (_url: string, init?: RequestInit) => {
    const { method, params, id } = JSON.parse(String(init?.body));
    seen.push({ method, params });
    let result: unknown;
    if (method === "eth_getTransactionCount" || method === "eth_getBalance")
      result = "0x0";
    else if (method === "eth_getCode") result = "0x";
    else if (method === "eth_call") {
      if (params[0].to.toLowerCase() === multicall3.toLowerCase()) {
        const calls = decodeFunctionData({ abi: aggregateAbi, data: params[0].data }).args[0];
        result = encodeFunctionResult({ abi: aggregateAbi, functionName: "aggregate3", result: calls.map(() => ({ success: true, returnData: word(0n) })) });
      } else result = word(0n);
    } else if (method === "eth_simulateV1") {
      if (mode === "unsupported")
        return { id, error: { code: -32601, message: "Method not supported" } };
      const blocks = params[0].blockStateCalls;
      if (blocks[0].calls.length === 1) {
        const call = blocks[0].calls[0];
        const owner = decodeAbiParameters(
          parseAbiParameters("address"),
          `0x${call.data.slice(10)}` as Hex,
        )[0];
        const slot = keccak256(
          encodeAbiParameters(parseAbiParameters("address,uint256"), [
            owner,
            BigInt(usdSlot ?? 99),
          ]),
        );
        const match = blocks[0].stateOverrides[call.to]?.stateDiff[slot];
        return {
          id,
          result: [
            {
              calls: [
                {
                  status: "0x1",
                  returnData: word(match ? 123456789n : 0n),
                  logs: [],
                },
              ],
            },
          ],
        };
      }
      const first = blocks[0].calls,
        actor = first[0].from as Address;
      const isV4 = first.some((c: any) => c.to === sellContracts.v4Router),
        source = isV4 ? sellContracts.manager : pool;
      const native = first[0].to === sellContracts.multicall3;
      const starting = native
        ? BigInt(blocks[0].stateOverrides[actor].balance)
        : 0n;
      const swapIndex = first.length - 3;
      const data = first[swapIndex].data;
      let spent: bigint;
      if (isV4) {
        const args = decodeFunctionData({ abi: routerAbi, data }).args!;
        const [, ps] = decodeAbiParameters(
          parseAbiParameters("bytes,bytes[]"),
          args[1][0]!,
        );
        spent = decodeAbiParameters(
          parseAbiParameters(
            "((address,address,uint24,int24,address),bool,uint128,uint128,bytes)",
          ),
          ps[0]!,
        )[0][2];
      } else spent = decodeFunctionData({ abi: v3Abi, data }).args![0].amountIn;
      const bought = mode === "tax" ? 90n : 100n;
      const buyLogs =
        mode === "tax"
          ? [transfer(source, actor, 90n), transfer(source, feeWallet, 10n)]
          : [transfer(source, actor, bought)];
      const make = (
        logs: unknown[] = [],
        returnData: Hex = "0x",
        status = "0x1",
      ) => ({ status, returnData, logs, gasUsed: "0x5208" });
      const buy = first.map(() => make());
      buy[swapIndex] = make(buyLogs);
      buy[first.length - 2] = make(
        [],
        word(mode === "replay" && blocks.length === 2 ? bought + 1n : bought),
      );
      if (native) buy[0] = make([], word(starting));
      buy[first.length - 1] = make([], word(native ? starting - spent : 0n));
      result = [
        {
          number: "0x303a",
          timestamp: blocks[0].blockOverrides.time,
          calls: buy,
        },
      ];
      if (blocks[1]) {
        const late =
          BigInt(blocks[1].blockOverrides.time) > BigInt(anchor.seconds + 3600);
        const received =
          mode === "time" && late ? spent / 2n : (spent * 99n) / 100n;
        const sell = blocks[1].calls.map(() => make());
        sell[sell.length - 3] =
          mode === "revert"
            ? {
                ...make([], "0xdeadbeef", "0x0"),
                error: {
                  code: 3,
                  message: "execution reverted",
                  data: "0xdeadbeef",
                },
              }
            : make(
                mode === "tax"
                  ? [
                      transfer(actor, source, 81n),
                      transfer(actor, feeWallet, 9n),
                    ]
                  : [transfer(actor, source, bought)],
              );
        if (native) sell[0] = make([], word(starting - spent));
        sell[sell.length - 2] = make(
          [],
          word(received + (native ? starting - spent : 0n)),
        );
        sell[sell.length - 1] = make([], word(mode === "partial" ? 1n : 0n));
        (result as any[]).push({ calls: sell });
      }
      if (mode === "malformed") result = [{ calls: [] }];
    } else throw new Error(`Unexpected fixture method ${method}`);
    return { id, result };
  });
  const reader = new LaunchReader(
    config,
    budget,
    480,
    () => anchor.seconds * 1000,
    { requestJson },
  );
  const price = vi.fn(async () => ({
    priceUsd: "2000",
    decimals: 18,
    observedAt: new Date(anchor.seconds * 1000).toISOString(),
    source: "fixture",
  }));
  return { reader, budget, seen, price, requestJson };
}
describe("anchored launch sell simulations", () => {
  it("refuses with its own reason when the deployment has not enabled the sell test", async () => {
    const f = fixture();
    const result = await runSellTest(
      f.reader,
      anchor,
      launch(),
      f.price,
      "Sell test not enabled on this deployment",
    );
    expect(result.results).toHaveLength(9);
    expect(
      result.results.every(
        (r) =>
          r.state === "unavailable" &&
          r.reason === "Sell test not enabled on this deployment",
      ),
    ).toBe(true);
    expect(f.requestJson).not.toHaveBeenCalled();
    expect(f.price).not.toHaveBeenCalled();
  });
  it("sizes all three notionals exactly and reports an exact ratio with a decimal", async () => {
    const f = fixture(),
      result = await runSellTest(f.reader, anchor, launch(), f.price);
    expect(result.results).toHaveLength(9);
    expect(result.results.every((r) => r.state === "available")).toBe(true);
    expect(result.results[0]).toMatchObject({
      state: "available",
      spentRaw: "50000000000000000",
      boughtRaw: "100",
      receivedRaw: "49500000000000000",
      roundTripCost: {
        numerator: "500000000000000",
        denominator: "50000000000000000",
        decimal: "0.010000",
      },
    });
    expect(result.results[3]).toMatchObject({ spentRaw: "500000000000000000" });
    expect(result.results[6]).toMatchObject({
      spentRaw: "5000000000000000000",
    });
    expect(
      result.results.every(
        (r) => r.label === "Simulation at block 12345; behaviour can change.",
      ),
    ).toBe(true);
    const sims = f.seen.filter((c) => c.method === "eth_simulateV1");
    expect(sims).toHaveLength(12);
    expect(sims.every((c) => c.params[1] === "0x3039")).toBe(true);
    expect(JSON.stringify(f.seen)).not.toContain("latest");
    expect(
      sims[1]!.params[0].blockStateCalls[1].stateOverrides,
    ).toBeUndefined();
    expect(sims[0]!.params[0].validation).toBe(false);
    expect(f.budget.consume.mock.calls.filter(([n]) => n === 20)).toHaveLength(
      12,
    );
    expect(
      f.reader.evidence.rpcCalls.filter((c) => c.method === "eth_simulateV1"),
    ).toHaveLength(12);
    expect(ratio(-1n, 3n)).toEqual({
      numerator: "-1",
      denominator: "3",
      decimal: "-0.333333",
    });
  });
  it("infers each leg tax only from the token Transfer logs", async () => {
    const f = fixture("tax"),
      r = await runSellTest(f.reader, anchor, launch(), f.price);
    expect(r.results[0]).toMatchObject({
      buyTax: {
        state: "available",
        sentRaw: "100",
        receivedRaw: "90",
        inferredTax: {
          numerator: "10",
          denominator: "100",
          decimal: "0.100000",
        },
      },
      sellTax: {
        state: "available",
        sentRaw: "90",
        receivedRaw: "81",
        inferredTax: { numerator: "9", denominator: "90", decimal: "0.100000" },
      },
    });
  });
  it("retains a reverting sell and its data without a verdict", async () => {
    const f = fixture("revert"),
      r = await runSellTest(f.reader, anchor, launch(), f.price);
    expect(r.results.every((row) => row.state === "sell reverted")).toBe(true);
    expect(r.results[0]).toMatchObject({ revertData: "0xdeadbeef" });
  });
  it("carries buy state into separate sells at +1h and +24h", async () => {
    const f = fixture("time"),
      r = await runSellTest(f.reader, anchor, launch(), f.price);
    expect(r.results[0]).toMatchObject({
      roundTripCost: { decimal: "0.010000" },
    });
    expect(r.results[1]).toMatchObject({
      delaySeconds: 3600,
      roundTripCost: { decimal: "0.500000" },
    });
    expect(r.results[2]).toMatchObject({
      delaySeconds: 86400,
      roundTripCost: { decimal: "0.500000" },
    });
    const sim = f.seen.filter((c) => c.method === "eth_simulateV1")[3]!;
    expect(
      BigInt(sim.params[0].blockStateCalls[1].blockOverrides.time) -
        BigInt(sim.params[0].blockStateCalls[0].blockOverrides.time),
    ).toBe(86400n);
  });
  it("uses v4 hooks and on-chain Permit2 approvals, without a signature", async () => {
    const f = fixture(),
      r = await runSellTest(
        f.reader,
        anchor,
        launch({
          adapter: "v4",
          pool: null,
          poolKey: key,
          poolId: keccak256(encodeAbiParameters(keyParameters, [key])),
        }),
        f.price,
      );
    expect(r.results.every((row) => row.state === "available")).toBe(true);
    const calls = f.seen.find((c) => c.method === "eth_simulateV1")!.params[0]
      .blockStateCalls[0].calls;
    expect(calls.some((c: any) => c.to === sellContracts.permit2)).toBe(true);
    expect(calls.some((c: any) => c.to === sellContracts.v4Router)).toBe(true);
  });
  it("stops after an unsupported method and never substitutes a tracer or fork", async () => {
    const f = fixture("unsupported"),
      r = await runSellTest(f.reader, anchor, launch(), f.price);
    expect(
      r.results.every(
        (row) =>
          row.state === "unavailable" &&
          row.reason === "PROVIDER_ERROR:METHOD_UNSUPPORTED",
      ),
    ).toBe(true);
    expect(f.seen.filter((c) => c.method === "eth_simulateV1")).toHaveLength(1);
  });
  it("refuses a denied budget before sending an RPC and handles subcall exhaustion", async () => {
    const f = fixture("normal", true),
      r = await runSellTest(f.reader, anchor, launch(), f.price);
    expect(r.results.every((row) => row.state === "unavailable")).toBe(true);
    expect(f.requestJson).not.toHaveBeenCalled();
    const limited = fixture();
    limited.reader.calls = 479;
    const cap = await runSellTest(
      limited.reader,
      anchor,
      launch(),
      limited.price,
    );
    expect(cap.results[0]).toMatchObject({
      state: "unavailable",
      reason: "Launch-card RPC subcall budget reached",
    });
    expect(limited.requestJson).not.toHaveBeenCalled();
  });
  it.each(["malformed", "replay", "partial"] as const)(
    "refuses %s simulation evidence",
    async (mode) => {
      const f = fixture(mode),
        r = await runSellTest(f.reader, anchor, launch(), f.price);
      expect(r.results.every((row) => row.state === "unavailable")).toBe(true);
    },
  );
  it("keeps curves, unidentified pools, invalid keys and stale conversions unavailable", async () => {
    for (const l of [
      undefined,
      launch({ adapter: "pons", pool: null }),
      launch({ pool: null }),
      launch({ pool: null, poolKey: key, poolId: anchor.hash }),
    ]) {
      const f = fixture(),
        r = await runSellTest(f.reader, anchor, l, f.price);
      expect(r.results.every((row) => row.state === "unavailable")).toBe(true);
      expect(f.requestJson).not.toHaveBeenCalled();
    }
    const f = fixture();
    const r = await runSellTest(f.reader, anchor, launch(), async () => ({
      ...(await f.price()),
      observedAt: "2020-01-01T00:00:00.000Z",
    }));
    expect(r.results[0]).toMatchObject({
      state: "unavailable",
      reason: "Pair USD conversion unavailable or stale",
    });
    expect(f.requestJson).not.toHaveBeenCalled();
  });
  it("verifies USDG storage funding and does not assume its dollar peg", async () => {
    const f = fixture("normal", false, 3);
    const r = await runSellTest(
      f.reader,
      anchor,
      launch({ pairToken: REVIEWED_ASSETS.USDG.address.toLowerCase() }),
      async () => ({ ...(await f.price()), priceUsd: "0.5", decimals: 6 }),
    );
    expect(r.results[0]).toMatchObject({
      state: "available",
      spentRaw: "200000000",
    });
    const sim = f.seen.find(
      (c) =>
        c.method === "eth_simulateV1" &&
        c.params[0].blockStateCalls[0].calls.length > 1,
    )!;
    expect(
      sim.params[0].blockStateCalls[0].stateOverrides[
        REVIEWED_ASSETS.USDG.address.toLowerCase()
      ].stateDiff,
    ).toBeDefined();
    const missing = fixture();
    const failed = await runSellTest(
      missing.reader,
      anchor,
      launch({ pairToken: REVIEWED_ASSETS.USDG.address.toLowerCase() }),
      async () => ({ ...(await missing.price()), priceUsd: "1", decimals: 6 }),
    );
    expect(failed.results[0]).toMatchObject({
      reason: "pair-token funding unsupported",
    });
    expect(
      missing.seen.filter((c) => c.method === "eth_simulateV1"),
    ).toHaveLength(16);
  });
  it("measures native ETH deltas with Multicall3 and sends value only on the buy", async () => {
    const f = fixture();
    const nativeKey = {
      ...key,
      currency0: nativeCurrency,
      currency1: token,
      fee: 2500,
      tickSpacing: 25,
      hooks: nativeCurrency,
    };
    const r = await runSellTest(
      f.reader,
      anchor,
      launch({
        adapter: "instant",
        pairToken: nativeCurrency,
        pool: null,
        poolKey: nativeKey,
        poolId: keccak256(encodeAbiParameters(keyParameters, [nativeKey])),
      }),
      f.price,
    );
    expect(r.results.every((row) => row.state === "available")).toBe(true);
    expect(r.results[0]).toMatchObject({
      pairToken: nativeCurrency,
      conversionSource: "fixture",
      spentRaw: "50000000000000000",
      receivedRaw: "49500000000000000",
      roundTripCost: { decimal: "0.010000" },
    });
    expect(f.price).toHaveBeenCalledWith(nativeCurrency);
    const sim = f.seen.filter((c) => c.method === "eth_simulateV1")[1]!
      .params[0].blockStateCalls;
    const buy = sim[0].calls,
      sell = sim[1].calls;
    expect(BigInt(sim[0].stateOverrides[buy[0].from].balance)).toBeGreaterThan(
      50000000000000000n,
    );
    expect(buy).toHaveLength(4); // native balance, swap, token balance, native balance
    expect(buy[1].value).toBe(toHex(50000000000000000n));
    expect(sell[sell.length - 3].value).toBeUndefined();
    expect(
      sell.filter((c: any) => c.to === sellContracts.permit2),
    ).toHaveLength(1);
    for (const block of sim) {
      expect(block.blockOverrides.baseFeePerGas).toBe("0x0");
      expect(block.calls.every((c: any) => c.gasPrice === "0x0")).toBe(true);
      const balances = block.calls.filter(
        (c: any) => c.to === sellContracts.multicall3,
      );
      expect(balances).toHaveLength(2);
      for (const call of balances)
        expect(
          decodeFunctionData({ abi: multicallAbi, data: call.data }),
        ).toMatchObject({
          functionName: "getEthBalance",
          args: [expect.stringMatching(new RegExp(buy[0].from, "i"))],
        });
    }
    expect(
      f.seen.some(
        (c) => c.method === "eth_call" && c.params[0].to === nativeCurrency,
      ),
    ).toBe(false);
    expect(r.limitations.join(" ")).toContain(
      "gas costs are separate and are not included",
    );
  });
  it("refuses inconsistent native balance evidence", async () => {
    const f = fixture();
    const original = f.requestJson.getMockImplementation()!;
    f.requestJson.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      const { method, params } = JSON.parse(String(init?.body));
      if (
        method === "eth_simulateV1" &&
        params[0].blockStateCalls.length === 2
      ) {
        const calls = (response.result as any[])[1].calls;
        calls[0].returnData = word(BigInt(calls[0].returnData) + 1n);
      }
      return response;
    });
    const nativeKey = { ...key, currency0: nativeCurrency, currency1: token };
    const result = await runSellTest(
      f.reader,
      anchor,
      launch({
        pairToken: nativeCurrency,
        poolKey: nativeKey,
        poolId: keccak256(encodeAbiParameters(keyParameters, [nativeKey])),
      }),
      f.price,
    );
    expect(result.results.every((row) => row.state === "unavailable")).toBe(
      true,
    );
  });
  it("discovers and verifies a Stock Token pair balance slot inside anchored simulations", async () => {
    const stock = "0x5e81213613b6b86eab4c6c50d718d34359459786";
    for (const slot of [5, undefined]) {
      const f = fixture("normal", false, slot);
      const r = await runSellTest(
        f.reader,
        anchor,
        launch({ pairToken: stock }),
        async () => ({
          ...(await f.price()),
          priceUsd: "100",
          source: "Chainlink TTWO / USD; multiplier already included",
        }),
      );
      if (slot === undefined) {
        expect(
          r.results.every(
            (row) =>
              row.state === "unavailable" &&
              row.reason === "pair-token funding unsupported",
          ),
        ).toBe(true);
        expect(
          f.seen.filter((c) => c.method === "eth_simulateV1"),
        ).toHaveLength(16);
      } else {
        expect(r.results.every((row) => row.state === "available")).toBe(true);
        expect(r.results[0]).toMatchObject({
          spentRaw: "1000000000000000000",
          pairToken: stock,
          conversionSource: expect.stringContaining("Chainlink TTWO"),
        });
        const sims = f.seen.filter((c) => c.method === "eth_simulateV1");
        expect(
          sims
            .slice(0, 6)
            .every(
              (c) =>
                c.params[1] === "0x3039" &&
                c.params[0].blockStateCalls[0].calls.length === 1,
            ),
        ).toBe(true);
        const probe = sims[5]!.params[0].blockStateCalls[0];
        const actor = probe.calls[0].from;
        const expected = keccak256(
          encodeAbiParameters(parseAbiParameters("address,uint256"), [
            actor,
            5n,
          ]),
        );
        expect(probe.stateOverrides[stock].stateDiff).toEqual({
          [expected]: word(123456789n),
        });
        expect(
          sims[6]!.params[0].blockStateCalls[0].stateOverrides[stock].stateDiff,
        ).toEqual({ [expected]: word(1000000000000000000n) });
      }
      expect(
        f.seen.some((c) => c.method === "eth_call" && c.params.length > 2),
      ).toBe(false);
    }
  });
  it("keeps an unrecognized pair unavailable without simulating funding or swaps", async () => {
    const f = fixture();
    const r = await runSellTest(
      f.reader,
      anchor,
      launch({ pairToken: feeWallet }),
      async () => null,
    );
    expect(
      r.results.every(
        (row) =>
          row.state === "unavailable" &&
          row.reason === "Unsupported pair token",
      ),
    ).toBe(true);
    expect(f.requestJson).not.toHaveBeenCalled();
  });
  it("reserves conservative provider CU before simulation transport", async () => {
    expect(jsonRpcUnits(JSON.stringify({ method: "eth_simulateV1" }))).toBe(
      2000,
    );
    const spend = {
        reserve: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
      transport = { requestJson: vi.fn() };
    const rpc = new RobinhoodRpcHttp(
      robinhoodRpcEndpoint(loadEnv({ NODE_ENV: "test" })),
      transport,
      spend,
    );
    await expect(
      rpc.requestJson("https://rpc.mainnet.chain.robinhood.com", {
        method: "POST",
        body: JSON.stringify({ method: "eth_simulateV1", params: [] }),
      }),
    ).rejects.toThrow();
    expect(transport.requestJson).not.toHaveBeenCalled();
    expect(spend.reserve).toHaveBeenCalledWith(2000);
  });
});
describe("v4 periphery calldata", () => {
  it.each([true, false])(
    "encodes exact-input direction %s, PoolKey, uint128 and settlement limits",
    (zeroForOne) => {
      const input = zeroForOne ? key.currency0 : key.currency1,
        output = zeroForOne ? key.currency1 : key.currency0;
      const data = encodeV4Swap(key, input, 123n, 999n);
      expect(data.slice(0, 10)).toBe("0x3593564c"); // execute(bytes,bytes[],uint256)
      const decoded = decodeFunctionData({ abi: routerAbi, data });
      expect(decoded.args![0]).toBe("0x10");
      expect(decoded.args![2]).toBe(999n);
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        decoded.args![1][0]!,
      );
      expect(actions).toBe("0x060c0f");
      expect(params).toHaveLength(3);
      const single = decodeAbiParameters(
        parseAbiParameters(
          "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
        ),
        params[0]!,
      )[0];
      expect(single.zeroForOne).toBe(zeroForOne);
      expect(single.amountIn).toBe(123n);
      expect(single.amountOutMinimum).toBe(0n);
      expect(single.hookData).toBe("0x");
      expect(single.poolKey.hooks.toLowerCase()).toBe(key.hooks);
      expect(
        decodeAbiParameters(parseAbiParameters("address,uint256"), params[1]!),
      ).toEqual([expect.stringMatching(new RegExp(input, "i")), 123n]);
      expect(
        decodeAbiParameters(parseAbiParameters("address,uint256"), params[2]!),
      ).toEqual([expect.stringMatching(new RegExp(output, "i")), 0n]);
    },
  );
  it.each([nativeCurrency, token])(
    "settles and takes the exact native pool currencies for input %s",
    (input) => {
      const nativeKey = {
        ...key,
        currency0: nativeCurrency,
        currency1: token,
        fee: 0x800000,
        tickSpacing: 8,
      };
      const decoded = decodeFunctionData({
        abi: routerAbi,
        data: encodeV4Swap(nativeKey, input, 123n, 999n),
      });
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        decoded.args![1][0]!,
      );
      expect(actions).toBe("0x060c0f");
      expect(
        decodeAbiParameters(parseAbiParameters("address,uint256"), params[1]!),
      ).toEqual([expect.stringMatching(new RegExp(input, "i")), 123n]);
      expect(
        decodeAbiParameters(parseAbiParameters("address,uint256"), params[2]!),
      ).toEqual([
        expect.stringMatching(
          new RegExp(input === nativeCurrency ? token : nativeCurrency, "i"),
        ),
        0n,
      ]);
      const single = decodeAbiParameters(
        parseAbiParameters(
          "((address,address,uint24,int24,address),bool,uint128,uint128,bytes)",
        ),
        params[0]!,
      )[0];
      expect(single[0][2]).toBe(0x800000);
      expect(single[1]).toBe(input === nativeCurrency);
    },
  );
  it("refuses uint128 overflow", () =>
    expect(() => encodeV4Swap(key, token, 2n ** 128n, 999n)).toThrow());
});

it("names the missing TTWO Chainlink source for the supplied Long pair before any simulation", async () => {
  const stock = "0x5e81213613b6b86eab4c6c50d718d34359459786";
  const asset = "0xbf7f8f15229d685e3092652ae04ee387133f1e18";
  const f = fixture();
  const document = async (url: string) =>
    url.endsWith("/assets")
      ? {
          assets: [
            {
              id: `0x${"ab".repeat(32)}`,
              tokenSymbol: "TTWO",
              tokenName: "Sample Stock Token",
              tokenDecimals: 18,
              currentMultiplier: "1",
              pendingMultiplier: "",
              deployments: [{ contractAddress: stock, chainId: 4663 }],
            },
          ],
        }
      : [];
  const key: PoolKey = {
    currency0: stock,
    currency1: asset,
    fee: 8388608,
    tickSpacing: 8,
    hooks: "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544",
  };
  const result = await runSellTest(
    f.reader,
    anchor,
    launch({
      adapter: "long",
      token: asset,
      pairToken: stock,
      poolId: keccak256(encodeAbiParameters(keyParameters, [key])),
      poolKey: key,
    }),
    (pair) =>
      stockPairUsdPrice(
        pair,
        document,
        f.reader.read.bind(f.reader),
        "0x3039",
        anchor.seconds,
      ),
  );
  expect(result.results).toHaveLength(9);
  expect(
    result.results.every((row) =>
      row.reason?.includes(
        "No USD price source for the pair token (TTWO has no Chainlink feed)",
      ),
    ),
  ).toBe(true);
  expect(f.seen.some((call) => call.method === "eth_simulateV1")).toBe(false);
});
