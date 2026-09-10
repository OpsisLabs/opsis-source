import {
  ArrowRight,
  Boxes,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  FilePenLine,
  LockKeyhole,
  Search,
  ShieldX,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { productFeatures } from "../product/features";
import { isProductFeatureEnabled } from "../product/availability";
import { useI18n } from "../i18n";
import KnowledgeHeader from "./KnowledgeHeader";

const STARTING_PATHS = [
  {
    icon: Search,
    step: "01",
    titleKey: "guide.feature.path1.title",
    descriptionKey: "guide.feature.path1.description",
    actionKey: "guide.feature.path1.action",
    path: "/app",
  },
  {
    icon: ChartNoAxesCombined,
    step: "02",
    titleKey: "guide.feature.path2.title",
    descriptionKey: "guide.feature.path2.description",
    actionKey: "guide.feature.path2.action",
    path: "/vault?view=portfolio",
  },
  {
    icon: FilePenLine,
    step: "03",
    titleKey: "guide.feature.path3.title",
    descriptionKey: "guide.feature.path3.description",
    actionKey: "guide.feature.path3.action",
    path: "/vault?view=assets",
  },
] as const;

const SPECIALIST_IDS = new Set([
  "scout-swap",
  "rwa-verify",
  "collectible-catalog",
  "market-inventory",
  "replay-actions",
]);

export default function FeatureGuide() {
  const location = useLocation();
  const { t } = useI18n();
  const features = productFeatures(t);
  const specialistTools = features.filter((feature) => SPECIALIST_IDS.has(feature.id));

  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!(target instanceof HTMLDetailsElement)) return;
    target.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <KnowledgeHeader active="guide" />

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <section className="max-w-[820px]">
          <p className="font-mono-d text-[10px] tracking-[0.2em] text-[#fa6c34]">{t("guide.feature.eyebrow")}</p>
          <h1 className="mt-5 text-[44px] font-medium leading-[0.98] tracking-[-0.045em] text-[#f0e8da] sm:text-[66px]">
            {t("guide.feature.titleLead")}<br /><span className="text-[#d6ccba]">{t("guide.feature.titleAccent")}</span>
          </h1>
          <p className="mt-6 max-w-[650px] text-[15px] leading-relaxed text-[#9a938a]">
            {t("guide.feature.intro")}
          </p>
        </section>

        <section className="mt-10 grid gap-3 lg:grid-cols-3" aria-label={t("guide.feature.startingAria")}>
          {STARTING_PATHS.map(({ icon: Icon, step, titleKey, descriptionKey, actionKey, path }) => (
            <Link key={step} to={path} className="group flex min-h-[260px] flex-col border border-[#fa6c34]/35 bg-[#22201f] p-6 outline-none transition-colors hover:border-[#fa6c34] hover:bg-[#29221f] focus-visible:ring-2 focus-visible:ring-[#fa6c34] sm:p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center border border-[#fa6c34]/45 bg-[#fa6c34]/10 text-[#fa6c34]"><Icon size={17} /></span>
                <span className="font-mono-d text-[10px] tracking-[0.16em] text-[#fa6c34]">{step}</span>
              </div>
              <h2 className="mt-7 text-[24px] font-medium leading-tight tracking-[-0.025em] text-[#f0e8da]">{t(titleKey)}</h2>
              <p className="mt-3 text-[13px] leading-relaxed text-[#9a938a]">{t(descriptionKey)}</p>
              <span className="mt-auto flex items-center gap-2 pt-7 font-mono-d text-[9px] font-semibold tracking-[0.1em] text-[#fa6c34]">
                {t(actionKey)} <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-6 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2">
          <div className="bg-[#242424] p-5 sm:p-6">
            <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#fa6c34]">{t("guide.feature.lookupLabel")}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#b7aea2]">{t("guide.feature.lookupCopy")}</p>
          </div>
          <div className="bg-[#242424] p-5 sm:p-6">
            <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.16em] text-[#7fb069]"><LockKeyhole size={12} /> {t("guide.feature.saveLabel")}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#b7aea2]">{t("guide.feature.saveCopy")}</p>
          </div>
        </section>

        <section className="mt-16">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{t("guide.feature.specialistEyebrow")}</p>
              <h2 className="mt-3 text-[30px] font-medium tracking-[-0.035em] text-[#f0e8da]">{t("guide.feature.specialistTitle")}</h2>
            </div>
            <p className="max-w-[420px] text-[12.5px] leading-relaxed text-[#7f7972]">{t("guide.feature.specialistCopy")}</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {specialistTools.map((feature) => (
              isProductFeatureEnabled(feature.id) ? <Link key={feature.id} to={feature.path} className="group flex items-center gap-4 border border-[#383838] bg-[#222222] p-5 outline-none transition-colors hover:border-[#fa6c34]/70 hover:bg-[#272321] focus-visible:ring-2 focus-visible:ring-[#fa6c34]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#fa6c34]/35 text-[#fa6c34]"><Boxes size={15} /></span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-[#e9e0d1]">{feature.label}</span>
                  <span className="mt-1 block text-[11.5px] text-[#9a938a]">{feature.navHint}</span>
                </span>
                <ArrowRight size={14} className="ml-auto shrink-0 text-[#635d5a] transition-all group-hover:translate-x-1 group-hover:text-[#fa6c34]" />
              </Link> : <article key={feature.id} className="flex items-center gap-4 border border-[#383838] bg-[#202020] p-5 opacity-70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#4a4541] text-[#756d68]"><Boxes size={15} /></span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-[#aaa097]">{feature.label}</span>
                  <span className="mt-1 block font-mono-d text-[8px] tracking-[0.1em] text-[#756d68]">{t("guide.feature.comingSoon")}</span>
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-labelledby="all-tools-title">
          <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#635d5a]">{t("guide.feature.allToolsEyebrow")}</p>
          <h2 id="all-tools-title" className="mt-3 text-[30px] font-medium tracking-[-0.035em] text-[#f0e8da]">{t("guide.feature.allToolsTitle")}</h2>
          <p className="mt-3 max-w-[620px] text-[13px] leading-relaxed text-[#9a938a]">{t("guide.feature.allToolsCopy")}</p>

          <div className="mt-6 border border-[#383838]">
            {features.map((feature, index) => (
              <details id={feature.id} key={feature.id} className="group scroll-mt-24 border-b border-[#383838] bg-[#222222] last:border-b-0 open:bg-[#252321]">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#fa6c34] sm:px-6">
                  <span className="font-mono-d text-[9px] text-[#fa6c34]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-medium text-[#e9e0d1]">{feature.label}</h2>
                    <span className="mt-1 block text-[11.5px] text-[#7f7972]">{feature.navHint}</span>
                  </span>
                  <ChevronDown size={16} className="shrink-0 text-[#fa6c34] transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-[#383838] px-5 pb-6 pt-5 sm:px-6">
                  <p className="max-w-[760px] text-[13px] leading-relaxed text-[#b7aea2]">{feature.summary}</p>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="border border-[#383838] bg-[#1f1f1f] p-4">
                      <p className="flex items-center gap-2 font-mono-d text-[8px] tracking-[0.14em] text-[#7fb069]"><Check size={11} /> {t("guide.feature.bestFor")}</p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-[#9a938a]">{feature.bestFor}</p>
                    </div>
                    <div className="border border-[#383838] bg-[#1f1f1f] p-4">
                      <p className="flex items-center gap-2 font-mono-d text-[8px] tracking-[0.14em] text-[#7fb069]"><LockKeyhole size={11} /> {t("guide.feature.privacy")}</p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-[#9a938a]">{feature.privacy}</p>
                    </div>
                    <div className="border border-[#383838] bg-[#1f1f1f] p-4">
                      <p className="flex items-center gap-2 font-mono-d text-[8px] tracking-[0.14em] text-[#e0738a]"><ShieldX size={11} /> {t("guide.feature.limit")}</p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-[#9a938a]">{feature.boundary}</p>
                    </div>
                  </div>
                  <ol className="mt-5 grid gap-2 md:grid-cols-3">
                    {feature.steps.map((step, stepIndex) => (
                      <li key={`${feature.id}-${stepIndex}`} className="flex gap-3 text-[11.5px] leading-relaxed text-[#9a938a]">
                        <span className="font-mono-d text-[9px] text-[#fa6c34]">{stepIndex + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {isProductFeatureEnabled(feature.id) ? (
                    <Link to={feature.path} className="clip-btn-sm mt-6 inline-flex items-center gap-2 bg-[#fa6c34] px-5 py-3 font-mono-d text-[9px] font-semibold tracking-[0.1em] text-[#1d1d1d] hover:bg-[#ff7038]">
                      {t("guide.feature.open", { name: feature.shortLabel.toUpperCase() })} <ArrowRight size={12} />
                    </Link>
                  ) : (
                    <p className="mt-6 inline-flex border border-[#4a4541] bg-[#202020] px-5 py-3 font-mono-d text-[9px] tracking-[0.1em] text-[#817872]">{t("guide.feature.comingSoon")}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2">
          <div className="bg-[#242424] p-6 sm:p-8">
            <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">{t("guide.feature.chatsEyebrow")}</p>
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">{t("guide.feature.chatsTitle")}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#9a938a]">{t("guide.feature.chatsCopy")}</p>
            <Link to="/app#local-history" className="mt-5 inline-flex font-mono-d text-[10px] tracking-wider text-[#fa6c34]">{t("guide.feature.chatsLink")}</Link>
          </div>
          <div className="bg-[#242424] p-6 sm:p-8">
            <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">{t("guide.feature.roadmapEyebrow")}</p>
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">{t("guide.feature.roadmapTitle")}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#9a938a]">{t("guide.feature.roadmapCopy")}</p>
            <Link to="/roadmap" className="mt-5 inline-flex font-mono-d text-[10px] tracking-wider text-[#fa6c34]">{t("guide.feature.roadmapLink")}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
