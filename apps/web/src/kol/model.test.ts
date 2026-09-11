import { describe, expect, it } from "vitest";
import {
  calls,
  profiles,
  filterCalls,
  outcome,
  receipt,
  tokenCoverage,
  windowCalls,
  chainCount,
} from "./model";

describe("KOL source edition", () => {
  it("retains original author-bound source links and a bounded, unique post set", () => {
    expect(calls).toHaveLength(204);
    expect(new Set(calls.map((c) => c.id)).size).toBe(204);
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
      1,
    );
    expect(
      filterCalls(calls, { profile: "ansem", token: "PUMP" }),
    ).toHaveLength(2);
    expect(filterCalls(calls, { query: "@not-covered" })).toHaveLength(0);
    expect(filterCalls(calls, { query: "cryptokaleo" })).toHaveLength(25);
    expect(filterCalls(calls, { saved: [] })).toHaveLength(0);
    expect(tokenCoverage("BTC").profiles.length).toBeGreaterThanOrEqual(3);
    expect(tokenCoverage("ANSEM").profiles.map((p) => p.id)).toEqual(["ansem"]);
  });
  it("covers fifteen real profiles over at least a month without claiming daily completeness", () => {
    expect(profiles).toHaveLength(15);
    for (const p of profiles) {
      const history = filterCalls(calls, { profile: p.id });
      expect(p.spanDays).toBeGreaterThanOrEqual(31);
      expect(p.postCount).toBe(history.length);
      expect(p.chainPostCount).toBe(chainCount(p.id));
      expect(p.firstPostAt).toBe(history.at(-1)!.publishedAt);
      expect(p.lastPostAt).toBe(history[0].publishedAt);
      for (const c of history) {
        const snowflakeDate = Number((BigInt(c.id) >> 22n) + 1288834974657n);
        expect(
          Math.abs(snowflakeDate - Date.parse(c.publishedAt)),
        ).toBeLessThan(1000);
      }
    }
  });
  it("intersects date and chain coverage and does not relabel generic Bitcoin calls", () => {
    const month = windowCalls(calls, "31");
    expect(month.length).toBeLessThan(calls.length);
    expect(
      month.every((c) => c.date >= "2026-08-12" && c.date <= "2026-09-11"),
    ).toBe(true);
    expect(windowCalls(calls, "all", true)).toHaveLength(69);
    expect(chainCount("kaleo")).toBe(3);
    expect(chainCount("adam")).toBe(10);
    expect(windowCalls(calls, "31", true).every((c) => c.chainTopic)).toBe(
      true,
    );
    expect(
      windowCalls(
        [{ ...calls[0], publishedAt: "2026-09-12T00:00:00Z" }],
        "all",
      ),
    ).toEqual([]);
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
