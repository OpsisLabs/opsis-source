import { useEffect, useRef } from "react";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use as registerECharts, type EChartsCoreOption } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { CHART_COLORS } from "./theme";

registerECharts([
  SVGRenderer,
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
]);

export function ChainScoutChart({
  option,
  label,
  height = 260,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const chart = init(container, undefined, { renderer: "svg" });
    chart.setOption({
      animation: !reducedMotion,
      animationDuration: reducedMotion ? 0 : 220,
      animationDurationUpdate: reducedMotion ? 0 : 180,
      color: [...CHART_COLORS],
      backgroundColor: "transparent",
      textStyle: {
        color: "#9a938a",
        fontFamily: "IBM Plex Mono, monospace",
      },
      aria: {
        enabled: true,
        decal: { show: true },
        description: label,
      },
      ...option,
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [label, option]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      data-chart-renderer="echarts-svg"
      className="w-full"
      style={{ height }}
    />
  );
}
