import type { Receipt } from "./receipts.js";

export const STOCK_DESK_LINE =
  "A Stock Token tracks a stock; it is not a share. The issuer sets who can hold it; Opsis does not check eligibility. Not investment advice.";
export type DeskEvidence = {
  block: number | null;
  blockHash: string | null;
  time: string;
  source: string;
  value?: string;
  unit?: string;
};
export type DeskFact<T> =
  | { state: "available"; value: T; evidence: DeskEvidence[] }
  | { state: "unknown"; reason: string };
export type DeskQuote = {
  notionalUsd: string;
  inputAmount: string;
  outputAmount: string;
  outputUnit: "USDG";
  priceUsdG: string;
  impactBps: string | null;
  expiresAt: string;
};
export type GapHistory =
  | { state: "unavailable"; reason: string }
  | {
      state: "available";
      points: Array<{ gapBps: string; evidence: DeskEvidence[] }>;
      coverage: string;
    };
export type StockDeskResult = {
  schemaVersion: 1;
  address: string;
  symbol: string | null;
  observedAt: string;
  canonical:
    "official_list_match" | "identity_conflict" | "not_on_official_list";
  reference: DeskFact<{ priceUsd: string; multiplierEmbedded: boolean }>;
  feed: DeskFact<{
    updatedAt: string;
    ageSeconds: number;
    heartbeatSeconds: number;
    stale: boolean;
    paused: boolean;
    expectedOffHours: boolean;
    offHoursBasis: string;
  }>;
  multiplier: DeskFact<{
    current: string;
    scheduled: string | null;
    effectiveAt: string | null;
  }>;
  corporateActions: DeskFact<
    Array<{
      id: string;
      type: string;
      status: string;
      processDate: string | null;
      detail: string;
    }>
  >;
  pool: DeskFact<DeskQuote>;
  gapBps: DeskFact<string>;
  depth: Array<{ notionalUsd: string; quote: DeskFact<DeskQuote> }>;
  concentration: DeskFact<{
    top10Percent: number;
    poolPercent: number;
    burnPercent: number;
    holdersAnalyzed: number;
  }>;
  history: GapHistory;
  limitations: string[];
  disclaimer: typeof STOCK_DESK_LINE;
  receipt?: Receipt;
};
export type StockDeskIndex = {
  schemaVersion: 1;
  observedAt: string;
  expiresAt: string;
  coverage: { addresses: string[]; complete: boolean; basis: string };
  /** Tokens that could not be read after one retry; their absence is not a zero gap. */
  unavailable?: Array<{ address: string; reason: string }>;
  entries: Array<{ href: string; desk: StockDeskResult }>;
  gaps: string[];
  multiplierEvents: string[];
  staleFeeds: string[];
  label: "data, not advice";
};
