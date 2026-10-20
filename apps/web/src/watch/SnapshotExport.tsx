import { useState } from "react";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import { useCopy } from "../opsis/copy";
import { snapshotCsv, snapshotFilename, snapshotJson } from "./snapshot-export";

export function SnapshotExport({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const c = useCopy();
  const [failed, setFailed] = useState(false);
  const download = (format: "csv" | "json") => {
    setFailed(false);
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      const content = format === "csv" ? snapshotCsv(snapshot, c) : snapshotJson(snapshot, c);
      url = URL.createObjectURL(new Blob([content], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
      }));
      link.href = url;
      link.download = snapshotFilename(snapshot, format);
      document.body.appendChild(link);
      link.click();
    } catch {
      setFailed(true);
    } finally {
      link.remove();
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
    }
  };
  return (
    <section className="watch-panel" aria-label={c("Export snapshot", "导出快照")}>
      <h3>{c("Export snapshot", "导出快照")}</h3>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="watch-button" onClick={() => download("csv")}>
          {c("Export CSV", "导出 CSV")}
        </button>
        <button type="button" className="watch-button" onClick={() => download("json")}>
          {c("Export JSON", "导出 JSON")}
        </button>
      </div>
      <p className="watch-small">{c("Exported in your browser. Nothing is uploaded.", "在您的浏览器中导出。不会上传任何内容。")}</p>
      {failed && <p className="watch-small" role="alert">{c("Download could not start. Try exporting again.", "无法开始下载。请重试导出。")}</p>}
    </section>
  );
}
