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
  /** Full address or hash, for the copy/explorer/share actions. */
  id: string;
  title: string;
  subtitle?: string;
  /** Qualities as pills: ERC-20, PROXY, UNVERIFIED, SUCCEEDED… */
  badges: { label: string; tone?: AnswerStat["tone"] }[];
  stats: AnswerStat[];
}

/** One row in a list widget. */
export interface WidgetRow {
  label: string;
  sub?: string;
  value?: string;
  tone?: AnswerStat["tone"];
  /** 0-100; renders a proportional bar behind the row. */
  barPct?: number;
  /** When set, clicking the row asks about this value. */
  pivot?: string;
}

/** A data panel rendered inside the answer card. */
export interface AnswerWidget {
  kind: "bars" | "rows" | "donut";
  title: string;
  note?: string;
  bars?: { label: string; count: number }[];
  rows?: WidgetRow[];
  /** Donut segments; pcts are a true partition of the whole. */
  segments?: { label: string; pct: number; pivot?: string }[];
}

export interface AiExplorerAnswer {
  card?: AnswerCardMeta;
  widgets?: AnswerWidget[];
  /** Side-panel data derived from the same saved facts as the answer. */
  entitySummary?: EntitySummary;
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
