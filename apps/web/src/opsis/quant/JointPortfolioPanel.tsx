import { useCallback, useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { validateDataset, type ExperimentSpec, type JointPortfolioPosition, type JointPortfolioRun, type PriceDataset } from "@rh-chain/quant";
import { useCopy } from "../copy";
import CorrelationPanel from "./CorrelationPanel";

type JointWorkerMessage = {
  id: number;
  type: "joint-result" | "error";
  result?: JointPortfolioRun;
  issues?: Array<{ message: string }>;
};

export default function JointPortfolioPanel({ first, spec, singleInstrumentOnly = false }: { first: PriceDataset; spec: ExperimentSpec; singleInstrumentOnly?: boolean }) {
  const c = useCopy();
  const [additional, setAdditional] = useState<Array<PriceDataset | null>>([]);
  const [weights, setWeights] = useState<number[]>([5000]);
  const [correlationRevision, setCorrelationRevision] = useState(0);
  const [run, setRun] = useState<JointPortfolioRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const activeSpecKey = useRef(JSON.stringify(spec));

  useEffect(() => () => {
    generation.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  useEffect(() => {
    if (!chartRef.current || !run) return;
    const chart = echarts.init(chartRef.current);
    const bands: echarts.SeriesOption[] = ([0.95, 0.8, 0.5] as const).flatMap((confidence) => {
      const name = c(`${confidence * 100}% band`, `${confidence * 100}% 区间`);
      const color = confidence === 0.95 ? "#8cc8ff" : confidence === 0.8 ? "#4f9ee8" : "#1261a0";
      const stack = `joint-${confidence}`;
      return [
        { name: `${name}-base`, type: "line", stack, data: run.bootstrap.path.map((point) => point.bands.find((band) => band.confidence === confidence)!.low), lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, symbol: "none", silent: true, tooltip: { show: false }, legendHoverLink: false },
        { name, type: "line", stack, data: run.bootstrap.path.map((point) => {
          const band = point.bands.find((entry) => entry.confidence === confidence)!;
          return band.high - band.low;
        }), itemStyle: { color }, lineStyle: { opacity: 0 }, areaStyle: { color, opacity: confidence === 0.5 ? 0.24 : confidence === 0.8 ? 0.17 : 0.11 }, symbol: "none", tooltip: { show: false } },
      ];
    });
    chart.setOption({
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: [c("95% band", "95% 区间"), c("80% band", "80% 区间"), c("50% band", "50% 区间"), c("Median", "中位数")] },
      xAxis: { type: "category", data: run.bootstrap.path.map((point) => point.date) },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${(value * 100).toFixed(0)}%` } },
      series: [...bands, { name: c("Median", "中位数"), type: "line", data: run.bootstrap.path.map((point) => point.median), itemStyle: { color: "#123f67" }, lineStyle: { color: "#123f67", width: 3 }, symbol: "none", z: 10 }],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.dispose(); };
  }, [run, c]);

  const resetResult = useCallback(() => {
    generation.current++; workerRef.current?.terminate(); workerRef.current = null; setBusy(false); setRun(null); setConsent(false); setError("");
  }, []);
  const specKey = JSON.stringify(spec);
  useEffect(() => {
    if (activeSpecKey.current === specKey) return;
    activeSpecKey.current = specKey;
    resetResult();
  }, [resetResult, specKey]);

  const loadAdditional = async (slot: number, file: File) => {
    resetResult();
    const id = generation.current;
    setAdditional((current) => current.map((item, index) => index === slot ? null : item));
    setCorrelationRevision((revision) => revision + 1);
    if (file.size > 2_000_000) {
      setError(c("Files are limited to 2 MB for this local run.", "本地运行文件限制为 2 MB。"));
      return;
    }
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const checked = validateDataset(raw);
      if (!checked.ok || !checked.dataset)
        throw new Error(checked.issues.map((issue) => issue.message).join(" "));
      if (id !== generation.current) return;
      const incoming = checked.dataset;
      const identity = (item: PriceDataset) => `${item.instrument.chainId}:${item.instrument.address.toLowerCase()}`;
      if (identity(incoming) === identity(first) || additional.some((item, index) => index !== slot && item && identity(item) === identity(incoming)))
        throw new Error(c("Each instrument must have a distinct chain and contract identity.", "每种资产必须具有不同的链和合约身份。"));
      if (incoming.quoteCurrency !== first.quoteCurrency)
        throw new Error(c("All datasets must use the same quote currency.", "所有数据集必须使用相同的报价货币。"));
      if (incoming.clock !== first.clock)
        throw new Error(c("All datasets must use the same clock.", "所有数据集必须使用相同的时钟。"));
      if (incoming.observations.length !== first.observations.length || incoming.observations.some((row, index) => row.date !== first.observations[index]?.date))
        throw new Error(c("Dates must align exactly; missing days are never filled or intersected silently.", "日期必须完全对齐；不会静默填补或取交集。"));
      setAdditional((current) => current.map((item, index) => index === slot ? incoming : item));
      setCorrelationRevision((revision) => revision + 1);
    } catch (cause) {
      if (id !== generation.current) return;
      setError(cause instanceof Error ? cause.message : c("Could not read this file.", "无法读取此文件。"));
    }
  };

  const assets: Array<{ dataset: PriceDataset; weightIndex: number }> = [{ dataset: first, weightIndex: 0 }, ...additional.flatMap((dataset, slot) => dataset ? [{ dataset, weightIndex: slot + 1 }] : [])];
  const datasets = assets.map(({ dataset }) => dataset);
  const positions: JointPortfolioPosition[] = assets.map(({ dataset, weightIndex }) => ({ dataset, weightBps: weights[weightIndex] ?? 0 }));
  const weightTotal = positions.reduce((sum, position) => sum + position.weightBps, 0);
  const weightsValid = positions.every((position) => Number.isSafeInteger(position.weightBps) && position.weightBps > 0) && weightTotal === 10_000;
  const start = () => {
    if (singleInstrumentOnly || datasets.length < 2 || !weightsValid) return;
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
    setRun(null);
    setBusy(true);
    setConsent(false);
    setError("");
    worker.onmessage = (event: MessageEvent<JointWorkerMessage>) => {
      if (event.data.id !== id || generation.current !== id) return;
      worker.terminate();
      workerRef.current = null;
      setBusy(false);
      if (event.data.type !== "joint-result" || !event.data.result) {
        setError(event.data.issues?.map((issue) => issue.message).join(" ") || c("Joint run refused.", "联合运行已被拒绝。"));
        return;
      }
      setRun(event.data.result);
    };
    worker.onerror = () => {
      if (generation.current !== id) return;
      worker.terminate();
      workerRef.current = null;
      setBusy(false);
      setError(c("The local worker failed before producing a result.", "本地工作线程未能生成结果。"));
    };
    worker.postMessage({
      id,
      kind: "joint",
      positions,
      spec,
    });
  };

  const cancel = () => {
    generation.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setRun(null);
    setConsent(false);
    setError(c("Run cancelled. Inputs cleared from the worker.", "运行已取消。工作线程中的输入已清除。"));
  };

  const changeWeight = (index: number, value: number) => {
    resetResult();
    setWeights((current) => current.map((weight, i) => i === index ? value : weight));
  };
  const addSlot = () => { if (additional.length < 7) { resetResult(); setAdditional((current) => [...current, null]); setWeights((current) => [...current, current.length === 1 ? 5000 : 1]); } };
  const removeSlot = (slot: number) => {
    resetResult(); setAdditional((current) => current.filter((_, index) => index !== slot));
    setWeights((current) => current.filter((_, index) => index !== slot + 1));
    setCorrelationRevision((revision) => revision + 1);
  };

  const download = () => {
    if (!run || !consent) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), datasets, run }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `opsis-joint-quant-${run.manifest.inputRefs[0]!.datasetHash.slice(0, 12)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="opsis-panel" aria-labelledby="opsis-joint-title">
    <h2 id="opsis-joint-title">{c("Joint portfolio experiment", "联合投资组合实验")}</h2>
    <p>{c("Add 1–7 additional local JSON datasets. Dates, clock and quote currency must match exactly. The worker resamples the same historical days for all instruments, preserving observed co-movement. No file or weight is uploaded.", "添加 1–7 个本地 JSON 数据集。日期、时钟和报价货币必须完全匹配。工作线程为所有资产重采样相同的历史日期，以保留观察到的共同变化。文件和权重不会上传。")}</p>
    {singleInstrumentOnly && <p role="status">{c("Joint portfolio runs require a historical resampling model. Switch to IID or contiguous return blocks to run; imported datasets and weights are retained.", "联合投资组合运行需要历史重采样模型。请切换到 IID 或连续收益区块后运行；已导入的数据集和权重会保留。")}</p>}
    <p>{first.instrument.symbol} · {c("first asset", "第一资产")} · {first.observations.length} {c("observations", "条观察")}</p>
    <div className="opsis-quant-fields">
      {assets.map(({ dataset, weightIndex }) => <label key={weightIndex}>{weightIndex === 0 ? c("First asset weight (basis points)", "第一资产权重（基点）") : `${dataset.instrument.symbol} · ${c("weight (basis points)", "权重（基点）")}`}
        <input aria-label={weightIndex === 0 ? c("First asset weight (basis points)", "第一资产权重（基点）") : `${dataset.instrument.symbol} ${c("weight (basis points)", "权重（基点）")}`} type="number" min="1" max="10000" step="1" value={weights[weightIndex] ?? 1} onChange={(event) => changeWeight(weightIndex, Number(event.target.value))} />
      </label>)}
      {additional.map((dataset, slot) => <div className="opsis-quant-fields" key={`upload-${slot}`}>
        <label>{c(`Additional asset ${slot + 1} JSON`, `附加资产 ${slot + 1} JSON`)}
          <input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadAdditional(slot, file); }} />
        </label>
        <button type="button" onClick={() => removeSlot(slot)}>{c("Remove asset", "移除资产")}</button>
        {dataset && <p role="status">{dataset.instrument.symbol} · {dataset.observations.length} {c("observations", "条观察")}</p>}
      </div>)}
    </div>
    {additional.length < 7 && <button type="button" onClick={addSlot}>{c("Add another dataset", "再添加一个数据集")}</button>}
    <p role="status" aria-live="polite">{c("Weights", "权重")}: {weightTotal.toLocaleString()} / 10,000 {c("basis points", "基点")}{!weightsValid && datasets.length >= 2 ? ` · ${c("Positive integer weights must total exactly 10,000.", "正整数权重总和必须恰好为 10,000。")}` : ""}</p>
    {datasets.length >= 2 && additional.every(Boolean) && <CorrelationPanel key={correlationRevision} datasets={datasets} />}
    <p>{c("Daily constant-mix rebalancing; no fees or taxes. Synthetic files are examples, not market history. Pointwise bands are scenarios, not forecasts.", "每日固定权重再平衡；不含费用或税费。合成文件仅为示例，不是市场历史。逐点区间是情景而非预测。")}</p>
    <button type="button" disabled={singleInstrumentOnly || datasets.length < 2 || additional.some((item) => item === null) || busy || !weightsValid} onClick={start}>{busy ? c("Running…", "运行中…") : c("Run joint portfolio locally", "在本地运行联合投资组合")}</button>
    {busy && <button type="button" onClick={cancel}>{c("Cancel and clear worker", "取消并清除工作线程")}</button>}
    {error && <p role="alert" className="opsis-error">{error}</p>}
    {run && <>
      <p role="status">{run.manifest.model}{run.manifest.blockLength === undefined ? "" : ` (${run.manifest.blockLength}d)`} · seed {run.manifest.seed} · {run.manifest.bootstrapRuns} {c("paths", "条路径")} · {run.manifest.inputRefs.map((ref) => `${ref.instrument} ${ref.weightBps}bp`).join(" / ")}</p>
      <p role="note">{run.manifest.inputRefs.some((ref) => ref.synthetic)
        ? c("SYNTHETIC EXAMPLE / NOT MARKET HISTORY", "合成示例／非市场历史")
        : c("USER IMPORT / PROVENANCE NOT VERIFIED", "用户导入／来源未经验证")}</p>
      {run.manifest.researchMode && <p role="note">{c("SHORT-WINDOW RESEARCH: tail estimates are unstable.", "短窗口研究：尾部估计不稳定。")}</p>}
      {run.stats.warnings.length > 0 && <p role="note">{c("Tail sample count is below 20; tail interpretation is unstable.", "尾部样本数少于 20；尾部解释不稳定。")}</p>}
      <div className="opsis-quant-metrics">
        <div><span>{c("Observed portfolio return", "观察到的投资组合收益")}</span><strong>{(run.stats.totalReturn * 100).toFixed(2)}%</strong></div>
        <div><span>{c("Annualized volatility", "年化波动率")}</span><strong>{(run.stats.volatilityAnnualized * 100).toFixed(2)}%</strong></div>
        <div><span>{c("Max drawdown", "最大回撤")}</span><strong>{(run.stats.maxDrawdown * 100).toFixed(2)}%</strong></div>
        <div><span>{c("Tail count", "尾部数量")}</span><strong>{run.stats.tailCount}</strong></div>
      </div>
      <div ref={chartRef} className="opsis-quant-joint-chart" role="img" aria-label={c("Joint portfolio pointwise fan chart with 50%, 80% and 95% bands; all values appear in the table below", "联合投资组合逐点扇形图，显示 50%、80%、95% 区间；全部数值见下表")} />
      <div className="opsis-table-scroll opsis-quant-fan-scroll"><table className="opsis-quant-fan-table">
        <caption>{c("Every simulated step; normalized wealth ratios rounded to four decimals (full precision in export)", "每个模拟步骤；标准化财富比率保留四位小数（导出为完整精度）")}</caption>
        <thead><tr><th>{c("Step", "步骤")}</th><th>{c("50% low", "50% 下界")}</th><th>{c("50% high", "50% 上界")}</th><th>{c("80% low", "80% 下界")}</th><th>{c("80% high", "80% 上界")}</th><th>{c("95% low", "95% 下界")}</th><th>{c("95% high", "95% 上界")}</th><th>{c("Median", "中位数")}</th></tr></thead>
        <tbody>{run.bootstrap.path.map((point) => <tr key={point.date}><td>{point.date}</td>{([0.5, 0.8, 0.95] as const).flatMap((confidence) => { const band = point.bands.find((entry) => entry.confidence === confidence)!; return [<td key={`${confidence}-low`}>{band.low.toFixed(4)}</td>, <td key={`${confidence}-high`}>{band.high.toFixed(4)}</td>]; })}<td>{point.median.toFixed(4)}</td></tr>)}</tbody>
      </table></div>
      <ul>{run.manifest.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      <label className="opsis-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{c("I consent to download all local datasets, weights and manifest.", "我同意下载所有本地数据集、权重和清单。")}</label>
      <button type="button" disabled={!consent} onClick={download}>{c("Export joint manifest", "导出联合清单")}</button>
    </>}
  </section>;
}
