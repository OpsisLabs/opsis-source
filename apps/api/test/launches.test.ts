import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  decodeFunctionData,
  encodeFunctionResult,
  decodeAbiParameters,
  parseAbiParameters,
  encodeEventTopics,
  keccak256,
  recoverAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  canonicalize,
  verifyReceipt,
  sha256,
  canonicalBytes,
} from "@rh-chain/shared";
import {
  events,
  registry,
  related,
  topic,
  addressTopic,
  decodeLaunch,
  decode,
  type ChainLog,
  type AdapterId,
} from "../src/launches/registry.js";
import { buyerFacts, rules, type Transfer } from "../src/launches/facts.js";
import { LaunchCardsService } from "../src/launches/service.js";
import { ethUsdFeed, chainlinkAbi } from "../src/rwa/chainlink.js";
import { keyParameters } from "../src/launches/sell-test.js";
import { firstBlock, poolIdFor, stateView } from "../src/launches/state.js";
import { REVIEWED_ASSETS } from "@rh-chain/shared";
import {
  LaunchReader,
  hex,
  aggregateAbi,
  multicall3,
  ReadCap,
} from "../src/launches/reader.js";
import { createLaunchCardsBudget } from "../src/launches/budget.js";
import { launchRoutes } from "../src/routes/launches.js";
import { installOpsisPreviewGuard, opsisRoutes } from "../src/routes/opsis.js";
import { loadEnv } from "../src/config/env.js";
import { JsonCache } from "../src/cache/service.js";
import { AppError, installErrorHandler } from "../src/http/errors.js";
import { ReceiptService } from "../src/receipts/service.js";
import {
  RobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  jsonRpcUnits,
} from "../src/chain/robinhood-rpc.js";
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const token = addr(1),
  pair = addr(2),
  curve = addr(3),
  deployer = addr(4),
  buyer = addr(5),
  other = addr(6),
  signer = addr(7);
const base = Date.parse("2026-10-20T00:00:00.000Z") / 1000;
const seconds = (n: number) => base + Math.floor(n / 10);
const point = (n: number, index = 0) => ({
  blockNumber: n,
  blockHash: hash(n + 1),
  timestamp: new Date(seconds(n) * 1000).toISOString(),
  transactionHash: hash(n + 100_000),
  logIndex: index,
});
const env = (extra = {}) =>
  loadEnv({
    NODE_ENV: "test",
    OPSIS_WORKSPACES_ENABLED: "true",
    OPSIS_PUBLIC_ACCESS_ENABLED: "true",
    LAUNCH_CARDS_ENABLED: "true",
    LAUNCH_SELL_TEST_ENABLED: "true",
    ...extra,
  });
// encodeAbiParameters uses the same actual ABI shape as production decoding;
// expected fields and topic hashes below are independent assertions.
function log(
  event: keyof typeof events,
  args: Record<string, unknown>,
  n = 4800,
  index = 0,
  source?: string,
): ChainLog {
  const abi = events[event];
  const topics = encodeEventTopics({
    abi: [abi],
    eventName: abi.name,
    args,
  } as never) as [Hex, ...Hex[]];
  const inputs = abi.inputs.filter(
    (input) => !("indexed" in input && input.indexed),
  );
  const data = encodeAbiParameters(
    inputs,
    inputs.map((input) => args[input.name!]) as never,
  );
  return {
    address: (source ??
      (event in registry
        ? registry[event as AdapterId].address
        : token)) as `0x${string}`,
    topics,
    data,
    blockNumber: hex(n) as Hex,
    blockHash: hash(n + 1),
    transactionHash: hash(n + 100_000),
    transactionIndex: "0x0",
    logIndex: hex(index) as Hex,
  };
}
const pons = () =>
  log("pons", {
    token,
    curve,
    deployer,
    pairToken: pair,
    launchConfigId: 1n,
    graduationThreshold: 100n,
  });
const poolId = (hook = related.ponsHook) =>
  keccak256(
    encodeAbiParameters(keyParameters, [
      {
        currency0: token as Hex,
        currency1: pair as Hex,
        fee: 3000,
        tickSpacing: 60,
        hooks: hook as Hex,
      },
    ]),
  );
const initialize = (hook = related.ponsHook, n = 4830) =>
  log(
    "v4",
    {
      id: poolId(hook),
      currency0: token,
      currency1: pair,
      fee: 3000,
      tickSpacing: 60,
      hooks: hook,
      sqrtPriceX96: 1n << 96n,
      tick: 0,
    },
    n,
    0,
  );
const ponsKey = (asset = token) => ({
  currency0: addr(0) as Hex,
  currency1: asset as Hex,
  fee: 0,
  tickSpacing: 200,
  hooks: related.ponsHook,
});
const ponsLaunch = (asset = token, n = 4800) =>
  log(
    "pons",
    { ...decode(pons(), "pons"), token: asset, pairToken: addr(0) },
    n,
  );
const ponsInitialize = (asset = token, n = 4830, hook = related.ponsHook) => {
  const key = { ...ponsKey(asset), hooks: hook as Hex };
  return log(
    "v4",
    { ...key, id: poolIdFor(key), sqrtPriceX96: 1n << 96n, tick: 0 },
    n,
    1,
  );
};
const transfer = (
  to: string,
  n: number,
  index: number,
  from = curve,
  value = 10n,
) => log("transfer", { from, to, value }, n, index);
let fixtureNumber = 0;
function fixture(
  logs: ChainLog[] = [pons()],
  extra = {},
  anchor = 5100,
  logLimit = 2_000,
) {
  const config = env({
      LAUNCH_CARDS_CACHE_SECONDS: "0",
      ROBINHOOD_PUBLIC_RPC_URL: `https://rpc.fixture-${++fixtureNumber}.example`,
      ...extra,
    }),
    budget = { consume: vi.fn(async () => {}) };
  const seen: { method: string; params: unknown[] }[] = [];
  const signers = new Map<string, string>(),
    nonces = new Map<string, number>();
  let changed = false;
  const rpc = {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const { id, method, params } = JSON.parse(String(init?.body));
      if (!(init?.headers as Record<string, string>)?.["x-fixture-inner"])
        seen.push({ method, params });
      let result: unknown;
      if (method === "eth_chainId") result = "0x1237";
      else if (method === "eth_getBlockByNumber") {
        const n = params[0] === "latest" ? anchor : Number(BigInt(params[0]));
        result = {
          number: hex(n),
          hash: changed && n === anchor ? hash(99999) : hash(n + 1),
          timestamp: hex(seconds(n)),
        };
      } else if (method === "eth_getTransactionReceipt") {
        const entries = logs.filter((log) => log.transactionHash === params[0]);
        result = entries.length
          ? {
              transactionHash: params[0],
              blockNumber: entries[0]!.blockNumber,
              blockHash: entries[0]!.blockHash,
              logs: entries,
            }
          : null;
      } else if (method === "eth_getLogs") {
        const f = params[0];
        if (
          Number(BigInt(f.toBlock)) - Number(BigInt(f.fromBlock)) + 1 >
          logLimit
        )
          return {
            id,
            error:
              logLimit === 100_000
                ? {
                    code: 22,
                    message:
                      "eth_getLogs range over 100000 blocks is not supported on robinhood, request a narrower fromBlock/toBlock range",
                  }
                : { code: -32602, message: "exceed block range" },
          };
        result = logs.filter(
          (l) =>
            (Array.isArray(f.address) ? f.address : [f.address]).some(
              (a: string) => l.address.toLowerCase() === a.toLowerCase(),
            ) &&
            Number(BigInt(l.blockNumber)) >= Number(BigInt(f.fromBlock)) &&
            Number(BigInt(l.blockNumber)) <= Number(BigInt(f.toBlock)) &&
            f.topics.every(
              (t: unknown, i: number) =>
                t === null ||
                (Array.isArray(t)
                  ? t.includes(l.topics[i])
                  : t === l.topics[i]),
            ),
        );
      } else if (method === "eth_getTransactionByHash") {
        const n = Number(BigInt(params[0])) - 100_000;
        result = {
          hash: params[0],
          from: signers.get(params[0]) ?? buyer,
          blockNumber: hex(n),
          blockHash: hash(n + 1),
        };
      } else if (method === "eth_getTransactionCount")
        result = hex(nonces.get(params[0]) ?? 1);
      else if (method === "eth_getCode") {
        const n = Number(BigInt(params[1]));
        const found = logs
          .filter((log) =>
            [
              topic("pons"),
              topic("long"),
              topic("launcher"),
              topic("instant"),
              topic("v3"),
            ].includes(log.topics[0]),
          )
          .find((log) => {
            const id = Object.keys(registry).find(
              (id) => registry[id as AdapterId].address === log.address,
            );
            if (!id) return false;
            const a = decode(log, id as AdapterId);
            return [a.token, a.asset, a.pool].some(
              (v) => String(v).toLowerCase() === params[0],
            );
          });
        result =
          found && n < Number(BigInt(found.blockNumber)) ? "0x" : "0x1234";
      } else if (method === "eth_call") {
        if (params[0].to.toLowerCase() === multicall3.toLowerCase()) {
          const entries = decodeFunctionData({
            abi: aggregateAbi,
            data: params[0].data,
          }).args[0];
          const results = [];
          for (const entry of entries) {
            const response = (await rpc.requestJson(_url, {
              headers: { "x-fixture-inner": "1" },
              body: JSON.stringify({
                id,
                method: "eth_call",
                params: [
                  { to: entry.target.toLowerCase(), data: entry.callData },
                  params[1],
                ],
              }),
            })) as any;
            results.push({
              success: !response.error,
              returnData: response.result ?? "0x",
            });
          }
          result = encodeFunctionResult({
            abi: aggregateAbi,
            functionName: "aggregate3",
            result: results,
          });
        } else if (
          params[0].data === "0x1a686502" ||
          (params[0].to === stateView &&
            params[0].data.startsWith("0xfa6793d5"))
        ) {
          const id =
            params[0].to === stateView ? `0x${params[0].data.slice(10)}` : null;
          const add = logs.find(
            (log) =>
              (id
                ? log.topics[0] === topic("v4Liquidity") && log.topics[1] === id
                : log.address === params[0].to &&
                  log.topics[0] === topic("v3Mint")) &&
              BigInt(
                String(
                  decode(log, id ? "v4Liquidity" : "v3Mint")[
                    id ? "liquidityDelta" : "amount"
                  ],
                ),
              ) > 0n,
          );
          result = hash(
            add && Number(BigInt(add.blockNumber)) <= Number(BigInt(params[1]))
              ? 1
              : 0,
          );
        } else if (params[0].to === stateView) {
          const id = `0x${params[0].data.slice(10)}`;
          const init = logs.find(
            (log) => log.topics[0] === topic("v4") && log.topics[1] === id,
          );
          const exists =
            init &&
            Number(BigInt(init.blockNumber)) <= Number(BigInt(params[1]));
          result = encodeAbiParameters(
            parseAbiParameters("uint160, int24, uint24, uint24"),
            [exists ? 1n << 96n : 0n, 0, 0, 0],
          );
        } else if (params[0].to === registry.v3.address) {
          const [a, b, fee] = decodeAbiParameters(
            parseAbiParameters("address, address, uint24"),
            `0x${params[0].data.slice(10)}`,
          );
          const init = logs.find(
            (log) =>
              log.topics[0] === topic("v3") &&
              (() => {
                const v = decode(log, "v3");
                return (
                  [v.token0, v.token1]
                    .map(String)
                    .map((v) => v.toLowerCase())
                    .includes(a.toLowerCase()) &&
                  [v.token0, v.token1]
                    .map(String)
                    .map((v) => v.toLowerCase())
                    .includes(b.toLowerCase()) &&
                  Number(v.fee) === fee
                );
              })(),
          );
          result = addressTopic(
            init ? String(decode(init, "v3").pool) : addr(0),
          );
        } else result = hash(params[0].data === "0x18160ddd" ? 1000 : 10);
      } else if (method === "eth_getStorageAt") result = addressTopic(addr(9));
      else throw new Error(`Unexpected method ${method}`);
      return { jsonrpc: "2.0", id, result };
    }),
  };
  const explorerHttp = {
    requestJson: vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/transactions"))
        return {
          items: logs
            .filter((log) =>
              [topic("pons"), topic("long")].includes(log.topics[0]),
            )
            .map((log) => ({
              hash: log.transactionHash,
              from: { hash: deployer },
              to: { hash: log.address },
              raw_input: "0x",
            })),
          next_page_params: null,
        };
      const address = path.split("/").at(-1);
      const found = logs.find((log) => {
        const id = Object.keys(registry).find(
          (id) => registry[id as AdapterId].address === log.address,
        );
        if (!id) return false;
        const a = decode(log, id as AdapterId);
        return [
          a.token,
          a.asset,
          a.token0,
          a.token1,
          a.currency0,
          a.currency1,
        ].some((v) => String(v).toLowerCase() === address);
      });
      return { creation_tx_hash: found?.transactionHash ?? null };
    }),
  };
  const now = () => seconds(anchor) * 1000;
  const cache = new JsonCache();
  const service = new LaunchCardsService(config, cache, {
    budget,
    rpc,
    now,
    explorerHttp,
    stockHttp: { requestJson: vi.fn(async () => ({ assets: [] })) },
  });
  return {
    service,
    explorerHttp,
    config,
    rpc,
    budget,
    seen,
    signers,
    nonces,
    now,
    cache,
    change: () => {
      changed = true;
    },
  };
}

describe("reviewed launch adapters", () => {
  it.each([
    [
      "pons",
      "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607",
    ],
    [
      "graduation",
      "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259",
    ],
    [
      "long",
      "0xadc6f1f726f7c710f77ec06adc75f3bb964e5be19581b072c67f7b9b4039267b",
    ],
    [
      "launcher",
      "0x2e2b3f61b70d2d131b2a807371103cc98d51adcaa5e9a8f9c32658ad8426e74e",
    ],
    [
      "instant",
      "0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4",
    ],
    [
      "v3",
      "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
    ],
    [
      "v4",
      "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438",
    ],
  ])("computes %s topic0 from its ABI", (id, expected) => {
    expect(topic(id as keyof typeof events)).toBe(expected);
  });
  it("decodes Pons and refuses unregistered/removed events", () => {
    expect(decodeLaunch("pons", pons(), point(4800))).toMatchObject({
      token,
      deployer,
      curve,
      pairToken: pair,
      t0: point(4800),
      confirmation: "unconfirmed by the launchpad",
    });
    expect(() =>
      decodeLaunch("pons", { ...pons(), address: addr(8) as Hex }, point(4800)),
    ).toThrow();
    expect(() =>
      decodeLaunch("pons", { ...pons(), removed: true }, point(4800)),
    ).toThrow();
  });
  it("decodes Long including its non-indexed launcher and history factory", () => {
    const l = log("long", {
      poolOrHook: curve,
      asset: token,
      numeraire: pair,
      poolInitializer: addr(8),
      launcher: deployer,
      tickerKey: hash(1),
      deployedAt: 100,
      reservedUntil: 200,
      normalizedTicker: "DEMO",
    });
    expect(decodeLaunch("long", l, point(4800))).toMatchObject({
      token,
      deployer,
      hook: curve,
      pairToken: pair,
      t0: point(4800),
    });
    expect(
      decodeLaunch("long", { ...l, address: related.longHistory }, point(4800))
        .factory,
    ).toBe(related.longHistory);
  });
  it("decodes shared launcher without inventing its frontend or T0", () => {
    expect(
      decodeLaunch("launcher", log("launcher", { token }), point(4800)),
    ).toMatchObject({
      token,
      launchpad: "Uniswap Liquidity Launcher (includes pools.trade)",
      deployer: null,
      t0: null,
    });
  });
  it("decodes Instant Launch's tuple and recipient", () => {
    const l = log("instant", {
      poolId: hash(99),
      token,
      finalPositionRecipient: deployer,
      key: {
        currency0: token,
        currency1: pair,
        fee: 3000,
        tickSpacing: 60,
        hooks: curve,
      },
    });
    expect(decodeLaunch("instant", l, point(4800))).toMatchObject({
      token,
      pairToken: pair,
      finalPositionRecipient: deployer,
      poolId: hash(99),
      t0: point(4800),
    });
  });
  it("decodes either side of direct v3 and v4 pools without creation-time T0", () => {
    const l = log("v3", {
      token0: pair,
      token1: token,
      fee: 3000,
      tickSpacing: 60,
      pool: curve,
    });
    expect(decodeLaunch("v3", l, point(4800), token)).toMatchObject({
      token,
      pairToken: pair,
      pool: curve,
      t0: null,
    });
    expect(decodeLaunch("v4", initialize(), point(4830), pair)).toMatchObject({
      token: pair,
      pairToken: token,
      poolId: poolId(),
      t0: null,
    });
  });
  it("decodes standard liquidity and Swap events", () => {
    expect(
      decode(
        log(
          "v4Swap",
          {
            id: hash(99),
            sender: buyer,
            amount0: -10n,
            amount1: 20n,
            sqrtPriceX96: 1n,
            liquidity: 20n,
            tick: 0,
            fee: 3000,
          },
          4800,
          0,
          registry.v4.address,
        ),
        "v4Swap",
      ),
    ).toMatchObject({ amount0: -10n });
  });
});

describe("timestamp and signer rules", () => {
  const row = (to: string, timestamp = 100, from = curve): Transfer => ({
    from,
    to,
    value: 10n,
    transactionHash: hash(1),
    blockNumber: 100,
    timestamp,
  });
  it("includes exactly ten seconds and excludes outside both boundaries", () => {
    for (const [time, count] of [
      [99, 0],
      [100, 1],
      [110, 1],
      [111, 0],
    ])
      expect(
        buyerFacts(
          [row(buyer, time)],
          curve,
          100,
          new Map([[hash(1), buyer]]),
          new Map(),
        ).tags,
      ).toHaveLength(count);
  });
  it("inbound-only dusting never tags a recipient", () => {
    expect(
      buyerFacts(
        [row(other)],
        curve,
        100,
        new Map([[hash(1), signer]]),
        new Map(),
      ).tags,
    ).toEqual([]);
    expect(
      buyerFacts(
        [row(buyer, 100, deployer)],
        curve,
        100,
        new Map([[hash(1), buyer]]),
        new Map(),
      ).tags,
    ).toEqual([]);
  });
  it("multi-buy tags only the signer and aggregates distinct recipients and amounts", () => {
    const facts = buyerFacts(
      [row(buyer), row(other), row(other)],
      curve,
      100,
      new Map([[hash(1), signer]]),
      new Map(),
    );
    expect(facts.tags).toEqual([
      {
        wallet: signer,
        kind: "same-tx multi-buy",
        rule: rules.multi,
        transactionHash: hash(1),
        recipientCount: 2,
      },
    ]);
    expect(facts.transactions[0]).toMatchObject({
      recipients: [buyer, other],
      deliveredRaw: "30",
    });
  });
  it.each([0, 1, 2, 10, undefined])(
    "nonce %s qualifies only at zero or one",
    (nonce) => {
      const facts = buyerFacts(
        [row(buyer)],
        curve,
        100,
        new Map([[hash(1), buyer]]),
        nonce === undefined ? new Map() : new Map([[hash(1), nonce]]),
      );
      expect(facts.tags.some((tag) => tag.kind === "new wallet")).toBe(
        nonce === 0 || nonce === 1,
      );
      expect(
        facts.tags.every(
          (tag) => tag.rule.version === "v1" && tag.rule.text.length > 20,
        ),
      ).toBe(true);
    },
  );
});

describe("bounded launch cards", () => {
  it("joins signers and prior-block nonces, anchors tag balances and reuses separate permissions", async () => {
    const f = fixture([
      pons(),
      transfer(buyer, 4900, 1),
      transfer(other, 4910, 1),
      transfer(other, 4805, 1, deployer),
    ]);
    const card = (await f.service.card(token)) as any;
    expect(card.buyers.state).toBe("available");
    expect(card.buyers.value.windows[0].tags.map((t: any) => t.kind)).toEqual([
      "early buyer",
      "new wallet",
    ]);
    expect(card.supplyByTag.value.byTag[0]).toMatchObject({
      balanceRaw: "10",
      supplyShare: { value: { numerator: "10", denominator: "1000" } },
    });
    expect(card.permissions.value.readings.owner).toMatchObject({
      state: "observed",
    });
    expect(card.permissions.value.readings.admin).toMatchObject({
      state: "observed",
      value: addr(9),
    });
    expect(card.deployerDistributions.value).toHaveLength(1);
    expect(card.deployerDistributions.state).toBe("partial"); // 24-hour window still open
    expect(
      f.seen.filter((c) => c.method === "eth_getTransactionCount")[0].params,
    ).toEqual([buyer, hex(4899)]);
    expect(
      f.seen
        .filter((c) => c.method === "eth_getLogs")
        .every(
          (c: any) =>
            Number(BigInt(c.params[0].toBlock)) -
              Number(BigInt(c.params[0].fromBlock)) <
            10_000_000,
        ),
    ).toBe(true);
    expect(card.coverage.rpcCalls).toBe(f.seen.length);
    expect(card.disclaimer).toBe("Not investment advice");
  });
  it("shows Pons state-located graduation and ignores hookless copies", async () => {
    const graduation = log(
      "graduation",
      { token, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
      4830,
      0,
      registry.pons.address,
    );
    const f = fixture([
      ponsLaunch(),
      graduation,
      ponsInitialize(token, 4825, addr(0)),
      ponsInitialize(),
    ]);
    const card = (await f.service.card(token)) as any;
    expect(card.launch.value.t0.blockNumber).toBe(4800);
    expect(card.lpStatus.value.graduation.value).toMatchObject({
      positionId: "55",
      point: { blockNumber: 4830 },
    });
    expect(card.lpStatus.value.initialize.value.blockNumber).toBe(4830);
    expect(card.lpStatus.value.poolTradingStart.value.blockNumber).toBe(4830);
    expect(card.lpStatus.value.lock.state).toBe("unknown");
    expect(card.buyers.value.windows).toHaveLength(2);
  });
  it.each(["v3", "v4"])(
    "keeps direct %s observations separate from registry launch facts",
    async (id) => {
      const created =
        id === "v3"
          ? log("v3", {
              token0: token,
              token1: pair,
              fee: 3000,
              tickSpacing: 60,
              pool: curve,
            })
          : initialize(addr(0), 4800);
      const liquidity =
        id === "v3"
          ? log(
              "v3Mint",
              {
                sender: buyer,
                owner: buyer,
                tickLower: -60,
                tickUpper: 60,
                amount: 1n,
                amount0: 10n,
                amount1: 10n,
              },
              4800,
              1,
              curve,
            )
          : log(
              "v4Liquidity",
              {
                id: poolId(addr(0)),
                sender: buyer,
                tickLower: -60,
                tickUpper: 60,
                liquidityDelta: 1n,
                salt: hash(0),
              },
              4800,
              1,
              registry.v4.address,
            );
      const card = (await fixture([created, liquidity]).service.card(
        token,
      )) as any;
      expect(card.launch).toMatchObject({
        state: "unknown",
        reason: "Launch not found in the supported registry",
      });
      expect(
        card.directPools.value.pools.every((p: any) => p.t0 === null),
      ).toBe(true);
    },
  );
  it("keeps direct T0 unknown without positive liquidity", async () => {
    const card = (await fixture([initialize(addr(0), 4800)]).service.card(
      token,
    )) as any;
    expect(card.launch.state).toBe("unknown");
    expect(card.buyers.state).toBe("unknown");
  });
  it.each([addr(0), "0x000000000000000000000000000000000000dead", deployer])(
    "records Instant Launch recipient %s",
    async (recipient) => {
      const instant = log("instant", {
        poolId: hash(99),
        token,
        finalPositionRecipient: recipient,
        key: {
          currency0: token,
          currency1: pair,
          fee: 3000,
          tickSpacing: 60,
          hooks: curve,
        },
      });
      const card = (await fixture([instant]).service.card(token)) as any;
      expect(card.launch.value.t0.blockNumber).toBe(4800);
      expect(card.lpStatus.value.recipientKind).toBe(
        recipient === deployer ? "contract" : "burn address",
      );
    },
  );
  it("returns earlier same-deployer launches using indexed Pons topics", async () => {
    const earlier = log(
      "pons",
      {
        token: addr(20),
        curve,
        deployer,
        pairToken: pair,
        launchConfigId: 1n,
        graduationThreshold: 100n,
      },
      4700,
    );
    const unrelated = log(
      "pons",
      {
        token: addr(21),
        curve,
        deployer: other,
        pairToken: pair,
        launchConfigId: 1n,
        graduationThreshold: 100n,
      },
      4690,
    );
    const f = fixture([pons(), earlier, unrelated]);
    const card = (await f.service.card(token)) as any;
    expect(card.deployerHistory.value.count).toBe(1);
    expect(card.deployerHistory.value.launches[0].token).toBe(addr(20));
    expect(card.deployerHistory.value.liquidityHistory.state).toBe("unknown");
    expect(
      f.explorerHttp.requestJson.mock.calls.some(([url]) =>
        url.includes(`/addresses/${deployer}/transactions`),
      ),
    ).toBe(true);
    expect(
      f.seen.some(
        (c: any) =>
          c.method === "eth_getLogs" &&
          c.params[0].topics[3] === addressTopic(deployer),
      ),
    ).toBe(false);
  });
  it("reports unknown graduation independently of receipt discovery", async () => {
    const created = log(
      "pons",
      {
        token,
        curve,
        deployer,
        pairToken: pair,
        launchConfigId: 1n,
        graduationThreshold: 100n,
      },
      99000,
    );
    const card = (await fixture(
      [created],
      { LAUNCH_LOG_WINDOW_BLOCKS: "2000" },
      100000,
    ).service.card(token)) as any;
    expect(card.launch.state).toBe("partial");
    expect(card.deployerHistory.state).toBe("available");
    expect(card.launch.coverage.method).toBe("creation-receipt");
    expect(card.launch.value.unknownReasons.graduation).toBe(
      "GRADUATION_UNKNOWN",
    );
  });
  it("refuses a changed final anchor", async () => {
    const f = fixture();
    let anchors = 0;
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const { method, params } = JSON.parse(String(init?.body));
      if (
        method === "eth_getBlockByNumber" &&
        params[0] === hex(5100) &&
        ++anchors >= 1
      )
        f.change();
      return original(url, init);
    });
    await expect(f.service.card(token)).rejects.toMatchObject({
      code: "LAUNCH_CARDS_UNAVAILABLE",
    });
  });
  it("receipts include every actual RPC read including controls and final recheck", async () => {
    const f = fixture();
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const keys = [
      {
        address: account.address,
        validFrom: "2026-10-19T00:00:00.000Z",
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
      f.now,
    );
    const service = new LaunchCardsService(
      { ...f.config, RECEIPTS_ENABLED: true },
      f.cache,
      {
        rpc: f.rpc,
        budget: f.budget,
        now: f.now,
        receipts,
        explorerHttp: f.explorerHttp,
      },
    );
    const card = (await service.card(token)) as any;
    expect(card.receipt.rpcCalls).toHaveLength(f.seen.length);
    expect(card.receipt.sources).toHaveLength(
      f.seen.length + f.explorerHttp.requestJson.mock.calls.length,
    );
    expect(new Set(card.receipt.sources.map((s: any) => s.id)).size).toBe(
      f.seen.length + f.explorerHttp.requestJson.mock.calls.length,
    );
    expect(card.receipt.rpcCalls.at(-1).method).toBe("eth_getBlockByNumber");
    expect(
      (
        await verifyReceipt(canonicalize(card.receipt), keys, {
          keccak256,
          recoverAddress,
        })
      ).valid,
    ).toBe(true);
  });
});

describe("recent feed, cache and guards", () => {
  it("caches and coalesces concurrent requests, newest first", async () => {
    const f = fixture([pons(), log("launcher", { token: other }, 4990)]);
    const [a, b] = await Promise.all([f.service.feed(), f.service.feed()]);
    expect(a).toEqual(b);
    const count = f.seen.length;
    expect(await f.service.feed()).toEqual(a);
    expect(f.seen).toHaveLength(count);
    expect((a as any).entries[0].token).toBe(other);
    expect(
      f.seen.filter(
        (c: any) =>
          c.method === "eth_getBlockByNumber" && c.params[0] === "latest",
      ),
    ).toHaveLength(1);
  });
  it("expires the feed and separates windows", async () => {
    const f = fixture();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await f.service.feed();
      const count = f.seen.length;
      vi.advanceTimersByTime(60_001);
      await f.service.feed();
      expect(f.seen.length).toBeGreaterThan(count);
      const next = f.seen.length;
      await f.service.feed(60);
      expect(f.seen.length).toBeGreaterThan(next);
    } finally {
      vi.useRealTimers();
    }
  });
  it("feed scan cap produces explicit per-adapter partial coverage", async () => {
    const f = fixture([], { LAUNCH_CARDS_FEED_MAX_RPC_SUBCALLS: "40" }, 100000);
    const result = (await f.service.feed(60)) as any;
    expect(result.coverage.state).toBe("partial");
    expect(result.coverage.rpcCalls).toBeLessThanOrEqual(40);
  });
  it("defaults off and 404s before validation or any reads", async () => {
    expect(loadEnv({ NODE_ENV: "test" }).LAUNCH_CARDS_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: "test" }).LAUNCH_SELL_TEST_ENABLED).toBe(false);
    for (const override of [
      { LAUNCH_CARDS_ENABLED: false },
      { PRIVATE_MODE_ENABLED: false },
      { OPSIS_WORKSPACES_ENABLED: false },
    ]) {
      const f = fixture();
      const app = Fastify();
      installErrorHandler(app);
      await launchRoutes(app, { ...f.config, ...override }, f.service);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/private/opsis/launches?minutes=bad",
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/private/opsis/launches/bad",
          })
        ).statusCode,
      ).toBe(404);
      expect(f.seen).toHaveLength(0);
      await app.close();
    }
  });
  it("protects private routes and publishes capability parity", async () => {
    const f = fixture();
    const config = { ...f.config, OPSIS_PUBLIC_ACCESS_ENABLED: false };
    const app = Fastify();
    installErrorHandler(app);
    installOpsisPreviewGuard(app, config);
    await launchRoutes(app, config, f.service);
    await opsisRoutes(app, config);
    expect(
      (await app.inject({ method: "GET", url: "/v1/private/opsis/launches" }))
        .statusCode,
    ).toBe(404);
    expect(f.seen).toHaveLength(0);
    await app.close();
    const publicApp = Fastify();
    await opsisRoutes(publicApp, f.config);
    const body = (
      await publicApp.inject({
        method: "POST",
        url: "/v1/private/opsis/access",
      })
    ).json();
    expect(body.launchCards).toBe(true);
    expect(
      body.manifest.capabilities.find((c: any) => c.id === "launchCards")
        .enabled,
    ).toBe(true);
    await publicApp.close();
  });
  it("validates bounds and enforces a shared per-visitor hourly limit", async () => {
    const f = fixture();
    const source = {
      card: vi.fn(async () => ({ disclaimer: "Not investment advice" })),
      feed: vi.fn(async () => ({})),
    };
    const app = Fastify();
    installErrorHandler(app);
    await app.register(rateLimit, { global: false });
    await launchRoutes(
      app,
      { ...f.config, RATE_LIMIT_LAUNCH_CARDS_PER_HOUR: 1 },
      source,
    );
    expect(
      (await app.inject({ method: "GET", url: "/v1/private/opsis/launches" }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/private/opsis/launches/${token}`,
        })
      ).statusCode,
    ).toBe(429);
    await app.close();
    const validation = Fastify();
    installErrorHandler(validation);
    await launchRoutes(validation, f.config, source);
    for (const url of [
      "/v1/private/opsis/launches?minutes=121",
      "/v1/private/opsis/launches?minutes=0",
      "/v1/private/opsis/launches/bad",
    ])
      expect((await validation.inject({ method: "GET", url })).statusCode).toBe(
        400,
      );
    await validation.close();
  });
  it("charges nonce RPC in the shared spend fuse and fails closed on daily budget", async () => {
    expect(
      jsonRpcUnits(JSON.stringify({ method: "eth_getTransactionCount" })),
    ).toBe(20);
    const f = fixture();
    const reserve = vi.fn(async () => {});
    const transport = new RobinhoodRpcHttp(
      robinhoodRpcEndpoint(f.config),
      f.rpc,
      { reserve },
    );
    const r = new LaunchReader(f.config, f.budget, 40, f.now, transport);
    await r.read("eth_getTransactionCount", [buyer, "0x1"]);
    expect(reserve).toHaveBeenCalledWith(20);
    const budget = createLaunchCardsBudget({
      ...f.config,
      LAUNCH_CARDS_DAILY_RPC_UNIT_BUDGET: 100,
    });
    await budget.consume(100);
    await expect(budget.consume(1)).rejects.toMatchObject({
      code: "LAUNCH_CARDS_DAILY_BUDGET_EXCEEDED",
    });
    await expect(
      createLaunchCardsBudget({ ...f.config, NODE_ENV: "production" }).consume(
        1,
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_CARDS_BUDGET_UNAVAILABLE" });
  });
});

describe("launch failure states and bounded detail", () => {
  it("caps transaction joins and marks retained buyer facts partial", async () => {
    const f = fixture([
      pons(),
      ...Array.from({ length: 33 }, (_, i) => transfer(buyer, 4800 + i, 1)),
    ]);
    const card = (await f.service.card(token)) as any;
    expect(card.buyers.state).toBe("partial");
    expect(card.buyers.coverage.nonceReads).toBe(25);
    expect(
      card.buyers.value.windows[0].tags.filter(
        (t: any) => t.kind === "early buyer",
      ),
    ).toHaveLength(25);
    expect(
      card.buyers.value.windows[0].tags.filter(
        (t: any) => t.kind === "new wallet",
      ),
    ).toHaveLength(25);
  });
  it("API multi-buy tags the signer and reports recipient balances without tagging recipients", async () => {
    const f = fixture([
      pons(),
      transfer(buyer, 4850, 1),
      transfer(other, 4850, 2),
    ]);
    f.signers.set(hash(104850), signer);
    const card = (await f.service.card(token)) as any;
    expect(
      card.buyers.value.windows[0].tags.map((tag: any) => tag.wallet),
    ).toEqual([signer]);
    expect(card.supplyByTag.value.transactions[0].supplyShare.value).toEqual({
      numerator: "20",
      denominator: "1000",
    });
    expect(
      card.supplyByTag.value.byTag.find((row: any) => row.tag === "early buyer")
        .wallets,
    ).toEqual([]);
  });
  it("keeps reverted balances unknown rather than reporting zero", async () => {
    const f = fixture([pons(), transfer(buyer, 4850, 1)]);
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (
        call.method === "eth_call" &&
        call.params[0].data.startsWith("0x70a08231")
      )
        return { id: call.id, error: { code: 3 } };
      return original(url, init);
    });
    const card = (await f.service.card(token)) as any;
    expect(card.supplyByTag.state).toBe("partial");
    expect(card.supplyByTag.value.byTag[0].balanceRaw).toBeNull();
    expect(card.supplyByTag.value.byTag[0].supplyShare.state).toBe("unknown");
  });
  it("shows zero ownership and a set proxy admin separately", async () => {
    const f = fixture();
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_call" && call.params[0].data === "0x8da5cb5b")
        return { id: call.id, result: hash(0) };
      return original(url, init);
    });
    const card = (await f.service.card(token)) as any;
    expect(card.permissions.value.readings.owner.value).toBe(addr(0));
    expect(card.permissions.value.readings.admin.value).toBe(addr(9));
  });
  it("joins Long to its launch-transaction pool and scans both factory histories", async () => {
    const make = (asset: string, n: number, source = registry.long.address) =>
      log(
        "long",
        {
          poolOrHook: curve,
          asset,
          numeraire: pair,
          poolInitializer: addr(8),
          launcher: deployer,
          tickerKey: hash(1),
          deployedAt: 100,
          reservedUntil: 200,
          normalizedTicker: "DEMO",
        },
        n,
        1,
        source,
      );
    const f = fixture([
      make(token, 4800),
      initialize(curve, 4800),
      make(other, 4700, related.longHistory),
    ]);
    const card = (await f.service.card(token)) as any;
    expect(card.launch.value.t0.blockNumber).toBe(4800);
    expect(card.buyers.value.windows[0].liquiditySource).toBe(
      registry.v4.address,
    );
    expect(card.deployerHistory.value.launches[0]).toMatchObject({
      token: other,
      factory: related.longHistory,
    });
    expect(card.lpStatus.state).toBe("unknown");
  });
  it("classifies an empty-code Instant Launch recipient as EOA at the anchor", async () => {
    const instant = log("instant", {
      poolId: hash(99),
      token,
      finalPositionRecipient: deployer,
      key: {
        currency0: token,
        currency1: pair,
        fee: 3000,
        tickSpacing: 60,
        hooks: curve,
      },
    });
    const f = fixture([instant]);
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_getCode" && call.params[0] === deployer)
        return { id: call.id, result: "0x" };
      return original(url, init);
    });
    expect(
      ((await f.service.card(token)) as any).lpStatus.value.recipientKind,
    ).toBe("EOA");
  });
  it("coalesces a failed feed, clears pending state and never caches the failure", async () => {
    const f = fixture();
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementationOnce(async () => {
      throw new Error("synthetic outage");
    });
    const results = await Promise.allSettled([
      f.service.feed(),
      f.service.feed(),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(f.seen).toHaveLength(0);
    f.rpc.requestJson.mockImplementation(original);
    expect(await f.service.feed()).toHaveProperty("entries");
  });
  it("direct service feature gates do no provider or daily-budget work", async () => {
    const f = fixture([], { LAUNCH_CARDS_ENABLED: "false" });
    await expect(f.service.card(token)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(f.service.feed()).rejects.toMatchObject({ statusCode: 404 });
    expect(f.rpc.requestJson).not.toHaveBeenCalled();
    expect(f.budget.consume).not.toHaveBeenCalled();
  });
  it("range log cap retains explicit partial coverage", async () => {
    const f = fixture(
      Array.from({ length: 257 }, (_, i) => transfer(buyer, 4850, i)),
    );
    const r = new LaunchReader(f.config, f.budget, 40, f.now, f.rpc);
    const scan = await r.range(token, [topic("transfer")], 4800, 4900, 1);
    expect(scan.partial).toBe(true);
    expect(scan.logs).toHaveLength(256);
    expect(scan.coverage).toMatchObject({
      logCap: 256,
      logCount: 256,
      logCapped: true,
    });
  });
});

it("always includes the launchCards manifest row while off", async () => {
  const config = env({ LAUNCH_CARDS_ENABLED: "false" });
  const app = Fastify();
  await opsisRoutes(app, config);
  const body = (
    await app.inject({ method: "POST", url: "/v1/private/opsis/access" })
  ).json();
  expect(body.launchCards).toBe(false);
  expect(
    body.manifest.capabilities.some(
      (row: { id: string }) => row.id === "launchCards",
    ),
  ).toBe(true);
  await app.close();
});

describe("receipt and bounded direct-pool discovery", () => {
  const long = (asset = token, numeraire = pair, n = 4800) =>
    log(
      "long",
      {
        poolOrHook: curve,
        asset,
        numeraire,
        poolInitializer: addr(8),
        launcher: deployer,
        tickerKey: hash(1),
        deployedAt: 100,
        reservedUntil: 200,
        normalizedTicker: "DEMO",
      },
      n,
      1,
    );
  const created = (id: AdapterId, side = 0) => {
    if (id === "pons") return pons();
    if (id === "long") return long();
    if (id === "launcher") return log("launcher", { token });
    if (id === "instant")
      return log("instant", {
        poolId: poolId(curve),
        token,
        finalPositionRecipient: deployer,
        key: {
          currency0: token,
          currency1: pair,
          fee: 3000,
          tickSpacing: 60,
          hooks: curve,
        },
      });
    if (id === "v4") return initialize(addr(0), 4800);
    return log("v3", {
      token0: token,
      token1: pair,
      fee: 3000,
      tickSpacing: 60,
      pool: curve,
    });
  };
  it.each([
    ["pons", 0],
    ["long", 0],
    ["launcher", 0],
    ["instant", 0],
    ["v3", 0],
    ["v3", 1],
    ["v4", 0],
    ["v4", 1],
  ] as const)(
    "finds an older %s launch on currency side %s without wide logs",
    async (id, side) => {
      const selected = (id === "v4" || id === "v3") && side ? pair : token;
      const f = fixture([created(id, side)], {}, 129800);
      const card = (await f.service.card(selected)) as any;
      if (["v3", "v4"].includes(id))
        expect(card.launch).toMatchObject({
          state: "unknown",
          reason: "Launch not found in the supported registry",
        });
      else
        expect(card.launch.value).toMatchObject({
          adapter: id,
          token: selected,
          created: { blockNumber: 4800 },
        });
      const calls = f.seen
        .filter((c) => c.method === "eth_getLogs")
        .map((c) => c.params[0] as any);
      expect(
        calls.every(
          (c) => Number(BigInt(c.toBlock)) - Number(BigInt(c.fromBlock)) < 2000,
        ),
      ).toBe(true);
      expect(f.seen.some((c) => c.method === "eth_getTransactionReceipt")).toBe(
        true,
      );
      if (!["v3", "v4"].includes(id))
        expect(calls.some((c) => c.topics[0] === topic(id))).toBe(false);
      expect(card.coverage.rpcCalls).toBe(f.seen.length);
      expect(card.coverage.rpcCalls).toBeLessThanOrEqual(
        f.config.LAUNCH_CARDS_MAX_RPC_SUBCALLS,
      );
    },
  );
  it.each(["pons", "long", "launcher", "instant"] as const)(
    "discovers %s from its creation receipt on the dRPC-capped mock",
    async (id) => {
      const f = fixture([created(id)], {}, 129800, 100_000);
      const card = (await f.service.card(token)) as any;
      expect(card.launch.value.adapter).toBe(id);
      expect(card.coverage.discovery.method).toBe("creation-receipt");
      expect(f.seen.some((c) => c.method === "eth_getTransactionReceipt")).toBe(
        true,
      );
      expect(
        f.seen
          .filter((c) => c.method === "eth_getLogs")
          .every((c) => {
            const q = c.params[0] as any;
            return (
              Number(BigInt(q.toBlock)) - Number(BigInt(q.fromBlock)) + 1 <=
              100_000
            );
          }),
      ).toBe(true);
    },
  );
  it("does not search direct-pool creation or first liquidity", async () => {
    const createdPool = created("v3");
    const mint = log(
      "v3Mint",
      {
        sender: buyer,
        owner: buyer,
        tickLower: -60,
        tickUpper: 60,
        amount: 1n,
        amount0: 1n,
        amount1: 1n,
      },
      4820,
      0,
      curve,
    );
    const f = fixture([createdPool, mint], {}, 5100, 100_000);
    const card = (await f.service.card(token)) as any;
    expect(card.launch).toMatchObject({
      state: "unknown",
      reason: "Launch not found in the supported registry",
    });
    expect(
      f.seen.some(
        (c) =>
          c.method === "eth_getLogs" &&
          (c.params[0] as any).topics[0] === topic("v3Mint"),
      ),
    ).toBe(false);
    expect(f.seen.filter((c) => c.method === "eth_getCode")).toHaveLength(1); // token controls only
  });
  it.each([false, true])(
    "falls back to archive code search (explorer unavailable: %s), caches creation without expiry",
    async (unavailable) => {
      const f = fixture([pons()], {}, 129800);
      if (unavailable)
        f.explorerHttp.requestJson.mockRejectedValue(
          new Error("offline fixture"),
        );
      else
        f.explorerHttp.requestJson.mockResolvedValue({
          creation_tx_hash: null,
        } as any);
      const originalRpc = f.rpc.requestJson.getMockImplementation()!;
      f.rpc.requestJson.mockImplementation(async (url, init) => {
        const call = JSON.parse(String(init?.body));
        if (
          call.method === "eth_getLogs" &&
          call.params[0].fromBlock !== call.params[0].toBlock
        )
          return { id: call.id, result: [] };
        return originalRpc(url, init);
      });
      const first = (await f.service.card(token)) as any;
      expect(first.launch.value.created.blockNumber).toBe(4800);
      const codeReads = f.seen.filter(
        (c) => c.method === "eth_getCode" && c.params[0] === token,
      );
      expect(codeReads.length).toBeLessThanOrEqual(42); // upper-bound observation plus <=40 search reads and controls
      const discoveryLogs = f.seen.filter(
        (c) =>
          c.method === "eth_getLogs" &&
          Object.values(registry).some(
            (v) => v.address === (c.params[0] as any).address,
          ),
      );
      expect(
        discoveryLogs.every(
          (c) =>
            (c.params[0] as any).fromBlock === hex(4800) &&
            (c.params[0] as any).toBlock === hex(4800),
        ),
      ).toBe(true);
      const count = f.seen.length;
      await f.service.card(token);
      expect(
        f.seen
          .slice(count)
          .filter((c) => c.method === "eth_getCode" && c.params[0] === token),
      ).toHaveLength(1); // controls only
    },
  );
  it("locates the supplied Pons graduation at block 93,020,309 using the exact v4 key", async () => {
    const asset = "0x985b409bf89848611645f784f047e8408d1ae9b5",
      block = 93020309;
    const graduated = log(
      "graduation",
      { token: asset, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
      block,
      0,
      registry.pons.address,
    );
    const init = ponsInitialize(asset, block);
    const copy = ponsInitialize(asset, block + 800, addr(0));
    const f = fixture(
      [ponsLaunch(asset, block - 125000), graduated, init, copy],
      { LAUNCH_SELL_TEST_ENABLED: "false" },
      block + 1000,
    );
    const card = (await f.service.card(asset)) as any;
    expect(card.launch.value).toMatchObject({
      poolGraduated: true,
      poolKey: ponsKey(asset),
      poolId: poolIdFor(ponsKey(asset)),
    });
    expect(card.lpStatus.value.graduation.value.point.blockNumber).toBe(block);
    expect(card.lpStatus.value.poolTradingStart.value.blockNumber).toBe(block);
    expect(
      f.seen.filter(
        (c) => c.method === "eth_call" && (c.params[0] as any).to === stateView,
      ).length,
    ).toBeLessThanOrEqual(41);
    expect(
      f.seen
        .filter(
          (c) =>
            c.method === "eth_getLogs" &&
            [topic("graduation"), topic("v4")].includes(
              (c.params[0] as any).topics[0],
            ),
        )
        .map((c) => [
          (c.params[0] as any).fromBlock,
          (c.params[0] as any).toBlock,
        ]),
    ).toEqual([[hex(block), hex(block)]]);
  });
  it.each([2_000, 100_000])(
    "uses one creation-block query under a %i-block provider cap without explorer",
    async (limit) => {
      const f = fixture(
        [pons()],
        {},
        limit === 2_000 ? 14_800 : 1_004_800,
        limit,
      );
      f.explorerHttp.requestJson.mockRejectedValue(
        new Error("Explorer fixture unavailable"),
      );
      const card = (await f.service.card(token)) as any;
      expect(card.launch.value.token).toBe(token);
      expect(card.coverage.discovery).toMatchObject({
        method: "archive-creation-block",
      });
      const discovery = f.seen.filter(
        (c) =>
          c.method === "eth_getLogs" &&
          Array.isArray((c.params[0] as any).address),
      );
      expect(discovery).toHaveLength(1);
      expect(discovery[0]!.params[0]).toMatchObject({
        fromBlock: hex(4800),
        toBlock: hex(4800),
      });
      expect(
        card.coverage.rpcCalls + card.coverage.documentReads,
      ).toBeLessThanOrEqual(f.config.LAUNCH_CARDS_MAX_RPC_SUBCALLS);
    },
  );
  it("retains partial discovery and final-anchor headroom on budget exhaustion", async () => {
    const f = fixture(
      [pons()],
      { LAUNCH_CARDS_MAX_RPC_SUBCALLS: "40" },
      1_004_800,
    );
    f.explorerHttp.requestJson.mockRejectedValue(
      new Error("Explorer fixture unavailable"),
    );
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_getLogs")
        return { id: call.id, error: { code: 22, message: "range refused" } };
      return original(url, init);
    });
    const card = (await f.service.card(token)) as any;
    expect(card.launch.state).toBe("unknown");
    expect(card.coverage.discovery.reason).toBe("PROVIDER_RANGE_LIMIT");
    expect(
      card.coverage.rpcCalls + card.coverage.documentReads,
    ).toBeLessThanOrEqual(40);
    expect(f.seen.at(-1)).toMatchObject({
      method: "eth_getBlockByNumber",
      params: [hex(1_004_800), false],
    });
  });
  it("caps explorer history pages and marks retained confirmed launches partial", async () => {
    const f = fixture([
      pons(),
      log("pons", { ...decode(pons(), "pons"), token: other }, 4700),
    ]);
    const original = f.explorerHttp.requestJson.getMockImplementation()!;
    let pages = 0;
    f.explorerHttp.requestJson.mockImplementation(async (url) => {
      const doc = await original(url);
      if (url.includes("/transactions"))
        return { ...doc, next_page_params: { index: ++pages } };
      return doc;
    });
    const card = (await f.service.card(token)) as any;
    expect(card.deployerHistory).toMatchObject({
      state: "partial",
      value: { count: 1, launches: [{ token: other }] },
      coverage: { pages: 4, confirmed: 2 },
    });
    expect(
      f.seen.some(
        (c: any) =>
          c.method === "eth_getLogs" &&
          c.params[0].topics[3] === addressTopic(deployer),
      ),
    ).toBe(false);
  });
  it("filters Initialize by the sorted pair and matches Long's hook and transaction", async () => {
    const wrongTx = initialize(curve, 4800);
    wrongTx.transactionHash = hash(12345);
    wrongTx.logIndex = "0x2";
    const valid = initialize(curve, 4800);
    valid.logIndex = "0x3";
    const f = fixture([
      long(pair, token),
      initialize(addr(0), 4800),
      wrongTx,
      valid,
    ]);
    const card = (await f.service.card(pair)) as any;
    expect(card.launch.value).toMatchObject({
      poolId: poolId(curve),
      poolKey: { currency0: token, currency1: pair, hooks: curve },
    });
    expect(card.buyers.value.windows[0].liquiditySource).toBe(
      registry.v4.address,
    );
    expect(
      card.sellTest.results.every(
        (result: any) => result.reason === "Unsupported pair token",
      ),
    ).toBe(true);
    expect(
      f.seen.some(
        (c) =>
          c.method === "eth_getTransactionReceipt" &&
          c.params[0] === valid.transactionHash,
      ),
    ).toBe(true);
    expect(
      f.seen.some(
        (c: any) =>
          c.method === "eth_getLogs" && c.params[0].topics[0] === topic("v4"),
      ),
    ).toBe(false);
  });
  it("resolves the supplied Long TTWO Doppler dynamic-fee key without treating poolOrHook as the pool hook", async () => {
    const asset = "0xbf7f8f15229d685e3092652ae04ee387133f1e18",
      numeraire = "0x5e81213613b6b86eab4c6c50d718d34359459786";
    const key = {
      currency0: numeraire as Hex,
      currency1: asset as Hex,
      fee: 8388608,
      tickSpacing: 8,
      hooks: related.longPoolHook,
    };
    const id = keccak256(encodeAbiParameters(keyParameters, [key]));
    const created = log("long", {
      ...decode(long(asset, numeraire), "long"),
      poolOrHook: asset,
    });
    const init = log(
      "v4",
      { ...key, id, sqrtPriceX96: 1n << 96n, tick: 0 },
      4800,
      1,
    );
    const card = (await fixture([created, init]).service.card(asset)) as any;
    expect(card.launch.value).toMatchObject({
      poolKey: key,
      poolId: id,
      hook: related.longPoolHook,
    });
    expect(card.buyers.value.windows[0].liquiditySource).toBe(
      registry.v4.address,
    );
    const copy = log(
      "v4",
      { ...key, fee: 3000, id: hash(99), sqrtPriceX96: 1n << 96n, tick: 0 },
      4800,
      2,
    );
    copy.topics[1] = keccak256(
      encodeAbiParameters(keyParameters, [{ ...key, fee: 3000 }]),
    );
    expect(
      ((await fixture([created, init, copy]).service.card(asset)) as any)
        .launch,
    ).toMatchObject({ state: "partial", reason: "AMBIGUOUS_POOL" });
    const invalid = { ...init, topics: [...init.topics] as [Hex, ...Hex[]] };
    invalid.topics[1] = keccak256(
      encodeAbiParameters(keyParameters, [{ ...key, fee: 0 }]),
    );
    expect(
      ((await fixture([created, invalid]).service.card(asset)) as any).launch,
    ).toMatchObject({ state: "partial", reason: "POOL_KEY_MISMATCH" });
  });
  it("does not resolve Long from a different hook or currency pair", async () => {
    const wrongPair = log(
      "v4",
      { ...decode(initialize(curve, 4800), "v4"), currency1: other },
      4800,
    );
    wrongPair.logIndex = "0x4";
    const card = (await fixture([
      long(),
      initialize(addr(0), 4800),
      wrongPair,
    ]).service.card(token)) as any;
    expect(card.launch.value.poolKey).toBeUndefined();
    expect(card.buyers.state).toBe("unknown");
    expect(card.sellTest.results[0].reason).toBe(
      "Unsupported or unidentified pool type",
    );
  });
  it.each(["long", "pons"] as const)(
    "refuses a mismatched Initialize pool id for %s",
    async (id) => {
      const init = initialize(id === "long" ? curve : related.ponsHook, 4800);
      init.topics[1] = hash(99);
      init.logIndex = "0x2";
      const promise = fixture([
        id === "long" ? long() : pons(),
        init,
      ]).service.card(token);
      if (id === "pons")
        expect(((await promise) as any).lpStatus.value.graduation.state).toBe(
          "unknown",
        );
      else
        expect(((await promise) as any).launch).toMatchObject({
          state: "partial",
          reason: "POOL_KEY_MISMATCH",
        });
    },
  );
  it("leaves Pons graduation unresolved when only a hookless copy exists", async () => {
    const card = (await fixture([
      pons(),
      log(
        "graduation",
        { token, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
        4820,
        0,
        registry.pons.address,
      ),
      initialize(addr(0)),
    ]).service.card(token)) as any;
    expect(card.launch.value.poolGraduated).toBe(false);
    expect(card.launch.value.poolKey).toBeUndefined();
    expect(card.lpStatus.value.initialize.state).toBe("unknown");
  });
  it("degrades a 5xx AppError in one section and still completes other sections and the anchor recheck", async () => {
    const f = fixture([pons(), transfer(buyer, 4850, 1)]);
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_call" && call.params[0].data === "0x18160ddd")
        return {
          id: call.id,
          error: { code: -32000, message: "Synthetic read failure" },
        };
      return original(url, init);
    });
    const card = (await f.service.card(token)) as any;
    expect(card.supplyByTag).toMatchObject({
      state: "unknown",
      reason: "totalSupply unavailable or zero",
    });
    expect(card.buyers.state).toBe("available");
    expect(card.deployerHistory.state).toBe("available");
    expect(card.permissions.value.readings.owner.state).toBe("observed");
    expect(f.seen.at(-1)).toEqual({
      method: "eth_getBlockByNumber",
      params: [hex(5100), false],
    });
    expect(card.coverage.rpcCalls).toBe(f.seen.length);
  });
});

describe("pass E learned provider windows", () => {
  function rangeFixture(
    limit = 2_000,
    config = {},
    error = { code: -32602, message: "exceed block range" },
  ) {
    const f = fixture([], config);
    const spans: number[] = [];
    f.rpc.requestJson.mockImplementation(async (_url, init) => {
      const call = JSON.parse(String(init?.body));
      const q = call.params[0];
      if (call.method !== "eth_getLogs")
        throw new Error("Unexpected fixture read");
      const span = Number(BigInt(q.toBlock)) - Number(BigInt(q.fromBlock)) + 1;
      spans.push(span);
      return span > limit
        ? { id: call.id, error }
        : { id: call.id, result: [] };
    });
    const r = new LaunchReader(f.config, f.budget, 480, f.now, f.rpc);
    return { f, r, spans };
  }
  const filter = [topic("pons"), addressTopic(token)];
  it.each([
    [
      100_000,
      22,
      "eth_getLogs range over 100000 blocks is not supported on robinhood, request a narrower fromBlock/toBlock range",
    ],
    [
      10_000_000,
      -32602,
      "query spans 20000000 blocks; only 10000000 are allowed",
    ],
  ])(
    "learns the explicit %i-block limit at once",
    async (limit, code, message) => {
      const { f, r, spans } = rangeFixture(
        Number(limit),
        { LAUNCH_LOG_WINDOW_BLOCKS: "100000" },
        { code: Number(code), message: String(message) },
      );
      await expect(
        r.logs(registry.pons.address, filter, 0, Number(limit) * 2 - 1),
      ).rejects.toMatchObject({
        details: { reason: "PROVIDER_RANGE_LIMIT" },
        limit,
      });
      // The next request, including a new reader for the provider, already knows the ceiling.
      const next = new LaunchReader(f.config, f.budget, 480, f.now, f.rpc);
      const page = await next.logWindow(
        registry.pons.address,
        filter,
        0,
        Number(limit) * 2 - 1,
        100_000,
        { remaining: 5 },
      );
      expect(page?.windowBlocks).toBe(Math.min(Number(limit), 100_000));
      expect(spans).toEqual([
        Number(limit) * 2,
        Math.min(Number(limit), 100_000),
      ]);
    },
  );
  it("halves unknown limits without gaps and retains the learned window across readers", async () => {
    const { f, r, spans } = rangeFixture();
    const scan = await r.range(
      registry.pons.address,
      filter,
      0,
      7999,
      12,
      true,
      true,
    );
    expect(spans).toEqual([8000, 4000, 2000, 2000, 2000, 2000]);
    expect(scan).toMatchObject({
      partial: false,
      coverage: { fromBlock: 0, toBlock: 7999, chunks: 6 },
    });
    expect(r.calls).toBe(6);
    expect(f.budget.consume).toHaveBeenCalledTimes(6);
    const next = new LaunchReader(f.config, f.budget, 480, f.now, f.rpc);
    expect(next.windowBlocks).toBe(2000);
  });
  it("range refusals at a single block become partial with a reason", async () => {
    const { r } = rangeFixture(0);
    const scan = await r.range(
      registry.pons.address,
      filter,
      0,
      2,
      10,
      true,
      true,
    );
    expect(scan).toMatchObject({
      partial: true,
      coverage: { reason: "PROVIDER_RANGE_LIMIT", logCount: 0 },
    });
  });
  it.each([429, -32000])(
    "retries transient %i errors without shrinking the window",
    async (code) => {
      {
        const { f, r, spans } = rangeFixture(
          0,
          {},
          {
            code,
            message:
              code === 429
                ? "rate limit: too many requests"
                : "request timed out",
          },
        );
        const promise = r.range(
          registry.pons.address,
          filter,
          0,
          49_999,
          3,
          true,
          true,
        );
        expect(await promise).toMatchObject({
          partial: true,
          coverage: { reason: `PROVIDER_ERROR:${code}`, chunks: 3 },
        });
        expect(spans).toEqual([50_000, 50_000, 50_000]);
        expect(r.windowBlocks).toBe(100_000);
        const next = new LaunchReader(f.config, f.budget, 480, f.now, f.rpc);
        expect(next.windowBlocks).toBe(100_000);
      }
    },
  );
  it("retries transport timeouts and keeps the window", async () => {
    {
      const { f, r } = rangeFixture();
      f.rpc.requestJson.mockRejectedValue({
        code: "PROVIDER_TIMEOUT",
        retryable: true,
      });
      const promise = r.range(
        registry.pons.address,
        filter,
        0,
        49_999,
        3,
        true,
        true,
      );
      expect(await promise).toMatchObject({
        partial: true,
        coverage: { reason: "PROVIDER_ERROR:PROVIDER_TIMEOUT", chunks: 3 },
      });
      expect(r.windowBlocks).toBe(100_000);
    }
  });
  it("counts refusals and retries against log and request budgets", async () => {
    const { f, r, spans } = rangeFixture(0);
    r.calls = r.maxCalls - 14;
    const scan = await r.range(
      registry.pons.address,
      filter,
      0,
      999999,
      20,
      true,
      true,
    );
    expect(spans).toHaveLength(2);
    expect(scan).toMatchObject({
      partial: true,
      coverage: { chunks: 2, logCount: 0 },
    });
    expect(r.calls).toBe(r.maxCalls - 12);
    expect(f.budget.consume).toHaveBeenCalledTimes(2);
  });
  it("validates the configured window and retains both default-off switches", () => {
    const defaults = loadEnv({ NODE_ENV: "test" });
    expect(defaults.LAUNCH_CARDS_ENABLED).toBe(false);
    expect(defaults.LAUNCH_SELL_TEST_ENABLED).toBe(false);
    expect(defaults.LAUNCH_LOG_WINDOW_BLOCKS).toBe(100_000);
    expect(defaults.LAUNCH_CARDS_CACHE_SECONDS).toBe(60);
    expect(
      env({ LAUNCH_CARDS_CACHE_SECONDS: "0" }).LAUNCH_CARDS_CACHE_SECONDS,
    ).toBe(0);
    expect(
      env({ LAUNCH_CARDS_CACHE_SECONDS: "600" }).LAUNCH_CARDS_CACHE_SECONDS,
    ).toBe(600);
    expect(() => env({ LAUNCH_CARDS_CACHE_SECONDS: "601" })).toThrow();
    expect(
      env({ LAUNCH_LOG_WINDOW_BLOCKS: "100000" }).LAUNCH_LOG_WINDOW_BLOCKS,
    ).toBe(100_000);
    for (const value of ["499", "100001", "2000.5", "invalid"])
      expect(() => env({ LAUNCH_LOG_WINDOW_BLOCKS: value })).toThrow();
  });
});

describe("pass E feed coverage and refusal reasons", () => {
  it.each([2_000, 100_000])(
    "chunks the feed under a %i-block cap and reuses the learned window",
    async (limit) => {
      const f = fixture([pons(), initialize(addr(0), 4800)], {}, 10_000, limit);
      const first = (await f.service.feed(60)) as any;
      expect(first.entries).toHaveLength(1);
      expect(first.entries[0].adapter).toBe("pons");
      expect(first.coverage.windowBlocks).toBeLessThanOrEqual(limit);
      const before = f.seen.length;
      await f.service.feed(10);
      const queries = f.seen
        .slice(before)
        .filter((c) => c.method === "eth_getLogs")
        .map((c) => c.params[0] as any);
      expect(
        queries.every(
          (q) =>
            Number(BigInt(q.toBlock)) - Number(BigInt(q.fromBlock)) + 1 <=
            limit,
        ),
      ).toBe(true);
      expect(
        queries.every((q) =>
          [
            topic("pons"),
            topic("long"),
            topic("launcher"),
            topic("instant"),
          ].includes(q.topics[0]),
        ),
      ).toBe(true);
    },
  );
  it("normally uses one log call per factory in the default ten-minute feed", async () => {
    const f = fixture([pons()], {}, 10_000, 100_000);
    const feed = (await f.service.feed()) as any;
    expect(feed.minutes).toBe(10);
    expect(feed.coverage.logCalls).toBe(4);
    expect(feed.coverage.windowBlocks).toBe(100_000);
  });
  it("lists events whose unique header cap is exhausted, with a block and unknown time", async () => {
    const logs = Array.from({ length: 45 }, (_, i) =>
      log(
        "pons",
        { ...decode(pons(), "pons"), token: addr(i + 100) },
        4800 + i,
      ),
    );
    const f = fixture(logs, {}, 5100, 100_000);
    const feed = (await f.service.feed()) as any;
    expect(feed.entries).toHaveLength(45);
    const unknown = feed.entries.filter(
      (entry: any) => entry.created.timestamp === null,
    );
    expect(unknown.length).toBeGreaterThan(0);
    expect(
      unknown.every(
        (entry: any) =>
          Number.isInteger(entry.created.blockNumber) && entry.t0 === null,
      ),
    ).toBe(true);
    expect(feed.coverage).toMatchObject({ state: "partial", eventHeaders: 32 });
    const eventReads = f.seen.filter(
      (c) =>
        c.method === "eth_getBlockByNumber" &&
        logs.some((log) => log.blockNumber === c.params[0]),
    );
    const counts = new Map<string, number>();
    for (const read of eventReads)
      counts.set(
        String(read.params[0]),
        (counts.get(String(read.params[0])) ?? 0) + 1,
      );
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });
  it("reports range failures as per-adapter partial feed coverage", async () => {
    const f = fixture([], {}, 5100);
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      return call.method === "eth_getLogs"
        ? { id: call.id, error: { code: 22, message: "range refused" } }
        : original(url, init);
    });
    const feed = (await f.service.feed()) as any;
    expect(feed.coverage.state).toBe("partial");
    expect(
      Object.values(feed.coverage.adapters).every(
        (a: any) => a.reason === "PROVIDER_RANGE_LIMIT",
      ),
    ).toBe(true);
    expect(feed.coverage.rpcCalls).toBeLessThanOrEqual(
      f.config.LAUNCH_CARDS_FEED_MAX_RPC_SUBCALLS,
    );
  });
  it("a token outside registry factories is an unknown fact, not a 503", async () => {
    const card = (await fixture([]).service.card(token)) as any;
    expect(card.launch).toMatchObject({
      state: "unknown",
      reason: "Launch not found in the supported registry",
    });
  });
  it.each([
    "ANCHOR_CHANGED",
    "HEADER_MISMATCH",
    "PROVIDER_ERROR:22",
    "EXPLORER_UNAVAILABLE",
    "BUDGET_EXHAUSTED",
    "CREATION_NOT_FOUND",
  ])("returns and logs only the %s reason on a 503", async (reason) => {
    const app = Fastify();
    installErrorHandler(app);
    const warn = vi.spyOn(app.log, "warn");
    const source = {
      feed: vi.fn(async () => {
        throw new AppError(
          "LAUNCH_CARDS_UNAVAILABLE",
          503,
          "Launch facts unavailable",
          { reason },
        );
      }),
      card: vi.fn(async () => {
        throw new AppError(
          "LAUNCH_CARDS_UNAVAILABLE",
          503,
          "Launch facts unavailable",
          { reason },
        );
      }),
    };
    await launchRoutes(app, env(), source);
    for (const url of [
      "/v1/private/opsis/launches",
      `/v1/private/opsis/launches/${token}`,
    ]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.details).toEqual({ reason });
    }
    expect(warn).toHaveBeenCalledWith({ reason }, "Launch facts refused");
    await app.close();
  });
});

describe("Pass F bounded and concurrent cards", () => {
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 100));
  function slow(f: ReturnType<typeof fixture>) {
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      if (!(init?.headers as Record<string, string>)?.["x-fixture-inner"])
        await delay();
      return original(url, init);
    });
  }
  it.each([false, true])(
    "returns a non-registry card within 40 reads and 5 s (explorer unavailable %s)",
    async (offline) => {
      {
        const f = fixture([], {}, 93_188_492, 100_000);
        slow(f);
        if (offline)
          f.explorerHttp.requestJson.mockRejectedValue(
            new Error("unavailable"),
          );
        const service = new LaunchCardsService(f.config, f.cache, {
          rpc: f.rpc,
          budget: f.budget,
          explorerHttp: f.explorerHttp,
          now: f.now,
        });
        const start = Date.now();
        const promise = service.card(token);
        const card = (await promise) as any;
        expect(card.launch).toMatchObject({
          state: "unknown",
          reason: "Launch not found in the supported registry",
        });
        expect(card.coverage.rpcCalls).toBeLessThanOrEqual(40);
        expect(Date.now() - start).toBeLessThanOrEqual(5_000);
        expect(f.seen.filter((c) => c.method === "eth_getCode")).toHaveLength(
          29,
        ); // 28 creation observations plus controls
        expect(f.seen.filter((c) => c.method === "eth_getLogs")).toHaveLength(
          1,
        );

        expect(card.directPools.state).toBe("partial");
        expect(card.permissions.value.anchor.blockHash).toBe(
          card.anchor.blockHash,
        );
      }
    },
    15_000,
  );
  it("completes a registry card within the latency, read and unit ceilings", async () => {
    {
      const block = 93_020_309;
      const graduated = log(
        "graduation",
        { token, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
        block,
        0,
        registry.pons.address,
      );
      const f = fixture(
        [
          ponsLaunch(token, block - 125_000),
          graduated,
          ponsInitialize(token, block),
        ],
        { LAUNCH_SELL_TEST_ENABLED: "false" },
        block + 1_000,
        100_000,
      );
      slow(f);
      const service = new LaunchCardsService(f.config, f.cache, {
        rpc: f.rpc,
        budget: f.budget,
        explorerHttp: f.explorerHttp,
        now: f.now,
      });
      const start = Date.now();
      const promise = service.card(token);
      const card = (await promise) as any;

      expect(card.launch.value.poolGraduated).toBe(true);
      expect(card.coverage.rpcCalls).toBeLessThanOrEqual(150);
      expect(card.coverage.budgetUnits).toBeLessThanOrEqual(390);
      expect(Date.now() - start).toBeLessThanOrEqual(10_000);
      expect(
        f.seen.filter((c) => c.method === "eth_simulateV1").length,
      ).toBeLessThanOrEqual(12);
    }
  }, 15_000);
  it("runs a full native registry sell test within 390 units with 100 ms dRPC latency", async () => {
    const block = 93_020_309;
    const graduated = log(
      "graduation",
      { token, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
      block,
      0,
      registry.pons.address,
    );
    const f = fixture(
      [
        ponsLaunch(token, block - 125_000),
        graduated,
        ponsInitialize(token, block),
      ],
      {},
      block + 1_000,
      100_000,
    );
    const original = f.rpc.requestJson.getMockImplementation()!;
    let actual = 0,
      simulations = 0;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const { id, method, params } = JSON.parse(String(init?.body));
      if (!(init?.headers as Record<string, string>)?.["x-fixture-inner"]) {
        actual++;
        await delay();
      }
      if (method === "eth_call" && params[0].to === ethUsdFeed.proxyAddress) {
        const name = decodeFunctionData({
          abi: chainlinkAbi,
          data: params[0].data,
        }).functionName;
        return {
          id,
          result: encodeFunctionResult({
            abi: chainlinkAbi,
            functionName: name,
            result: {
              description: "ETH / USD",
              decimals: 8,
              latestRoundData: [
                1n,
                2000_00000000n,
                0n,
                BigInt(seconds(block + 1000)),
                1n,
              ],
            }[name] as never,
          }),
        };
      }
      if (["eth_getTransactionCount", "eth_getBalance"].includes(method))
        return { id, result: "0x0" };
      if (method === "eth_getCode" && params[0] !== token)
        return { id, result: "0x" };
      if (method === "eth_call" && params[0].data.startsWith("0x70a08231"))
        return { id, result: hash(0) };
      if (method === "eth_simulateV1") {
        simulations++;
        const blocks = params[0].blockStateCalls;
        const first = blocks[0].calls,
          actor = first[0].from;
        const spent = BigInt(first.find((call: any) => call.value)?.value ?? 0);
        const initial = BigInt(blocks[0].stateOverrides[actor].balance),
          residual = initial - spent;
        const make = (n = 0n) => ({
          status: "0x1",
          returnData: `0x${n.toString(16).padStart(64, "0")}`,
          logs: [],
        });
        const buy = first.map(() => make());
        buy[0] = make(initial);
        buy[buy.length - 2] = make(100n);
        buy[buy.length - 1] = make(residual);
        const result = [{ calls: buy }];
        if (blocks[1]) {
          const sell = blocks[1].calls.map(() => make());
          sell[0] = make(residual);
          sell[sell.length - 2] = make(residual + (spent * 99n) / 100n);
          result.push({ calls: sell });
        }
        return { id, result };
      }
      return original(url, init);
    });
    const service = new LaunchCardsService(f.config, f.cache, {
      rpc: f.rpc,
      budget: f.budget,
      explorerHttp: f.explorerHttp,
      now: f.now,
    });
    const start = Date.now(),
      card = (await service.card(token)) as any;
    expect(card.launch.value.poolGraduated).toBe(true);
    expect(simulations).toBeGreaterThan(0);
    expect(simulations).toBeLessThanOrEqual(12);

    expect(actual - simulations).toBeLessThanOrEqual(150);
    expect(card.coverage.rpcCalls).toBe(actual);
    expect(card.coverage.budgetUnits).toBeLessThanOrEqual(390);
    expect(
      f.budget.consume.mock.calls.reduce(
        (sum, args) => sum + Number(args[0]),
        0,
      ),
    ).toBe(card.coverage.budgetUnits);
    expect(
      card.sellTest.results.some((row: any) => row.state === "available"),
    ).toBe(true);
    expect(
      card.sellTest.results.filter((row: any) =>
        String(row.reason ?? "").includes("budget"),
      ),
    ).toEqual([]);
    expect(Date.now() - start).toBeLessThanOrEqual(10_000);
  }, 15_000);
  it("retries explorer 5xx once then falls through without another explorer section", async () => {
    {
      const f = fixture([pons()], {}, 93_188_492, 100_000);
      f.explorerHttp.requestJson.mockImplementation(async () => {
        await delay();
        throw Object.assign(new Error("upstream"), {
          code: "PROVIDER_HTTP_500",
        });
      });
      const service = new LaunchCardsService(f.config, f.cache, {
        rpc: f.rpc,
        budget: f.budget,
        explorerHttp: f.explorerHttp,
        now: f.now,
      });
      const start = Date.now();
      const promise = service.card(token);
      const card = (await promise) as any;
      expect(card.launch.value.token).toBe(token);
      expect(card.coverage.discovery.explorerReason).toBe(
        "EXPLORER_UNAVAILABLE",
      );
      expect(f.explorerHttp.requestJson).toHaveBeenCalledTimes(2);
      expect(Date.now() - start).toBeLessThanOrEqual(3_000);
    }
  }, 15_000);
  it("bounds a nonresponding explorer and still completes a non-registry card in 5 s", async () => {
    const f = fixture([], {}, 93_188_492, 100_000);
    slow(f);
    f.explorerHttp.requestJson.mockImplementation(() => new Promise(() => {}));
    const service = new LaunchCardsService(f.config, f.cache, {
      rpc: f.rpc,
      budget: f.budget,
      explorerHttp: f.explorerHttp,
      now: f.now,
    });
    const start = Date.now(),
      card = (await service.card(token)) as any;
    expect(card.launch).toMatchObject({
      state: "unknown",
      reason: "Launch not found in the supported registry",
    });
    expect(card.coverage.rpcCalls).toBeLessThanOrEqual(40);
    expect(f.explorerHttp.requestJson).toHaveBeenCalledTimes(1);
    expect(Date.now() - start).toBeLessThanOrEqual(5_000);
  }, 10_000);
  it("shares an in-flight block header", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      slow(f);
      const r = new LaunchReader(f.config, f.budget, 40, f.now, f.rpc);
      const promise = Promise.all([
        r.block(4800),
        r.block(4800),
        r.block(4800),
      ]);
      await vi.runAllTimersAsync();
      const headers = await promise;
      expect(headers[0]).toEqual(headers[2]);
      expect(f.seen).toHaveLength(1);
      expect(r.calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("reserves before asynchronous budgets and never overshoots a mid-flight call cap", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      slow(f);
      const budget = {
        consume: vi.fn(async () => {
          await delay();
        }),
      };
      const r = new LaunchReader(f.config, budget, 40, f.now, f.rpc);
      const promise = Promise.allSettled(
        Array.from({ length: 80 }, () =>
          r.read("eth_getCode", [token, hex(5100)]),
        ),
      );
      await vi.runAllTimersAsync();
      const results = await promise;
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(39);
      expect(
        results.filter(
          (r) => r.status === "rejected" && r.reason instanceof ReadCap,
        ),
      ).toHaveLength(41);
      expect(budget.consume).toHaveBeenCalledTimes(39);
      expect(r.calls).toBe(39);
      const final = r.recheck({
        number: 5100,
        hash: hash(5101),
        seconds: seconds(5100),
      });
      await vi.runAllTimersAsync();
      await final;
      expect(r.calls).toBe(40);
    } finally {
      vi.useRealTimers();
    }
  });
  it("batches same-anchor calls, retains allowFailure and hashes the actual Multicall params", async () => {
    const f = fixture();
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_call" && call.params[0].data === "0x5c975abb")
        return { id: call.id, error: { code: 3 } };
      return original(url, init);
    });
    const r = new LaunchReader(f.config, f.budget, 40, f.now, f.rpc);
    const values = await Promise.all([
      r.read("eth_call", [{ to: token, data: "0x18160ddd" }, hex(5100)], true),
      r.read("eth_call", [{ to: token, data: "0x5c975abb" }, hex(5100)], true),
    ]);
    expect(values).toEqual([hash(1000), null]);
    expect(f.seen).toHaveLength(1);
    const call = f.seen[0]!;
    const entries = decodeFunctionData({
      abi: aggregateAbi,
      data: (call.params[0] as any).data,
    }).args[0];
    expect(entries.every((e) => e.allowFailure)).toBe(true);
    expect(r.evidence.rpcCalls).toEqual([
      {
        method: "eth_call",
        paramsSha256: await sha256(canonicalBytes(call.params)),
      },
    ]);
  });
  it("marks the first 25 distinct buyers partial and bounds nonce work", async () => {
    const recipients = Array.from({ length: 30 }, (_, i) => addr(100 + i));
    const f = fixture([
      pons(),
      ...recipients.map((to, i) => transfer(to, 4800 + i, 1)),
    ]);
    recipients.forEach((to, i) => f.signers.set(hash(104800 + i), to));
    const card = (await f.service.card(token)) as any;
    expect(card.buyers.state).toBe("partial");
    expect(card.buyers.coverage.buyerCap).toBe(25);
    expect(card.buyers.coverage.distinctBuyers).toBe(25);
    expect(
      card.buyers.value.windows[0].tags.filter(
        (tag: any) => tag.kind === "early buyer",
      ),
    ).toHaveLength(25);
    expect(card.buyers.coverage.nonceReads).toBe(25);
  });
  it("returns 200 with TIME_LIMIT for a slow section and still rechecks the anchor", async () => {
    const f = fixture([pons(), transfer(buyer, 4850, 1)]);
    let now = f.now();
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_getTransactionByHash") {
        await new Promise((resolve) => setTimeout(resolve, 10));
        now += 20_001;
      }
      return original(url, init);
    });
    const service = new LaunchCardsService(f.config, f.cache, {
      rpc: f.rpc,
      budget: f.budget,
      explorerHttp: f.explorerHttp,
      now: () => now,
    });
    const result = (await service.card(token)) as any;
    expect(result.buyers).toMatchObject({
      state: "unknown",
      reason: "TIME_LIMIT",
    });
    expect(result.permissions.state).toBe("partial");
    expect(f.seen.at(-1)).toMatchObject({
      method: "eth_getBlockByNumber",
      params: [hex(5100), false],
    });
  });
  it("cuts off a section that never responds at 20 s, then returns its final anchor check", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture([pons(), transfer(buyer, 4850, 1)]);
      vi.setSystemTime(f.now());
      const original = f.rpc.requestJson.getMockImplementation()!;
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      f.rpc.requestJson.mockImplementation(async (url, init) => {
        const call = JSON.parse(String(init?.body));
        if (call.method === "eth_getTransactionByHash") {
          started();
          return new Promise(() => {});
        }
        return original(url, init);
      });
      const service = new LaunchCardsService(f.config, f.cache, {
        rpc: f.rpc,
        budget: f.budget,
        explorerHttp: f.explorerHttp,
        now: Date.now,
      });
      const promise = service.card(token);
      await ready;
      await vi.advanceTimersByTimeAsync(20_001);
      const card = (await promise) as any;
      expect(card.buyers).toMatchObject({
        state: "unknown",
        reason: "TIME_LIMIT",
      });
      expect(f.seen.at(-1)).toMatchObject({
        method: "eth_getBlockByNumber",
        params: [hex(5100), false],
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("caches completed cards and collapses concurrent identical requests without changing their age", async () => {
    {
      const f = fixture([], { LAUNCH_CARDS_CACHE_SECONDS: "60" });
      slow(f);
      let ageNow = f.now();
      const service = new LaunchCardsService(f.config, f.cache, {
        rpc: f.rpc,
        budget: f.budget,
        explorerHttp: f.explorerHttp,
        now: () => ageNow,
      });
      const promises = Promise.all([
        service.card(token),
        service.card(token.toUpperCase().replace("0X", "0x")),
      ]);
      const [a, b] = await promises;
      expect(a).toEqual(b);
      const count = f.seen.length;
      ageNow += 5_000;
      const cached = await service.card(token);
      expect(f.seen).toHaveLength(count);
      expect(cached.anchor).toEqual(a!.anchor);
      expect(cached.observedAt).toBe(a!.observedAt);
      expect(Number(cached.ageSeconds)).toBeGreaterThanOrEqual(5);
    }
  }, 15_000);
  it("does not cache 503 cards or retain their failed single-flight promise", async () => {
    const f = fixture([], { LAUNCH_CARDS_CACHE_SECONDS: "60" });
    const original = f.rpc.requestJson.getMockImplementation()!;
    let fail = true;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (fail && call.method === "eth_chainId")
        return { id: call.id, error: { code: -32000 } };
      return original(url, init);
    });
    await expect(f.service.card(token)).rejects.toMatchObject({
      statusCode: 503,
    });
    fail = false;
    expect((await f.service.card(token)).launch).toMatchObject({
      state: "unknown",
      reason: "Launch not found in the supported registry",
    });
  });
});
