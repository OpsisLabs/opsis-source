import { EXIT_CHECK_TOKENS } from "../exit-check/api";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "@rh-chain/shared";

export type KnownAsset = { symbol: string; name: string; address: string; kind: "token" | "stock_token" };

export const KNOWN_ASSETS: readonly KnownAsset[] = [
  ...Object.values(EXIT_CHECK_TOKENS).map((asset) => ({ ...asset, kind: "token" as const })),
  ...REVIEWED_ROBINHOOD_ASSET_SAMPLE
    .filter((asset) => !Object.values(EXIT_CHECK_TOKENS).some((token) => token.address.toLowerCase() === asset.address.toLowerCase()))
    .map((asset) => ({ ...asset, kind: "stock_token" as const })),
];

export function resolveKnownAsset(input: string): KnownAsset | null {
  const symbol = input.trim().toUpperCase();
  return KNOWN_ASSETS.find((asset) => asset.symbol === symbol) ?? null;
}
