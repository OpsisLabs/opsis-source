import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  recoverAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalize, verifyReceipt } from "@rh-chain/shared";
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
import { keyParameters } from "../src/launches/sell-test.js";
import { LaunchReader, hex } from "../src/launches/reader.js";
import { createLaunchCardsBudget } from "../src/launches/budget.js";
import { launchRoutes } from "../src/routes/launches.js";
import { installOpsisPreviewGuard, opsisRoutes } from "../src/routes/opsis.js";
import { loadEnv } from "../src/config/env.js";
import { JsonCache } from "../src/cache/service.js";
import { installErrorHandler } from "../src/http/errors.js";
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
const transfer = (
  to: string,
  n: number,
  index: number,
  from = curve,
  value = 10n,
) => log("transfer", { from, to, value }, n, index);
function fixture(logs: ChainLog[] = [pons()], extra = {}, anchor = 5100) {
  const config = env(extra),
    budget = { consume: vi.fn(async () => {}) };
  const seen: { method: string; params: unknown[] }[] = [];
  const signers = new Map<string, string>(),
    nonces = new Map<string, number>();
  let changed = false;
  const rpc = {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const { id, method, params } = JSON.parse(String(init?.body));
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
      } else if (method === "eth_getLogs") {
        const f = params[0];
        result = logs.filter(
          (l) =>
            l.address.toLowerCase() === f.address.toLowerCase() &&
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
      else if (method === "eth_getCode") result = "0x1234";
      else if (method === "eth_call")
        result = hash(params[0].data === "0x18160ddd" ? 1000 : 10);
      else if (method === "eth_getStorageAt") result = addressTopic(addr(9));
      else throw new Error(`Unexpected method ${method}`);
      return { jsonrpc: "2.0", id, result };
    }),
  };
  const now = () => seconds(anchor) * 1000;
  const cache = new JsonCache();
  const service = new LaunchCardsService(config, cache, {
    budget,
    rpc,
    now,
    stockHttp: { requestJson: vi.fn(async () => ({ assets: [] })) },
  });
  return {
    service,
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
    expect(card.coverage.rpcCalls).toBe(f.rpc.requestJson.mock.calls.length);
    expect(card.disclaimer).toBe("Not investment advice");
  });
  it("shows Pons graduation and Initialize in separate transactions and ignores hookless copies", async () => {
    const graduation = log(
      "graduation",
      { token, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
      4820,
      0,
      registry.pons.address,
    );
    const f = fixture([
      pons(),
      graduation,
      initialize(addr(0), 4825),
      initialize(),
    ]);
    const card = (await f.service.card(token)) as any;
    expect(card.launch.value.t0.blockNumber).toBe(4800);
    expect(card.lpStatus.value.graduation.value).toMatchObject({
      positionId: "55",
      point: { blockNumber: 4820 },
    });
    expect(card.lpStatus.value.initialize.value.blockNumber).toBe(4830);
    expect(card.lpStatus.value.poolTradingStart.value.blockNumber).toBe(4830);
    expect(card.lpStatus.value.lock.state).toBe("unknown");
    expect(card.buyers.value.windows).toHaveLength(2);
  });
  it.each(["v3", "v4"])(
    "uses first positive liquidity add for direct %s T0",
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
              4850,
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
              4850,
              1,
              registry.v4.address,
            );
      const card = (await fixture([created, liquidity]).service.card(
        token,
      )) as any;
      expect(card.launch.value.t0.blockNumber).toBe(4850);
    },
  );
  it("keeps direct T0 unknown without positive liquidity", async () => {
    const card = (await fixture([initialize(addr(0), 4800)]).service.card(
      token,
    )) as any;
    expect(card.launch.value.t0).toBeNull();
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
      f.seen.some(
        (c: any) =>
          c.method === "eth_getLogs" &&
          c.params[0].topics[3] === addressTopic(deployer),
      ),
    ).toBe(true);
  });
  it("marks capped discovery and history partial without assuming block timing", async () => {
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
    expect(card.deployerHistory.state).toBe("partial");
    expect(card.launch.coverage.adapters.pons.fromBlock).toBeGreaterThan(0);
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
        ++anchors >= 3
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
      { rpc: f.rpc, budget: f.budget, now: f.now, receipts },
    );
    const card = (await service.card(token)) as any;
    expect(card.receipt.rpcCalls).toHaveLength(f.seen.length);
    expect(card.receipt.sources).toHaveLength(f.seen.length);
    expect(new Set(card.receipt.sources.map((s: any) => s.id)).size).toBe(
      f.seen.length,
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
      await f.service.feed(120);
      expect(f.seen.length).toBeGreaterThan(next);
    } finally {
      vi.useRealTimers();
    }
  });
  it("feed scan cap produces explicit per-adapter partial coverage", async () => {
    const f = fixture([], { LAUNCH_CARDS_FEED_MAX_RPC_SUBCALLS: "40" }, 100000);
    const result = (await f.service.feed(120)) as any;
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
  it("caps nonce lookups at 32 and labels retained early-buyer facts partial", async () => {
    const f = fixture([
      pons(),
      ...Array.from({ length: 33 }, (_, i) => transfer(buyer, 4800 + i, 1)),
    ]);
    const card = (await f.service.card(token)) as any;
    expect(card.buyers.state).toBe("partial");
    expect(card.buyers.coverage.nonceReads).toBe(32);
    expect(
      card.buyers.value.windows[0].tags.filter(
        (t: any) => t.kind === "early buyer",
      ),
    ).toHaveLength(33);
    expect(
      card.buyers.value.windows[0].tags.filter(
        (t: any) => t.kind === "new wallet",
      ),
    ).toHaveLength(32);
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

describe("pass C indexed log discovery", () => {
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
      token0: side ? pair : token,
      token1: side ? token : pair,
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
    "finds an older %s launch on indexed side %s in one wide window",
    async (id, side) => {
      const selected = id === "v4" && side ? pair : token;
      const f = fixture([created(id, side)], {}, 129800);
      const card = (await f.service.card(selected)) as any;
      expect(card.launch.value).toMatchObject({
        adapter: id,
        token: selected,
        created: { blockNumber: 4800 },
      });
      const calls = f.seen
        .filter((c) => c.method === "eth_getLogs")
        .map((c) => c.params[0] as any);
      const index =
        id === "long" || id === "instant"
          ? 2
          : (id === "v3" || id === "v4") && side
            ? id === "v4"
              ? 3
              : 2
            : id === "v4"
              ? 2
              : 1;
      expect(
        calls.some(
          (c) =>
            c.address === registry[id].address &&
            c.topics[index] === addressTopic(selected) &&
            Number(BigInt(c.fromBlock)) === registry[id].deploymentBlock &&
            Number(BigInt(c.toBlock)) === 129800,
        ),
      ).toBe(true);
      expect(card.coverage.rpcCalls).toBe(f.rpc.requestJson.mock.calls.length);
      expect(card.coverage.rpcCalls).toBeLessThanOrEqual(
        f.config.LAUNCH_CARDS_MAX_RPC_SUBCALLS,
      );
    },
  );
  it("walks contiguous wide windows back to the registry bound", async () => {
    const f = fixture(
      [log("launcher", { token })],
      { LAUNCH_LOG_WINDOW_BLOCKS: "100000" },
      229800,
    );
    const card = (await f.service.card(token)) as any;
    expect(card.launch.value.adapter).toBe("launcher");
    const ranges = f.seen
      .filter(
        (c: any) =>
          c.method === "eth_getLogs" &&
          c.params[0].address === registry.launcher.address,
      )
      .map((c: any) => [
        Number(BigInt(c.params[0].fromBlock)),
        Number(BigInt(c.params[0].toBlock)),
      ]);
    expect(ranges).toEqual([
      [129801, 229800],
      [29801, 129800],
      [0, 29800],
    ]);
    expect(card.launch.coverage.adapters.launcher.state).toBe("available");
  });
  it("resolves an older graduated Pons pool while excluding a newer hookless copy", async () => {
    const f = fixture(
      [
        pons(),
        log(
          "graduation",
          { token, positionId: 55n, tokenAmount: 50n, pairTokenAmount: 10n },
          125000,
          0,
          registry.pons.address,
        ),
        initialize(related.ponsHook, 125010),
        initialize(addr(0), 125800),
      ],
      {},
      129800,
    );
    const card = (await f.service.card(token)) as any;
    expect(card.launch.value).toMatchObject({
      poolGraduated: true,
      poolId: poolId(),
      poolKey: { hooks: related.ponsHook },
    });
    expect(card.lpStatus.value.poolTradingStart.value.blockNumber).toBe(125010);
    const ranges = f.seen.filter(
      (c: any) =>
        c.method === "eth_getLogs" &&
        c.params[0].topics[0] === topic("graduation"),
    );
    expect(ranges[0].params[0]).toMatchObject({
      topics: [topic("graduation"), addressTopic(token)],
      toBlock: hex(129800),
    });
    expect(
      Number(BigInt((ranges[0].params[0] as any).toBlock)) -
        Number(BigInt((ranges[0].params[0] as any).fromBlock)),
    ).toBeGreaterThan(120000);
  });
  it("uses wide Pons deployer history and keeps non-indexed Long history partial", async () => {
    const f = fixture(
      [
        log("pons", decode(pons(), "pons"), 125000),
        log("pons", { ...decode(pons(), "pons"), token: other }),
      ],
      {},
      129800,
    );
    const card = (await f.service.card(token)) as any;
    expect(card.deployerHistory).toMatchObject({
      state: "available",
      value: { count: 1, launches: [{ token: other }] },
    });
    expect(
      f.seen.some(
        (c: any) =>
          c.method === "eth_getLogs" &&
          c.params[0].topics[3] === addressTopic(deployer) &&
          c.params[0].fromBlock === "0x0" &&
          c.params[0].toBlock === hex(129800),
      ),
    ).toBe(true);
    const l = (await fixture([long(), initialize(curve, 4800)]).service.card(
      token,
    )) as any;
    expect(l.deployerHistory.state).toBe("partial");
    expect(l.deployerHistory.coverage.indexedDeployer).toBe(false);
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
        (c: any) =>
          c.method === "eth_getLogs" &&
          c.params[0].topics.length === 4 &&
          JSON.stringify(c.params[0].topics) ===
            JSON.stringify([
              topic("v4"),
              null,
              addressTopic(token),
              addressTopic(pair),
            ]),
      ),
    ).toBe(true);
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
    await expect(
      fixture([created, init, copy]).service.card(asset),
    ).rejects.toMatchObject({ code: "LAUNCH_CARDS_UNAVAILABLE" });
    const invalid = { ...init, topics: [...init.topics] as [Hex, ...Hex[]] };
    invalid.topics[1] = keccak256(
      encodeAbiParameters(keyParameters, [{ ...key, fee: 0 }]),
    );
    await expect(
      fixture([created, invalid]).service.card(asset),
    ).rejects.toMatchObject({ code: "LAUNCH_CARDS_UNAVAILABLE" });
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
      await expect(
        fixture([id === "long" ? long() : pons(), init]).service.card(token),
      ).rejects.toMatchObject({ code: "LAUNCH_CARDS_UNAVAILABLE" });
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
      reason: "A source read failed in this section (LAUNCH_CARDS_UNAVAILABLE)",
    });
    expect(card.buyers.state).toBe("available");
    expect(card.deployerHistory.state).toBe("available");
    expect(card.permissions.value.readings.owner.state).toBe("observed");
    expect(f.seen.at(-1)).toEqual({
      method: "eth_getBlockByNumber",
      params: [hex(5100), false],
    });
    expect(card.coverage.rpcCalls).toBe(f.rpc.requestJson.mock.calls.length);
  });
});

describe("pass C adaptive log windows", () => {
  function rangeFixture(
    error: { code: number; message?: string },
    limit = 0,
    config = {},
    anchor = 5100,
  ) {
    const f = fixture([], config, anchor);
    const original = f.rpc.requestJson.getMockImplementation()!;
    const spans: [number, number][] = [];
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method === "eth_getLogs") {
        const q = call.params[0],
          from = Number(BigInt(q.fromBlock)),
          to = Number(BigInt(q.toBlock));
        spans.push([from, to]);
        if (to - from + 1 > limit) return { id: call.id, error };
      }
      return original(url, init);
    });
    const r = new LaunchReader(f.config, f.budget, 480, f.now, f.rpc);
    return { f, r, spans };
  }
  const filter = [topic("pons"), addressTopic(token)];
  it.each([
    { code: -32602, message: "query spans too many blocks" },
    { code: -32005, message: "too many blocks" },
    { code: -32000, message: "block range exceeds provider allowance" },
    { code: -32000, message: "log query limit exceeded" },
  ])(
    "halves on a range error $code / $message, without skipping blocks",
    async (error) => {
      const { f, r, spans } = rangeFixture(error, 250000);
      const scan = await r.range(
        registry.pons.address,
        filter,
        0,
        999999,
        8,
        true,
        true,
      );
      expect(spans).toEqual([
        [0, 999999],
        [500000, 999999],
        [750000, 999999],
        [500000, 749999],
        [250000, 499999],
        [0, 249999],
      ]);
      expect(scan.partial).toBe(false);
      expect(scan.coverage).toMatchObject({
        fromBlock: 0,
        toBlock: 999999,
        chunks: 6,
      });
      expect(r.calls).toBe(6);
      expect(f.budget.consume).toHaveBeenCalledTimes(6);
      expect(r.evidence.rpcCalls).toHaveLength(6);
      expect(r.evidence.sources).toHaveLength(6);
    },
  );
  it("reaches the 2,000-block floor, then stops on another refusal", async () => {
    const { r, spans } = rangeFixture({ code: -32602 });
    await expect(
      r.range(registry.pons.address, filter, 0, 999999, 20, true, true),
    ).rejects.toMatchObject({
      code: "LAUNCH_LOG_RANGE_UNAVAILABLE",
      statusCode: 503,
    });
    expect(spans.map(([from, to]) => to - from + 1)).toEqual([
      1000000, 500000, 250000, 125000, 62500, 31250, 15625, 7812, 3906, 2000,
    ]);
    expect(r.calls).toBe(10);
  });
  it("succeeds at the floor and keeps subsequent pages at 2,000 blocks", async () => {
    const { r, spans } = rangeFixture({ code: -32005 }, 2000, {
      LAUNCH_LOG_WINDOW_BLOCKS: "8000",
    });
    const scan = await r.range(
      registry.pons.address,
      filter,
      0,
      7999,
      6,
      true,
      true,
    );
    expect(spans.map(([from, to]) => to - from + 1)).toEqual([
      8000, 4000, 2000, 2000, 2000, 2000,
    ]);
    expect(scan.partial).toBe(false);
  });
  it("counts failed attempts toward the total range-call cap, with no claimed coverage", async () => {
    const { r, spans } = rangeFixture({ code: -32602 });
    const scan = await r.range(
      registry.pons.address,
      filter,
      0,
      999999,
      3,
      true,
      true,
    );
    expect(spans).toHaveLength(3);
    expect(scan.partial).toBe(true);
    expect(scan.coverage).toMatchObject({
      chunks: 3,
      fromBlock: 1000000,
      toBlock: 999999,
      logCount: 0,
    });
  });
  it("shares the discovery call cap across adapters and adaptive retries", async () => {
    const { f } = rangeFixture({ code: -32602 }, 2000, {}, 129800);
    const card = (await f.service.card(token)) as any;
    expect(card.launch.state).toBe("unknown");
    expect(card.coverage.discovery).toMatchObject({
      partial: true,
      logCalls: 90,
    });
    expect(
      f.rpc.requestJson.mock.calls.filter(
        ([, init]) => JSON.parse(String(init?.body)).method === "eth_getLogs",
      ),
    ).toHaveLength(90);
  });
  it("preserves request headroom for later sections and final anchor checks", async () => {
    const { r, spans } = rangeFixture({ code: -32602 }, 2000);
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
    expect(scan.partial).toBe(true);
    expect(r.calls).toBe(r.maxCalls - 12);
  });
  it("does not retry unrelated provider errors", async () => {
    const { r, spans } = rangeFixture({
      code: -32000,
      message: "Synthetic source failure",
    });
    await expect(
      r.range(registry.pons.address, filter, 0, 999999, 20, true, true),
    ).rejects.toMatchObject({ code: "LAUNCH_CARDS_UNAVAILABLE" });
    expect(spans).toHaveLength(1);
  });
  it("validates the configured window and retains the default-off switch", () => {
    const defaults = loadEnv({ NODE_ENV: "test" });
    expect(defaults.LAUNCH_CARDS_ENABLED).toBe(false);
    expect(defaults.LAUNCH_LOG_WINDOW_BLOCKS).toBe(1000000);
    expect(
      env({ LAUNCH_LOG_WINDOW_BLOCKS: "10000000" }).LAUNCH_LOG_WINDOW_BLOCKS,
    ).toBe(10000000);
    for (const value of ["1999", "10000001", "2000.5", "invalid"])
      expect(() => env({ LAUNCH_LOG_WINDOW_BLOCKS: value })).toThrow();
  });
});
