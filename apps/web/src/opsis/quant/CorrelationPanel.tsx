import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import type { ObservedCorrelationMatrix, PriceDataset } from "@rh-chain/quant";
import { useCopy } from "../copy";

type MatrixMessage = {
  id: number;
  type: "correlation-result" | "error";
  result?: ObservedCorrelationMatrix;
  issues?: Array<{ message: string }>;
};

export default function CorrelationPanel({ datasets }: { datasets: readonly PriceDataset[] }) {
  const c = useCopy();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ObservedCorrelationMatrix | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    generation.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => {
    if (!result || !chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    const n = result.instruments.length;
    const cells = result.cells.flatMap((row, rowIndex) => row.map((cell, colIndex) => ({
      value: [colIndex, rowIndex, cell.correlation ?? 0],
      itemStyle: cell.correlation === null ? { color: "#bbb9c5" } : undefined,
    })));
    chart.setOption({
      animation: false,
      grid: { left: 55, right: 20, top: 18, bottom: 45 },
      tooltip: { trigger: "item", formatter: (params: unknown) => {
        const index = (params as { dataIndex?: number }).dataIndex ?? 0;
        const cell = result.cells[Math.floor(index / n)]?.[index % n];
        return cell?.correlation === null ? c("Undefined correlation", "相关性未定义")
          : `${c("Observed correlation", "观察到的相关性")}: ${cell?.correlation?.toString() ?? "—"}`;
      } },
      xAxis: { type: "category", data: result.instruments.map((_, index) => String.fromCharCode(65 + index)) },
      yAxis: { type: "category", data: result.instruments.map((_, index) => String.fromCharCode(65 + index)), inverse: true },
      visualMap: { show: false, min: -1, max: 1, inRange: { color: ["#cc554e", "#f7f7f2", "#1000ff"] } },
      series: [{ type: "heatmap", data: cells, label: {
        show: true,
        color: "#181249",
        formatter: (params: { dataIndex?: number }) => {
          const index = params.dataIndex ?? 0;
          const correlation = result.cells[Math.floor(index / n)]?.[index % n]?.correlation;
          return correlation === null || correlation === undefined ? c("Undefined", "未定义") : correlation.toFixed(2);
        },
      }, emphasis: { itemStyle: { borderColor: "#181249", borderWidth: 2 } } }],
    });
    chart.on("click", (params) => {
      if (typeof params.dataIndex === "number") setSelected({ row: Math.floor(params.dataIndex / n), col: params.dataIndex % n });
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.dispose(); };
  }, [result, c]);

  const start = () => {
    workerRef.current?.terminate();
    let worker: Worker;
    try {
      worker = new Worker(new URL("./quant.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setError(c("The local worker could not start.", "本地工作线程无法启动。"));
      return;
    }
    const id = ++generation.current;
    workerRef.current = worker;
    setBusy(true);
    setResult(null);
    setSelected(null);
    setError("");
    worker.onmessage = (event: MessageEvent<MatrixMessage>) => {
      if (event.data.id !== id || generation.current !== id) return;
      worker.terminate();
      workerRef.current = null;
      setBusy(false);
      if (event.data.type === "correlation-result" && event.data.result) {
        setResult(event.data.result);
        return;
      }
      setError(event.data.issues?.map((issue) => issue.message).join(" ") || c("Co-movement check refused.", "共同变化核查已被拒绝。"));
    };
    worker.onerror = () => {
      if (generation.current !== id) return;
      worker.terminate();
      workerRef.current = null;
      setBusy(false);
      setError(c("The local worker failed before producing a result.", "本地工作线程未能生成结果。"));
    };
    worker.postMessage({ id, kind: "correlation", datasets });
  };
  const cancel = () => {
    generation.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setResult(null);
    setSelected(null);
    setError(c("Check cancelled; imports cleared from the worker.", "核查已取消；导入数据已从工作线程中清除。"));
  };
  const selectedCell = selected && result ? result.cells[selected.row]?.[selected.col] : null;

  return <section className="opsis-quant-correlation" aria-labelledby="opsis-correlation-title">
    <h3 id="opsis-correlation-title">{c("What moved together in this sample?", "此样本中哪些资产共同变化？")}</h3>
    <p>{c("Compare observed daily returns on dates shared by both imports. At least 60 matched returns are required; 120 or more are preferred. No missing day is filled.", "比较两份导入数据共同日期的每日观察收益。至少需要 60 个匹配收益，推荐 120 个以上。不会填补缺失日期。")}</p>
    <button type="button" disabled={busy} onClick={start}>{busy ? c("Checking…", "核查中…") : c("Inspect observed co-movement", "查看观察到的共同变化")}</button>
    {busy && <button type="button" onClick={cancel}>{c("Cancel local check", "取消本地核查")}</button>}
    {error && <p role="alert" className="opsis-error">{error}</p>}
    {result && <>
      <p role="status">{c("Shared daily return window", "共同每日收益窗口")}: {result.commonWindow.startDate} – {result.commonWindow.endDate} · {result.matchedReturns} {c("matched returns", "个匹配收益")} · {result.quoteCurrency}</p>
      {result.matchedReturns < 120 && <p role="note">{c("Fewer than 120 matched returns; co-movement estimates are sample-sensitive.", "匹配收益少于 120 个；共同变化估计对样本敏感。")}</p>}
      <p>{c("A and B identify these exact instruments:", "A 和 B 对应以下确切资产：")} {result.instruments.map((identity, index) => <span key={identity}>{index > 0 ? " · " : ""}{String.fromCharCode(65 + index)} = {datasets[index]?.instrument.symbol} ({identity})</span>)}</p>
      <p>{c("Blue = positive, red = negative, pale = near zero, grey = undefined. Select a cell for its exact values. Correlation describes this sample, not causation or a future relationship.", "蓝色表示正相关，红色表示负相关，浅色表示接近零，灰色表示未定义。选择单元格查看精确数值。相关性仅描述此样本，不表示因果或未来关系。")}</p>
      <div ref={chartRef} style={{ width: "100%", height: 290 }} role="img" aria-label={c("Observed daily-return correlation heatmap; exact values and undefined cells appear in the table below.", "观察到的每日收益相关性热力图；精确数值和未定义单元格见下表。")}/>
      {selectedCell && <p role="status">{c("Selected", "已选择")}: {selectedCell.rowInstrument} / {selectedCell.columnInstrument} · r = {selectedCell.correlation?.toString() ?? c("undefined", "未定义")} · {c("beta against column", "相对于列资产的贝塔")}: {selectedCell.beta?.toString() ?? c("undefined", "未定义")} · n = {selectedCell.observations}</p>}
      <div className="opsis-table-scroll"><table className="opsis-quant-correlation-table">
        <caption>{c("Observed daily-return correlation and directional beta; raw numeric values, with one row per heatmap cell.", "观察到的每日收益相关性和方向贝塔；原始数值，每个热力图单元格对应一行。")}</caption>
        <thead><tr><th>{c("Asset", "资产")}</th><th>{c("Against", "相对于")}</th><th>{c("Matched returns", "匹配收益")}</th><th>{c("Pearson r", "皮尔逊 r")}</th><th>{c("Beta on column", "相对于列资产的贝塔")}</th></tr></thead>
        <tbody>{result.cells.flatMap((row) => row.map((cell) => <tr key={`${cell.rowInstrument}-${cell.columnInstrument}`}><td>{cell.rowInstrument}</td><td>{cell.columnInstrument}</td><td>{cell.observations}</td><td>{cell.correlation?.toString() ?? c("Undefined", "未定义")}</td><td>{cell.beta?.toString() ?? c("Undefined", "未定义")}</td></tr>))}</tbody>
      </table></div>
      <p role="note">{c("User-imported source and identity are unverified; the calculation stays in this browser. Beta is directional and uses the column asset as the comparison series.", "用户导入的来源和资产身份未经验证；计算仅在此浏览器中进行。贝塔具有方向性，以列资产为比较序列。")}</p>
    </>}
  </section>;
}
