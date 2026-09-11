import { describe, expect, it } from "vitest";
import { calls } from "./model";
import {
  callPerformance,
  observationFor,
  paperPnl,
  profilePerformance,
  validateObservation,
  scoringSummary,
  matchesScoringFilter,
  assetReturnCurve,
  scoringLegs,
} from "./performance";

const find = (id: string) => calls.find((c) => c.id === id)!;
describe("source-backed seven-day paper call performance", () => {
  it("keeps source coverage separate from eligible, pending and scored calls", () => {
    const totals = scoringSummary(calls);
    expect(totals).toEqual({
      tracked: 204,
      eligible: 56,
      scored: 35,
      pending: 21,
      excluded: 148,
      unavailable: 0,
    });
    expect(totals.eligible).toBe(
      totals.scored + totals.pending + totals.unavailable,
    );
    for (const filter of [
      "eligible",
      "scored",
      "pending",
      "unavailable",
    ] as const) {
      expect(
        calls.filter((call) => matchesScoringFilter(call, filter)),
      ).toHaveLength(totals[filter]);
    }
    const chainPosts = calls.filter((call) => call.chainTopic);
    const chain = scoringSummary(chainPosts);
    expect(chain.tracked).toBe(69);
    expect(chain.eligible).toBeLessThan(chain.tracked);
    expect(
      chain.scored + chain.pending + chain.unavailable + chain.excluded,
    ).toBe(chain.tracked);
    expect(scoringSummary([])).toEqual({
      tracked: 0,
      eligible: 0,
      scored: 0,
      pending: 0,
      excluded: 0,
      unavailable: 0,
    });
  });
  it("keeps missing price evidence separate from a waiting window or a zero return", () => {
    const missing = { ...find("2077005971411575286"), id: "not-captured" };
    expect(scoringSummary([missing])).toEqual({
      tracked: 1,
      eligible: 1,
      scored: 0,
      pending: 0,
      excluded: 0,
      unavailable: 1,
    });
    expect(matchesScoringFilter(missing, "unscored")).toBe(true);
    expect(matchesScoringFilter(missing, "pending")).toBe(false);
    expect(callPerformance(missing).percent).toBeNull();
    expect(
      scoringSummary([{ ...missing, scoringDirection: "unscored" }]).excluded,
    ).toBe(1);
  });
  it("recomputes returns from observed prices rather than the author's claimed fill", () => {
    const c = find("2077005971411575286");
    const result = callPerformance(c);
    expect(result.observation.assets[0].prices[0].price).toBe(
      1856.3438678612558,
    );
    expect(result.observation.assets[0].prices[0].price).not.toBe(1766);
    expect(result.percent).toBeCloseTo(4.5618622938, 8);
    expect(paperPnl(result.percent!, 1000)).toBeCloseTo(45.618622938, 7);
    expect(paperPnl(result.percent!, 10000)).toBeCloseTo(456.18622938, 6);
  });
  it("weights assets within a call, then calls within a profile equally", () => {
    const ansem = callPerformance(find("2090108668930830569"));
    expect(ansem.observation.assets.map((a) => a.symbol)).toEqual([
      "BTC",
      "HYPE",
      "SOL",
    ]);
    expect(ansem.percent).toBeCloseTo(20.02507500348, 8);
    const pair = calls.filter((c) =>
      ["2094506021737627739", "2090108668930830569"].includes(c.id),
    );
    const stats = profilePerformance("ansem", pair);
    expect(stats.complete).toHaveLength(2);
    expect(stats.percent).toBeCloseTo(
      (callPerformance(pair[0]).percent! + ansem.percent!) / 2,
      9,
    );
    expect(stats.curve?.[0]).toBe(0);
    expect(stats.curve?.[7]).toBe(stats.percent);
  });
  it("does not turn pending, conditional or incomplete multi-token sources into losses or wins", () => {
    expect(callPerformance(find("2097697759365116405")).percent).toBeNull();
    expect(observationFor(find("2097697759365116405")).status).toBe("pending");
    expect(observationFor(find("2090175223530209549")).status).toBe("excluded");
    expect(observationFor(find("2093361315876102605")).reason).toContain(
      "ANSEM",
    );
    expect(callPerformance(find("2093361315876102605")).percent).toBeNull();
    expect(profilePerformance("kaleo").pending).toBe(9);
    expect(profilePerformance("ansem").complete).toHaveLength(7);
    expect(profilePerformance("pentoshi").complete).toHaveLength(2);
    expect(profilePerformance("missing").percent).toBeNull();
  });
  it("does not score an unverified short, rumor or conflicting token identity", () => {
    for (const id of [
      "2075511840483017194",
      "2097775925492433022",
      "2095670712551780813",
    ]) {
      expect(observationFor(find(id)).status).toBe("excluded");
      expect(callPerformance(find(id)).percent).toBeNull();
    }
    expect(profilePerformance("adam").percent).toBeNull();
    expect(profilePerformance("ansem", []).percent).toBeNull();
    expect(
      profilePerformance("ansem", [find("2090108668930830569")]).percent,
    ).toBeCloseTo(20.025075, 5);
    const c = find("2077005971411575286");
    expect(
      validateObservation(observationFor(c), {
        ...c,
        scoringDirection: "unscored",
      }),
    ).toBe(false);
  });
  it("fails closed on future, shifted, duplicate, stale or invalid prices and token mismatches", () => {
    const c = find("2077005971411575286"),
      valid = observationFor(c);
    expect(validateObservation(valid, c)).toBe(true);
    const mutated = (change: (r: typeof valid) => void) => {
      const r = structuredClone(valid);
      change(r);
      expect(validateObservation(r, c)).toBe(false);
    };
    mutated((r) => {
      r.assets[0].prices[0].price = 0;
    });
    mutated((r) => {
      r.assets[0].prices[0].price = NaN;
    });
    mutated((r) => {
      r.assets[0].prices[3].timestamp = r.entryAt! + 3 * 86400 + 601;
    });
    mutated((r) => {
      r.assets[0].prices[3].timestamp = r.assets[0].prices[2].timestamp;
    });
    mutated((r) => {
      r.assets[0].prices.pop();
    });
    mutated((r) => {
      r.assets[0].symbol = "FAKE";
    });
    mutated((r) => {
      r.assets[0].id = "coingecko:wrong-token";
    });
    mutated((r) => {
      r.assets[0].confidence = 0.5;
    });
    mutated((r) => {
      r.entryAt! -= 3600;
    });
    mutated((r) => {
      r.endAt! += 604800;
    });
    mutated((r) => {
      r.assets.push(structuredClone(r.assets[0]));
    });
    expect(validateObservation(valid, find("2097697759365116405"))).toBe(false);
  });
  it("scores bearish and mixed views by each reviewed direction, never by a reciprocal short price", () => {
    const call = find("2061772822565834859");
    const result = callPerformance(call);
    expect(result.observation.status).toBe("complete");
    expect(scoringLegs(call)).toEqual([
      { symbol: "BTC", direction: "short" },
      { symbol: "HYPE", direction: "long" },
    ]);
    const [btc, hype] = result.observation.assets;
    const expected =
      (1 -
        btc.prices[7].price / btc.prices[0].price +
        (hype.prices[7].price / hype.prices[0].price - 1)) *
      50;
    expect(result.percent).toBeCloseTo(expected, 10);
    expect(
      assetReturnCurve({
        ...btc,
        prices: [
          { timestamp: 1, price: 100 },
          { timestamp: 2, price: 80 },
        ],
      })[1],
    ).toBeCloseTo(20, 10);
    const wrongDirection = structuredClone(result.observation);
    wrongDirection.assets[0].direction = "long";
    expect(validateObservation(wrongDirection, call)).toBe(false);
    expect(
      scoringLegs({
        ...call,
        scoringLegs: [{ symbol: "NOT-IN-POST", direction: "long" }],
      }),
    ).toEqual([]);
    expect(
      scoringLegs({
        ...call,
        scoringLegs: [
          { symbol: "BTC", direction: "short" },
          { symbol: "BTC", direction: "long" },
        ],
      }),
    ).toEqual([]);
  });
  it("uses verified Robinhood token identities, retains real sample times and rejects prepublication prices", () => {
    const call = find("2090205325013991448");
    const observation = observationFor(call);
    expect(observation.status).toBe("complete");
    expect(observation.assets[0].id).toBe("coingecko:pons");
    expect(
      Math.abs(
        observation.assets[0].prices[0].timestamp - observation.entryAt!,
      ),
    ).toBeGreaterThan(120);
    expect(callPerformance(call).percent).toBeCloseTo(246.5076969, 6);
    const boundary = find("2078283614362419394");
    const valid = observationFor(boundary);
    expect(valid.entryAt).toBe(Date.parse(boundary.publishedAt) / 1000 + 3600);
    expect(validateObservation(valid, boundary)).toBe(true);
    const invalid = structuredClone(valid);
    invalid.assets[0].prices[0].timestamp =
      Date.parse(boundary.publishedAt) / 1000 - 1;
    expect(validateObservation(invalid, boundary)).toBe(false);
    const robinhoodAssets = calls.filter((item) =>
      scoringLegs(item).some((leg) =>
        ["PONS", "NET", "STONKBROKER"].includes(leg.symbol),
      ),
    );
    expect(scoringSummary(robinhoodAssets).scored).toBe(7);
  });
});
