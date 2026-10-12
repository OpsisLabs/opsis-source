import { useEffect, useState } from "react";
import { Braces, Check, Copy, ExternalLink, Gauge, LockKeyhole, ServerOff, ShieldCheck } from "lucide-react";
import type { OpenDataAssetListResponse, OpenDataIdentityResponse } from "@rh-chain/shared";
import KnowledgeHeader from "./KnowledgeHeader";
import { fetchOpenDataRegistry, normalizeOpenDataAddress, OPEN_DATA_PATHS } from "../open-data/api";
import { useI18n } from "../i18n";

type Registry = OpenDataAssetListResponse & {
  registryVersion: string;
  opsisSourceRevision: string | null;
  cap: { anonymousRequestsPerHour: number; scope: "pseudonymous_network_client" };
};

const SAMPLE = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

export default function Developers() {
  const { t } = useI18n();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [registryError, setRegistryError] = useState("");
  const [address, setAddress] = useState(SAMPLE);
  const [identity, setIdentity] = useState<OpenDataIdentityResponse | null>(null);
  const [normalizeError, setNormalizeError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchOpenDataRegistry(controller.signal).then(setRegistry).catch((error: unknown) => {
      if (!controller.signal.aborted) setRegistryError(error instanceof Error ? error.message : t("guide.dev.error.registryUnavailable"));
    });
    return () => controller.abort();
  }, [t]);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  };

  const normalize = async () => {
    setPending(true);
    setNormalizeError("");
    setIdentity(null);
    try {
      setIdentity(await normalizeOpenDataAddress(address.trim()));
    } catch (error) {
      setNormalizeError(error instanceof Error ? error.message : t("guide.dev.error.addressRejected"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <KnowledgeHeader active="developers" />
      <main className="mx-auto w-full max-w-[1160px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <div className="inline-flex items-center gap-2 border border-[#fa6c34]/40 bg-[#fa6c34]/8 px-3 py-2 font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
          <Braces size={13} /> {t("guide.dev.badge")}
        </div>
        <h1 className="mt-6 max-w-[860px] text-[44px] font-medium leading-[0.98] tracking-[-0.05em] text-[#f0e8da] sm:text-[66px]">
          {t("guide.dev.titleLead")}<br /><span className="text-[#bdb3a6]">{t("guide.dev.titleAccent")}</span>
        </h1>
        <p className="mt-6 max-w-[780px] text-[15px] leading-relaxed text-[#9a938a]">
          {t("guide.dev.intro")}
        </p>

        <section className="mt-10 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-3">
          {[
            [Gauge, t("guide.dev.card.capped.label"), t("guide.dev.card.capped.copy")],
            [ServerOff, t("guide.dev.card.providerCalls.label"), t("guide.dev.card.providerCalls.copy")],
            [LockKeyhole, t("guide.dev.card.credentials.label"), t("guide.dev.card.credentials.copy")],
          ].map(([Icon, label, copyText]) => {
            const ItemIcon = Icon as typeof Gauge;
            return <article key={label as string} className="bg-[#222222] p-5"><ItemIcon size={17} className="text-[#fa6c34]" /><p className="mt-4 font-mono-d text-[10px] tracking-[0.12em] text-[#e9e0d1]">{label as string}</p><p className="mt-2 text-[12px] leading-relaxed text-[#8f8880]">{copyText as string}</p></article>;
          })}
        </section>

        <section className="mt-14 border-t border-[#383838] pt-10">
          <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#fa6c34]">{t("guide.dev.registry.eyebrow")}</p>
          <h2 className="mt-3 text-[32px] font-medium tracking-[-0.035em] text-[#f0e8da]">{t("guide.dev.registry.title")}</h2>
          <CodeRow method="GET" path={OPEN_DATA_PATHS.registry} copied={copied} onCopy={copy} copyAria={t("guide.dev.copyAria", { path: OPEN_DATA_PATHS.registry })} />
          {registryError ? <Notice>{registryError}</Notice> : !registry ? <p className="mt-5 text-[12px] text-[#8f8880]">{t("guide.dev.registry.loading")}</p> : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {registry.assets.map((asset) => (
                <article key={asset.address} className="border border-[#383838] bg-[#222222] p-5">
                  <div className="flex items-center justify-between gap-3"><p className="font-mono-d text-[11px] tracking-[0.12em] text-[#fa6c34]">{asset.symbol}</p><span className="font-mono-d text-[8px] tracking-[0.1em] text-[#6ea879]">{t("guide.dev.registry.supported")}</span></div>
                  <p className="mt-3 break-all font-mono-d text-[10px] leading-relaxed text-[#c7bdb0]">{asset.address}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]"><div><dt className="text-[#635d5a]">{t("guide.dev.registry.decimals")}</dt><dd className="mt-1 text-[#d6ccba]">{asset.decimals}</dd></div><div><dt className="text-[#635d5a]">{t("guide.dev.registry.reviewed")}</dt><dd className="mt-1 text-[#d6ccba]">{asset.provenance.reviewedAt.slice(0, 10)}</dd></div></dl>
                  <a href={asset.sources[1]?.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-[#fa6c34] hover:text-[#ff9b72]">{t("guide.dev.registry.verificationLink")} <ExternalLink size={11} /></a>
                </article>
              ))}
            </div>
          )}
          {registry && <p className="mt-4 text-[11px] leading-relaxed text-[#7d756e]">{t("guide.dev.registry.summary", { version: registry.registryVersion, count: registry.cap.anonymousRequestsPerHour })}</p>}
        </section>

        <section className="mt-14 border-t border-[#383838] pt-10">
          <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#fa6c34]">{t("guide.dev.normalize.eyebrow")}</p>
          <h2 className="mt-3 text-[32px] font-medium tracking-[-0.035em] text-[#f0e8da]">{t("guide.dev.normalize.title")}</h2>
          <p className="mt-3 max-w-[760px] text-[13px] leading-relaxed text-[#9a938a]">{t("guide.dev.normalize.copy")}</p>
          <CodeRow method="POST" path={OPEN_DATA_PATHS.normalize} copied={copied} onCopy={copy} copyAria={t("guide.dev.copyAria", { path: OPEN_DATA_PATHS.normalize })} />
          <div className="mt-6 border border-[#383838] bg-[#222222] p-5">
            <label htmlFor="open-data-address" className="font-mono-d text-[9px] tracking-[0.13em] text-[#9a938a]">{t("guide.dev.normalize.addressLabel")}</label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input id="open-data-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={42} spellCheck={false} className="min-w-0 flex-1 border border-[#484848] bg-[#1b1b1b] px-4 py-3 font-mono-d text-[11px] text-[#e9e0d1] outline-none focus:border-[#fa6c34]" /><button type="button" onClick={normalize} disabled={pending} className="bg-[#fa6c34] px-5 py-3 font-mono-d text-[9px] font-semibold tracking-[0.12em] text-[#1d1d1d] disabled:opacity-50">{pending ? t("guide.dev.normalize.checking") : t("guide.dev.normalize.submit")}</button></div>
            {normalizeError && <Notice>{normalizeError}</Notice>}
            {identity && <div className="mt-5 border-l-2 border-[#6ea879] bg-[#1c241e] p-4"><div className="flex items-center gap-2 text-[#8bc496]"><Check size={14} /><span className="font-mono-d text-[9px] tracking-[0.12em]">{t("guide.dev.normalize.validLabel")}</span></div><p className="mt-3 break-all font-mono-d text-[11px] text-[#d6ccba]">{identity.normalizedValue}</p><p className="mt-2 text-[11px] text-[#8f8880]">{identity.registryMatch ? t("guide.dev.normalize.match", { symbol: identity.registryMatch.symbol }) : t("guide.dev.normalize.noMatch")}</p></div>}
          </div>
        </section>

        <section className="mt-14 border border-[#594439] bg-[#28211e] p-6">
          <div className="flex items-center gap-2 text-[#fa6c34]"><ShieldCheck size={16} /><p className="font-mono-d text-[9px] tracking-[0.14em]">{t("guide.dev.boundary.label")}</p></div>
          <p className="mt-4 max-w-[850px] text-[12.5px] leading-relaxed text-[#a99e94]">{t("guide.dev.boundary.copy")}</p>
          <a href="/open-data-v1.openapi.json" className="mt-5 inline-flex items-center gap-2 font-mono-d text-[9px] tracking-[0.12em] text-[#fa6c34] hover:text-[#ff9b72]">{t("guide.dev.openapi")} <ExternalLink size={11} /></a>
        </section>
      </main>
    </div>
  );
}

function CodeRow({ method, path, copied, onCopy, copyAria }: { method: string; path: string; copied: string; onCopy: (label: string, value: string) => void; copyAria: string }) {
  return <div className="mt-5 flex items-center gap-3 border border-[#383838] bg-[#191919] p-3"><span className="bg-[#fa6c34] px-2 py-1 font-mono-d text-[8px] font-semibold text-[#1d1d1d]">{method}</span><code className="min-w-0 flex-1 overflow-x-auto font-mono-d text-[10px] text-[#c7bdb0]">{path}</code><button type="button" onClick={() => onCopy(path, path)} aria-label={copyAria} className="text-[#8f8880] hover:text-[#fa6c34]">{copied === path ? <Check size={14} /> : <Copy size={14} />}</button></div>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border border-[#6f4b3e] bg-[#34231e] px-4 py-3 text-[11px] leading-relaxed text-[#e0a88f]">{children}</p>;
}
