import { useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  RotateCcw,
  Plus,
  Trash2,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import { examplePositions, stress, type Position, type Shock } from "./model";
import { StressReceipt } from "./StressReceipt";
import { StressDial } from "./StressDial";
import { StressExplanation } from "./StressExplanation";
import { ComparisonPanel } from "./ComparisonPanel";
import { PerPositionMoves } from "./PerPositionMoves";
import { VaultImportChooser } from "./VaultImportChooser";
import { useStressVaultImport } from "./useStressVaultImport";
import {
  deriveWeights,
  evenWeights,
  type ComparableRow,
  type WeightInput,
} from "./compare";
import {
  applyMoves,
  parseMoves,
  shockToMoves,
  type ParsedMove,
  type Scenario,
} from "./scenario";
import "./stress.css";

export default function StressTest() {
  const { t, locale } = useI18n();
  const [positions, setPositions] = useState<Position[]>(() =>
    examplePositions("concentrated"),
  );
  const [source, setSource] = useState<"example" | "manual" | "imported">(
    "example",
  );
  const [imported, setImported] = useState(false);
  const [shock, setShock] = useState<Shock>({
    scope: "single",
    percent: -40,
    positionId: "asset-a",
  });
  const [custom, setCustom] = useState(false);
  const [percentInput, setPercentInput] = useState("-40");
  const [editing, setEditing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [compareOpen, setCompareOpen] = useState(false);
  const [proposed, setProposed] = useState<WeightInput[] | null>(null);
  const nextId = useRef(10);
  const editor = useRef<HTMLElement>(null);

  const vaultImport = useStressVaultImport(() => {
    if (!imported) return;
    setImported(false);
    setPositions(examplePositions("concentrated"));
    setSource("example");
    setCustom(false);
    setProposed(null);
    setAdvanced(false);
    setMoves({});
    setShock({ scope: "single", percent: -40, positionId: "asset-a" });
    setPercentInput("-40");
  });

  const money = (value: bigint) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(value) / 100);
  const pct = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const invalidPercent =
    !/^[+-]?\d{1,3}$/.test(percentInput) ||
    Math.abs(Number(percentInput)) > 100;
  const stressError = (cause: unknown): string => {
    const code =
      cause instanceof Error &&
      ["positions", "identity", "value", "total", "shock"].includes(
        cause.message,
      )
        ? cause.message
        : "value";
    return t(`stress.error.${code}` as TranslationKey);
  };

  // The position base is parsed independently of the simple percentage field so
  // per-position mode stays usable even while the hidden simple input is empty
  // or invalid.
  let baseResult: ReturnType<typeof stress> | null = null;
  let baseError = "";
  try {
    baseResult = stress(positions, {
      scope: "all",
      percent: 0,
      positionId: "",
    });
  } catch (cause) {
    baseError = stressError(cause);
  }

  let simpleResult: ReturnType<typeof stress> | null = null;
  let error = "";
  try {
    if (invalidPercent) throw new Error("shock");
    simpleResult = stress(positions, shock);
  } catch (cause) {
    error = stressError(cause);
  }

  const comparable: ComparableRow[] | null = baseResult
    ? baseResult.rows.map((row) => ({
        id: row.id,
        label: row.label,
        cents: row.before,
      }))
    : null;

  let parsedMoves: ParsedMove[] | null = null;
  let scenario: Scenario | null = null;
  let movesError = "";
  if (advanced && comparable) {
    try {
      parsedMoves = parseMoves(
        comparable,
        comparable.map((row) => ({
          id: row.id,
          move: moves[row.id] ?? "0",
        })),
      );
      scenario = applyMoves(comparable, parsedMoves);
    } catch (cause) {
      const code =
        cause instanceof Error &&
        ["identity", "moves", "moveValue"].includes(cause.message)
          ? cause.message
          : "moveValue";
      movesError = t(
        (code === "moveValue"
          ? "stress.error.moveValue"
          : "stress.error.moves") as TranslationKey,
      );
    }
  }

  const active = advanced ? scenario : simpleResult;
  const activeError = advanced ? (comparable ? movesError : baseError) : error;
  const activeMoves: ParsedMove[] | null = comparable
    ? advanced
      ? parsedMoves
      : simpleResult
        ? shockToMoves(comparable, shock)
        : null
    : null;
  const weights = proposed ?? (comparable ? deriveWeights(comparable) : []);

  const identityChange = (next: Position[]) => {
    setPositions(next);
    setProposed(null);
    setMoves({});
  };
  const example = (kind: "concentrated" | "spread") => {
    const rows = examplePositions(kind);
    identityChange(rows);
    setSource("example");
    setCustom(false);
    setShock((value) => ({ ...value, positionId: rows[0].id }));
  };
  const edit = (id: string, patch: Partial<Position>) => {
    setCustom(true);
    setSource("manual");
    setPositions((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };
  const remove = (id: string) => {
    setCustom(true);
    setSource("manual");
    const remaining = positions.filter((row) => row.id !== id);
    identityChange(remaining);
    if (shock.positionId === id)
      setShock({ ...shock, positionId: remaining[0]?.id ?? "" });
  };
  const applyImport = (next: Position[]) => {
    identityChange(next);
    setSource("imported");
    setImported(true);
    setCustom(true);
    setAdvanced(false);
    setShock({ scope: "single", percent: -40, positionId: next[0]?.id ?? "" });
    setPercentInput("-40");
    vaultImport.markImported();
    vaultImport.close();
  };
  const revealEditor = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      editor.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      editor.current?.focus({ preventScroll: true });
    });
  };
  const selected = positions.find((row) => row.id === shock.positionId);
  const updatePercent = (percent: number) => {
    setPercentInput(String(percent));
    setShock((current) => ({ ...current, percent }));
  };
  const colors = ["#fa6c34", "#d8b778", "#7ebbae", "#9c9bc0"];
  const signed = (value: number) => `${value > 0 ? "+" : ""}${pct(value)}`;
  const signature = JSON.stringify({ positions, shock, locale });
  const exportBlocked = advanced || compareOpen;

  return (
    <div className="stress-page">
      <header className="stress-heading" id="stress-top" tabIndex={-1}>
        <p className="stress-kicker">{t("stress.eyebrow")}</p>
        <h1>{t("stress.title")}</h1>
        <p>{t("stress.intro")}</p>
        <p className="stress-context">{t("stress.context")}</p>
      </header>
      <div
        className="stress-examples"
        role="group"
        aria-label={t("stress.examples")}
      >
        <span className="stress-badge">
          {source === "imported"
            ? t("stress.import.badge")
            : custom
              ? t("stress.custom")
              : t("stress.example")}
        </span>
        <div className="stress-actions">
          <button onClick={() => example("concentrated")}>
            {t("stress.concentrated")}
          </button>
          <button onClick={() => example("spread")}>
            {t("stress.spread")}
          </button>
          <button className="stress-primary" onClick={revealEditor}>
            {t("stress.edit")}
          </button>
          <button
            aria-expanded={compareOpen}
            onClick={() => setCompareOpen((value) => !value)}
          >
            {t(compareOpen ? "stress.compare.close" : "stress.compare.open")}
          </button>
        </div>
      </div>
      {compareOpen && comparable && (
        <ComparisonPanel
          rows={comparable}
          weights={weights}
          moves={activeMoves}
          onChange={setProposed}
          onEven={() => setProposed(evenWeights(comparable))}
          onReset={() => setProposed(null)}
        />
      )}
      {active && (
        <section className="stress-mix" aria-labelledby="stress-mix-title">
          <div>
            <h2 id="stress-mix-title" className="stress-step">
              <span aria-hidden="true">01</span>
              {t("stress.mix")}
            </h2>
            <p className="stress-mix-total">
              {money(active.before)} <span>USD</span>
            </p>
          </div>
          <div>
            <div className="stress-stack" aria-hidden="true">
              {active.rows.map((row, i) => (
                <span
                  key={row.id}
                  style={{
                    flexGrow: Number(row.before),
                    background: colors[i % colors.length],
                  }}
                />
              ))}
            </div>
            <ul className="stress-mix-legend">
              {active.rows.map((row, i) => (
                <li key={row.id}>
                  <i
                    style={{ background: colors[i % colors.length] }}
                    aria-hidden="true"
                  />
                  <span>{row.label}</span>
                  <span>{pct(row.shareBps / 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {active && (
        <div className="stress-mobile-summary" aria-hidden="true">
          <div>
            <span>{t("stress.after")}</span>
            <strong>{money(active.after)}</strong>
          </div>
          <strong
            className={
              active.delta < 0n
                ? "stress-negative"
                : active.delta > 0n
                  ? "stress-positive"
                  : ""
            }
          >
            {signed(active.changeBps / 100)}%
          </strong>
        </div>
      )}
      <div className="stress-grid">
        <section
          className="stress-panel stress-controls"
          aria-labelledby="stress-controls-title"
        >
          <h2 id="stress-controls-title" className="stress-step">
            <span aria-hidden="true">02</span>
            {t("stress.change")}
          </h2>
          {!advanced && (
            <>
              <fieldset>
                <legend>{t("stress.scope")}</legend>
                <div className="stress-segment">
                  <button
                    aria-pressed={shock.scope === "single"}
                    onClick={() =>
                      setShock({
                        ...shock,
                        scope: "single",
                        positionId: selected?.id ?? positions[0]?.id ?? "",
                      })
                    }
                  >
                    {t("stress.single")}
                  </button>
                  <button
                    aria-pressed={shock.scope === "all"}
                    onClick={() => setShock({ ...shock, scope: "all" })}
                  >
                    {t("stress.all")}
                  </button>
                </div>
              </fieldset>
              <div className="stress-control-fields">
                {shock.scope === "single" && (
                  <label>
                    {t("stress.choose")}
                    <select
                      value={shock.positionId}
                      onChange={(e) =>
                        setShock({ ...shock, positionId: e.target.value })
                      }
                    >
                      {positions.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label || "—"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label htmlFor="stress-percent">
                  {t("stress.typePercent")}
                  <input
                    id="stress-percent"
                    type="text"
                    inputMode="text"
                    maxLength={4}
                    value={percentInput}
                    aria-invalid={
                      !/^[+-]?\d{1,3}$/.test(percentInput) ||
                      Math.abs(Number(percentInput)) > 100
                    }
                    aria-describedby="stress-dial-help"
                    onChange={(event) => {
                      const text = event.target.value;
                      setPercentInput(text);
                      if (
                        /^[+-]?\d{1,3}$/.test(text) &&
                        Math.abs(Number(text)) <= 100
                      )
                        setShock({ ...shock, percent: Number(text) });
                    }}
                  />
                </label>
              </div>
              <StressDial
                value={shock.percent}
                label={t("stress.move")}
                description="stress-dial-help"
                onChange={updatePercent}
              />
              <p id="stress-dial-help" className="stress-dial-help">
                {t("stress.dialHelp")}
              </p>
              <div className="stress-presets">
                {[-50, -30, 0, 30].map((value) => (
                  <button
                    key={value}
                    aria-pressed={shock.percent === value}
                    onClick={() => updatePercent(value)}
                  >
                    {value === 0 ? t("stress.flat") : `${signed(value)}%`}
                  </button>
                ))}
              </div>
              <p className="stress-scope-note">
                {shock.scope === "all"
                  ? t("stress.everyFalls", { percent: signed(shock.percent) })
                  : t("stress.oneMoves", {
                      asset: selected?.label || "—",
                      percent: signed(shock.percent),
                    })}
              </p>
            </>
          )}
          <PerPositionMoves
            enabled={advanced}
            onToggle={(value) => {
              setAdvanced(value);
              if (value && comparable && Object.keys(moves).length === 0)
                setMoves(
                  Object.fromEntries(
                    comparable.map((row) => [
                      row.id,
                      shock.scope === "single" && row.id !== shock.positionId
                        ? "0"
                        : String(shock.percent),
                    ]),
                  ),
                );
            }}
            rows={comparable ?? []}
            moves={moves}
            scenario={scenario}
            error={movesError}
            onChange={(id, value) =>
              setMoves((current) => ({ ...current, [id]: value }))
            }
            onFocus={() => undefined}
          />
        </section>
        <section
          className="stress-panel stress-result"
          aria-label={t("stress.result")}
        >
          {active ? (
            <>
              <h2 className="stress-step">
                <span aria-hidden="true">03</span>
                {t("stress.seeImpact")}
              </h2>
              <p>{t("stress.after")}</p>
              <output className="stress-total" data-testid="stress-after">
                {money(active.after)}
              </output>
              <div
                className={`stress-impact ${active.delta < 0n ? "stress-negative" : active.delta > 0n ? "stress-positive" : ""}`}
              >
                {active.delta < 0n ? (
                  <ArrowDownRight size={25} aria-hidden />
                ) : active.delta > 0n ? (
                  <ArrowUpRight size={25} aria-hidden />
                ) : (
                  <Minus size={25} aria-hidden />
                )}
                <output data-testid="stress-impact">
                  {signed(active.changeBps / 100)}%
                </output>
                <span>{t("stress.impact")}</span>
              </div>
              <p
                className="stress-change-amount"
                data-testid="stress-change-amount"
              >
                {t(
                  active.delta < 0n
                    ? "stress.amountDown"
                    : active.delta > 0n
                      ? "stress.amountUp"
                      : "stress.amountFlat",
                  {
                    amount: money(
                      active.delta < 0n ? -active.delta : active.delta,
                    ),
                  },
                )}
              </p>
              <div className="stress-value-bars">
                <div>
                  <span>{t("stress.before")}</span>
                  <strong>{money(active.before)}</strong>
                </div>
                <div className="stress-bar">
                  <i
                    style={{
                      width: `${(Number(active.before) / Number(active.before > active.after ? active.before : active.after)) * 100}%`,
                    }}
                  />
                </div>
                <div>
                  <span>{t("stress.after")}</span>
                  <strong>{money(active.after)}</strong>
                </div>
                <div className="stress-bar stress-bar-after">
                  <i
                    style={{
                      width: `${(Number(active.after) / Number(active.before > active.after ? active.before : active.after)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <p className="stress-result-limit">{t("stress.notForecast")}</p>
            </>
          ) : (
            <div className="stress-invalid" role="alert">
              <h2>{t("stress.editTitle")}</h2>
              <p>{activeError}</p>
              <button
                onClick={
                  invalidPercent && !advanced
                    ? () => document.getElementById("stress-percent")?.focus()
                    : revealEditor
                }
              >
                {t(
                  invalidPercent && !advanced
                    ? "stress.typePercent"
                    : "stress.edit",
                )}
              </button>
            </div>
          )}
        </section>
      </div>
      {!advanced && simpleResult && (
        <StressExplanation result={simpleResult} shock={shock} />
      )}
      <details className="stress-panel stress-breakdown">
        <summary id="stress-breakdown-title">{t("stress.details")}</summary>
        {active ? (
          <div
            className="stress-table-wrap"
            tabIndex={0}
            role="region"
            aria-labelledby="stress-breakdown-title"
          >
            <table>
              <thead>
                <tr>
                  <th>{t("stress.position")}</th>
                  <th>{t("stress.startWeight")}</th>
                  <th>{t("stress.before")}</th>
                  <th>{t("stress.after")}</th>
                  <th>{t("stress.delta")}</th>
                </tr>
              </thead>
              <tbody>
                {active.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    <td>{pct(row.shareBps / 100)}%</td>
                    <td>{money(row.before)}</td>
                    <td>{money(row.after)}</td>
                    <td
                      className={
                        row.delta < 0n ? "stress-negative" : "stress-positive"
                      }
                    >
                      {row.delta > 0n ? "+" : ""}
                      {money(row.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{activeError}</p>
        )}
      </details>
      {editing && (
        <section
          ref={editor}
          tabIndex={-1}
          className="stress-panel stress-editor"
          aria-labelledby="stress-editor-title"
        >
          <h2 id="stress-editor-title">{t("stress.editTitle")}</h2>
          <p>{t("stress.editIntro")}</p>
          {positions.length === 0 && <p>{t("stress.empty")}</p>}
          {positions.map((row, i) => (
            <div className="stress-edit-row" key={row.id}>
              <label>
                {t("stress.label", { number: i + 1 })}
                <input
                  maxLength={40}
                  value={row.label}
                  onChange={(e) => edit(row.id, { label: e.target.value })}
                />
              </label>
              <label>
                {t("stress.value", { number: i + 1 })}
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={14}
                  value={row.value}
                  onChange={(e) => edit(row.id, { value: e.target.value })}
                  aria-invalid={
                    !/^\d+(?:\.\d{1,2})?$/.test(row.value) ||
                    Number(row.value) > 1000000000
                  }
                />
              </label>
              <button
                aria-label={t("stress.remove", { number: i + 1 })}
                onClick={() => remove(row.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          <div className="stress-actions">
            <button
              className="stress-primary"
              disabled={!active}
              onClick={() => {
                setEditing(false);
                document.getElementById("stress-top")?.focus();
              }}
            >
              {t("stress.done")}
            </button>
            <button
              disabled={positions.length >= 10}
              onClick={() => {
                const id = `p${nextId.current++}`;
                identityChange([
                  ...positions,
                  {
                    id,
                    label: t("stress.newAsset", {
                      number: positions.length + 1,
                    }),
                    value: "0",
                  },
                ]);
                setSource("manual");
                setCustom(true);
                if (!positions.length) setShock({ ...shock, positionId: id });
              }}
            >
              <Plus size={17} />
              {t("stress.add")}
            </button>
            <button
              onClick={() => {
                identityChange([]);
                setSource("manual");
                setCustom(true);
              }}
            >
              <Trash2 size={17} />
              {t("stress.clear")}
            </button>
            <button onClick={() => example("concentrated")}>
              <RotateCcw size={17} />
              {t("stress.reset")}
            </button>
          </div>
        </section>
      )}
      <VaultImportChooser state={vaultImport} onImport={applyImport} />
      {imported && (
        <div className="stress-import-status">
          <p role="status">
            {t("stress.import.confirmed", { count: positions.length })}
          </p>
          <button onClick={() => vaultImport.clearPrivateData()}>
            {t("stress.import.clearImported")}
          </button>
        </div>
      )}
      {simpleResult && !exportBlocked && (
        <StressReceipt
          key={signature}
          result={simpleResult}
          shock={shock}
          custom={custom}
        />
      )}
      {exportBlocked && (
        <section
          className="stress-panel stress-receipt stress-receipt-disabled"
          aria-label={t("stress.receipt.title")}
        >
          <h2>{t("stress.receipt.title")}</h2>
          <p>{t("stress.receipt.disabledAdvanced")}</p>
        </section>
      )}
      <details className="stress-method">
        <summary>{t("stress.method")}</summary>
        <p>{t("stress.methodBody")}</p>
      </details>
      <p className="stress-privacy">{t("stress.privacy")}</p>
    </div>
  );
}
