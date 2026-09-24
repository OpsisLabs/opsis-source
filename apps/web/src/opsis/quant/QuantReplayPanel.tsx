import { useEffect, useRef, useState } from "react";
import { useCopy } from "../copy";

interface ReplaySummary {
  kind: "single" | "joint";
  model: string;
  seed: number;
  runs: number;
  horizon: number;
  inputs: number;
  terminalMedian: number;
}

type ReplayMessage = {
  id: number;
  type: "replay-result" | "replay-error" | "error";
  summary?: ReplaySummary;
  message?: string;
  issues?: Array<{ message: string }>;
};

export default function QuantReplayPanel() {
  const c = useCopy();
  const workerRef = useRef<Worker | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReplaySummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => {
    generation.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const load = async (file: File) => {
    const id = ++generation.current;
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setSummary(null);
    setError("");
    if (file.size > 2_000_000) {
      setError(c("Exports are limited to 2 MB for local replay.", "本地重放导出文件限制为 2 MB。"));
      return;
    }
    try {
      const rawJson = await file.text();
      if (generation.current !== id) return;
      const worker = new Worker(new URL("./quant.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      setBusy(true);
      worker.onmessage = (event: MessageEvent<ReplayMessage>) => {
        if (event.data.id !== id || generation.current !== id) return;
        worker.terminate();
        workerRef.current = null;
        setBusy(false);
        if (event.data.type === "replay-result" && event.data.summary) {
          setSummary(event.data.summary);
          return;
        }
        setError(event.data.message ?? event.data.issues?.map((issue) => issue.message).join(" ") ?? c("Replay could not be verified.", "无法验证重放结果。"));
      };
      worker.onerror = () => {
        if (generation.current !== id) return;
        worker.terminate();
        workerRef.current = null;
        setBusy(false);
        setError(c("The local replay worker failed.", "本地重放工作线程失败。"));
      };
      worker.postMessage({ id, kind: "replay", rawJson });
    } catch {
      if (generation.current !== id) return;
      setBusy(false);
      setError(c("Could not read this export or start the local worker.", "无法读取此导出文件或启动本地工作线程。"));
    }
  };

  const cancel = () => {
    generation.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setSummary(null);
    setError(c("Replay cancelled; file cleared from the worker.", "重放已取消；文件已从工作线程中清除。"));
  };

  return <details className="opsis-panel">
    <summary>{c("Verify an exported Quant run", "验证导出的量化运行")}</summary>
    <p>{c("Choose a Lab JSON export. A local worker reruns its embedded dataset(s), model, seed and weights, then compares every stored result field. The file is not uploaded.", "选择实验室 JSON 导出文件。本地工作线程使用其中的数据集、模型、种子和权重重新运行，然后比较每个已存储的结果字段。文件不会上传。")}</p>
    <label>{c("Exported run JSON", "导出的运行 JSON")}
      <input type="file" accept=".json,application/json" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void load(file);
      }} />
    </label>
    {busy && <button type="button" onClick={cancel}>{c("Cancel local replay", "取消本地重放")}</button>}
    {error && <p role="alert" className="opsis-error">{error}</p>}
    {summary && <div role="status">
      <strong>{c("Replay matches the exported result.", "重放结果与导出结果一致。")}</strong>
      <p>{summary.kind === "joint" ? c("Joint portfolio", "联合投资组合") : c("Single instrument", "单一资产")} · {summary.inputs} {c("input(s)", "个输入")} · {summary.model} · {c("seed", "种子")} {summary.seed} · {summary.runs} {c("paths", "条路径")} · {summary.horizon} {c("steps", "个步骤")}</p>
      <p>{c("Recomputed terminal median (normalized wealth)", "重新计算的终点中位数（标准化财富）")}: {summary.terminalMedian.toString()}</p>
    </div>}
    <p role="note">{c("Replay checks consistency of this file, not the authenticity, rights or freshness of its data source. A modified file can be recomputed and exported again.", "重放仅检查此文件的一致性，不验证数据来源的真实性、使用权或时效性。修改后的文件可以重新计算并再次导出。")}</p>
  </details>;
}
