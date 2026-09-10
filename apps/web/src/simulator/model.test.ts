import { describe, expect, it } from "vitest";
import type { ScoutSwapQuote } from "../swap/api";
import { scenario, units, decimal } from "./model";
const quote = { input: { symbol: "WETH", amount: "0.01" }, output: { symbol: "USDG", amount: "25", minimumReceived: "24" }, simulation: { status: "passed" }, quotedAt: "2026-09-09T10:00:00Z", expiresAt: "2026-09-09T10:00:30Z" } as ScoutSwapQuote;
const now = Date.parse("2026-09-09T10:00:10Z");
describe("trade scenarios", () => {
  it("keeps smallest units exact", () => expect(decimal(units("0.000000000000000001"))).toBe("0.000000000000000001"));
  it("compares expected and minimum quantities without subtracting ETH gas from WETH", () => {
    const result = scenario(quote, "1", "100", "2500", now);
    expect(result.after.WETH).toBe("0.99"); expect(result.after.USDG).toBe("125"); expect(result.minimum.USDG).toBe("124");
  });
  it("rejects insufficient balance", () => expect(() => scenario(quote, "0", "100", "2500", now)).toThrow("insufficient"));
  it("rejects expired quotes", () => expect(() => scenario(quote, "1", "100", "2500", now + 30000)).toThrow("expired"));
  it("rejects failed simulation", () => expect(() => scenario({ ...quote, simulation: { status: "failed", reasons: [] } }, "1", "100", "2500", now)).toThrow("failed"));
  it.each(["-1", "1e6", "NaN", "0.0000000000000000001"])("rejects invalid input %s", value => expect(() => units(value)).toThrow());
});
