import type { ChainEntityType, NormalizedEntity } from "@rh-chain/shared";

export type SourceDocumentInput = {
  id: string;
  provider: string;
  chainId: number;
  entityType: ChainEntityType;
  entityValue: string;
  requestUrl?: string;
  responseJson: unknown;
  fetchedAt: string;
};

export type ChainProvider = {
  name: string;
  /** Whether calling this provider can make an external network request. */
  isConfigured?(): boolean;
  getTransaction(hash: string, options?: ProviderQueryOptions): Promise<SourceDocumentInput[]>;
  getAddressSummary(address: string, options?: ProviderQueryOptions): Promise<SourceDocumentInput[]>;
  getToken(address: string, options?: ProviderQueryOptions): Promise<SourceDocumentInput[]>;
  getContract(address: string, options?: ProviderQueryOptions): Promise<SourceDocumentInput[]>;
};

export type ProviderQueryOptions = {
  limit?: number;
  detail?: "summary" | "full";
};

export type EntityResolver = {
  resolve(type: ChainEntityType, value: string): Promise<NormalizedEntity>;
};

export type ResolvedEntity = {
  entity: NormalizedEntity;
  sources: SourceDocumentInput[];
  /** External providers that received the entity, including failed attempts. */
  providerDestinations: string[];
};

export type ResolveOptions = {
  limit?: number;
  includeApprovals?: boolean;
  refresh?: boolean;
  /**
   * Private Mode must not create a durable or linkable server-side record.
   * This bypasses both Redis/in-memory lookup caches and PostgreSQL response
   * persistence, including stale-cache fallback.
   */
  privateMode?: boolean;
};
