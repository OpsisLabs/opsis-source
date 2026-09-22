/** Bounded observations, never a claim of complete contract permissions. */
export type ControlReading =
  | { state: "observed"; value: string }
  | { state: "unknown"; reason: "reverted" | "malformed" };
export type TokenControls = {
  kind: "observed";
  chainId: 4663;
  contract: string;
  hasCode: boolean;
  anchor: {
    blockNumber: number;
    blockHash: string;
    timestamp: string;
    finality: "current_not_final";
  };
  observedAt: string;
  expiresAt: string;
  source: "robinhood-public-rpc";
  methodVersion: "controls-v1";
  readings: Record<
    "owner" | "paused" | "implementation" | "admin" | "beacon",
    ControlReading
  >;
  coverage: {
    state: "partial";
    rpcCalls: number;
    unknown: [
      "mint_permissions",
      "transfer_fees",
      "custom_roles",
      "other_proxy_patterns",
      "holder_concentration",
    ];
  };
};
