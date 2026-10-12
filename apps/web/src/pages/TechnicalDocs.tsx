import {
  ArrowDown,
  ArrowRight,
  Binary,
  BookOpenText,
  Braces,
  Check,
  CircleAlert,
  Code2,
  Database,
  Fingerprint,
  Gauge,
  KeyRound,
  LockKeyhole,
  Network,
  ScanSearch,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";
import KnowledgeHeader from "./KnowledgeHeader";
import { isCollectibleCatalogEnabled } from "../product/availability";
import { useI18n } from "../i18n";

const COLLECTIBLE_CATALOG_ENABLED = isCollectibleCatalogEnabled();

const SECTIONS = [
  ["architecture", "docs.nav.architecture"],
  ["vault", "docs.nav.vault"],
  ["evidence", "docs.nav.evidence"],
  ["adapters", "docs.nav.adapters"],
  ["security", "docs.nav.security"],
] as const;

const ARCHITECTURE_MODES = [
  { id: "ephemeral", icon: ScanSearch },
  { id: "vault", icon: LockKeyhole },
  { id: "cloud", icon: ServerCog },
] as const;

const PIPELINE = [
  { id: "browser", icon: Braces },
  { id: "origin", icon: Network },
  { id: "adapters", icon: ServerCog },
  { id: "normalized", icon: ShieldCheck },
] as const;

const EVIDENCE = [
  { id: "identity", icon: Fingerprint },
  { id: "exactValues", icon: Binary },
  { id: "freshness", icon: Gauge },
  { id: "reconciliation", icon: ScanSearch },
  { id: "provenance", icon: BookOpenText },
  { id: "failClosed", icon: ShieldCheck },
] as const;

const ADAPTERS = [
  { id: "privateExplorer", badge: "PR", gated: false },
  { id: "swapPreview", badge: "SC", gated: false },
  { id: "portfolio", badge: "PO", gated: false },
  { id: "rwaVerify", badge: "RW", gated: false },
  { id: "collectibles", badge: "CO", gated: !COLLECTIBLE_CATALOG_ENABLED },
  { id: "marketInventory", badge: "MA", gated: true },
  { id: "cardPrices", badge: "CA", gated: import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED !== "true" },
  { id: "openData", badge: "OP", gated: true },
  { id: "replayActions", badge: "RE", gated: true },
] as const;

const SECURITY_BOUNDARIES = [
  "noSigner",
  "networkReceipts",
  "sameOrigin",
  "boundedDestinations",
  "lowData",
  "killSwitches",
] as const;

const KEY_LIFECYCLE = [
  "docs.vault.keyLifecycle.item1",
  "docs.vault.keyLifecycle.item2",
  "docs.vault.keyLifecycle.item3",
  "docs.vault.keyLifecycle.item4",
] as const;

const RECORD_INTEGRITY = [
  "docs.vault.integrity.item1",
  "docs.vault.integrity.item2",
  "docs.vault.integrity.item3",
  "docs.vault.integrity.item4",
] as const;

function DocSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[#383838] pt-12 sm:pt-16">
      <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{eyebrow}</p>
      <h2 className="mt-3 text-[31px] font-medium tracking-[-0.035em] text-[#f0e8da] sm:text-[40px]">{title}</h2>
      {children}
    </section>
  );
}

export default function TechnicalDocs() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <KnowledgeHeader active="docs" />

      <main className="mx-auto grid w-full max-w-[1240px] gap-10 px-4 pb-24 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 border-l border-[#383838] pl-4" aria-label={t("docs.nav.aria")}>
            <p className="mb-4 font-mono-d text-[8px] tracking-[0.18em] text-[#635d5a]">{t("docs.nav.onThisPage")}</p>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block py-2 text-[11.5px] text-[#8f8880] transition-colors hover:text-[#fa6c34]">
                {t(label)}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <section className="max-w-[900px]">
            <div className="inline-flex items-center gap-2 border border-[#fa6c34]/40 bg-[#fa6c34]/8 px-3 py-2 font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
              <Code2 size={13} /> {t("docs.header.eyebrow")}
            </div>
            <h1 className="mt-6 text-[46px] font-medium leading-[0.96] tracking-[-0.05em] text-[#f0e8da] sm:text-[68px]">
              {t("docs.title.line1")}<br /><span className="text-[#bdb3a6]">{t("docs.title.line2")}</span>
            </h1>
            <p className="mt-6 max-w-[760px] text-[15px] leading-relaxed text-[#9a938a]">
              {t("docs.header.description")}
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link to="/faq" className="inline-flex items-center gap-2 border border-[#484848] px-5 py-3 font-mono-d text-[9px] tracking-[0.1em] text-[#c7bdb0] hover:border-[#fa6c34] hover:text-[#f0e8da]">
                {t("docs.header.readFaq")} <ArrowRight size={12} />
              </Link>
            </div>
          </section>

          <DocSection id="architecture" eyebrow={t("docs.architecture.eyebrow")} title={t("docs.architecture.title")}>
            <p className="mt-4 max-w-[760px] text-[13.5px] leading-relaxed text-[#9a938a]">
              {t("docs.architecture.intro")}
            </p>
            <div className="mt-7 grid gap-px border border-[#383838] bg-[#383838] md:grid-cols-3">
              {ARCHITECTURE_MODES.map(({ id, icon: DataIcon }) => (
                <article key={id} className="bg-[#222222] p-5 sm:p-6">
                  <DataIcon size={18} className="text-[#fa6c34]" />
                  <h3 className="mt-5 font-mono-d text-[10px] tracking-[0.13em] text-[#f0e8da]">{t(`docs.architecture.mode.${id}.name`)}</h3>
                  <dl className="mt-5 space-y-3 text-[10.5px]">
                    <div><dt className="text-[#635d5a]">{t("docs.label.input")}</dt><dd className="mt-1 text-[#b7aea2]">{t(`docs.architecture.mode.${id}.input`)}</dd></div>
                    <div><dt className="text-[#635d5a]">{t("docs.label.path")}</dt><dd className="mt-1 text-[#b7aea2]">{t(`docs.architecture.mode.${id}.path`)}</dd></div>
                    <div><dt className="text-[#635d5a]">{t("docs.label.storage")}</dt><dd className="mt-1 text-[#b7aea2]">{t(`docs.architecture.mode.${id}.storage`)}</dd></div>
                  </dl>
                  <p className="mt-5 border-t border-[#383838] pt-4 text-[11px] leading-relaxed text-[#8f8880]">{t(`docs.architecture.mode.${id}.copy`)}</p>
                </article>
              ))}
            </div>

            <div className="mt-7 overflow-hidden border border-[#3b3735] bg-[#211f1e] p-5 sm:p-7">
              <p className="font-mono-d text-[8px] tracking-[0.16em] text-[#635d5a]">{t("docs.architecture.pipeline.eyebrow")}</p>
              <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
                {PIPELINE.map(({ id, icon: FlowIcon }, index) => (
                  <div key={id} className="contents">
                    <div className="border border-[#3b3735] bg-[#252321] p-4 text-center">
                      <FlowIcon size={15} className="mx-auto text-[#fa6c34]" />
                      <p className="mt-3 font-mono-d text-[8px] tracking-[0.12em] text-[#ded5c8]">{t(`docs.architecture.pipeline.${id}.name`)}</p>
                      <p className="mt-1 text-[9.5px] text-[#716b65]">{t(`docs.architecture.pipeline.${id}.note`)}</p>
                    </div>
                    {index < 3 && <ArrowDown size={13} className="mx-auto rotate-0 text-[#fa6c34] sm:-rotate-90" />}
                  </div>
                ))}
              </div>
            </div>
          </DocSection>

          <DocSection id="vault" eyebrow={t("docs.vault.eyebrow")} title={t("docs.vault.title")}>
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <article className="border border-[#383838] bg-[#222222] p-6">
                <KeyRound size={19} className="text-[#fa6c34]" />
                <h3 className="mt-5 text-[20px] text-[#f0e8da]">{t("docs.vault.keyLifecycle.title")}</h3>
                <ol className="mt-5 space-y-4">
                  {KEY_LIFECYCLE.map((key, index) => (
                    <li key={key} className="flex gap-3 text-[11.5px] leading-relaxed text-[#9a938a]"><span className="font-mono-d text-[9px] text-[#fa6c34]">0{index + 1}</span>{t(key)}</li>
                  ))}
                </ol>
              </article>
              <article className="border border-[#383838] bg-[#222222] p-6">
                <Database size={19} className="text-[#fa6c34]" />
                <h3 className="mt-5 text-[20px] text-[#f0e8da]">{t("docs.vault.integrity.title")}</h3>
                <ul className="mt-5 space-y-4">
                  {RECORD_INTEGRITY.map((key) => (
                    <li key={key} className="flex gap-3 text-[11.5px] leading-relaxed text-[#9a938a]"><Check size={12} className="mt-0.5 shrink-0 text-[#7fb069]" />{t(key)}</li>
                  ))}
                </ul>
              </article>
            </div>
            <div className="mt-4 border border-[#6b4a3b] bg-[#2a211e] p-5">
              <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.13em] text-[#ff9b72]"><CircleAlert size={13} /> {t("docs.vault.warning.title")}</p>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[#b7aea2]">{t("docs.vault.warning.body")}</p>
            </div>
            <div className="mt-4 border border-[#383838] bg-[#222222] p-5 sm:p-6">
              <p className="font-mono-d text-[9px] tracking-[0.13em] text-[#fa6c34]">{t("docs.vault.visual.eyebrow")}</p>
              <p className="mt-3 max-w-[800px] text-[11.5px] leading-relaxed text-[#9a938a]">
                {t("docs.vault.visual.body")}
              </p>
            </div>
          </DocSection>

          <DocSection id="evidence" eyebrow={t("docs.evidence.eyebrow")} title={t("docs.evidence.title")}>
            <p className="mt-4 max-w-[760px] text-[13.5px] leading-relaxed text-[#9a938a]">{t("docs.evidence.intro")}</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EVIDENCE.map(({ id, icon: EvidenceIcon }) => (
                <article key={id} className="border border-[#383838] bg-[#222222] p-5">
                  <EvidenceIcon size={16} className="text-[#fa6c34]" />
                  <h3 className="mt-4 font-mono-d text-[9px] tracking-[0.12em] text-[#ded5c8]">{t(`docs.evidence.${id}.title`)}</h3>
                  <p className="mt-3 text-[11px] leading-relaxed text-[#8f8880]">{t(`docs.evidence.${id}.copy`)}</p>
                </article>
              ))}
            </div>
          </DocSection>

          <DocSection id="adapters" eyebrow={t("docs.adapters.eyebrow")} title={t("docs.adapters.title")}>
            <p className="mt-4 max-w-[780px] text-[12px] leading-relaxed text-[#b7aea2]">
              {t(COLLECTIBLE_CATALOG_ENABLED ? "docs.adapters.introEnabled" : "docs.adapters.introGated")}
            </p>
            <div className="mt-7 overflow-hidden border border-[#383838]">
              {ADAPTERS.map((adapter) => (
                <details key={adapter.id} className="group border-b border-[#383838] bg-[#222222] last:border-b-0 open:bg-[#252321]">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#fa6c34]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#fa6c34]/45 font-mono-d text-[8px] text-[#fa6c34]">{adapter.badge}</span>
                    <span className="font-mono-d text-[9px] tracking-[0.12em] text-[#e2d9cc]">{t(`docs.adapters.${adapter.id}.name`)}</span>
                    {adapter.gated && <span className="border border-[#766f68] px-2 py-1 font-mono-d text-[7px] tracking-[0.1em] text-[#c8beb4]">{t("docs.adapters.comingSoon")}</span>}
                    <span className="ml-auto text-[#fa6c34] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <dl className="grid gap-px border-t border-[#383838] bg-[#383838] sm:grid-cols-2">
                    {[
                      [t("docs.label.input"), t(`docs.adapters.${adapter.id}.input`)],
                      [t("docs.label.process"), t(`docs.adapters.${adapter.id}.process`)],
                      [t("docs.label.output"), t(`docs.adapters.${adapter.id}.output`)],
                      [t("docs.label.boundary"), t(`docs.adapters.${adapter.id}.limit`)],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-[#1f1f1f] p-5"><dt className="font-mono-d text-[8px] tracking-[0.14em] text-[#635d5a]">{label}</dt><dd className="mt-2 text-[11px] leading-relaxed text-[#aaa197]">{value}</dd></div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          </DocSection>

          <DocSection id="security" eyebrow={t("docs.security.eyebrow")} title={t("docs.security.title")}>
            <div className="mt-7 grid gap-px border border-[#383838] bg-[#383838] md:grid-cols-2">
              {SECURITY_BOUNDARIES.map((id) => (
                <article key={id} className="bg-[#222222] p-5 sm:p-6"><p className="font-mono-d text-[9px] tracking-[0.13em] text-[#fa6c34]">{t(`docs.security.${id}.title`)}</p><p className="mt-3 text-[11.5px] leading-relaxed text-[#9a938a]">{t(`docs.security.${id}.copy`)}</p></article>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-[#716b65]">{t("docs.security.footer")}</p>
          </DocSection>
        </div>
      </main>
    </div>
  );
}
