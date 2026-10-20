import { OPSIS_PRESENTATION } from "../opsis/presentation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Fuel,
  Info,
  LockKeyhole,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { ApiError } from "../dashboard/http";
import { OnchainQuoteDetails } from "../swap/OnchainQuoteDetails";
import { useI18n } from "../i18n";
import {
  SWAP_TOKENS,
  getSwapQuote,
  officialUniswapUrl,
  type SwapQuote,
  type SwapDirection,
} from "../swap/api";

function TokenMark({ symbol }: { symbol: "WETH" | "USDG" }) {
  return (
    <span className={`flex h-11 w-11 items-center justify-center rounded-full border font-mono-d text-[11px] font-semibold ${
      symbol === "WETH"
        ? "border-[#7cc4f8]/40 bg-[#7cc4f8]/10 text-[#7cc4f8]"
        : "border-[#7fb069]/40 bg-[#7fb069]/10 text-[#7fb069]"
    }`}>
      {symbol}
    </span>
  );
}

function LoadingQuote() {
  const { t } = useI18n();
  const labels = [t("trade.swap.loadingOutput"), t("trade.swap.loadingRoute"), t("trade.swap.loadingPriceImpact"), t("trade.swap.loadingNetworkCost")];
  return (
    <div data-testid="swap-loading" role="status" aria-label={t("trade.swap.loadingAria")} className="clip-panel scan-panel overflow-hidden border border-[#383838] bg-[#242424]">
      <div className="flex items-center justify-between border-b border-[#383838] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Sparkles size={14} className="pulse-dot text-[#fa6c34]" />
          <span className="font-mono-d text-[10.5px] tracking-[0.16em] text-[#d6ccba]">{t("trade.swap.askingUniswap")}</span>
        </div>
        <span className="font-mono-d text-[9.5px] tracking-wider text-[#635d5a]">{t("trade.swap.chainLive")}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#383838] lg:grid-cols-4">
        {labels.map((label, index) => (
          <div key={label} className="decode-tile min-h-[106px] bg-[#202020] p-4">
            <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#635d5a]">{label}</p>
            <div className="mt-5 flex items-end gap-1.5 font-mono-d text-[22px] text-[#706a64]" aria-hidden="true">
              {Array.from({ length: index === 1 ? 4 : 6 }, (_, digit) => (
                <span key={`${digit}-${index}`} className="swap-digit" style={{ animationDelay: `${-(digit + index) * 91}ms` }}>
                  {String((digit * 3 + index) % 10)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="binary-window border-t border-[#383838] px-5 py-3"><span className="binary-track">01010011 01000011 01001111 01010101 01010100 &nbsp; 01010011 01010111 01000001 01010000 &nbsp;</span></div>
    </div>
  );
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: "neutral" | "good" | "warn" }) {
  const valueTone = tone === "good" ? "text-[#7fb069]" : tone === "warn" ? "text-[#fa6c34]" : "text-[#e9e0d1]";
  return (
    <div className="min-h-[128px] bg-[#242424] p-5">
      <p className="font-mono-d text-[9.5px] tracking-[0.15em] text-[#635d5a]">{label}</p>
      <p className={`mt-4 break-words font-mono-d text-[20px] tracking-[-0.03em] ${valueTone}`}>{value}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[#7f7972]">{note}</p>
    </div>
  );
}

function formatUsdCost(value: string, notSupplied: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return notSupplied;
  if (amount > 0 && amount < 0.000001) return "<$0.000001";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: amount > 0 && amount < 0.01 ? 6 : 2,
  });
}

export function QuotePanel({ quote, elapsedMs }: { quote: SwapQuote; elapsedMs: number }) {
  const { t, locale } = useI18n();
  const stale = elapsedMs >= quote.freshForMs;
  const seconds = Math.max(0, Math.ceil((quote.freshForMs - elapsedMs) / 1000));
  const simulationOkay = quote.simulation.status === "passed";
  const notSupplied = t("trade.common.notSupplied");
  const gas = quote.estimatedGas.usdAmount
    ? formatUsdCost(quote.estimatedGas.usdAmount, notSupplied)
    : quote.estimatedGas.nativeAmount
      ? `${quote.estimatedGas.nativeAmount} ETH`
      : notSupplied;
  const impact = quote.priceImpactPercent === null ? notSupplied : `${quote.priceImpactPercent.toFixed(2)}%`;
  const rate = Number(quote.input.amount) > 0
    ? `${(Number(quote.output.amount) / Number(quote.input.amount)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${quote.output.symbol}`
    : "—";

  return (
    <div data-testid="swap-quote" className="result-materialize space-y-4">
      <OnchainQuoteDetails quote={quote} />
      <div className={`flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        stale ? "border-[#fa6c34]/50 bg-[#fa6c34]/10" : "border-[#7fb069]/40 bg-[#7fb069]/10"
      }`}>
        <div className="flex items-center gap-2.5">
          {stale ? <Clock3 size={15} className="text-[#fa6c34]" /> : <CheckCircle2 size={15} className="text-[#7fb069]" />}
          <span className={`font-mono-d text-[10.5px] tracking-[0.12em] ${stale ? "text-[#fa6c34]" : "text-[#7fb069]"}`}>
            {stale ? t("trade.quote.expired") : t("trade.quote.livePreview", { seconds })}
          </span>
        </div>
        <span className="font-mono-d text-[9.5px] text-[#7f7972]">
          {quote.provider.cached ? t("trade.quote.safeCache") : t("trade.quote.newProviderResponse")} · {new Date(quote.quotedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>

      <div className="clip-panel overflow-hidden border border-[#383838] bg-[#383838]">
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t("trade.quote.expectedOutput")} value={`${quote.output.amount} ${quote.output.symbol}`} note={t("trade.quote.rate", { input: quote.input.symbol, rate })} tone="good" />
          <Metric
            label={t("trade.quote.minimumReceived")}
            value={`${quote.output.minimumReceived} ${quote.output.symbol}`}
            note={quote.output.minimumSource === "provider"
              ? t("trade.quote.providerMinimum", { percent: quote.slippageTolerancePercent })
              : t("trade.quote.derivedFloor", { percent: quote.slippageTolerancePercent })}
          />
          <Metric label={t("trade.quote.priceImpact")} value={impact} note={quote.onchain ? t("trade.onchain.impact") : quote.priceImpactPercent === null ? t("trade.quote.priceImpactMissing") : t("trade.quote.priceImpactNote")} tone={(quote.priceImpactPercent ?? 0) >= 1 ? "warn" : "neutral"} />
          <Metric label={quote.onchain ? t("trade.onchain.networkLabel") : t("trade.quote.estimatedRouteCost")} value={gas} note={quote.onchain ? t("trade.onchain.userPays") : quote.estimatedGas.paidBy === "filler_or_user" ? t("trade.quote.uniswapXCost") : t("trade.quote.routeEstimate")} />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="clip-panel min-w-0 border border-[#383838] bg-[#242424] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Route size={15} className="text-[#7cc4f8]" />
              <h2 className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">{t(quote.onchain ? "trade.onchain.evidence" : "trade.quote.routeExplained")}</h2>
            </div>
            <span className="border border-[#7cc4f8]/30 bg-[#7cc4f8]/10 px-2.5 py-1 font-mono-d text-[9px] tracking-wider text-[#7cc4f8]">{quote.route.routing}</span>
          </div>
          <p className="mt-5 break-all text-[19px] leading-snug text-[#e9e0d1]">{quote.onchain ? t("trade.onchain.route", { fee: quote.onchain.feeTier / 10000 }) : quote.route.label}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="border border-[#383838] bg-[#1d1d1d] p-4">
              <p className="font-mono-d text-[9px] tracking-wider text-[#635d5a]">{t("trade.quote.simulation")}</p>
              <div className="mt-2 flex items-center gap-2">
                {simulationOkay ? <Check size={14} className="text-[#7fb069]" /> : <AlertTriangle size={14} className="text-[#fa6c34]" />}
                <span className={simulationOkay ? "text-[12px] text-[#7fb069]" : "text-[12px] text-[#fa6c34]"}>
                  {quote.onchain ? t("trade.onchain.noSimulation") : quote.simulation.status === "passed"
                    ? t("trade.quote.simulationPassed")
                    : quote.simulation.status === "warning"
                      ? t("trade.quote.simulationWarning")
                      : t("trade.quote.simulationFailed")}
                </span>
              </div>
            </div>
            <div className="border border-[#383838] bg-[#1d1d1d] p-4">
              <p className="font-mono-d text-[9px] tracking-wider text-[#635d5a]">{t("trade.quote.approval")}</p>
              <p className="mt-2 text-[12px] text-[#9a938a]">{quote.approvalMayBeRequired ? t("trade.quote.approvalMaybe") : t("trade.quote.approvalNone")}</p>
            </div>
          </div>
        </section>

        <section className="clip-panel min-w-0 border border-[#383838] bg-[#242424] p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <LockKeyhole size={15} className="text-[#fa6c34]" />
            <h2 className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">{t("trade.quote.unsignedPlan")}</h2>
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-[#b6aea4]">{quote.transactionPreview.action}</p>
          <dl className="mt-5 space-y-3 border-t border-[#383838] pt-4 font-mono-d text-[9.5px]">
            <div className="flex justify-between gap-4"><dt className="text-[#635d5a]">{t("trade.quote.chain")}</dt><dd className="text-[#9a938a]">4663</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#635d5a]">{t("trade.quote.userWallet")}</dt><dd className="text-[#7fb069]">{t("trade.quote.notShared")}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#635d5a]">{t("trade.quote.opsis")}</dt><dd className="text-[#7fb069]">{t("trade.quote.cannotSign")}</dd></div>
          </dl>
        </section>
      </div>

      <section className="clip-panel border border-[#383838] bg-[#202020] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Info size={15} className="mt-0.5 shrink-0 text-[#fa6c34]" />
          <div>
            <h2 className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#d6ccba]">{t("trade.quote.beforeContinue")}</h2>
            <ul className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-[#8f8880]">
              {quote.disclosures.map((disclosure) => <li key={disclosure}>— {disclosure}</li>)}
            </ul>
            {locale === "zh-CN" && <p className="mt-3 font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{t("common.state.originalLanguage")}</p>}
          </div>
        </div>
      </section>

      <a
        href={quote.handoffUrl}
        target="_blank"
        rel="noreferrer"
        className="clip-btn group flex w-full items-center justify-between gap-4 bg-[#fa6c34] px-5 py-4 text-[#1d1d1d] transition-colors hover:bg-[#ff7038] sm:px-7"
      >
        <div>
          <p className="font-mono-d text-[12px] font-semibold tracking-[0.12em]">{stale || !simulationOkay ? t("trade.quote.openNewQuote") : t("trade.quote.continueUniswap")}</p>
          <p className="mt-1 text-[11px] text-[#1d1d1d]/70">{t("trade.quote.prefilled")}</p>
        </div>
        <ArrowUpRight size={20} className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>
    </div>
  );
}

export default function SwapPreview() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<SwapDirection>("WETH_TO_USDG");
  const [amount, setAmount] = useState("0.01");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [quoteReceivedAtMs, setQuoteReceivedAtMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const input = direction === "WETH_TO_USDG" ? SWAP_TOKENS.WETH : SWAP_TOKENS.USDG;
  const output = direction === "WETH_TO_USDG" ? SWAP_TOKENS.USDG : SWAP_TOKENS.WETH;
  const directUrl = useMemo(() => officialUniswapUrl(direction, amount), [direction, amount]);
  // Once the quote's freshness window passes, the receive box is labelled expired, like the quote card.
  const receiveStale = quote ? elapsedMs >= quote.freshForMs : false;
  const amountValid = /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) && Number(amount) > 0 && (amount.split(".")[1]?.length ?? 0) <= input.decimals;

  useEffect(() => {
    if (!quote || quoteReceivedAtMs === null) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, performance.now() - quoteReceivedAtMs));
    }, 250);
    return () => window.clearInterval(timer);
  }, [quote, quoteReceivedAtMs]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const changeDirection = () => {
    controllerRef.current?.abort();
    setDirection((current) => current === "WETH_TO_USDG" ? "USDG_TO_WETH" : "WETH_TO_USDG");
    setQuote(null);
    setError(null);
  };

  const fetchQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!amountValid || loading) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    try {
      const next = await getSwapQuote({ direction, amount }, controller.signal);
      setQuoteReceivedAtMs(performance.now());
      setElapsedMs(0);
      setQuote(next);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      const code = requestError instanceof ApiError ? requestError.code : "SWAP_PROVIDER_UNAVAILABLE";
      const message = code === "SWAP_PREVIEW_DISABLED"
        ? t("trade.swap.disabled")
        : code === "SWAP_NO_ROUTE"
          ? t("trade.swap.noRoute")
          : code === "SWAP_RATE_LIMITED"
            ? t("trade.swap.rateLimited")
            : requestError instanceof Error ? requestError.message : t("trade.swap.unavailableGeneric");
      setError({ code, message });
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      {!OPSIS_PRESENTATION && (      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label={t("trade.swap.homeLabel")}>
          <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}>
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">OPSIS</span>
        </Link>
        <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a] sm:text-[10.5px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
          {t("trade.swap.publicPreview")}
        </div>
        <div className="flex items-center gap-2">
          <Link to="/roadmap" className="hidden px-3 py-2 font-mono-d text-[10px] text-[#7f7972] transition-colors hover:text-[#e9e0d1] md:block">{t("trade.swap.roadmap")}</Link>
          <span className="border border-[#7fb069]/40 bg-[#7fb069]/10 px-3 py-2 font-mono-d text-[9px] text-[#7fb069] sm:text-[10px]">
            {t("trade.swap.noWalletData")}
          </span>
        </div>
      </header>)}

      <main className="workspace-layout">
        <div className="workspace-heading">
          {!OPSIS_PRESENTATION && (<div>
            <p className="workspace-eyebrow"><ArrowDownUp size={14} /> {t("trade.swap.eyebrow")}</p>
            <h1 className="workspace-title">{t("trade.swap.titleLead")}<br /><span className="text-[#fa6c34]">{t("trade.swap.titleAccent")}</span></h1>
            <p className="workspace-description">{t("trade.swap.description")}</p>
          </div>)}
        </div>

        <div className="relative grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <form onSubmit={fetchQuote} className="clip-panel h-fit border border-[#383838] bg-[#242424] p-5 sm:p-6 xl:sticky xl:top-[88px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">{t("trade.swap.youSend")}</p>
                <p className="mt-1 text-[12px] text-[#9a938a]">{t("trade.swap.exactInput")}</p>
              </div>
              <span className="flex items-center gap-1.5 border border-[#7fb069]/30 bg-[#7fb069]/10 px-2.5 py-1 font-mono-d text-[9px] text-[#7fb069]"><ShieldCheck size={11} /> {t("trade.swap.readOnly")}</span>
            </div>

            <div className="mt-5 flex items-center gap-3 border border-[#383838] bg-[#1d1d1d] p-4 focus-within:border-[#fa6c34]">
              <TokenMark symbol={input.symbol} />
              <div className="min-w-0 flex-1">
                <label htmlFor="swap-amount" className="font-mono-d text-[10px] text-[#635d5a]">{input.name}</label>
                <input id="swap-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => { controllerRef.current?.abort(); setLoading(false); setAmount(event.target.value); setQuote(null); setError(null); }} className="mt-1 w-full bg-transparent font-mono-d text-[28px] tracking-[-0.04em] text-[#e9e0d1] outline-none placeholder:text-[#4c4844]" placeholder="0.0" aria-describedby={!amountValid && amount ? "swap-amount-error" : undefined} />
              </div>
              <span className="font-mono-d text-[12px] text-[#9a938a]">{input.symbol}</span>
            </div>
            {!amountValid && amount && <p id="swap-amount-error" role="alert" className="mt-2 text-[11px] text-[#e0738a]">{t("trade.swap.amountError", { decimals: input.decimals })}</p>}

            <div className="relative my-3 flex items-center justify-center">
              <div className="absolute inset-x-0 top-1/2 border-t border-[#383838]" />
              <button type="button" onClick={changeDirection} aria-label={t("trade.swap.reverseDirection")} className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#4a4642] bg-[#2a2928] text-[#fa6c34] transition-transform hover:rotate-180 hover:border-[#fa6c34]">
                <ArrowDownUp size={15} />
              </button>
            </div>

            <ReceiveBox symbol={output.symbol} amount={quote?.output.amount ?? null} stale={receiveStale} />

            <button type="submit" disabled={!amountValid || loading} className="clip-btn mt-5 flex w-full items-center justify-center gap-2 bg-[#fa6c34] py-4 font-mono-d text-[11px] font-semibold tracking-[0.14em] text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:cursor-not-allowed disabled:opacity-40">
              {loading ? <><RefreshCw size={14} className="animate-spin" /> {t("trade.swap.fetchingRoute")}</> : <><Zap size={14} /> {t("trade.swap.getPreview")}</>}
            </button>
            <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[#635d5a]">{t("trade.swap.noWalletNote")}</p>
          </form>

          <div className="min-w-0">
            {loading && <LoadingQuote />}
            {error && !loading && (
              <div data-testid="swap-error" role="alert" className="clip-panel border border-[#fa6c34]/40 bg-[#242424] p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                  <div>
                    <p className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#fa6c34]">{t("trade.swap.unavailable")}</p>
                    <p className="mt-3 text-[14px] leading-relaxed text-[#b6aea4]">{error.message}</p>
                    <p className="mt-2 font-mono-d text-[9px] text-[#635d5a]">{error.code}</p>
                  </div>
                </div>
                <a href={directUrl} target="_blank" rel="noreferrer" className="clip-btn mt-6 flex items-center justify-between bg-[#e9e0d1] px-5 py-4 font-mono-d text-[11px] font-semibold tracking-wider text-[#1d1d1d]">
                  {t("trade.swap.openUniswapNewQuote")} <ExternalLink size={15} />
                </a>
              </div>
            )}
            {quote && !loading && <QuotePanel quote={quote} elapsedMs={elapsedMs} />}
            {!quote && !loading && !error && (
              <div className="clip-panel flex min-h-[360px] flex-col justify-between border border-[#383838] bg-[#202020] p-6 sm:p-8">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center border border-[#383838] bg-[#242424] text-[#fa6c34]"><Route size={20} /></div>
                  <h2 className="mt-5 text-[24px] font-medium leading-tight text-[#e9e0d1]">{t("trade.swap.emptyTitle")}</h2>
                  <p className="mt-4 max-w-[520px] text-[13px] leading-relaxed text-[#8f8880]">{t("trade.swap.emptyBody")}</p>
                </div>
                <div className="mt-10 grid gap-px overflow-hidden border border-[#383838] bg-[#383838] sm:grid-cols-2">
                  {[
                    { icon: Sparkles, label: t("trade.swap.featureOutput"), note: t("trade.swap.featureOutputNote") },
                    { icon: Route, label: t("trade.swap.featureRoute"), note: t("trade.swap.featureRouteNote") },
                    { icon: Fuel, label: t("trade.swap.featureCosts"), note: t("trade.swap.featureCostsNote") },
                    { icon: ExternalLink, label: t("trade.swap.featureHandoff"), note: t("trade.swap.featureHandoffNote") },
                  ].map(({ icon: Icon, label, note }) => (
                    <div key={label} className="bg-[#242424] p-4">
                      <Icon size={14} className="text-[#7cc4f8]" />
                      <p className="mt-3 text-[12px] text-[#d6ccba]">{label}</p>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#635d5a]">{note}</p>
                    </div>
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

/** The "You receive" field: the quoted estimate after a quote, the placeholder before one or after any edit. */
export function ReceiveBox({ symbol, amount, stale }: { symbol: "WETH" | "USDG"; amount: string | null; stale: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border border-[#383838] bg-[#202020] p-4">
      <TokenMark symbol={symbol} />
      <div className="flex-1">
        <p className="font-mono-d text-[10px] text-[#635d5a]">{amount === null ? t("trade.swap.youReceive") : t(stale ? "trade.swap.youReceiveExpired" : "trade.swap.youReceiveEstimate")}</p>
        <p data-testid="swap-receive-amount" className={`mt-1 font-mono-d text-[19px] ${amount !== null && !stale ? "text-[#e9e0d1]" : "text-[#9a938a]"}`}>{amount ?? t("trade.swap.calculatedLive")}</p>
      </div>
      <span className="font-mono-d text-[12px] text-[#9a938a]">{symbol}</span>
    </div>
  );
}
