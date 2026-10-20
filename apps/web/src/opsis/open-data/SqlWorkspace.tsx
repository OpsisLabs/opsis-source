import { useEffect, useRef, useState } from "react";
import { canonicalize, type OpenDatasetManifest } from "@rh-chain/shared";
import { useI18n } from "../../i18n";
import { fetchDatasetManifest } from "./data";
import { readLocalFiles } from "./local-files";
import { createSqlEngine } from "./engine";
import {
  OpenDataError,
  RESULT_LIMIT,
  parseSqlRun,
  type LocalFile,
  type SqlRun,
  type SqlRunManifest,
} from "./model";
import { startSqlRun } from "./runner";
import "./sql.css";

export default function SqlWorkspace({
  datasetsEnabled = false,
}: {
  datasetsEnabled?: boolean;
}) {
  const { t } = useI18n();
  const [manifest, setManifest] = useState<OpenDatasetManifest | null>(null);
  const [loading, setLoading] = useState(datasetsEnabled);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [pendingReplay, setPendingReplay] = useState<SqlRunManifest | null>(
    null,
  );
  const [errorFile, setErrorFile] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<SqlRun | null>(null);
  const [error, setError] = useState<keyof typeof errors | null>(null);
  const [replayed, setReplayed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef<ReturnType<typeof startSqlRun> | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    const counter = generation,
      pending = active;
    void fetchDatasetManifest(abort.signal, datasetsEnabled)
      .then((value) => {
        if (!abort.signal.aborted) {
          setManifest(value);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError("manifestError");
          setLoading(false);
        }
      });
    return () => {
      abort.abort();
      counter.current++;
      pending.current?.cancel();
      pending.current = null;
    };
  }, [attempt, datasetsEnabled]);
  async function execute(expected?: SqlRunManifest, files = localFiles) {
    const id = ++generation.current;
    active.current?.cancel();
    active.current = null;
    setError(null);
    setErrorFile(null);
    setRun(null);
    setReplayed(false);
    setBusy(true);
    try {
      const local = expected
        ? expected.datasets.every((d) => "kind" in d)
        : files.length > 0;
      if (!local && !datasetsEnabled) throw new OpenDataError("unavailable");
      const ids =
        expected?.datasets.flatMap((d) => ("id" in d ? [d.id] : [])) ??
        selected;
      const datasets = local
        ? files
        : ids.map((datasetId) => {
            const found = manifest?.datasets.find((d) => d.id === datasetId);
            if (!found) throw new OpenDataError("replayError");
            return found;
          });
      const exactQuery = expected?.query ?? query;
      setSelected(ids);
      setQuery(exactQuery);
      const job = startSqlRun(
        datasets,
        exactQuery,
        expected?.resultLimit ?? RESULT_LIMIT,
        createSqlEngine,
        expected,
        undefined,
        datasetsEnabled,
      );
      active.current = job;
      const result = await job.promise;
      if (generation.current === id) {
        setRun(result);
        setReplayed(Boolean(expected));
      }
    } catch (cause) {
      if (generation.current === id) {
        setErrorFile(
          cause instanceof OpenDataError ? (cause.fileName ?? null) : null,
        );
        setError(
          cause instanceof OpenDataError
            ? cause.code
            : cause instanceof Error && cause.name === "SqlRefusal"
              ? "refused"
              : "engineError",
        );
      }
    } finally {
      if (generation.current === id) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  async function replay(file: File) {
    setRun(null);
    setReplayed(false);
    setErrorFile(null);
    setPendingReplay(null);
    if (file.size > 1_000_000) {
      setError("replayError");
      return;
    }
    const id = ++generation.current;
    setRun(null);
    setReplayed(false);
    setError(null);
    setBusy(true);
    try {
      const raw = await file.text();
      if (generation.current !== id) return;
      const expected = parseSqlRun(JSON.parse(raw));
      if (expected.datasets.every((d) => "kind" in d)) {
        setPendingReplay(expected);
        setLocalFiles([]);
        setBusy(false);
      } else await execute(expected);
    } catch {
      if (generation.current === id) {
        setError("replayError");
        setBusy(false);
      }
    }
  }
  function download() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob([canonicalize(run.manifest)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "opsis-sql-run.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section
      className="opsis-quant-workbench opsis-sql"
      aria-label={t("sql.title")}
    >
      <div className="opsis-quant-grid">
        <section className="opsis-panel">
          <h2>{t("sql.title")}</h2>
          <p>{t("sql.privacy")}</p>
          <p>{t("sql.engineSize")}</p>
          <p>{t("sql.localLimits")}</p>
          <label>
            {pendingReplay ? t("sql.pickReplay") : t("sql.pickFiles")}
            <input
              type="file"
              multiple
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                const id = ++generation.current;
                setBusy(true);
                setRun(null);
                setReplayed(false);
                setError(null);
                setErrorFile(null);
                setLocalFiles([]);
                setSelected([]);
                void readLocalFiles(files)
                  .then(async (inputs) => {
                    if (generation.current !== id) return;
                    setLocalFiles(inputs);
                    setBusy(false);
                    if (pendingReplay) {
                      const expected = pendingReplay;
                      setPendingReplay(null);
                      await execute(expected, inputs);
                    }
                  })
                  .catch((cause: unknown) => {
                    if (generation.current !== id) return;
                    setBusy(false);
                    setError(
                      cause instanceof OpenDataError ? cause.code : "fileError",
                    );
                    setErrorFile(
                      cause instanceof OpenDataError
                        ? (cause.fileName ?? null)
                        : null,
                    );
                  });
              }}
            />
          </label>
          {localFiles.map((f) => (
            <p key={f.id}>
              <code>{f.id}</code> · {f.name} · {f.bytes} {t("sql.bytes")} ·
              SHA-256 <code>{f.sha256}</code>
            </p>
          ))}
          {localFiles.length > 0 && !run && <p>{t("sql.schemaAfterRun")}</p>}
          {!datasetsEnabled && <p role="status">{t("sql.datasetsNext")}</p>}
          {datasetsEnabled &&
            (loading ? (
              <p role="status">{t("sql.loading")}</p>
            ) : !manifest?.datasets.length ? (
              <p role="status">{t("sql.empty")}</p>
            ) : (
              <fieldset disabled={busy}>
                <legend>{t("sql.datasets")}</legend>
                {manifest.datasets.map((d) => (
                  <label className="opsis-check" key={d.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={(event) => {
                        setRun(null);
                        setLocalFiles([]);
                        setReplayed(false);
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, d.id]
                            : previous.filter((value) => value !== d.id),
                        );
                      }}
                    />
                    {d.title} · <code>{d.id}</code> · {d.rowCount}{" "}
                    {t("sql.rows")}
                  </label>
                ))}
              </fieldset>
            ))}
          {selected
            .map((id) => manifest?.datasets.find((d) => d.id === id))
            .map(
              (d) =>
                d && (
                  <details key={d.id}>
                    <summary>
                      {d.title} · {t("sql.evidence")}
                    </summary>
                    <dl>
                      <dt>{t("sql.source")}</dt>
                      <dd>{d.source}</dd>
                      <dt>{t("sql.range")}</dt>
                      <dd>
                        {d.chain.name} · {d.chain.id} · {d.range.kind} ·{" "}
                        {d.range.from} → {d.range.to}
                      </dd>
                      <dt>{t("sql.generated")}</dt>
                      <dd>{d.generatedAt}</dd>
                      <dt>SHA-256</dt>
                      <dd>
                        <code>{d.sha256}</code>
                      </dd>
                      <dt>{t("sql.code")}</dt>
                      <dd>
                        <code>{d.codeSha}</code>
                      </dd>
                    </dl>
                    <ul>
                      {d.limitations.map((limit, i) => (
                        <li key={i}>{limit}</li>
                      ))}
                    </ul>
                  </details>
                ),
            )}
          {error === "manifestError" && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            >
              {t("sql.retry")}
            </button>
          )}
        </section>
        <section className="opsis-panel">
          <label htmlFor="opsis-sql-query">{t("sql.query")}</label>
          <textarea
            id="opsis-sql-query"
            rows={9}
            maxLength={50_000}
            value={query}
            disabled={busy}
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setRun(null);
              setReplayed(false);
            }}
          />
          <p>{t("sql.limits")}</p>
          <p>{t("sql.order")}</p>
          <button
            type="button"
            disabled={
              busy ||
              pendingReplay !== null ||
              (!localFiles.length &&
                (!selected.length || selected.length > 4)) ||
              !query.trim()
            }
            onClick={() => void execute()}
          >
            {t("sql.run")}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                generation.current++;
                active.current?.cancel();
                active.current = null;
                setBusy(false);
                setRun(null);
                setError("cancelled");
              }}
            >
              {t("sql.cancel")}
            </button>
          )}
          <label>
            {t("sql.replay")}
            <input
              disabled={busy}
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void replay(file);
              }}
            />
          </label>
          <p>{t("sql.replayLimits")}</p>
        </section>
      </div>
      {busy && <p role="status">{t("sql.running")}</p>}
      {error && (
        <p role="alert" className="opsis-error">
          {errorFile && (
            <>
              <b>{errorFile}</b>:{" "}
            </>
          )}
          {t(errors[error])}
        </p>
      )}
      {replayed && <p role="status">{t("sql.matched")}</p>}
      {run && (
        <section className="opsis-panel">
          {run.tables?.map((table) => (
            <div key={table.name}>
              <h3>
                {table.name} · {table.rowCount} {t("sql.rows")}
              </h3>
              <ul>
                {table.columns.map((c, i) => (
                  <li key={i}>
                    {c.name} · {c.type}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <h2>{t("sql.results")}</h2>
          <p>
            {run.result.truncated
              ? t("sql.first", { n: run.manifest.rowCount })
              : `${run.manifest.rowCount} ${t("sql.rows")}`}{" "}
            · DuckDB {run.manifest.duckdbVersion}
          </p>
          <button type="button" onClick={download}>
            {t("sql.export")}
          </button>
          <div
            className="opsis-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t("sql.results")}
          >
            <table>
              <caption>{t("sql.results")}</caption>
              <thead>
                <tr>
                  {run.result.columns.map((column, i) => (
                    <th key={i}>
                      {column.name}
                      <small>{column.type}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.result.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>
                        {cell === null
                          ? "NULL"
                          : typeof cell === "object"
                            ? canonicalize(cell)
                            : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            SHA-256 · <code>{run.manifest.resultSha256}</code>
          </p>
          <pre>{run.manifest.query}</pre>
        </section>
      )}
    </section>
  );
}
const errors = {
  localLimit: "sql.localLimit",
  csvError: "sql.csvError",
  parquetUnavailable: "sql.parquetUnavailable",
  unavailable: "sql.unavailable",
  manifestError: "sql.manifestError",
  fileError: "sql.fileError",
  hashError: "sql.hashError",
  refused: "sql.refused",
  timeout: "sql.timeout",
  cancelled: "sql.cancelled",
  engineError: "sql.engineError",
  unsupported: "sql.unsupported",
  replayError: "sql.replayError",
} as const;
