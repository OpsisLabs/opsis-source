import { describe, expect, it } from "vitest";
import { explorerCount, explorerNumber, hasHiddenCharacters, holderShares, isBurnAddress, latestTimestamp, lookalikeAsset, relativeTime, reviewedAsset, sharePercent, transactionDirection, transactionMethod, visibleTokenText, wellKnownUnreviewedSymbol } from "./explorer-facts";
import { KNOWN_ASSETS } from "./known-assets";
import pons from "./fixtures/research-pons-token.json";

const address = `0x${"1".repeat(40)}`;
describe("explorer facts", () => {
  it("parses counts without coercing missing, malformed or imprecise values to zero", () => {
    expect(explorerCount("18")).toBe(18);
    expect(explorerCount(584668)).toBe(584668);
    expect(explorerCount("0")).toBe(0);
    for (const value of [null, undefined, "", " ", true, "0x12", "1e3", "18px", -1, Infinity, NaN, "9007199254740993", "1.1"]) expect(explorerCount(value)).toBeNull();
    expect(explorerNumber("32.45")).toBe(32.45);
    expect(sharePercent("32.45")).toBe("32.5%");
    expect(sharePercent(0)).toBe("0.0%");
    expect(sharePercent(101)).toBeNull();
  });

  it("recognizes burns case-insensitively and corrects older concentration fields", () => {
    expect(isBurnAddress("0x000000000000000000000000000000000000dEaD")).toBe(true);
    expect(isBurnAddress(`0x${"0".repeat(40)}`)).toBe(true);
    expect(isBurnAddress(address)).toBe(false);
    const shares = holderShares(pons.entity.facts);
    expect(sharePercent(shares.largest)).toBe("5.4%");
    expect(sharePercent(shares.burned)).toBe("32.5%");
    expect(shares.ten).toBeNull();
    expect(holderShares({ burnedShare: 32.5, top1WalletShare: 5.4, top10WalletShare: 21.2 })).toEqual({ largest: 5.4, ten: 21.2, burned: 32.5 });
    expect(holderShares({}).burned).toBeNull();
  });

  it("detects lookalikes by symbol and reviewed identity by address", () => {
    const usdc = KNOWN_ASSETS.find((asset) => asset.symbol === "USDG")!;
    expect(reviewedAsset(usdc.address.toUpperCase())).toEqual(usdc);
    expect(lookalikeAsset("us\u200bDg", address)).toEqual(usdc);
    expect(lookalikeAsset("USDG", usdc.address)).toBeUndefined();
    expect(lookalikeAsset("NVDA", address)?.symbol).toBe("NVDA");
    expect(lookalikeAsset("NVDA", usdc.address)?.symbol).toBe("NVDA");
    expect(lookalikeAsset("USDC", address)).toBeUndefined();
    expect(lookalikeAsset("OTHER", address)).toBeUndefined();
  });

  it("names well-known symbols that are not reviewed on this chain", () => {
    expect(wellKnownUnreviewedSymbol("usdc", address)).toBe("USDC");
    expect(wellKnownUnreviewedSymbol("US\u200BDT", address)).toBe("USDT");
    expect(wellKnownUnreviewedSymbol("PAID", address)).toBeUndefined();
    expect(wellKnownUnreviewedSymbol("WETH", address)).toBeUndefined();
    expect(wellKnownUnreviewedSymbol("USDC", KNOWN_ASSETS[0]!.address)).toBeUndefined();
  });

  it("makes Unicode format characters visible, including direction controls", () => {
    expect(hasHiddenCharacters("PO\u200bNS")).toBe(true);
    expect(visibleTokenText("PO\u200bNS\u202e\u2066\ufeff")).toBe("PO[U+200B]NS[U+202E][U+2066][U+FEFF]");
    expect(hasHiddenCharacters("普通代币")).toBe(false);
    expect(hasHiddenCharacters(null)).toBe(false);
    expect(visibleTokenText("WETH")).toBe("WETH");
  });

  it("returns relative and exact times and finds the latest valid timestamp", () => {
    const timestamp = "2026-10-14T15:00:00.000000Z";
    const now = Date.parse(timestamp);
    expect(relativeTime(timestamp, now + 1000)?.en).toBe("just now");
    expect(relativeTime(timestamp, now + 60000)?.en).toBe("1 minute ago");
    expect(relativeTime(timestamp, now + 120000)?.zh).toBe("2 分钟前");
    expect(relativeTime(timestamp, now + 3600000)?.en).toBe("1 hour ago");
    expect(relativeTime(timestamp, now + 86400000)?.zh).toBe("1 天前");
    expect(relativeTime(timestamp, now - 1000)?.en).toBe("just now");
    expect(relativeTime(timestamp, now)?.exact).toBe("2026-10-14T15:00:00.000Z");
    expect(relativeTime("invalid", now)).toBeNull();
    expect(relativeTime(null, now)).toBeNull();
    expect(latestTimestamp([{ timestamp: "bad" }, { timestamp }, { timestamp: "2026-10-14T16:00:00Z" }])).toBe("2026-10-14T16:00:00Z");
  });

  it("derives wallet direction and methods without exposing failure details", () => {
    const other = `0x${"2".repeat(40)}`;
    expect(transactionDirection(address, other, address.toUpperCase())).toBe("sent");
    expect(transactionDirection(other, address, address)).toBe("received");
    expect(transactionDirection(address, address, address)).toBe("self");
    expect(transactionDirection(other, null, address)).toBe("unknown");
    expect(transactionMethod({ decodedInput: { method_call: "approve(address spender)" }, method: "0x095ea7b3" })).toEqual({ kind: "decoded", text: "approve" });
    expect(transactionMethod({ method: "0xb2460c48" })).toEqual({ kind: "contract", text: "0xb2460c48" });
    expect(transactionMethod({ method: "server-only detail" })).toEqual({ kind: "contract", text: undefined });
    expect(transactionMethod({ method: "0x" })).toEqual({ kind: "transfer" });
    expect(transactionMethod({ decodedInput: null })).toEqual({ kind: "transfer" });
  });
});
