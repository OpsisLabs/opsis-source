import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiExplorerAnswer, NormalizedEntity } from "@rh-chain/shared";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { memoryStore } from "../src/db/memory.js";
import { ChainEntityResolver } from "../src/chain/resolver.js";
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
    expect(answerQuestion).toHaveBeenCalledWith(privateQuestion, entity);
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
