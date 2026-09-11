import { test } from "vitest";
import assert from "node:assert/strict";
import { eventSeries } from "./analysis.js";
const e = { time: "2026-09-10T12:00:00Z" },
  t = Date.parse(e.time) / 1000;
const make = (prices) => ({
  assets: [
    {
      id: "weth",
      points: prices.map(([offset, price]) => ({
        requestedTime: t + offset * 60,
        time: t + offset * 60 - 1,
        price,
      })),
    },
  ],
});
test("Anchors to the publication sample and computes both endpoint returns", () => {
  const [a] = eventSeries(
    make([
      [-30, 90],
      [0, 100],
      [30, 110],
    ]),
    e,
    30,
  );
  assert.equal(a.after, 10.000000000000009);
  assert.ok(Math.abs(a.before - 11.111111) < 0.00001);
  assert.equal(a.points[1].change, 0);
});
test("Does not replace a missing publication baseline with an earlier or future quote", () => {
  const [a] = eventSeries(
    make([
      [-30, 90],
      [0, null],
      [30, 110],
    ]),
    e,
    30,
  );
  assert.equal(a.baseline, undefined);
  assert.equal(a.after, null);
  assert.ok(a.points.every((p) => p.change === null));
});
test("Missing endpoint stays missing", () => {
  const [a] = eventSeries(
    make([
      [-30, 90],
      [0, 100],
      [25, 110],
      [30, null],
    ]),
    e,
    30,
  );
  assert.equal(a.after, null);
  assert.equal(a.coverage, 3);
  assert.equal(a.expected, 13);
});
test("Excludes observations from adjacent events with different five-minute alignment", () => {
  const [a] = eventSeries(
    make([
      [-30, 90],
      [0, 100],
      [1, 888],
      [30, 110],
    ]),
    e,
    30,
  );
  assert.equal(a.points.length, 3);
});
test("Does not extrapolate a future endpoint when captured window ends early", () => {
  const [a] = eventSeries(
    make([
      [-30, 90],
      [0, 100],
      [25, 110],
    ]),
    e,
    30,
  );
  assert.equal(a.after, null);
});

import news from "./news.json";
import market from "./event-market.json";
test("published evidence retains exact contracts, dated sources and bounded samples", () => {
  assert.equal(market.chainId, 4663);
  assert.equal(news.events.length, 7);
  assert.deepEqual(
    market.assets.map((a) => a.symbol),
    ["WETH", "cbBTC", "PONS"],
  );
  for (const event of news.events) {
    assert.ok(event.time.startsWith("2026-09-10"));
    assert.equal(new URL(event.url).protocol, "https:");
    assert.ok(event.photoCredit && event.photoNote && event.timeBasis);
    for (const minutes of [15, 30, 60]) {
      for (const asset of eventSeries(market, event, minutes)) {
        assert.equal(asset.points.length, (minutes / 5) * 2 + 1);
        if (asset.baseline)
          assert.equal(
            asset.baseline.requestedTime,
            Date.parse(event.time) / 1000,
          );
        else assert.ok(asset.points.every((p) => p.change === null));
        assert.ok(
          asset.points.every(
            (p) => p.change === null || Number.isFinite(p.change),
          ),
        );
      }
    }
  }
  for (const asset of market.assets) {
    assert.match(asset.contract, /^0x[0-9a-f]{40}$/);
    assert.match(asset.pool, /^0x[0-9a-f]{40}$/);
    for (const p of asset.points) {
      assert.ok(p.time <= p.requestedTime && p.requestedTime - p.time <= 3);
      if (p.price !== null) {
        assert.ok(p.price > 0);
        assert.ok(p.ageSeconds <= 120);
        assert.ok(p.swapTime <= p.time);
        assert.match(p.transactionHash, /^0x[0-9a-f]{64}$/);
      }
    }
  }
  assert.ok(
    market.assets
      .find((a) => a.id === "cbbtc")
      .points.some((p) => p.price === null),
  );
});
