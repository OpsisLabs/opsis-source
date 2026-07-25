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
