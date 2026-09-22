import type { ExitCheckQuote } from "../exit-check/api";
import { useState } from "react";
import { useCopy } from "./copy";
import "./ExitSizeCurve.css";

export default function ExitSizeCurve({
  result,
  outputSymbol,
}: {
  result: ExitCheckQuote;
  outputSymbol: string;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState(0);
  if (!result.curve) return null;
  const usable = result.curve.points.filter(
    (point) => point.status === "ok" && point.amountOutDisplay !== null,
  );
  const maxOutput = usable.reduce(
    (max, point) => Math.max(max, Number(point.amountOutDisplay)),
    0,
  );
  const maxInput = usable.reduce(
    (max, point) => Math.max(max, Number(point.amount)),
    0,
  );
  const pointCoordinates = usable.map((point) => ({
    point,
    x: maxInput ? (Number(point.amount) / maxInput) * 280 + 10 : 10,
    y: maxOutput
      ? 110 - (Number(point.amountOutDisplay) / maxOutput) * 90
      : 110,
  }));
  return (
    <section className="opsis-curve" aria-labelledby="exit-size-curve-title">
      <h3 id="exit-size-curve-title">{c("Exit size curve", "退出数量曲线")}</h3>
      <p className="opsis-small">
        {c(
          "Every point was quoted against the same block and pool snapshot. Unknown points stay unavailable.",
          "每个点都基于同一区块和资金池快照报价。未知点保持不可用。",
        )}
      </p>
      <svg
        className="opsis-curve-plot"
        viewBox="0 0 300 125"
        role="img"
        aria-label={c(
          "Actual output by input size, quoted points only",
          "按输入数量显示实际输出，仅显示报价点",
        )}
      >
        <line x1="10" y1="110" x2="290" y2="110" />
        <line x1="10" y1="10" x2="10" y2="110" />
        <text x="12" y="9" className="opsis-curve-axis">
          {result.output?.symbol ?? "output"}
        </text>
        <text x="250" y="123" className="opsis-curve-axis">
          {c("input size", "输入数量")}
        </text>
        {pointCoordinates.map(({ point, x, y }) => (
          <circle
            key={point.rawAmount}
            cx={x}
            cy={y}
            r={selected === result.curve!.points.indexOf(point) ? 5 : 3}
            className="opsis-curve-point"
          />
        ))}
      </svg>
      <div
        className="opsis-curve-select"
        role="group"
        aria-label={c("Select a curve point", "选择曲线点")}
      >
        {result.curve.points.map((point, index) => (
          <button
            key={point.rawAmount}
            type="button"
            className="opsis-curve-point-button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {point.amount}
          </button>
        ))}
      </div>
      {result.curve.points[selected] && (
        <p className="opsis-small">
          {c("Selected point", "已选点")}:{" "}
          {result.curve.points[selected]!.amount} →{" "}
          {result.curve.points[selected]!.amountOutDisplay ??
            c("Unavailable", "不可用")}
        </p>
      )}
      <div className="opsis-curve-table">
        <table>
          <caption className="sr-only">
            {c("Observed output by entered size", "按输入数量显示观察到的输出")}
          </caption>
          <thead>
            <tr>
              <th>{c("Input", "输入")}</th>
              <th>{c("Output", "输出")}</th>
              <th>{c("Impact", "影响")}</th>
              <th>{c("Pool", "资金池")}</th>
            </tr>
          </thead>
          <tbody>
            {result.curve.points.map((point) => (
              <tr key={point.rawAmount}>
                <th scope="row">{point.amount}</th>
                <td>
                  {point.status === "ok"
                    ? `${point.amountOutDisplay} ${outputSymbol}`
                    : c("Unavailable", "不可用")}
                </td>
                <td>
                  {point.status === "ok" && point.priceImpactPercent !== null
                    ? `${point.priceImpactPercent}%`
                    : "—"}
                </td>
                <td>{point.pool?.fee ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="opsis-receipt">
        {c(
          "This is a read-only observation, not a sellability or execution guarantee. Gas and other network costs are separate.",
          "这是只读观察，不保证可卖出或可执行。Gas 和其他网络费用另计。",
        )}
      </p>
    </section>
  );
}
