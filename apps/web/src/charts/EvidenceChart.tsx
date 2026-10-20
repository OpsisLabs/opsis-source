import { useEffect, useRef } from "react";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import {
  init,
  use as registerECharts,
  type EChartsCoreOption,
} from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { CHART_COLORS } from "./theme";

registerECharts([
  SVGRenderer,
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
]);

export function EvidenceChart({
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
    const shell = container.closest(".opsis");
    const draw = () => {
      const surface = container.closest(".opsis-content") ?? shell;
      const styles = surface ? getComputedStyle(surface) : null;
      const adapt = (value: unknown): unknown => {
        if (!styles) return value;
        if (Array.isArray(value)) return value.map(adapt);
        if (
          value &&
          typeof value === "object" &&
          Object.getPrototypeOf(value) === Object.prototype
        )
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, adapt(item)]),
          );
        if (typeof value !== "string") return value;
        const token = (
          {
            "#9a938a": "--soft",
            "#b8b0a7": "--soft",
            "#f0e8da": "--ink",
            "#4a4642": "--line",
            "#302f2d": "--line",
            "#171717": "--panel",
            "#242424": "--panel",
          } as Record<string, string>
        )[value];
        return token ? styles.getPropertyValue(token).trim() : value;
      };
      chart.setOption(
        adapt({
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
        }) as EChartsCoreOption,
      );
    };
    draw();
    const themeObserver = new MutationObserver(draw);
    if (shell)
      themeObserver.observe(shell, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
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
