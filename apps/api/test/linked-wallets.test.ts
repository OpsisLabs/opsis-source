import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalize, verifyReceipt } from "@rh-chain/shared";
import { keccak256, recoverAddress } from "viem";
import { loadEnv } from "../src/config/env.js";
import { JsonCache } from "../src/cache/service.js";
import { AppError, installErrorHandler } from "../src/http/errors.js";
import { ProviderRequestError } from "../src/chain/provider-http.js";
import { LinkedWalletsService } from "../src/linked-wallets/service.js";
import { FundingExplorer } from "../src/linked-wallets/explorer.js";
import { groupHolders } from "../src/linked-wallets/grouping.js";
import { hubRegistry, reviewedHubs } from "../src/linked-wallets/registry.js";
import { createLinkedWalletsBudget } from "../src/linked-wallets/budget.js";
import { linkedWalletsRoutes } from "../src/routes/linked-wallets.js";
import { installOpsisPreviewGuard, opsisRoutes } from "../src/routes/opsis.js";
import { ReceiptService } from "../src/receipts/service.js";
import { aggregateAbi, multicall3 } from "../src/launches/reader.js";
import { buyerFacts } from "../src/launches/facts.js";
import { events, registry } from "../src/launches/registry.js";
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hash = (n: number) =>
  `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const token = addr(1000),
  funder = addr(2000),
  a = addr(1),
  b = addr(2),
  c = addr(3);
const now = Date.parse("2026-10-19T12:00:00Z");
const env = (extra = {}) =>
  loadEnv({
    NODE_ENV: "test",
    OPSIS_WORKSPACES_ENABLED: "true",
    OPSIS_PUBLIC_ACCESS_ENABLED: "true",
    LINKED_WALLETS_ENABLED: "true",
    ...extra,
  });
const uint = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
function transfer(
  to: string,
  from = funder,
  block = 1,
  value = "10",
  extra = {},
) {
  return {
    from,
    to,
    blockNumber: String(block),
    transactionIndex: "0",
    hash: hash(block * 100 + Number(BigInt(to))),
    value,
    isError: "0",
    txreceipt_status: "1",
    ...extra,
  };
}
function fixture(
  options: {
    wallets?: string[];
    funding?: Record<string, unknown[]>;
    tokens?: Record<string, ReturnType<typeof transfer>[]>;
    internal?: Record<string, unknown[]>;
    balances?: Record<string, bigint>;
    anchor?: number;
    rangeLimit?: number;
    fundingHubs?: string[];
    contracts?: string[];
    changed?: boolean;
    config?: Record<string, string>;
    launch?: ReturnType<typeof buyerFacts>;
    launchError?: boolean;
    buys?: Array<{
      wallet: string;
      timestamp: number;
      transactionHash: string;
    }>;
    clock?: () => number;
    budget?: { consume(n: number): Promise<void> };
    exclude?: Record<string, Record<string, unknown>>;
    realLaunch?: boolean;
    receipt?: ReceiptService;
  } = {},
) {
  const wallets = options.wallets ?? [a, b];
  const reads: Array<{ method: string; params: unknown[] }> = [];
  let blockReads = 0;
  const rpc = {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const call = JSON.parse(String(init?.body));
      reads.push(call);
      const { method, params } = call;
      let result: unknown;
      if (method === "eth_chainId") result = "0x1237";
      else if (method === "eth_getBlockByNumber") {
        blockReads++;
        const n =
          params[0] === "latest"
            ? (options.anchor ?? 100)
            : Number(BigInt(params[0]));
        result = {
          number: `0x${n.toString(16)}`,
          hash: hash(options.changed && blockReads > 1 ? 999 : n + 1),
          timestamp: `0x${(Math.floor((options.clock?.() ?? now) / 1000) - ((options.anchor ?? 100) - n)).toString(16)}`,
        };
      } else if (method === "eth_getCode")
        result = options.contracts?.includes(params[0]) ? "0x6000" : "0x";
      else if (method === "eth_call") {
        const value = (data: string) =>
          uint(
            data === "0x18160ddd"
              ? 1000000000000000000001n
              : (options.balances?.[`0x${data.slice(-40)}`] ??
                  1000000000000000001n),
          );
        if (params[0].to === multicall3) {
          const decoded = decodeFunctionData({
            abi: aggregateAbi,
            data: params[0].data,
          });
          result = encodeFunctionResult({
            abi: aggregateAbi,
            functionName: "aggregate3",
            result: decoded.args[0].map((c) => ({
              success: true,
              returnData: value(c.callData) as `0x${string}`,
            })),
          });
        } else result = value(params[0].data);
      } else if (method === "eth_getLogs") {
        const event = events.pons;
        if (params[0].address === token) {
          const from = Number(BigInt(params[0].fromBlock)),
            to = Number(BigInt(params[0].toBlock));
          if (to - from + 1 > (options.rangeLimit ?? 100_000))
            return {
              id: call.id,
              error: {
                code: 22,
                message: `range over ${options.rangeLimit ?? 100_000} blocks is not supported`,
              },
            };
          const wallet = `0x${String(params[0].topics[2]).slice(-40)}`;
          result = (options.tokens?.[wallet] ?? [])
            .filter(
              (t) =>
                Number(t.blockNumber) >= from && Number(t.blockNumber) <= to,
            )
            .map((t, i) => ({
              address: token,
              topics: encodeEventTopics({
                abi: [events.transfer],
                eventName: "Transfer",
                args: {
                  from: t.from as `0x${string}`,
                  to: t.to as `0x${string}`,
                },
              }),
              data: uint(BigInt(t.value)),
              blockNumber: `0x${Number(t.blockNumber).toString(16)}`,
              blockHash: hash(Number(t.blockNumber) + 1),
              transactionHash: t.hash,
              transactionIndex: "0x0",
              logIndex: `0x${i.toString(16)}`,
            }));
        } else
          result =
            options.realLaunch && params[0].address === registry.pons.address
              ? [
                  {
                    address: registry.pons.address,
                    topics: encodeEventTopics({
                      abi: [event],
                      eventName: event.name,
                      args: {
                        token: token as `0x${string}`,
                        curve: addr(500) as `0x${string}`,
                        deployer: addr(501) as `0x${string}`,
                      },
                    }),
                    data: encodeAbiParameters(
                      event.inputs.filter((i) => !i.indexed),
                      [addr(502), 1n, 1n],
                    ),
                    blockNumber: "0x5a",
                    blockHash: hash(91),
                    transactionHash: hash(900),
                    transactionIndex: "0x0",
                    logIndex: "0x0",
                  },
                ]
              : [];
      } else throw new Error(`Unexpected RPC ${method}`);
      return { jsonrpc: "2.0", id: call.id, result };
    }),
  };
  const explorer = {
    requestJson: vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/holders"))
        return {
          items: wallets.map((wallet) => ({
            address: { hash: wallet, ...options.exclude?.[wallet] },
            value: "1",
          })),
          next_page_params: null,
        };
      if (u.pathname.endsWith(`/addresses/${token}`))
        return { creation_tx_hash: null };
      const wallet = u.searchParams.get("address")!;
      expect(u.searchParams.get("sort")).toBe("asc");
      expect(u.searchParams.get("endblock")).toBe(
        String(options.anchor ?? 100),
      );
      expect(u.searchParams.get("page")).toBe("1");
      expect(u.searchParams.get("offset")).toBe("10");
      expect(u.searchParams.get("action")).not.toBe("tokentx");
      return {
        status: "1",
        result:
          u.searchParams.get("action") === "txlistinternal"
            ? (options.internal?.[wallet] ?? [])
            : (options.funding?.[wallet] ?? [transfer(wallet)]),
      };
    }),
  };
  const config = env(options.config);
  const service = new LinkedWalletsService(config, new JsonCache(), {
    rpc,
    explorer,
    now: options.clock ?? (() => now),
    budget: options.budget ?? { consume: async () => {} },
    receipts: options.receipt,
    ...(options.realLaunch
      ? {}
      : {
          launchFacts: async () => {
            if (options.launchError)
              throw new AppError(
                "LINKED_WALLETS_DAILY_BUDGET_EXCEEDED",
                503,
                "Budget reached",
              );
            return {
              transactions: options.launch?.transactions ?? [],
              buys: options.buys ?? [],
              partial: false,
              fundingHubs: options.fundingHubs ?? [],
            };
          },
        }),
  });
  return { service, rpc, explorer, reads, config };
}

describe("synthetic linked-wallet ground truth", () => {
  it("merges holders funded by an external account, with exact anchored fractions", async () => {
    const f = fixture();
    const g = await f.service.graph(token);
    expect(g.state).toBe("finished");
    expect(g.coverage).toMatchObject({
      explorerCalls: 3,
      explorerCreditsReserved: 150,
      rpcCalls: 8,
    });
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0].members).toEqual([a, b]);
    expect(g.groups[0].share).toEqual({
      numerator: "2000000000000000002",
      denominator: "1000000000000000000001",
    });
    expect(g.groups[0].links).toEqual(
      expect.arrayContaining([
        {
          from: funder,
          to: a,
          kind: "first_funding",
          transactionHashes: [hash(101)],
        },
      ]),
    );
    expect(g.totals.largestSingleWallet?.numerator).toBe("1000000000000000001");
    expect(
      f.reads
        .filter((x) => ["eth_call", "eth_getCode"].includes(x.method))
        .every((x) => x.params[1] === "0x64"),
    ).toBe(true);
  });
  it("auto-flags observed fan-out above 50 and never merges it", async () => {
    const wallets = Array.from({ length: 20 }, (_, i) => addr(i + 1));
    const g = await fixture({
      wallets,
      funding: Object.fromEntries(
        wallets.map((w, i) => [
          w,
          [
            transfer(w),
            ...Array.from({ length: 3 }, (_, j) =>
              transfer(addr(10000 + 3 * i + j), funder, 2),
            ),
          ],
        ]),
      ),
    }).service.graph(token);
    expect(g.groups).toHaveLength(20);
    expect(g.hubs).toContainEqual({
      wallet: funder,
      reason: "fan_out",
      fanOut: 80,
    });
    expect(g.groups.every((group) => group.links.length === 0)).toBe(true);
    expect(g.weakLinks).toHaveLength(190);
  });
  it.each(["router", "bridge", "bundler", "curve payout"])(
    "contract %s funder never merges",
    async () => {
      const g = await fixture({ contracts: [funder] }).service.graph(token);
      expect(g.groups).toHaveLength(2);
      expect(g.hubs).toContainEqual({
        wallet: funder,
        reason: "contract",
        fanOut: 2,
      });
      expect(g.weakLinks[0].kind).toBe("shared_hub");
    },
  );
  it("reviewed hubs never merge even with empty code", async () => {
    expect(hubRegistry.every((h) => h.source.length > 0)).toBe(true);
    const hub = [...reviewedHubs][0];
    const g = await fixture({
      funding: { [a]: [transfer(a, hub)], [b]: [transfer(b, hub)] },
    }).service.graph(token);
    expect(g.groups).toHaveLength(2);
    expect(
      g.hubs.some((h) => h.wallet === hub && h.reason === "registry"),
    ).toBe(true);
  });
  it("links the signer and every holder recipient of release-48 same-tx multi-buy facts", async () => {
    const tx = hash(80),
      source = addr(3000);
    const launch = buyerFacts(
      [b, c].map((to) => ({
        from: source,
        to,
        value: 1n,
        transactionHash: tx,
        blockNumber: 5,
        timestamp: 100,
      })),
      source,
      100,
      new Map([[tx, a]]),
      new Map(),
    );
    const g = await fixture({
      wallets: [a, b, c],
      funding: { [a]: [], [b]: [], [c]: [] },
      launch,
    }).service.graph(token);
    expect(g.groups[0].members).toEqual([a, b, c]);
    expect(g.groups[0].links).toHaveLength(2);
    expect(
      g.groups[0].links.every(
        (e) =>
          e.kind === "same_signer_multi_buy" && e.transactionHashes[0] === tx,
      ),
    ).toBe(true);
  });
  it("a contract signer cannot join recipients through multi-buy facts", async () => {
    const launch = {
      tags: [],
      transactions: [
        {
          signer: a,
          recipients: [b, c],
          transactionHash: hash(50),
          deliveredRaw: "2",
        },
      ],
    };
    const g = await fixture({
      wallets: [a, b, c],
      funding: { [a]: [], [b]: [], [c]: [] },
      contracts: [a],
      launch,
    }).service.graph(token);
    expect(g.groups).toHaveLength(3);
  });
  it("later inbound dust does not link independently funded wallets", async () => {
    const dust = addr(4000);
    const g = await fixture({
      funding: {
        [a]: [transfer(a, addr(2001), 1), transfer(a, dust, 2, "1")],
        [b]: [transfer(b, addr(2002), 1), transfer(b, dust, 2, "1")],
      },
    }).service.graph(token);
    expect(g.groups).toHaveLength(2);
    expect(g.groups.flatMap((x) => x.links).some((l) => l.from === dust)).toBe(
      false,
    );
  });
  it("uses dRPC launched-token funding when native pages are empty, in at most 100,000-block windows", async () => {
    const f = fixture({
      anchor: 250_000,
      rangeLimit: 100_000,
      funding: { [a]: [], [b]: [] },
      tokens: {
        [a]: [transfer(a, funder, 150_000)],
        [b]: [transfer(b, funder, 150_001)],
      },
    });
    const g = await f.service.graph(token);
    expect(g.groups[0].members).toEqual([a, b]);
    expect(g.groups[0].links.every((l) => l.from === funder)).toBe(true);
    const logs = f.reads.filter((r) => r.method === "eth_getLogs");
    expect(logs).toHaveLength(4);
    expect(
      logs.every(
        (r) =>
          Number(BigInt((r.params[0] as { toBlock: string }).toBlock)) -
            Number(BigInt((r.params[0] as { fromBlock: string }).fromBlock)) <
          100_000,
      ),
    ).toBe(true);
    expect(g.coverage.rpcCalls).toBeLessThanOrEqual(300);
  });
  it("learns a narrower code-22 range and bounds log attempts per wallet", async () => {
    const f = fixture({
      wallets: [a],
      anchor: 120_000,
      rangeLimit: 50_000,
      funding: { [a]: [] },
      tokens: { [a]: [transfer(a, funder, 60_000)] },
    });
    const g = await f.service.graph(token);
    expect(g.holders[0].funding).toBe("checked");
    expect(
      f.reads.filter((r) => r.method === "eth_getLogs").length,
    ).toBeLessThanOrEqual(4);
  });
  it("marks a wallet not checked (cap) when no first inbound is found", async () => {
    const outbound = Array.from({ length: 10 }, (_, i) =>
      transfer(addr(10000 + i), a, 1),
    );
    const g = await fixture({
      funding: { [a]: outbound, [b]: [] },
      config: { LINKED_WALLETS_WALLET_PAGE_CAP: "1" },
    }).service.graph(token);
    expect(g.state).toBe("partial");
    expect(g.holders[0].funding).toBe("not checked (cap)");
    expect(g.notChecked).toContainEqual({
      wallet: a,
      reason: "not checked (cap): oldest native pages contain no inbound value",
    });
    expect(g.groups.every((group) => group.members.length === 1)).toBe(true);
  });
  it("caps an attempted group above 50 and freezes affected groups", () => {
    const holders = Array.from({ length: 53 }, (_, i) => ({
      wallet: addr(i + 1),
      balanceRaw: "1",
      share: { numerator: "1", denominator: "100" },
      funding: "checked" as const,
    }));
    const links = holders.slice(1).map((h, i) => ({
      from: holders[i].wallet,
      to: h.wallet,
      kind: "first_funding" as const,
      transactionHashes: [hash(i + 1)],
    }));
    const result = groupHolders(holders, links, new Set(), 100n);
    expect(Math.max(...result.groups.map((g) => g.members.length))).toBe(50);
    expect(result.cappedLinks).toHaveLength(3);
    expect(
      result.groups.every((g) => g.status === "large group, review needed"),
    ).toBe(true);
    expect(
      groupHolders(holders, links.slice().reverse(), new Set(), 100n),
    ).toEqual(result);
  });
  it("explorer cap returns partial with unchecked holders and no call overrun", async () => {
    const f = fixture({ config: { LINKED_WALLETS_MAX_EXPLORER_CALLS: "2" } });
    const g = await f.service.graph(token);
    expect(g.state).toBe("partial");
    expect(g.coverage.explorerCalls).toBe(2);
    expect(f.explorer.requestJson).toHaveBeenCalledTimes(2);
    expect(g.notChecked.map((h) => h.wallet)).toEqual([b]);
  });
  it("daily budget exhaustion returns partial and preserves a reserved anchor recheck", async () => {
    let spent = 0;
    const f = fixture({
      budget: {
        consume: async (n) => {
          if (spent + n > 60)
            throw new AppError(
              "LINKED_WALLETS_DAILY_BUDGET_EXCEEDED",
              503,
              "Budget reached",
            );
          spent += n;
        },
      },
    });
    const g = await f.service.graph(token);
    expect(g.state).toBe("partial");
    expect(g.notChecked).toHaveLength(2);
    expect(f.reads.at(-1)?.method).toBe("eth_getBlockByNumber");
    expect(spent).toBeLessThanOrEqual(60);
  });
  it("RPC cap gives partial without bypassing its final anchor reservation", async () => {
    const f = fixture({
      wallets: Array.from({ length: 8 }, (_, i) => addr(i + 1)),
      config: { LINKED_WALLETS_MAX_RPC_CALLS: "10" },
    });
    const g = await f.service.graph(token);
    expect(g.state).toBe("partial");
    expect(g.coverage.rpcCalls).toBeLessThanOrEqual(10);
    expect(f.reads.at(-1)?.method).toBe("eth_getBlockByNumber");
  });
  it("refuses an anchor change", async () => {
    await expect(
      fixture({ changed: true }).service.graph(token),
    ).rejects.toMatchObject({ code: "LINKED_WALLETS_ANCHOR_CHANGED" });
  });
  it("coalesces concurrent reads, marks cached responses and preserves observation time", async () => {
    const f = fixture();
    const [first, second] = await Promise.all([
      f.service.graph(token),
      f.service.graph(token),
    ]);
    const calls = f.rpc.requestJson.mock.calls.length;
    expect(first.servedFrom).toBe("fresh");
    expect(second.servedFrom).toBe("cache");
    expect(second.observedAt).toBe(first.observedAt);
    const cached = await f.service.graph(token);
    expect(cached.servedFrom).toBe("cache");
    expect(cached.observedAt).toBe(first.observedAt);
    expect(f.rpc.requestJson).toHaveBeenCalledTimes(calls);
  });
  it("does not cache partial observations", async () => {
    const f = fixture({ launchError: true });
    expect((await f.service.graph(token)).state).toBe("partial");
    const n = f.rpc.requestJson.mock.calls.length;
    await f.service.graph(token);
    expect(f.rpc.requestJson.mock.calls.length).toBeGreaterThan(n);
  });
  it("separates token, burn and labelled pool addresses from grouping", async () => {
    const burn = addr(0);
    const g = await fixture({
      wallets: [a, b, token, burn, c],
      exclude: { [c]: { is_contract: true, name: "Synthetic Pool" } },
    }).service.graph(token);
    expect(g.holders.map((h) => h.wallet)).toEqual([a, b]);
    expect(g.excluded.map((h) => h.reason)).toEqual(["token", "burn", "pool"]);
  });
  it("fails closed before reads when disabled", async () => {
    const f = fixture({ config: { LINKED_WALLETS_ENABLED: "false" } });
    await expect(f.service.graph(token)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(f.rpc.requestJson).not.toHaveBeenCalled();
    expect(f.explorer.requestJson).not.toHaveBeenCalled();
  });
  it("includes an independently verifiable receipt when enabled", async () => {
    const account = privateKeyToAccount(hash(1234));
    const receipt = new ReceiptService(
      {
        address: account.address,
        signDigest: (hash) => account.sign({ hash }),
      },
      [
        {
          address: account.address,
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null,
        },
      ],
      "a".repeat(40),
      () => now,
    );
    const f = fixture({
      config: {
        RECEIPTS_ENABLED: "true",
        RECEIPT_SIGNING_KEY: hash(1234),
        BUILD_SHA: "a".repeat(40),
      },
      receipt,
    });
    const g = await f.service.graph(token);
    expect(g.receipt).toBeDefined();
    const result = await verifyReceipt(canonicalize(g.receipt!), receipt.keys, {
      keccak256,
      recoverAddress,
    });
    expect(result.valid).toBe(true);
    expect(g.receipt!.sources.some((s) => s.provider === "blockscout")).toBe(
      true,
    );
    expect((await f.service.graph(token)).receipt).toEqual(g.receipt);
  });
  it("missing receipt service refuses an enabled receipt", async () => {
    await expect(
      fixture({
        config: {
          RECEIPTS_ENABLED: "true",
          RECEIPT_SIGNING_KEY: hash(1234),
          BUILD_SHA: "a".repeat(40),
        },
      }).service.graph(token),
    ).rejects.toMatchObject({ code: "RECEIPTS_UNAVAILABLE" });
  });
  it("composes the real bounded launch reader without a second latest anchor", async () => {
    // No discovered launch in this synthetic chain; launch coverage stays partial.
    const f = fixture({ realLaunch: true });
    // Keep this fixture log-free: separate launch suite verifies ABI-derived multi-buy facts.
    const original = f.rpc.requestJson.getMockImplementation()!;
    f.rpc.requestJson.mockImplementation(async (url, init) => {
      const call = JSON.parse(String(init?.body));
      if (call.method !== "eth_getLogs") return original(url, init);
      f.reads.push(call);
      return { id: call.id, result: [] };
    });
    const g = await f.service.graph(token);
    expect(g.coverage.launchFacts).toBe("partial");
    expect(g.coverage.explorerCalls).toBe(4);
    expect(g.coverage.explorerCreditsReserved).toBe(200);
    expect(
      f.reads.filter(
        (r) => r.method === "eth_getBlockByNumber" && r.params[0] === "latest",
      ),
    ).toHaveLength(1);
  });
});

it("exposes an always-present default-off capability and protects the route", async () => {
  const app = Fastify();
  const config = env({ LINKED_WALLETS_ENABLED: "false" });
  installErrorHandler(app);
  installOpsisPreviewGuard(app, config);
  await opsisRoutes(app, config);
  const graph = vi.fn();
  await linkedWalletsRoutes(app, config, { graph });
  const access = await app.inject({
    method: "POST",
    url: "/v1/private/opsis/access",
  });
  expect(access.json().linkedWallets).toBe(false);
  expect(
    access
      .json()
      .manifest.capabilities.find(
        (r: { id: string }) => r.id === "linkedWallets",
      )?.enabled,
  ).toBe(false);
  expect(
    (await app.inject({ url: `/v1/private/opsis/linked-wallets/${token}` }))
      .statusCode,
  ).toBe(404);
  expect(graph).not.toHaveBeenCalled();
  await app.close();
});
it("requires preview authorization and validates query parameters before work", async () => {
  const app = Fastify();
  const config = env({ OPSIS_PUBLIC_ACCESS_ENABLED: "false" });
  installErrorHandler(app);
  installOpsisPreviewGuard(app, config);
  const graph = vi.fn();
  await linkedWalletsRoutes(app, config, { graph });
  expect(
    (await app.inject({ url: `/v1/private/opsis/linked-wallets/${token}` }))
      .statusCode,
  ).toBe(404);
  expect(graph).not.toHaveBeenCalled();
  await app.close();
  const open = Fastify();
  installErrorHandler(open);
  await linkedWalletsRoutes(open, env(), { graph });
  expect(
    (
      await open.inject({
        url: `/v1/private/opsis/linked-wallets/${token}?extra=1`,
      })
    ).statusCode,
  ).toBe(400);
  expect(graph).not.toHaveBeenCalled();
  await open.close();
});
it("daily ledger enforces UTC rollover and production requires shared storage", async () => {
  let time = new Date(now);
  const budget = createLinkedWalletsBudget(
    env({ LINKED_WALLETS_DAILY_BUDGET: "50" }),
    undefined,
    () => time,
  );
  await budget.consume(50);
  await expect(budget.consume(1)).rejects.toMatchObject({
    code: "LINKED_WALLETS_DAILY_BUDGET_EXCEEDED",
  });
  time = new Date(now + 86400000);
  await budget.consume(1);
  await expect(
    createLinkedWalletsBudget({ ...env(), NODE_ENV: "production" }).consume(1),
  ).rejects.toMatchObject({ code: "LINKED_WALLETS_BUDGET_UNAVAILABLE" });
});
it("rejects malformed or reversed oldest-first evidence instead of inferring a link", async () => {
  const explorer = new FundingExplorer(
    env(),
    { consume: async () => {} },
    () => now,
    {
      requestJson: async () => ({
        status: "1",
        result: [transfer(a, funder, 2), transfer(a, funder, 1)],
      }),
    },
  );
  await expect(explorer.firstFunding(a, 100)).rejects.toThrow(
    "Invalid oldest-first evidence",
  );
});

it("same-second buys are weak links and never merge independently funded holders", async () => {
  const f = fixture({
    funding: { [a]: [transfer(a, addr(2001))], [b]: [transfer(b, addr(2002))] },
    buys: [
      { wallet: a, timestamp: 42, transactionHash: hash(800) },
      { wallet: b, timestamp: 42, transactionHash: hash(801) },
    ],
  });
  const g = await f.service.graph(token);
  expect(g.groups).toHaveLength(2);
  expect(g.weakLinks).toEqual([
    {
      from: a,
      to: b,
      kind: "same_second",
      transactionHashes: [hash(800), hash(801)],
    },
  ]);
});
it("expires finished cache entries using the original observation time", async () => {
  let time = now;
  const f = fixture({ clock: () => time });
  const first = await f.service.graph(token);
  const count = f.rpc.requestJson.mock.calls.length;
  time += 600001;
  const next = await f.service.graph(token);
  expect(next.servedFrom).toBe("fresh");
  expect(next.observedAt).not.toBe(first.observedAt);
  expect(f.rpc.requestJson.mock.calls.length).toBeGreaterThan(count);
});
it("clears a refused in-flight computation for a later retry", async () => {
  const f = fixture();
  f.rpc.requestJson.mockRejectedValueOnce(new Error("synthetic failure"));
  await expect(f.service.graph(token)).rejects.toThrow();
  expect((await f.service.graph(token)).state).toBe("finished");
});
it("bounds TTL configuration at sixty minutes and keeps the feature default-off", () => {
  const defaults = loadEnv({ NODE_ENV: "test" });
  expect(defaults.LINKED_WALLETS_ENABLED).toBe(false);
  expect(defaults.LINKED_WALLETS_MAX_EXPLORER_CALLS).toBe(40);
  expect(defaults.LINKED_WALLETS_MAX_RPC_CALLS).toBe(300);
  expect(defaults.LINKED_WALLETS_FUNDING_HOLDERS).toBe(20);
  expect(() => env({ LINKED_WALLETS_FUNDING_HOLDERS: "41" })).toThrow();
  expect(defaults.LINKED_WALLETS_CACHE_SECONDS).toBe(600);
  expect(() => env({ LINKED_WALLETS_CACHE_SECONDS: "3601" })).toThrow();
});

describe("bounded funding and explorer resilience", () => {
  const walletCalls = (f: ReturnType<typeof fixture>) =>
    f.explorer.requestJson.mock.calls
      .map(([url]) => new URL(url))
      .filter((url) => url.searchParams.has("address"));
  function failWallet(
    f: ReturnType<typeof fixture>,
    code: string,
    times = Infinity,
  ) {
    const original = f.explorer.requestJson.getMockImplementation()!;
    let failures = 0;
    f.explorer.requestJson.mockImplementation(async (url) => {
      if (new URL(url).searchParams.get("address") === a && failures++ < times)
        throw new ProviderRequestError(
          code,
          code !== "PROVIDER_CREDITS_EXHAUSTED",
        );
      return original(url);
    });
  }
  it("checks 20 holders within 40 calls / 2,000 credits, including launch explorer work and five internal fallbacks", async () => {
    const wallets = Array.from({ length: 99 }, (_, i) => addr(i + 1));
    const fallback = wallets.slice(0, 5);
    const f = fixture({
      wallets,
      realLaunch: true,
      funding: Object.fromEntries(fallback.map((wallet) => [wallet, []])),
      internal: Object.fromEntries(
        fallback.map((wallet) => [wallet, [transfer(wallet)]]),
      ),
    });
    let active = 0,
      peak = 0;
    const original = f.explorer.requestJson.getMockImplementation()!;
    f.explorer.requestJson.mockImplementation(async (url) => {
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return await original(url);
      } finally {
        active--;
      }
    });
    const g = await f.service.graph(token);
    expect(g.holders.filter((h) => h.funding === "checked")).toHaveLength(20);
    expect(
      g.notChecked.filter((h) => h.reason === "not checked (beyond top 20)"),
    ).toHaveLength(79);
    expect(g.coverage.explorerCalls).toBe(27); // holders + creation + 20 native + 5 internal
    expect(g.coverage.explorerCreditsReserved).toBe(1350);
    expect(g.coverage.explorerCalls).toBeLessThanOrEqual(40);
    expect(g.coverage.rpcCalls).toBeLessThanOrEqual(300);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(
      walletCalls(f).filter(
        (u) => u.searchParams.get("action") === "txlistinternal",
      ),
    ).toHaveLength(5);
  }, 15_000);
  it("uses internal funding only when the native page contains no inbound value", async () => {
    const f = fixture({
      funding: { [a]: [transfer(a, funder, 1, "0")] },
      internal: { [a]: [transfer(a)] },
    });
    const g = await f.service.graph(token);
    expect(g.holders.every((h) => h.funding === "checked")).toBe(true);
    expect(
      walletCalls(f)
        .filter((u) => u.searchParams.get("action") === "txlistinternal")
        .map((u) => u.searchParams.get("address")),
    ).toEqual([a]);
    expect(f.reads.some((r) => r.method === "eth_getLogs")).toBe(false);
  });
  it("retries a 5xx once successfully, reserving credits for both attempts", async () => {
    const f = fixture();
    failWallet(f, "PROVIDER_HTTP_500", 1);
    const g = await f.service.graph(token);
    expect(g.state).toBe("finished");
    expect(g.coverage.explorerCalls).toBe(4);
    expect(g.coverage.explorerCreditsReserved).toBe(200);
  });
  it.each(["PROVIDER_HTTP_503", "PROVIDER_TIMEOUT", "PROVIDER_RATE_LIMITED"])(
    "a failed %s retry affects only its wallet",
    async (code) => {
      const wallets = Array.from({ length: 8 }, (_, i) => addr(i + 1));
      const f = fixture({ wallets });
      failWallet(f, code);
      const g = await f.service.graph(token);
      expect(g.holders.find((h) => h.wallet === a)?.funding).toBe(
        "unavailable",
      );
      expect(g.notChecked).toEqual([
        { wallet: a, reason: `unavailable: ${code}` },
      ]);
      expect(
        g.holders
          .filter((h) => h.wallet !== a)
          .every((h) => h.funding === "checked"),
      ).toBe(true);
      expect(
        walletCalls(f).filter((u) => u.searchParams.get("address") === a),
      ).toHaveLength(2);
    },
  );
  it("a real credit cap stops queued wallets without retrying", async () => {
    const wallets = Array.from({ length: 12 }, (_, i) => addr(i + 1));
    const f = fixture({ wallets });
    failWallet(f, "PROVIDER_CREDITS_EXHAUSTED");
    const g = await f.service.graph(token);
    expect(g.state).toBe("partial");
    expect(walletCalls(f).length).toBeLessThanOrEqual(4);
    expect(g.notChecked).toContainEqual({
      wallet: wallets.at(-1),
      reason: "not checked (cap): PROVIDER_CREDITS_EXHAUSTED",
    });
  });
  it("retries the holder list once on 5xx", async () => {
    const f = fixture();
    f.explorer.requestJson.mockRejectedValueOnce(
      new ProviderRequestError("PROVIDER_HTTP_500", true),
    );
    const g = await f.service.graph(token);
    expect(g.coverage.holderListComplete).toBe(true);
    expect(g.coverage.explorerCalls).toBe(4);
    expect(
      f.explorer.requestJson.mock.calls.filter(([u]) => u.endsWith("/holders")),
    ).toHaveLength(2);
  });
  it("sorts anchored balances after exclusions, with exact beyond-top-N reasons", async () => {
    const hub = [...reviewedHubs][0]!;
    const f = fixture({
      wallets: [hub, a, b, c, addr(4)],
      fundingHubs: [addr(4)],
      balances: { [a]: 1n, [b]: 3n, [c]: 2n },
      config: { LINKED_WALLETS_FUNDING_HOLDERS: "2" },
    });
    const g = await f.service.graph(token);
    expect(g.holders.find((h) => h.wallet === a)?.funding).toBe(
      "not checked (beyond top N)",
    );
    expect(g.notChecked).toContainEqual({
      wallet: a,
      reason: "not checked (beyond top 2)",
    });
    expect(g.notChecked).toContainEqual({
      wallet: hub,
      reason: "not checked (known hub)",
    });
    expect(g.notChecked).toContainEqual({
      wallet: addr(4),
      reason: "not checked (known hub)",
    });
    expect(
      walletCalls(f)
        .map((u) => u.searchParams.get("address"))
        .sort(),
    ).toEqual([b, c]);
    expect((await f.service.graph(token)).servedFrom).toBe("cache");
  });
  it("a bounded token scan cap affects only that wallet", async () => {
    const f = fixture({
      wallets: [a, b, c],
      anchor: 500_000,
      funding: { [a]: [] },
      config: { LINKED_WALLETS_WALLET_PAGE_CAP: "1" },
    });
    const g = await f.service.graph(token);
    expect(g.notChecked).toContainEqual({
      wallet: a,
      reason: "not checked (cap): Token funding log-window cap reached",
    });
    expect(
      g.holders
        .filter((h) => h.wallet !== a)
        .every((h) => h.funding === "checked"),
    ).toBe(true);
  });
});

it("launch composition does not multiply the explorer's single 5xx retry", async () => {
  const f = fixture({ realLaunch: true });
  const original = f.explorer.requestJson.getMockImplementation()!;
  f.explorer.requestJson.mockImplementation(async (url) => {
    if (url.endsWith(`/addresses/${token}`))
      throw new ProviderRequestError("PROVIDER_HTTP_500", true);
    return original(url);
  });
  const g = await f.service.graph(token);
  expect(
    f.explorer.requestJson.mock.calls.filter(([url]) =>
      url.endsWith(`/addresses/${token}`),
    ),
  ).toHaveLength(2);
  expect(g.coverage.explorerCalls).toBe(5);
});
it("drains admitted explorer work before freezing accounting and bounds all transports to four slots", async () => {
  let active = 0,
    peak = 0;
  const explorer = new FundingExplorer(
    env(),
    { consume: async () => {} },
    () => now,
    {
      requestJson: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return { items: [], next_page_params: null };
      },
    },
  );
  const work = Array.from({ length: 5 }, () =>
    explorer.launchHttp.requestJson("https://explorer.example/api/v2/test"),
  );
  await explorer.settle();
  expect(active).toBe(0);
  expect(peak).toBe(4);
  expect(explorer.calls).toBe(5);
  await Promise.all(work);
});
