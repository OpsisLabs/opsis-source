import { describe, it, expect } from "vitest";
import { activityDays, topicCounts, distribution } from "./research";
import { calls } from "./model";

describe("KOL research views", () => {
  it("uses UTC dates and zero means no captured post, not a fabricated return", () => {
    const items = [
      { ...calls[0], publishedAt: "2026-09-01T23:59:59Z", chainTopic: true },
      { ...calls[0], publishedAt: "2026-09-02T00:00:00Z", chainTopic: false },
    ];
    const days = activityDays(items, "2026-09-11");
    expect(days).toHaveLength(31);
    expect(days[0].date).toBe("2026-08-12");
    expect(days.find((d) => d.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      count: 1,
      chain: 1,
    });
    expect(days.find((d) => d.date === "2026-09-02")).toEqual({
      date: "2026-09-02",
      count: 1,
      chain: 0,
    });
    expect(days.at(-1)?.count).toBe(0);
  });
  it("counts a topic once per post and keeps similar names separate", () => {
    expect(
      topicCounts([
        { ...calls[0], tokens: ["DOG (Bitcoin)", "DOG (Bitcoin)", "DOGE"] },
      ]),
    ).toEqual([
      ["DOG (Bitcoin)", 1],
      ["DOGE", 1],
    ]);
    expect(distribution(calls.filter((c) => c.profile === "adam"))).toEqual({
      count: 0,
      median: null,
      best: null,
      worst: null,
    });
    const one = distribution(
      calls.filter((c) => c.id === "2090108668930830569"),
    );
    expect(one.count).toBe(1);
    expect(one.median).toBeCloseTo(20.025075, 5);
    expect(one.best).toBe(one.worst);
  });
  it("keeps unresolved assets, inverted-chart satire and contradictory forecasts unscored", () => {
    for (const id of [
      "2096297884736004478",
      "2093774937362403386",
      "2093719075856007652",
      "2098055481738588452",
    ]) {
      expect(calls.find((c) => c.id === id)?.scoringDirection).toBe("unscored");
      expect(distribution(calls.filter((c) => c.id === id)).count).toBe(0);
    }
  });
});
