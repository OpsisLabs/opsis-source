import { Link } from "react-router";
import { useState, type FormEvent } from "react";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { Position } from "./model";
import {
  candidateValue,
  resolveCandidate,
  type ImportCandidate,
} from "./import";
import type { useStressVaultImport } from "./useStressVaultImport";

type ImporterState = ReturnType<typeof useStressVaultImport>;

export function VaultImportChooser({
  state,
  onImport,
}: {
  state: ImporterState;
  onImport: (positions: Position[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="stress-advanced stress-import"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t("stress.import.open")}</summary>
      {/* Keyed by the lifecycle revision so a lock/hide/idle/clear remounts the
          body and drops any typed passphrase or selection. */}
      <ChooserBody
        key={state.revision}
        state={state}
        onImport={onImport}
        onClose={() => setOpen(false)}
      />
    </details>
  );
}

function ChooserBody({
  state,
  onImport,
  onClose,
}: {
  state: ImporterState;
  onImport: (positions: Position[]) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [passphrase, setPassphrase] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const now = new Date();

  const resolved = state.candidates.map((candidate) =>
    resolveCandidate(candidate, state.manual[candidate.id], now),
  );
  const included = resolved.filter(
    (candidate) =>
      candidate.status === "available" && selected.includes(candidate.id),
  );
  const excluded = resolved.length - included.length;
  const tooMany = included.length > 10;

  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(`${value}T00:00:00Z`))
      : "—";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = passphrase;
    setPassphrase("");
    setSelected([]);
    await state.unlock(value);
  };

  const clear = () => {
    setSelected([]);
    setPassphrase("");
    state.clearPrivateData();
  };

  const confirm = () => {
    const positions: Position[] = included.map((candidate) => ({
      id: candidate.id,
      label: candidate.name,
      value: candidateValue(candidate),
    }));
    if (positions.length === 0 || positions.length > 10) return;
    onClose();
    onImport(positions);
  };

  const evidenceLine = (candidate: ImportCandidate) => {
    if (!candidate.evidence) return null;
    return (
      <p className="stress-import-evidence">
        {t(
          candidate.evidence.sourceKind === "valuation"
            ? "stress.import.evidence.valuation"
            : "stress.import.evidence.reference",
          {
            value: candidate.evidence.value,
            currency: candidate.evidence.currency,
            date: date(candidate.evidence.observedAt),
          },
        )}
        {candidate.evidence.unitBased && (
          <> · {t("stress.import.evidence.unit")}</>
        )}
        {candidate.status === "available" && candidate.stale && (
          <> · {t("stress.import.stale")}</>
        )}
      </p>
    );
  };

  return (
    <>
      <p>{t("stress.import.intro")}</p>

      {state.phase === "loading" && <p>{t("stress.import.loading")}</p>}

      {state.phase === "empty" && (
        <p>
          {t("stress.import.empty")}{" "}
          <Link to="/saved">{t("stress.import.emptyLink")}</Link>
        </p>
      )}

      {state.phase === "locked" && (
        <form
          className="stress-import-unlock"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            {t("stress.import.passphrase")}
            <input
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          <button className="stress-primary" type="submit" disabled={state.busy}>
            {t(state.busy ? "stress.import.unlocking" : "stress.import.unlock")}
          </button>
        </form>
      )}

      {state.error && (
        <p className="stress-compare-error" role="alert">
          {state.error}
        </p>
      )}

      {state.phase === "unlocked" && (
        <div className="stress-import-body">
          <p className="stress-import-counts">
            {t("stress.import.included", { count: included.length })} ·{" "}
            {t("stress.import.excluded", { count: excluded })}
          </p>
          <ul className="stress-import-list">
            {state.candidates.map((candidate, index) => {
              const item = resolved[index];
              return (
                <li key={candidate.id}>
                  <label className="stress-import-choice">
                    <input
                      type="checkbox"
                      checked={selected.includes(candidate.id)}
                      disabled={item.status !== "available"}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, candidate.id]
                            : current.filter((id) => id !== candidate.id),
                        )
                      }
                      aria-label={t("stress.import.select", {
                        asset: candidate.name,
                      })}
                    />
                    <span>
                      {candidate.name}
                      <small>{t("stress.import.selectedValue")}</small>
                    </span>
                  </label>
                  {evidenceLine(candidate)}
                  {item.reason && (
                    <p className="stress-import-reason">
                      {t(
                        `stress.import.reason.${item.reason}` as TranslationKey,
                      )}
                    </p>
                  )}
                  {/* Keep manual entry available for any candidate that needs a
                      user-supplied total, even after it resolves, so it can be
                      corrected. Unrelated selections are preserved. */}
                  {candidate.status === "needs-value" && (
                    <>
                      <div className="stress-import-manual">
                        <label>
                          {t("stress.import.value", {
                            asset: candidate.name,
                          })}
                          <input
                            type="text"
                            inputMode="decimal"
                            maxLength={40}
                            value={state.manual[candidate.id]?.value ?? ""}
                            onChange={(event) =>
                              state.setManualValue(
                                candidate.id,
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          {t("stress.import.date", { asset: candidate.name })}
                          <input
                            type="date"
                            value={state.manual[candidate.id]?.date ?? ""}
                            onChange={(event) =>
                              state.setManualDate(
                                candidate.id,
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </div>
                      {item.status === "available" && (
                        <p className="stress-import-confirmed">
                          {t("stress.import.confirmedValue", {
                            value: item.cents
                              ? candidateValue(item)
                              : "—",
                            date: date(item.observedAt),
                          })}
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {tooMany && (
            <p className="stress-compare-error" role="alert">
              {t("stress.import.tooMany")}
            </p>
          )}
          {included.length === 0 && (
            <p className="stress-scope-note">{t("stress.import.none")}</p>
          )}
          <div className="stress-actions">
            <button
              className="stress-primary"
              disabled={included.length === 0 || tooMany}
              onClick={confirm}
            >
              {t("stress.import.confirm")}
            </button>
            <button onClick={clear}>{t("stress.import.clear")}</button>
          </div>
        </div>
      )}
    </>
  );
}
