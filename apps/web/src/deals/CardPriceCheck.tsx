import { useEffect, useRef, useState } from "react";
import type { BenchmarkInput, CardBenchmark, CollectibleSearchResponse } from "@rh-chain/shared";
import { ArrowDown, ArrowUpRight, Search, WalletCards } from "lucide-react";
import { useI18n } from "../i18n";
import { privateApi } from "../dashboard/http";
import { collectibleDetail, searchCollectibles } from "../collectibles/api";
import { catalogImageToVaultPhoto } from "../collectibles/catalog-image";
import { CARD_EXAMPLES, checkedPrices, headlineReferences, metricName, priceText, validCardInput } from "./price-model";

const field = "mt-2 min-h-12 w-full border border-[#555] bg-[#1d1d1d] px-3 py-2 text-[#e9e0d1] outline-none focus-visible:border-[#fa6c34]";
const button = "min-h-12 bg-[#fa6c34] px-5 py-3 font-medium text-[#1d1d1d] outline-none hover:bg-[#ff8957] focus-visible:ring-2 focus-visible:ring-[#ffd0bc] disabled:opacity-50";

export default function CardPriceCheck() {
  const { t, locale } = useI18n();
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
    if (!validCardInput(selected)) { setError(t("cards.error.id")); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true);
    try {
      const data = checkedPrices(selected, await privateApi<unknown>("/v1/private/cards/prices", selected, controller.signal));
      if (controller.signal.aborted) return;
      setCurrency(data.rows.some(row => row.currency === "USD") ? "USD" : "EUR"); setResult(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t("cards.error.prices")); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function search() {
    clear(); const controller = new AbortController(); pending.current = controller; setBusy(true);
    try {
      const data = await searchCollectibles({ language: "en", name: name.trim() }, controller.signal);
      if (!controller.signal.aborted) setMatches(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t("cards.error.search")); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function loadPhoto() {
    if (!result || result.provider !== "tcgdex") return;
    photoPending.current?.abort(); const controller = new AbortController(); photoPending.current = controller; setPhotoBusy(true); setPhotoError("");
    try {
      const detail = await collectibleDetail("en", result.cardId, controller.signal);
      if (!detail.card.imageUrl) throw new Error(t("cards.error.noPhoto"));
      const image = await catalogImageToVaultPhoto(detail.card.imageUrl, result.cardId, controller.signal);
      if (!controller.signal.aborted) setPhoto(image.dataUrl);
    } catch (cause) { if (!controller.signal.aborted) setPhotoError(cause instanceof Error ? cause.message : t("cards.error.photo")); }
    finally { if (!controller.signal.aborted) setPhotoBusy(false); }
  }

  const headlines = result ? headlineReferences(result, currency) : [];
  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-[#e9e0d1] sm:px-8 sm:py-12">
    <header className="grid gap-6 border-b border-[#45403b] pb-8 sm:grid-cols-[1fr_auto]">
      <div>
        <p className="mb-4 font-mono text-xs tracking-[.16em] text-[#fa6c34]">{t("cards.eyebrow")}</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.04em] sm:text-6xl">{t("cards.titleA")}<br />{t("cards.titleB")}<span className="text-[#fa6c34]">?</span></h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#b8b0a7]">{t("cards.intro")}</p>
      </div>
      <div className="hidden self-center border border-[#635043] bg-[#28221e] p-6 text-[#fa6c34] sm:block" aria-hidden="true"><WalletCards size={72} strokeWidth={1.2} /><p className="mt-4 font-mono text-xs">{t("cards.pickCheck")}</p></div>
    </header>
    <section aria-label={t("cards.examplesAria")} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl">{t("cards.examplesTitle")}</h2><p className="text-sm text-[#b8b0a7]">{t("cards.realReferences")}</p></div>
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">{CARD_EXAMPLES.map(card => <button key={card.cardId} type="button" disabled={busy} onClick={() => void lookup({ provider: card.provider, cardId: card.cardId })} aria-label={t("cards.checkName", { name: card.name })} className="group min-w-0 border border-[#504840] bg-[#242220] p-5 text-left outline-none transition-colors hover:border-[#fa6c34] hover:bg-[#2b2521] focus-visible:ring-2 focus-visible:ring-[#ffd0bc] disabled:opacity-50">
        <div className="mb-5 flex items-center justify-between"><span className="flex h-12 min-w-12 items-center justify-center border px-2 font-mono text-lg" style={{ color: card.tone, borderColor: card.tone }}>{card.mark}</span><ArrowUpRight className="text-[#fa6c34] transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" size={20} /></div>
        <span className="block text-xl font-medium leading-tight">{card.name}</span><span className="mt-2 block text-xs leading-relaxed text-[#b8b0a7]">{locale === "en" ? card.detail : t(card.cardId === "base1-4" ? "cards.base4" : card.cardId === "base1-58" ? "cards.base58" : "cards.ygoVersions")}</span>
      </button>)}</div>
      <p className="text-sm leading-relaxed text-[#b8b0a7]">{t("cards.requestDisclosure")}</p>
      {locale === "zh-CN" && <p className="text-sm text-[#b8b0a7]">{t("cards.providerLanguage")}</p>}
    </section>
    {busy && <p role="status" className="flex items-center gap-3 border border-[#635043] p-5"><span className="h-2 w-2 bg-[#fa6c34] motion-safe:animate-pulse" />{t("cards.loading")}</p>}
    {error && <div role="alert" className="border border-[#8a5643] bg-[#2b211c] p-5"><p>{error}</p><p className="mt-2 text-sm">{t("cards.errorUnchanged")}</p></div>}
    {result && <section aria-label={t("cards.snapshotAria")} className="card-price-reveal space-y-5 border border-[#6a4b3b] bg-[#242220] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono text-xs tracking-widest text-[#fa6c34]">{t("cards.snapshot")}</p><h2 ref={heading} tabIndex={-1} className="mt-2 scroll-mt-8 text-3xl font-semibold outline-none sm:text-4xl">{result.name}</h2><p className="mt-2 break-all text-sm text-[#b8b0a7]">{result.provider === "tcgdex" ? "Pokémon · TCGdex" : "Yu-Gi-Oh! · YGOPRODeck"} · {result.cardId}</p></div>
        <div role="group" aria-label={t("cards.currencyAria")} className="flex border border-[#635043]">{(["USD", "EUR"] as const).map(value => <button key={value} aria-pressed={currency === value} onClick={() => setCurrency(value)} className={`min-h-12 min-w-20 px-5 outline-none focus-visible:ring-2 focus-visible:ring-[#ffd0bc] ${currency === value ? "bg-[#fa6c34] text-[#1d1d1d]" : "text-[#e9e0d1]"}`}>{value}</button>)}</div>
      </div>
      <p className="text-sm text-[#b8b0a7]">{t("cards.currenciesSeparate")}</p>
      <div className={photo ? "grid items-start gap-6 md:grid-cols-[180px_1fr]" : ""}>
        {photo && <figure><img src={photo} alt={t("cards.photoAlt", { name: result.name })} className="mx-auto w-[180px] rounded-lg" /><figcaption className="mt-2 text-center text-xs text-[#b8b0a7]">{t("cards.photoCredit")}</figcaption></figure>}
        <div className="grid gap-3 sm:grid-cols-2">{headlines.map((row, index) => <article key={`${currency}:${index}`} className="min-w-0 border border-[#4b443e] bg-[#1d1d1d] p-5">
          <h3 className="text-sm text-[#c3b8ad]">{row.market}</h3><p className="mt-3 break-words text-3xl font-semibold tracking-tight text-[#fa6c34]">{priceText(row.amount, row.currency)}</p>
          <p className="mt-3 font-medium">{metricName(row.metric, locale)}</p><p className="mt-1 text-sm text-[#b8b0a7]">{row.variant}</p>
          <p className="mt-4 border-t border-[#403b36] pt-3 text-xs leading-relaxed text-[#b8b0a7]">{row.updatedAt ? t("cards.sourceUpdated", { time: new Date(row.updatedAt).toLocaleString(locale) }) : t("cards.sourceUnknown")}</p>
        </article>)}</div>
      </div>
      {!headlines.length && <p role="status" className="border border-[#555] p-5">{t("cards.noPrices", { currency })}{t(result.rows.length ? "cards.otherCurrency" : "cards.otherCard")}</p>}
      {result.provider === "tcgdex" && !photo && <div className="text-sm"><button type="button" disabled={photoBusy} onClick={() => void loadPhoto()} className="min-h-11 text-[#fa6c34] underline disabled:opacity-50">{t(photoBusy ? "cards.photoLoading" : "cards.photoLoad")}</button><p className="text-[#b8b0a7]">{t("cards.photoDisclosure")}</p></div>}
      {photoError && <p role="status" className="text-sm text-[#d8a58e]">{photoError}</p>}
      <div className="border-l-2 border-[#fa6c34] pl-4 text-sm leading-relaxed text-[#c8bfb6]"><p>{t(result.provider === "tcgdex" ? "cards.printingWarning" : "cards.versionWarning")}</p></div>
      <details className="border-t border-[#504840] pt-4"><summary className="min-h-11 cursor-pointer text-[#e9e0d1]">{t("cards.allMetrics", { currency, count: result.rows.filter(row => row.currency === currency).length })}</summary><ul className="grid gap-3 pt-3 sm:grid-cols-2">{result.rows.filter(row => row.currency === currency).map((row, index) => <li key={index} className="min-w-0 break-words border border-[#4b443e] p-3"><p>{row.market} · {row.variant}</p><p className="mt-2 text-[#fa6c34]">{priceText(row.amount, row.currency)} · {metricName(row.metric, locale)}</p><p className="mt-2 text-xs text-[#b8b0a7]">{row.updatedAt ? t("cards.sourceUpdated", { time: new Date(row.updatedAt).toLocaleString(locale) }) : t("cards.timestampUnknown")}</p></li>)}</ul></details>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#504840] pt-4 text-sm"><p className="text-[#b8b0a7]">{t("cards.retrieved", { time: new Date(result.fetchedAt).toLocaleString(locale) })}<br />{t("cards.retrievalCaution")}</p><a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 text-[#fa6c34] underline">{t("cards.inspect")} <ArrowUpRight size={16} /></a></div>
    </section>}
    <section aria-label={t("cards.findAria")} className="space-y-5 border-t border-[#45403b] pt-7">
      <h2 className="flex items-center gap-2 text-xl"><Search size={20} className="text-[#fa6c34]" /> {t("cards.findTitle")}</h2>
      <form onSubmit={event => { event.preventDefault(); if (name.trim().length >= 2) void search(); }} className="flex flex-col items-end gap-3 sm:flex-row"><label className="w-full flex-1 text-sm">{t("cards.nameLabel")}<input className={field} placeholder={t("cards.namePlaceholder")} maxLength={80} value={name} onChange={event => { clear(); setName(event.target.value); }} /></label><button type="submit" className={button} disabled={busy || name.trim().length < 2}>{t("cards.search")}</button></form>
      <p className="text-sm text-[#b8b0a7]">{t("cards.searchDisclosure")}</p>
      {matches && <div aria-label={t("cards.matchesAria")} className="space-y-3"><p role="status" className="text-sm text-[#b8b0a7]">{matches.results.length ? t("cards.matchesCount", { count: matches.results.length }) : t("cards.noMatches")}{matches.truncated ? t("cards.moreMatches") : ""}</p><div className="grid gap-3 sm:grid-cols-2">{matches.results.map(card => <button key={card.catalogId} className="min-h-16 border border-[#635043] p-4 text-left hover:border-[#fa6c34]" onClick={() => void lookup({ provider: "tcgdex", cardId: card.catalogId })}><span className="block text-lg">{card.name}</span><span className="mt-1 block text-sm text-[#fa6c34]">{card.catalogId} · {t("cards.checkReferences")}</span></button>)}</div></div>}
      <details className="border border-[#504840] p-5"><summary className="min-h-8 cursor-pointer text-[#c8bfb6]">{t("cards.knownId")}</summary><form onSubmit={event => { event.preventDefault(); void lookup({ ...input, cardId: input.cardId.trim() }); }} className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm">{t("cards.game")}<select className={field} value={input.provider} onChange={event => { clear(); setInput({ provider: event.target.value as BenchmarkInput["provider"], cardId: "" }); }}><option value="tcgdex">Pokémon · TCGdex</option><option value="ygoprodeck">Yu-Gi-Oh! · YGOPRODeck</option></select></label>
        <label className="text-sm">{t("cards.catalogId")}<input className={field} maxLength={80} value={input.cardId} onChange={event => { clear(); setInput({ ...input, cardId: event.target.value }); }} placeholder={input.provider === "tcgdex" ? "base1-4" : "46986414"} /></label><button type="submit" className={button} disabled={busy || !validCardInput({ ...input, cardId: input.cardId.trim() })}>{t("cards.checkPrices")}</button>
      </form><p className="mt-3 text-sm text-[#b8b0a7]">{t("cards.idDisclosure")}</p></details>
    </section>
    <footer className="flex gap-3 border-t border-[#45403b] pt-6 text-sm leading-relaxed text-[#b8b0a7]"><ArrowDown className="shrink-0 text-[#fa6c34]" size={18} /><p>{t("cards.footer")}</p></footer>
  </div>;
}
