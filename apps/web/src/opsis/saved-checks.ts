import { REVIEWED_ASSETS } from "@rh-chain/shared";
import type { PrivateAnalysis } from "../private/api";
import type { ExitCheckQuote, ExitCheckOutputSymbol } from "../exit-check/api";
import {
  checkTime,
  formatCheckUnits,
  parseSavedCheck,
  type SavedCheck,
  type SavedTradeCheck,
} from "../vault/saved-check";
import type { Capabilities } from "./model";

export function savedCheckComparisonsEnabled(
  capabilities: Capabilities,
): boolean {
  return (
    import.meta.env.VITE_SAVED_CHECK_COMPARISONS_ENABLED === "true" &&
    capabilities.savedCheckComparisons === true
  );
}

const integer = (v: unknown): string | null => {
  if (typeof v === "number" && (!Number.isSafeInteger(v) || v < 0)) return null;
  const text = String(v);
  return /^(0|[1-9][0-9]{0,77})$/.test(text) ? text : null;
};
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

export function captureResearchCheck(
  result: PrivateAnalysis,
): SavedCheck | null {
  if (result.entity.type !== "token" || result.entity.chainId !== 4663)
    return null;
  const f = result.entity.facts;
  const holderCoverage =
    f.holderCoverage === "top_holders" ? "top_holders" : "unavailable";
  const sourceCoverage = f.sourceCoverage ?? "unavailable";
  const providers = [
    ...new Set(result.entity.citations.map((c) => c.provider)),
  ].sort();
  // The explorer reports its original observation time even for reused data.
  const observedAt =
    f.explorerObservedAt ??
    result.entity.citations
      .map((c) => c.fetchedAt)
      .filter(checkTime)
      .sort()[0];
  return parseSavedCheck({
    version: 1,
    kind: "research",
    method: "token-facts-v1",
    chainId: 4663,
    identifier: result.entity.value.toLowerCase(),
    observedAt,
    providers,
    sourceCoverage,
    holderCoverage,
    activityCoverage:
      f.activityCoverage === "indexed_window"
        ? "indexed_window"
        : "unavailable",
    decimals: Number.isInteger(f.decimals) ? f.decimals : null,
    holders: holderCoverage === "top_holders" ? integer(f.holders) : null,
    holdersAnalyzed:
      holderCoverage === "top_holders" ? integer(f.holdersAnalyzed) : null,
    top1WalletShare:
      holderCoverage === "top_holders" &&
      /^(?:(?:0|[1-9][0-9]?)(?:\.[0-9]{1,18})?|100(?:\.0{1,18})?)$/.test(
        String(f.top1WalletShare),
      )
        ? String(f.top1WalletShare)
        : null,
    verified: sourceCoverage === "explorer_metadata" ? bool(f.verified) : null,
    proxy: sourceCoverage === "explorer_metadata" ? bool(f.proxy) : null,
  });
}

export function captureTradeCheck(
  result: ExitCheckQuote,
  output: ExitCheckOutputSymbol,
): SavedCheck | null {
  const selected = result.output ?? REVIEWED_ASSETS[output];
  const pools = (values: Array<{ fee: number; pool: string }>) =>
    values.map((p) => `${p.fee}:${p.pool.toLowerCase()}`).sort();
  const numbers = (values: number[]) => [...values].sort((a, b) => a - b);
  try {
    return parseSavedCheck({
      version: 1,
      kind: "check",
      method: "uniswap-v3-quote-v1",
      chainId: result.chain.id,
      identifier: result.input.contract.toLowerCase(),
      observedAt: result.quotedAt,
      providers: [result.provider.name],
      inputDecimals: result.input.decimals,
      inputRaw: result.input.rawAmount,
      output: {
        address: selected.address.toLowerCase(),
        decimals: selected.decimals,
      },
      supported: result.supported,
      pool:
        result.supported && result.quote
          ? {
              address: result.quote.pool.pool.toLowerCase(),
              fee: result.quote.pool.fee,
            }
          : null,
      amountOut: result.supported ? (result.quote?.amountOut ?? null) : null,
      priceImpactBps: result.supported
        ? (result.quote?.priceImpactBps ?? null)
        : null,
      anchor: {
        height: result.anchor.blockNumber,
        hash: result.anchor.blockHash.toLowerCase(),
      },
      expiresAt: result.expiresAt,
      coverage: {
        tested: numbers(result.coverage.feeTiersTested),
        found: pools(result.coverage.poolsFound),
        quoted: pools(result.coverage.poolsQuoted),
        failed: pools(result.coverage.poolsFailed),
        missing: numbers(result.coverage.poolsMissing),
        discoveryFailed: numbers(result.coverage.poolsDiscoveryFailed),
      },
    });
  } catch {
    return null;
  }
}

export type ComparisonReason =
  | "legacy"
  | "invalid"
  | "different_subject"
  | "different_tool"
  | "different_source"
  | "different_units"
  | "different_size"
  | "different_pool"
  | "different_coverage"
  | "nonchronological"
  | "same_observation"
  | "conflicting_anchor";
export type ComparisonRow = {
  key:
    | "holders"
    | "concentration"
    | "verified"
    | "proxy"
    | "quotedOutput"
    | "impact";
  before: string | boolean | null;
  after: string | boolean | null;
  delta: string | null;
  status: "changed" | "unchanged" | "unknown";
  unit: "count" | "percentage_points" | "boolean" | "output_tokens" | "bps";
};
export type CheckComparison =
  | { state: "unavailable"; reason: ComparisonReason }
  | {
      state: "compared";
      before: SavedCheck;
      after: SavedCheck;
      rows: ComparisonRow[];
    };

/** Historical evidence only. No fetch, storage, quotes, private notes or text parsing. */
export function compareSavedChecks(
  earlier: unknown,
  later: unknown,
): CheckComparison {
  const unavailable = (reason: ComparisonReason): CheckComparison => ({
    state: "unavailable",
    reason,
  });
  if (earlier === undefined || later === undefined)
    return unavailable("legacy");
  const a = parseSavedCheck(earlier),
    b = parseSavedCheck(later);
  if (!a || !b) return unavailable("invalid");
  if (a.chainId !== b.chainId || a.identifier !== b.identifier)
    return unavailable("different_subject");
  if (a.kind !== b.kind) return unavailable("different_tool");
  if (JSON.stringify(a.providers) !== JSON.stringify(b.providers))
    return unavailable("different_source");
  if (Date.parse(a.observedAt) > Date.parse(b.observedAt))
    return unavailable("nonchronological");
  if (a.observedAt === b.observedAt) return unavailable("same_observation");
  const rows: ComparisonRow[] = [];
  const row = (
    key: ComparisonRow["key"],
    before: ComparisonRow["before"],
    after: ComparisonRow["after"],
    unit: ComparisonRow["unit"],
    delta: string | null = null,
  ) => {
    rows.push({
      key,
      before,
      after,
      unit,
      delta: before === null || after === null ? null : delta,
      status:
        before === null || after === null
          ? "unknown"
          : delta === "0" || before === after
            ? "unchanged"
            : "changed",
    });
  };
  if (a.kind === "research" && b.kind === "research") {
    if (a.sourceCoverage !== b.sourceCoverage)
      return unavailable("different_source");
    if (a.decimals !== b.decimals) return unavailable("different_units");
    if (
      a.holderCoverage !== b.holderCoverage ||
      a.activityCoverage !== b.activityCoverage
    )
      return unavailable("different_coverage");
    row(
      "holders",
      a.holders,
      b.holders,
      "count",
      exactDifference(a.holders, b.holders, 0),
    );
    const sameSample =
      a.holdersAnalyzed !== null &&
      a.holdersAnalyzed !== "0" &&
      a.holdersAnalyzed === b.holdersAnalyzed;
    // normalize.ts already reports percentages, rounded by the source adapter.
    const before = sameSample ? a.top1WalletShare : null,
      after = sameSample ? b.top1WalletShare : null;
    row(
      "concentration",
      before,
      after,
      "percentage_points",
      decimalDifference(before, after),
    );
    row("verified", a.verified, b.verified, "boolean");
    row("proxy", a.proxy, b.proxy, "boolean");
  } else if (a.kind === "check" && b.kind === "check") {
    if (
      a.inputDecimals !== b.inputDecimals ||
      a.output.address !== b.output.address ||
      a.output.decimals !== b.output.decimals
    )
      return unavailable("different_units");
    if (a.inputRaw !== b.inputRaw) return unavailable("different_size");
    if (a.anchor.height > b.anchor.height)
      return unavailable("nonchronological");
    if (a.anchor.height === b.anchor.height)
      return unavailable(
        a.anchor.hash === b.anchor.hash
          ? "same_observation"
          : "conflicting_anchor",
      );
    if (a.anchor.hash === b.anchor.hash)
      return unavailable("conflicting_anchor");
    if (a.pool?.address !== b.pool?.address || a.pool?.fee !== b.pool?.fee)
      return unavailable("different_pool");
    if (
      a.supported !== b.supported ||
      (
        Object.keys(a.coverage) as Array<keyof SavedTradeCheck["coverage"]>
      ).some(
        (key) =>
          JSON.stringify(a.coverage[key]) !== JSON.stringify(b.coverage[key]),
      )
    )
      return unavailable("different_coverage");
    const amount = (check: SavedTradeCheck) =>
      check.amountOut === null
        ? null
        : formatCheckUnits(check.amountOut, check.output.decimals);
    row(
      "quotedOutput",
      amount(a),
      amount(b),
      "output_tokens",
      exactDifference(a.amountOut, b.amountOut, a.output.decimals),
    );
    row(
      "impact",
      a.priceImpactBps,
      b.priceImpactBps,
      "bps",
      exactDifference(a.priceImpactBps, b.priceImpactBps, 0),
    );
  }
  return { state: "compared", before: a, after: b, rows };
}

function exactDifference(
  a: string | null,
  b: string | null,
  decimals: number,
): string | null {
  if (a === null || b === null) return null;
  const delta = BigInt(b) - BigInt(a);
  return `${delta > 0n ? "+" : ""}${formatCheckUnits(String(delta), decimals)}`;
}
function decimalDifference(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  const scale = Math.max(
    a.split(".")[1]?.length ?? 0,
    b.split(".")[1]?.length ?? 0,
  );
  const raw = (v: string) => {
    const [whole, fraction = ""] = v.split(".");
    return whole + fraction.padEnd(scale, "0");
  };
  return exactDifference(raw(a), raw(b), scale);
}
