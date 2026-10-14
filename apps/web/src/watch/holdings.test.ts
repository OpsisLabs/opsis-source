import { describe, expect, it } from "vitest";
import { KNOWN_ASSETS } from "../opsis/known-assets";
import { watchFixture } from "./fixture";
import { orderTokens, tokenFlags, tokenLabel } from "./holdings";

const base = watchFixture().tokens[0];
const c = (en: string) => en;
describe("Watch token identity", () => {
  it("orders reviewed, flagged and ordinary tokens stably without mutating the snapshot", () => {
    const ordinary = { ...base, symbol: "OTHER" };
    const scam = { ...base, reputation: "scam" };
    const lookalike = { ...base, symbol: "NVDA" };
    const hidden = { ...base, name: "Sample\u200btoken" };
    const wellKnown = { ...base, symbol: "USDC" };
    const reviewed = { ...base, contract: KNOWN_ASSETS[0].address.toUpperCase() };
    const ordinary2 = { ...base, symbol: "OTHER2" };
    const tokens = [ordinary, scam, reviewed, lookalike, hidden, wellKnown, ordinary2];
    expect(orderTokens(tokens)).toEqual([reviewed, scam, lookalike, hidden, wellKnown, ordinary, ordinary2]);
    expect(tokens[0]).toBe(ordinary);
    expect(orderTokens([])).toEqual([]);
  });

  it("flags source identity, hidden names and symbols and only Blockscout's scam reputation", () => {
    expect(tokenFlags({ ...base, symbol: "N\u200bVDA" })).toMatchObject({ hidden: true, lookalike: { symbol: "NVDA" }, scam: false });
    expect(tokenFlags({ ...base, symbol: "USDC" }).wellKnown).toBe("USDC");
    expect(tokenFlags({ ...base, name: "Name\u202e" }).hidden).toBe(true);
    expect(tokenFlags({ ...base, reputation: "scam" }).scam).toBe(true);
    expect(tokenFlags({ ...base, reputation: "unknown" }).scam).toBe(false);
    expect(tokenFlags(base)).toMatchObject({ reviewed: undefined, lookalike: undefined, wellKnown: undefined, hidden: false, scam: false });
    const reviewed = { ...base, contract: KNOWN_ASSETS.find((asset) => asset.symbol === "NVDA")!.address, symbol: "NVDA" };
    expect(tokenFlags(reviewed).lookalike).toBeUndefined();
    expect(tokenLabel(reviewed, c)).not.toContain("Lookalike");
  });

  it("makes names and symbols visible in saved lists and labels with localized lookalike tags", () => {
    const token = { ...base, name: "Reported\u202ename", symbol: "N\u200bVDA" };
    expect(tokenLabel(token, c)).toBe("Reported[U+202E]name · N[U+200B]VDA · Lookalike");
    expect(tokenLabel(token, (_en, zh) => zh)).toContain("同符号不同合约");
    expect(tokenLabel(base, c)).toBe("Test token · TEST");
  });
});
