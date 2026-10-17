import { useState } from "react";
import { useCopy } from "./copy";
import { decimalBars } from "./visual-model";

type Row = { id: string; label: string; value: string; detail: string };
export default function QuantityBars({
  rows,
  title,
  unit,
  note,
}: {
  rows: Row[];
  title: string;
  unit: string;
  note: string;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState<string | null>(null);
  const active = rows.find((row) => row.id === selected) ?? rows.at(-1);
  const ratios = decimalBars(rows.map((row) => row.value));
  if (!active || !ratios) return null;
  return (
    <section className="opsis-quantity-visual" aria-label={title}>
      <div className="opsis-visual-title">
        <p className="opsis-kicker">{title}</p>
        <span>{unit}</span>
      </div>
      <div
        className="opsis-column-chart"
        role="group"
        aria-label={c("Select an observation", "选择观察记录")}
      >
        {rows.map((row, index) => (
          <button
            key={row.id}
            aria-pressed={row === active}
            aria-label={`${row.label}: ${row.value} ${unit}`}
            onClick={() => setSelected(row.id)}
          >
            <span className="opsis-column-space" aria-hidden="true">
              <span style={{ height: `${ratios[index]}%` }} />
            </span>
            <span>{row.label}</span>
          </button>
        ))}
      </div>
      <div className="opsis-chart-readout" aria-live="polite">
        <strong>
          {active.value} <small>{unit}</small>
        </strong>
        <p>{active.detail}</p>
      </div>
      <p className="opsis-small">{note}</p>
      <details>
        <summary>{c("View exact data", "查看精确数据")}</summary>
        <div className="opsis-table-scroll" tabIndex={0} role="region" aria-label={c("Exact data", "精确数据")}>
          <table>
            <thead>
              <tr>
                <th>{c("Observation", "观察记录")}</th>
                <th>{unit}</th>
                <th>{c("Context", "背景")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
