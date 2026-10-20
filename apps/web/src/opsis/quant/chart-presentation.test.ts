import { afterEach, describe, expect, it, vi } from "vitest";
import type { EChartsType } from "echarts/core";
import { observeQuantChart } from "./chart-presentation";

afterEach(() => vi.unstubAllGlobals());

describe("local research chart presentation", () => {
  it("resizes a restored panel, follows theme changes and releases observers", () => {
    let onResize = () => {};
    let onTheme = () => {};
    const resizeDisconnect = vi.fn();
    const themeDisconnect = vi.fn();
    const root = {};
    const element = { clientWidth: 0, clientHeight: 0, closest: () => root };
    let ink = "#172342";
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (key: string) => key === "--ink" ? ink : "" }));
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { onResize = callback; } observe = vi.fn(); disconnect = resizeDisconnect; });
    vi.stubGlobal("MutationObserver", class { constructor(callback: () => void) { onTheme = callback; } observe = vi.fn(); disconnect = themeDisconnect; });
    const chart = { getDom: () => element, resize: vi.fn(), setOption: vi.fn() };
    const stop = observeQuantChart(chart as unknown as EChartsType);
    onResize();
    expect(chart.resize).not.toHaveBeenCalled();
    element.clientWidth = 600; element.clientHeight = 300;
    onResize();
    expect(chart.resize).toHaveBeenCalledTimes(1);
    ink = "#f0f2ff";
    onTheme();
    expect(chart.setOption).toHaveBeenLastCalledWith(expect.objectContaining({ textStyle: expect.objectContaining({ color: ink }) }));
    stop();
    expect(resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(themeDisconnect).toHaveBeenCalledTimes(1);
  });
});
