import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

export default function PerformanceChart({
  series,
  label,
}: {
  series: { name: string; values: number[]; color?: string }[];
  label: string;
}) {
  const node = useRef<HTMLDivElement>(null);
  const seriesKey = JSON.stringify(series);
  useEffect(() => {
    const series = JSON.parse(seriesKey) as {
      name: string;
      values: number[];
      color?: string;
    }[];
    if (!node.current || !series.length) return;
    const chart = echarts.init(node.current);
    const motion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.setOption({
      animation: !motion,
      animationDuration: 400,
      color: ["#fa783f", "#80c6b1", "#b7a6db"],
      grid: { left: 55, right: 28, top: 25, bottom: 57 },
      legend: {
        show: series.length > 1,
        bottom: 0,
        icon: "roundRect",
        itemWidth: 16,
        itemHeight: 3,
        textStyle: { color: "#bdb7ad" },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#242321",
        borderColor: "#48423b",
        textStyle: { color: "#eee7dc" },
        valueFormatter: (v: unknown) => `${Number(v).toFixed(2)}%`,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: Array.from({ length: 8 }, (_, i) =>
          i === 0 ? "Posted" : `Day ${i}`,
        ),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#403d38" } },
        axisLabel: { color: "#aba59b", margin: 15 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#aba59b", formatter: "{value}%" },
        splitNumber: 4,
        splitLine: { lineStyle: { color: "#35332f", type: "dashed" } },
      },
      series: series.map((s, i) => ({
        name: s.name,
        type: "line",
        data: s.values,
        smooth: false,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: true,
        lineStyle: { width: 2.5, color: s.color },
        itemStyle: s.color ? { color: s.color } : undefined,
        areaStyle: series.length === 1 ? { opacity: 0.055 } : undefined,
        markLine:
          i === 0
            ? {
                silent: true,
                symbol: "none",
                label: { show: false },
                lineStyle: { color: "#797063", type: "dashed", width: 1 },
                data: [{ yAxis: 0 }],
              }
            : undefined,
      })),
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [seriesKey]);
  return series.length ? (
    <div
      className="kol-performance-chart"
      ref={node}
      role="img"
      aria-label={
        label +
        ". " +
        series
          .map(
            (s) =>
              s.name +
              ": " +
              s.values.map((v, i) => `day ${i}, ${v.toFixed(2)}%`).join("; "),
          )
          .join(". ")
      }
    />
  ) : (
    <div className="kol-chart-loading">
      No complete seven-day observations available.
    </div>
  );
}
