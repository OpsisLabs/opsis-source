export const OBSERVED_TRADES_CHAIN_ID = 4663 as const;
export const OBSERVED_TRADES_WINDOW_OPTIONS = [500, 1000] as const;
export const OBSERVED_TRADES_FEE_OPTIONS = [100, 500, 3000, 10000] as const;
export const EXPLORER_ORIGIN = "https://robinhoodchain.blockscout.com";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

export type ObservedTradeSide = "buy" | "sell";
export type SenderType = "eoa" | "contract" | "unknown";

/**
 * Maps the observed transaction-sender type onto the shared release 23
 * follow-wallet classification. Only a verified EOA becomes "wallet"; the
 * shared component fails closed for contracts and unknowns.
 */
export function followClassification(
  type: SenderType,
): "wallet" | "contract" | "unknown" {
  if (type === "eoa") return "wallet";
  if (type === "contract") return "contract";
  return "unknown";
}

export function shortAddress(
  address: string | null | undefined,
  lead = 6,
  tail = 4,
): string {
  if (!address) return "";
  if (address.length <= lead + tail + 4) return address;
  return `${address.slice(0, lead + 2)}…${address.slice(-tail)}`;
}

export function explorerTxUrl(hash: string | null | undefined): string | null {
  return hash && HASH.test(hash) ? `${EXPLORER_ORIGIN}/tx/${hash}` : null;
}

export function explorerAddressUrl(
  address: string | null | undefined,
): string | null {
  return address && ADDRESS.test(address)
    ? `${EXPLORER_ORIGIN}/address/${address}`
    : null;
}

export function tradeSideKey(
  side: ObservedTradeSide,
): "trades.side.buy" | "trades.side.sell" {
  return side === "buy" ? "trades.side.buy" : "trades.side.sell";
}

export function senderTypeKey(
  type: SenderType,
):
  | "trades.sender.eoa"
  | "trades.sender.contract"
  | "trades.sender.unknown" {
  if (type === "eoa") return "trades.sender.eoa";
  if (type === "contract") return "trades.sender.contract";
  return "trades.sender.unknown";
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
