import { describe, expect, it } from "vitest";
import type { ScoutSwapQuote } from "../swap/api";
import { tradeCard } from "./trade-card";

const now = Date.parse("2026-09-10T12:00:10Z");
const quote = {
  input: { symbol: "WETH", amount: "0.01", address: "never-export-input-address" },
  output: { symbol: "USDG", amount: "25.123456789123456789", minimumReceived: "24.123456789123456789" },
  simulation: { status: "passed" }, quotedAt: "2026-09-10T12:00:00Z", expiresAt: "2026-09-10T12:00:30Z",
  estimatedGas: { nativeAmount: "0.000012" }, provider: { requestId: "never-export-provider-id" },
} as ScoutSwapQuote;

describe("Trade Cards", () => {
  it("exports an allowlist, excluding balances and provider identifiers by default", () => {
    const card = tradeCard(quote, "987654.321", "876543.21", "1234.56", false, now);
    expect(card.balances).toEqual([]);
    expect(JSON.stringify(card)).not.toMatch(/987654|876543|1234.56|never-export/);
    expect(card.expected).toBe("25.123456789123456789 USDG");
    expect(card.minimum).toBe("24.123456789123456789 USDG");
    expect(card.quotedAt).toBe("2026-09-10T12:00:00.000Z");
  });
  it("includes exact scenario balances only on explicit opt-in, never allocations or reference prices", () => {
    const card = tradeCard(quote, "1", "100", "1234.56", true, now);
    expect(card.balances).toEqual(["Before: 1 WETH + 100 USDG", "Expected after: 0.99 WETH + 125.123456789123456789 USDG", "Minimum after: 0.99 WETH + 124.123456789123456789 USDG"]);
    expect(JSON.stringify(card)).not.toContain("1234.56");
  });
  it("keeps warnings and unavailable gas explicit", () => {
    const card = tradeCard({ ...quote, simulation: { status: "warning", reasons: [] }, estimatedGas: { ...quote.estimatedGas, nativeAmount: null } }, "1", "100", "2500", false, now);
    expect(card.warning).toBe(true);
    expect(card.gas).toBe("unknown ETH");
  });
  it("rejects expired, failed and unaffordable scenarios", () => {
    expect(() => tradeCard(quote, "1", "100", "2500", false, now + 30000)).toThrow("expired");
    expect(() => tradeCard({ ...quote, simulation: { status: "failed", reasons: [] } }, "1", "100", "2500", false, now)).toThrow("failed");
    expect(() => tradeCard(quote, "0", "100", "2500", false, now)).toThrow("insufficient");
  });
});
