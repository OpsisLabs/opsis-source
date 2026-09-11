import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import {
  compareAllocations,
  outcomeComparison,
  rowsFromScenario,
  type ComparableRow,
  type WeightInput,
} from "./compare";
import { applyMoves, type ParsedMove } from "./scenario";

const COLORS = ["#fa6c34", "#d8b778", "#7ebbae", "#9c9bc0"];

export function ComparisonPanel({
  rows,
  weights,
  moves,
  onChange,
  onEven,
  onReset,
}: {
  rows: ComparableRow[];
  weights: WeightInput[];
  moves: ParsedMove[] | null;
  onChange: (weights: WeightInput[]) => void;
  onEven: () => void;
  onReset: () => void;
}) {
  const { t, locale } = useI18n();
  const money = (value: bigint) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(value) / 100);
  const percent = (bps: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      bps / 100,
    );
  const signedMoney = (value: bigint) =>
    `${value > 0n ? "+" : value < 0n ? "−" : ""}${money(
      value < 0n ? -value : value,
    )}`;

  let comparison: ReturnType<typeof compareAllocations> | null = null;
  let errorCode = "";
  try {
    comparison = compareAllocations(rows, weights);
  } catch (cause) {
    const code =
      cause instanceof Error &&
      ["positions", "identity", "weightValue", "weightSum", "value"].includes(
        cause.message,
      )
        ? cause.message
        : "positions";
    errorCode = code;
  }

  let outcome: ReturnType<typeof outcomeComparison> | null = null;
  if (comparison && moves) {
    const currentAfter = rowsFromScenario(applyMoves(rows, moves).rows);
    const proposedRows: ComparableRow[] = comparison.rows.map((row) => ({
      id: row.id,
      label: row.label,
      cents: row.proposedCents,
    }));
    const proposedAfter = rowsFromScenario(
      applyMoves(proposedRows, moves).rows,
    );
    outcome = outcomeComparison(comparison, currentAfter, proposedAfter);
  }

  const allFlat = !moves || moves.every((move) => move.percent === 0);
  const identicalAllocation =
    comparison !== null &&
    comparison.rows.every((row) => row.deltaCents === 0n);
  const noDifference = outcome !== null && outcome.difference === 0n;

  const reasonKey = !outcome
    ? null
    : !noDifference
      ? "stress.compare.reason"
      : allFlat
        ? "stress.compare.reasonFlatAllFlat"
        : identicalAllocation
          ? "stress.compare.reasonFlatIdentical"
          : "stress.compare.reasonFlatEqual";

  const setWeight = (index: number, value: string) => {
    onChange(
      weights.map((weight, position) =>
        position === index ? { ...weight, weight: value } : weight,
      ),
    );
  };

  return (
    <section
      className="stress-panel stress-compare"
      aria-labelledby="stress-compare-title"
      data-testid="stress-compare"
    >
      <div className="stress-compare-head">
        <div>
          <p className="stress-kicker">{t("stress.compare.eyebrow")}</p>
          <h2 id="stress-compare-title">{t("stress.compare.title")}</h2>
          <p>{t("stress.compare.intro")}</p>
        </div>
        <div className="stress-actions">
          <button onClick={onEven}>{t("stress.compare.even")}</button>
          <button onClick={onReset}>{t("stress.compare.reset")}</button>
        </div>
      </div>

      <div className="stress-compare-editor">
        {rows.map((row, index) => (
          <label key={row.id}>
            {t("stress.compare.weight", { asset: row.label })}
            <input
              type="text"
              inputMode="decimal"
              maxLength={6}
              value={weights[index]?.weight ?? ""}
              aria-invalid={
                errorCode === "weightValue" || errorCode === "weightSum"
                  ? true
                  : undefined
              }
              onChange={(event) => setWeight(index, event.target.value)}
            />
          </label>
        ))}
      </div>

      {errorCode && (
        <p className="stress-compare-error" role="alert">
          {t(`stress.compare.error.${errorCode}` as TranslationKey)}
        </p>
      )}

      {comparison && outcome && (
        <div className="stress-compare-outcome">
          <h3>{t("stress.compare.outcome")}</h3>
          <dl>
            <div>
              <dt>{t("stress.compare.currentEnds")}</dt>
              <dd>{money(outcome.currentAfter)}</dd>
            </div>
            <div>
              <dt>{t("stress.compare.proposedEnds")}</dt>
              <dd>{money(outcome.proposedAfter)}</dd>
            </div>
            <div className="stress-compare-difference">
              <dt>{t("stress.compare.difference")}</dt>
              <dd
                data-testid="stress-compare-difference"
                className={
                  outcome.difference > 0n
                    ? "stress-positive"
                    : outcome.difference < 0n
                      ? "stress-negative"
                      : undefined
                }
              >
                {signedMoney(outcome.difference)}
              </dd>
            </div>
          </dl>
          <p>
            {t(
              outcome.difference > 0n
                ? "stress.compare.differenceUp"
                : outcome.difference < 0n
                  ? "stress.compare.differenceDown"
                  : "stress.compare.differenceFlat",
              {
                amount: money(
                  outcome.difference < 0n
                    ? -outcome.difference
                    : outcome.difference,
                ),
              },
            )}
          </p>
          {reasonKey === "stress.compare.reason" ? (
            <p data-testid="stress-compare-reason">
              {t("stress.compare.reason", {
                asset: outcome.largest?.label ?? "—",
                amount: signedMoney(outcome.largest?.plDelta ?? 0n),
              })}
            </p>
          ) : (
            reasonKey && (
              <p data-testid="stress-compare-reason">{t(reasonKey)}</p>
            )
          )}
          <p className="stress-compare-constant">
            {t("stress.compare.heldConstant", {
              amount: money(comparison.totalCents),
            })}
          </p>
          <p className="stress-result-limit">{t("stress.compare.notAdvice")}</p>
        </div>
      )}

      {comparison && (
        <>
          <div className="stress-compare-mixes">
            {(
              [
                ["stress.compare.current", "current"],
                ["stress.compare.proposed", "proposed"],
              ] as const
            ).map(([labelKey, kind]) => (
              <div key={kind}>
                <p>{t(labelKey)}</p>
                <div className="stress-stack" aria-hidden="true">
                  {comparison!.rows.map((row, index) => (
                    <span
                      key={row.id}
                      style={{
                        flexGrow:
                          kind === "current"
                            ? Number(row.currentCents)
                            : Number(row.proposedCents),
                        background: COLORS[index % COLORS.length],
                      }}
                    />
                  ))}
                </div>
                <ul className="stress-mix-legend">
                  {comparison!.rows.map((row, index) => (
                    <li key={row.id}>
                      <i
                        style={{ background: COLORS[index % COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span>{row.label}</span>
                      <span>
                        {percent(
                          kind === "current"
                            ? row.currentBps
                            : row.proposedBps,
                        )}
                        %
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <details className="stress-compare-table">
            <summary>{t("stress.compare.details")}</summary>
            <div
              className="stress-table-wrap"
              tabIndex={0}
              role="region"
              aria-label={t("stress.compare.details")}
            >
              <table>
                <thead>
                  <tr>
                    <th>{t("stress.position")}</th>
                    <th>{t("stress.compare.current")}</th>
                    <th>{t("stress.compare.proposed")}</th>
                    <th>{t("stress.compare.shift")}</th>
                    <th>{t("stress.compare.value")}</th>
                    <th>{t("stress.compare.allocChange")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.label}</th>
                      <td>{percent(row.currentBps)}%</td>
                      <td>{percent(row.proposedBps)}%</td>
                      <td
                        className={
                          row.deltaBps > 0
                            ? "stress-positive"
                            : row.deltaBps < 0
                              ? "stress-negative"
                              : undefined
                        }
                      >
                        {row.deltaBps > 0 ? "+" : ""}
                        {percent(row.deltaBps)} pp
                      </td>
                      <td>{money(row.proposedCents)}</td>
                      <td
                        className={
                          row.deltaCents > 0n
                            ? "stress-positive"
                            : row.deltaCents < 0n
                              ? "stress-negative"
                              : undefined
                        }
                      >
                        {signedMoney(row.deltaCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
