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
  AnswerWidget,
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

  const card = source.facts ? deriveCard(source.facts, entityType, entityId) : undefined;
  return {
    card,
    widgets: card && source.facts ? deriveWidgets(source.facts, card.kind) : undefined,
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
      id: str(facts.address) ?? fallbackId,
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
    return { kind, id: str(facts.hash) ?? fallbackId, title: "Transaction", subtitle: shortHex(str(facts.hash) ?? fallbackId), stats };
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
    id: str(facts.address) ?? fallbackId,
    title: isContract ? (str(facts.name) ?? "Smart contract") : "Wallet",
    subtitle: shortHex(str(facts.address) ?? fallbackId),
    stats,
  };
}


/* ---------------- answer widgets ---------------- */

/** Blockscout returns addresses as strings in some payloads and {hash} in others. */
const hexOf = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.startsWith("0x")) return value;
  const hash = (value as { hash?: unknown } | null)?.hash;
  return typeof hash === "string" ? hash : undefined;
};

const num = (value: unknown): number | undefined => {
  const n = Number(str(value));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Interactive panels derived from the entity's facts. Everything here is
 * computed from data already fetched for the answer — no extra API calls —
 * and every address row can pivot into its own lookup.
 */
export function deriveWidgets(facts: Record<string, unknown>, kind: ChainEntityType): AnswerWidget[] {
  const widgets: AnswerWidget[] = [];
  const transfers = rows(facts.recentTransfers).length > 0 ? rows(facts.recentTransfers) : rows(facts.tokenTransfers);
  const transactions = rows(facts.recentTransactions);

  // Activity chart from whatever timestamped events the window contains.
  const stamps = [...transfers, ...transactions]
    .map((r) => str(r.timestamp) ?? str(r.block_signed_at))
    .filter((t): t is string => typeof t === "string" && t.length >= 10);
  if (stamps.length >= 3) {
    const byDay = new Map<string, number>();
    for (const t of stamps) {
      const day = t.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const bars = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([day, count]) => ({ label: day.slice(5), count }));
    if (bars.length >= 2) {
      widgets.push({ kind: "bars", title: "Activity by day", note: `${stamps.length} recent events · UTC`, bars });
    }
  }

  // Transfer rows carry formattedValue (already scaled by the token's decimals)
  // with rawValue as the wei-sized fallback.
  const transferAmount = (t: Record<string, unknown>, scale: number): number =>
    num(t.formattedValue) ?? (num(t.rawValue) ?? num(t.value) ?? 0) / scale;

  if (kind === "token" && transfers.length > 0) {
    const dp = num(facts.decimals) ?? 18;
    const scale = 10 ** dp;

    const moved = new Map<string, { total: number; count: number }>();
    let volume = 0;
    for (const t of transfers) {
      const value = transferAmount(t, scale);
      volume += value;
      for (const side of [hexOf(t.from), hexOf(t.to)]) {
        if (!side) continue;
        const entry = moved.get(side) ?? { total: 0, count: 0 };
        entry.total += value;
        entry.count += 1;
        moved.set(side, entry);
      }
    }
    const top = [...moved.entries()]
      .sort((a, b) => b[1].total - a[1].total || b[1].count - a[1].count)
      .slice(0, 5);
    if (top.length >= 2) {
      widgets.push({
        kind: "rows",
        title: "Most active addresses",
        note: "recent transfers, not all-time holders",
        rows: top.map(([addr, m]) => ({
          label: shortHex(addr),
          sub: `${m.count} transfer${m.count === 1 ? "" : "s"}`,
          value: volume > 0 ? `${Math.min(100, Math.round((m.total / volume) * 100))}% of volume` : undefined,
          pivot: addr,
        })),
      });
    }

    const ranked = transfers
      .map((t) => ({ from: hexOf(t.from), to: hexOf(t.to), value: transferAmount(t, scale) }))
      .filter((t): t is { from: string; to: string; value: number } => Boolean(t.from && t.to) && t.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    if (ranked.length > 0) {
      widgets.push({
        kind: "rows",
        title: "Largest recent transfers",
        rows: ranked.map((t) => ({
          label: `${shortHex(t.from)} → ${shortHex(t.to)}`,
          value: formatAmount(String(t.value), 2),
          pivot: t.to,
        })),
      });
    }
  }

  if (kind === "wallet" || kind === "contract") {
    const balances = rows(facts.tokenBalances);
    if (balances.length > 0) {
      widgets.push({
        kind: "rows",
        title: "Token holdings",
        rows: balances.slice(0, 6).map((b) => ({
          label: str(b.tokenSymbol) ?? str(b.tokenName) ?? shortHex(b.tokenAddress),
          value: formatAmount(str(b.formattedValue) ?? "0"),
          pivot: hexOf(b.tokenAddress),
        })),
      });
    }

    const approvals = rows(facts.approvalTransactions);
    if (approvals.length > 0) {
      widgets.push({
        kind: "rows",
        title: "Token approvals",
        note: "spenders this wallet has authorized",
        rows: approvals.slice(0, 5).map((a) => {
          const unlimited = a.currentUnlimited === true || a.unlimited === true;
          return {
            label: str(a.tokenSymbol) ?? shortHex(a.contract),
            sub: `spender ${shortHex(a.spender)}`,
            value: unlimited ? "Unlimited" : (str(a.amount) ?? "—"),
            tone: unlimited ? ("warn" as const) : undefined,
            pivot: hexOf(a.spender),
          };
        }),
      });
    }

    if (transactions.length >= 3) {
      const self = (str(facts.address) ?? "").toLowerCase();
      const counterparties = new Map<string, number>();
      for (const t of transactions) {
        for (const side of [hexOf(t.from), hexOf(t.to)]) {
          if (!side || side.toLowerCase() === self) continue;
          counterparties.set(side, (counterparties.get(side) ?? 0) + 1);
        }
      }
      const top = [...counterparties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (top.length >= 2) {
        widgets.push({
          kind: "rows",
          title: "Top counterparties",
          note: "from recent transactions",
          rows: top.map(([addr, count]) => ({
            label: shortHex(addr),
            value: `${count}×`,
            pivot: addr,
          })),
        });
      }
    }
  }

  if (kind === "transaction") {
    const steps: NonNullable<AnswerWidget["rows"]> = [];
    const method = str(facts.method);
    if (method) steps.push({ label: "Called", value: method });
    for (const t of rows(facts.tokenTransfers).slice(0, 4)) {
      steps.push({
        label: `${shortHex(hexOf(t.from))} → ${shortHex(hexOf(t.to))}`,
        sub: str(t.tokenSymbol),
        value: str(t.formattedValue) ?? str(t.value),
        pivot: hexOf(t.to),
      });
    }
    const internal = rows(facts.internalTransactions);
    if (internal.length > 0) steps.push({ label: "Internal calls", value: String(internal.length) });
    if (steps.length > 0) widgets.push({ kind: "rows", title: "What happened", rows: steps });
  }

  return widgets;
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
