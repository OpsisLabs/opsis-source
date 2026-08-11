import { privateApi } from "../dashboard/http";

export type RwaCheck = {
  id: string;
  label: string;
  status: "confirmed" | "claim" | "warning" | "missing" | "conflict" | "unsupported";
  detail: string;
  sourceIds: string[];
};

export type RwaVerification = {
  kind: "stock_token" | "morpho_vault" | "unsupported_contract";
  address: string;
  headline: string;
  summary: string;
  anchor: { chainId: 4663; blockNumber: number; blockHash: string; capturedAt: string; finality: "current_non_final" };
  checks: RwaCheck[];
  stock?: {
    uid: string; symbol: string; name: string; decimals: number; registryStatus: string;
    currentMultiplier: string; pendingMultiplier: string | null; pendingEffectiveAt: string | null;
    oraclePaused: boolean; tokenPaused: boolean | null; termsUrl: string | null;
    underlyingQuote: null | { bid: string; ask: string; currency: string; generatedAt: string; tradingHalted: boolean; state: "current" | "stale"; ageSeconds: number };
    oracle: null | { feed: string; value: string | null; updatedAt: string | null; heartbeatSeconds: number; state: "current" | "paused" | "stale_or_market_closed" | "invalid" };
    corporateActions: Array<{ id: string; type: string; status: string; processDate: string | null; detail: string }>;
  };
  morpho?: {
    name: string; symbol: string; version: string; listed: boolean | null;
    asset: { address: string; symbol: string; decimals: number };
    owner: string; curator: string; timelockSeconds: number;
    managementFeeWad: string | null; performanceFeeWad: string | null;
    gates: { sendShares: string | null; receiveShares: string | null; sendAssets: string | null; receiveAssets: string | null };
    totalAssetsRaw: string; totalSupplyRaw: string;
    withdrawableAssetsRaw: string | null; allocatedAssetsRaw: string | null; idleAssetsRaw: string | null;
    indexedBlock: number | null; configIndexedBlock: number | null; apyIndexedBlock: number | null;
    indexLagBlocks: number | null; trailing24hApy: string | null;
  };
  limitations: string[];
  sources: Array<{ id: string; provider: string; url: string; fetchedAt: string; description: string }>;
  privacy: { serverStorage: "none"; modelProvider: "none"; providerDestinations: string[]; disclosure: string };
};

export function verifyRwa(address: string, signal?: AbortSignal): Promise<RwaVerification> {
  return privateApi("/v1/private/rwa/verify", { address }, signal);
}
