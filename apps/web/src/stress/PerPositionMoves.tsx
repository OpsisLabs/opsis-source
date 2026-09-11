import { useI18n } from "../i18n";
import type { ComparableRow } from "./compare";
import type { Scenario } from "./scenario";

export function PerPositionMoves({
  enabled,
  onToggle,
  rows,
  moves,
  scenario,
  error,
  onChange,
  onFocus,
}: {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  rows: ComparableRow[];
  moves: Record<string, string>;
  scenario: Scenario | null;
  error: string;
  onChange: (id: string, value: string) => void;
  onFocus: () => void;
}) {
  const { t, locale } = useI18n();
  const money = (value: bigint) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(value) / 100);
  const signedMoney = (value: bigint) =>
    `${value > 0n ? "+" : value < 0n ? "−" : ""}${money(
      value < 0n ? -value : value,
    )}`;
  const percent = (bps: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      bps / 100,
    );
  const pattern = /^[+-]?\d{1,3}$/;
  const invalid = (value: string) =>
    !pattern.test(value) || Math.abs(Number(value)) > 100;

  return (
    <details className="stress-advanced">
      <summary
        onClick={() => {
          onFocus();
        }}
      >
        {t("stress.moves.advanced")}
      </summary>
      <label className="stress-moves-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {t("stress.moves.toggle")}
      </label>
      {enabled && (
        <>
          <p className="stress-scope-note">{t("stress.moves.assumptions")}</p>
          {error && (
            <p className="stress-compare-error" role="alert">
              {error}
            </p>
          )}
          <div className="stress-moves-editor">
            {rows.map((row) => (
              <label key={row.id}>
                {t("stress.moves.label", { asset: row.label })}
                <input
                  type="text"
                  inputMode="text"
                  maxLength={4}
                  value={moves[row.id] ?? "0"}
                  aria-invalid={invalid(moves[row.id] ?? "0")}
                  onChange={(event) => onChange(row.id, event.target.value)}
                />
              </label>
            ))}
          </div>
          {scenario && (
            <div className="stress-contributions">
              <h3>{t("stress.moves.contributions")}</h3>
              <ul>
                {scenario.rows.map((row) => (
                  <li key={row.id}>
                    <span className="stress-contrib-name">{row.label}</span>
                    <span
                      className={
                        row.delta > 0n
                          ? "stress-positive"
                          : row.delta < 0n
                            ? "stress-negative"
                            : undefined
                      }
                    >
                      {signedMoney(row.delta)}
                    </span>
                    <span>{percent(row.contributionBps)}%</span>
                    <span className="stress-contrib-bar" aria-hidden="true">
                      <i
                        style={{ width: `${row.contributionBps / 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              {scenario.movedCount === 0 && (
                <p className="stress-scope-note">{t("stress.moves.none")}</p>
              )}
            </div>
          )}
        </>
      )}
    </details>
  );
}
