import { OPSIS_PRESENTATION } from "../opsis/presentation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSwapQuote, type SwapQuote, type SwapDirection } from "../swap/api";
import { LocalHistory, SavedConversation } from "../private/LocalHistory";
import { useLocalHistory } from "../private/useLocalHistory";
import { useI18n } from "../i18n";
import type { VaultConversation } from "../vault/types";
import { scenario, units } from "./model";
import { TradeCard } from "./TradeCard";
import { OnchainQuoteDetails } from "../swap/OnchainQuoteDetails";

export default function TradeSimulator() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<SwapDirection>("WETH_TO_USDG");
  const [amount, setAmount] = useState("0.01"), [weth, setWeth] = useState(""), [usdg, setUsdg] = useState(""), [reference, setReference] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [clock, setClock] = useState(() => Date.now());
  const [deadline, setDeadline] = useState(0), [monotonic, setMonotonic] = useState(0);
  const [saved, setSaved] = useState<VaultConversation | null>(null);
  const resultPanel = useRef<HTMLDivElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const clear = useCallback(() => { request.current?.abort(); setQuote(null); setSaved(null); setWeth(""); setUsdg(""); setReference(""); setAmount("0.01"); setError(""); setBusy(false); }, []);
  const history = useLocalHistory(clear);
  useEffect(() => { const id = setInterval(() => { setClock(Date.now()); setMonotonic(performance.now()); }, 250); return () => { clearInterval(id); request.current?.abort(); }; }, []);
  useEffect(() => {
    if (!quote || !resultPanel.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultPanel.current.focus({ preventScroll: true });
    resultPanel.current.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
    if (!reduceMotion) resultPanel.current.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 280, easing: "ease-out" });
  }, [quote]);
  const invalidate = () => { request.current?.abort(); setQuote(null); setBusy(false); setError(""); };
  const scenarioLabel = (name: string) => name === "before" ? t("trade.simulator.scenarioBefore") : name === "after" ? t("trade.simulator.scenarioAfter") : t("trade.simulator.scenarioMinimum");
  let result: ReturnType<typeof scenario> | null = null, invalid = "";
  if (quote) { try { if (monotonic >= deadline) throw new Error(t("trade.error.quoteExpired")); result = scenario(quote, weth, usdg, reference, clock); } catch (failure) { invalid = (failure as Error).message; } }
  const preview = async (example?: SwapDirection) => {
    invalidate();
    const inputs = example ? { direction: example, amount: example === "WETH_TO_USDG" ? "0.01" : "25", weth: "1", usdg: "500", reference: "2500" } : { direction, amount, weth, usdg, reference };
    if (example) { setDirection(inputs.direction); setAmount(inputs.amount); setWeth(inputs.weth); setUsdg(inputs.usdg); setReference(inputs.reference); setSaved(null); }
    const controller = new AbortController(); request.current = controller;
    try {
      units(inputs.weth); units(inputs.usdg); if (units(inputs.reference) <= 0n) throw new Error(t("trade.simulator.errorReference")); if (units(inputs.amount) <= 0n) throw new Error(t("trade.simulator.errorAmount"));
      if (units(inputs.amount) > units(inputs.direction === "WETH_TO_USDG" ? inputs.weth : inputs.usdg)) throw new Error(t("trade.error.insufficientBalance"));
      setBusy(true);
      const next = await getSwapQuote({ direction: inputs.direction, amount: inputs.amount }, controller.signal, true);
      if (!controller.signal.aborted) { const received = performance.now(); setDeadline(received + next.freshForMs); setMonotonic(received); setClock(Date.now()); setQuote(next); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t("trade.simulator.errorUnavailable")); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const save = async () => {
    if (!quote || !result) return;
    try {
      if (performance.now() >= deadline) throw new Error(t("trade.error.quoteExpired"));
      const checked = scenario(quote, weth, usdg, reference);
      await history.save({ question: t("trade.simulator.historyQuestion", { input: quote.input.amount, inputSymbol: quote.input.symbol, outputSymbol: quote.output.symbol }), entity: quote.input.address,
        answer: t("trade.simulator.historyAnswer", { reference }),
        bullets: [...Object.entries(checked).map(([name, value]) => t("trade.simulator.historyBullet", { name: scenarioLabel(name), weth: value.WETH, usdg: value.USDG, percent: value.wethPercent })), t("trade.simulator.historyMeta", { quotedAt: quote.quotedAt, expiresAt: quote.expiresAt, requestId: quote.provider.requestId }), t("trade.simulator.historyGas", { gas: quote.estimatedGas.nativeAmount ?? t("trade.common.unknown") }), t("trade.simulator.historyExcluded")],
        sources: [{ label: t("trade.simulator.sourceUniswap"), url: null, fetchedAt: quote.quotedAt }], savedAt: new Date().toISOString() }, null, history.generation.current);
    } catch (failure) { setError((failure as Error).message); }
  };
  return <main className="mx-auto max-w-5xl space-y-6 p-6 text-[#e9e0d1]">
    {!OPSIS_PRESENTATION && <><h1 className="text-4xl">{t("trade.simulator.title")}</h1><p>{t("trade.simulator.description")}</p></>}
    <section aria-label={t("trade.simulator.tryAria")} className="border border-[#fa6c34] bg-[#242424] p-5 sm:p-7">
      <p className="font-mono text-sm uppercase tracking-widest text-[#fa6c34]">{t("trade.simulator.tryEyebrow")}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t("trade.simulator.tryTitle")}</h2>
      <p className="mt-3 text-base text-[#b5ada2]">{t("trade.simulator.tryBody")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button disabled={busy} onClick={() => void preview("WETH_TO_USDG")} className="min-h-14 border border-[#fa6c34] bg-[#fa6c34] p-4 text-left font-semibold text-[#1d1d1d] disabled:opacity-50">{t("trade.simulator.exampleWeth")}</button>
        <button disabled={busy} onClick={() => void preview("USDG_TO_WETH")} className="min-h-14 border border-[#fa6c34] p-4 text-left font-semibold text-[#fa6c34] disabled:opacity-50">{t("trade.simulator.exampleUsdg")}</button>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[#b5ada2]">{t("trade.simulator.examplesNote")}</p>
    </section>
    {busy && <p role="status" className="border-l-2 border-[#fa6c34] p-3 motion-safe:animate-pulse">{t("trade.simulator.busy")}</p>}
    {(error || invalid) && <p role="alert">{error || invalid}</p>}
    {result && quote && <div ref={resultPanel} role="region" aria-label={t("trade.simulator.resultAria")} tabIndex={-1} className="scroll-mt-28 outline-none focus-visible:ring-2 focus-visible:ring-[#fa6c34]"><TradeCard key={quote.quotedAt + quote.input.symbol + quote.input.amount} quote={quote} weth={weth} usdg={usdg} reference={reference} deadline={deadline} /></div>}
    <h2 className="text-2xl">{t("trade.simulator.makeItYours")}</h2>
    <div className="grid gap-4 border border-[#555] bg-[#242424] p-5 sm:grid-cols-2">
      <label>{t("trade.simulator.direction")}<select className="block w-full bg-[#1d1d1d] p-3" value={direction} onChange={e => { invalidate(); setDirection(e.target.value as SwapDirection); }}><option value="WETH_TO_USDG">{t("trade.simulator.directionWethToUsdg")}</option><option value="USDG_TO_WETH">{t("trade.simulator.directionUsdgToWeth")}</option></select></label>
      {[[t("trade.simulator.tradeAmount"), amount, setAmount], [t("trade.simulator.wethBalance"), weth, setWeth], [t("trade.simulator.usdgBalance"), usdg, setUsdg], [t("trade.simulator.referencePrice"), reference, setReference]].map(([label, value, setter]) => <label key={label as string}>{label as string}<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" inputMode="decimal" maxLength={40} value={value as string} onChange={e => { invalidate(); (setter as (value: string) => void)(e.target.value); }} /></label>)}
      <button disabled={busy} className="min-h-[44px] bg-[#fa6c34] p-3 text-black disabled:opacity-50" onClick={() => void preview()}>{busy ? t("trade.simulator.gettingQuote") : t("trade.simulator.requestQuote")}</button>
    </div>
    {result && quote && <section className="space-y-4"><OnchainQuoteDetails quote={quote} /><h2 className="text-2xl">{t("trade.simulator.beforeAfter")}</h2><div className="overflow-x-auto"><table className="w-full text-left"><caption>{t("trade.simulator.caption")}</caption><thead><tr><th>{t("trade.simulator.tableScenario")}</th><th>{t("trade.simulator.tableWeth")}</th><th>{t("trade.simulator.tableUsdg")}</th><th>{t("trade.simulator.tableWethShare")}</th></tr></thead><tbody>{Object.entries(result).map(([name, values]) => <tr key={name}><th className="p-3">{scenarioLabel(name)}</th><td>{values.WETH}</td><td>{values.USDG}</td><td>{values.wethPercent}%</td></tr>)}</tbody></table></div><p>{t("trade.simulator.priceImpactLine", { impact: quote.priceImpactPercent === null ? t("trade.common.unknown") : `${quote.priceImpactPercent}%`, gas: quote.estimatedGas.nativeAmount ?? t("trade.common.unknown") })}</p><p>{quote.simulation.reasons.join(" ")}</p><p>{t("trade.simulator.quoteExpires", { time: new Date(quote.expiresAt).toLocaleTimeString() })}</p><button className="min-h-[44px] border border-[#fa6c34] p-3 text-[#fa6c34] disabled:opacity-50" disabled={history.phase !== "unlocked"} onClick={() => void save()}>{t("trade.simulator.saveReport")}</button><a className="block text-[#fa6c34] underline" href={quote.handoffUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("trade.simulator.openUniswap")}</a></section>}
    <LocalHistory reports history={history} selected={saved?.id ?? null} onSelect={setSaved} onNew={() => setSaved(null)} pending={busy} />
    {saved && <SavedConversation conversation={saved} />}
  </main>;
}
