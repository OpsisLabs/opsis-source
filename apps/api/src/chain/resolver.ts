import type { ChainEntityType, NormalizedEntity } from "@rh-chain/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import type { Env } from "../config/env.js";
import { JsonCache } from "../cache/service.js";
import { evmAddressSchema, identifyEntity, txHashSchema } from "../entities/identify.js";
import { AlchemyProvider } from "./alchemy.js";
import type { AllowanceTarget } from "./alchemy.js";
import { BlockscoutProvider } from "./blockscout.js";
import { GoldRushProvider } from "./goldrush.js";
import { normalizeEntity } from "./normalize.js";
import type { ChainProvider, ResolvedEntity, ResolveOptions, SourceDocumentInput } from "./types.js";
import { AppError } from "../http/errors.js";

export class ChainEntityResolver {
  private readonly blockscout: ChainProvider;
  private readonly alchemy: {
    name: string;
    isConfigured?(): boolean;
    getTransaction(hash: string): Promise<SourceDocumentInput[]>;
    getAddressSummary(address: string): Promise<SourceDocumentInput[]>;
    getAllowances(owner: string, targets: AllowanceTarget[]): Promise<SourceDocumentInput[]>;
  };
  private readonly goldrush: Pick<ChainProvider, "name" | "isConfigured" | "getAddressSummary">;

  constructor(
    private readonly env: Env,
    private readonly cache = new JsonCache(undefined, env.CHAIN_CACHE_TTL_SECONDS),
    private readonly prisma?: PrismaClient,
    providers?: {
      blockscout: ChainProvider;
      alchemy: {
        name: string;
        isConfigured?(): boolean;
        getTransaction(hash: string): Promise<SourceDocumentInput[]>;
        getAddressSummary(address: string): Promise<SourceDocumentInput[]>;
        getAllowances(owner: string, targets: AllowanceTarget[]): Promise<SourceDocumentInput[]>;
      };
      goldrush: Pick<ChainProvider, "name" | "isConfigured" | "getAddressSummary">;
    }
  ) {
    this.blockscout = providers?.blockscout ?? new BlockscoutProvider(env);
    this.alchemy = providers?.alchemy ?? new AlchemyProvider(env);
    this.goldrush = providers?.goldrush ?? new GoldRushProvider(env);
  }

  async resolve(inputType: ChainEntityType, value: string): Promise<NormalizedEntity> {
    return (await this.resolveWithSources(inputType, value)).entity;
  }

  async resolveWithSources(inputType: ChainEntityType, value: string, options: ResolveOptions = {}): Promise<ResolvedEntity> {
    const identified = validateEntityInput(inputType, value);
    const limit = options.limit ?? 25;
    const cacheKey = `${this.env.ROBINHOOD_CHAIN_ID}:${identified.type}:${identified.value}:${limit}:${options.includeApprovals ?? true}`;
    const mayUseServerStorage = !options.privateMode;
    const cached = options.refresh || !mayUseServerStorage ? undefined : await this.cache.get<ResolvedEntity>(cacheKey);
    if (cached) return cached;
    const persisted = options.refresh || !mayUseServerStorage ? undefined : await this.getPersisted(cacheKey);
    if (persisted) {
      await this.cache.set(cacheKey, persisted, cacheTtlSeconds(identified.type));
      return persisted;
    }
    const stale = options.refresh || !mayUseServerStorage ? undefined : await this.getPersisted(cacheKey, true);
    let resolvedType = identified.type;
    let docs: SourceDocumentInput[] = [];
    const providerDestinations = new Set<string>();
    if (identified.type === "transaction") {
      const providerResults = await Promise.allSettled(compactProviderRequests([
        providerRequest(this.blockscout, providerDestinations, () => this.blockscout.getTransaction(identified.value)),
        providerRequest(this.alchemy, providerDestinations, () => this.alchemy.getTransaction(identified.value))
      ]));
      docs = providerResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (docs.length === 0) {
        if (stale) return markStale(stale, providerDestinations);
        throwProviderFailure(providerResults);
      }
    } else if (identified.type === "wallet") {
      const providerResults = await Promise.allSettled(compactProviderRequests([
        providerRequest(this.blockscout, providerDestinations, () => this.blockscout.getAddressSummary(identified.value, {
          limit,
          detail: options.privateMode ? "summary" : "full"
        })),
        providerRequest(this.alchemy, providerDestinations, () => this.alchemy.getAddressSummary(identified.value)),
        providerRequest(this.goldrush, providerDestinations, () => this.goldrush.getAddressSummary(identified.value))
      ]));
      docs = providerResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (docs.length === 0) {
        if (stale) return markStale(stale, providerDestinations);
        throwProviderFailure(providerResults);
      }
      if (inputType === "unknown") {
        resolvedType = classifyAddressSources(docs);
        if (resolvedType === "token") {
          providerDestinations.add(this.blockscout.name);
          docs.push(...(await this.blockscout.getToken(identified.value, { limit })));
        }
        if (resolvedType === "contract") {
          providerDestinations.add(this.blockscout.name);
          docs.push(...(await this.blockscout.getContract(identified.value, { limit })));
        }
      }
      if (resolvedType === "wallet") {
        const provisional = normalizeEntity(this.env.ROBINHOOD_CHAIN_ID, resolvedType, identified.value, docs);
        const approvals = options.includeApprovals === false ? [] : Array.isArray(provisional.facts.approvalTransactions)
          ? (provisional.facts.approvalTransactions as Array<Record<string, unknown>>)
          : [];
        const targets = approvals.flatMap((approval) =>
          typeof approval.contract === "string" && typeof approval.spender === "string"
            ? [{ token: approval.contract, spender: approval.spender, method: approval.method }]
            : []
        );
        docs.push(...(await this.alchemy.getAllowances(identified.value, targets)));
      }
    } else if (identified.type === "token") {
      providerDestinations.add(this.blockscout.name);
      try {
        docs = await this.blockscout.getToken(identified.value, { limit });
      } catch (error) {
        if (stale) return markStale(stale, providerDestinations);
        throw error;
      }
    } else if (identified.type === "contract") {
      providerDestinations.add(this.blockscout.name);
      try {
        docs = await this.blockscout.getContract(identified.value, { limit });
      } catch (error) {
        if (stale) return markStale(stale, providerDestinations);
        throw error;
      }
    }
    if (docs.length === 0) {
      docs = [{
        id: crypto.randomUUID(),
        provider: "local",
        chainId: this.env.ROBINHOOD_CHAIN_ID,
        entityType: identified.type,
        entityValue: identified.value,
        responseJson: { note: "No provider data was available for this entity." },
        fetchedAt: new Date().toISOString()
      }];
    }
    const resolution: ResolvedEntity = {
      entity: normalizeEntity(this.env.ROBINHOOD_CHAIN_ID, resolvedType, identified.value, docs, this.env.ROBINHOOD_EXPLORER_URL),
      sources: docs,
      providerDestinations: [...providerDestinations]
    };
    if (resolvedType === "wallet") applyWalletOptions(resolution.entity, options);
    const ttlSeconds = cacheTtlSeconds(resolvedType);
    if (mayUseServerStorage) {
      await this.cache.set(cacheKey, resolution, ttlSeconds);
      await this.setPersisted(cacheKey, resolution, ttlSeconds);
    }
    return resolution;
  }

  private async getPersisted(cacheKey: string, includeExpired = false): Promise<ResolvedEntity | undefined> {
    if (!this.prisma) return undefined;
    try {
      const cached = await this.prisma.cachedApiResponse.findFirst({
        where: { cacheKey, ...(includeExpired ? {} : { expiresAt: { gt: new Date() } }) }
      });
      return cached?.responseJson as unknown as ResolvedEntity | undefined;
    } catch {
      return undefined;
    }
  }

  private async setPersisted(cacheKey: string, resolution: ResolvedEntity, ttlSeconds: number): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.cachedApiResponse.upsert({
        where: { cacheKey },
        create: {
          cacheKey,
          provider: "normalized",
          responseJson: resolution as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000)
        },
        update: {
          responseJson: resolution as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000)
        }
      });
    } catch {
      return;
    }
  }
}

export function validateEntityInput(inputType: ChainEntityType, input: string): { type: ChainEntityType; value: string } {
  const value = input.trim();
  if (inputType === "unknown") {
    const identified = identifyEntity(value);
    if (identified.type !== "unknown") return identified;
  } else if (inputType === "transaction" && txHashSchema.safeParse(value).success) {
    return { type: inputType, value: value.toLowerCase() };
  } else if (
    (inputType === "wallet" || inputType === "token" || inputType === "contract") &&
    evmAddressSchema.safeParse(value).success
  ) {
    return { type: inputType, value: value.toLowerCase() };
  } else if (inputType === "block" && /^\d+$/.test(value)) {
    return { type: inputType, value };
  }

  throw new AppError(
    "INVALID_ENTITY",
    400,
    "Provide a complete Robinhood Chain address, transaction hash, or block number"
  );
}

function markStale(resolution: ResolvedEntity, providerDestinations: Set<string>): ResolvedEntity {
  return {
    ...resolution,
    providerDestinations: [...providerDestinations],
    entity: {
      ...resolution.entity,
      facts: { ...resolution.entity.facts, cacheStatus: "stale" },
      riskNotes: [
        ...resolution.entity.riskNotes,
        {
          severity: "info",
          title: "Cached data is being shown",
          detail: "Live providers were unavailable, so this response uses expired cached evidence with its original timestamps.",
          evidenceCitationIds: resolution.entity.citations.map((citation) => citation.id)
        }
      ]
    }
  };
}

type ProviderDestination = { name: string; isConfigured?(): boolean };

function providerRequest<T>(
  provider: ProviderDestination,
  destinations: Set<string>,
  request: () => Promise<T>
): Promise<T> | undefined {
  if (provider.isConfigured && !provider.isConfigured()) return undefined;
  destinations.add(provider.name);
  return Promise.resolve().then(request);
}

function compactProviderRequests<T>(requests: Array<Promise<T> | undefined>): Promise<T>[] {
  return requests.filter((request): request is Promise<T> => request !== undefined);
}

function cacheTtlSeconds(type: ChainEntityType): number {
  if (type === "transaction" || type === "block") return 86_400;
  if (type === "wallet") return 300;
  if (type === "token" || type === "contract") return 3_600;
  return 60;
}

function applyWalletOptions(entity: NormalizedEntity, options: ResolveOptions): void {
  const limit = options.limit ?? 25;
  for (const field of ["recentTransactions", "tokenTransfers", "internalTransactions"] as const) {
    const value = entity.facts[field];
    if (Array.isArray(value)) entity.facts[field] = value.slice(0, limit);
  }
  if (options.includeApprovals === false) {
    entity.facts.approvalTransactions = [];
    entity.riskNotes = entity.riskNotes.filter((note) => !note.title.toLowerCase().includes("approval"));
  }
}

export function classifyAddressResponse(response: unknown): "wallet" | "token" | "contract" {
  return classifyAddressSources([{ responseJson: response } as SourceDocumentInput]);
}

function classifyAddressSources(docs: SourceDocumentInput[]): "wallet" | "token" | "contract" {
  for (const doc of docs) {
    const address = doc.responseJson as { token?: unknown; is_contract?: boolean; method?: string; result?: unknown } | undefined;
    if (address?.token && typeof address.token === "object") return "token";
    if (address?.is_contract === true) return "contract";
    if (address?.method === "eth_getCode" && typeof address.result === "string" && !/^0x0*$/.test(address.result)) return "contract";
  }
  return "wallet";
}

function throwProviderFailure(results: PromiseSettledResult<unknown>[]): never {
  const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  const notFound = errors.find((error) => error && typeof error === "object" && "code" in error && error.code === "PROVIDER_HTTP_404");
  if (notFound) throw new AppError("NOT_FOUND", 404, "Entity was not found on Robinhood Chain");
  throw errors[0] ?? new AppError("PROVIDER_UNAVAILABLE", 503, "Chain data providers are unavailable");
}
