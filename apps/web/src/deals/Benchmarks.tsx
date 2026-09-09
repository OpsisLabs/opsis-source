import { useEffect, useRef, useState } from "react";
import type { BenchmarkInput, CardBenchmark } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";

export function Benchmarks() {
  const [provider, setProvider] = useState<BenchmarkInput["provider"]>("tcgdex");
  const [cardId, setCardId] = useState("");
  const [result, setResult] = useState<CardBenchmark | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  function clear() { pending.current?.abort(); pending.current = null; setResult(null); setError(""); setBusy(false); }
  async function lookup() {
    clear();
    const controller = new AbortController(); pending.current = controller; setBusy(true);
    try {
      const data = await privateApi<CardBenchmark>("/v1/private/deals/benchmark", { provider, cardId: cardId.trim() }, controller.signal);
      if (controller.signal.aborted) return;
      const expectedUrl = provider === "tcgdex" ? `https://api.tcgdex.net/v2/en/cards/${cardId.trim()}` : `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${cardId.trim()}`;
      if (data.provider !== provider || data.cardId !== cardId.trim() || data.sourceUrl !== expectedUrl ||
        typeof data.name !== "string" || !Number.isFinite(Date.parse(data.fetchedAt)) || !Array.isArray(data.rows) || data.rows.length > 100 ||
        data.rows.some(row => !Number.isFinite(row.amount) || row.amount <= 0 || !["USD", "EUR"].includes(row.currency) ||
          typeof row.market !== "string" || typeof row.variant !== "string" || typeof row.metric !== "string" ||
          (row.updatedAt !== null && !Number.isFinite(Date.parse(row.updatedAt))))) throw new Error("The reference response could not be verified.");
      setResult(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Reference prices unavailable."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const valid = provider === "tcgdex" ? /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(cardId.trim()) : /^\d{1,8}$/.test(cardId.trim());
  return <section aria-label="Free card price references" className="space-y-4 border border-[#555] bg-[#242424] p-5 text-[#e9e0d1]">
    <h2 className="text-2xl">Check the price context</h2>
    <p>Free Pokémon and Yu-Gi-Oh! reference prices across supported markets. Not live inventory, sold-listing evidence, graded-card valuations or guaranteed deals.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Card game<select aria-label="Card game" className="mt-2 block w-full bg-[#1d1d1d] p-3" value={provider} onChange={e => { clear(); setProvider(e.target.value as BenchmarkInput["provider"]); setCardId(""); }}>
        <option value="tcgdex">Pokémon · TCGdex</option><option value="ygoprodeck">Yu-Gi-Oh! · YGOPRODeck</option>
      </select></label>
      <label>Public catalog card ID<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" maxLength={80} value={cardId} onChange={e => { clear(); setCardId(e.target.value); }} /></label>
    </div>
    <button className="min-h-11 text-[#fa6c34] underline" onClick={() => { clear(); setCardId(provider === "tcgdex" ? "base1-4" : "46986414"); }}>Use example: {provider === "tcgdex" ? "Charizard · Base Set 4" : "Dark Magician"}</button>
    <p className="text-sm">Clicking below sends only this public card ID and provider choice to ChainScout, then the ID to {provider === "tcgdex" ? "TCGdex" : "YGOPRODeck"}. No wallet, ownership, grade, notes or purchase prices are sent. Public reference responses may be cached; this view is not saved to your Vault.</p>
    <button className="min-h-11 bg-[#fa6c34] px-4 py-3 text-[#1d1d1d] disabled:opacity-50" disabled={!valid || busy} onClick={() => void lookup()}>{busy ? "Loading reference prices…" : "Fetch public price references"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div className="space-y-3">
      <h3 className="text-xl">{result.name} · {result.cardId}</h3>
      <p>Retrieved {new Date(result.fetchedAt).toLocaleString()}. Retrieval time is not the market price update time.</p>
      <p>{result.provider === "tcgdex" ? "TCGdex reports known marketplace/printing mapping issues. Verify the exact variant; these references do not price your condition or grade." : "YGOPRODeck reports lows across multiple versions. They do not match your exact printing, condition or grade; upstream responses may be cached for two days."}</p>
      {!result.rows.length && <p role="status">No usable reference prices returned. Missing prices do not mean zero value.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">{result.rows.map((row, index) => <li key={index} className="min-w-0 break-words border border-[#555] p-3">
        <p>{row.market} · {row.variant} · {row.metric}</p>
        <p className="text-xl">{row.currency} {row.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
        <p className="text-sm">{row.updatedAt ? `Provider updated ${new Date(row.updatedAt).toLocaleString()} · Historical reference, not a live quote` : "Provider price timestamp unknown—not certified current"}</p>
      </li>)}</ul>
      <a className="inline-block min-h-11 text-[#fa6c34] underline break-all" href={result.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Inspect provider response</a>
    </div>}
  </section>;
}
