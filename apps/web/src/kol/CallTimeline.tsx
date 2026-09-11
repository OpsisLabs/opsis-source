import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { calls, profiles, type Call } from "./model";
echarts.use([ScatterChart, GridComponent, TooltipComponent, CanvasRenderer]);

export default function CallTimeline({
  onSelect,
  token,
}: {
  onSelect: (call: Call) => void;
  token: string;
}) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current) return;
    const chart = echarts.init(node.current);
    const items = calls.filter((c) => !token || c.tokens.includes(token));
    chart.setOption({
      animationDuration: 650,
      grid: { left: 75, right: 25, top: 35, bottom: 50 },
      tooltip: {
        trigger: "item",
        backgroundColor: "#252320",
        borderColor: "#615044",
        textStyle: { color: "#eee7dc" },
        formatter: (p: unknown) => {
          const index = (p as { dataIndex: number }).dataIndex;
          const call = items[index];
          return call ? profileLabel(call) : "";
        },
      },
      xAxis: {
        type: "time",
        min: Date.parse("2026-07-25"),
        max: Date.parse("2026-09-13"),
        axisLabel: { color: "#aaa39b", formatter: "{MMM} {d}" },
        axisLine: { lineStyle: { color: "#4a423d" } },
        splitLine: { lineStyle: { color: "#34312e", type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: profiles.map((p) => p.name).reverse(),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#eee7dc" },
        splitLine: { show: true, lineStyle: { color: "#34312e" } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: 36,
          data: items.map((c) => ({
            value: [
              Date.parse(c.date),
              profiles.find((p) => p.id === c.profile)!.name,
            ],
            symbol:
              "image://" + profiles.find((p) => p.id === c.profile)!.avatar,
          })),
          emphasis: { scale: 1.3 },
        },
      ],
    });
    chart.on("click", (p) => {
      const c = items[p.dataIndex];
      if (c) onSelect(c);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [onSelect, token]);
  return (
    <div
      ref={node}
      className="kol-timeline-chart"
      role="img"
      aria-label="Source post timeline, July 28 through September 10. Select an original post in the accessible list below."
    />
  );
}
function profileLabel(c: Call) {
  return (
    profiles.find((p) => p.id === c.profile)!.name +
    " · " +
    c.date +
    "<br/>" +
    c.tokens.join(" / ") +
    "<br/>Select to inspect the source"
  );
}
