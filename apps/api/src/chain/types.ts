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
  getTransaction(hash: string): Promise<SourceDocumentInput[]>;
  getAddressSummary(address: string): Promise<SourceDocumentInput[]>;
  getToken(address: string): Promise<SourceDocumentInput[]>;
  getContract(address: string): Promise<SourceDocumentInput[]>;
};

export type EntityResolver = {
  resolve(type: ChainEntityType, value: string): Promise<NormalizedEntity>;
};

export type ResolvedEntity = {
  entity: NormalizedEntity;
  sources: SourceDocumentInput[];
};

export type ResolveOptions = {
  limit?: number;
  includeApprovals?: boolean;
  refresh?: boolean;
};
