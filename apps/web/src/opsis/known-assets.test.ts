import { describe, expect, it } from "vitest";
import { EXIT_CHECK_TOKENS } from "../exit-check/api";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "@rh-chain/shared";
import { KNOWN_ASSETS, resolveKnownAsset } from "./known-assets";

describe("reviewed symbols", () => {
  it("resolves only exact symbols with whitespace and case ignored", () => {
    expect(resolveKnownAsset(" weth ")?.address).toBe(EXIT_CHECK_TOKENS.WETH.address);
    expect(resolveKnownAsset("USDG")?.kind).toBe("token");
    expect(resolveKnownAsset("aapl")?.kind).toBe("stock_token");
    expect(KNOWN_ASSETS.map((asset) => asset.address.toLowerCase()).sort())
      .toEqual(REVIEWED_ROBINHOOD_ASSET_SAMPLE.map((asset) => asset.address.toLowerCase()).sort());
  });
  it("never matches addresses, names, partial symbols or unknown words", () => {
    for (const value of ["", "ETH", "WET", "Wrapped Ether", "WETH/USDG", "unknown", EXIT_CHECK_TOKENS.WETH.address]) {
      expect(resolveKnownAsset(value)).toBeNull();
    }
  });
});
