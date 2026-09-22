import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  exportRun,
  realizedStats,
  parseCsv,
  validateDataset,
  type ExperimentSpec,
  type PriceDataset,
  type QuantRun,
} from "@rh-chain/quant";
import { useCopy } from "../copy";
import "./quant.css";

type WorkerMessage = {
  id: number;
  type: "result" | "error";
  datasetHash?: string;
  result?: Omit<QuantRun, "datasetHash">;
  issues?: Array<{ message: string }>;
};
type StoredRun = QuantRun & { dataset: PriceDataset };

export default function QuantWorkbench() {
  const c = useCopy();
  const [dataset, setDataset] = useState<PriceDataset | null>(null);
  const [fileError, setFileError] = useState("");
  const [source, setSource] = useState("User supplied local file");
  const [chainId, setChainId] = useState("4663");
  const [address, setAddress] = useState("");
  const [symbol, setSymbol] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [researchMode, setResearchMode] = useState(false);
  const [runs, setRuns] = useState(180);
  const [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<StoredRun | null>(null);
  const [history, setHistory] = useState<StoredRun[]>([]);
  const [consent, setConsent] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const messageId = useRef(0);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setDataset(null);
    },
    [],
  );
  useEffect(() => {
    if (!chartRef.current || !run) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption({
      animation: false,
      tooltip: { trigger: "axis" },
      legend: {
        data: [c("Median", "中位数"), c("Pointwise band", "逐点区间")],
      },
      xAxis: { type: "category", data: run.bootstrap.path.map((p) => p.date) },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
      },
      series: [
        {
          name: "band-base",
          tooltip: { show: false },
          type: "line",
          stack: "confidence",
          data: run.bootstrap.path.map((p) => p.low),
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          symbol: "none",
          silent: true,
        },
        {
          name: c("Pointwise band", "逐点区间"),
          tooltip: { show: false },
          type: "line",
          stack: "confidence",
          data: run.bootstrap.path.map((p) => p.high - p.low),
          lineStyle: { opacity: 0 },
          areaStyle: { color: "#8cc8ff", opacity: 0.25 },
          symbol: "none",
        },
        {
          name: c("Median", "中位数"),
          type: "line",
          data: run.bootstrap.path.map((p) => p.median),
          lineStyle: { color: "#1261a0", width: 2 },
          symbol: "none",
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [run, c]);

  const metadata = (): Omit<PriceDataset, "observations"> => ({
    schemaVersion: 1,
    instrument: {
      chainId: Number(chainId),
      address: address.trim(),
      symbol: symbol.trim(),
    },
    quoteCurrency: quoteCurrency.trim().toUpperCase(),
    clock: "daily_crypto_24_7",
    provenance: { source: source.trim(), observedAt: new Date().toISOString() },
  });
  const loadFile = async (file: File) => {
    const generation = ++messageId.current;
    setConsent(false);
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setFileError("");
    setRun(null);
    setDataset(null);
    if (file.size > 2_000_000) {
      setFileError(
        c(
          "Files are limited to 2 MB for this local run.",
          "本地运行文件限制为 2 MB。",
        ),
      );
      return;
    }
    try {
      const text = await file.text();
      const loaded = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(text, metadata())
        : (JSON.parse(text) as PriceDataset);
      const check = validateDataset(loaded);
      if (!check.ok)
        throw new Error(check.issues.map((issue) => issue.message).join(" "));
      if (!check.dataset)
        throw new Error(
          c(
            "Dataset did not produce a clean validated copy.",
            "数据集未生成通过验证的副本。",
          ),
        );
      if (generation !== messageId.current) return;
      setDataset(check.dataset);
      setConsent(false);
    } catch (error) {
      if (generation !== messageId.current) return;
      setDataset(null);
      setFileError(
        error instanceof Error
          ? error.message
          : c("Could not read this file.", "无法读取该文件。"),
      );
    }
  };
  const startRun = () => {
    if (!dataset) return;
    workerRef.current?.terminate();
    let worker: Worker;
    try {
      worker = new Worker(new URL("./quant.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setBusy(false);
      setRun(null);
      setFileError(c("The local worker could not start.", "本地工作线程无法启动。"));
      return;
    }
    workerRef.current = worker;
    const id = ++messageId.current;
    setConsent(false);
    setRun(null);
    setBusy(true);
    setFileError("");
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== id || messageId.current !== id) return;
      setBusy(false);
      worker.terminate();
      workerRef.current = null;
      if (
        event.data.type === "error" ||
        !event.data.result ||
        !event.data.datasetHash
      ) {
        setFileError(
          event.data.issues?.map((x) => x.message).join(" ") ??
            c("Run refused.", "运行被拒绝。"),
        );
        return;
      }
      const next = {
        dataset,
        datasetHash: event.data.datasetHash,
        ...event.data.result,
      } as StoredRun;
      setRun(next);
      setConsent(false);
      setHistory((current) =>
        [
          next,
          ...current.filter(
            (item) =>
              item.datasetHash !== next.datasetHash ||
              item.manifest.seed !== next.manifest.seed,
          ),
        ].slice(0, 2),
      );
    };
    worker.onerror = () => {
      if (messageId.current !== id) return;
      setBusy(false);
      worker.terminate();
      workerRef.current = null;
      setFileError(
        c(
          "The local worker failed before producing a result.",
          "本地工作线程未能生成结果。",
        ),
      );
    };
    const spec: ExperimentSpec = {
      bootstrapRuns: runs,
      seed: seed,
      confidence: 0.9,
      researchMode,
    };
    worker.postMessage({ id, dataset, spec });
  };
  const cancel = () => {
    messageId.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setFileError(
      c(
        "Run cancelled. Input cleared from the worker.",
        "运行已取消。工作线程中的输入已清除。",
      ),
    );
  };
  const download = () => {
    if (!run || !consent) return;
    const blob = new Blob([exportRun(run.dataset, run)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `opsis-quant-${run.datasetHash.slice(0, 12)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const observed = useMemo(() => {
    if (!dataset) return null;
    try {
      return { stats: realizedStats(dataset), error: "" };
    } catch (error) {
      return {
        stats: null,
        error:
          error instanceof Error ? error.message : "Statistics unavailable",
      };
    }
  }, [dataset]);
  return (
    <section
      className="opsis-quant-workbench"
      aria-label={c("Quant research workflow", "量化研究工作流")}
    >
      <div className="opsis-section-label">
        <span>QUANT / LOCAL RESEARCH</span>
        <span>{c("Input stays in memory", "输入仅留在内存")}</span>
      </div>
      <div
        className="opsis-quant-steps"
        aria-label={c("Workflow steps", "工作流步骤")}
      >
        <span>01 {c("Dataset", "数据集")}</span>
        <span>02 {c("Experiment", "实验")}</span>
        <span>03 {c("Run", "运行")}</span>
        <span>04 {c("Results", "结果")}</span>
        <span>05 {c("Compare / Export", "比较 / 导出")}</span>
      </div>
      <div className="opsis-quant-grid">
        <div className="opsis-panel">
          <h2>{c("1. Define the dataset", "1. 定义数据集")}</h2>
          <p>
            {c(
              "Provide closed daily crypto observations with an exact chain-qualified instrument. JSON carries metadata; CSV uses the fields below.",
              "提供完整的每日加密观察数据和精确的链限定资产。JSON 自带元数据；CSV 使用以下字段。",
            )}
          </p>
          <label>
            {c("CSV or JSON file", "CSV 或 JSON 文件")}
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
          </label>
          <div className="opsis-quant-fields">
            <label>
              Chain ID
              <input
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              {c("Contract / address", "合约 / 地址")}
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label>
              {c("Symbol", "符号")}
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </label>
            <label>
              {c("Quote currency", "报价货币")}
              <input
                value={quoteCurrency}
                onChange={(e) => setQuoteCurrency(e.target.value)}
              />
            </label>
            <label>
              {c("Source", "来源")}
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </label>
          </div>
          {dataset && (
            <p role="status">
              {dataset.instrument.symbol} · {dataset.observations.length}{" "}
              {c("observations loaded", "条观察已载入")}
            </p>
          )}
          {fileError && (
            <p role="alert" className="opsis-error">
              {fileError}
            </p>
          )}
        </div>
        <div className="opsis-panel">
          <h2>{c("2. Set the experiment", "2. 设置实验")}</h2>
          <p>
            {c(
              "Historical IID bootstrap resamples observed daily returns. The band is pointwise evidence, never a prediction.",
              "历史 IID 自助法重采样已观察的每日收益。区间是逐点证据，不是预测。",
            )}
          </p>
          <label>
            {c("Bootstrap runs", "自助法次数")}
            <input
              type="number"
              min="1"
              max="2000"
              value={runs}
              onChange={(e) => setRuns(Number(e.target.value))}
            />
          </label>
          <label>
            {c("Seed", "种子")}
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
            />
          </label>
          <label className="opsis-check">
            <input
              type="checkbox"
              checked={researchMode}
              onChange={(e) => setResearchMode(e.target.checked)}
            />
            {c(
              "Short-window research mode (limits shown)",
              "短窗口研究模式（显示限制）",
            )}
          </label>
          <button type="button" disabled={!dataset || busy} onClick={startRun}>
            {busy
              ? c("Running…", "运行中…")
              : c("Run local experiment", "运行本地实验")}
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              {c("Cancel and clear worker", "取消并清除工作线程")}
            </button>
          )}
        </div>
      </div>
      {observed && (
        <div className="opsis-panel">
          <h2>{c("Observed daily risk", "观察到的每日风险")}</h2>
          {observed.stats ? (
            <p>
              {c("Daily returns", "每日收益数")}: {observed.stats.returns} ·{" "}
              {c("Total return", "总收益")}:{" "}
              {(observed.stats.totalReturn * 100).toFixed(2)}% ·{" "}
              {c("Annualized volatility (365 days)", "年化波动率（365 天）")}:{" "}
              {(observed.stats.volatilityAnnualized * 100).toFixed(2)}% ·{" "}
              {c("Maximum drawdown", "最大回撤")}:{" "}
              {(observed.stats.maxDrawdown * 100).toFixed(2)}%
            </p>
          ) : (
            <p role="alert">{observed.error}</p>
          )}
        </div>
      )}
      {run && (
        <>
          <div className="opsis-panel">
            <h2>{c("4. Results", "4. 结果")}</h2>
            <p>
              {run.dataset.synthetic
                ? c(
                    "SYNTHETIC EXAMPLE / NOT MARKET HISTORY",
                    "合成示例／非市场历史",
                  )
                : c(
                    "USER IMPORT / PROVENANCE NOT VERIFIED",
                    "用户导入／来源未经验证",
                  )}
            </p>
            <p>
              {c(
                "Normalized wealth: 1 = initial value (100%). Simulated steps are not dated observations or forecasts.",
                "归一化财富：1 = 初始价值（100%）。模拟步骤不是带日期的观察或预测。",
              )}
            </p>
            {run.manifest.researchMode && (
              <p role="note">
                {c(
                  "SHORT-WINDOW RESEARCH: below the default history standard; cannot establish stable tail behavior.",
                  "短窗口研究：低于默认历史标准；无法确定稳定的尾部行为。",
                )}
              </p>
            )}
            {run.stats.warnings.length > 0 && (
              <p role="note">
                {c(
                  "Tail sample count is below 20; tail interpretation is unstable.",
                  "尾部样本数少于 20；尾部解释不稳定。",
                )}
              </p>
            )}
            <p>
              {run.dataset.instrument.symbol} · {run.datasetHash.slice(0, 16)}…
              · {run.manifest.model} · seed {run.manifest.seed}
            </p>
            <div className="opsis-quant-metrics">
              <div>
                <span>{c("Total return", "总收益")}</span>
                <strong>{(run.stats.totalReturn * 100).toFixed(2)}%</strong>
              </div>
              <div>
                <span>{c("Annualized volatility", "年化波动率")}</span>
                <strong>
                  {(run.stats.volatilityAnnualized * 100).toFixed(2)}%
                </strong>
              </div>
              <div>
                <span>{c("Max drawdown", "最大回撤")}</span>
                <strong>{(run.stats.maxDrawdown * 100).toFixed(2)}%</strong>
              </div>
              <div>
                <span>{c("Tail count", "尾部数量")}</span>
                <strong>{run.stats.tailCount}</strong>
              </div>
            </div>
            <div
              ref={chartRef}
              style={{ height: 280, width: "100%" }}
              aria-label={c(
                "Pointwise bootstrap bands chart",
                "逐点自助法区间图",
              )}
            />
            <div className="opsis-table-scroll">
              <table>
                <caption>
                  {c(
                    "Sampled simulation steps; wealth ratios rounded to four decimals (all values in export)",
                    "模拟步骤抽样；财富比率保留四位小数（导出包含全部数值）",
                  )}
                </caption>
                <thead>
                  <tr>
                    <th>{c("Step", "步骤")}</th>
                    <th>{c("Low", "下界")}</th>
                    <th>{c("Median", "中位数")}</th>
                    <th>{c("High", "上界")}</th>
                  </tr>
                </thead>
                <tbody>
                  {run.bootstrap.path
                    .filter(
                      (_, i) =>
                        i === 0 ||
                        i === run.bootstrap.path.length - 1 ||
                        i %
                          Math.max(
                            1,
                            Math.floor(run.bootstrap.path.length / 12),
                          ) ===
                          0,
                    )
                    .map((point) => (
                      <tr key={point.date}>
                        <td>{point.date}</td>
                        <td>{point.low.toFixed(4)}</td>
                        <td>{point.median.toFixed(4)}</td>
                        <td>{point.high.toFixed(4)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <ul>
              {run.manifest.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
          <div className="opsis-panel">
            <h2>{c("5. Compare or export", "5. 比较或导出")}</h2>
            {history.length > 1 && (
              <div className="opsis-table-scroll">
                <table>
                  <caption>
                    {c("At most two local runs", "最多两个本地运行")}
                  </caption>
                  <tbody>
                    {history.map((item) => (
                      <tr key={`${item.datasetHash}-${item.manifest.seed}`}>
                        <th>
                          {item.datasetHash.slice(0, 12)}… / seed{" "}
                          {item.manifest.seed}
                        </th>
                        <td>
                          {item.bootstrap.terminal.median.toFixed(4)}{" "}
                          {c("terminal median", "终端中位数")}
                        </td>
                        <td>
                          {item.manifest.bootstrapRuns} {c("paths", "路径")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <label className="opsis-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {c(
                "I consent to download this manifest and local dataset.",
                "我同意下载此清单和本地数据集。",
              )}
            </label>
            <button type="button" disabled={!consent} onClick={download}>
              {c("Export manifest", "导出清单")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
