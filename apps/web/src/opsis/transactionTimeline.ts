import type { DecodedAction, ResearchFacts } from "../private/api";

export type TransactionTimelineStage = "submitted" | "inclusion" | "receipt";
export type TransactionTimelineRow = {
  stage: TransactionTimelineStage;
  key: "from" | "to" | "value" | "block" | "blockHash" | "status" | "gas";
  value: string;
};
export type TransactionReceiptOutcome = "success" | "failed" | "pending" | "unknown";

export type ReceiptTransferEvent = {
  emitter: string;
  from: string;
  to: string;
  rawAmount: string;
  logIndex: string;
};
export type ReceiptTransferCoverage = "complete" | "capped" | "partial" | "unavailable";
export const MAX_RECEIPT_TRANSFER_EVENTS = 64;

const integerString = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);

/** Accept only bounded, well-formed source-reported Transfer-shaped receipt logs. */
export function receiptTransferObservations(facts: Record<string, unknown>): {
  coverage: ReceiptTransferCoverage | undefined;
  events: ReceiptTransferEvent[];
} {
  const rawCoverage = facts.receiptTransferCoverage;
  const reportedCoverage: ReceiptTransferCoverage | undefined =
    rawCoverage === "complete" || rawCoverage === "capped" || rawCoverage === "partial" || rawCoverage === "unavailable"
      ? rawCoverage
      : undefined;
  const rawEvents = facts.receiptTransferEvents;
  if (!reportedCoverage) return { coverage: undefined, events: [] };
  if (reportedCoverage === "unavailable" || reportedCoverage === "capped") {
    return { coverage: reportedCoverage, events: [] };
  }
  if (!Array.isArray(rawEvents)) {
    return { coverage: reportedCoverage === "complete" ? "partial" : reportedCoverage, events: [] };
  }
  if (rawEvents.length > MAX_RECEIPT_TRANSFER_EVENTS) {
    return { coverage: "capped", events: [] };
  }

  const events: ReceiptTransferEvent[] = [];
  let malformed = false;
  for (const value of rawEvents) {
    if (!value || typeof value !== "object") {
      malformed = true;
      continue;
    }
    const row = value as Record<string, unknown>;
    if (
      typeof row.emitter === "string" && /^0x[0-9a-f]{40}$/i.test(row.emitter) &&
      typeof row.from === "string" && /^0x[0-9a-f]{40}$/i.test(row.from) &&
      typeof row.to === "string" && /^0x[0-9a-f]{40}$/i.test(row.to) &&
      integerString(row.rawAmount) && integerString(row.logIndex)
    ) {
      events.push({
        emitter: row.emitter,
        from: row.from,
        to: row.to,
        rawAmount: row.rawAmount,
        logIndex: row.logIndex,
      });
    } else {
      malformed = true;
    }
  }
  const coverage = malformed && reportedCoverage === "complete" ? "partial" : reportedCoverage;
  return { coverage, events };
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" || typeof value === "number" ? String(value) : undefined;

const address = (value: unknown): string | undefined =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) ? value : undefined;

const nativeValue = (value: unknown): string | undefined =>
  typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? value : undefined;

/** RPC quantities are hex; accept only exact non-negative integer forms. */
function quantity(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    if (/^0x[0-9a-f]+$/i.test(raw)) return BigInt(raw).toString(10);
    if (/^\d+$/.test(raw) && (typeof value !== "number" || Number.isSafeInteger(value))) return BigInt(raw).toString(10);
  } catch {
    return undefined;
  }
  return undefined;
}

export function transactionReceiptOutcome(value: unknown): TransactionReceiptOutcome {
  const raw = text(value)?.toLowerCase();
  if (raw === "0x1" || raw === "1" || raw === "success" || raw === "ok") return "success";
  if (raw === "0x0" || raw === "0" || raw === "failed" || raw === "error") return "failed";
  if (raw === "pending") return "pending";
  return "unknown";
}

/** Builds observation stages only from scalar transaction facts returned by the API. */
export function transactionTimelineRows(
  facts: Record<string, unknown>,
): TransactionTimelineRow[] {
  const rows: TransactionTimelineRow[] = [];
  const from = address(facts.from);
  const to = address(facts.to);
  const value = nativeValue(facts.valueEth);
  const rawValue = quantity(facts.value);
  const block = quantity(facts.blockNumber);
  const gas = quantity(facts.gasUsed);
  const blockHash = text(facts.blockHash);

  if (from) rows.push({ stage: "submitted", key: "from", value: from });
  if (to) rows.push({ stage: "submitted", key: "to", value: to });
  if (value) rows.push({ stage: "submitted", key: "value", value: `${value} ETH` });
  else if (rawValue) rows.push({ stage: "submitted", key: "value", value: `${rawValue} wei` });
  if (block) rows.push({ stage: "inclusion", key: "block", value: block });
  if (blockHash && /^0x[0-9a-f]{64}$/i.test(blockHash)) {
    rows.push({ stage: "inclusion", key: "blockHash", value: blockHash });
  }

  const outcome = transactionReceiptOutcome(facts.status);
  rows.push({ stage: "receipt", key: "status", value: outcome });
  if (gas) rows.push({ stage: "receipt", key: "gas", value: gas });
  return rows;
}

/** Group an exact decimal string without converting it to a floating-point value. */
export function formatExactAmount(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

export function scaleRawAmount(raw: unknown, decimals: unknown): string | null {
  if (!integerString(raw) || typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
  const text = BigInt(raw).toString().padStart(decimals + 1, "0");
  if (decimals === 0) return text;
  const fraction = text.slice(-decimals).replace(/0+$/, "");
  return `${text.slice(0, -decimals)}${fraction ? `.${fraction}` : ""}`;
}

export function actionAmount(leg: { rawAmount: string; amount: string | null; token: { decimals: number | null } }): string | null {
  const exact = scaleRawAmount(leg.rawAmount, leg.token.decimals);
  return exact !== null && exact === leg.amount ? formatExactAmount(exact) : null;
}

export function feePercent(feeBps: number | null): string | null {
  if (feeBps === null || !Number.isSafeInteger(feeBps) || feeBps < 0) return null;
  return scaleRawAmount(String(feeBps), 2);
}

export function tokenHeading(facts: ResearchFacts, fallback: string): string {
  const parts = [facts.name, facts.symbol].filter((value): value is string => typeof value === "string" && value.length > 0);
  return [...new Set(parts)].join(" · ") || fallback;
}

/** Swaps lead, since they are what the transaction did; the rest keep their receipt order. */
export function orderActions(actions: DecodedAction[]): DecodedAction[] {
  return [...actions].sort((a, b) =>
    Number(b.kind === "uniswap_v3_swap") - Number(a.kind === "uniswap_v3_swap") || a.logIndex - b.logIndex);
}
