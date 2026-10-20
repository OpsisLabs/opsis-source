import { REVIEWED_ASSETS } from "@rh-chain/shared";
import {
  registry,
  related,
  registryVersion as launchVersion,
} from "../launches/registry.js";
import { UNISWAP_ROUTER_2_1_1 } from "../swap/constants.js";

export const hubRegistryVersion = "funding-hubs/1";
export const hubRegistry = [
  ...Object.values(registry).map((row) => ({
    address: row.address,
    label: row.label,
    source: `${launchVersion}: ${row.source}`,
  })),
  ...Object.entries(related).map(([label, address]) => ({
    address,
    label,
    source: `${launchVersion}: related contracts, supplied review; confirmation pending activation`,
  })),
  {
    address: UNISWAP_ROUTER_2_1_1,
    label: "Uniswap Universal Router 2.1.1",
    source: "Existing swap/constants.ts; supported-chains feed for chain 4663",
  },
  {
    address: "0xe592427a0aece92de3edee1f18e0157c05861564",
    label: "Uniswap v3 SwapRouter reference",
    source:
      "Uniswap v3-periphery deployment reference: https://github.com/Uniswap/v3-periphery/blob/main/deploys.md; exclusion only, chain-4663 deployment not asserted",
  },
  {
    address: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    label: "Uniswap SwapRouter02 reference",
    source:
      "Uniswap swap-router-contracts deployment reference: https://github.com/Uniswap/swap-router-contracts; exclusion only, chain-4663 deployment not asserted",
  },
  {
    address: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    label: "Permit2",
    source:
      "Uniswap canonical Permit2 deployment: https://github.com/Uniswap/permit2; chain deployment re-review required",
  },
  {
    address: REVIEWED_ASSETS.WETH.address.toLowerCase(),
    label: "WETH",
    source: "Existing shared REVIEWED_ASSETS, chain 4663",
  },
] as const;
export const reviewedHubs = new Set(
  hubRegistry.map((row) => row.address.toLowerCase()),
);
export const methodVersion = "linked-by-funding/2";
export const limits =
  "Linked wallets are inferences from funding. Linked wallets may belong to different people, and one actor can avoid links. Hubs are excluded. Not investment advice.";
export const linkRules = {
  first_funding:
    "first_funding (v2): the first positive inbound native ETH in the oldest 10 transactions, falling back to the oldest 10 internal transfers only if needed; if both native pages are exhausted without funding, the earliest positive launched-token Transfer in bounded oldest-first RPC windows; the funder must have empty code at the anchor and must not be a hub. Later inbound transfers do not link wallets.",
  same_signer_multi_buy:
    "same_signer_multi_buy (v1): link the signer and recipients of a release-48 launch-window same-tx multi-buy, subject to hub exclusions. Receiving a transfer alone does not create a launch tag.",
  weak: "weak links (v1): shared hub funding and buys in the same second are shown, never merged.",
  hubs: "hubs (v1): reviewed registry addresses, any address with nonempty code at the anchor, and funders with fan-out above 50 distinct recipients in the data read never merge groups.",
  grouping:
    "grouping (v1): recompute union-find from strong links only for each token; an attempted union above 50 wallets freezes the affected groups as large group, review needed and is not merged further.",
} as const;
