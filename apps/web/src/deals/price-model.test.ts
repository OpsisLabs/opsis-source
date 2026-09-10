import { describe, expect, it } from "vitest";
import type { CardBenchmark } from "@rh-chain/shared";
import { CARD_EXAMPLES, checkedPrices, headlineReferences, metricName, priceText, validCardInput } from "./price-model";
const now = Date.parse("2026-09-10T12:00:00Z");
const input = { provider: "tcgdex", cardId: "base1-4" } as const;
const row = { market: "TCGplayer", variant: "holo", metric: "marketPrice", amount: 55, currency: "USD", updatedAt: null } as const;
const fixture = (): CardBenchmark => ({ ...input, name: "Charizard", sourceUrl: "https://api.tcgdex.net/v2/en/cards/base1-4", fetchedAt: "2026-09-10T10:00:00Z", rows: [{ ...row }] });

describe("card price check", () => {
  it("uses explicit single public identifiers for every example", () => {
    for (const example of CARD_EXAMPLES) expect(validCardInput(example)).toBe(true);
    for (const cardId of ["", "../bad", "https://example.com", "1,2", "with notes"]) expect(validCardInput({ ...input, cardId })).toBe(false);
    expect(validCardInput({ provider: "ygoprodeck", cardId: "123456789" })).toBe(false);
  });
  it("verifies identity and source without requiring fabricated timestamps or prices", () => {
    expect(checkedPrices(input, fixture(), now).rows[0].updatedAt).toBeNull();
    expect(checkedPrices(input, { ...fixture(), rows: [] }, now).rows).toEqual([]);
    for (const change of [{ cardId: "base1-58" }, { provider: "ygoprodeck" }, { sourceUrl: "https://evil.test" }, { fetchedAt: "2099-01-01" }, { name: "" }, { rows: null }]) expect(() => checkedPrices(input, { ...fixture(), ...change }, now)).toThrow();
  });
  it("rejects unusable amounts, unknown currency, oversized payloads and future price time", () => {
    for (const change of [{ amount: 0 }, { amount: -1 }, { amount: Infinity }, { amount: "55" }, { amount: 1e10 }, { currency: "BTC" }, { updatedAt: "2099-01-01" }, { market: "" }]) expect(() => checkedPrices(input, { ...fixture(), rows: [{ ...row, ...change }] }, now)).toThrow();
    expect(() => checkedPrices(input, { ...fixture(), rows: Array(101).fill(row) }, now)).toThrow();
  });
  it("selects a market metric rather than the smallest number and keeps variants/currencies apart", () => {
    const data = fixture(); data.rows = [{ ...row, metric: "lowPrice", amount: 1 }, { ...row }, { ...row, currency: "EUR", amount: 3 }, { ...row, variant: "reverse", amount: 70 }];
    expect(headlineReferences(data, "USD").map(item => item.amount)).toEqual([55, 70]);
    expect(headlineReferences(data, "EUR").map(item => item.amount)).toEqual([3]);
    expect(data.rows).toHaveLength(4);
  });
  it("labels averages as period averages, never invented chart points or sold prices", () => {
    expect(metricName("avg7")).toBe("7-day average");
    expect(metricName("marketPrice")).toBe("Market reference");
    expect(priceText(55.5, "USD")).toBe("USD 55.50");
  });
});
