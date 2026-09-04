import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiExplorerAnswer, NormalizedEntity } from "@rh-chain/shared";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { memoryStore } from "../src/db/memory.js";
import { ChainEntityResolver } from "../src/chain/resolver.js";
import {
  applyPrivateProviderCoverage,
  resolvePrivateWithinDeadline
} from "../src/routes/private.js";
import { JsonCache } from "../src/cache/service.js";
import type { ChainProvider, SourceDocumentInput } from "../src/chain/types.js";
import type { PrismaClient } from "@prisma/client";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
const identifier = "0x0000000000000000000000000000000000000042";
const entity: NormalizedEntity = {
  chainId: 4663,
  type: "wallet",
  value: identifier,
  facts: { nativeBalance: "0" },
  citations: [{
    id: "source-1",
    provider: "blockscout",
    url: "https://robinhoodchain.blockscout.com/address/example",
    fetchedAt: "2026-08-10T00:00:00.000Z",
    fieldsUsed: ["nativeBalance"],
    description: "Public wallet summary"
  }],
  riskNotes: []
};
const answer: AiExplorerAnswer = {
  answer: "A deterministic, read-only explanation.",
  summaryBullets: ["No model provider was used."],
  confirmedFacts: [],
  inferences: [],
  facts: entity.facts,
  uncertainty: [],
  riskNotes: [],
  citations: entity.citations,
  suggestedQuestions: [],
  suggestedFollowUps: []
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  memoryStore.users.clear();
  memoryStore.usersByEmail.clear();
  memoryStore.usersByWallet.clear();
  memoryStore.usernames.clear();
  memoryStore.refreshTokens.clear();
  memoryStore.authTokens.clear();
  memoryStore.sessions.clear();
  memoryStore.messages.clear();
  memoryStore.usage = [];
  memoryStore.auditLogs = [];
});

describe("no-account Private Mode", () => {
  it("fails the complete resolution after its overall provider deadline", async () => {
    const neverResolves = vi.fn(() => new Promise<never>(() => undefined));

    await expect(resolvePrivateWithinDeadline(neverResolves, 5)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      statusCode: 503
    });
    expect(neverResolves).toHaveBeenCalledOnce();
  });

  it("returns a bounded provider error when the complete private route stalls", async () => {
    const resolve = vi.fn(() => new Promise<never>(() => undefined));
    const answerQuestion = vi.fn(async () => answer);
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }), undefined, {
      privateAnalysis: { resolve, answer: answerQuestion, resolutionTimeoutMs: 5 }
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      payload: { entity: identifier, question: "What should a beginner notice?" }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(resolve).toHaveBeenCalledOnce();
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it("never turns unavailable indexer activity into verified zero counts", () => {
    const covered = applyPrivateProviderCoverage({
      entity: {
        ...entity,
        facts: {
          ...entity.facts,
          transactionsFetched: 0,
          recentTransactions: [],
          tokenBalances: [],
          hasTokens: false
        }
      },
      providerDestinations: ["blockscout", "robinhood-public-rpc"],
      sources: [{
        id: "rpc-balance",
        provider: "robinhood-public-rpc",
        chainId: 4663,
        entityType: "wallet",
        entityValue: identifier,
        requestUrl: "https://rpc.mainnet.chain.robinhood.com",
        responseJson: { method: "eth_getBalance", result: "0x0" },
        fetchedAt: "2026-09-01T00:00:00.000Z"
      }]
    });

    expect(covered.entity.facts).toMatchObject({
      activityCoverage: "unavailable",
      tokenBalanceCoverage: "unavailable"
    });
    expect(covered.entity.facts.transactionsFetched).toBeUndefined();
    expect(covered.entity.facts.recentTransactions).toBeUndefined();
    expect(covered.entity.facts.tokenBalances).toBeUndefined();
    expect(covered.entity.facts.hasTokens).toBeUndefined();
  });

  it("keeps a direct reviewed token sample when the indexer is unavailable", () => {
    const covered = applyPrivateProviderCoverage({
      entity: {
        ...entity,
        facts: {
          nativeBalanceEth: "0.8",
          transactionsFetched: 0,
          recentTransactions: [],
          tokenBalanceCoverage: "reviewed_asset_sample",
          tokenBalanceContractsChecked: 12,
          tokenBalances: [{ tokenSymbol: "AAPL", formattedValue: "0.5" }]
        }
      },
      providerDestinations: ["blockscout", "robinhood-public-rpc"],
      sources: [{
        id: "reviewed-balances",
        provider: "robinhood-public-rpc",
        chainId: 4663,
        entityType: "wallet",
        entityValue: identifier,
        requestUrl: "https://rpc.mainnet.chain.robinhood.com",
        responseJson: {
          method: "eth_call",
          query: "reviewedTokenBalanceSample",
          contractsChecked: 12,
          items: [{ token: { symbol: "AAPL", decimals: 18 }, value: "500000000000000000" }]
        },
        fetchedAt: "2026-09-02T00:00:00.000Z"
      }]
    });

    expect(covered.entity.facts).toMatchObject({
      activityCoverage: "unavailable",
      tokenBalanceCoverage: "reviewed_asset_sample",
      tokenBalanceContractsChecked: 12,
      tokenBalances: [{ tokenSymbol: "AAPL", formattedValue: "0.5" }]
    });
    expect(covered.entity.facts.transactionsFetched).toBeUndefined();
  });

  it("keeps the official public RPC fallback scoped to the ephemeral resolver", async () => {
    const source = await import("../src/routes/private.js");
    expect(source.privateResolverEnvironment(loadEnv({ NODE_ENV: "test" }))).toMatchObject({
      ENABLE_PUBLIC_RPC_FALLBACK: true,
      PROVIDER_MAX_RETRIES: 0
    });
  });

  it("returns an ephemeral deterministic analysis without auth or server records", async () => {
    const resolve = vi.fn(async () => ({
      entity,
      providerDestinations: ["blockscout"],
      sources: [{
        id: "source-1",
        provider: "blockscout",
        chainId: 4663,
        entityType: "wallet" as const,
        entityValue: identifier,
        responseJson: { nativeBalance: "0" },
        fetchedAt: "2026-08-10T00:00:00.000Z"
      }]
    }));
    const answerQuestion = vi.fn(async () => answer);
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }), undefined, {
      privateAnalysis: { resolve, answer: answerQuestion }
    });
    apps.push(app);
    const before = snapshotMemory();
    const privateQuestion = "private-canary-do-not-save";

    const response = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      payload: { entity: identifier, question: privateQuestion }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "private",
      entity: { value: identifier },
      answer: { answer: answer.answer },
      privacy: {
        accountRequired: false,
        walletConnectionRequired: false,
        serverStorage: "none",
        browserStorage: "memory_only",
        clearsOnReload: true,
        modelProvider: "none",
        providerDestinations: ["blockscout"]
      }
    });
    expect(resolve).toHaveBeenCalledWith("unknown", identifier, {
      limit: 25,
      includeApprovals: false,
      privateMode: true
    });
    expect(answerQuestion).toHaveBeenCalledWith(privateQuestion, expect.objectContaining({
      ...entity,
      facts: expect.objectContaining({
        ...entity.facts,
        activityCoverage: "unavailable",
        tokenBalanceCoverage: "unavailable"
      })
    }));
    expect(snapshotMemory()).toEqual(before);
    expect(JSON.stringify(memoryStore)).not.toContain(privateQuestion);
  });

  it("uses a bounded strict input shape", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }), undefined, {
      privateAnalysis: {
        resolve: vi.fn(),
        answer: vi.fn()
      }
    });
    apps.push(app);

    const extra = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      payload: { entity: identifier, unexpected: "not accepted" }
    });
    const oversized = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      payload: { entity: identifier, question: "x".repeat(501) }
    });

    expect(extra.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(400);
  });

  it("fails closed behind the release kill switch", async () => {
    const resolve = vi.fn();
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PRIVATE_MODE_ENABLED: "false"
    }), undefined, { privateAnalysis: { resolve, answer: vi.fn() } });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      payload: { entity: identifier }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("PRIVATE_MODE_DISABLED");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("bypasses cache reads, cache writes, and Prisma persistence in the real resolver", async () => {
    const source: SourceDocumentInput = {
      id: "resolver-source",
      provider: "blockscout",
      chainId: 4663,
      entityType: "wallet",
      entityValue: identifier,
      responseJson: { hash: identifier, is_contract: false, coin_balance: "0" },
      fetchedAt: "2026-08-10T00:00:00.000Z"
    };
    const blockscout = provider({ address: [source] });
    const alchemy = {
      name: "alchemy",
      getTransaction: vi.fn(async () => []),
      getAddressSummary: vi.fn(async () => []),
      getAllowances: vi.fn(async () => [])
    };
    const goldrush = provider({});
    const cache = new JsonCache(undefined, 60);
    const cacheGet = vi.spyOn(cache, "get");
    const cacheSet = vi.spyOn(cache, "set");
    const persistedGet = vi.fn();
    const persistedUpsert = vi.fn();
    const prisma = {
      cachedApiResponse: { findFirst: persistedGet, upsert: persistedUpsert }
    } as unknown as PrismaClient;
    const resolver = new ChainEntityResolver(loadEnv({ NODE_ENV: "test" }), cache, prisma, {
      blockscout,
      alchemy,
      goldrush
    });

    const resolution = await resolver.resolveWithSources("unknown", identifier, { privateMode: true });

    expect(resolution.entity.value).toBe(identifier);
    expect(cacheGet).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
    expect(persistedGet).not.toHaveBeenCalled();
    expect(persistedUpsert).not.toHaveBeenCalled();
  });

  it("uses the reviewed direct-balance sample only when Private Mode lacks indexer balances", async () => {
    const rpcSource = (id: string, method: string, result: string): SourceDocumentInput => ({
      id,
      provider: "robinhood-public-rpc",
      chainId: 4663,
      entityType: "wallet",
      entityValue: identifier,
      requestUrl: "https://rpc.mainnet.chain.robinhood.com",
      responseJson: { method, result },
      fetchedAt: "2026-09-02T00:00:00.000Z"
    });
    const getReviewedAssetBalances = vi.fn(async (): Promise<SourceDocumentInput[]> => [{
      id: "reviewed-sample",
      provider: "robinhood-public-rpc",
      chainId: 4663,
      entityType: "wallet",
      entityValue: identifier,
      requestUrl: "https://rpc.mainnet.chain.robinhood.com",
      responseJson: {
        method: "eth_call",
        query: "reviewedTokenBalanceSample",
        contractsChecked: 12,
        items: [{
          token: {
            address_hash: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
            name: "Apple",
            symbol: "AAPL",
            type: "ERC-20",
            decimals: 18
          },
          value: "1250000000000000000"
        }]
      },
      fetchedAt: "2026-09-02T00:00:00.000Z"
    }]);
    const resolver = new ChainEntityResolver(loadEnv({ NODE_ENV: "test" }), new JsonCache(undefined, 60), undefined, {
      blockscout: {
        ...provider({}),
        name: "blockscout",
        getAddressSummary: vi.fn(async () => { throw new Error("indexer unavailable"); })
      },
      alchemy: {
        name: "robinhood-public-rpc",
        isConfigured: () => true,
        getTransaction: vi.fn(async () => []),
        getAddressSummary: vi.fn(async () => [
          rpcSource("rpc-code", "eth_getCode", "0x"),
          rpcSource("rpc-balance", "eth_getBalance", "0x0")
        ]),
        getReviewedAssetBalances,
        getAllowances: vi.fn(async () => [])
      },
      goldrush: { ...provider({}), isConfigured: () => false }
    });

    const resolution = applyPrivateProviderCoverage(
      await resolver.resolveWithSources("wallet", identifier, { privateMode: true, includeApprovals: false })
    );

    expect(getReviewedAssetBalances).toHaveBeenCalledOnce();
    expect(resolution.entity.facts).toMatchObject({
      activityCoverage: "unavailable",
      tokenBalanceCoverage: "reviewed_asset_sample",
      tokenBalanceContractsChecked: 12,
      tokenBalances: [{ tokenSymbol: "AAPL", formattedValue: "1.25" }]
    });
    expect(resolution.providerDestinations).toEqual(["blockscout", "robinhood-public-rpc"]);
  });

  it("discloses a configured provider that received the identifier and then failed", async () => {
    const source: SourceDocumentInput = {
      id: "blockscout-source",
      provider: "blockscout",
      chainId: 4663,
      entityType: "wallet",
      entityValue: identifier,
      responseJson: { hash: identifier, is_contract: false, coin_balance: "0" },
      fetchedAt: "2026-08-10T00:00:00.000Z"
    };
    const failingAlchemy = {
      name: "alchemy",
      isConfigured: () => true,
      getTransaction: vi.fn(async () => []),
      getAddressSummary: vi.fn(async () => { throw new Error("provider failed after receiving identifier"); }),
      getAllowances: vi.fn(async () => [])
    };
    const disabledGoldrush = {
      name: "goldrush",
      isConfigured: () => false,
      getAddressSummary: vi.fn(async () => [])
    };
    const resolver = new ChainEntityResolver(loadEnv({ NODE_ENV: "test" }), new JsonCache(undefined, 60), undefined, {
      blockscout: { ...provider({ address: [source] }), name: "blockscout" },
      alchemy: failingAlchemy,
      goldrush: disabledGoldrush
    });

    const resolution = await resolver.resolveWithSources("wallet", identifier, { privateMode: true });

    expect(failingAlchemy.getAddressSummary).toHaveBeenCalledWith(identifier);
    expect(disabledGoldrush.getAddressSummary).not.toHaveBeenCalled();
    expect(resolution.providerDestinations).toEqual(["blockscout", "alchemy"]);

    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }), undefined, {
      privateAnalysis: {
        resolve: vi.fn(async () => resolution),
        answer: vi.fn(async () => answer)
      }
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/private/analyze",
      payload: { entity: identifier }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().privacy.providerDestinations).toEqual(["blockscout", "alchemy"]);
    expect(response.json().privacy.disclosure).toContain("fixed 12-contract reviewed sample");
    expect(response.json().privacy.disclosure).toContain("one read-only balance call");
    expect(response.json().privacy.disclosure).toContain("Your question is not sent");
  });

  it("keeps private canaries out of request logs and aggregate metrics", async () => {
    const marker = "question-canary-7f4e-never-log";
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "info", ENABLE_METRICS: "true" }), undefined, {
        privateAnalysis: {
          resolve: vi.fn(async () => ({ entity, sources: [], providerDestinations: [] })),
          answer: vi.fn(async () => answer)
        }
      });
      apps.push(app);
      const response = await app.inject({
        method: "POST",
        url: "/v1/private/analyze",
        payload: { entity: identifier, question: marker }
      });
      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(response.statusCode).toBe(200);
      expect(metrics.statusCode).toBe(200);
      expect(metrics.body).not.toContain(marker);
      expect(written.join("\n")).not.toContain(marker);
      expect(written.join("\n")).not.toContain(identifier);
    } finally {
      write.mockRestore();
    }
  });
});

function snapshotMemory() {
  return {
    users: memoryStore.users.size,
    sessions: memoryStore.sessions.size,
    messages: memoryStore.messages.size,
    refreshTokens: memoryStore.refreshTokens.size,
    authTokens: memoryStore.authTokens.size,
    usage: memoryStore.usage.length,
    auditLogs: memoryStore.auditLogs.length
  };
}

function provider(fixtures: { address?: SourceDocumentInput[]; transaction?: SourceDocumentInput[] } = {}): ChainProvider {
  return {
    name: "fixture",
    getTransaction: vi.fn(async () => fixtures.transaction ?? []),
    getAddressSummary: vi.fn(async () => fixtures.address ?? []),
    getToken: vi.fn(async () => []),
    getContract: vi.fn(async () => [])
  };
}
