export type { BenchmarkInput, CardBenchmark } from "./benchmarks.js";
export type { ContractFact, ContractFacts } from "./contract-facts.js";
export { REVIEWED_ASSET_SAMPLE_REVIEWED_ON, REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "./reviewed-asset-sample.js";
export const CHAIN_IDS = {
  robinhoodMainnet: 4663,
  robinhoodTestnet: 46630,
} as const;

export type ChainEntityType =
  "wallet" | "transaction" | "token" | "contract" | "block" | "unknown";

/**
 * Optional, user-chosen goal for a Private Explorer question. It only selects a
 * deterministic presentation path; it is never sent to a model provider and it
 * never changes which provider facts are fetched. An absent task keeps the
 * freeform question working exactly as before.
 */
export const EXPLORER_ANSWER_TASKS = [
  "overview",
  "explain",
  "risk",
  "evidence",
  "holdings",
  "activity",
  "moved",
  "success",
  "fees",
  "token",
  "verify"
] as const;

export type ExplorerAnswerTask = (typeof EXPLORER_ANSWER_TASKS)[number];

export type Citation = {
  id: string;
  provider: string;
  url: string;
  fetchedAt: string;
  fieldsUsed: string[];
  description: string;
};

export type RiskSeverity = "info" | "low" | "medium" | "high";

export type RiskNote = {
  severity: RiskSeverity;
  title: string;
  detail: string;
  evidenceCitationIds: string[];
};

export type NormalizedEntity = {
  chainId: number;
  type: ChainEntityType;
  value: string;
  label?: string;
  facts: Record<string, unknown>;
  citations: Citation[];
  riskNotes: RiskNote[];
};

export type AiExplorerAnswer = {
  answer: string;
  summaryBullets: string[];
  confirmedFacts: Array<{ fact: string; sourceIds: string[] }>;
  inferences: Array<{
    inference: string;
    confidence: "low" | "medium" | "high";
    sourceIds: string[];
  }>;
  facts: Record<string, unknown>;
  uncertainty: string[];
  riskNotes: RiskNote[];
  citations: Citation[];
  suggestedQuestions: string[];
  suggestedFollowUps: string[];
  tokenUsage?: Record<string, number>;
};

export type PortfolioCitation = {
  id: string;
  provider: "robinhood" | "blockscout";
  url: string;
  fetchedAt: string;
  description: string;
};

export type PortfolioAnchor = {
  tag: "latest";
  blockNumber: number;
  blockHash: string;
  timestamp: string;
  fetchedAt: string;
};

export type PortfolioTokenHolding = {
  kind: "erc20";
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  reputation?: string;
  quantity: string;
  rawBalance: string;
  sourceIds: string[];
};

export type PortfolioNftHolding = {
  kind: "erc721" | "erc1155";
  contract: string;
  tokenId: string;
  name: string;
  symbol: string;
  quantity: string;
  sourceIds: string[];
};

export type PortfolioMovement = {
  transactionHash: string;
  blockNumber: number;
  timestamp: string | null;
  direction: "in" | "out" | "self";
  kind: "native" | "erc20" | "erc721" | "erc1155";
  symbol: string;
  quantity: string;
  contract: string | null;
  tokenId: string | null;
  counterparty: string | null;
  sourceIds: string[];
};

export type PortfolioTransaction = {
  hash: string;
  blockNumber: number;
  timestamp: string | null;
  status: "success" | "failed";
  method: string | null;
  direction: "in" | "out" | "self" | "mixed";
  counterparty: string | null;
  nativeValueEth: string;
  movementCount: number;
  movementCoverage: "complete" | "partial";
  sourceIds: string[];
};

export type PortfolioApproval = {
  tokenId?: string;
  transactionHash: string;
  contract: string;
  spender: string;
  kind: "erc20" | "erc721-token" | "operator";
  symbol: string;
  active: boolean;
  unlimited: boolean;
  currentAmount: string;
  sourceIds: string[];
};

export type PortfolioSnapshot = {
  schemaVersion: 1;
  chain: { id: 4663; name: "Robinhood Chain"; nativeSymbol: "ETH" };
  address: string;
  anchor: PortfolioAnchor;
  nativeBalanceEth: string;
  tokens: PortfolioTokenHolding[];
  nfts: PortfolioNftHolding[];
  transactions: PortfolioTransaction[];
  movements: PortfolioMovement[];
  approvals: PortfolioApproval[];
  attention: Array<{
    severity: "info" | "medium" | "high";
    title: string;
    detail: string;
    sourceIds: string[];
  }>;
  reconciliation: {
    tokenCandidates: number;
    tokenConfirmed: number;
    nftCandidates: number;
    nftConfirmed: number;
    activityCandidates: number;
    activityConfirmed: number;
    approvalCandidates: number;
    approvalConfirmed: number;
    degradedSources: string[];
    truncatedSections: string[];
  };
  citations: PortfolioCitation[];
  privacy: {
    accountRequired: false;
    walletConnectionRequired: false;
    serverStorage: "none";
    browserStorage: "client_encrypted_vault";
    providerDestinations: string[];
    disclosure: string;
  };
};

export type CollectibleLanguage =
  "en" | "fr" | "es" | "de" | "it" | "pt" | "ja";

export type CollectibleCardBrief = {
  catalogId: string;
  name: string;
  number: string;
};

export type CollectibleCardDetail = {
  provider: "tcgdex";
  catalogId: string;
  language: CollectibleLanguage;
  name: string;
  number: string;
  category: string;
  set: { id: string; name: string; officialCount: number; totalCount: number };
  rarity: string | null;
  illustrator: string | null;
  /** Optional low-resolution TCGdex catalog image. Older Vault records omit it. */
  imageUrl?: string | null;
  catalogUpdatedAt: string | null;
  fetchedAt: string;
  sourceUrl: string;
  licenseUrl: string;
};

export type CollectiblePrivacyReceipt = {
  accountRequired: false;
  walletConnectionRequired: false;
  serverStorage: "none";
  modelProvider: "none";
  providerDestinations: ["TCGdex"];
  disclosure: string;
};

export type CollectibleSearchResponse = {
  query: {
    language: CollectibleLanguage;
    name: string;
    number: string | null;
    setId: string | null;
  };
  results: CollectibleCardBrief[];
  matchesShown: number;
  truncated: boolean;
  fetchedAt: string;
  source: { provider: "tcgdex"; url: string; licenseUrl: string };
  privacy: CollectiblePrivacyReceipt;
};

export type CollectibleDetailResponse = {
  card: CollectibleCardDetail;
  privacy: CollectiblePrivacyReceipt;
};

export type MarketPrivacyReceipt = {
  accountRequired: false;
  walletConnectionRequired: false;
  serverStorage: "none";
  modelProvider: "none";
  providerDestinations: string[];
  disclosure: string;
};

export type MarketToken = {
  address: string;
  name: string;
  symbol: string;
};

export type DexMarketPair = {
  pairAddress: string;
  dexId: string;
  url: string;
  labels: string[];
  baseToken: MarketToken;
  quoteToken: MarketToken;
  pricedTokenAddress: string;
  baseTokenPriceUsd: string | null;
  baseTokenPriceInQuote: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  priceChange24hPercent: string | null;
  pairCreatedAt: string | null;
};

export type CryptoMarketResponse = {
  schemaVersion: 1;
  chain: { id: 4663; slug: "robinhood"; name: "Robinhood Chain" };
  contract: string;
  canonicalAssetId: string;
  identityConfidence: "exact_contract";
  pairs: DexMarketPair[];
  pairsShown: number;
  truncated: boolean;
  fetchedAt: string;
  freshForMs: number;
  source: { provider: "dexscreener"; url: string };
  limitations: string[];
  privacy: MarketPrivacyReceipt;
};

export type MerchantInventoryState =
  | "provider_available"
  | "provider_low_stock"
  | "provider_unavailable"
  | "unknown";

export type MerchantOffer = {
  provider: "woocommerce";
  merchantId: string;
  merchantName: string;
  canonicalAssetId: string;
  identityConfidence: "reviewed_simple_product_mapping";
  productId: string;
  sku: string;
  title: string;
  variantLabel: string;
  condition: string;
  mappingReviewedAt: string;
  mappingEvidenceUrl: string;
  url: string;
  currency: string;
  unitPrice: string;
  inventoryState: MerchantInventoryState;
  exactQuantity: null;
  productRating: null | {
    average: string;
    count: number;
    sourceLabel: "merchant_reported_product_rating";
  };
  fetchedAt: string;
  freshForMs: number;
};

export type MerchantInventoryResponse = {
  schemaVersion: 1;
  merchant: { id: string; name: string; provider: "woocommerce" };
  canonicalAssetId: string;
  mapping: {
    sku: string;
    productId: string;
    reviewedAt: string;
    evidenceUrl: string;
  };
  offer: MerchantOffer | null;
  state: "exact_match" | "valid_empty";
  fetchedAt: string;
  freshForMs: number;
  source: { provider: "woocommerce"; url: string };
  limitations: string[];
  privacy: MarketPrivacyReceipt;
};

export type ApprovedMerchantDirectoryEntry = {
  id: string;
  name: string;
  permissionReviewedAt: string;
  permissionEvidenceUrl: string;
  mappings: Array<{
    canonicalAssetId: string;
    sku: string;
    productId: string;
    variantLabel: string;
    condition: string;
    reviewedAt: string;
    evidenceUrl: string;
  }>;
};

export type ApprovedMerchantDirectoryResponse = {
  schemaVersion: 1;
  merchants: ApprovedMerchantDirectoryEntry[];
  loadedAt: string;
  source: "opsis_reviewed_registry";
  limitations: string[];
};

export type OpenDataSource = {
  id: string;
  title: string;
  url: string;
  kind: "primary_reference" | "human_verification";
  purpose: "human_verification_link_only";
};

export type OpenDataRegistryProvenance = {
  derivation: "opsis_static_review";
  upstreamPayloadIncluded: false;
  redistributionClass: "opsis_reviewed_reference";
  reviewedAt: string;
};

export type OpenDataNormalizationProvenance = {
  derivation: "deterministic_syntax_normalization";
  upstreamPayloadIncluded: false;
  redistributionClass: "opsis_derived_normalization";
  reviewedAt: string;
};

export type OpenDataAsset = {
  schemaVersion: 1;
  canonicalId: string;
  chain: { id: 4663; namespace: "eip155"; name: "Robinhood Chain" };
  assetType: "erc20";
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  registryStatus: "opsis_supported";
  identityConfidence: "opsis_reviewed_static_match";
  provenance: OpenDataRegistryProvenance;
  sources: OpenDataSource[];
  limitations: string[];
};

export type OpenDataAssetListResponse = {
  schemaVersion: 1;
  registryVersion: string;
  opsisSourceRevision: string | null;
  chain: OpenDataAsset["chain"];
  assets: OpenDataAsset[];
  assetsShown: number;
  completeFor: "opsis_reviewed_launch_registry";
  generatedAt: string;
  provenance: {
    upstreamPayloadIncluded: false;
    redistributionClass: "opsis_reviewed_reference";
  };
  rights: {
    opsisAuthored: string[];
    excludedFromLicenseClaim: string[];
  };
  limitations: string[];
};

export type OpenDataIdentityResponse = {
  schemaVersion: 1;
  chain: OpenDataAsset["chain"];
  kind: "address" | "transaction" | "block";
  normalizedValue: string;
  canonicalKey: string;
  syntaxValid: true;
  existenceVerified: false;
  registryMatch: null | {
    canonicalId: string;
    symbol: string;
    registryStatus: "opsis_supported";
    identityConfidence: "opsis_reviewed_static_match";
  };
  explorerUrl: string;
  provenance: OpenDataNormalizationProvenance;
  limitations: string[];
};

export type OpenDataManifestResponse = {
  schemaVersion: 1;
  apiVersion: "v1";
  status: "available";
  chain: OpenDataAsset["chain"];
  endpoints: Array<{
    method: "GET" | "POST";
    path: string;
    description: string;
  }>;
  cap: { anonymousRequestsPerHour: number; scope: "pseudonymous_network_client" };
  privacy: {
    accountRequired: false;
    browserCredentialsUsed: false;
    vaultDataAccepted: false;
    providerCallsPerRequest: 0;
    rawUpstreamPayloadsReturned: false;
  };
  generatedAt: string;
  limitations: string[];
};

export type OpenDataNormalizeRequest = {
  chainId: 4663;
  kind: "evm_address";
  value: string;
};

export const ROBINHOOD_CHAIN_4663 = {
  id: 4663,
  namespace: "eip155",
  name: "Robinhood Chain",
} as const;

export const OPEN_DATA_REGISTRY_VERSION = "2026-08-12.1" as const;
export const OPEN_DATA_REVIEWED_AT = "2026-08-12T21:31:50.000Z" as const;

/** Opsis's reviewed launch support tuple. The registry and Swap preview
 * consume the same object so address/decimal support cannot drift. */
export const REVIEWED_ASSETS = {
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    decimals: 18,
  },
  USDG: {
    symbol: "USDG",
    name: "Global Dollar",
    address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    decimals: 6,
  },
} as const;

export type { TokenControls, ControlReading } from "./controls.js";
export * from "./receipts.js";
export type { SupplyFraction, FundingLink, LinkedHolder, LinkedGroup, LinkedWalletGraph } from "./linked-wallets.js";
export * from "./open-data.js";

export * from "./claims.js";
export * from "./stock-desk.js";
export { ALERTS_PRIVACY } from "./alerts-privacy.js";
