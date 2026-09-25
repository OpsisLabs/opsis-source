export type TransactionTimelineStage = "submitted" | "inclusion" | "receipt";
export type TransactionTimelineRow = {
  stage: TransactionTimelineStage;
  key: "from" | "to" | "value" | "block" | "blockHash" | "status" | "gas";
  value: string;
};
export type TransactionReceiptOutcome = "success" | "failed" | "pending" | "unknown";

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
