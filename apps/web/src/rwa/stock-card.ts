import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "@rh-chain/shared";

export function stockCardPath(address: string, locale: string): string | null {
  const asset = REVIEWED_ROBINHOOD_ASSET_SAMPLE.find(
    (entry) =>
      entry.address.toLowerCase() === address.toLowerCase() &&
      entry.symbol !== "USDG" &&
      entry.symbol !== "WETH",
  );
  return asset
    ? `/v1/public/open-data/v1/cards/stock/${asset.symbol}.svg${locale === "zh-CN" ? "?lang=zh-CN" : ""}`
    : null;
}
