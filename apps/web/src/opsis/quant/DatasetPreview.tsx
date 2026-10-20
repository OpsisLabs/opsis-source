import { useEffect, useRef } from "react";
import type { PriceDataset } from "@rh-chain/quant";
import { useCopy } from "../copy";
import { echarts } from "./echarts";
import { observeQuantChart } from "./chart-presentation";

export default function DatasetPreview({ dataset }: { dataset: PriceDataset | null }) {
  const c = useCopy();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dataset || !element.current) return;
    const chart = echarts.init(element.current);
    chart.setOption({
      animation: false,
      tooltip: { trigger: "axis" },
      grid: { left: 64, right: 24, top: 24, bottom: 45 },
      xAxis: { type: "category", boundaryGap: false, data: dataset.observations.map((row) => row.date), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", scale: true },
      series: [{ name: dataset.quoteCurrency, type: "line", symbol: "none", data: dataset.observations.map((row) => row.price), lineStyle: { color: "#064af2", width: 2 }, areaStyle: { color: "#064af2", opacity: 0.06 } }],
    });
    const stop = observeQuantChart(chart);
    return () => { stop(); chart.dispose(); };
  }, [dataset]);
  return <section className="opsis-dataset-preview" aria-label={c("Local dataset preview", "本地数据集预览")}>
    <div className="opsis-dataset-preview-heading"><h3>{c("Daily observations", "每日观察")}</h3><span>{dataset ? `${dataset.observations.length} · ${dataset.quoteCurrency}` : c("NO DATASET", "无数据集")}</span></div>
    {dataset ? <>
      <div ref={element} className="opsis-dataset-preview-chart" role="img" aria-label={c("Imported daily prices. Exact dates and prices are available in the observation table.", "导入的每日价格。确切日期和价格见观察表。")} />
      <details><summary>{c("View exact observations", "查看精确观察值")}</summary><div className="opsis-table-scroll" role="region" tabIndex={0} aria-label={c("Imported daily observations", "导入的每日观察")}><table><caption>{dataset.synthetic ? c("Synthetic example; not market history", "合成示例；非市场历史") : c("User supplied prices; provenance not independently verified", "用户提供的价格；来源未经独立验证")}</caption><thead><tr><th>{c("Date", "日期")}</th><th>{dataset.quoteCurrency}</th></tr></thead><tbody>{dataset.observations.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.price.toString()}</td></tr>)}</tbody></table></div></details>
    </> : <div className="opsis-dataset-preview-empty"><span aria-hidden="true">↗</span><p>{c("Your observations, ready to inspect.", "您的观察数据，准备就绪。")}</p><small>{c("Import a local CSV or JSON file to preview its daily prices. No example values are substituted.", "导入本地 CSV 或 JSON 文件以预览每日价格。不替换为示例数值。")}</small></div>}
  </section>;
}
