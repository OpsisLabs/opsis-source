/**
 * Maps @rh-chain/api response shapes onto the view models the dashboard
 * components already render. The components are the source of truth for shape;
 * everything the backend returns is bent to fit here rather than in the UI.
 *
 * Backend shapes are declared structurally instead of imported from
 * @rh-chain/shared so the web app builds without the shared package being
 * compiled first.
 */
import type {
  AiExplorerAnswer,
  AnswerCardMeta,
  AnswerStat,
  ChainEntityType,
  ChatMessage,
  ChatSession,
  EntitySummary,
  Severity,
  SourceCitation,
} from "./types";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 4663);
export const EXPLORER = import.meta.env.VITE_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com";

/** Shown wherever the chain data genuinely has no value for a field. */
const NONE = "—";

export interface BackendCitation {
  id: string;
  provider: string;
  url: string | null;
  fetchedAt: string;
  fieldsUsed?: string[];
  description?: string;
}

export interface BackendRiskNote {
  severity: Severity;
  title: string;
  detail?: string;
  evidenceCitationIds?: string[];
}

export interface BackendAnswer {
  answer: string;
  facts?: Record<string, unknown>;
  summaryBullets?: string[];
  confirmedFacts?: { fact: string; sourceIds: string[] }[];
  inferences?: { inference: string; confidence: "low" | "medium" | "high"; sourceIds: string[] }[];
  riskNotes?: BackendRiskNote[];
  citations?: BackendCitation[];
  suggestedFollowUps?: string[];
  suggestedQuestions?: string[];
}

export interface BackendEntity {
  chainId: number;
  type: ChainEntityType;
  value: string;
  facts: Record<string, unknown>;
  citations: BackendCitation[];
  riskNotes: BackendRiskNote[];
}

export interface BackendSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeEntity?: { type: ChainEntityType; value: string } | null;
}

export interface BackendMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  aiResponseJson?: BackendAnswer | null;
  createdAt: string;
}

/* ---------------- primitives ---------------- */

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as Record<string, unknown>[]) : [];

export function shortHex(value: unknown): string {
  const text = str(value);
  if (!text) return NONE;
  return text.length > 12 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;
}

/**
 * Formats an on-chain amount for the fixed-width entity panel: thousands
 * separators, and at most `decimals` places. Full-precision wei-derived values
 * run to 18 decimals and overflow the panel, so they are trimmed for display —
 * never rounded to zero, which would read as "no balance".
 */
function formatAmount(value: string, decimals = 6): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  let text: string;
  if (numeric !== 0 && Math.abs(numeric) < 10 ** -decimals) {
    text = numeric.toPrecision(3); // dust: keep significant digits instead of 0.000000
  } else {
    text = numeric.toFixed(decimals);
    // Trim only the fractional tail. Stripping trailing zeros unconditionally
    // turns 1000000000 into 1 and 680 into 68.
    if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  }

  const [whole = "", fraction] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/* ---------------- answers ---------------- */

/** Longest fact the card can show before it stops being readable. */
const FACT_MAX = 180;

/**
 * Shortens hashes, addresses, and other unbreakable runs, keeping both ends.
 * 45 characters is the widest run that still wraps inside the facts column.
 */
function collapseRuns(text: string): string {
  return text.replace(/\S{45,}/g, (run) => `${run.slice(0, 24)}…${run.slice(-8)}`);
}

/**
 * The API's deterministic (no-LLM) answers report facts as `key: <raw JSON>`,
 * serialized then hard-cut at 500 characters — so the value is both enormous
 * and not valid JSON. Those blobs are single unbreakable tokens over 1200px
 * wide, and since the chat grid sizes to its content they stretch the whole
 * page. Describe a serialized value instead of printing it; prose from a real
 * model passes through untouched.
 */
export function formatFact(fact: string): string {
  const match = /^(\w+):\s*(.+)$/s.exec(fact);
  if (!match) return collapseRuns(fact).slice(0, FACT_MAX);

  const [, key = "", value = ""] = match;

  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return `${key}: ${parsed.length} ${parsed.length === 1 ? "entry" : "entries"}`;
      }
      if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed);
        return `${key}: ${keys.length} ${keys.length === 1 ? "field" : "fields"} (${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""})`;
      }
    } catch {
      // Truncated mid-structure: the payload is unusable, so report its shape.
      return `${key}: structured data (see Sources)`;
    }
  }

  const collapsed = collapseRuns(`${key}: ${value}`);
  return collapsed.length > FACT_MAX ? `${collapsed.slice(0, FACT_MAX).trimEnd()}…` : collapsed;
}

export function adaptAnswer(
  source: BackendAnswer,
  entity?: { type: ChainEntityType; id: string },
): AiExplorerAnswer {
  const entityType = entity?.type ?? "unknown";
  const entityId = entity?.id ?? "";
  const citations = source.citations ?? [];

  // Source ids arrive as UUIDs. The answer card renders them inline next to
  // every fact and risk note in a narrow column, so alias them to short
  // positional labels and rewrite each reference to match.
  const alias = new Map(citations.map((citation, index) => [citation.id, `src_${index + 1}`]));
  const relabel = (ids?: string[]): string[] => (ids ?? []).map((id) => alias.get(id) ?? id);

  return {
    card: source.facts ? deriveCard(source.facts, entityType, entityId) : undefined,
    answer: source.answer ?? "",
    summaryBullets: source.summaryBullets ?? [],
    confirmedFacts: (source.confirmedFacts ?? []).map((entry) => ({
      fact: formatFact(entry.fact),
      sourceIds: relabel(entry.sourceIds),
    })),
    inferences: (source.inferences ?? []).map((entry) => ({
      ...entry,
      sourceIds: relabel(entry.sourceIds),
    })),
    // The backend splits a note into title + detail; the card renders one line.
    riskNotes: (source.riskNotes ?? []).map((note) => ({
      severity: note.severity,
      note: note.detail ? `${note.title}. ${note.detail}` : note.title,
      sourceIds: relabel(note.evidenceCitationIds),
    })),
    citations: citations.map<SourceCitation>((citation) => ({
      id: alias.get(citation.id) ?? citation.id,
      provider: citation.provider,
      label: citation.description ?? `${citation.provider} source data`,
      url: citation.url ?? null,
      fetchedAt: citation.fetchedAt,
      entityType,
      entityId,
      fieldsUsed: citation.fieldsUsed ?? [],
    })),
    suggestedFollowUps: source.suggestedFollowUps ?? source.suggestedQuestions ?? [],
  };
}

/**
 * A failure the chat UI has no other surface for. Rendered through the normal
 * answer card so the composer unblocks and the user sees why nothing happened.
 */
export function errorAnswer(message: string): AiExplorerAnswer {
  return {
    answer: message,
    summaryBullets: [],
    confirmedFacts: [],
    inferences: [],
    riskNotes: [],
    citations: [],
    suggestedFollowUps: [],
  };
}


/* ---------------- answer header ---------------- */

const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const count = (v: unknown): number | undefined =>
  Array.isArray(v) ? v.length : typeof v === "number" ? v : undefined;

/** Scales a raw integer token supply by its decimals for display. */
function scaleSupply(raw: unknown, decimals: unknown): string | undefined {
  const text = str(raw);
  const dp = Number(decimals);
  if (!text || !/^\d+$/.test(text)) return undefined;
  if (!Number.isFinite(dp) || dp <= 0) return formatAmount(text, 0);
  const whole = text.length > dp ? text.slice(0, text.length - dp) : "0";
  return formatAmount(whole, 0);
}

/**
 * Builds the header from the entity's own facts rather than asking the model
 * for them: these are exact values, and the card should never disagree with the
 * data underneath it.
 */
export function deriveCard(
  facts: Record<string, unknown>,
  hintedKind: ChainEntityType,
  fallbackId: string,
): AnswerCardMeta {
  // The caller's hint comes from client-side pattern matching, which cannot tell
  // a token contract from a wallet. The fact bundle can, so trust it first.
  const kind: ChainEntityType =
    facts.symbol !== undefined || facts.totalSupply !== undefined
      ? "token"
      : facts.gasUsed !== undefined || facts.valueEth !== undefined
        ? "transaction"
        : facts.abiAvailable !== undefined || facts.compiler !== undefined
          ? "contract"
          : hintedKind === "unknown"
            ? "wallet"
            : hintedKind;

  const stats: AnswerStat[] = [];
  const push = (label: string, value: string | undefined, tone?: AnswerStat["tone"]) => {
    if (value !== undefined && value !== "") stats.push({ label, value, tone });
  };

  if (kind === "token") {
    const symbol = str(facts.symbol);
    const holders = count(facts.holders);
    const verified = bool(facts.verified);
    push("Supply", scaleSupply(facts.totalSupply, facts.decimals));
    push("Holders", holders !== undefined ? formatAmount(String(holders), 0) : undefined);
    push("Transfers seen", count(facts.recentTransfers) !== undefined ? String(count(facts.recentTransfers)) : undefined);
    if (verified !== undefined) push("Source code", verified ? "Verified" : "Unverified", verified ? "good" : "warn");
    if (bool(facts.proxy)) push("Contract", "Proxy", "warn");
    return {
      kind,
      title: str(facts.name) ?? (symbol ? `$${symbol}` : shortHex(fallbackId)),
      subtitle: symbol && str(facts.name) ? `$${symbol}` : undefined,
      stats,
    };
  }

  if (kind === "transaction") {
    const status = str(facts.status)?.toLowerCase();
    const ok = status === "ok" || status === "success" || status === "1";
    if (status) push("Status", ok ? "Succeeded" : "Failed", ok ? "good" : "bad");
    push("Value", facts.valueEth != null ? `${formatAmount(String(facts.valueEth))} ETH` : undefined);
    push("Method", str(facts.method));
    push("Gas used", facts.gasUsed != null ? formatAmount(String(Number(facts.gasUsed)), 0) : undefined);
    push("Token transfers", count(facts.tokenTransfers) !== undefined ? String(count(facts.tokenTransfers)) : undefined);
    return { kind, title: "Transaction", subtitle: shortHex(str(facts.hash) ?? fallbackId), stats };
  }

  // wallet or contract
  const isContract = bool(facts.isContract) || kind === "contract";
  push("Balance", facts.nativeBalanceEth != null ? `${formatAmount(String(facts.nativeBalanceEth))} ETH` : undefined);
  push("Tokens held", count(facts.tokenBalances) !== undefined ? String(count(facts.tokenBalances)) : undefined);
  push("Transactions", count(facts.transactionsFetched) !== undefined ? String(count(facts.transactionsFetched)) : undefined);
  const approvals = count(facts.approvalTransactions);
  if (approvals) push("Approvals", String(approvals), "warn");
  const failed = count(facts.failedTransactions);
  if (failed) push("Failed", String(failed), "warn");
  if (isContract && bool(facts.verified) !== undefined) {
    push("Source code", facts.verified ? "Verified" : "Unverified", facts.verified ? "good" : "warn");
  }
  return {
    kind: isContract ? "contract" : "wallet",
    title: isContract ? (str(facts.name) ?? "Smart contract") : "Wallet",
    subtitle: shortHex(str(facts.address) ?? fallbackId),
    stats,
  };
}

/* ---------------- chat ---------------- */

export function adaptSession(session: BackendSession): ChatSession {
  const active = session.activeEntity;
  return {
    id: session.id,
    title: session.title,
    entity:
      active && active.type !== "unknown"
        ? { type: active.type, chainId: CHAIN_ID, id: active.value }
        : undefined,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function adaptMessage(
  message: BackendMessage,
  entity?: { type: ChainEntityType; id: string },
): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    ai: message.aiResponseJson ? adaptAnswer(message.aiResponseJson, entity) : undefined,
    createdAt: message.createdAt,
  };
}

/* ---------------- entity summary ---------------- */

/**
 * Flattens a NormalizedEntity into the fixed-shape panel the dashboard renders.
 * Wallet and contract addresses carry balances and approvals; transactions do
 * not, so their unavailable fields resolve to NONE rather than a fabricated 0.
 */
export function adaptEntitySummary(entity: BackendEntity): EntitySummary {
  const facts = entity.facts ?? {};
  const address = str(facts.address) ?? str(facts.hash) ?? entity.value;
  const isTransaction = entity.type === "transaction";

  const tokenBalances = rows(facts.tokenBalances).map((balance) => ({
    symbol: str(balance.tokenSymbol) ?? str(balance.tokenName) ?? shortHex(balance.tokenAddress),
    balance: formatAmount(str(balance.formattedValue) ?? str(balance.rawValue) ?? "0"),
  }));

  // A transaction has no balances of its own; its token movements are the
  // closest equivalent and keep the panel informative.
  const transfers = rows(facts.tokenTransfers).map((transfer) => ({
    symbol: str(transfer.tokenSymbol) ?? str(transfer.tokenName) ?? shortHex(transfer.token),
    balance: formatAmount(str(transfer.formattedValue) ?? str(transfer.value) ?? "0"),
  }));

  const approvals = rows(facts.approvalTransactions).map((approval) => ({
    token: str(approval.tokenSymbol) ?? shortHex(approval.contract),
    spender: shortHex(approval.spender),
    amount:
      approval.currentUnlimited === true || approval.unlimited === true
        ? "Unlimited"
        : (str(approval.currentAllowanceRaw) ?? str(approval.amount) ?? NONE),
  }));

  return {
    address,
    kind: facts.isContract === true && entity.type === "wallet" ? "contract" : entity.type,
    nativeBalanceEth: isTransaction
      ? NONE
      : facts.nativeBalanceEth != null
        ? formatAmount(String(facts.nativeBalanceEth))
        : NONE,
    tokenBalances: isTransaction ? transfers : tokenBalances,
    recentCount: Number(facts.transactionsFetched ?? rows(facts.recentTransactions).length ?? 0),
    approvals,
    riskSignals: entity.riskNotes.map((note, index) => ({
      // React keys off this, and titles repeat across severities.
      code: `${index}_${note.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      severity: note.severity,
      title: note.title,
    })),
    explorerUrl:
      str(facts.explorerUrl) ??
      `${EXPLORER}/${isTransaction ? "tx" : "address"}/${entity.value}`,
  };
}
