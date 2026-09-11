import { centsToInput, MAX_POSITION_CENTS, parseDecimalUsdCents } from "./money";
import {
  decimalIsOne,
  decimalToString,
  multiplyDecimal,
  parseDecimal,
  sumDecimals,
  type Decimal,
} from "./decimal";
import type { ComparableRow } from "./compare";
import type {
  VaultAsset,
  VaultCollectibleReference,
  VaultPortfolioContext,
  VaultPortfolioValuation,
} from "../vault/types";

export type ImportReason =
  | "missingReference"
  | "foreignCurrency"
  | "missingDate"
  | "futureDate"
  | "missingValue"
  | "unitValue"
  | "quantityMismatch"
  | "purchaseCostOnly"
  | "overLimit";

export type ImportSourceKind = "reference" | "valuation" | "manual";

export type ImportEvidence = {
  sourceKind: "reference" | "valuation";
  value: string;
  currency: string;
  observedAt: string | null;
  sourceLabel: string | null;
  unitBased: boolean;
};

export type ImportCandidate = {
  id: string;
  name: string;
  status: "available" | "needs-value";
  cents: bigint | null;
  currency: "USD" | null;
  observedAt: string | null;
  sourceKind: ImportSourceKind | null;
  sourceLabel: string | null;
  reason: ImportReason | null;
  evidence: ImportEvidence | null;
  quantity: string | null;
  stale: boolean;
};

export type ManualEntry = { value: string; date: string };

export const STALE_DAYS = 365;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

export function normalizeReferenceDate(
  raw: string,
  now: Date = new Date(),
): { date: string | null; reason: "missingDate" | "futureDate" | null } {
  if (typeof raw !== "string" || raw.trim().length === 0)
    return { date: null, reason: "missingDate" };
  const match = DATE_PATTERN.exec(raw.trim());
  if (!match) return { date: null, reason: "missingDate" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31)
    return { date: null, reason: "missingDate" };
  const utc = Date.UTC(year, month - 1, day);
  const value = new Date(utc);
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  )
    return { date: null, reason: "missingDate" };
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (utc > today) return { date: null, reason: "futureDate" };
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    reason: null,
  };
}

export function isStaleDate(date: string, now: Date = new Date()): boolean {
  const normalized = normalizeReferenceDate(date, now);
  if (!normalized.date) return false;
  const utc = Date.parse(`${normalized.date}T00:00:00Z`);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return (today - utc) / 86_400_000 > STALE_DAYS;
}

export function referenceCents(raw: string): bigint | null {
  try {
    return parseDecimalUsdCents(raw);
  } catch {
    return null;
  }
}

function isUsd(currency: string | null | undefined): boolean {
  return typeof currency === "string" && currency.trim().toUpperCase() === "USD";
}

function latestValuation(
  asset: VaultAsset,
  portfolios: VaultPortfolioContext[],
): { valuation: VaultPortfolioValuation; portfolio: VaultPortfolioContext } | null {
  const keys = new Set(
    [asset.id, asset.identifier]
      .filter((value) => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
  let latest:
    | { valuation: VaultPortfolioValuation; portfolio: VaultPortfolioContext }
    | null = null;
  for (const portfolio of portfolios) {
    for (const valuation of portfolio.valuations ?? []) {
      const key = valuation.assetKey.trim().toLowerCase();
      // Match only exact or chain-prefixed keys ("token:<identifier>"), never
      // a free-form substring. Exact quantity matching is still required below.
      const matched = [...keys].some(
        (candidate) =>
          key === candidate || key.endsWith(`:${candidate}`),
      );
      if (!matched) continue;
      if (!isUsd(valuation.currency)) continue;
      if (!latest || valuation.updatedAt > latest.valuation.updatedAt)
        latest = { valuation, portfolio };
    }
  }
  return latest;
}

function snapshotQuantity(
  portfolio: VaultPortfolioContext,
  assetKey: string,
): Decimal | null {
  const snapshot = portfolio.latestSnapshot;
  if (!snapshot) return null;
  if (assetKey === "native:eth") return parseDecimal(snapshot.nativeBalanceEth);
  if (assetKey.startsWith("token:")) {
    const contract = assetKey.slice("token:".length);
    const token = snapshot.tokens.find(
      (item) => item.contract.toLowerCase() === contract.toLowerCase(),
    );
    return token ? parseDecimal(token.quantity) : null;
  }
  if (assetKey.startsWith("nft:")) {
    const [, contract, tokenId] = assetKey.split(":");
    const nft = snapshot.nfts.find(
      (item) =>
        item.contract.toLowerCase() === contract?.toLowerCase() &&
        item.tokenId === tokenId,
    );
    return nft ? parseDecimal(nft.quantity) : null;
  }
  return null;
}

function latestReference(
  references: VaultCollectibleReference[] | undefined,
): VaultCollectibleReference | null {
  if (!Array.isArray(references) || references.length === 0) return null;
  let latest: VaultCollectibleReference | null = null;
  for (const reference of references) {
    if (!isUsd(reference.currency)) continue;
    if (!latest || reference.observedAt > latest.observedAt)
      latest = reference;
  }
  return latest;
}

function hasForeignReference(
  references: VaultCollectibleReference[] | undefined,
): boolean {
  if (!Array.isArray(references)) return false;
  return references.some(
    (reference) =>
      typeof reference.currency === "string" &&
      reference.currency.trim().length > 0 &&
      !isUsd(reference.currency),
  );
}

function lotQuantity(asset: VaultAsset): Decimal | null {
  if (!Array.isArray(asset.lots) || asset.lots.length === 0) return null;
  try {
    return sumDecimals(asset.lots.map((lot) => parseDecimal(lot.quantity)));
  } catch {
    return null;
  }
}

function safeName(asset: VaultAsset, index: number): string {
  const name =
    typeof asset.name === "string" && asset.name.trim().length > 0
      ? asset.name.trim()
      : `Position ${index + 1}`;
  return name.slice(0, 40);
}

function decimalToCents(value: Decimal): bigint | null {
  if (value.coefficient > 10_000_000_000_000_000_000n) return null;
  const numerator = value.coefficient * 100n;
  const denominator = 10n ** BigInt(value.scale);
  const cents = (numerator * 2n + denominator) / (denominator * 2n);
  return cents;
}

export function extractImportCandidates(
  assets: VaultAsset[],
  portfolios: VaultPortfolioContext[] = [],
  now: Date = new Date(),
): ImportCandidate[] {
  if (!Array.isArray(assets)) throw new Error("assets");
  return assets.map((asset, index) => {
    const id = asset.id;
    const name = safeName(asset, index);
    const quantityDec = lotQuantity(asset);
    const quantity = quantityDec ? decimalToString(quantityDec) : null;
    const base = {
      id,
      name,
      status: "needs-value" as const,
      cents: null,
      currency: null,
      observedAt: null,
      sourceKind: null,
      sourceLabel: null,
      reason: null,
      evidence: null,
      quantity,
      stale: false,
    };

    const matched = latestValuation(asset, portfolios);
    if (matched) {
      const { valuation, portfolio } = matched;
      const dateResult = normalizeReferenceDate(valuation.updatedAt, now);
      const unitCents = referenceCents(valuation.unitPrice);
      const evidence: ImportEvidence = {
        sourceKind: "valuation",
        value: valuation.unitPrice,
        currency: "USD",
        observedAt: dateResult.date,
        sourceLabel: null,
        unitBased: true,
      };
      const holding = snapshotQuantity(portfolio, valuation.assetKey);
      if (unitCents === null)
        return {
          ...base,
          status: "needs-value" as const,
          reason: "missingValue" as ImportReason,
          evidence,
        };
      if (dateResult.reason)
        return {
          ...base,
          status: "needs-value" as const,
          reason: dateResult.reason,
          evidence,
        };
      if (!holding || !quantityDec || !isSameDecimal(holding, quantityDec))
        return {
          ...base,
          status: "needs-value" as const,
          reason: "quantityMismatch" as ImportReason,
          evidence,
        };
      const total = multiplyDecimal(
        parseDecimal(valuation.unitPrice),
        holding,
      );
      const cents = decimalToCents(total);
      if (cents === null)
        return {
          ...base,
          status: "needs-value" as const,
          reason: "missingValue" as ImportReason,
          evidence,
        };
      if (cents > MAX_POSITION_CENTS)
        return {
          ...base,
          status: "needs-value" as const,
          reason: "overLimit" as ImportReason,
          evidence,
        };
      return {
        ...base,
        status: "available" as const,
        cents,
        currency: "USD" as const,
        observedAt: dateResult.date,
        sourceKind: "valuation" as ImportSourceKind,
        sourceLabel: null,
        evidence,
        stale: isStaleDate(dateResult.date as string, now),
      };
    }

    const reference = latestReference(asset.collectible?.references);
    if (reference) {
      const dateResult = normalizeReferenceDate(reference.observedAt, now);
      const cents = referenceCents(reference.value);
      const evidence: ImportEvidence = {
        sourceKind: "reference",
        value: reference.value,
        currency: "USD",
        observedAt: dateResult.date,
        sourceLabel: reference.label || null,
        unitBased: true,
      };
      if (cents === null)
        return {
          ...base,
          status: "needs-value" as const,
          reason: "missingValue" as ImportReason,
          evidence,
        };
      if (dateResult.reason)
        return {
          ...base,
          status: "needs-value" as const,
          reason: dateResult.reason,
          evidence,
        };
      if (cents > MAX_POSITION_CENTS)
        return {
          ...base,
          status: "needs-value" as const,
          reason: "overLimit" as ImportReason,
          evidence,
        };
      // A stored reference is a reference/unit value. Only a single total unit
      // makes it unambiguously the position total.
      if (!quantityDec || !decimalIsOne(quantityDec))
        return {
          ...base,
          status: "needs-value" as const,
          reason: "unitValue" as ImportReason,
          evidence,
        };
      return {
        ...base,
        status: "available" as const,
        cents,
        currency: "USD" as const,
        observedAt: dateResult.date,
        sourceKind: "reference" as ImportSourceKind,
        sourceLabel: reference.label || null,
        evidence,
        stale: isStaleDate(dateResult.date as string, now),
      };
    }

    const reason: ImportReason = hasForeignReference(
      asset.collectible?.references,
    )
      ? "foreignCurrency"
      : (asset.lots?.length ?? 0) > 0
        ? "purchaseCostOnly"
        : "missingReference";
    return {
      ...base,
      status: "needs-value" as const,
      reason,
    };
  });
}

function isSameDecimal(left: Decimal, right: Decimal): boolean {
  const scale = Math.max(left.scale, right.scale);
  return (
    left.coefficient * 10n ** BigInt(scale - left.scale) ===
    right.coefficient * 10n ** BigInt(scale - right.scale)
  );
}

export function resolveCandidate(
  candidate: ImportCandidate,
  manual: ManualEntry | null | undefined,
  now: Date = new Date(),
): ImportCandidate {
  if (candidate.status === "available") return { ...candidate };
  const value = manual?.value ?? "";
  const date = manual?.date ?? "";
  if (value.trim().length === 0 && date.trim().length === 0)
    return { ...candidate };
  const cents = referenceCents(value);
  if (cents === null)
    return { ...candidate, reason: "missingValue", currency: null };
  if (cents > MAX_POSITION_CENTS)
    return { ...candidate, reason: "overLimit", currency: null };
  const dateResult = normalizeReferenceDate(date, now);
  if (dateResult.reason)
    return { ...candidate, reason: dateResult.reason, currency: null };
  return {
    ...candidate,
    status: "available",
    cents,
    currency: "USD",
    observedAt: dateResult.date,
    sourceKind: "manual",
    sourceLabel: null,
    reason: null,
    stale: isStaleDate(dateResult.date as string, now),
  };
}

export function candidateToRow(candidate: ImportCandidate): ComparableRow {
  if (
    candidate.status !== "available" ||
    candidate.cents === null ||
    candidate.cents > MAX_POSITION_CENTS
  )
    throw new Error("value");
  return { id: candidate.id, label: candidate.name, cents: candidate.cents };
}

export function candidateValue(candidate: ImportCandidate): string {
  if (
    candidate.status !== "available" ||
    candidate.cents === null ||
    candidate.cents > MAX_POSITION_CENTS
  )
    throw new Error("value");
  return centsToInput(candidate.cents);
}
