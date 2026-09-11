import { describe, expect, it } from "vitest";
import { calls } from "./model";
import { callPerformance } from "./performance";
import {
  contextReturn,
  priceContext,
  reactionEdition,
  type Reaction,
} from "./reactions";

const find = (id: string) => calls.find((call) => call.id === id)!;
describe("neutral token price context", () => {
  it("covers every tracked source without inventing prices for unidentified tokens, open windows or no-token posts", () => {
    expect(reactionEdition.records).toHaveLength(calls.length);
    expect(
      new Set(reactionEdition.records.map((record) => record.callId)).size,
    ).toBe(calls.length);
    const contexts = calls.map((call) => priceContext(call));
    expect(contexts.filter((context) => context.assets.length)).toHaveLength(
      91,
    );
    expect(
      contexts.filter((context) => context.status === "pending"),
    ).toHaveLength(35);
    expect(
      contexts.filter((context) => context.status === "no-asset"),
    ).toHaveLength(65);
    for (const context of contexts.filter(
      (context) => context.status !== "complete",
    ))
      expect(context.assets).toEqual([]);
    expect(priceContext({ ...calls[0], id: "not-captured" }).status).toBe(
      "unavailable",
    );
  });
  it("shows neutral market movement separately from a directional paper score", () => {
    const call = find("2061772822565834859");
    const context = priceContext(call);
    const btc = context.assets.find((asset) => asset.symbol === "BTC")!;
    const score = callPerformance(call).observation.assets.find(
      (asset) => asset.symbol === "BTC",
    )!;
    expect(contextReturn(btc)).toBeCloseTo(
      (score.prices[7].price / score.prices[0].price - 1) * 100,
      10,
    );
    expect(contextReturn({ ...btc, direction: "short" })).toBe(
      contextReturn(btc),
    );
    const neutral = calls.find(
      (item) =>
        item.scoringDirection === "unscored" &&
        priceContext(item).assets.length,
    )!;
    expect(priceContext(neutral).assets.length).toBeGreaterThan(0);
    expect(callPerformance(neutral).percent).toBeNull();
  });
  it("rejects wrong source, duplicate identities, wrong period, stale prices and future observations", () => {
    const call = find("2077005971411575286");
    const record = reactionEdition.records.find(
      (item) => item.callId === call.id,
    )!;
    const invalid = (mutate: (record: Reaction) => void) => {
      const copy: Reaction = structuredClone(record);
      mutate(copy);
      expect(priceContext(call, copy).assets).toEqual([]);
      expect(priceContext(call, copy).status).toBe("unavailable");
    };
    invalid((copy) => {
      copy.callId = "another-source";
    });
    invalid((copy) => {
      copy.assets.push(structuredClone(copy.assets[0]));
    });
    invalid((copy) => {
      copy.endAt++;
    });
    invalid((copy) => {
      copy.assets[0].id = "coingecko:wrong-token";
    });
    invalid((copy) => {
      copy.assets[0].prices[3].timestamp = copy.entryAt + 3 * 86400 + 601;
    });
    invalid((copy) => {
      copy.assets[0].prices[0].timestamp =
        Date.parse(call.publishedAt) / 1000 - 1;
    });
    invalid((copy) => {
      copy.assets[0].prices[7].timestamp =
        Date.parse(reactionEdition.asOf) / 1000 + 1;
    });
    invalid((copy) => {
      copy.assets[0].prices[1].price = 0;
    });
  });
  it("keeps independently verified legs with explicit missing-token coverage", () => {
    const call = find("2093361315876102605");
    const context = priceContext(call);
    expect(context.assets.length).toBeGreaterThan(0);
    expect(context.missing).toContain("ANSEM");
    expect(callPerformance(call).percent).toBeNull();
  });
});
