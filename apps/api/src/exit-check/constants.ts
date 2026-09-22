import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";

export const EXIT_CHECK_CHAIN_ID = 4663;
export const EXIT_CHECK_FRESHNESS_MS = 30_000;

// Official Uniswap deployment on Robinhood Chain (4663). Verified from the
// Uniswap SDK `ROBINHOOD_ADDRESSES` map and live eth_getCode checks:
// https://github.com/Uniswap/sdks (sdk-core/src/addresses.ts)
export const UNISWAP_V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
export const UNISWAP_QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
export const UNISWAP_MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// The four standard Uniswap V3 fee tiers. Only factory-verified pools are
// queried; no user-supplied RPC, router, or pool address is accepted.
export const EXIT_CHECK_FEE_TIERS = [100, 500, 3000, 10_000] as const;

export const EXIT_CHECK_OUTPUTS = CHAINSCOUT_REVIEWED_ASSETS;
export type ExitCheckOutputSymbol = keyof typeof EXIT_CHECK_OUTPUTS;
export const EXIT_CHECK_OUTPUT_SYMBOLS = ["WETH", "USDG"] as const satisfies readonly ExitCheckOutputSymbol[];

export const EXIT_CHECK_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const EXIT_CHECK_DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

// QuoterV2 is single-pool. ChainScout does not aggregate across venues and
// does not claim a route beyond the best successful factory pool it actually
// tested at the captured block.
export const EXIT_CHECK_LIMITATIONS = [
  "This is a read-only single-pool estimate from the official Uniswap V3 factory and QuoterV2 on Robinhood Chain, captured at one block.",
  "It is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold. Token transfer restrictions, paused contracts, allowlists, taxes, and hooks are not checked.",
  "Only standard Uniswap V3 fee-tier pools created by the official factory are tested. Uniswap v4 and other venues are not included.",
  "Pleiades and other non-admitted venues are excluded from this estimate.",
  "Price impact is the exact BigInt gap between the quote and the same-block pre-fee spot price, so it already includes the pool fee; it is not slippage.",
  "The fee amount shown is a floor estimate of the input-side pool fee and can differ from the exact charge because V3 rounding and the actual tick path are not reproduced.",
  "Only a QuoterV2 result that did not end at a price-boundary is shown. A boundary result can indicate a partial fill, so full execution is never proven.",
  "Active V3 liquidity (L) is a raw pool parameter, not the dollar amount you can sell without moving the price.",
  "Network gas is paid separately and is not included in this estimate.",
  "ChainScout does not sign, approve, submit, or broadcast anything. The official Uniswap app independently requotes and owns execution."
] as const;
