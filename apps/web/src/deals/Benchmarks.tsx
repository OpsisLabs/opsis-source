import { useEffect, useRef, useState } from "react";
import type { BenchmarkInput, CardBenchmark } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { useI18n } from "../i18n";

export function Benchmarks() {
  const { t } = useI18n();
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
          (row.updatedAt !== null && !Number.isFinite(Date.parse(row.updatedAt))))) throw new Error(t("cloud.deals.benchmarks.verifyError"));
      setResult(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t("cloud.deals.benchmarks.unavailable")); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const valid = provider === "tcgdex" ? /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(cardId.trim()) : /^\d{1,8}$/.test(cardId.trim());
  const providerName = provider === "tcgdex" ? "TCGdex" : "YGOPRODeck";
  return <section aria-label={t("cloud.deals.benchmarks.ariaLabel")} className="space-y-4 border border-[#555] bg-[#242424] p-5 text-[#e9e0d1]">
    <h2 className="text-2xl">{t("cloud.deals.benchmarks.title")}</h2>
    <p>{t("cloud.deals.benchmarks.intro")}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>{t("cloud.deals.benchmarks.cardGame")}<select aria-label={t("cloud.deals.benchmarks.cardGameAria")} className="mt-2 block w-full bg-[#1d1d1d] p-3" value={provider} onChange={e => { clear(); setProvider(e.target.value as BenchmarkInput["provider"]); setCardId(""); }}>
        <option value="tcgdex">{t("cloud.deals.benchmarks.optionTcgdex")}</option><option value="ygoprodeck">{t("cloud.deals.benchmarks.optionYgo")}</option>
      </select></label>
      <label>{t("cloud.deals.benchmarks.cardId")}<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" maxLength={80} value={cardId} onChange={e => { clear(); setCardId(e.target.value); }} /></label>
    </div>
    <button className="min-h-11 text-[#fa6c34] underline" onClick={() => { clear(); setCardId(provider === "tcgdex" ? "base1-4" : "46986414"); }}>{t("cloud.deals.benchmarks.useExample", { example: provider === "tcgdex" ? t("cloud.deals.benchmarks.exampleTcgdex") : t("cloud.deals.benchmarks.exampleYgo") })}</button>
    <p className="text-sm">{t("cloud.deals.benchmarks.disclosure", { provider: providerName })}</p>
    <button className="min-h-11 bg-[#fa6c34] px-4 py-3 text-[#1d1d1d] disabled:opacity-50" disabled={!valid || busy} onClick={() => void lookup()}>{busy ? t("cloud.deals.benchmarks.loading") : t("cloud.deals.benchmarks.fetch")}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div className="space-y-3">
      <h3 className="text-xl">{result.name} · {result.cardId}</h3>
      <p>{t("cloud.deals.benchmarks.retrieved", { date: new Date(result.fetchedAt).toLocaleString() })}</p>
      <p>{result.provider === "tcgdex" ? t("cloud.deals.benchmarks.providerNoteTcgdex") : t("cloud.deals.benchmarks.providerNoteYgo")}</p>
      {!result.rows.length && <p role="status">{t("cloud.deals.benchmarks.none")}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">{result.rows.map((row, index) => <li key={index} className="min-w-0 break-words border border-[#555] p-3">
        <p>{row.market} · {row.variant} · {row.metric}</p>
        <p className="text-xl">{row.currency} {row.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
        <p className="text-sm">{row.updatedAt ? t("cloud.deals.benchmarks.updated", { date: new Date(row.updatedAt).toLocaleString() }) : t("cloud.deals.benchmarks.timestampUnknown")}</p>
      </li>)}</ul>
      <a className="inline-block min-h-11 text-[#fa6c34] underline break-all" href={result.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("cloud.deals.benchmarks.inspect")}</a>
    </div>}
  </section>;
}
