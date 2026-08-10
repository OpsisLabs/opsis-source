import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
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
import {
  SWAP_TOKENS,
  getScoutSwapQuote,
  officialUniswapUrl,
  type ScoutSwapQuote,
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
  const labels = ["OUTPUT", "ROUTE", "PRICE IMPACT", "NETWORK COST"];
  return (
    <div data-testid="swap-loading" role="status" aria-label="Fetching a live Uniswap quote" className="clip-panel scan-panel overflow-hidden border border-[#383838] bg-[#242424]">
      <div className="flex items-center justify-between border-b border-[#383838] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Sparkles size={14} className="pulse-dot text-[#fa6c34]" />
          <span className="font-mono-d text-[10.5px] tracking-[0.16em] text-[#d6ccba]">ASKING UNISWAP</span>
        </div>
        <span className="font-mono-d text-[9.5px] tracking-wider text-[#635d5a]">LIVE · CHAIN 4663</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#383838] lg:grid-cols-4">
        {labels.map((label, index) => (
          <div key={label} className="decode-tile min-h-[106px] bg-[#202020] p-4">
            <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#635d5a]">{label}</p>
            <div className="mt-5 flex items-end gap-1.5 font-mono-d text-[22px] text-[#706a64]" aria-hidden="true">
              {Array.from({ length: index === 1 ? 4 : 6 }, (_, digit) => (
                <span key={digit} className="swap-digit" style={{ animationDelay: `${-(digit + index) * 91}ms` }}>
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

function QuotePanel({ quote, elapsedMs }: { quote: ScoutSwapQuote; elapsedMs: number }) {
  const stale = elapsedMs >= quote.freshForMs;
  const seconds = Math.max(0, Math.ceil((quote.freshForMs - elapsedMs) / 1000));
  const simulationOkay = quote.simulation.status === "passed";
  const gas = quote.estimatedGas.usdAmount
    ? `$${quote.estimatedGas.usdAmount}`
    : quote.estimatedGas.nativeAmount
      ? `${quote.estimatedGas.nativeAmount} ETH`
      : "Not supplied";
  const impact = quote.priceImpactPercent === null ? "Not supplied" : `${quote.priceImpactPercent.toFixed(2)}%`;
  const rate = Number(quote.input.amount) > 0
    ? `${(Number(quote.output.amount) / Number(quote.input.amount)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${quote.output.symbol}`
    : "—";

  return (
    <div data-testid="swap-quote" className="result-materialize space-y-4">
      <div className={`flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        stale ? "border-[#fa6c34]/50 bg-[#fa6c34]/10" : "border-[#7fb069]/40 bg-[#7fb069]/10"
      }`}>
        <div className="flex items-center gap-2.5">
          {stale ? <Clock3 size={15} className="text-[#fa6c34]" /> : <CheckCircle2 size={15} className="text-[#7fb069]" />}
          <span className={`font-mono-d text-[10.5px] tracking-[0.12em] ${stale ? "text-[#fa6c34]" : "text-[#7fb069]"}`}>
            {stale ? "PREVIEW EXPIRED — NOT A CURRENT QUOTE" : `LIVE PREVIEW · ${seconds}S LEFT`}
          </span>
        </div>
        <span className="font-mono-d text-[9.5px] text-[#7f7972]">
          {quote.provider.cached ? "SAFE CACHE" : "NEW PROVIDER RESPONSE"} · {new Date(quote.quotedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>

      <div className="clip-panel overflow-hidden border border-[#383838] bg-[#383838]">
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="EXPECTED OUTPUT" value={`${quote.output.amount} ${quote.output.symbol}`} note={`1 ${quote.input.symbol} ≈ ${rate}`} tone="good" />
          <Metric
            label="MINIMUM RECEIVED"
            value={`${quote.output.minimumReceived} ${quote.output.symbol}`}
            note={quote.output.minimumSource === "provider"
              ? `Uniswap minimum · ${quote.slippageTolerancePercent}% tolerance`
              : `Derived preview floor · ${quote.slippageTolerancePercent}% tolerance`}
          />
          <Metric label="PRICE IMPACT" value={impact} note={quote.priceImpactPercent === null ? "Uniswap did not return this field" : "Estimated pool-price movement"} tone={(quote.priceImpactPercent ?? 0) >= 1 ? "warn" : "neutral"} />
          <Metric label="ESTIMATED ROUTE COST" value={gas} note={quote.estimatedGas.paidBy === "filler_or_user" ? "UniswapX cost responsibility varies; the official app confirms it" : "Selected-route estimate; approval gas may be additional"} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Route size={15} className="text-[#7cc4f8]" />
              <h2 className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">ROUTE EXPLAINED</h2>
            </div>
            <span className="border border-[#7cc4f8]/30 bg-[#7cc4f8]/10 px-2.5 py-1 font-mono-d text-[9px] tracking-wider text-[#7cc4f8]">{quote.route.routing}</span>
          </div>
          <p className="mt-5 text-[19px] leading-snug text-[#e9e0d1]">{quote.route.label}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="border border-[#383838] bg-[#1d1d1d] p-4">
              <p className="font-mono-d text-[9px] tracking-wider text-[#635d5a]">SIMULATION</p>
              <div className="mt-2 flex items-center gap-2">
                {simulationOkay ? <Check size={14} className="text-[#7fb069]" /> : <AlertTriangle size={14} className="text-[#fa6c34]" />}
                <span className={simulationOkay ? "text-[12px] text-[#7fb069]" : "text-[12px] text-[#fa6c34]"}>
                  {quote.simulation.status === "passed"
                    ? "Provider route check passed"
                    : quote.simulation.status === "warning"
                      ? "Preview simulation limited — Uniswap rechecks"
                      : "Provider reported a route issue"}
                </span>
              </div>
            </div>
            <div className="border border-[#383838] bg-[#1d1d1d] p-4">
              <p className="font-mono-d text-[9px] tracking-wider text-[#635d5a]">APPROVAL</p>
              <p className="mt-2 text-[12px] text-[#9a938a]">{quote.approvalMayBeRequired ? "Uniswap may request token approval" : "No token approval indicated"}</p>
            </div>
          </div>
        </section>

        <section className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <LockKeyhole size={15} className="text-[#fa6c34]" />
            <h2 className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">UNSIGNED PLAN</h2>
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-[#b6aea4]">{quote.transactionPreview.action}</p>
          <dl className="mt-5 space-y-3 border-t border-[#383838] pt-4 font-mono-d text-[9.5px]">
            <div className="flex justify-between gap-4"><dt className="text-[#635d5a]">CHAIN</dt><dd className="text-[#9a938a]">4663</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#635d5a]">USER WALLET</dt><dd className="text-[#7fb069]">NOT SHARED</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[#635d5a]">CHAINSCOUT</dt><dd className="text-[#7fb069]">CANNOT SIGN / SEND</dd></div>
          </dl>
        </section>
      </div>

      <section className="clip-panel border border-[#383838] bg-[#202020] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Info size={15} className="mt-0.5 shrink-0 text-[#fa6c34]" />
          <div>
            <h2 className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#d6ccba]">BEFORE YOU CONTINUE</h2>
            <ul className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-[#8f8880]">
              {quote.disclosures.map((disclosure) => <li key={disclosure}>— {disclosure}</li>)}
            </ul>
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
          <p className="font-mono-d text-[12px] font-semibold tracking-[0.12em]">{stale || !simulationOkay ? "OPEN UNISWAP FOR A NEW QUOTE" : "CONTINUE IN OFFICIAL UNISWAP"}</p>
          <p className="mt-1 text-[11px] text-[#1d1d1d]/70">Pair and amount are prefilled; Uniswap independently requotes.</p>
        </div>
        <ArrowUpRight size={20} className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>
    </div>
  );
}

export default function ScoutSwap() {
  const [direction, setDirection] = useState<SwapDirection>("WETH_TO_USDG");
  const [amount, setAmount] = useState("0.01");
  const [quote, setQuote] = useState<ScoutSwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [quoteReceivedAtMs, setQuoteReceivedAtMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const input = direction === "WETH_TO_USDG" ? SWAP_TOKENS.WETH : SWAP_TOKENS.USDG;
  const output = direction === "WETH_TO_USDG" ? SWAP_TOKENS.USDG : SWAP_TOKENS.WETH;
  const directUrl = useMemo(() => officialUniswapUrl(direction, amount), [direction, amount]);
  const amountValid = /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) && Number(amount) > 0 && (amount.split(".")[1]?.length ?? 0) <= input.decimals;

  useEffect(() => {
    if (!quote || quoteReceivedAtMs === null) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, performance.now() - quoteReceivedAtMs));
    }, 250);
    return () => window.clearInterval(timer);
  }, [quote, quoteReceivedAtMs]);

  const changeDirection = () => {
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
    try {
      const next = await getScoutSwapQuote({ direction, amount });
      setQuoteReceivedAtMs(performance.now());
      setElapsedMs(0);
      setQuote(next);
    } catch (requestError) {
      const code = requestError instanceof ApiError ? requestError.code : "SWAP_PROVIDER_UNAVAILABLE";
      const message = code === "SCOUT_SWAP_DISABLED"
        ? "Live previews are paused right now. You can still open the official Uniswap app safely."
        : code === "SWAP_NO_ROUTE"
          ? "Uniswap could not find a route for that amount. Try a smaller amount or continue in Uniswap."
          : code === "SWAP_RATE_LIMITED"
            ? "Live previews are cooling down for a minute. Uniswap can still fetch a new quote directly."
            : requestError instanceof Error ? requestError.message : "Live Uniswap previews are temporarily unavailable.";
      setError({ code, message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label="ChainScout home">
          <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}>
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">CHAINSCOUT</span>
        </Link>
        <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a] sm:text-[10.5px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
          SCOUT SWAP · PUBLIC PREVIEW
        </div>
        <div className="flex items-center gap-2">
          <Link to="/roadmap" className="hidden px-3 py-2 font-mono-d text-[10px] text-[#7f7972] transition-colors hover:text-[#e9e0d1] md:block">ROADMAP</Link>
          <span className="border border-[#7fb069]/40 bg-[#7fb069]/10 px-3 py-2 font-mono-d text-[9px] text-[#7fb069] sm:text-[10px]">
            NO WALLET DATA
          </span>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1180px] px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <div className="pointer-events-none absolute right-0 top-0 h-[420px] w-[420px] rounded-full bg-[#fa6c34]/[0.045] blur-3xl" />
        <Link to="/" className="relative inline-flex items-center gap-2 font-mono-d text-[10px] tracking-wider text-[#635d5a] transition-colors hover:text-[#e9e0d1]"><ArrowLeft size={12} /> BACK HOME</Link>

        <div className="relative mt-10 grid items-end gap-8 lg:grid-cols-[1fr_0.72fr]">
          <div>
            <p className="font-mono-d text-[10px] tracking-[0.22em] text-[#fa6c34]">RELEASE 01 · LIVE ROUTE, QUIET HANDOFF</p>
            <h1 className="mt-5 max-w-[760px] font-serif-d text-[clamp(48px,7vw,88px)] leading-[0.93] tracking-[-0.045em] text-[#e9e0d1]">See the trade<br /><span className="text-[#fa6c34]">before the trade.</span></h1>
          </div>
          <div className="border-l border-[#383838] pl-5 sm:pl-7">
            <p className="text-[14px] leading-relaxed text-[#9a938a]">Preview a current WETH/USDG route in plain English. ChainScout explains; the official Uniswap app independently requotes and handles every approval, signature, and transaction.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["NO SIGNING", "NO BROADCAST", "30S FRESHNESS", "CHAIN 4663"].map((item) => <span key={item} className="border border-[#383838] bg-[#242424] px-2.5 py-1.5 font-mono-d text-[9px] tracking-wider text-[#7f7972]">{item}</span>)}
            </div>
          </div>
        </div>

        <div className="relative mt-12 grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <form onSubmit={fetchQuote} className="clip-panel h-fit border border-[#383838] bg-[#242424] p-5 sm:p-6 lg:sticky lg:top-[88px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">YOU SEND</p>
                <p className="mt-1 text-[12px] text-[#9a938a]">Exact input preview</p>
              </div>
              <span className="flex items-center gap-1.5 border border-[#7fb069]/30 bg-[#7fb069]/10 px-2.5 py-1 font-mono-d text-[9px] text-[#7fb069]"><ShieldCheck size={11} /> READ-ONLY</span>
            </div>

            <div className="mt-5 flex items-center gap-3 border border-[#383838] bg-[#1d1d1d] p-4 focus-within:border-[#fa6c34]">
              <TokenMark symbol={input.symbol} />
              <div className="min-w-0 flex-1">
                <label htmlFor="swap-amount" className="font-mono-d text-[10px] text-[#635d5a]">{input.name}</label>
                <input id="swap-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => { setAmount(event.target.value); setQuote(null); setError(null); }} className="mt-1 w-full bg-transparent font-mono-d text-[28px] tracking-[-0.04em] text-[#e9e0d1] outline-none placeholder:text-[#4c4844]" placeholder="0.0" aria-describedby={!amountValid && amount ? "swap-amount-error" : undefined} />
              </div>
              <span className="font-mono-d text-[12px] text-[#9a938a]">{input.symbol}</span>
            </div>
            {!amountValid && amount && <p id="swap-amount-error" role="alert" className="mt-2 text-[11px] text-[#e0738a]">Enter a positive amount with no more than {input.decimals} decimal places.</p>}

            <div className="relative my-3 flex items-center justify-center">
              <div className="absolute inset-x-0 top-1/2 border-t border-[#383838]" />
              <button type="button" onClick={changeDirection} aria-label="Reverse token direction" className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#4a4642] bg-[#2a2928] text-[#fa6c34] transition-transform hover:rotate-180 hover:border-[#fa6c34]">
                <ArrowDownUp size={15} />
              </button>
            </div>

            <div className="flex items-center gap-3 border border-[#383838] bg-[#202020] p-4">
              <TokenMark symbol={output.symbol} />
              <div className="flex-1">
                <p className="font-mono-d text-[10px] text-[#635d5a]">YOU RECEIVE</p>
                <p className="mt-1 font-mono-d text-[19px] text-[#9a938a]">Calculated live</p>
              </div>
              <span className="font-mono-d text-[12px] text-[#9a938a]">{output.symbol}</span>
            </div>

            <button type="submit" disabled={!amountValid || loading} className="clip-btn mt-5 flex w-full items-center justify-center gap-2 bg-[#fa6c34] py-4 font-mono-d text-[11px] font-semibold tracking-[0.14em] text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:cursor-not-allowed disabled:opacity-40">
              {loading ? <><RefreshCw size={14} className="animate-spin" /> FETCHING LIVE ROUTE…</> : <><Zap size={14} /> GET LIVE PREVIEW</>}
            </button>
            <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[#635d5a]">No wallet is requested or shared. The official Uniswap app handles wallet context only after you choose to continue.</p>
          </form>

          <div className="min-w-0">
            {loading && <LoadingQuote />}
            {error && !loading && (
              <div data-testid="swap-error" role="alert" className="clip-panel border border-[#fa6c34]/40 bg-[#242424] p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                  <div>
                    <p className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#fa6c34]">LIVE PREVIEW UNAVAILABLE</p>
                    <p className="mt-3 text-[14px] leading-relaxed text-[#b6aea4]">{error.message}</p>
                    <p className="mt-2 font-mono-d text-[9px] text-[#635d5a]">{error.code}</p>
                  </div>
                </div>
                <a href={directUrl} target="_blank" rel="noreferrer" className="clip-btn mt-6 flex items-center justify-between bg-[#e9e0d1] px-5 py-4 font-mono-d text-[11px] font-semibold tracking-wider text-[#1d1d1d]">
                  OPEN OFFICIAL UNISWAP FOR A NEW QUOTE <ExternalLink size={15} />
                </a>
              </div>
            )}
            {quote && !loading && <QuotePanel quote={quote} elapsedMs={elapsedMs} />}
            {!quote && !loading && !error && (
              <div className="clip-panel flex min-h-[480px] flex-col justify-between border border-[#383838] bg-[#202020] p-6 sm:p-8">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center border border-[#383838] bg-[#242424] text-[#fa6c34]"><Route size={20} /></div>
                  <h2 className="mt-7 font-serif-d text-[34px] leading-tight text-[#e9e0d1]">A useful answer,<br />before a risky action.</h2>
                  <p className="mt-4 max-w-[520px] text-[13px] leading-relaxed text-[#8f8880]">ChainScout asks Uniswap for a current route, then translates the response into the five details a beginner actually needs.</p>
                </div>
                <div className="mt-10 grid gap-px overflow-hidden border border-[#383838] bg-[#383838] sm:grid-cols-2">
                  {[
                    { icon: Sparkles, label: "Expected output", note: "What the route currently estimates" },
                    { icon: Route, label: "Route & simulation", note: "How Uniswap plans to get there" },
                    { icon: Fuel, label: "Costs & impact", note: "What can reduce the final outcome" },
                    { icon: ExternalLink, label: "Official handoff", note: "Uniswap requotes before anything happens" },
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
