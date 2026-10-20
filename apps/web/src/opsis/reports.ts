import type { PrivateAnalysis } from "../private/api";
import type { ExitCheckQuote, ExitCheckOutputSymbol } from "../exit-check/api";
import type { VaultConversationTurn } from "../vault/types";
import { captureResearchCheck, captureTradeCheck } from "./saved-checks";

function sourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function researchReport(result: PrivateAnalysis, comparisonEnabled = false): VaultConversationTurn {
  const comparison = comparisonEnabled ? captureResearchCheck(result) : null;
  return {
    ...(comparison ? { comparison } : {}),
    question: result.answer.card?.title ?? "Research observation",
    entity: result.entity.value,
    answer: result.answer.answer,
    bullets: [
      `Chain ${result.entity.chainId} · ${result.entity.type} · Partial coverage`,
      ...result.answer.riskNotes.map(
        (n) => `${n.severity}: ${n.note} [${n.sourceIds.join(", ")}]`,
      ),
      ...result.answer.confirmedFacts.map(
        (f) => `${f.fact} [${f.sourceIds.join(", ")}]`,
      ),
    ].slice(0, 99),
    sources: result.answer.citations.slice(0, 100).map((s) => ({
      label: `[${s.id}] ${s.label}`,
      url: sourceUrl(s.url),
      fetchedAt: s.fetchedAt,
    })),
    savedAt: new Date().toISOString(),
    ...(result.entity.chainId === 4663
      ? {
          opsis: {
            workspace: "research" as const,
            token: result.entity.type === "token",
            chainId: 4663 as const,
          },
        }
      : {}),
  };
}

export function tradeReport(
  result: ExitCheckQuote,
  output: ExitCheckOutputSymbol,
  comparisonEnabled = false,
): VaultConversationTurn {
  const comparison = comparisonEnabled ? captureTradeCheck(result, output) : null;
  return {
    ...(comparison ? { comparison } : {}),
    question: "Trade Check · Robinhood Chain",
    entity: result.input.contract,
    answer:
      result.supported && result.quote && result.output
        ? `${result.input.amount} ${result.input.symbol ?? "tokens"} → ${result.quote.amountOutDisplay} ${result.output.symbol}\nPrice impact: ${result.quote.priceImpactPercent === null ? "unknown" : `${result.quote.priceImpactPercent}%`} · Included pool fee: ${result.quote.feePercent}%`
        : `${result.input.amount} ${result.input.symbol ?? "tokens"} → ${output} · No observed quote (${result.reason}).`,
    bullets: [
      `Checked ${result.quotedAt} · Block ${result.anchor.blockNumber} · ${result.anchor.blockHash}`,
      `Original expiry: ${result.expiresAt}. Saved observation only; request a new quote before acting. Gas excluded. Execution is not proven.`,
      `Quoted pools: ${result.coverage.poolsQuoted.length}; failed quotes: ${result.coverage.poolsFailed.length}; failed discovery: ${result.coverage.poolsDiscoveryFailed.length}.`,
      ...result.limitations,
    ].slice(0, 99),
    sources: [
      { label: result.provider.name, url: null, fetchedAt: result.quotedAt },
    ],
    savedAt: new Date().toISOString(),
    opsis: { workspace: "check", token: true, chainId: 4663 },
  };
}
