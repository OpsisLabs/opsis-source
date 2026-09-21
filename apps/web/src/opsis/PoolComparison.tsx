import { useState } from "react";
import type { ExitCheckQuote } from "../exit-check/api";
import { useCopy } from "./copy";
import { relativeBar } from "./visual-model";

export default function PoolComparison({ result }: { result: ExitCheckQuote }) {
  const c = useCopy();
  const rows = result.coverage.poolsQuoted;
  const [selected, setSelected] = useState(0);
  if (!rows.length || !result.output) return null;
  const current = rows[selected] ?? rows[0];
  return (
    <section
      className="opsis-pool-comparison"
      aria-label={c("Observed pool comparison", "已观察资金池比较")}
    >
      <div className="opsis-visual-title">
        <p className="opsis-kicker">
          {c("ONE SIZE / OBSERVED POOLS", "一个数量 / 已观察资金池")}
        </p>
        <span>{result.output.symbol}</span>
      </div>
      <div
        className="opsis-bar-list"
        role="group"
        aria-label={c("Select a pool", "选择资金池")}
      >
        {rows.map((row, index) => (
          <button
            key={row.pool}
            aria-pressed={current === row}
            onClick={() => setSelected(index)}
          >
            <span className="opsis-bar-head">
              <span>
                {row.fee / 10_000}% {c("fee tier", "费率档位")}
              </span>
              <strong>{row.amountOutDisplay}</strong>
            </span>
            <span className="opsis-bar-track" aria-hidden="true">
              <span
                style={{
                  width: `${relativeBar(
                    row.amountOut,
                    rows.map((r) => r.amountOut),
                  )}%`,
                }}
              />
            </span>
          </button>
        ))}
      </div>
      <p className="opsis-small">
        {c("Selected pool", "选中资金池")}{" "}
        <span className="opsis-identity">{current.pool}</span>
      </p>
      <p className="opsis-small">
        {c(
          "Relative bar lengths compare outputs at your single entered amount. This is not a depth curve. Failed and missing pools are excluded, not zero.",
          "相对柱长比较单次输入数量下的输出，不是深度曲线。失败和缺失的资金池被排除，而非记为零。",
        )}
      </p>
      <details>
        <summary>{c("Exact pool outputs", "精确资金池输出")}</summary>
        <div className="opsis-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{c("Pool", "资金池")}</th>
                <th>{c("Fee tier", "费率档位")}</th>
                <th>{result.output.symbol}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.pool}>
                  <td className="opsis-identity">{row.pool}</td>
                  <td>{row.fee / 10_000}%</td>
                  <td>{row.amountOutDisplay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
