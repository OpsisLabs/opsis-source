export const CHAIN_IDS = {
  robinhoodMainnet: 4663,
  robinhoodTestnet: 46630,
} as const;

export type ChainEntityType =
  "wallet" | "transaction" | "token" | "contract" | "block" | "unknown";

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
  source: "chainscout_reviewed_registry";
  limitations: string[];
};
