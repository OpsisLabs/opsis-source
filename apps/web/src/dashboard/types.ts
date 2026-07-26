export type ChainEntityType = "wallet" | "transaction" | "token" | "contract" | "block" | "unknown";
export type Severity = "info" | "low" | "medium" | "high";

export interface User {
  id: string;
  /** Email accounts have no username; wallet accounts have no email. */
  email?: string | null;
  username?: string | null;
  walletAddress?: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  entity?: { type: ChainEntityType; chainId: number; id: string };
  createdAt: string;
  updatedAt: string;
}

export interface SourceCitation {
  id: string;
  /** Provider name as reported by the API: blockscout, alchemy, goldrush, cache, … */
  provider: string;
  label: string;
  url: string | null;
  fetchedAt: string;
  entityType: ChainEntityType;
  entityId: string;
  fieldsUsed: string[];
}

/** One stat tile in the answer header. */
export interface AnswerStat {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}

/** Header derived from the entity's facts, so the card leads with what it is. */
export interface AnswerCardMeta {
  kind: ChainEntityType;
  title: string;
  subtitle?: string;
  stats: AnswerStat[];
}

export interface AiExplorerAnswer {
  card?: AnswerCardMeta;
  answer: string;
  summaryBullets: string[];
  confirmedFacts: { fact: string; sourceIds: string[] }[];
  inferences: { inference: string; confidence: "low" | "medium" | "high"; sourceIds: string[] }[];
  riskNotes: { severity: Severity; note: string; sourceIds: string[] }[];
  citations: SourceCitation[];
  suggestedFollowUps: string[];
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  ai?: AiExplorerAnswer;
  createdAt: string;
}

export interface Usage {
  periodStart: string;
  periodEnd: string;
  aiMessages: number;
  chainLookups: number;
  quota: { aiMessages: number; chainLookups: number };
}

export interface ResolvedEntity {
  type: ChainEntityType;
  chainId: number;
  id: string;
  explorerUrl: string;
}

export interface EntitySummary {
  address: string;
  kind: ChainEntityType;
  nativeBalanceEth: string | null;
  tokenBalances: { symbol: string; balance: string }[];
  recentCount: number;
  approvals: { token: string; spender: string; amount: string }[];
  riskSignals: { code: string; severity: Severity; title: string }[];
  explorerUrl: string;
}
