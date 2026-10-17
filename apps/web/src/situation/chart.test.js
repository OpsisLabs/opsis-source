import { afterEach, expect, it, vi } from "vitest";
import { drawChart } from "./chart.js";
import { observeChartTheme } from "./chart-theme.js";
afterEach(() => vi.unstubAllGlobals());

it("draws labels and series from the actual theme and selected language", () => {
  const labels = [];
  const strokes = [];
  const context = new Proxy(
    {},
    {
      get: (target, key) => target[key] ?? (() => {}),
    },
  );
  context.fillText = (text) => labels.push({ text, color: context.fillStyle });
  context.stroke = () => strokes.push(context.strokeStyle);
  const canvas = {
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 300, height: 145 }),
  };
  vi.stubGlobal("devicePixelRatio", 1);
  for (const [soft, ink, accent] of [
    ["#59546e", "#181249", "#1000ff"],
    ["#c8c4da", "#f4f1ff", "#b9b0ff"],
  ]) {
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (key) =>
        ({ "--soft": soft, "--ink": ink, "--accent": accent })[key] || "",
    }));
    labels.length = 0;
    strokes.length = 0;
    drawChart(
      canvas,
      [{ id: "weth", symbol: "WETH", points: [{ relative: 0, change: 0 }] }],
      30,
      120,
      "zh-CN",
    );
    expect(labels).toContainEqual({ text: "发布前", color: soft });
    expect(labels).toContainEqual({ text: "发布后", color: soft });
    expect(labels.some(({ text }) => text.includes("分钟（相对发布）"))).toBe(
      true,
    );
    expect(strokes).toContain(accent);
    drawChart(canvas, [], 30);
    expect(labels).toContainEqual({ text: "BEFORE", color: soft });
  }
});
it("redraws and cleans up when the workspace theme changes", () => {
  const shell = {};
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  let changed;
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback) {
        changed = callback;
        return observer;
      }
    },
  );
  const render = vi.fn();
  const stop = observeChartTheme({ closest: () => shell }, render);
  expect(observer.observe).toHaveBeenCalledWith(shell, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  changed();
  expect(render).toHaveBeenCalledOnce();
  stop();
  expect(observer.disconnect).toHaveBeenCalledOnce();
  expect(() =>
    observeChartTheme({ closest: () => null }, render)(),
  ).not.toThrow();
});
