import { useEffect, useRef, useState } from "react";
import type { StockGapSeries } from "./stock-gap-series";
import { useCopy } from "./copy";

type SeriesMessage = {
  id: number;
  type: "result" | "error";
  result?: StockGapSeries;
  error?: string;
};

/** One bounded, cancellable, memory-only import path for the Lab and RWA workspaces. */
export function useStockGapImport() {
  const c = useCopy();
  const [series, setSeries] = useState<StockGapSeries | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const generation = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(
    () => () => {
      generation.current += 1;
      workerRef.current?.terminate();
    },
    [],
  );

  const load = async (file: File | undefined) => {
    const id = ++generation.current;
    workerRef.current?.terminate();
    workerRef.current = null;
    setSeries(null);
    setError("");
    setCancelled(false);
    if (!file) {
      setBusy(false);
      return;
    }
    if (file.size > 512_000) {
      setBusy(false);
      setError(
        c(
          "The JSON file exceeds the 512 KB local limit.",
          "JSON 文件超过 512 KB 本地限制。",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const rawJson = await file.text();
      if (generation.current !== id) return;
      const worker = new Worker(
        new URL("./stock-gap-series.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<SeriesMessage>) => {
        if (event.data.id !== id || generation.current !== id) return;
        worker.terminate();
        workerRef.current = null;
        setBusy(false);
        if (event.data.type === "result" && event.data.result)
          setSeries(event.data.result);
        else
          setError(
            event.data.error ||
              c("The series could not be validated.", "无法验证该序列。"),
          );
      };
      worker.onerror = () => {
        if (generation.current !== id) return;
        worker.terminate();
        workerRef.current = null;
        setBusy(false);
        setError(c("The local calculation failed.", "本地计算失败。"));
      };
      worker.postMessage({ id, rawJson });
    } catch (cause) {
      if (generation.current !== id) return;
      setBusy(false);
      setError(
        cause instanceof Error
          ? cause.message
          : c("The file could not be read.", "无法读取文件。"),
      );
    }
  };

  const cancel = () => {
    generation.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setSeries(null);
    setCancelled(true);
    setError(c("Local import cancelled.", "已取消本地导入。"));
  };
  return { series, busy, error, cancelled, load, cancel };
}
