export const CHAIN_IDS = {
  robinhoodMainnet: 4663,
  robinhoodTestnet: 46630
} as const;

export type ChainEntityType = "wallet" | "transaction" | "token" | "contract" | "block" | "unknown";

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
  inferences: Array<{ inference: string; confidence: "low" | "medium" | "high"; sourceIds: string[] }>;
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
  provider: "alchemy" | "blockscout";
  url: string;
  fetchedAt: string;
  description: string;
};

export type PortfolioFinality = {
  tag: "finalized";
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
  finality: PortfolioFinality;
  nativeBalanceEth: string;
  tokens: PortfolioTokenHolding[];
  nfts: PortfolioNftHolding[];
  transactions: PortfolioTransaction[];
  movements: PortfolioMovement[];
  approvals: PortfolioApproval[];
  attention: Array<{ severity: "info" | "medium" | "high"; title: string; detail: string; sourceIds: string[] }>;
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
