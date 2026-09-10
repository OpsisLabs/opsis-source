import { useCallback, useEffect, useRef, useState } from "react";
import { getScoutSwapQuote, type ScoutSwapQuote, type SwapDirection } from "../swap/api";
import { LocalHistory, SavedConversation } from "../private/LocalHistory";
import { useLocalHistory } from "../private/useLocalHistory";
import type { VaultConversation } from "../vault/types";
import { scenario, units } from "./model";

export default function TradeSimulator() {
  const [direction, setDirection] = useState<SwapDirection>("WETH_TO_USDG");
  const [amount, setAmount] = useState("0.01"), [weth, setWeth] = useState(""), [usdg, setUsdg] = useState(""), [reference, setReference] = useState("");
  const [quote, setQuote] = useState<ScoutSwapQuote | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [clock, setClock] = useState(() => Date.now());
  const [deadline, setDeadline] = useState(0), [monotonic, setMonotonic] = useState(0);
  const [saved, setSaved] = useState<VaultConversation | null>(null);
  const request = useRef<AbortController | null>(null);
  const clear = useCallback(() => { request.current?.abort(); setQuote(null); setSaved(null); setWeth(""); setUsdg(""); setReference(""); setAmount("0.01"); setError(""); setBusy(false); }, []);
  const history = useLocalHistory(clear);
  useEffect(() => { const id = setInterval(() => { setClock(Date.now()); setMonotonic(performance.now()); }, 250); return () => { clearInterval(id); request.current?.abort(); }; }, []);
  const invalidate = () => { request.current?.abort(); setQuote(null); setBusy(false); setError(""); };
  let result: ReturnType<typeof scenario> | null = null, invalid = "";
  if (quote) { try { if (monotonic >= deadline) throw new Error("Quote expired. Request a fresh preview."); result = scenario(quote, weth, usdg, reference, clock); } catch (failure) { invalid = (failure as Error).message; } }
  const preview = async () => {
    invalidate();
    const controller = new AbortController(); request.current = controller;
    try {
      units(weth); units(usdg); units(reference); if (units(amount) <= 0n) throw new Error("Enter a positive amount.");
      setBusy(true);
      const next = await getScoutSwapQuote({ direction, amount }, controller.signal, true);
      if (!controller.signal.aborted) { const received = performance.now(); setDeadline(received + next.freshForMs); setMonotonic(received); setClock(Date.now()); setQuote(next); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Quote unavailable."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const save = async () => {
    if (!quote || !result) return;
    try {
      if (performance.now() >= deadline) throw new Error("Quote expired. Request a fresh preview.");
      const checked = scenario(quote, weth, usdg, reference);
      await history.save({ question: `Trade scenario: ${quote.input.amount} ${quote.input.symbol} → ${quote.output.symbol}`, entity: quote.input.address,
        answer: `Historical what-if report, not a live quote or executed trade. User-entered WETH reference: ${reference} USDG. Entered balances are not wallet-verified.`,
        bullets: [...Object.entries(checked).map(([name, value]) => `${name}: ${value.WETH} WETH + ${value.USDG} USDG; WETH allocation ${value.wethPercent}% at the entered reference.`), `Quote time: ${quote.quotedAt}. Expiry: ${quote.expiresAt}. Provider reference: ${quote.provider.requestId}.`, `Gas estimate: ${quote.estimatedGas.nativeAmount ?? "unknown"} ETH; excluded from the two-token allocation.`, "Approval costs, other assets and execution differences are not included."],
        sources: [{ label: "Uniswap quote", url: null, fetchedAt: quote.quotedAt }], savedAt: new Date().toISOString() }, null, history.generation.current);
    } catch (failure) { setError((failure as Error).message); }
  };
  return <main className="mx-auto max-w-5xl space-y-6 p-6 text-[#e9e0d1]">
    <h1 className="text-4xl">Trade Simulator</h1><p>Compare a WETH/USDG what-if with a fresh quote. Your balances and reference price stay in this browser; only the pair and trade amount go to ChainScout and Uniswap. No signing or execution.</p>
    <LocalHistory reports history={history} selected={saved?.id ?? null} onSelect={setSaved} onNew={() => setSaved(null)} pending={busy} />
    {saved && <SavedConversation conversation={saved} />}
    <div className="grid gap-4 border border-[#555] bg-[#242424] p-5 sm:grid-cols-2">
      <label>Direction<select className="block w-full bg-[#1d1d1d] p-3" value={direction} onChange={e => { invalidate(); setDirection(e.target.value as SwapDirection); }}><option value="WETH_TO_USDG">WETH → USDG</option><option value="USDG_TO_WETH">USDG → WETH</option></select></label>
      {[["Trade amount", amount, setAmount], ["Your WETH balance", weth, setWeth], ["Your USDG balance", usdg, setUsdg], ["WETH reference price in USDG", reference, setReference]].map(([label, value, setter]) => <label key={label as string}>{label as string}<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" inputMode="decimal" maxLength={40} value={value as string} onChange={e => { invalidate(); (setter as (value: string) => void)(e.target.value); }} /></label>)}
      <button disabled={busy} className="min-h-[44px] bg-[#fa6c34] p-3 text-black disabled:opacity-50" onClick={() => void preview()}>{busy ? "Getting quote…" : "Request quote & compare"}</button>
    </div>
    {(error || invalid) && <p role="alert">{error || invalid}</p>}
    {result && quote && <section className="space-y-4"><h2 className="text-2xl">Before and after</h2><div className="overflow-x-auto"><table className="w-full text-left"><caption>Two-token allocation at your entered reference—not USD valuation or profit.</caption><thead><tr><th>Scenario</th><th>WETH</th><th>USDG</th><th>WETH share</th></tr></thead><tbody>{Object.entries(result).map(([name, values]) => <tr key={name}><th className="p-3">{name}</th><td>{values.WETH}</td><td>{values.USDG}</td><td>{values.wethPercent}%</td></tr>)}</tbody></table></div><p>Price impact: {quote.priceImpactPercent === null ? "unknown" : `${quote.priceImpactPercent}%`}. Gas estimate: {quote.estimatedGas.nativeAmount ?? "unknown"} ETH, excluded above. ETH is separate from WETH. Check native ETH and any approval fees before execution.</p><p>{quote.simulation.reasons.join(" ")}</p><p>Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}. These entered balances are not verified. Quotes do not guarantee execution.</p><button className="min-h-[44px] border border-[#fa6c34] p-3 text-[#fa6c34] disabled:opacity-50" disabled={history.phase !== "unlocked"} onClick={() => void save()}>Save encrypted scenario report</button><a className="block text-[#fa6c34] underline" href={quote.handoffUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open official Uniswap for a new quote</a></section>}
  </main>;
}
