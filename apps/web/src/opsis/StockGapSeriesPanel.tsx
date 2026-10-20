import { observeQuantChart } from "./quant/chart-presentation";
import { useEffect, useRef, useState } from "react";
import { init, use as registerECharts } from "echarts/core";
import { ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

registerECharts([ScatterChart, GridComponent, TooltipComponent, CanvasRenderer]);
import type { StockGapSeries } from "./stock-gap-series";
import { useStockGapImport } from "./useStockGapImport";
import { useCopy } from "./copy";

const sessionColor = { open: "#1000ff", closed: "#c45b4f", unknown: "#777187" } as const;

export default function StockGapSeriesPanel() {
  const c = useCopy();
  const { series, busy, error, load, cancel } = useStockGapImport();
  const [selected, setSelected] = useState<number | null>(null);
  const gapChartRef = useRef<HTMLDivElement>(null);
  const ageChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!series || !gapChartRef.current) return;
    const chart = init(gapChartRef.current);
    const points = series.observations;
    chart.setOption({
      animation: false,
      grid: { left: 65, right: 18, top: 18, bottom: 75 },
      xAxis: { type: "time", axisLabel: { hideOverlap: true, formatter: (value: number) => new Date(value).toISOString().slice(0, 10) } },
      yAxis: { type: "value", name: c("Gap %", "价差 %"), scale: true },
      tooltip: { trigger: "item", formatter: (params: unknown) => {
        const index = (params as { dataIndex?: number }).dataIndex ?? -1;
        const point = points[index];
        return point ? `${point.timestamp}<br/>${c("Gap", "价差")}: ${point.gapPercent}%` : "";
      } },
      series: [{
        type: "scatter",
        data: points.map((point) => ({
          value: [point.timestamp, point.chartGapPercent],
          symbol: point.corporateAction.state === "effective" ? "diamond" : point.corporateAction.state === "announced" ? "triangle" : "circle",
          symbolSize: point.corporateAction.state === "effective" || point.corporateAction.state === "announced" ? 13 : 9,
          itemStyle: { color: sessionColor[point.session], borderColor: point.corporateAction.state === "unknown" ? "#a7570a" : "#ffffff", borderWidth: point.corporateAction.state === "unknown" ? 2 : 1 },
        })),
      }],
    });
    chart.on("click", (params) => {
      if (typeof params.dataIndex === "number") setSelected(params.dataIndex);
    });
    const resize = () => chart.resize();
    const stopPresentation = observeQuantChart(chart);
    window.addEventListener("resize", resize);
    return () => { stopPresentation(); window.removeEventListener("resize", resize); chart.dispose(); };
  }, [series, c]);

  useEffect(() => {
    if (!series || series.referenceType !== "oracle" || !ageChartRef.current) return;
    const chart = init(ageChartRef.current);
    chart.setOption({
      animation: false,
      grid: { left: 65, right: 18, top: 12, bottom: 52 },
      xAxis: { type: "time", axisLabel: { hideOverlap: true, formatter: (value: number) => new Date(value).toISOString().slice(0, 10) } },
      yAxis: { type: "value", name: c("Minutes", "分钟"), min: 0 },
      tooltip: { trigger: "item", formatter: (params: unknown) => {
        const index = (params as { dataIndex?: number }).dataIndex ?? -1;
        const point = series.observations[index];
        return point ? `${point.timestamp}<br/>${c("Oracle age", "预言机时距")}: ${point.oracleAgeMinutes ?? "—"} ${c("minutes", "分钟")}` : "";
      } },
      series: [{ type: "scatter", data: series.observations.map((point) => [point.timestamp, point.oracleAgeMinutes]), itemStyle: { color: "#7670bd" }, symbolSize: 7 }],
    });
    const resize = () => chart.resize();
    const stopPresentation = observeQuantChart(chart);
    window.addEventListener("resize", resize);
    return () => { stopPresentation(); window.removeEventListener("resize", resize); chart.dispose(); };
  }, [series, c]);

  const point = selected === null ? null : series?.observations[selected];
  const warningText = (warning: string) => {
    switch (warning) {
      case "source_provenance_unverified": return c("The file's stated source and instrument identity have not been verified.", "文件声称的来源与资产身份未经验证。");
      case "session_unknown": return c("At least one market session is unknown.", "至少有一个市场时段未知。");
      case "corporate_action_state_unknown": return c("At least one corporate-action state is unknown; gaps across actions may not be comparable.", "至少有一个公司行动状态未知；行动前后的价差可能无法比较。");
      default: return c("An import limitation was reported.", "导入数据报告了一项限制。");
    }
  };
  const actionText = (action: StockGapSeries["observations"][number]["corporateAction"]) => {
    const state = action.state === "none_reported" ? c("None reported", "报告无行动")
      : action.state === "announced" ? c("Announced", "已公布")
        : action.state === "effective" ? c("Effective", "已生效") : c("Unknown", "未知");
    return action.description ? `${state}: ${action.description}` : state;
  };
  const sessionText = (session: StockGapSeries["observations"][number]["session"]) =>
    session === "open" ? c("Open", "开市") : session === "closed" ? c("Closed", "休市") : c("Unknown", "未知");

  return <section className="opsis-stock-series" aria-labelledby="opsis-stock-series-title">
    <h3 id="opsis-stock-series-title">{c("How did the gap change by session?", "价差如何随交易时段变化？")}</h3>
    <p>{c("Import paired, dated prices for one stock token. The calculation runs locally; source, session and corporate-action labels are user supplied and unverified. Each point is observed from the file; no missing interval is filled.", "导入同一股票代币按日期配对的价格。计算在本地完成；来源、时段及公司行动标签由用户提供且未经验证。每个点均来自文件中的观察值；不会填补缺失时段。")}</p>
    <label>{c("Paired stock-token gap JSON", "股票代币配对价差 JSON")}
      <input type="file" accept=".json,application/json" onChange={(event) => { setSelected(null); void load(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    </label>
    {busy && <p role="status">{c("Calculating locally…", "正在本地计算…")} <button type="button" onClick={() => { setSelected(null); cancel(); }}>{c("Cancel import", "取消导入")}</button></p>}
    {error && <p role="alert" className="opsis-error">{error}</p>}
    <details><summary>{c("JSON format and required fields", "JSON 格式及必填字段")}</summary>
      <p>{c("schemaVersion 1; instrument {chainId, address, symbol}; quoteCurrency and matching referenceQuoteCurrency (USD or USDG); referenceType underlying or oracle; sourceName; observedAt; observations of timestamp, dexPrice, referencePrice, session. Underlying rows require multiplier. Oracle rows require oracleObservedAt and no multiplier. Optional corporateAction has state none_reported, announced, effective or unknown; announced/effective require a description. USDG is not assumed to equal USD.", "schemaVersion 为 1；instrument 包含 chainId、address、symbol；quoteCurrency 和一致的 referenceQuoteCurrency（USD 或 USDG）；referenceType 为 underlying 或 oracle；sourceName；observedAt；observations 包含 timestamp、dexPrice、referencePrice、session。标的价格行须有 multiplier；预言机行须有 oracleObservedAt，且不可有 multiplier。可选 corporateAction 的 state 为 none_reported、announced、effective 或 unknown；公布或生效须填写 description。USDG 不被视为 USD。")}</p>
      <p>{c("Synthetic format example; replace every value with an observed, comparable source before drawing conclusions:", "合成格式示例；得出结论前须将每个值替换为同口径的观察来源：")}</p>
      <pre className="opsis-stock-series-example">{`{
  "schemaVersion": 1,
  "instrument": { "chainId": 4663, "address": "0x0000000000000000000000000000000000000001", "symbol": "EXAMPLE" },
  "quoteCurrency": "USD", "referenceQuoteCurrency": "USD",
  "referenceType": "underlying", "sourceName": "Synthetic format example — not market data",
  "observedAt": "2026-09-03T00:00:00Z",
  "observations": [
    { "timestamp": "2026-09-01T14:00:00Z", "dexPrice": "55", "referencePrice": "100", "multiplier": "0.5", "session": "open", "corporateAction": { "state": "none_reported" } },
    { "timestamp": "2026-09-02T14:00:00Z", "dexPrice": "105", "referencePrice": "100", "multiplier": "1", "session": "unknown", "corporateAction": { "state": "effective", "description": "Example multiplier change" } }
  ]
}`}</pre>
    </details>
    {series && <>
      <p role="status">{series.instrument.symbol ?? series.instrument.address} · {series.instrument.chainId}:{series.instrument.address} · {series.quoteCurrency} · {series.observations.length} {c("paired observations", "个配对观察值")} · {series.observations[0]?.timestamp} – {series.observations.at(-1)?.timestamp}</p>
      <p>{c("Source claimed by file", "文件声称来源")}: {series.sourceName} · {c("File observed at", "文件观察时间")}: {series.observedAt}</p>
      <p className="opsis-stock-series-legend">{c("Time axis uses UTC dates. Blue: open; red: closed; grey: unknown session. Triangle: announced action; diamond: effective action; outlined circle: unknown action state. Select a point for its exact values.", "时间轴使用 UTC 日期。蓝色：开市；红色：休市；灰色：时段未知。三角形：已公布的公司行动；菱形：已生效的行动；描边圆形：行动状态未知。选择点查看精确数值。")}</p>
      <div ref={gapChartRef} className="opsis-stock-series-chart" role="img" aria-label={c("Observed stock-token reference gap by session; exact points are in the table below.", "按交易时段显示的股票代币参考价差；精确数值见下表。")}/>
      {series.referenceType === "oracle" && <>
        <p>{c("Oracle age at each observation; minutes are shown separately from the gap, with no assumed freshness threshold.", "各观察点的预言机时距；分钟数与价差分开显示，不假设新鲜度阈值。")}</p>
        <div ref={ageChartRef} className="opsis-stock-series-age" role="img" aria-label={c("Oracle age in minutes by observation; exact ages are in the table below.", "各观察点的预言机时距（分钟）；精确时距见下表。")}/>
      </>}
      {point && <p role="status">{c("Selected", "已选择")}: {point.timestamp} · {point.gapPercent}% · {c("Session", "时段")}: {sessionText(point.session)} · {c("Oracle age", "预言机时距")}: {point.oracleAgeMinutes ?? c("not applicable", "不适用")} {point.oracleAgeMinutes === null ? "" : c("minutes", "分钟")} · {c("Corporate action", "公司行动")}: {actionText(point.corporateAction)}</p>}
      {series.warnings.map((warning) => <p role="note" key={warning}>{warningText(warning)}</p>)}
      <div className="opsis-table-scroll" tabIndex={0} role="region" aria-label={c("Paired observations", "配对观察")}><table className="opsis-stock-series-table">
        <caption>{c("Every paired observation and input; exact gap percentage is truncated to four decimals. Session and corporate-action information comes from the imported file.", "每个配对观察值及其输入；精确价差百分比截断至四位小数。时段及公司行动信息来自导入文件。")}</caption>
        <thead><tr><th>{c("Observed at", "观察时间")}</th><th>{c("DEX price", "DEX 价格")}</th><th>{c("Reference price", "参考价格")}</th><th>{c("Multiplier", "乘数")}</th><th>{c("Gap %", "价差 %")}</th><th>{c("Session", "时段")}</th><th>{c("Corporate-action state", "公司行动状态")}</th><th>{c("Oracle age (min)", "预言机时距（分钟）")}</th></tr></thead>
        <tbody>{series.observations.map((row, index) => <tr key={row.timestamp}><td><button type="button" onClick={() => setSelected(index)}>{row.timestamp}</button></td><td>{row.dexPrice}</td><td>{row.referencePrice}</td><td>{row.multiplier ?? c("Not applicable", "不适用")}</td><td>{row.gapPercent}</td><td>{sessionText(row.session)}</td><td>{actionText(row.corporateAction)}</td><td>{row.oracleAgeMinutes ?? c("Not applicable", "不适用")}</td></tr>)}</tbody>
      </table></div>
      <p role="note">{c("The imported source, instrument match and corporate-action basis are unverified. This gap excludes execution costs and does not show whether trading is available.", "导入来源、标的匹配及公司行动基准未经验证。此价差不含执行成本，也不表示交易是否可用。")}</p>
    </>}
  </section>;
}
