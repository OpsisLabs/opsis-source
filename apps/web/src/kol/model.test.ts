import { describe, expect, it } from "vitest";
import {
  calls,
  profiles,
  filterCalls,
  outcome,
  receipt,
  tokenCoverage,
} from "./model";

describe("KOL source edition", () => {
  it("retains original author-bound source links and a bounded, unique post set", () => {
    expect(calls).toHaveLength(13);
    expect(new Set(calls.map((c) => c.id)).size).toBe(13);
    for (const call of calls) {
      const profile = profiles.find((p) => p.id === call.profile)!;
      expect(call.url).toBe(profile.url + "/status/" + call.id);
      expect(new URL(call.url).host).toBe("x.com");
      expect(call.date).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });
  it("separates pending targets, conditional forecasts and non-forecast commentary", () => {
    expect(outcome(calls.find((c) => c.id === "2097697759365116405")!)).toBe(
      "Pending",
    );
    expect(outcome(calls.find((c) => c.id === "2090175223530209549")!)).toBe(
      "Conditional",
    );
    expect(outcome(calls.find((c) => c.id === "2092301424424350043")!)).toBe(
      "Unscored",
    );
    expect(outcome(calls.find((c) => c.id === "2093110596522697054")!)).toBe(
      "Unscored",
    );
  });
  it("intersects filters without inventing history or conflating tickers", () => {
    expect(filterCalls(calls, { profile: "ansem", token: "ETH" })).toHaveLength(
      0,
    );
    expect(
      filterCalls(calls, { profile: "ansem", token: "PUMP" }),
    ).toHaveLength(2);
    expect(filterCalls(calls, { query: "@not-covered" })).toHaveLength(0);
    expect(filterCalls(calls, { query: "cryptokaleo" })).toHaveLength(4);
    expect(filterCalls(calls, { saved: [] })).toHaveLength(0);
    expect(tokenCoverage("BTC").profiles).toHaveLength(3);
    expect(tokenCoverage("ANSEM").profiles.map((p) => p.id)).toEqual(["ansem"]);
  });
  it("exports source evidence while leaving uncomputed financial outcomes null", () => {
    for (const call of calls) {
      const exported = receipt(call);
      expect(exported.source).toBe(call.url);
      expect(exported.marketPerformance).toBeNull();
      expect(exported.accuracy).toBeNull();
      expect(exported.coverage).toContain("not comprehensive");
      expect(exported.preparedContext).toBe(call.interpretation);
    }
  });
});
