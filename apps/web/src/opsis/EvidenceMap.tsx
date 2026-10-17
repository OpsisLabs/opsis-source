import { useState } from "react";
import { safeHttpUrl } from "../dashboard/adapters";
import { useCopy } from "./copy";

type Finding = { fact: string; sourceIds: string[] };
type Source = {
  id: string;
  provider: string;
  url: string | null;
  fetchedAt: string;
  description?: string;
  label?: string;
};
export default function EvidenceMap({
  findings,
  sources,
}: {
  findings: Finding[];
  sources: Source[];
}) {
  const c = useCopy();
  const [selected, setSelected] = useState(0);
  const current = findings[selected] ?? findings[0];
  if (!current) return null;
  const linked = sources.filter((source) =>
    current.sourceIds.includes(source.id),
  );
  return (
    <section
      className="opsis-evidence-map"
      aria-label={c("Evidence map", "证据地图")}
    >
      <div className="opsis-visual-title">
        <p className="opsis-kicker">{c("FOLLOW THE EVIDENCE", "追溯证据")}</p>
        <span>{c("Select a finding", "选择一项发现")}</span>
      </div>
      <div className="opsis-evidence-flow">
        <div
          className="opsis-evidence-nodes"
          role="group"
          aria-label={c("Findings", "发现")}
        >
          {findings.map((finding, index) => (
            <button
              key={index}
              aria-pressed={current === finding}
              onClick={() => setSelected(index)}
            >
              <span className="opsis-kicker">0{index + 1}</span>
              <span>{finding.fact}</span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
        <div className="opsis-evidence-sources" aria-live="polite">
          <p className="opsis-kicker">
            {c("LINKED SOURCES", "关联来源")} / {linked.length}
          </p>
          {linked.map((source) => (
            <article key={source.id}>
              <span className="opsis-source-dot" aria-hidden="true" />
              <div>
                <strong>{source.provider}</strong>
                <p>{source.description ?? source.label ?? source.id}</p>
                <time>{source.fetchedAt}</time>
                {safeHttpUrl(source.url) && (
                  <a
                    href={safeHttpUrl(source.url)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c("Inspect source ↗", "查看来源 ↗")}
                  </a>
                )}
              </div>
            </article>
          ))}
          {!linked.length && (
            <p>
              {c(
                "No matching source was supplied. Evidence is incomplete.",
                "未提供匹配的来源。证据不完整。",
              )}
            </p>
          )}
          {current.sourceIds.some(
            (id) => !sources.some((source) => source.id === id),
          ) && (
            <p className="opsis-small">
              {c(
                "Some referenced sources are unavailable.",
                "部分引用来源不可用。",
              )}
            </p>
          )}
        </div>
      </div>
      <details>
        <summary>{c("Evidence as a table", "证据表格")}</summary>
        <div className="opsis-table-scroll" tabIndex={0} role="region" aria-label={c("Evidence as a table", "证据表格")}>
          <table>
            <thead>
              <tr>
                <th>{c("Finding", "发现")}</th>
                <th>{c("Source IDs", "来源标识")}</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding, index) => (
                <tr key={index}>
                  <td>{finding.fact}</td>
                  <td>
                    {finding.sourceIds.join(", ") || c("Unknown", "未知")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
