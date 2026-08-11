import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, stringToHex } from "viem";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import type { PortfolioBudget } from "../src/portfolio/budget.js";
import { PortfolioService } from "../src/portfolio/service.js";
import { portfolioRoutes } from "../src/routes/portfolio.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const NFT = "0x4444444444444444444444444444444444444444";
const NFT_1155 = "0x6666666666666666666666666666666666666666";
const UNKNOWN_TOKEN = "0x7777777777777777777777777777777777777777";
const SPENDER = "0x5555555555555555555555555555555555555555";
const TRANSFER_HASH = `0x${"a".repeat(64)}`;
const APPROVAL_HASH = `0x${"b".repeat(64)}`;
const NFT_APPROVAL_HASH = `0x${"c".repeat(64)}`;
const BLOCK_HASH = `0x${"f".repeat(64)}`;
const REORG_HASH = `0x${"e".repeat(64)}`;
const BLOCK_NUMBER = 1_000;
const BLOCK_HEX = "0x3e8";
const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));
const TRANSFER_SINGLE_TOPIC = keccak256(stringToHex("TransferSingle(address,address,address,uint256,uint256)"));
const TRANSFER_BATCH_TOPIC = keccak256(stringToHex("TransferBatch(address,address,address,uint256[],uint256[])"));
const apps: Array<ReturnType<typeof Fastify>> = [];

function portfolioEnv(enabled = true) {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    PORTFOLIO_MODE_ENABLED: String(enabled),
    ALCHEMY_ROBINHOOD_RPC_URL: "https://alchemy.example/v2/private-key",
    BLOCKSCOUT_API_BASE_URL: "https://explorer.example/api/v2",
    PORTFOLIO_MAX_RPC_SUBCALLS: "64"
  });
}

function blockscoutFixture(url: string, options: RpcFixtureOptions = {}): unknown {
  if (url.endsWith("/token-balances")) return [
    {
      value: "999999999999999999999999",
      token: { address_hash: TOKEN, decimals: "not-indexer-trusted", type: "ERC-20", name: "Test Token", symbol: "TST" }
    },
    ...Array.from({ length: options.extraTokens ?? 0 }, (_, index) => ({
      value: "1",
      token: { address_hash: indexedTokenAddress(index), type: "ERC-20", name: `Extra ${index}`, symbol: `X${index}` }
    }))
  ];
  if (url.endsWith("/nft")) return {
    items: [
      { id: "7", token_type: "ERC-721", token: { address_hash: NFT, type: "ERC-721", name: "Test NFT", symbol: "TNFT" } },
      { id: "9", token_type: "ERC-1155", token: { address_hash: NFT_1155, type: "ERC-1155", name: "Edition", symbol: "EDTN" } }
    ]
  };
  if (url.endsWith("/transactions")) return { items: [
    {
      hash: APPROVAL_HASH,
      block_number: BLOCK_NUMBER - 1,
      from: OWNER,
      to: TOKEN,
      value: "0",
      timestamp: "2026-08-10T11:59:00.000Z",
      method: "approve"
    },
    {
      hash: NFT_APPROVAL_HASH,
      block_number: BLOCK_NUMBER - 2,
      from: OWNER,
      to: NFT,
      value: "0",
      timestamp: "2026-08-10T11:58:00.000Z",
      method: "approve"
    }
  ] };
  if (url.endsWith("/token-transfers")) return { items: [{
    transaction_hash: TRANSFER_HASH,
    block_number: BLOCK_NUMBER,
    from: OTHER,
    to: OWNER,
    timestamp: "2026-08-10T12:00:00.000Z",
    total: { value: "999999999999999999999999", decimals: "18" },
    token: { address_hash: TOKEN, type: "ERC-20", decimals: "18", symbol: "TST" }
  }] };
  return { hash: OWNER };
}

type RpcFixtureOptions = {
  reorg?: boolean;
  nftApproved?: string;
  transferStatus?: "0x0" | "0x1" | "0x2";
  transferValue?: `0x${string}`;
  transferDirectFrom?: string;
  transferLogFrom?: string;
  transferLogTo?: string;
  transferLogContract?: string;
  include1155?: boolean;
  nftOwner?: string;
  receiptHash?: string;
  omitTransferLogs?: boolean;
  batchSize?: number;
  extraTokens?: number;
};

function rpcFixture(options: RpcFixtureOptions = {}): ProviderHttp {
  let blockReads = 0;
  return {
    requestJson: vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { id?: string; method?: string; params?: unknown[] } | Array<{ id: string; method: string }>;
      if (!Array.isArray(payload) && payload.method === "eth_getBlockByNumber") {
        blockReads += 1;
        return {
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            number: BLOCK_HEX,
            hash: blockReads === 2 && options.reorg ? REORG_HASH : BLOCK_HASH,
            timestamp: "0x6898a340"
          }
        };
      }
      if (!Array.isArray(payload)) throw new Error("unexpected RPC payload");
      return payload.map((request) => {
        if (request.id === "native") return response(request.id, "0xde0b6b3a7640000");
        if (/^token:\d+$/.test(request.id)) return response(request.id, "0xde0b6b3a7640000");
        if (/^token-decimals:\d+$/.test(request.id)) return response(request.id, "0x12");
        if (request.id === "nft:0") return response(request.id, wordAddress(options.nftOwner ?? OWNER));
        if (request.id === "nft:1") return response(request.id, "0x3");
        if (request.id === "transaction:0") return response(request.id, {
          hash: TRANSFER_HASH,
          blockNumber: BLOCK_HEX,
          blockHash: BLOCK_HASH,
          from: options.transferDirectFrom ?? OTHER,
          to: TOKEN,
          value: options.transferValue ?? "0x0",
          input: "0x"
        });
        if (request.id === "receipt:0") return response(request.id, {
          transactionHash: options.receiptHash ?? TRANSFER_HASH,
          blockNumber: BLOCK_HEX,
          blockHash: BLOCK_HASH,
          status: options.transferStatus ?? "0x1",
          ...(options.omitTransferLogs ? {} : { logs: [
            {
              address: options.transferLogContract ?? TOKEN,
              topics: [
                TRANSFER_TOPIC,
                wordAddress(options.transferLogFrom ?? OTHER),
                wordAddress(options.transferLogTo ?? OWNER)
              ],
              data: wordUint(1_000_000_000_000_000_000n)
            },
            ...(options.include1155 === false ? [] : [{
              address: NFT_1155,
              topics: [TRANSFER_SINGLE_TOPIC, wordAddress(OTHER), wordAddress(OTHER), wordAddress(OWNER)],
              data: `0x${wordUint(9n).slice(2)}${wordUint(2n).slice(2)}`
            }, {
              address: NFT_1155,
              topics: [TRANSFER_BATCH_TOPIC, wordAddress(OTHER), wordAddress(OTHER), wordAddress(OWNER)],
              data: transferBatchData(
                Array.from({ length: options.batchSize ?? 2 }, (_, index) => BigInt(10 + index)),
                Array.from({ length: options.batchSize ?? 2 }, (_, index) => BigInt(2 + index))
              )
            }])
          ] })
        });
        if (request.id === "transaction:1") return response(request.id, {
          hash: APPROVAL_HASH,
          blockNumber: "0x3e7",
          blockHash: `0x${"d".repeat(64)}`,
          from: OWNER,
          to: TOKEN,
          value: "0x0",
          input: `0x095ea7b3${wordAddress(SPENDER).slice(2)}${wordUint((2n ** 256n) - 1n).slice(2)}`
        });
        if (request.id === "receipt:1") return response(request.id, { transactionHash: APPROVAL_HASH, blockNumber: "0x3e7", blockHash: `0x${"d".repeat(64)}`, status: "0x1", logs: [] });
        if (request.id === "transaction:2") return response(request.id, {
          hash: NFT_APPROVAL_HASH,
          blockNumber: "0x3e6",
          blockHash: `0x${"9".repeat(64)}`,
          from: OWNER,
          to: NFT,
          value: "0x0",
          input: `0x095ea7b3${wordAddress(SPENDER).slice(2)}${wordUint(7n).slice(2)}`
        });
        if (request.id === "receipt:2") return response(request.id, { transactionHash: NFT_APPROVAL_HASH, blockNumber: "0x3e6", blockHash: `0x${"9".repeat(64)}`, status: "0x1", logs: [] });
        if (request.id === "approval:0") return response(request.id, `0x${"f".repeat(64)}`);
        if (request.id === "approval:1") return response(request.id, wordAddress(options.nftApproved ?? SPENDER));
        throw new Error(`unexpected RPC request ${request.id}`);
      });
    })
  };
}

function response(id: string, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function wordAddress(address: string): `0x${string}` {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function wordUint(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function transferBatchData(tokenIds: bigint[], quantities: bigint[]): `0x${string}` {
  const idsOffset = 64n;
  const quantitiesOffset = 64n + BigInt(1 + tokenIds.length) * 32n;
  const words = [
    idsOffset,
    quantitiesOffset,
    BigInt(tokenIds.length),
    ...tokenIds,
    BigInt(quantities.length),
    ...quantities
  ];
  return `0x${words.map((value) => wordUint(value).slice(2)).join("")}`;
}

function indexedTokenAddress(index: number): string {
  return `0x${(0x1000 + index).toString(16).padStart(40, "0")}`;
}

function makeService(options: RpcFixtureOptions = {}) {
  const alchemy = rpcFixture(options);
  const blockscout: ProviderHttp = { requestJson: vi.fn(async (url) => blockscoutFixture(url, options)) };
  const budget: PortfolioBudget = { consume: vi.fn().mockResolvedValue(undefined) };
  const service = new PortfolioService(portfolioEnv(), {
    alchemy,
    blockscout,
    budget,
    now: () => new Date("2026-08-10T12:05:00.000Z")
  });
  return { service, alchemy, blockscout, budget };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("finalized portfolio snapshot", () => {
  it("reconciles holdings, activity and fetched-window approvals at one finalized anchor", async () => {
    const { service, alchemy, budget } = makeService();
    const snapshot = await service.snapshot(OWNER.toUpperCase().replace("0X", "0x"));

    expect(snapshot).toMatchObject({
      address: OWNER,
      finality: { tag: "finalized", blockNumber: BLOCK_NUMBER, blockHash: BLOCK_HASH },
      nativeBalanceEth: "1",
      tokens: [{ contract: TOKEN, quantity: "1", symbol: "TST" }],
      nfts: [
        { contract: NFT, tokenId: "7", quantity: "1" },
        { contract: NFT_1155, tokenId: "9", quantity: "3", kind: "erc1155" }
      ],
      transactions: [{ hash: TRANSFER_HASH }, { hash: APPROVAL_HASH }, { hash: NFT_APPROVAL_HASH }],
      approvals: [
        { contract: TOKEN, spender: SPENDER, kind: "erc20", active: true, unlimited: true },
        { contract: NFT, spender: SPENDER, kind: "erc721-token", active: true, unlimited: false, currentAmount: SPENDER }
      ],
      privacy: {
        serverStorage: "none",
        providerDestinations: ["alchemy", "blockscout"]
      }
    });
    expect(snapshot.movements).toContainEqual(expect.objectContaining({
      transactionHash: TRANSFER_HASH,
      kind: "erc20",
      quantity: "1",
      direction: "in"
    }));
    expect(snapshot.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "erc1155", tokenId: "10", quantity: "2" }),
      expect.objectContaining({ kind: "erc1155", tokenId: "11", quantity: "3" })
    ]));
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      direction: "in",
      counterparty: OTHER
    });
    expect(snapshot.movements).toContainEqual(expect.objectContaining({
      transactionHash: TRANSFER_HASH,
      kind: "erc1155",
      contract: NFT_1155,
      tokenId: "9",
      quantity: "2",
      direction: "in"
    }));
    expect(snapshot.movements.map((movement) => movement.quantity)).not.toContain("999999.999999999999999999");
    expect(snapshot.citations.map((citation) => citation.url).join(" ")).not.toContain("private-key");
    expect(budget.consume).toHaveBeenNthCalledWith(1, 1);
    expect(budget.consume).toHaveBeenNthCalledWith(2, 11);
    expect(budget.consume).toHaveBeenNthCalledWith(3, 2);
    expect(budget.consume).toHaveBeenNthCalledWith(4, 1);

    const calls = vi.mocked(alchemy.requestJson).mock.calls;
    const firstBatch = JSON.parse(String(calls[1]?.[1]?.body)) as Array<{ method: string; params: unknown[] }>;
    for (const request of firstBatch) {
      if (request.method === "eth_getBalance") expect(request.params[1]).toBe(BLOCK_HEX);
      if (request.method === "eth_call") expect(request.params[1]).toBe(BLOCK_HEX);
    }
    const approvalBatch = JSON.parse(String(calls[2]?.[1]?.body)) as Array<{ method: string; params: unknown[] }>;
    expect(approvalBatch).toHaveLength(2);
    expect(approvalBatch).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "eth_call", params: [expect.objectContaining({ data: expect.stringMatching(/^0xdd62ed3e/) }), BLOCK_HEX] }),
      expect.objectContaining({ method: "eth_call", params: [expect.objectContaining({ data: expect.stringMatching(/^0x081812fc/) }), BLOCK_HEX] })
    ]));
    const finalCheck = JSON.parse(String(calls[3]?.[1]?.body)) as { params: unknown[] };
    expect(finalCheck.params).toEqual([BLOCK_HEX, false]);
  });

  it("discards the entire snapshot when the anchor hash changes", async () => {
    const { service } = makeService({ reorg: true });
    await expect(service.snapshot(OWNER)).rejects.toMatchObject({ code: "SNAPSHOT_REORGED", statusCode: 503 });
  });

  it("rejects a receipt that does not match its requested transaction", async () => {
    const snapshot = await makeService({ receiptHash: APPROVAL_HASH }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toBeUndefined();
    expect(snapshot.movements.filter((movement) => movement.transactionHash === TRANSFER_HASH)).toEqual([]);
  });

  it("rejects a receipt with no logs array instead of claiming a complete zero-movement decode", async () => {
    const snapshot = await makeService({ omitTransferLogs: true }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toBeUndefined();
  });

  it("does not report movements for failed transactions and rejects unknown receipt status", async () => {
    const failed = await makeService({
      transferStatus: "0x0",
      transferValue: "0xde0b6b3a7640000",
      transferDirectFrom: OWNER
    }).service.snapshot(OWNER);
    expect(failed.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      status: "failed",
      nativeValueEth: "1",
      movementCount: 0
    });
    expect(failed.movements.filter((movement) => movement.transactionHash === TRANSFER_HASH)).toEqual([]);

    const unknown = await makeService({ transferStatus: "0x2", transferValue: "0xde0b6b3a7640000" }).service.snapshot(OWNER);
    expect(unknown.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toBeUndefined();
    expect(unknown.movements.filter((movement) => movement.transactionHash === TRANSFER_HASH)).toEqual([]);
  });

  it("marks a historical ERC-721 approval inactive after the token approval moves", async () => {
    const snapshot = await makeService({ nftApproved: OTHER }).service.snapshot(OWNER);
    expect(snapshot.approvals).toContainEqual(expect.objectContaining({
      transactionHash: NFT_APPROVAL_HASH,
      kind: "erc721-token",
      spender: SPENDER,
      currentAmount: OTHER,
      active: false
    }));
  });

  it("does not attribute an ERC-721 approval after direct ownerOf no longer matches", async () => {
    const snapshot = await makeService({ nftOwner: OTHER }).service.snapshot(OWNER);
    expect(snapshot.nfts.find((nft) => nft.contract === NFT && nft.tokenId === "7")).toBeUndefined();
    expect(snapshot.approvals.find((approval) => approval.kind === "erc721-token")).toBeUndefined();
  });

  it("derives spender-driven transfer direction from verified owner movements", async () => {
    const snapshot = await makeService({
      transferDirectFrom: SPENDER,
      transferLogFrom: OWNER,
      transferLogTo: OTHER,
      include1155: false
    }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      direction: "out",
      counterparty: OTHER,
      movementCount: 1
    });
    expect(snapshot.movements).toContainEqual(expect.objectContaining({
      transactionHash: TRANSFER_HASH,
      direction: "out",
      counterparty: OTHER
    }));
  });

  it("labels owner-called activity mixed when verified movements go both out and in", async () => {
    const snapshot = await makeService({
      transferDirectFrom: OWNER,
      transferLogFrom: OWNER,
      transferLogTo: OTHER
    }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      direction: "mixed",
      movementCoverage: "complete"
    });
  });

  it("marks an owner transfer partial when direct token metadata is unavailable", async () => {
    const snapshot = await makeService({
      transferDirectFrom: OWNER,
      transferLogFrom: OWNER,
      transferLogTo: OTHER,
      transferLogContract: UNKNOWN_TOKEN,
      include1155: false
    }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      direction: "out",
      movementCount: 0,
      movementCoverage: "partial"
    });
    expect(snapshot.attention).toContainEqual(expect.objectContaining({
      title: "Some token movement details were not normalized"
    }));
  });

  it("does not invent direction for a spender-driven partial transfer", async () => {
    const snapshot = await makeService({
      transferDirectFrom: SPENDER,
      transferLogFrom: OWNER,
      transferLogTo: OTHER,
      transferLogContract: UNKNOWN_TOKEN,
      include1155: false
    }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      direction: "mixed",
      counterparty: null,
      movementCount: 0,
      movementCoverage: "partial"
    });
  });

  it("omits transfer candidates with no direct or decoded owner involvement", async () => {
    const snapshot = await makeService({
      transferLogFrom: OTHER,
      transferLogTo: SPENDER,
      include1155: false
    }).service.snapshot(OWNER);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toBeUndefined();
    expect(snapshot.movements.filter((movement) => movement.transactionHash === TRANSFER_HASH)).toEqual([]);
  });

  it("discloses holding and movement truncation instead of presenting caps as complete", async () => {
    const snapshot = await makeService({ extraTokens: 10, batchSize: 45 }).service.snapshot(OWNER);
    expect(snapshot.tokens).toHaveLength(10);
    expect(snapshot.reconciliation.tokenCandidates).toBe(11);
    expect(snapshot.movements).toHaveLength(40);
    expect(snapshot.transactions.find((transaction) => transaction.hash === TRANSFER_HASH)).toMatchObject({
      movementCount: 47,
      movementCoverage: "partial"
    });
    expect(snapshot.reconciliation.truncatedSections).toEqual(expect.arrayContaining([
      "tokens: 10 of 11 candidates evaluated",
      "movements: 40 of 47 decoded rows returned"
    ]));
    expect(snapshot.attention).toContainEqual(expect.objectContaining({ title: "This bounded snapshot was truncated" }));
  });

  it("keeps failed discovery providers in the privacy receipt and degrades bounded sections", async () => {
    const alchemy = rpcFixture();
    const blockscout: ProviderHttp = {
      requestJson: vi.fn(async (url) => {
        if (url.endsWith("/nft")) throw new Error("nft index unavailable");
        return blockscoutFixture(url);
      })
    };
    const service = new PortfolioService(portfolioEnv(), {
      alchemy,
      blockscout,
      budget: { consume: vi.fn().mockResolvedValue(undefined) },
      now: () => new Date("2026-08-10T12:05:00.000Z")
    });
    const snapshot = await service.snapshot(OWNER);
    expect(snapshot.nfts).toEqual([]);
    expect(snapshot.reconciliation.degradedSources).toContain("blockscout:nft");
    expect(snapshot.privacy.providerDestinations).toContain("blockscout");
  });
});

describe("portfolio route boundary", () => {
  it("is flag-gated, strict, uncached and never accepts private Vault context", async () => {
    const source = { snapshot: vi.fn().mockResolvedValue({ ok: true }) };
    const disabled = Fastify({ logger: false });
    apps.push(disabled);
    installErrorHandler(disabled);
    await portfolioRoutes(disabled, portfolioEnv(false), source as never);
    const off = await disabled.inject({ method: "POST", url: "/v1/private/portfolio/snapshot", payload: { address: OWNER } });
    expect(off.statusCode).toBe(503);
    expect(off.json().error.code).toBe("PORTFOLIO_MODE_DISABLED");

    const enabled = Fastify({ logger: false });
    apps.push(enabled);
    installErrorHandler(enabled);
    await portfolioRoutes(enabled, portfolioEnv(true), source as never);
    const privateLeak = await enabled.inject({
      method: "POST",
      url: "/v1/private/portfolio/snapshot",
      payload: { address: OWNER, label: "SECRET-LABEL", purchasePrice: "0.00000001" }
    });
    expect(privateLeak.statusCode).toBe(400);
    expect(source.snapshot).not.toHaveBeenCalled();

    const valid = await enabled.inject({ method: "POST", url: "/v1/private/portfolio/snapshot", payload: { address: OWNER } });
    expect(valid.statusCode).toBe(200);
    expect(valid.headers["cache-control"]).toBe("private, no-store");
    expect(valid.headers.pragma).toBe("no-cache");
    expect(source.snapshot).toHaveBeenCalledWith(OWNER);
  });
});
