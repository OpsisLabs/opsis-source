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
import { delegationTarget } from "./delegation.js";

export class ChainEntityResolver {
  private readonly blockscout: ChainProvider;
  private readonly alchemy: {
    name: string;
    isConfigured?(): boolean;
    getTransaction(hash: string): Promise<SourceDocumentInput[]>;
    getAddressSummary(address: string): Promise<SourceDocumentInput[]>;
    getReviewedAssetBalances?(address: string): Promise<SourceDocumentInput[]>;
    getTokenMetadataSample?(address: string, knownCode?: string): Promise<SourceDocumentInput[]>;
    getAllowances(owner: string, targets: AllowanceTarget[]): Promise<SourceDocumentInput[]>;
  };
  private readonly goldrush: Pick<ChainProvider, "name" | "isConfigured" | "getAddressSummary">;

  constructor(
    private readonly env: Env,
    private readonly cache = new JsonCache(undefined, env.CHAIN_CACHE_TTL_SECONDS),
    private readonly prisma?: PrismaClient,
    providers?: Partial<{
      blockscout: ChainProvider;
      alchemy: {
        name: string;
        isConfigured?(): boolean;
        getTransaction(hash: string): Promise<SourceDocumentInput[]>;
        getAddressSummary(address: string): Promise<SourceDocumentInput[]>;
        getTokenMetadataSample?(address: string, knownCode?: string): Promise<SourceDocumentInput[]>;
        getAllowances(owner: string, targets: AllowanceTarget[]): Promise<SourceDocumentInput[]>;
      };
      goldrush: Pick<ChainProvider, "name" | "isConfigured" | "getAddressSummary">;
    }>
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
        providerRequest(this.blockscout, providerDestinations, () => this.blockscout.getTransaction(identified.value, {
          detail: options.privateMode ? "summary" : "full"
        })),
        providerRequest(this.alchemy, providerDestinations, () => this.alchemy.getTransaction(identified.value))
      ]));
      const successfulDocs = providerResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      const explorerDocs = successfulDocs.filter((doc) => doc.provider === this.blockscout.name);
      const rpcDocs = successfulDocs.filter((doc) => doc.provider === this.alchemy.name);
      if (explorerDocs.length > 0 && rpcDocs.length > 0) {
        assertTransactionSourcesAgree(identified.value, explorerDocs, rpcDocs);
      }
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
        if (resolvedType === "contract" && hasContractCode(docs) && this.alchemy.getTokenMetadataSample) {
          try {
            providerDestinations.add(this.alchemy.name);
            const codeDoc = docs.find((doc) => rpcMethod(doc) === "eth_getCode");
            const sample = await this.alchemy.getTokenMetadataSample(identified.value, asRecord(codeDoc?.responseJson)?.result as string);
            const facts = normalizeEntity(this.env.ROBINHOOD_CHAIN_ID, "token", identified.value, sample).facts;
            if (!sample.some((doc) => asRecord(doc.responseJson)?.readError === true)
              && typeof facts.decimals === "number" && facts.decimals <= 36
              && (typeof facts.name === "string" || typeof facts.symbol === "string")) {
              resolvedType = "token";
              docs.push(...sample);
            }
          } catch {
            // Optional token recognition never replaces the existing contract evidence on failure.
          }
        }
        if (resolvedType === "token" && !docs.some((doc) => asRecord(doc.responseJson)?.query === "erc20MetadataSample")) {
          providerDestinations.add(this.blockscout.name);
          docs.push(...(await this.blockscout.getToken(identified.value, { limit })));
        }
        if (resolvedType === "contract") {
          providerDestinations.add(this.blockscout.name);
          if (options.privateMode) {
            try {
              docs.push(...(await this.blockscout.getContract(identified.value, { limit })));
            } catch {
              // Code and native-balance reads from the RPC still establish useful
              // public evidence. Contract source/ABI metadata remains unknown.
            }
          } else {
            docs.push(...(await this.blockscout.getContract(identified.value, { limit })));
          }
        }
      }
      if (resolvedType === "wallet") {
        if (options.privateMode && !hasTokenBalanceSource(docs) && this.alchemy.getReviewedAssetBalances) {
          try {
            docs.push(...(await this.alchemy.getReviewedAssetBalances(identified.value)));
          } catch {
            // The direct reviewed sample is a bounded fallback. Native balance
            // and code reads remain useful if this optional call is degraded.
          }
        }
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
        if (options.privateMode && this.alchemy.getTokenMetadataSample) {
          providerDestinations.add(this.alchemy.name);
          try {
            const sample = await this.alchemy.getTokenMetadataSample(identified.value);
            if (normalizeEntity(this.env.ROBINHOOD_CHAIN_ID, "token", identified.value, sample).facts.metadataCoverage === "rpc_partial") {
              docs = sample;
            }
          } catch {
            // If the bounded sample cannot establish a token interpretation,
            // retain the original explorer failure below.
          }
        }
        if (docs.length === 0) {
          if (stale) return markStale(stale, providerDestinations);
          throw error;
        }
      }
    } else if (identified.type === "contract") {
      if (!options.privateMode) {
        providerDestinations.add(this.blockscout.name);
        try {
          docs = await this.blockscout.getContract(identified.value, { limit });
        } catch (error) {
          if (stale) return markStale(stale, providerDestinations);
          throw error;
        }
      } else {
        const providerResults = await Promise.allSettled(compactProviderRequests([
          providerRequest(this.blockscout, providerDestinations, () => this.blockscout.getContract(identified.value, { limit })),
          providerRequest(this.alchemy, providerDestinations, () => this.alchemy.getAddressSummary(identified.value))
        ]));
        docs = providerResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        if (docs.length === 0 || (docs.every((doc) => doc.provider !== this.blockscout.name) && !hasContractCode(docs))) {
          if (stale) return markStale(stale, providerDestinations);
          throwProviderFailure(providerResults);
        }
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

function assertTransactionSourcesAgree(requestedHash: string, explorerDocs: SourceDocumentInput[], rpcDocs: SourceDocumentInput[]): void {
  const primary = explorerDocs.find((doc) => doc.provider === "blockscout") ?? explorerDocs[0]!;
  const explorer = asRecord(primary.responseJson) ?? {};
  const rpcTransaction = asRecord(rpcDocs.find((doc) => rpcMethod(doc) === "eth_getTransactionByHash")?.responseJson);
  const rpcReceipt = asRecord(rpcDocs.find((doc) => rpcMethod(doc) === "eth_getTransactionReceipt")?.responseJson);
  const tx = asRecord(rpcTransaction?.result);
  const receipt = asRecord(rpcReceipt?.result);
  const conflict = () => { throw new AppError("TRANSACTION_SOURCE_MISMATCH", 502, "Transaction providers returned conflicting evidence"); };

  if (Object.prototype.hasOwnProperty.call(explorer, "hash")) {
    if (typeof explorer.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(explorer.hash)
      || explorer.hash.toLowerCase() !== requestedHash.toLowerCase()) conflict();
  }
  if (!tx && !receipt) return;
  const compare = (left: unknown, right: unknown, kind: "hash" | "quantity" | "address") => {
    if (left === undefined || right === undefined) return;
    if (left === null || right === null) {
      if (left !== right) conflict();
      return;
    }
    if (kind === "hash") {
      if (typeof left !== "string" || typeof right !== "string" || !/^0x[\da-f]{64}$/i.test(left) || !/^0x[\da-f]{64}$/i.test(right)
        || left.toLowerCase() !== right.toLowerCase()) conflict();
    } else if (kind === "address") {
      if (typeof left !== "string" || typeof right !== "string" || !/^0x[\da-f]{40}$/i.test(left) || !/^0x[\da-f]{40}$/i.test(right)
        || left.toLowerCase() !== right.toLowerCase()) conflict();
    } else {
      const a = parseQuantity(left), b = parseQuantity(right);
      if (a === undefined || b === undefined || a !== b) conflict();
    }
  };
  compare(explorer.hash, requestedHash, "hash");
  const rpcBlockHash = tx && Object.prototype.hasOwnProperty.call(tx, "blockHash") ? tx.blockHash : receipt?.blockHash;
  compare(explorer.block_hash, rpcBlockHash, "hash");
  const rpcBlockNumber = tx && Object.prototype.hasOwnProperty.call(tx, "blockNumber") ? tx.blockNumber : receipt?.blockNumber;
  compare(explorer.block_number, rpcBlockNumber, "quantity");
  compare(blockscoutAddress(explorer.from), tx?.from, "address");
  compare(blockscoutAddress(explorer.to), tx?.to, "address");
  compare(explorer.value, tx?.value, "quantity");

  const indexedStatus = transactionStatus(explorer.status);
  const receiptStatus = transactionStatus(receipt?.status);
  if (indexedStatus !== undefined && receiptStatus !== undefined && indexedStatus !== receiptStatus) conflict();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function blockscoutAddress(value: unknown): unknown {
  const address = asRecord(value);
  return address && Object.prototype.hasOwnProperty.call(address, "hash") ? address.hash : value;
}

function rpcMethod(doc: SourceDocumentInput): string | undefined {
  return asRecord(doc.responseJson)?.method as string | undefined;
}

function parseQuantity(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) return undefined;
  try { return BigInt(text); } catch { return undefined; }
}

function transactionStatus(value: unknown): boolean | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const status = String(value).toLowerCase();
  if (["ok", "success", "1", "0x1"].includes(status)) return true;
  if (["error", "failed", "0", "0x0"].includes(status)) return false;
  return undefined;
}

function hasTokenBalanceSource(docs: SourceDocumentInput[]): boolean {
  return docs.some((doc) => {
    const response = doc.responseJson as { query?: unknown } | undefined;
    return doc.requestUrl?.includes("/token-balances")
      || doc.requestUrl?.includes("/balances_v2/")
      || response?.query === "reviewedTokenBalanceSample";
  });
}

function hasContractCode(docs: SourceDocumentInput[]): boolean {
  return docs.some((doc) => {
    const response = doc.responseJson as { method?: unknown; result?: unknown } | undefined;
    const code = response?.result;
    return response?.method === "eth_getCode"
      && typeof code === "string"
      && /^0x(?:[0-9a-f]{2})+$/i.test(code)
      && !/^0x0*$/i.test(code)
      && !delegationTarget(code);
  });
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
  // An EOA with an exact EIP-7702 designator remains a wallet. Some indexers
  // mark any nonempty code as is_contract; the direct code read disambiguates it.
  if (docs.some((doc) => {
    const response = doc.responseJson as { method?: string; result?: unknown } | undefined;
    return response?.method === "eth_getCode" && delegationTarget(response.result);
  })) return "wallet";
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
