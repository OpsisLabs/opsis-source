import { useEffect, useRef, useState } from "react";
import type { BenchmarkInput, CardBenchmark, CollectibleSearchResponse } from "@rh-chain/shared";
import { ArrowDown, ArrowUpRight, Search, WalletCards } from "lucide-react";
import { privateApi } from "../dashboard/http";
import { collectibleDetail, searchCollectibles } from "../collectibles/api";
import { catalogImageToVaultPhoto } from "../collectibles/catalog-image";
import { CARD_EXAMPLES, checkedPrices, headlineReferences, metricName, priceText, validCardInput } from "./price-model";

const field = "mt-2 min-h-12 w-full border border-[#555] bg-[#1d1d1d] px-3 py-2 text-[#e9e0d1] outline-none focus-visible:border-[#fa6c34]";
const button = "min-h-12 bg-[#fa6c34] px-5 py-3 font-medium text-[#1d1d1d] outline-none hover:bg-[#ff8957] focus-visible:ring-2 focus-visible:ring-[#ffd0bc] disabled:opacity-50";

export default function CardPriceCheck() {
  const [input, setInput] = useState<BenchmarkInput>({ provider: "tcgdex", cardId: "" });
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<CollectibleSearchResponse | null>(null);
  const [result, setResult] = useState<CardBenchmark | null>(null);
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const photoPending = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { pending.current?.abort(); photoPending.current?.abort(); }, []);
  useEffect(() => {
    if (!result) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [result]);

  function clear() {
    pending.current?.abort(); photoPending.current?.abort(); pending.current = null; photoPending.current = null;
    setResult(null); setMatches(null); setError(""); setBusy(false); setPhoto(""); setPhotoError(""); setPhotoBusy(false);
  }
  async function lookup(selected: BenchmarkInput) {
    clear(); setInput(selected);
    if (!validCardInput(selected)) { setError("Use a public catalog card ID, not a URL, wallet address or private note."); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true);
    try {
      const data = checkedPrices(selected, await privateApi<unknown>("/v1/private/cards/prices", selected, controller.signal));
      if (controller.signal.aborted) return;
      setCurrency(data.rows.some(row => row.currency === "USD") ? "USD" : "EUR"); setResult(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Price references are unavailable. Please try again."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function search() {
    clear(); const controller = new AbortController(); pending.current = controller; setBusy(true);
    try {
      const data = await searchCollectibles({ language: "en", name: name.trim() }, controller.signal);
      if (!controller.signal.aborted) setMatches(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Card search is unavailable. The named examples still work."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function loadPhoto() {
    if (!result || result.provider !== "tcgdex") return;
    photoPending.current?.abort(); const controller = new AbortController(); photoPending.current = controller; setPhotoBusy(true); setPhotoError("");
    try {
      const detail = await collectibleDetail("en", result.cardId, controller.signal);
      if (!detail.card.imageUrl) throw new Error("No catalog photo is available for this card.");
      const image = await catalogImageToVaultPhoto(detail.card.imageUrl, result.cardId, controller.signal);
      if (!controller.signal.aborted) setPhoto(image.dataUrl);
    } catch (cause) { if (!controller.signal.aborted) setPhotoError(cause instanceof Error ? cause.message : "Card photo unavailable; prices are unchanged."); }
    finally { if (!controller.signal.aborted) setPhotoBusy(false); }
  }

  const headlines = result ? headlineReferences(result, currency) : [];
  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-[#e9e0d1] sm:px-8 sm:py-12">
    <header className="grid gap-6 border-b border-[#45403b] pb-8 sm:grid-cols-[1fr_auto]">
      <div>
        <p className="mb-4 font-mono text-xs tracking-[.16em] text-[#fa6c34]">CARD PRICE CHECK · NO WALLET NEEDED</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.04em] sm:text-6xl">What’s that card<br />going for<span className="text-[#fa6c34]">?</span></h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#b8b0a7]">Pick a card. Check price references across supported markets. Get some context before your next collectible rabbit hole.</p>
      </div>
      <div className="hidden self-center border border-[#635043] bg-[#28221e] p-6 text-[#fa6c34] sm:block" aria-hidden="true"><WalletCards size={72} strokeWidth={1.2} /><p className="mt-4 font-mono text-xs">PICK → CHECK</p></div>
    </header>
    <section aria-label="One-click card examples" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl">Start with a familiar face.</h2><p className="text-sm text-[#b8b0a7]">Real provider references. Not demo prices.</p></div>
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">{CARD_EXAMPLES.map(card => <button key={card.cardId} type="button" disabled={busy} onClick={() => void lookup({ provider: card.provider, cardId: card.cardId })} aria-label={`Check ${card.name}`} className="group min-w-0 border border-[#504840] bg-[#242220] p-5 text-left outline-none transition-colors hover:border-[#fa6c34] hover:bg-[#2b2521] focus-visible:ring-2 focus-visible:ring-[#ffd0bc] disabled:opacity-50">
        <div className="mb-5 flex items-center justify-between"><span className="flex h-12 min-w-12 items-center justify-center border px-2 font-mono text-lg" style={{ color: card.tone, borderColor: card.tone }}>{card.mark}</span><ArrowUpRight className="text-[#fa6c34] transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" size={20} /></div>
        <span className="block text-xl font-medium leading-tight">{card.name}</span><span className="mt-2 block text-xs leading-relaxed text-[#b8b0a7]">{card.detail}</span>
      </button>)}</div>
      <p className="text-sm leading-relaxed text-[#b8b0a7]">Clicking an example sends its public card ID to ChainScout and TCGdex (Pokémon) or YGOPRODeck (Yu-Gi-Oh!). No wallet, ownership details or purchase prices are sent. These are references—not live listings or graded-card appraisals.</p>
    </section>
    {busy && <p role="status" className="flex items-center gap-3 border border-[#635043] p-5"><span className="h-2 w-2 bg-[#fa6c34] motion-safe:animate-pulse" />Checking public sources…</p>}
    {error && <div role="alert" className="border border-[#8a5643] bg-[#2b211c] p-5"><p>{error}</p><p className="mt-2 text-sm">Nothing has been valued or saved. Try another example or retry your lookup.</p></div>}
    {result && <section aria-label="Card price snapshot" className="card-price-reveal space-y-5 border border-[#6a4b3b] bg-[#242220] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono text-xs tracking-widest text-[#fa6c34]">YOUR PRICE SNAPSHOT</p><h2 ref={heading} tabIndex={-1} className="mt-2 scroll-mt-8 text-3xl font-semibold outline-none sm:text-4xl">{result.name}</h2><p className="mt-2 break-all text-sm text-[#b8b0a7]">{result.provider === "tcgdex" ? "Pokémon · TCGdex" : "Yu-Gi-Oh! · YGOPRODeck"} · {result.cardId}</p></div>
        <div role="group" aria-label="Reference currency" className="flex border border-[#635043]">{(["USD", "EUR"] as const).map(value => <button key={value} aria-pressed={currency === value} onClick={() => setCurrency(value)} className={`min-h-12 min-w-20 px-5 outline-none focus-visible:ring-2 focus-visible:ring-[#ffd0bc] ${currency === value ? "bg-[#fa6c34] text-[#1d1d1d]" : "text-[#e9e0d1]"}`}>{value}</button>)}</div>
      </div>
      <p className="text-sm text-[#b8b0a7]">Currencies stay separate. No conversion or cheapest-offer ranking.</p>
      <div className={photo ? "grid items-start gap-6 md:grid-cols-[180px_1fr]" : ""}>
        {photo && <figure><img src={photo} alt={`${result.name} catalog card, not proof of condition or ownership`} className="mx-auto w-[180px] rounded-lg" /><figcaption className="mt-2 text-center text-xs text-[#b8b0a7]">Catalog photo via TCGdex</figcaption></figure>}
        <div className="grid gap-3 sm:grid-cols-2">{headlines.map((row, index) => <article key={`${currency}:${index}`} className="min-w-0 border border-[#4b443e] bg-[#1d1d1d] p-5">
          <h3 className="text-sm text-[#c3b8ad]">{row.market}</h3><p className="mt-3 break-words text-3xl font-semibold tracking-tight text-[#fa6c34]">{priceText(row.amount, row.currency)}</p>
          <p className="mt-3 font-medium">{metricName(row.metric)}</p><p className="mt-1 text-sm text-[#b8b0a7]">{row.variant}</p>
          <p className="mt-4 border-t border-[#403b36] pt-3 text-xs leading-relaxed text-[#b8b0a7]">{row.updatedAt ? `Source updated ${new Date(row.updatedAt).toLocaleString()}` : "Source price time unknown—not certified current"}</p>
        </article>)}</div>
      </div>
      {!headlines.length && <p role="status" className="border border-[#555] p-5">No usable {currency} price references returned. Missing prices do not mean zero value.{result.rows.length ? " Check the other currency." : " Try a different card."}</p>}
      {result.provider === "tcgdex" && !photo && <div className="text-sm"><button type="button" disabled={photoBusy} onClick={() => void loadPhoto()} className="min-h-11 text-[#fa6c34] underline disabled:opacity-50">{photoBusy ? "Loading catalog photo…" : "Load Pokémon card photo"}</button><p className="text-[#b8b0a7]">Optional: sends the public ID to TCGdex and fetches its catalog image from the TCGdex CDN. Nothing is saved.</p></div>}
      {photoError && <p role="status" className="text-sm text-[#d8a58e]">{photoError}</p>}
      <div className="border-l-2 border-[#fa6c34] pl-4 text-sm leading-relaxed text-[#c8bfb6]"><p>{result.provider === "tcgdex" ? "Printing matters. TCGdex reports known marketplace mapping issues. These references do not establish the value of your exact printing, condition or grade." : "Version matters. These reference lows span multiple versions, not your exact printing, condition or grade. YGOPRODeck responses may be cached for two days."}</p></div>
      <details className="border-t border-[#504840] pt-4"><summary className="min-h-11 cursor-pointer text-[#e9e0d1]">All {currency} reference metrics ({result.rows.filter(row => row.currency === currency).length})</summary><ul className="grid gap-3 pt-3 sm:grid-cols-2">{result.rows.filter(row => row.currency === currency).map((row, index) => <li key={index} className="min-w-0 break-words border border-[#4b443e] p-3"><p>{row.market} · {row.variant}</p><p className="mt-2 text-[#fa6c34]">{priceText(row.amount, row.currency)} · {metricName(row.metric)}</p><p className="mt-2 text-xs text-[#b8b0a7]">{row.updatedAt ? `Source updated ${new Date(row.updatedAt).toLocaleString()}` : "Source price timestamp unknown"}</p></li>)}</ul></details>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#504840] pt-4 text-sm"><p className="text-[#b8b0a7]">Retrieved {new Date(result.fetchedAt).toLocaleString()}<br />Retrieval time is not the market update time.</p><a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 text-[#fa6c34] underline">Inspect original source <ArrowUpRight size={16} /></a></div>
    </section>}
    <section aria-label="Find another card" className="space-y-5 border-t border-[#45403b] pt-7">
      <h2 className="flex items-center gap-2 text-xl"><Search size={20} className="text-[#fa6c34]" /> Find another Pokémon card</h2>
      <form onSubmit={event => { event.preventDefault(); if (name.trim().length >= 2) void search(); }} className="flex flex-col items-end gap-3 sm:flex-row"><label className="w-full flex-1 text-sm">Card name<input className={field} placeholder="e.g. Charizard" maxLength={80} value={name} onChange={event => { clear(); setName(event.target.value); }} /></label><button type="submit" className={button} disabled={busy || name.trim().length < 2}>Search Pokémon cards</button></form>
      <p className="text-sm text-[#b8b0a7]">Search sends this public card name to TCGdex through ChainScout. Choose a catalog ID to request its prices. Do not enter private notes.</p>
      {matches && <div aria-label="Matching catalog cards" className="space-y-3"><p role="status" className="text-sm text-[#b8b0a7]">{matches.results.length ? `${matches.results.length} catalog matches shown. Confirm the set and collector number before checking prices.` : "No cards matched. Try a different name or a named example."}{matches.truncated ? " More matches exist; refine the name." : ""}</p><div className="grid gap-3 sm:grid-cols-2">{matches.results.map(card => <button key={card.catalogId} className="min-h-16 border border-[#635043] p-4 text-left hover:border-[#fa6c34]" onClick={() => void lookup({ provider: "tcgdex", cardId: card.catalogId })}><span className="block text-lg">{card.name}</span><span className="mt-1 block text-sm text-[#fa6c34]">{card.catalogId} · Check price references →</span></button>)}</div></div>}
      <details className="border border-[#504840] p-5"><summary className="min-h-8 cursor-pointer text-[#c8bfb6]">Already know the public card ID?</summary><form onSubmit={event => { event.preventDefault(); void lookup({ ...input, cardId: input.cardId.trim() }); }} className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm">Card game<select className={field} value={input.provider} onChange={event => { clear(); setInput({ provider: event.target.value as BenchmarkInput["provider"], cardId: "" }); }}><option value="tcgdex">Pokémon · TCGdex</option><option value="ygoprodeck">Yu-Gi-Oh! · YGOPRODeck</option></select></label>
        <label className="text-sm">Public catalog card ID<input className={field} maxLength={80} value={input.cardId} onChange={event => { clear(); setInput({ ...input, cardId: event.target.value }); }} placeholder={input.provider === "tcgdex" ? "base1-4" : "46986414"} /></label><button type="submit" className={button} disabled={busy || !validCardInput({ ...input, cardId: input.cardId.trim() })}>Check prices</button>
      </form><p className="mt-3 text-sm text-[#b8b0a7]">Only the selected provider and public card ID are sent when you click. No wallet or Vault required.</p></details>
    </section>
    <footer className="flex gap-3 border-t border-[#45403b] pt-6 text-sm leading-relaxed text-[#b8b0a7]"><ArrowDown className="shrink-0 text-[#fa6c34]" size={18} /><p>Research context, not an appraisal. Prices can be missing, delayed or mapped to another printing. These are not live inventory, sold-listing evidence or guaranteed deals. This page does not save searches or values to your Vault.</p></footer>
  </div>;
}
