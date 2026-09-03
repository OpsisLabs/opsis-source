import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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

const SAMPLE_STOCK = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
const SAMPLE_VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd";

export default function RwaVerify() {
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
      setError("Paste one complete Robinhood Chain contract address.");
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
      setError(requestError instanceof ApiError ? requestError.message : "The public evidence sources are unavailable. Nothing was saved; try again shortly.");
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
      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label="ChainScout home">
          <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}><img src="/logo.svg" alt="" className="h-5 w-5" /></span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">CHAINSCOUT</span>
        </Link>
        <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#c9a6ff] sm:text-[10.5px]"><BadgeCheck size={13} /> RWA VERIFY</div>
        <nav className="flex items-center gap-4 font-mono-d text-[9px] text-[#7f7972] sm:text-[10px]"><Link to="/vault" className="hover:text-[#e9e0d1]">VAULT</Link><Link to="/app" className="hover:text-[#e9e0d1]">PRIVATE MODE</Link></nav>
      </header>

      <main className="workspace-layout">
        <section className="workspace-heading">
          <div>
            <p className="workspace-eyebrow"><BadgeCheck size={14} /> RWA Verify · public evidence</p>
            <h1 className="workspace-title">Know what the token<br /><span className="text-[#d6ccba]">actually represents.</span></h1>
            <p className="workspace-description">Check a token or vault contract against source-linked identity, pricing, custody, and redemption evidence. See what is confirmed—and what remains unknown.</p>
          </div>
          <WorkspaceDisclosure title="What this check includes" className="workspace-privacy-details">
          <div className="grid grid-cols-2 gap-px border border-[#383838] bg-[#383838]">
            <Feature icon={<Search size={14} />} label="IDENTITY" value="ADDRESS FIRST" />
            <Feature icon={<ShieldCheck size={14} />} label="EXECUTION" value="READ ONLY" />
            <Feature icon={<DatabaseZap size={14} />} label="QUERY / RESULT HISTORY" value="NONE" />
            <Feature icon={<Sparkles size={14} />} label="AI UPLOAD" value="NONE" />
          </div>
          </WorkspaceDisclosure>
        </section>

        <form onSubmit={prepare} className="clip-panel border border-[#423a49] bg-[#242424]">
          <div className="flex items-center gap-2.5 border-b border-[#383838] px-5 py-4 sm:px-6"><Box size={14} className="text-[#c9a6ff]" /><span className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">RWA EVIDENCE INSPECTOR</span><span className="ml-auto font-mono-d text-[9px] text-[#635d5a]">ROBINHOOD CHAIN · 4663</span></div>
          <label className="block p-5 sm:p-7">
            <span className="font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a]">TOKEN OR VAULT CONTRACT</span>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input value={address} disabled={loading} onChange={(event) => { setAddress(event.target.value); setError(""); }} autoComplete="off" spellCheck={false} placeholder="0x…" aria-label="RWA contract address" className="min-h-[50px] flex-1 border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[12px] text-[#e9e0d1] outline-none focus:border-[#c9a6ff]/60 disabled:opacity-60 sm:text-[14px]" />
              <button ref={verifyButton} type="submit" disabled={!address.trim() || loading} className="clip-btn-sm flex min-h-[50px] items-center justify-center gap-2 bg-[#c9a6ff] px-7 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-50"><FileCheck2 size={14} /> {loading ? "VERIFYING…" : "VERIFY EVIDENCE"}</button>
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#383838] px-5 py-4 sm:px-7"><span className="mr-2 font-mono-d text-[9px] text-[#635d5a]">TRY A LIVE SAMPLE</span><button type="button" disabled={loading} onClick={() => sample(SAMPLE_STOCK)} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#9a938a] hover:border-[#c9a6ff]/50 hover:text-[#e9e0d1] disabled:opacity-40">AAPL STOCK TOKEN</button><button type="button" disabled={loading} onClick={() => sample(SAMPLE_VAULT)} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#9a938a] hover:border-[#c9a6ff]/50 hover:text-[#e9e0d1] disabled:opacity-40">STEAKHOUSE USDG</button></div>
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
      <div className="flex items-center border-b border-[#383838] px-6 py-5"><LockKeyhole size={15} className="text-[#c9a6ff]" /><h2 id="rwa-consent-title" className="ml-3 font-mono-d text-[11px] tracking-[0.14em]">EXACT NETWORK RECEIPT</h2><button onClick={onCancel} aria-label="Cancel" className="ml-auto text-[#635d5a] hover:text-[#e9e0d1]"><X size={18} /></button></div>
      <div className="p-6">
        <p className="text-[13px] leading-relaxed text-[#9a938a]">If you continue, this public contract may be sent to ChainScout, Robinhood’s Stock Token API and public RPC, or Morpho’s public API. A matching Stock Token can also cause its derived public Chainlink feed address to be read.</p>
        <div className="mt-5 border border-[#383838] bg-[#1d1d1d] p-4"><p className="font-mono-d text-[9px] text-[#635d5a]">PUBLIC CONTRACT</p><p className="mt-2 break-all font-mono-d text-[11px] text-[#d6ccba]">{address}</p></div>
        <ul className="mt-5 space-y-2 text-[12px] text-[#9a938a]"><li className="flex gap-2"><Check size={13} className="mt-0.5 text-[#7fb069]" />No account cookie, wallet connection, AI model, or saved query/result history.</li><li className="flex gap-2"><Check size={13} className="mt-0.5 text-[#7fb069]" />No transaction, mint, redemption, deposit, or withdrawal is prepared.</li><li className="flex gap-2"><AlertTriangle size={13} className="mt-0.5 text-[#d9a441]" />Public providers can observe the contract lookup under their own policies.</li></ul>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-[#383838] p-5 sm:flex-row sm:justify-end"><button onClick={onCancel} className="min-h-[44px] border border-[#383838] px-5 font-mono-d text-[10px] text-[#9a938a]">CANCEL</button><button data-confirm onClick={onConfirm} className="clip-btn-sm min-h-[44px] bg-[#c9a6ff] px-6 font-mono-d text-[10px] font-medium text-[#1d1d1d]">CONFIRM PUBLIC LOOKUP</button></div>
    </div>
  </div>;
}

function EvidenceResult({ result }: { result: RwaVerification }) {
  const tone = result.kind === "unsupported_contract" ? "#d9a441" : result.checks.some((item) => item.status === "conflict") ? "#e0738a" : "#7fb069";
  return <section className="mt-8 space-y-5" data-testid="rwa-result" aria-live="polite">
    <div className="clip-panel border border-[#383838] bg-[#242424]">
      <div className="h-1" style={{ background: tone }} />
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
        <div><p className="font-mono-d text-[9.5px] tracking-[0.14em]" style={{ color: tone }}>{result.kind.replaceAll("_", " ").toUpperCase()}</p><h2 className="mt-3 text-[27px] font-medium tracking-[-0.025em] text-[#f0e8da] sm:text-[34px]">{result.headline}</h2><p className="mt-3 max-w-[790px] text-[13.5px] leading-relaxed text-[#9a938a]">{result.summary}</p><p className="mt-4 break-all font-mono-d text-[9px] text-[#635d5a]">VERIFIED CONTRACT · {result.address}</p></div>
        <div className="min-w-[220px] border border-[#383838] bg-[#1d1d1d] p-4"><p className="font-mono-d text-[8.5px] text-[#635d5a]">CAPTURED CURRENT BLOCK</p><p className="mt-2 font-mono-d text-[17px] text-[#d6ccba]">{result.anchor.blockNumber.toLocaleString()}</p><p className="mt-2 font-mono-d text-[8.5px] text-[#d9a441]">NON-FINAL · HASH RECHECKED</p><p className="mt-3 break-all font-mono-d text-[8px] text-[#635d5a]">{result.anchor.blockHash}</p></div>
      </div>
    </div>

    {result.stock && <StockDetails stock={result.stock} />}
    {result.morpho && <MorphoDetails morpho={result.morpho} />}

    <div className="grid gap-4 lg:grid-cols-2">{result.checks.map((item) => <EvidenceCard key={item.id} check={item} sources={result.sources} />)}</div>

    <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
      <section className="clip-panel border border-[#383838] bg-[#242424] p-6"><div className="flex items-center gap-2"><ShieldAlert size={15} className="text-[#d9a441]" /><h3 className="font-mono-d text-[10.5px] tracking-[0.13em]">WHAT THIS DOES NOT PROVE</h3></div><ul className="mt-5 space-y-3">{result.limitations.map((item) => <li key={item} className="flex gap-3 text-[12.5px] leading-relaxed text-[#9a938a]"><ChevronRight size={13} className="mt-1 shrink-0 text-[#635d5a]" />{item}</li>)}</ul></section>
      <section className="clip-panel border border-[#7fb069]/25 bg-[#7fb069]/5 p-6"><div className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#7fb069]" /><h3 className="font-mono-d text-[10.5px] tracking-[0.13em] text-[#7fb069]">PRIVACY RECEIPT</h3></div><p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">{result.privacy.disclosure}</p><p className="mt-4 font-mono-d text-[8.5px] leading-relaxed text-[#635d5a]">DESTINATIONS · {result.privacy.providerDestinations.join(" · ").toUpperCase()}</p></section>
    </div>

    <Sources sources={result.sources} />
  </section>;
}

function StockDetails({ stock }: { stock: NonNullable<RwaVerification["stock"]> }) {
  return <div className="grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2 lg:grid-cols-4">
    <Metric icon={<Building2 size={14} />} label="TOKEN" value={`${stock.symbol} · ${stock.decimals} DECIMALS`} detail={`${stock.name} · ${stock.registryStatus.replace("ASSET_STATUS_", "")}`} />
    <Metric icon={<Layers3 size={14} />} label="UI MULTIPLIER" value={stock.currentMultiplier} detail={stock.pendingMultiplier ? `Pending ${stock.pendingMultiplier}${stock.pendingEffectiveAt ? ` · effective ${new Date(stock.pendingEffectiveAt).toLocaleString()}` : ""}` : "No scheduled change"} />
    <Metric icon={<BarChart3 size={14} />} label="UNDERLYING QUOTE" value={stock.underlyingQuote ? `${stock.underlyingQuote.tradingHalted ? "HALTED · " : stock.underlyingQuote.state === "stale" ? "STALE · " : ""}${stock.underlyingQuote.bid} / ${stock.underlyingQuote.ask} ${stock.underlyingQuote.currency}` : "UNAVAILABLE"} detail={stock.underlyingQuote ? `Raw equity bid / ask—not token value · generated ${new Date(stock.underlyingQuote.generatedAt).toLocaleString()}` : "No valid underlying quote response"} />
    <Metric icon={<CircleDollarSign size={14} />} label="PER-TOKEN ORACLE" value={stock.oracle?.state === "current" && stock.oracle.value ? `$${stock.oracle.value}` : stock.oracle?.state.replaceAll("_", " ").toUpperCase() ?? "NO FEED"} detail={stock.oracle?.updatedAt ? `${stock.oracle.state === "current" ? "Updated" : `Last returned ${stock.oracle.value ? `$${stock.oracle.value} · ` : ""}at`} ${new Date(stock.oracle.updatedAt).toLocaleString()}` : "No usable oracle value"} />
    {stock.corporateActions.length > 0 && <div className="bg-[#202020] p-5 sm:col-span-2 lg:col-span-4"><p className="font-mono-d text-[9px] text-[#635d5a]">CORPORATE ACTIONS · PROCESS DATE IS NOT NECESSARILY PAYMENT DATE</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{stock.corporateActions.map((action) => <div key={action.id} className="border border-[#383838] bg-[#242424] p-4"><p className="font-mono-d text-[10px] text-[#d6ccba]">{action.type.replaceAll("_", " ")}</p><p className="mt-2 text-[11px] text-[#9a938a]">{action.status.replaceAll("_", " ")} · {action.processDate ?? "DATE UNSUPPLIED"}</p><p className="mt-2 text-[11px] leading-relaxed text-[#635d5a]">{action.detail}</p></div>)}</div></div>}
  </div>;
}

function MorphoDetails({ morpho }: { morpho: NonNullable<RwaVerification["morpho"]> }) {
  return <div className="grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2 lg:grid-cols-4">
    <Metric icon={<Building2 size={14} />} label="VAULT" value={`${morpho.symbol} · V${morpho.version}`} detail={morpho.name} />
    <Metric icon={<BadgeCheck size={14} />} label="MORPHO STATUS" value={morpho.listed === true ? "LISTED" : morpho.listed === false ? "UNLISTED" : "UNKNOWN"} detail="Provider classification—not endorsement" />
    <Metric icon={<CircleDollarSign size={14} />} label="TRAILING 24H APY" value={morpho.trailing24hApy ? `${(Number(morpho.trailing24hApy) * 100).toFixed(2)}%` : "UNAVAILABLE"} detail="Variable history—not guaranteed" />
    <Metric icon={<Clock3 size={14} />} label="INDEX TIMING" value={formatIndexTiming(morpho.indexLagBlocks)} detail={morpho.indexedBlock ? `Morpho block ${morpho.indexedBlock.toLocaleString()}` : "No index anchor"} />
    <Metric icon={<Layers3 size={14} />} label="DIRECT TOTAL ASSETS" value={formatRaw(morpho.totalAssetsRaw, morpho.asset.decimals)} detail={morpho.asset.symbol} />
    <Metric icon={<Box size={14} />} label="INDEXED WITHDRAWABLE" value={morpho.withdrawableAssetsRaw ? formatRaw(morpho.withdrawableAssetsRaw, morpho.asset.decimals) : "UNAVAILABLE"} detail="Not personal eligibility" />
    <Metric icon={<DatabaseZap size={14} />} label="INDEXED ALLOCATED" value={morpho.allocatedAssetsRaw ? formatRaw(morpho.allocatedAssetsRaw, morpho.asset.decimals) : "UNAVAILABLE"} detail={morpho.asset.symbol} />
    <Metric icon={<LockKeyhole size={14} />} label="INDEXED TIMELOCK + CONTROLS" value={`${Math.floor(morpho.timelockSeconds / 86400)} DAYS`} detail={`Morpho reports curator ${short(morpho.curator)} · ${Object.values(morpho.gates).filter(Boolean).length} active gates · ${formatFees(morpho.managementFeeWad, morpho.performanceFeeWad)}`} />
  </div>;
}

function EvidenceCard({ check, sources }: { check: RwaCheck; sources: RwaVerification["sources"] }) {
  const styles: Record<RwaCheck["status"], { color: string; label: string; icon: React.ReactNode }> = {
    confirmed: { color: "#7fb069", label: "EVIDENCE CONFIRMED", icon: <BadgeCheck size={14} /> },
    claim: { color: "#c9a6ff", label: "PRIMARY-SOURCE CLAIM", icon: <FileCheck2 size={14} /> },
    warning: { color: "#d9a441", label: "LIMIT / CAUTION", icon: <AlertTriangle size={14} /> },
    missing: { color: "#9a938a", label: "MISSING", icon: <Search size={14} /> },
    conflict: { color: "#e0738a", label: "CONFLICT", icon: <ShieldAlert size={14} /> },
    unsupported: { color: "#d9a441", label: "NOT VERIFIED", icon: <X size={14} /> }
  };
  const style = styles[check.status];
  const sourceNames = check.sourceIds.map((id) => sources.find((source) => source.id === id)?.provider).filter((name): name is string => Boolean(name));
  return <article className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6"><div className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.12em]" style={{ color: style.color }}>{style.icon}{style.label}</div><h3 className="mt-4 text-[16px] font-medium text-[#e9e0d1]">{check.label}</h3><p className="mt-2 text-[12.5px] leading-relaxed text-[#9a938a]">{check.detail}</p><p className="mt-4 border-t border-[#383838] pt-3 font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">SOURCE · {sourceNames.length ? [...new Set(sourceNames)].join(" + ").toUpperCase() : "NO SUPPORTED SOURCE"}</p></article>;
}

function Sources({ sources }: { sources: RwaVerification["sources"] }) {
  return <section className="clip-panel border border-[#383838] bg-[#202020] p-6"><h3 className="font-mono-d text-[10px] tracking-[0.14em] text-[#d6ccba]">SOURCE LEDGER · {sources.length}</h3><div className="mt-4 divide-y divide-[#383838]">{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="group flex flex-col gap-2 py-4 sm:flex-row sm:items-center"><span className="min-w-[155px] font-mono-d text-[9.5px] text-[#c9a6ff]">{source.provider.toUpperCase()}</span><span className="flex-1 text-[12px] text-[#9a938a] group-hover:text-[#e9e0d1]">{source.description}</span><span className="font-mono-d text-[8.5px] text-[#635d5a]">{new Date(source.fetchedAt).toLocaleString()} ↗</span></a>)}</div></section>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <div className="min-w-0 bg-[#202020] p-5"><div className="flex items-center gap-2 text-[#c9a6ff]">{icon}<span className="font-mono-d text-[8.5px] text-[#635d5a]">{label}</span></div><p className="mt-4 break-words font-mono-d text-[13px] text-[#e9e0d1]">{value}</p><p className="mt-2 text-[10.5px] leading-relaxed text-[#635d5a]">{detail}</p></div>; }
function Feature({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="bg-[#202020] p-4"><div className="flex items-center gap-2 text-[#c9a6ff]">{icon}<span className="font-mono-d text-[8.5px] text-[#635d5a]">{label}</span></div><p className="mt-3 font-mono-d text-[10px] tracking-wider text-[#d6ccba]">{value}</p></div>; }
function LoadingState() { return <div role="status" aria-live="polite" className="scan-panel clip-panel mt-8 overflow-hidden border border-[#c9a6ff]/25 bg-[#242424] p-8"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-ping rounded-full bg-[#c9a6ff]" /><p className="font-mono-d text-[10px] tracking-[0.14em] text-[#c9a6ff]">RECONCILING PUBLIC EVIDENCE</p></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{["REGISTRY", "DIRECT CONTRACT", "CLAIMS + FRESHNESS"].map((item) => <div key={item} className="decode-tile h-24 border border-[#383838] bg-[#1d1d1d] p-4"><p className="font-mono-d text-[9px] text-[#635d5a]">{item}</p><p className="mt-5 font-mono-d text-[16px] text-[#4f4a46]">0100110101</p></div>)}</div></div>; }
function EmptyState() { return <div className="workspace-empty mt-6"><BadgeCheck size={26} className="text-[#fa6c34]" /><h2 className="text-[18px] text-[#e9e0d1]">Start with a contract, not a ticker</h2><p>Use a live sample above or paste an exact address. Identity and authenticity are never inferred from a token name alone.</p></div>; }
function formatRaw(raw: string, decimals: number): string { const value = raw.padStart(decimals + 1, "0"); const whole = value.slice(0, -decimals || undefined); const fullFraction = decimals ? value.slice(-decimals).replace(/0+$/, "") : ""; const fraction = fullFraction.slice(0, 6); return `${whole}${fraction ? `.${fraction}${fullFraction.length > 6 ? "…" : ""}` : ""}`; }
function short(value: string): string { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function formatIndexTiming(delta: number | null): string { if (delta === null) return "UNKNOWN"; if (delta === 0) return "SAME BLOCK"; return delta > 0 ? `${delta.toLocaleString()} BLOCKS BEHIND` : `${Math.abs(delta).toLocaleString()} BLOCKS AHEAD`; }
function formatFees(management: string | null, performance: string | null): string { const values = [["management", management], ["performance", performance]].filter((entry): entry is [string, string] => entry[1] !== null).map(([label, value]) => `${label} ${formatRaw(value, 16)}%`); return values.length ? values.join(" · ") : "no fee fields reported"; }
