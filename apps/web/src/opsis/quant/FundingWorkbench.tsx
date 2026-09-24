import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useCopy } from "../copy";
import { analyzeFundingRecords, readFundingFile, type FundingAnalysis } from "./funding-records";
import "./funding-records.css";

const example = {
  schemaVersion: 1,
  records: [
    { venue: "Example Venue", instrument: { chainId: 1, market: "ethereum:EXAMPLE-PERP" }, timestamp: "2026-09-20T08:00:00Z", status: "realized", quotedIntervalSeconds: 28800, paidIntervalSeconds: 28800, direction: "paid", notionalConvention: "linear quote notional", notional: "1000", quoteUnit: "USDC", amount: "1.25", provenance: { source: "Synthetic example", observedAt: "2026-09-20T08:05:00Z" } },
    { venue: "Example Venue", instrument: { chainId: 1, market: "ethereum:EXAMPLE-PERP" }, timestamp: "2026-09-20T16:00:00Z", status: "realized", quotedIntervalSeconds: 28800, paidIntervalSeconds: 28800, direction: "received", notionalConvention: "linear quote notional", notional: "1000", quoteUnit: "USDC", amount: "0.40", provenance: { source: "Synthetic example", observedAt: "2026-09-20T16:05:00Z" } },
    { venue: "Example Venue", instrument: { chainId: 1, market: "ethereum:EXAMPLE-PERP" }, timestamp: "2026-09-21T00:00:00Z", status: "predicted", quotedIntervalSeconds: 28800, paidIntervalSeconds: 28800, direction: "paid", notionalConvention: "linear quote notional", notional: "1000", quoteUnit: "USDC", amount: "0.75", provenance: { source: "Synthetic example estimate", observedAt: "2026-09-20T16:05:00Z" } },
  ],
};

export default function FundingWorkbench() {
  const c = useCopy();
  const [analysis, setAnalysis] = useState<FundingAnalysis | null>(null);
  const [error, setError] = useState("");
  const [exampleVisible, setExampleVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!analysis?.chartData?.length || !chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption({
      animation: false,
      aria: { enabled: true, decal: { show: true } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "time", name: c("Settlement time", "结算时间") },
      yAxis: { type: "value", name: analysis.quoteUnit },
      series: [{ name: c("Cumulative realized net funding", "已实现累计净资金费"), type: "line", step: "end", showSymbol: true, data: analysis.chartData.map((point) => [point.timestamp, point.value]) }],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.dispose(); };
  }, [analysis, c]);
  const copyError = c(error, error === "File exceeds the 1 MB local import limit." ? "文件超过 1 MB 本地导入限制。" : "无法读取该文件，请检查必填字段、单位和记录顺序。");
  const loadExample = () => {
    generation.current++;
    try { setAnalysis(analyzeFundingRecords(example)); setError(""); setExampleVisible(true); setRevision((v) => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "Invalid example"); }
  };
  return (
    <section className="opsis-funding" aria-labelledby="funding-title">
      <h2 id="funding-title">{c("Funding records", "资金费率记录")}</h2>
      <p>{c("Import your own funding observations for local analysis. No venue feed or venue coverage is available here. Eligibility and data rights depend on your source and venue.", "导入你自己的资金费率观察数据并在本地分析。此处没有交易场所数据源或覆盖。资格与数据权利取决于你的来源和交易场所。")}</p>
      <p>{c("Imports stay in this browser's memory for this view; they are not uploaded, saved to Vault, or sent to AI. Closing or reloading clears them.", "导入内容仅保存在此视图的浏览器内存中；不会上传、保存到 Vault 或发送给 AI。关闭或重新加载页面后会清除。")}</p>
      <p>{c("Chain ID and market are separate user-supplied identity fields. The market label is opaque input; it does not verify a chain integration or standardized venue symbol.", "链 ID 和市场标识是分别由用户提供的身份字段。市场标识仅作为原样输入；它不验证链集成或标准化交易场所代码。")}</p>
      <label htmlFor="funding-file">{c("Funding records JSON (max 1 MB, 500 records)", "资金费率 JSON（最多 1 MB、500 条记录）")}</label>
      <input key={revision} id="funding-file" type="file" accept="application/json,.json" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        const requestGeneration = ++generation.current;
        setAnalysis(null); setExampleVisible(false); setError("");
        if (file) void readFundingFile(file).then((result) => { if (generation.current === requestGeneration) setAnalysis(result); }).catch((e: unknown) => { if (generation.current === requestGeneration) setError(e instanceof Error ? e.message : "Invalid file"); });
      }} />
      <button type="button" onClick={loadExample}>{c("Load synthetic example", "载入合成示例")}</button>
      <a className="opsis-funding-download" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(example, null, 2))}`} download="synthetic-funding-example.json">{c("Download synthetic JSON example", "下载合成 JSON 示例")}</a>
      <details>
        <summary>{c("Required JSON fields and format", "必需 JSON 字段与格式")}</summary>
        <pre className="opsis-funding-schema">{`{
  "schemaVersion": 1,
  "records": [{
    "venue": "user-supplied venue",
    "instrument": { "chainId": 1, "market": "chain-qualified user label" },
    "timestamp": "2026-09-20T08:00:00Z",
    "status": "realized",
    "quotedIntervalSeconds": 28800,
    "paidIntervalSeconds": 28800,
    "direction": "paid",
    "notionalConvention": "linear quote notional",
    "notional": "1000",
    "quoteUnit": "USDC",
    "amount": "1.25",
    "provenance": { "source": "user-supplied source", "observedAt": "2026-09-20T08:05:00Z" }
  }]
}`}</pre>
        <p>{c("Use plain decimal strings. Status is realized or predicted; direction is paid or received. Timestamps must be strictly increasing. Predicted provenance may precede its settlement timestamp.", "使用普通十进制字符串。状态为已实现或预测；方向为支付或收到。时间戳必须严格递增。预测数据来源观察时间可以早于结算时间。")}</p>
      </details>
      <button type="button" onClick={() => { generation.current++; setAnalysis(null); setError(""); setExampleVisible(false); setRevision((v) => v + 1); }}>{c("Clear local data", "清除本地数据")}</button>
      {error && <p role="alert">{copyError}</p>}
      {analysis && <div aria-live="polite">
        {exampleVisible && <p className="opsis-funding-example">{c("SYNTHETIC EXAMPLE — not venue data", "合成示例 — 非交易场所数据")}</p>}
        <p><strong>{c("Venue", "交易场所")}:</strong> {analysis.venue} · <strong>{c("Chain ID", "链 ID")}:</strong> {analysis.chainId} · <strong>{c("User-supplied market label", "用户提供的市场标识")}:</strong> {analysis.market}</p>
        <p><strong>{c("Realized cumulative net funding", "已实现累计净资金费")}:</strong> {analysis.realizedNet} {analysis.quoteUnit}</p>
        <p>{c("Paid amounts are negative; received amounts are positive. Predicted records are excluded from the realized total.", "支付金额为负；收到金额为正。预测记录不计入已实现总额。")}</p>
        <p>{c("Each row shows its stated quoted interval and paid interval. No annualization is applied.", "每行显示其明确给出的报价间隔和支付间隔。不进行年化。")}</p>
        <h3>{c("Cumulative realized funding over settlement time", "已实现累计资金费随结算时间变化")}</h3>
        <p>{c("Predicted records are excluded from this chart. Values are a visual conversion; the exact decimal total and every record remain in the table.", "此图不包含预测记录。图中数值仅供视觉展示；精确十进制总额和全部记录均保留在表格中。")}</p>
        {analysis.chartData === null ? <p role="status">{c("Chart unavailable: cumulative values exceed safe numeric plotting bounds. Exact values remain available below.", "图表不可用：累计数值超出安全绘图范围。下方仍提供精确数值。")}</p> : analysis.chartData.length === 0 ? <p role="status">{c("No realized records to chart.", "没有可绘制的已实现记录。")}</p> : <div ref={chartRef} className="opsis-funding-chart" role="img" aria-label={c("Cumulative realized funding chart; predicted records excluded", "已实现累计资金费图表；不含预测记录")} />}
        <div className="opsis-funding-table-wrap"><table className="opsis-funding-table">
          <caption>{c("Imported funding records with provenance", "含来源信息的导入资金费率记录")}</caption>
          <thead><tr>{[c("Timestamp", "时间戳"), c("Status", "状态"), c("Direction", "方向"), c("Amount", "金额"), c("Quote unit", "报价单位"), c("Quoted interval (s)", "报价间隔（秒）"), c("Paid interval (s)", "支付间隔（秒）"), c("Cumulative realized net", "已实现累计净额"), c("Notional", "名义金额"), c("Notional convention", "名义金额约定"), c("Source / observed at", "来源 / 观察时间")].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{analysis.records.map((r, i) => <tr key={`${r.timestamp}-${i}`}><td>{r.timestamp}</td><td>{r.status === "realized" ? c("Realized", "已实现") : c("Predicted", "预测")}</td><td>{r.direction === "paid" ? c("Paid", "支付") : c("Received", "收到")}</td><td>{r.amount}</td><td>{r.quoteUnit}</td><td>{r.quotedIntervalSeconds}</td><td>{r.paidIntervalSeconds}</td><td>{analysis.cumulativeByRecord[i] || c("Excluded", "已排除")}</td><td>{r.notional}</td><td>{r.notionalConvention}</td><td>{r.provenance.source} · {r.provenance.observedAt}</td></tr>)}</tbody>
        </table></div>
      </div>}
    </section>
  );
}
