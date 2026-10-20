import { describe, expect, it } from "vitest";
import {
  nearestObservation,
  observationTimes,
  segments,
  valueDomain,
  areaPath,
  axisScale,
  captureSummary,
  calloutLines,
  type MarketPoint,
} from "./workspace-chart";

describe("captured market chart geometry", () => {
  it("bounds mixed-language callouts to two lines without losing the full source title", () => {
    const title = "采集的合成事件 Synthetic report title for chart layout";
    const lines = calloutLines(title, 100);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/…$/);
    expect(lines.every((line) => line.length <= 18)).toBe(true);
    expect(calloutLines("Short report", 170)).toEqual(["Short report"]);
    expect(
      calloutLines("Synthetic report title ahead of publication", 170),
    ).toEqual(["Synthetic report title ahead", "of publication"]);
    expect(title).toContain("for chart layout");
  });
  it("builds separate soft fills that stop at gaps and never extend a singleton", () => {
    const points = [
      { time: 1, value: 2 },
      { time: 2, value: 3 },
      { time: 3, value: null },
      { time: 4, value: 5 },
    ];
    const fills = segments(points, 1).map((part) =>
      areaPath(
        part,
        (n) => n * 10,
        (n) => 100 - n,
        100,
      ),
    );
    expect(fills).toEqual(["M10,100 L10,98 L20,97 L20,100 Z", ""]);
    expect(points[2].value).toBeNull();
  });
  it("rounds only axis ticks, including flat, empty and negative return domains", () => {
    const series = [
      {
        id: "synthetic",
        label: "Synthetic",
        points: [
          { time: 0, value: 2434.52 },
          { time: 1, value: 2629.32 },
        ],
      },
    ];
    expect(axisScale(series)).toEqual({
      min: 2400,
      max: 2700,
      ticks: [2400, 2450, 2500, 2550, 2600, 2650, 2700],
    });
    const returns = axisScale(
      [
        {
          id: "synthetic",
          label: "Synthetic",
          points: [
            { time: 0, value: -0.13 },
            { time: 1, value: 0.07 },
          ],
        },
      ],
      true,
    );
    expect(returns.min).toBe(-returns.max);
    expect(returns.ticks).toContain(0);
    expect(axisScale([]).ticks.every(Number.isFinite)).toBe(true);
    expect(series[0].points[0].value).toBe(2434.52);
  });
  it("computes facts from accepted observations, keeping missing and zero volume distinct", () => {
    expect(
      captureSummary([
        { time: 0, value: 100, volume: 0 },
        { time: 1, value: 105, volume: 20 },
        { time: 2, value: null, volume: NaN },
        { time: 3, value: 110 },
      ]),
    ).toEqual({
      first: 100,
      last: 110,
      change: expect.closeTo(10),
      averageVolume: 10,
      volumeCount: 2,
    });
    expect(captureSummary([])).toEqual({
      first: null,
      last: null,
      change: null,
      averageVolume: null,
      volumeCount: 0,
    });
    expect(
      captureSummary([{ time: 0, value: 0, volume: -1 }]).change,
    ).toBeNull();
  });
  it("keeps zero returns and breaks at explicit missing samples and absent intervals", () => {
    const points: MarketPoint[] = [
      { time: 0, value: 0 },
      { time: 300, value: 0.1 },
      { time: 600, value: null },
      { time: 900, value: -0.2 },
      { time: 1500, value: 0.3 },
      { time: 1800, value: NaN },
    ];
    expect(
      segments(points, 300).map((part) => part.map((p) => p.time)),
    ).toEqual([[0, 300], [900], [1500]]);
    expect(points[2].value).toBeNull();
  });
  it("does not join hourly closes across a rejected or missing candle", () => {
    expect(
      segments(
        [
          { time: 3600000, value: 2443.34 },
          { time: 10800000, value: 2606.31 },
        ],
        3600000,
      ),
    ).toHaveLength(2);
  });
  it("uses one symmetric return axis without substituting prices for unavailable baselines", () => {
    expect(
      valueDomain(
        [
          {
            id: "missing",
            label: "Missing",
            points: [{ time: 0, value: null }],
          },
        ],
        true,
      ),
    ).toEqual([-0.05, 0.05]);
    const domain = valueDomain(
      [
        {
          id: "sample",
          label: "Sample",
          points: [
            { time: 0, value: -0.5 },
            { time: 1, value: 2 },
          ],
        },
      ],
      true,
    );
    expect(domain).toEqual([-2.4, 2.4]);
    expect(valueDomain([], false)).toEqual([0, 1]);
    expect(
      valueDomain([
        { id: "flat", label: "Flat", points: [{ time: 0, value: 2500 }] },
      ]),
    ).toEqual([2499, 2501]);
  });
  it("inspects recorded timestamps, including missing samples, without interpolation", () => {
    const times = observationTimes([
      {
        id: "a",
        label: "A",
        points: [
          { time: 900, value: 2 },
          { time: 300, value: 1 },
        ],
      },
      {
        id: "b",
        label: "B",
        points: [
          { time: 300, value: null },
          { time: 600, value: null },
        ],
      },
    ]);
    expect(times).toEqual([300, 600, 900]);
    expect(nearestObservation(times, 620)).toBe(1);
    expect(nearestObservation(times, -100)).toBe(0);
    expect(nearestObservation(times, 9999)).toBe(2);
    expect(nearestObservation([], 100)).toBe(-1);
  });
});
