import { REVIEWED_ASSETS } from "@rh-chain/shared";

export const SWAP_PREVIEW_CHAIN_ID = 4663;
export const SWAP_PREVIEW_FRESHNESS_MS = 30_000;
export const SWAP_PREVIEW_SLIPPAGE_PERCENT = 0.5;

// Canonical Robinhood Chain token contracts:
// https://docs.robinhood.com/chain/contracts/
export const SWAP_PREVIEW_TOKENS = REVIEWED_ASSETS;

// The supported-chains feed identifies this as Universal Router 2.1.1 on 4663.
export const UNISWAP_ROUTER_2_1_1 = "0x8876789976decbfcbbbe364623c63652db8c0904";
// A deterministic, keyless address used only because Uniswap's quote API
// requires a swapper. It has no code, native balance, WETH, or USDG on chain
// 4663 (verified 2026-08-10) and is never shown as the user's sender.
export const PREVIEW_SWAPPER = "0x45F9C7f349aeF15bd852773C4aD3cc0fDcD370e8";

export type SwapPreviewSymbol = keyof typeof SWAP_PREVIEW_TOKENS;
export type SwapPreviewDirection = "WETH_TO_USDG" | "USDG_TO_WETH";

export function tokensForDirection(direction: SwapPreviewDirection) {
  return direction === "WETH_TO_USDG"
    ? { input: SWAP_PREVIEW_TOKENS.WETH, output: SWAP_PREVIEW_TOKENS.USDG }
    : { input: SWAP_PREVIEW_TOKENS.USDG, output: SWAP_PREVIEW_TOKENS.WETH };
}
