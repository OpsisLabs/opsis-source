import type { Receipt } from "./receipts.js";

export type SupplyFraction = { numerator: string; denominator: string };
export type FundingLink = {
  from: string;
  to: string;
  kind:
    "first_funding" | "same_signer_multi_buy" | "shared_hub" | "same_second";
  transactionHashes: string[];
  via?: string;
};
export type LinkedHolder = {
  wallet: string;
  balanceRaw: string | null;
  share: SupplyFraction | null;
  funding:
    | "checked"
    | "not checked (cap)"
    | "not checked (beyond top N)"
    | "not checked (known hub)"
    | "unavailable";
};
export type LinkedGroup = {
  id: string;
  members: string[];
  share: SupplyFraction | null;
  links: FundingLink[];
  status: "linked by funding" | "single wallet" | "large group, review needed";
};
export type LinkedWalletGraph = {
  schemaVersion: 1;
  chainId: 4663;
  token: string;
  state: "finished" | "partial";
  servedFrom: "fresh" | "cache";
  observedAt: string;
  expiresAt: string;
  anchor: { blockNumber: number; blockHash: string; timestamp: string };
  methodVersion: string;
  registryVersion: string;
  holders: LinkedHolder[];
  excluded: Array<LinkedHolder & { reason: "pool" | "burn" | "token" }>;
  groups: LinkedGroup[];
  weakLinks: FundingLink[];
  cappedLinks: FundingLink[];
  hubs: Array<{
    wallet: string;
    reason: "registry" | "contract" | "fan_out";
    fanOut: number;
  }>;
  notChecked: Array<{ wallet: string; reason: string }>;
  totals: {
    largestGroup: SupplyFraction | null;
    largestSingleWallet: SupplyFraction | null;
  };
  coverage: {
    explorerCalls: number;
    explorerCreditsReserved: number;
    rpcCalls: number;
    holderSelection: "explorer latest, not block-pinned";
    holderListComplete: boolean;
    launchFacts: "checked" | "partial" | "not checked (cap)" | "unavailable";
    reasons: string[];
  };
  limits: string;
  receipt?: Receipt;
};
