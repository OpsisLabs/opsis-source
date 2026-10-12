import { describe, expect, it, vi } from "vitest";
import { echarts } from "./echarts";

// Exercise the real registration in Node, with a canvas double and no browser.
function canvasDouble() {
  const attributes = new Map<string, string>();
  const context = new Proxy({
    measureText: (text: string) => ({ width: text.length * 7 }),
  }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
  const canvas = {
    width: 600,
    height: 300,
    getContext: () => context,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    getAttribute: (key: string) => attributes.get(key),
  } as unknown as HTMLCanvasElement;
  return { canvas, attributes };
}

describe("Quant chart registration", () => {
  it.each([
    { name: "basis / funding", type: "line", extra: {
      aria: { enabled: true, decal: { show: true } },
      xAxis: { type: "time" },
      series: [{ type: "line", step: "end", data: [[1700000000000, 1], [1700003600000, 2]] }],
    } },
    { name: "single / joint fan", type: "line", extra: {
      legend: { data: ["Band", "Median"] },
      series: [
        { type: "line", name: "Base", stack: "band", data: [0.8, 0.7], areaStyle: { opacity: 0 } },
        { type: "line", name: "Band", stack: "band", data: [0.4, 0.6], areaStyle: {} },
        { type: "line", name: "Median", data: [1, 1.1] },
      ],
    } },
    { name: "return histogram", type: "bar", extra: {
      series: [{ type: "bar", data: [2, 4] }],
    } },
    { name: "correlation", type: "heatmap", extra: {
      tooltip: { trigger: "item" },
      yAxis: { type: "category", data: ["A", "B"] },
      visualMap: { show: false, min: -1, max: 1, inRange: { color: ["#cc554e", "#f7f7f2", "#1000ff"] } },
      series: [{ type: "heatmap", data: [[0, 0, -1], [1, 1, 1]], label: { show: true } }],
    } },
  ])("supports $name with the default canvas renderer", ({ type, extra }) => {
    const { canvas, attributes } = canvasDouble();
    echarts.setPlatformAPI({ createCanvas: () => canvasDouble().canvas });
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    const chart = echarts.init(canvas, undefined, { ssr: true, width: 600, height: 300 });
    try {
      chart.setOption({
        animation: false,
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: ["A", "B"] },
        yAxis: { type: "value" },
        ...extra,
      });
      expect(chart.getZr().painter.getType()).toBe("canvas");
      expect(chart.getOption().series).toEqual(expect.arrayContaining([expect.objectContaining({ type })]));
      expect(chart.convertToPixel({ seriesIndex: 0 }, type === "heatmap" ? [0, 0] : [0, 1]))
        .toEqual([expect.any(Number), expect.any(Number)]);
      expect(chart.getZr().storage.getDisplayList(true).length).toBeGreaterThan(0);
      if ("aria" in extra) expect(attributes.get("aria-label")).toContain("Line chart");
      if (type === "heatmap") {
        expect(chart.getVisual({ seriesIndex: 0, dataIndex: 0 }, "color")).toBe("rgba(204,85,78,1)");
        expect(chart.getVisual({ seriesIndex: 0, dataIndex: 1 }, "color")).toBe("rgba(16,0,255,1)");
      }
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      chart.dispose();
      error.mockRestore();
      warn.mockRestore();
    }
  });
});
