import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  Info,
  LineChart,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ApiError } from "../dashboard/http";
import { useI18n } from "../i18n";
import {
  getExitCheckQuote,
  isValidExitAmount,
  type ExitCheckOutputSymbol,
  type ExitCheckQuote,
} from "./api";

const MAX_DECIMALS_HINT = 36;

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: "neutral" | "good" | "warn" }) {
  const valueTone = tone === "good" ? "text-[#7fb069]" : tone === "warn" ? "text-[#fa6c34]" : "text-[#e9e0d1]";
  return (
    <div className="min-h-[124px] bg-[#242424] p-5">
      <p className="font-mono-d text-[9.5px] tracking-[0.15em] text-[#635d5a]">{label}</p>
      <p className={`mt-4 break-words font-mono-d text-[20px] tracking-[-0.03em] ${valueTone}`}>{value}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[#7f7972]">{note}</p>
    </div>
  );
}

export default function ExitCheck() {
  const { t, locale } = useI18n();
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [outputToken, setOutputToken] = useState<ExitCheckOutputSymbol>("WETH");
  const [result, setResult] = useState<ExitCheckQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const validToken = useMemo(() => /^0x[0-9a-fA-F]{40}$/.test(token.trim()), [token]);
  const validAmount = useMemo(() => isValidExitAmount(amount, MAX_DECIMALS_HINT), [amount]);
  const canSubmit = validToken && validAmount && !loading;

  useEffect(() => {
    if (!result || receivedAt === null) return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, performance.now() - receivedAt)), 250);
    return () => window.clearInterval(timer);
  }, [result, receivedAt]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const cancelInFlight = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
    setLoading(false);
  };

  const changeOutput = (symbol: ExitCheckOutputSymbol) => {
    cancelInFlight();
    setOutputToken(symbol);
    setResult(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setResult(null);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const next = await getExitCheckQuote({ token: token.trim(), amount, outputToken }, controller.signal);
      if (requestId !== requestIdRef.current) return;
      setReceivedAt(performance.now());
      setElapsed(0);
      setResult(next);
    } catch (requestError) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const code = requestError instanceof ApiError ? requestError.code : "EXIT_CHECK_UNAVAILABLE";
      const message = code === "EXIT_CHECK_DISABLED" || code === "NOT_FOUND"
        ? t("exit.error.disabled")
        : code === "EXIT_CHECK_RATE_LIMITED"
          ? t("exit.error.rateLimited")
          : code === "EXIT_CHECK_REORGED"
            ? t("exit.error.reorged")
            : code === "EXIT_CHECK_INVALID_AMOUNT"
              ? t("exit.error.invalidAmount")
              : requestError instanceof Error && requestError.message
                ? requestError.message
                : t("exit.error.unavailable");
      setErrorCode(code);
      setError(message);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const stale = result ? elapsed >= result.freshForMs : false;
  const seconds = result ? Math.max(0, Math.ceil((result.freshForMs - elapsed) / 1000)) : 0;

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <main className="workspace-layout">
        <div className="workspace-heading">
          <div>
            <p className="workspace-eyebrow"><LineChart size={14} /> {t("exit.eyebrow")}</p>
            <h1 className="workspace-title">{t("exit.titleLead")}<br /><span className="text-[#fa6c34]">{t("exit.titleAccent")}</span></h1>
            <p className="workspace-description">{t("exit.description")}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <form data-testid="exit-check-form" onSubmit={submit} className="clip-panel h-fit border border-[#383838] bg-[#242424] p-5 sm:p-6 xl:sticky xl:top-[88px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">{t("exit.form.youHold")}</p>
                <p className="mt-1 text-[12px] text-[#9a938a]">{t("exit.form.exactInput")}</p>
              </div>
              <span className="flex items-center gap-1.5 border border-[#7fb069]/30 bg-[#7fb069]/10 px-2.5 py-1 font-mono-d text-[9px] text-[#7fb069]"><ShieldCheck size={11} /> {t("exit.form.readOnly")}</span>
            </div>

            <label htmlFor="exit-token" className="mt-5 block font-mono-d text-[10px] text-[#635d5a]">{t("exit.form.tokenLabel")}</label>
            <input
              id="exit-token"
              value={token}
              onChange={(event) => { cancelInFlight(); setResult(null); setError(null); setToken(event.target.value); }}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 font-mono-d text-[13px] text-[#e9e0d1] outline-none focus:border-[#fa6c34]"
            />
            {!validToken && token && <p role="alert" className="mt-2 text-[11px] text-[#e0738a]">{t("exit.form.tokenError")}</p>}

            <label htmlFor="exit-amount" className="mt-5 block font-mono-d text-[10px] text-[#635d5a]">{t("exit.form.amountLabel")}</label>
            <input
              id="exit-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => { cancelInFlight(); setResult(null); setError(null); setAmount(event.target.value); }}
              placeholder="0.0"
              autoComplete="off"
              className="mt-1 w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 font-mono-d text-[22px] tracking-[-0.03em] text-[#e9e0d1] outline-none focus:border-[#fa6c34]"
            />
            {!validAmount && amount && <p role="alert" className="mt-2 text-[11px] text-[#e0738a]">{t("exit.form.amountError")}</p>}

            <fieldset className="mt-5">
              <legend className="font-mono-d text-[10px] text-[#635d5a]">{t("exit.form.outputLabel")}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["WETH", "USDG"] as ExitCheckOutputSymbol[]).map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    aria-pressed={outputToken === symbol}
                    onClick={() => changeOutput(symbol)}
                    className={`min-h-[44px] border px-4 py-2 font-mono-d text-[11px] tracking-wider transition-colors ${outputToken === symbol ? "border-[#fa6c34] bg-[#fa6c34] text-[#1d1d1d]" : "border-[#383838] bg-[#1d1d1d] text-[#b6aea4] hover:border-[#fa6c34]/50"}`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </fieldset>

            <button type="submit" disabled={!canSubmit} className="clip-btn mt-5 flex w-full items-center justify-center gap-2 bg-[#fa6c34] py-4 font-mono-d text-[11px] font-semibold tracking-[0.14em] text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:cursor-not-allowed disabled:opacity-40">
              {loading ? <><Loader2 size={14} className="animate-spin" /> {t("exit.form.checking")}</> : <><Search size={14} /> {t("exit.form.check")}</>}
            </button>
            <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[#635d5a]">{t("exit.form.note")}</p>
          </form>

          <div className="min-w-0">
            {error && !loading && (
              <div data-testid="exit-check-error" role="alert" className="clip-panel border border-[#fa6c34]/40 bg-[#242424] p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                  <div>
                    <p className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#fa6c34]">{t("exit.error.title")}</p>
                    <p className="mt-3 text-[14px] leading-relaxed text-[#b6aea4]">{error}</p>
                    {errorCode && <p className="mt-2 font-mono-d text-[9px] text-[#635d5a]">{errorCode}</p>}
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div data-testid="exit-check-loading" role="status" className="clip-panel flex min-h-[200px] items-center justify-center gap-3 border border-[#383838] bg-[#202020] p-6 text-[#9a938a]">
                <Loader2 size={18} className="animate-spin text-[#fa6c34]" /> {t("exit.form.checking")}
              </div>
            )}

            {result && !loading && result.supported && result.quote && result.output && (
              <div data-testid="exit-check-quote" className="result-materialize space-y-4">
                <div className={`flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${stale ? "border-[#fa6c34]/50 bg-[#fa6c34]/10" : "border-[#7fb069]/40 bg-[#7fb069]/10"}`}>
                  <div className="flex items-center gap-2.5">
                    {stale ? <Clock3 size={15} className="text-[#fa6c34]" /> : <ShieldCheck size={15} className="text-[#7fb069]" />}
                    <span className={`font-mono-d text-[10.5px] tracking-[0.12em] ${stale ? "text-[#fa6c34]" : "text-[#7fb069]"}`}>
                      {stale ? t("exit.quote.expired") : t("exit.quote.fresh", { seconds })}
                    </span>
                  </div>
                  <span className="font-mono-d text-[9.5px] text-[#7f7972]">{t("exit.quote.block", { block: result.anchor.blockNumber })}</span>
                </div>

                <div className="clip-panel overflow-hidden border border-[#383838] bg-[#383838]">
                  <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label={t("exit.metric.estimated")} value={`${result.quote.amountOutDisplay} ${result.output.symbol}`} note={t("exit.metric.estimatedNote")} tone="good" />
                    <Metric label={t("exit.metric.priceImpact")} value={result.quote.priceImpactPercent === null ? t("exit.metric.notReturned") : `${result.quote.priceImpactPercent}%`} note={t("exit.metric.priceImpactNote")} tone={Number(result.quote.priceImpactPercent ?? 0) >= 1 ? "warn" : "neutral"} />
                    <Metric label={t("exit.metric.fee")} value={`${result.quote.feePercent}%`} note={t("exit.metric.feeNote", { amount: result.quote.feeAmountDisplay, symbol: result.input.symbol ?? shortAddress(result.input.contract) })} />
                    <Metric label={t("exit.metric.liquidity")} value={result.quote.activeLiquidity} note={t("exit.metric.liquidityNote")} />
                  </div>
                </div>

                <section className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6">
                  <h2 className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">{t("exit.coverage.title")}</h2>
                  <p className="mt-3 text-[12px] leading-relaxed text-[#8f8880]">{t("exit.coverage.body", { count: result.coverage.poolsQuoted.length })}</p>
                  <dl className="mt-4 grid gap-3 font-mono-d text-[10px] sm:grid-cols-2">
                    <div className="border border-[#383838] bg-[#1d1d1d] p-3">
                      <dt className="text-[#635d5a]">{t("exit.coverage.selected")}</dt>
                      <dd className="mt-1 break-all text-[#7fb069]">{result.quote.pool.fee} · {shortAddress(result.quote.pool.pool)}</dd>
                    </div>
                    <div className="border border-[#383838] bg-[#1d1d1d] p-3">
                      <dt className="text-[#635d5a]">{t("exit.coverage.spot")}</dt>
                      <dd className="mt-1 text-[#9a938a]">{result.quote.spotAmountOutDisplay} {result.output.symbol}</dd>
                    </div>
                    <div className="border border-[#383838] bg-[#1d1d1d] p-3">
                      <dt className="text-[#635d5a]">{t("exit.coverage.quoted")}</dt>
                      <dd className="mt-1 text-[#9a938a]">{result.coverage.poolsQuoted.map((pool) => `${pool.fee}→${pool.amountOutDisplay}`).join(", ")}</dd>
                    </div>
                    <div className="border border-[#383838] bg-[#1d1d1d] p-3">
                      <dt className="text-[#635d5a]">{t("exit.coverage.missing")}</dt>
                      <dd className="mt-1 text-[#9a938a]">{result.coverage.poolsMissing.length ? result.coverage.poolsMissing.join(", ") : t("exit.coverage.none")}</dd>
                    </div>
                    {result.coverage.poolsDiscoveryFailed.length > 0 && (
                      <div className="border border-[#e0738a]/40 bg-[#1d1d1d] p-3">
                        <dt className="text-[#635d5a]">{t("exit.coverage.discoveryFailed")}</dt>
                        <dd className="mt-1 text-[#e0738a]">{result.coverage.poolsDiscoveryFailed.join(", ")}</dd>
                      </div>
                    )}
                  </dl>
                  {result.coverage.poolsFailed.length > 0 && (
                    <p className="mt-3 text-[11px] text-[#e0738a]">{t("exit.coverage.failed", { count: result.coverage.poolsFailed.length })}</p>
                  )}
                </section>

                <section className="clip-panel border border-[#383838] bg-[#202020] p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <Info size={15} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                    <div>
                      <h2 className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#d6ccba]">{t("exit.disclosures.title")}</h2>
                      <ul className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-[#8f8880]">
                        {result.limitations.map((item) => <li key={item}>— {item}</li>)}
                      </ul>
                      {locale === "zh-CN" && <p className="mt-3 font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{t("exit.originalLanguage")}</p>}
                    </div>
                  </div>
                </section>

                <a
                  href={`https://app.uniswap.org/swap?chain=robinhood&inputCurrency=${result.input.contract}&outputCurrency=${result.output.address}&field=input&value=${encodeURIComponent(result.input.amount)}&theme=dark`}
                  target="_blank"
                  rel="noreferrer"
                  className="clip-btn group flex w-full items-center justify-between gap-4 bg-[#e9e0d1] px-5 py-4 text-[#1d1d1d] transition-colors hover:bg-white sm:px-7"
                >
                  <div>
                    <p className="font-mono-d text-[11px] font-semibold tracking-[0.12em]">{t("exit.handoff")}</p>
                    <p className="mt-1 text-[11px] text-[#1d1d1d]/70">{t("exit.handoffNote")}</p>
                  </div>
                  <ExternalLink size={18} className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
            )}

            {result && !loading && !result.supported && (
              <div data-testid="exit-check-unsupported" className="clip-panel border border-[#fa6c34]/40 bg-[#242424] p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                  <div>
                    <p className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#fa6c34]">{t("exit.unsupported.title")}</p>
                    <p className="mt-3 text-[14px] leading-relaxed text-[#b6aea4]">
                      {result.reason === "unknown_decimals" ? t("exit.unsupported.decimals") : result.reason === "quote_failed" ? t("exit.unsupported.quoteFailed") : t("exit.unsupported.v4")}
                    </p>
                    <p className="mt-3 font-mono-d text-[10px] text-[#635d5a]">
                      {result.coverage.feeTiersTested.length === 0
                        ? t("exit.unsupported.notReached")
                        : t("exit.unsupported.missing", { missing: result.coverage.poolsMissing.length ? result.coverage.poolsMissing.join(", ") : t("exit.coverage.none") })}
                    </p>
                    {result.coverage.poolsDiscoveryFailed.length > 0 && (
                      <p className="mt-2 font-mono-d text-[10px] text-[#e0738a]">{t("exit.unsupported.discoveryFailed", { failed: result.coverage.poolsDiscoveryFailed.join(", ") })}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!result && !loading && !error && (
              <div className="clip-panel flex min-h-[320px] flex-col justify-between border border-[#383838] bg-[#202020] p-6 sm:p-8">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center border border-[#383838] bg-[#242424] text-[#fa6c34]"><LockKeyhole size={20} /></div>
                  <h2 className="mt-5 text-[24px] font-medium leading-tight text-[#e9e0d1]">{t("exit.empty.title")}</h2>
                  <p className="mt-4 max-w-[520px] text-[13px] leading-relaxed text-[#8f8880]">{t("exit.empty.body")}</p>
                </div>
                <div className="mt-10 grid gap-px overflow-hidden border border-[#383838] bg-[#383838] sm:grid-cols-2">
                  {[t("exit.empty.point.input"), t("exit.empty.point.pool"), t("exit.empty.point.impact"), t("exit.empty.point.boundary")].map((point) => (
                    <div key={point} className="bg-[#242424] p-4 text-[11px] leading-relaxed text-[#9a938a]">{point}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
