import type { EChartsType } from "echarts/core";

/** Follow panel visibility, dock resizing and the active workspace theme. */
export function observeQuantChart(chart: EChartsType) {
  const element = chart.getDom();
  const themeRoot = element.closest("[data-theme]");
  const present = () => {
    const styles = getComputedStyle(element);
    const ink = styles.getPropertyValue("--ink").trim() || "#172342";
    const soft = styles.getPropertyValue("--soft").trim() || "#596781";
    const line = styles.getPropertyValue("--line").trim() || "#dce3f2";
    chart.setOption({
      backgroundColor: "transparent",
      textStyle: { color: ink, fontFamily: "OpsisMono, monospace", fontWeight: "normal" },
      legend: { textStyle: { color: soft, fontFamily: "OpsisMono, monospace", fontSize: 10 } },
      xAxis: { axisLabel: { color: soft }, nameTextStyle: { color: soft }, axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line } } },
      yAxis: { axisLabel: { color: soft }, nameTextStyle: { color: soft }, axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line } } },
    });
  };
  present();
  const resize = new ResizeObserver(() => {
    if (element.clientWidth && element.clientHeight) chart.resize();
  });
  resize.observe(element);
  const theme = new MutationObserver(present);
  if (themeRoot) theme.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
  return () => { resize.disconnect(); theme.disconnect(); };
}
