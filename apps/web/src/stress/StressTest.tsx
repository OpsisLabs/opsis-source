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
import "./stress.css";

export default function StressTest() {
  const { t, locale } = useI18n();
  const [positions, setPositions] = useState<Position[]>(() =>
    examplePositions("concentrated"),
  );
  const [shock, setShock] = useState<Shock>({
    scope: "single",
    percent: -40,
    positionId: "asset-a",
  });
  const [custom, setCustom] = useState(false);
  const [editing, setEditing] = useState(false);
  const nextId = useRef(10);
  const editor = useRef<HTMLElement>(null);
  const money = (value: bigint) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(value) / 100);
  const pct = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  let result: ReturnType<typeof stress> | null = null;
  let error = "";
  try {
    result = stress(positions, shock);
  } catch (cause) {
    const code =
      cause instanceof Error &&
      ["positions", "identity", "value", "total", "shock"].includes(
        cause.message,
      )
        ? cause.message
        : "value";
    error = t(`stress.error.${code}` as TranslationKey);
  }
  const example = (kind: "concentrated" | "spread") => {
    const rows = examplePositions(kind);
    setPositions(rows);
    setCustom(false);
    setShock((value) => ({ ...value, positionId: rows[0].id }));
  };
  const edit = (id: string, patch: Partial<Position>) => {
    setCustom(true);
    setPositions((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };
  const remove = (id: string) => {
    setCustom(true);
    const remaining = positions.filter((row) => row.id !== id);
    setPositions(remaining);
    if (shock.positionId === id)
      setShock({ ...shock, positionId: remaining[0]?.id ?? "" });
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
  const signed = (value: number) => `${value > 0 ? "+" : ""}${pct(value)}`;
  const signature = JSON.stringify({ positions, shock, locale });
  return (
    <div className="stress-page">
      <header className="stress-heading">
        <p className="stress-kicker">{t("stress.eyebrow")}</p>
        <h1>{t("stress.title")}</h1>
        <p>{t("stress.intro")}</p>
      </header>
      <div
        className="stress-examples"
        role="group"
        aria-label={t("stress.examples")}
      >
        <span className="stress-badge">
          {custom ? t("stress.custom") : t("stress.example")}
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
        </div>
      </div>
      {result && (
        <div className="stress-mobile-summary" aria-hidden="true">
          <div>
            <span>{t("stress.after")}</span>
            <strong>{money(result.after)}</strong>
          </div>
          <strong
            className={
              result.delta < 0n
                ? "stress-negative"
                : result.delta > 0n
                  ? "stress-positive"
                  : ""
            }
          >
            {signed(result.changeBps / 100)}%
          </strong>
        </div>
      )}
      <div className="stress-grid">
        <section
          className="stress-panel stress-controls"
          aria-labelledby="stress-controls-title"
        >
          <h2 id="stress-controls-title">{t("stress.change")}</h2>
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
          <label className="stress-slider-label" htmlFor="stress-shock">
            {t("stress.move")}
            <span
              className={
                shock.percent < 0 ? "stress-negative" : "stress-positive"
              }
            >
              {signed(shock.percent)}%
            </span>
          </label>
          <input
            id="stress-shock"
            type="range"
            min="-100"
            max="100"
            step="1"
            value={shock.percent}
            onChange={(e) =>
              setShock({ ...shock, percent: Number(e.target.value) })
            }
            aria-valuetext={`${signed(shock.percent)}%`}
          />
          <div className="stress-scale" aria-hidden="true">
            <span>−100%</span>
            <span>0%</span>
            <span>+100%</span>
          </div>
          <div className="stress-presets">
            {[-50, -30, 0, 30].map((value) => (
              <button
                key={value}
                aria-pressed={shock.percent === value}
                onClick={() => setShock({ ...shock, percent: value })}
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
        </section>
        <section
          className="stress-panel stress-result"
          aria-label={t("stress.result")}
        >
          {result ? (
            <>
              <p>{t("stress.after")}</p>
              <output className="stress-total" data-testid="stress-after">
                {money(result.after)}
              </output>
              <div
                className={`stress-impact ${result.delta < 0n ? "stress-negative" : result.delta > 0n ? "stress-positive" : ""}`}
              >
                {result.delta < 0n ? (
                  <ArrowDownRight size={25} aria-hidden />
                ) : result.delta > 0n ? (
                  <ArrowUpRight size={25} aria-hidden />
                ) : (
                  <Minus size={25} aria-hidden />
                )}
                <output data-testid="stress-impact">
                  {signed(result.changeBps / 100)}%
                </output>
                <span>{t("stress.impact")}</span>
              </div>
              <div className="stress-value-bars">
                <div>
                  <span>{t("stress.before")}</span>
                  <strong>{money(result.before)}</strong>
                </div>
                <div className="stress-bar">
                  <i
                    style={{
                      width: `${(Number(result.before) / Number(result.before > result.after ? result.before : result.after)) * 100}%`,
                    }}
                  />
                </div>
                <div>
                  <span>{t("stress.after")}</span>
                  <strong>{money(result.after)}</strong>
                </div>
                <div className="stress-bar stress-bar-after">
                  <i
                    style={{
                      width: `${(Number(result.after) / Number(result.before > result.after ? result.before : result.after)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="stress-concentration">
                <h2>{t("stress.concentration")}</h2>
                <div className="stress-stack" aria-hidden="true">
                  {result.rows.map((row, i) => (
                    <span
                      key={row.id}
                      style={{
                        flexGrow: row.shareBps,
                        background: [
                          "#fa6c34",
                          "#d8b778",
                          "#7ebbae",
                          "#9c9bc0",
                        ][i % 4],
                      }}
                    />
                  ))}
                </div>
                <p>
                  {t("stress.weight", {
                    asset:
                      result.rows.find((r) => r.id === result.largestId)
                        ?.label ?? "—",
                    percent: pct(result.largestShareBps / 100),
                  })}
                </p>
              </div>
            </>
          ) : (
            <div className="stress-invalid" role="alert">
              <h2>{t("stress.editTitle")}</h2>
              <p>{error}</p>
              <button onClick={revealEditor}>{t("stress.edit")}</button>
            </div>
          )}
        </section>
      </div>
      <section
        className="stress-panel stress-breakdown"
        aria-labelledby="stress-breakdown-title"
      >
        <h2 id="stress-breakdown-title">{t("stress.details")}</h2>
        {result ? (
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
                {result.rows.map((row) => (
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
          <p>{error}</p>
        )}
      </section>
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
              disabled={positions.length >= 10}
              onClick={() => {
                const id = `p${nextId.current++}`;
                setPositions([
                  ...positions,
                  {
                    id,
                    label: t("stress.newAsset", {
                      number: positions.length + 1,
                    }),
                    value: "0",
                  },
                ]);
                setCustom(true);
                if (!positions.length) setShock({ ...shock, positionId: id });
              }}
            >
              <Plus size={17} />
              {t("stress.add")}
            </button>
            <button
              onClick={() => {
                setPositions([]);
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
      {result && (
        <StressReceipt
          key={signature}
          result={result}
          shock={shock}
          custom={custom}
        />
      )}
      <details className="stress-method">
        <summary>{t("stress.method")}</summary>
        <p>{t("stress.methodBody")}</p>
      </details>
      <p className="stress-privacy">{t("stress.privacy")}</p>
    </div>
  );
}
