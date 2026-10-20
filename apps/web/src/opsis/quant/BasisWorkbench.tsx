import { observeQuantChart } from "./chart-presentation";
import { useEffect, useRef, useState } from "react";
import { echarts } from "./echarts";
import { useCopy } from "../copy";
import { analyzeBasisRecords, readBasisFile, type BasisAnalysis } from "./basis-records";
import "./basis-records.css";

const example = {
  schemaVersion: 1,
  venue: "Example Venue",
  chainId: 1,
  market: "ethereum:EXAMPLE-PERP",
  quoteUnit: "USD",
  records: [
    { timestamp: "2026-09-20T08:00:00Z", markPrice: "101.25", indexPrice: "100", markProvenance: { source: "Synthetic example", observedAt: "2026-09-20T08:00:00Z" }, indexProvenance: { source: "Synthetic example", observedAt: "2026-09-20T08:00:00Z" } },
    { timestamp: "2026-09-20T09:00:00Z", markPrice: "99.5", indexPrice: "100", markProvenance: { source: "Synthetic example", observedAt: "2026-09-20T09:00:00Z" }, indexProvenance: { source: "Synthetic example", observedAt: "2026-09-20T09:00:00Z" } },
    { timestamp: "2026-09-20T10:00:00Z", markPrice: "100.125", indexPrice: "100", markProvenance: { source: "Synthetic example", observedAt: "2026-09-20T10:00:00Z" }, indexProvenance: { source: "Synthetic example", observedAt: "2026-09-20T10:00:00Z" } },
  ],
};

export default function BasisWorkbench() {
  const c = useCopy();
  const [analysis, setAnalysis] = useState<BasisAnalysis | null>(null);
  const [error, setError] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [fileRevision, setFileRevision] = useState(0);
  const generation = useRef(0);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!analysis?.chartData || !chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption({ useUTC: true, animation: false, aria: { enabled: true, decal: { show: true } }, tooltip: { trigger: "axis" }, xAxis: { type: "time", name: c("UTC observation time", "UTC 观察时间") }, yAxis: { type: "value", name: c("Signed basis (bps)", "有符号基差（基点）") }, series: [{ name: c("Signed mark/index basis", "有符号标记价/指数价基差"), type: "line", showSymbol: true, data: analysis.chartData.map((point) => [point.timestamp, point.value]) }] });
    const resize = () => chart.resize();
    const stopPresentation = observeQuantChart(chart);
    window.addEventListener("resize", resize);
    return () => { stopPresentation(); window.removeEventListener("resize", resize); chart.dispose(); };
  }, [analysis, c]);
  const clear = () => { generation.current++; setAnalysis(null); setError(""); setSynthetic(false); setFileRevision((n) => n + 1); };
  const loadExample = () => {
    generation.current++;
    try { setAnalysis(analyzeBasisRecords(example)); setError(""); setSynthetic(true); setFileRevision((n) => n + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid example"); }
  };
  const mappedError = error === "File exceeds the 1 MB local import limit."
    ? c(error, "文件超过 1 MB 本地导入限制。")
    : error === "File is not valid JSON."
      ? c(error, "文件不是有效的 JSON。")
      : error
        ? c("Import refused. Check the schema, paired timestamps, decimal prices and ordering.", "导入已拒绝。请检查架构、成对时间戳、十进制价格和顺序。")
        : "";
  return <section className="opsis-basis" aria-labelledby="basis-title">
    <h2 id="basis-title">{c("Mark / index basis dataset", "标记价 / 指数价基差数据集")}</h2>
    <p>{c("Study a user-supplied paired series in this browser. This tool does not provide venue data, verify an index, or establish trading eligibility.", "在此浏览器中研究用户提供的成对序列。本工具不提供交易场所数据、不验证指数，也不确认交易资格。")}</p>
    <p>{c("Imports remain in memory for this view. They are not uploaded, saved to Vault or localStorage, sent to AI, or used for network requests. Clear or reload to remove them.", "导入内容仅保存在此视图内存中，不会上传、保存到 Vault 或 localStorage、发送给 AI 或用于网络请求。清除或重新加载即可移除。")}</p>
    <label htmlFor="basis-file">{c("Basis JSON (max 1 MB, 500 records)", "基差 JSON（最大 1 MB、500 条记录）")}</label>
    <input key={fileRevision} id="basis-file" type="file" accept="application/json,.json" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      const request = ++generation.current;
      setAnalysis(null); setSynthetic(false); setError("");
      if (file) void readBasisFile(file).then((result) => { if (generation.current === request) setAnalysis(result); }).catch((reason: unknown) => { if (generation.current === request) setError(reason instanceof Error ? reason.message : "Import refused"); });
    }} />
    <button type="button" onClick={loadExample}>{c("Load synthetic example", "载入合成示例")}</button>
    <a className="opsis-basis-download" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(example, null, 2))}`} download="synthetic-basis-example.json">{c("Download synthetic JSON example", "下载合成 JSON 示例")}</a>
    <details><summary>{c("Schema and calculation", "数据架构与计算方法")}</summary>
      <pre className="opsis-basis-schema">{`{
  "schemaVersion": 1, "venue": "user-supplied venue", "chainId": 1,
  "market": "ethereum:opaque-market-label", "quoteUnit": "USD",
  "records": [{
    "timestamp": "2026-09-20T08:00:00Z", "markPrice": "101.25", "indexPrice": "100",
    "markProvenance": { "source": "user-supplied", "observedAt": "2026-09-20T08:00:00Z" },
    "indexProvenance": { "source": "user-supplied", "observedAt": "2026-09-20T08:00:00Z" }
  }]
}`}</pre>
      <p>{c("Use 2–500 strictly increasing UTC records. Prices are positive plain decimals with at most 18 fractional and 36 integer digits. Both observedAt values must exactly match timestamp; stale values are refused. Basis bps = (mark − index) / index × 10,000. Display is truncated toward zero to 6 decimal places; calculation uses BigInt decimal integers. No annualization or forecast.", "使用 2–500 条严格递增的 UTC 记录。价格必须为正普通十进制数，最多 18 位小数和 36 位整数。两个 observedAt 必须与 timestamp 完全相同；陈旧值将被拒绝。基点基差 = (标记价 − 指数价) / 指数价 × 10,000。显示值向零截断至 6 位小数；计算使用 BigInt 十进制整数。不进行年化或预测。")}</p>
      <p>{c("The venue, chainId, market label, quote unit and each provenance source are supplied by the user. They are opaque labels, not verified coverage or an independent index.", "交易场所、chainId、市场标识、报价单位及各来源均由用户提供。这些均为原样标签，不代表已验证的覆盖范围或独立指数。")}</p>
    </details>
    <button type="button" onClick={clear}>{c("Clear local data", "清除本地数据")}</button>
    {error && <p role="alert">{mappedError}</p>}
    {analysis && <div aria-live="polite">
      {synthetic && <p className="opsis-basis-example">{c("SYNTHETIC EXAMPLE — not venue data", "合成示例 — 非交易场所数据")}</p>}
      <p><strong>{c("Venue", "交易场所")}:</strong> {analysis.venue} · <strong>chainId:</strong> {analysis.chainId} · <strong>{c("Opaque market label", "原样市场标识")}:</strong> {analysis.market} · <strong>{c("Quote unit", "报价单位")}:</strong> {analysis.quoteUnit}</p>
      <h3>{c("Signed basis over observation time", "观察时间内的有符号基差")}</h3>
      <p>{c("Chart values are converted only when every plotted value is within the safe integer range at the documented 6-place precision. The table retains exact displayed decimals and original prices.", "仅当所有绘图值在文档规定的 6 位精度安全整数范围内时才转换绘图。表格保留显示精度十进制值和原始价格。")}</p>
      {analysis.chartData === null ? <p role="status">{c("Chart refused: at least one value exceeds safe numeric plotting bounds. Exact basis and input prices remain in the table.", "图表已拒绝：至少一个值超出安全数值绘图范围。表格仍保留精确基差和输入价格。")}</p> : <div ref={chartRef} className="opsis-basis-chart" role="img" aria-label={c("Signed mark to index basis in basis points by UTC observation time", "按 UTC 观察时间显示的标记价与指数价有符号基差（基点）")} />}
      <div className="opsis-basis-table-wrap"><table className="opsis-basis-table"><caption>{c("Full imported paired prices and provenance with derived basis", "完整导入的成对价格、来源信息及衍生基差")}</caption><thead><tr>{[c("Timestamp", "时间戳"), c("Mark price", "标记价"), c("Mark source / observed at", "标记价来源 / 观察时间"), c("Index price", "指数价"), c("Index source / observed at", "指数价来源 / 观察时间"), c("Signed basis (bps)", "有符号基差（基点）")].map((head) => <th key={head} scope="col">{head}</th>)}</tr></thead><tbody>{analysis.points.map((point) => <tr key={point.timestamp}><td>{point.timestamp}</td><td>{point.markPrice}</td><td>{point.markProvenance.source} · {point.markProvenance.observedAt}</td><td>{point.indexPrice}</td><td>{point.indexProvenance.source} · {point.indexProvenance.observedAt}</td><td>{point.basisBps}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
