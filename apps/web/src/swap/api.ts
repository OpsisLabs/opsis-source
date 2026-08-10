import { publicApi } from "../dashboard/http";

export type SwapDirection = "WETH_TO_USDG" | "USDG_TO_WETH";

export type ScoutSwapQuote = {
  pair: "WETH/USDG";
  chain: { id: number; name: string };
  input: { symbol: "WETH" | "USDG"; address: string; amount: string };
  output: {
    symbol: "WETH" | "USDG";
    address: string;
    amount: string;
    minimumReceived: string;
    minimumSource: "provider" | "derived_tolerance";
  };
  route: { routing: string; label: string; protocols: string[] };
  priceImpactPercent: number | null;
  slippageTolerancePercent: number;
  estimatedGas: { nativeAmount: string | null; usdAmount: string | null; paidBy: "user" | "filler_or_user" };
  simulation: { status: "passed" | "warning" | "failed"; reasons: string[] };
  approvalMayBeRequired: boolean;
  transactionPreview: {
    explanationOnly: true;
    unsigned: true;
    chainId: number;
    sender: string | null;
    target: string | null;
    action: string;
    canSign: false;
    canBroadcast: false;
  };
  quotedAt: string;
  expiresAt: string;
  freshForMs: number;
  provider: { name: "Uniswap"; requestId: string; cached: boolean };
  handoffUrl: string;
  disclosures: string[];
};

export const SWAP_TOKENS = {
  WETH: { symbol: "WETH", name: "Wrapped Ether", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", decimals: 18 },
  USDG: { symbol: "USDG", name: "Global Dollar", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 },
} as const;

export async function getScoutSwapQuote(request: {
  direction: SwapDirection;
  amount: string;
}): Promise<ScoutSwapQuote> {
  return publicApi<ScoutSwapQuote>("/v1/swaps/quote", request);
}

export function officialUniswapUrl(direction: SwapDirection, amount: string): string {
  const input = direction === "WETH_TO_USDG" ? SWAP_TOKENS.WETH : SWAP_TOKENS.USDG;
  const output = direction === "WETH_TO_USDG" ? SWAP_TOKENS.USDG : SWAP_TOKENS.WETH;
  const params = new URLSearchParams({
    chain: "robinhood",
    inputCurrency: input.address,
    outputCurrency: output.address,
    field: "input",
    value: amount || "0",
    theme: "dark",
  });
  return `https://app.uniswap.org/swap?${params.toString()}`;
}
