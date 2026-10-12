import { OPSIS_PRESENTATION } from "../opsis/presentation";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import {
  AlertTriangle, BadgeCheck, BarChart3, Box, Building2, Check,
  ChevronRight, CircleDollarSign, Clock3, DatabaseZap, FileCheck2, Layers3,
  LockKeyhole, Search, ShieldAlert, ShieldCheck, Sparkles, X
} from "lucide-react";
import { isAddress } from "viem";
import { ApiError } from "../dashboard/http";
import { verifyRwa, type RwaCheck, type RwaVerification } from "../rwa/api";
import { WorkspaceDisclosure } from "../product/WorkspaceDisclosure";
import { useI18n, type TranslateParams, type TranslationKey } from "../i18n";

const SAMPLE_STOCK = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
const SAMPLE_VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd";

type Translate = (key: TranslationKey, params?: TranslateParams) => string;
type RwaStockOracle = NonNullable<RwaVerification["stock"]>["oracle"];
type RwaOracleState = NonNullable<RwaStockOracle>["state"];

const KIND_KEYS: Record<RwaVerification["kind"], TranslationKey> = {
  stock_token: "rwa.result.kind.stock_token",
  morpho_vault: "rwa.result.kind.morpho_vault",
  unsupported_contract: "rwa.result.kind.unsupported_contract"
};

const ORACLE_STATE_KEYS: Record<RwaOracleState, TranslationKey> = {
  current: "rwa.oracle.state.current",
  paused: "rwa.oracle.state.paused",
  stale_or_market_closed: "rwa.oracle.state.stale_or_market_closed",
  invalid: "rwa.oracle.state.invalid"
};

const EvidenceMap = lazy(() => import("../opsis/EvidenceMap"));

export default function StockTokenCheck() {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmedAddress, setConfirmedAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RwaVerification | null>(null);
  const pending = useRef(false);
  const verifyButton = useRef<HTMLButtonElement>(null);

  const prepare = (event?: FormEvent) => {
    event?.preventDefault();
    const value = address.trim();
    if (!isAddress(value, { strict: false })) {
      setError(t("rwa.error.invalidAddress"));
      return;
    }
    setError("");
    setConfirmedAddress(value);
    setConfirming(true);
  };

  const run = async () => {
    if (pending.current) return;
    pending.current = true;
    setConfirming(false);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await verifyRwa(confirmedAddress));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : t("rwa.error.providersUnavailable"));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const sample = (value: string) => {
    setAddress(value);
    setResult(null);
    setError("");
  };
  const cancelConsent = () => {
    setConfirming(false);
    setConfirmedAddress("");
    requestAnimationFrame(() => verifyButton.current?.focus());
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      {!OPSIS_PRESENTATION && (      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label={t("rwa.header.home")}>
          <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}><img src="/logo.svg" alt="" className="h-5 w-5" /></span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">OPSIS</span>
        </Link>
        <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#c9a6ff] sm:text-[10.5px]"><BadgeCheck size={13} /> {t("rwa.header.badge")}</div>
        <nav className="flex items-center gap-4 font-mono-d text-[9px] text-[#7f7972] sm:text-[10px]"><Link to="/vault" className="hover:text-[#e9e0d1]">{t("rwa.header.vault")}</Link><Link to="/app" className="hover:text-[#e9e0d1]">{t("rwa.header.privateMode")}</Link></nav>
      </header>)}

      <main className="workspace-layout">
        <section className="workspace-heading">
          {!OPSIS_PRESENTATION && (<div>
            <p className="workspace-eyebrow"><BadgeCheck size={14} /> {t("rwa.eyebrow")}</p>
            <h1 className="workspace-title">{t("rwa.title.line1")}<br /><span className="text-[#d6ccba]">{t("rwa.title.line2")}</span></h1>
            <p className="workspace-description">{t("rwa.description")}</p>
          </div>)}
          <WorkspaceDisclosure title={t("rwa.disclosure.title")} className="workspace-privacy-details">
          <div className="grid grid-cols-2 gap-px border border-[#383838] bg-[#383838]">
            <Feature icon={<Search size={14} />} label={t("rwa.disclosure.identity.label")} value={t("rwa.disclosure.identity.value")} />
            <Feature icon={<ShieldCheck size={14} />} label={t("rwa.disclosure.execution.label")} value={t("rwa.disclosure.execution.value")} />
            <Feature icon={<DatabaseZap size={14} />} label={t("rwa.disclosure.history.label")} value={t("rwa.disclosure.history.value")} />
            <Feature icon={<Sparkles size={14} />} label={t("rwa.disclosure.ai.label")} value={t("rwa.disclosure.ai.value")} />
          </div>
          </WorkspaceDisclosure>
        </section>

        <form onSubmit={prepare} className="clip-panel border border-[#423a49] bg-[#242424]">
          <div className="flex items-center gap-2.5 border-b border-[#383838] px-5 py-4 sm:px-6"><Box size={14} className="text-[#c9a6ff]" /><span className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">{t("rwa.form.title")}</span><span className="ml-auto font-mono-d text-[9px] text-[#635d5a]">{t("rwa.form.network")}</span></div>
          <label className="block p-5 sm:p-7">
            <span className="font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a]">{t("rwa.form.addressLabel")}</span>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input value={address} disabled={loading} onChange={(event) => { setAddress(event.target.value); setError(""); }} autoComplete="off" spellCheck={false} placeholder={t("rwa.form.addressPlaceholder")} aria-label={t("rwa.form.addressAria")} className="min-h-[50px] flex-1 border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[12px] text-[#e9e0d1] outline-none focus:border-[#c9a6ff]/60 disabled:opacity-60 sm:text-[14px]" />
              <button ref={verifyButton} type="submit" disabled={!address.trim() || loading} className="clip-btn-sm flex min-h-[50px] items-center justify-center gap-2 bg-[#c9a6ff] px-7 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-50"><FileCheck2 size={14} /> {loading ? t("rwa.form.submitting") : t("rwa.form.submit")}</button>
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#383838] px-5 py-4 sm:px-7"><span className="mr-2 font-mono-d text-[9px] text-[#635d5a]">{t("rwa.form.trySample")}</span><button type="button" disabled={loading} onClick={() => sample(SAMPLE_STOCK)} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#9a938a] hover:border-[#c9a6ff]/50 hover:text-[#e9e0d1] disabled:opacity-40">{t("rwa.form.sampleStock")}</button><button type="button" disabled={loading} onClick={() => sample(SAMPLE_VAULT)} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#9a938a] hover:border-[#c9a6ff]/50 hover:text-[#e9e0d1] disabled:opacity-40">{t("rwa.form.sampleVault")}</button></div>
        </form>

        {error && <div role="alert" className="mt-5 border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e9a1b2]">{error}</div>}
        {loading && <LoadingState />}
        {result && <EvidenceResult result={result} />}
        {!loading && !result && !error && <EmptyState />}
      </main>

      {confirming && <ConsentDialog address={confirmedAddress} onCancel={cancelConsent} onConfirm={run} />}
    </div>
  );
}

function ConsentDialog({ address, onCancel, onConfirm }: { address: string; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.querySelector<HTMLButtonElement>("[data-confirm]")?.focus(); }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const controls = [...(dialog.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current >= controls.length - 1 ? 0 : current + 1);
    event.preventDefault(); controls[next]?.focus();
  };
  return <div ref={dialog} onKeyDown={onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="rwa-consent-title">
    <div className="clip-panel w-full max-w-[650px] border border-[#c9a6ff]/40 bg-[#242424] shadow-2xl">
      <div className="flex items-center border-b border-[#383838] px-6 py-5"><LockKeyhole size={15} className="text-[#c9a6ff]" /><h2 id="rwa-consent-title" className="ml-3 font-mono-d text-[11px] tracking-[0.14em]">{t("rwa.consent.title")}</h2><button onClick={onCancel} aria-label={t("rwa.consent.cancelAria")} className="ml-auto text-[#635d5a] hover:text-[#e9e0d1]"><X size={18} /></button></div>
      <div className="p-6">
        <p className="text-[13px] leading-relaxed text-[#9a938a]">{t("rwa.consent.body")}</p>
        <div className="mt-5 border border-[#383838] bg-[#1d1d1d] p-4"><p className="font-mono-d text-[9px] text-[#635d5a]">{t("rwa.consent.publicContract")}</p><p className="mt-2 break-all font-mono-d text-[11px] text-[#d6ccba]">{address}</p></div>
        <ul className="mt-5 space-y-2 text-[12px] text-[#9a938a]"><li className="flex gap-2"><Check size={13} className="mt-0.5 text-[#7fb069]" />{t("rwa.consent.noAccount")}</li><li className="flex gap-2"><Check size={13} className="mt-0.5 text-[#7fb069]" />{t("rwa.consent.noTransaction")}</li><li className="flex gap-2"><AlertTriangle size={13} className="mt-0.5 text-[#d9a441]" />{t("rwa.consent.providers")}</li></ul>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-[#383838] p-5 sm:flex-row sm:justify-end"><button onClick={onCancel} className="min-h-[44px] border border-[#383838] px-5 font-mono-d text-[10px] text-[#9a938a]">{t("rwa.consent.cancel")}</button><button data-confirm onClick={onConfirm} className="clip-btn-sm min-h-[44px] bg-[#c9a6ff] px-6 font-mono-d text-[10px] font-medium text-[#1d1d1d]">{t("rwa.consent.confirm")}</button></div>
    </div>
  </div>;
}

function EvidenceResult({ result }: { result: RwaVerification }) {
  const { t, locale } = useI18n();
  const tone = result.kind === "unsupported_contract" ? "#d9a441" : result.checks.some((item) => item.status === "conflict") ? "#e0738a" : "#7fb069";
  return <section className="mt-8 space-y-5" data-testid="rwa-result" aria-live="polite">
    <div className="clip-panel border border-[#383838] bg-[#242424]">
      <div className="h-1" style={{ background: tone }} />
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
        <div><p className="font-mono-d text-[9.5px] tracking-[0.14em]" style={{ color: tone }}>{t(KIND_KEYS[result.kind])}</p><h2 className="mt-3 text-[27px] font-medium tracking-[-0.025em] text-[#f0e8da] sm:text-[34px]">{result.headline}</h2><p className="mt-3 max-w-[790px] text-[13.5px] leading-relaxed text-[#9a938a]">{result.summary}</p><p className="mt-4 break-all font-mono-d text-[9px] text-[#635d5a]">{t("rwa.result.lookedUpAddress", { address: result.address })}</p></div>
        <div className="min-w-[220px] border border-[#383838] bg-[#1d1d1d] p-4"><p className="font-mono-d text-[8.5px] text-[#635d5a]">{t("rwa.result.capturedBlock")}</p><p className="mt-2 font-mono-d text-[17px] text-[#d6ccba]">{result.anchor.blockNumber.toLocaleString()}</p><p className="mt-2 font-mono-d text-[8.5px] text-[#d9a441]">{t("rwa.result.nonFinal")}</p><p className="mt-3 break-all font-mono-d text-[8px] text-[#635d5a]">{result.anchor.blockHash}</p></div>
      </div>
    </div>
    {locale === "zh-CN" && <p className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{t("common.state.originalLanguage")}</p>}

    {result.stock && <StockDetails stock={result.stock} />}
    {result.morpho && <MorphoDetails morpho={result.morpho} />}

    {import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && <Suspense fallback={null}><EvidenceMap findings={result.checks.map(check => ({fact: `${check.status}: ${check.label} — ${check.detail}`, sourceIds: check.sourceIds}))} sources={result.sources} /></Suspense>}
    <div className="grid gap-4 lg:grid-cols-2">{result.checks.map((item) => <EvidenceCard key={item.id} check={item} sources={result.sources} />)}</div>

    <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
      <section className="clip-panel border border-[#383838] bg-[#242424] p-6"><div className="flex items-center gap-2"><ShieldAlert size={15} className="text-[#d9a441]" /><h3 className="font-mono-d text-[10.5px] tracking-[0.13em]">{t("rwa.limitations.title")}</h3></div><ul className="mt-5 space-y-3">{result.limitations.map((item) => <li key={item} className="flex gap-3 text-[12.5px] leading-relaxed text-[#9a938a]"><ChevronRight size={13} className="mt-1 shrink-0 text-[#635d5a]" />{item}</li>)}</ul></section>
      <section className="clip-panel border border-[#7fb069]/25 bg-[#7fb069]/5 p-6"><div className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#7fb069]" /><h3 className="font-mono-d text-[10.5px] tracking-[0.13em] text-[#7fb069]">{t("rwa.privacy.title")}</h3></div><p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">{result.privacy.disclosure}</p><p className="mt-4 font-mono-d text-[8.5px] leading-relaxed text-[#635d5a]">{t("rwa.privacy.destinations", { destinations: result.privacy.providerDestinations.join(" · ").toUpperCase() })}</p></section>
    </div>

    <Sources sources={result.sources} />
  </section>;
}

function StockDetails({ stock }: { stock: NonNullable<RwaVerification["stock"]> }) {
  const { t } = useI18n();
  return <div className="grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2 lg:grid-cols-4">
    <Metric icon={<Building2 size={14} />} label={t("rwa.stock.token")} value={t("rwa.stock.tokenValue", { symbol: stock.symbol, decimals: stock.decimals })} detail={t("rwa.stock.registryDetail", { name: stock.name, status: stock.registryStatus.replace("ASSET_STATUS_", "") })} />
    <Metric icon={<Layers3 size={14} />} label={t("rwa.stock.uiMultiplier")} value={stock.currentMultiplier} detail={stock.pendingMultiplier ? (stock.pendingEffectiveAt ? t("rwa.stock.pendingChangeEffective", { multiplier: stock.pendingMultiplier, date: stamp(stock.pendingEffectiveAt) }) : t("rwa.stock.pendingChange", { multiplier: stock.pendingMultiplier })) : t("rwa.stock.noScheduledChange")} />
    <Metric icon={<BarChart3 size={14} />} label={t("rwa.stock.underlyingQuote")} value={stock.underlyingQuote ? `${stock.underlyingQuote.tradingHalted ? t("rwa.stock.quoteHaltedPrefix") : stock.underlyingQuote.state === "stale" ? t("rwa.stock.quoteStalePrefix") : ""}${stock.underlyingQuote.bid} / ${stock.underlyingQuote.ask} ${stock.underlyingQuote.currency}` : t("rwa.common.unavailable")} detail={stock.underlyingQuote ? t("rwa.stock.quoteDetail", { date: stamp(stock.underlyingQuote.generatedAt) }) : t("rwa.stock.noQuote")} />
    <Metric icon={<CircleDollarSign size={14} />} label={t("rwa.stock.oracle")} value={stock.oracle?.state === "current" && stock.oracle.value ? `$${stock.oracle.value}` : oracleStateLabel(t, stock.oracle?.state)} detail={oracleDetail(t, stock.oracle)} />
    {stock.corporateActions.length > 0 && <div className="bg-[#202020] p-5 sm:col-span-2 lg:col-span-4"><p className="font-mono-d text-[9px] text-[#635d5a]">{t("rwa.stock.corporateActions.title")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{stock.corporateActions.map((action) => <div key={action.id} className="border border-[#383838] bg-[#242424] p-4"><p className="font-mono-d text-[10px] text-[#d6ccba]">{action.type.replaceAll("_", " ")}</p><p className="mt-2 text-[11px] text-[#9a938a]">{action.status.replaceAll("_", " ")} · {action.processDate ?? t("rwa.stock.corporateActions.dateUnsupplied")}</p><p className="mt-2 text-[11px] leading-relaxed text-[#635d5a]">{action.detail}</p></div>)}</div></div>}
  </div>;
}

function MorphoDetails({ morpho }: { morpho: NonNullable<RwaVerification["morpho"]> }) {
  const { t } = useI18n();
  return <div className="grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2 lg:grid-cols-4">
    <Metric icon={<Building2 size={14} />} label={t("rwa.morpho.vault")} value={t("rwa.morpho.vaultValue", { symbol: morpho.symbol, version: morpho.version })} detail={morpho.name} />
    <Metric icon={<BadgeCheck size={14} />} label={t("rwa.morpho.status")} value={morpho.listed === true ? t("rwa.morpho.listed") : morpho.listed === false ? t("rwa.morpho.unlisted") : t("rwa.common.unknown")} detail={t("rwa.morpho.statusDetail")} />
    <Metric icon={<CircleDollarSign size={14} />} label={t("rwa.morpho.apy")} value={morpho.trailing24hApy ? `${(Number(morpho.trailing24hApy) * 100).toFixed(2)}%` : t("rwa.common.unavailable")} detail={t("rwa.morpho.apyDetail")} />
    <Metric icon={<Clock3 size={14} />} label={t("rwa.morpho.indexTiming")} value={formatIndexTiming(t, morpho.indexLagBlocks)} detail={morpho.indexedBlock ? t("rwa.morpho.indexedBlock", { block: morpho.indexedBlock.toLocaleString() }) : t("rwa.morpho.noIndexAnchor")} />
    <Metric icon={<Layers3 size={14} />} label={t("rwa.morpho.totalAssets")} value={formatRaw(morpho.totalAssetsRaw, morpho.asset.decimals)} detail={morpho.asset.symbol} />
    <Metric icon={<Box size={14} />} label={t("rwa.morpho.withdrawable")} value={morpho.withdrawableAssetsRaw ? formatRaw(morpho.withdrawableAssetsRaw, morpho.asset.decimals) : t("rwa.common.unavailable")} detail={t("rwa.morpho.withdrawableDetail")} />
    <Metric icon={<DatabaseZap size={14} />} label={t("rwa.morpho.allocated")} value={morpho.allocatedAssetsRaw ? formatRaw(morpho.allocatedAssetsRaw, morpho.asset.decimals) : t("rwa.common.unavailable")} detail={morpho.asset.symbol} />
    <Metric icon={<LockKeyhole size={14} />} label={t("rwa.morpho.timelock")} value={t("rwa.morpho.timelockValue", { days: Math.floor(morpho.timelockSeconds / 86400) })} detail={t("rwa.morpho.timelockDetail", { curator: short(morpho.curator), gates: Object.values(morpho.gates).filter(Boolean).length, fees: formatFees(t, morpho.managementFeeWad, morpho.performanceFeeWad) })} />
  </div>;
}

function EvidenceCard({ check, sources }: { check: RwaCheck; sources: RwaVerification["sources"] }) {
  const { t } = useI18n();
  const styles: Record<RwaCheck["status"], { color: string; labelKey: TranslationKey; icon: React.ReactNode }> = {
    confirmed: { color: "#7fb069", labelKey: "rwa.evidence.status.confirmed", icon: <BadgeCheck size={14} /> },
    claim: { color: "#c9a6ff", labelKey: "rwa.evidence.status.claim", icon: <FileCheck2 size={14} /> },
    warning: { color: "#d9a441", labelKey: "rwa.evidence.status.warning", icon: <AlertTriangle size={14} /> },
    missing: { color: "#9a938a", labelKey: "rwa.evidence.status.missing", icon: <Search size={14} /> },
    conflict: { color: "#e0738a", labelKey: "rwa.evidence.status.conflict", icon: <ShieldAlert size={14} /> },
    unsupported: { color: "#d9a441", labelKey: "rwa.evidence.status.unsupported", icon: <X size={14} /> }
  };
  const style = styles[check.status];
  const sourceNames = check.sourceIds.map((id) => sources.find((source) => source.id === id)?.provider).filter((name): name is string => Boolean(name));
  return <article className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6"><div className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.12em]" style={{ color: style.color }}>{style.icon}{t(style.labelKey)}</div><h3 className="mt-4 text-[16px] font-medium text-[#e9e0d1]">{check.label}</h3><p className="mt-2 text-[12.5px] leading-relaxed text-[#9a938a]">{check.detail}</p><p className="mt-4 border-t border-[#383838] pt-3 font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{t("rwa.evidence.source", { source: sourceNames.length ? [...new Set(sourceNames)].join(" + ").toUpperCase() : t("rwa.evidence.noSource") })}</p></article>;
}

function Sources({ sources }: { sources: RwaVerification["sources"] }) {
  const { t } = useI18n();
  return <section className="clip-panel border border-[#383838] bg-[#202020] p-6"><h3 className="font-mono-d text-[10px] tracking-[0.14em] text-[#d6ccba]">{t("rwa.sources.title", { count: sources.length })}</h3><div className="mt-4 divide-y divide-[#383838]">{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="group flex flex-col gap-2 py-4 sm:flex-row sm:items-center"><span className="min-w-[155px] font-mono-d text-[9.5px] text-[#c9a6ff]">{source.provider.toUpperCase()}</span><span className="flex-1 text-[12px] text-[#9a938a] group-hover:text-[#e9e0d1]">{source.description}</span><span className="font-mono-d text-[8.5px] text-[#635d5a]">{stamp(source.fetchedAt)} ↗</span></a>)}</div></section>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <div className="min-w-0 bg-[#202020] p-5"><div className="flex items-center gap-2 text-[#c9a6ff]">{icon}<span className="font-mono-d text-[8.5px] text-[#635d5a]">{label}</span></div><p className="mt-4 break-words font-mono-d text-[13px] text-[#e9e0d1]">{value}</p><p className="mt-2 text-[10.5px] leading-relaxed text-[#635d5a]">{detail}</p></div>; }
function Feature({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="bg-[#202020] p-4"><div className="flex items-center gap-2 text-[#c9a6ff]">{icon}<span className="font-mono-d text-[8.5px] text-[#635d5a]">{label}</span></div><p className="mt-3 font-mono-d text-[10px] tracking-wider text-[#d6ccba]">{value}</p></div>; }
function LoadingState() { const { t } = useI18n(); const tiles: TranslationKey[] = ["rwa.loading.registry", "rwa.loading.directContract", "rwa.loading.claims"]; return <div role="status" aria-live="polite" className="scan-panel clip-panel mt-8 overflow-hidden border border-[#c9a6ff]/25 bg-[#242424] p-8"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-ping rounded-full bg-[#c9a6ff]" /><p className="font-mono-d text-[10px] tracking-[0.14em] text-[#c9a6ff]">{t("rwa.loading.title")}</p></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{tiles.map((tile) => <div key={tile} className="decode-tile h-24 border border-[#383838] bg-[#1d1d1d] p-4"><p className="font-mono-d text-[9px] text-[#635d5a]">{t(tile)}</p><p className="mt-5 font-mono-d text-[16px] text-[#4f4a46]">0100110101</p></div>)}</div></div>; }
function EmptyState() { const { t } = useI18n(); return <div className="workspace-empty mt-6"><BadgeCheck size={26} className="text-[#fa6c34]" /><h2 className="text-[18px] text-[#e9e0d1]">{t("rwa.empty.title")}</h2><p>{t("rwa.empty.body")}</p></div>; }
function oracleStateLabel(t: Translate, state: RwaOracleState | undefined): string { return state ? t(ORACLE_STATE_KEYS[state]) : t("rwa.stock.noFeed"); }
function oracleDetail(t: Translate, oracle: RwaStockOracle): string { if (!oracle?.updatedAt) return t("rwa.stock.noUsableOracle"); const date = stamp(oracle.updatedAt); if (oracle.state === "current") return t("rwa.stock.oracleUpdated", { date }); return oracle.value ? t("rwa.stock.oracleLastReturnedValue", { value: `$${oracle.value}`, date }) : t("rwa.stock.oracleLastReturned", { date }); }
function stamp(value: string): string { return new Date(value).toLocaleString(); }
function formatRaw(raw: string, decimals: number): string { const value = raw.padStart(decimals + 1, "0"); const whole = value.slice(0, -decimals || undefined); const fullFraction = decimals ? value.slice(-decimals).replace(/0+$/, "") : ""; const fraction = fullFraction.slice(0, 6); return `${whole}${fraction ? `.${fraction}${fullFraction.length > 6 ? "…" : ""}` : ""}`; }
function short(value: string): string { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function formatIndexTiming(t: Translate, delta: number | null): string { if (delta === null) return t("rwa.common.unknown"); if (delta === 0) return t("rwa.morpho.indexSameBlock"); return delta > 0 ? t("rwa.morpho.indexBehind", { delta: delta.toLocaleString() }) : t("rwa.morpho.indexAhead", { delta: Math.abs(delta).toLocaleString() }); }
function formatFees(t: Translate, management: string | null, performance: string | null): string { const entries: Array<[TranslationKey, string | null]> = [["rwa.morpho.fee.management", management], ["rwa.morpho.fee.performance", performance]]; const values = entries.filter((entry): entry is [TranslationKey, string] => entry[1] !== null).map(([labelKey, value]) => `${t(labelKey)} ${formatRaw(value, 16)}%`); return values.length ? values.join(" · ") : t("rwa.morpho.noFeeFields"); }
