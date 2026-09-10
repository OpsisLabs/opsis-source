import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Github,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router";
import KnowledgeHeader from "./KnowledgeHeader";
import { isCollectibleCatalogEnabled } from "../product/availability";
import { useI18n, type TranslateParams, type TranslationKey } from "../i18n";

const COLLECTIBLE_CATALOG_ENABLED = isCollectibleCatalogEnabled();

type FaqItem = {
  question: string;
  answer: React.ReactNode;
};

type Translate = (key: TranslationKey, params?: TranslateParams) => string;

const FACTS = [
  { icon: ShieldCheck, labelKey: "guide.faq.fact1.label" as const, copyKey: "guide.faq.fact1.copy" as const },
  { icon: LockKeyhole, labelKey: "guide.faq.fact2.label" as const, copyKey: "guide.faq.fact2.copy" as const },
  { icon: WalletCards, labelKey: "guide.faq.fact3.label" as const, copyKey: "guide.faq.fact3.copy" as const },
];

const linkClass = "text-[#fa6c34] underline decoration-[#fa6c34]/45 underline-offset-4";
const externalLinkClass = `${linkClass} hover:text-[#ff9b72]`;

function buildFaqGroups(t: Translate): Array<{ id: string; title: string; intro: string; items: FaqItem[] }> {
  return [
    {
      id: "basics",
      title: t("guide.faq.groups.basics.title"),
      intro: t("guide.faq.groups.basics.intro"),
      items: [
        {
          question: t("guide.faq.groups.basics.q1"),
          answer: t("guide.faq.groups.basics.a1"),
        },
        {
          question: t("guide.faq.groups.basics.q2"),
          answer: t("guide.faq.groups.basics.a2"),
        },
        {
          question: t("guide.faq.groups.basics.q3"),
          answer: t("guide.faq.groups.basics.a3"),
        },
        {
          question: t("guide.faq.groups.basics.q4"),
          answer: t("guide.faq.groups.basics.a4"),
        },
        {
          question: t("guide.faq.groups.basics.q5"),
          answer: t("guide.faq.groups.basics.a5"),
        },
      ],
    },
    {
      id: "privacy",
      title: t("guide.faq.groups.privacy.title"),
      intro: t("guide.faq.groups.privacy.intro"),
      items: [
        {
          question: t("guide.faq.groups.privacy.q1"),
          answer: t("guide.faq.groups.privacy.a1"),
        },
        {
          question: t("guide.faq.groups.privacy.q2"),
          answer: t("guide.faq.groups.privacy.a2"),
        },
        {
          question: t("guide.faq.groups.privacy.q3"),
          answer: t("guide.faq.groups.privacy.a3"),
        },
        {
          question: t("guide.faq.groups.privacy.q4"),
          answer: t("guide.faq.groups.privacy.a4"),
        },
        {
          question: t("guide.faq.groups.privacy.q5"),
          answer: t("guide.faq.groups.privacy.a5"),
        },
        {
          question: t("guide.faq.groups.privacy.q6"),
          answer: t("guide.faq.groups.privacy.a6"),
        },
        {
          question: t("guide.faq.groups.privacy.q7"),
          answer: t("guide.faq.groups.privacy.a7"),
        },
        {
          question: t("guide.faq.groups.privacy.q8"),
          answer: t("guide.faq.groups.privacy.a8"),
        },
      ],
    },
    {
      id: "evidence",
      title: t("guide.faq.groups.evidence.title"),
      intro: t("guide.faq.groups.evidence.intro"),
      items: [
        {
          question: t("cards.faq.question"),
          answer: t(import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED === "true" ? "cards.faq.available" : "cards.faq.comingSoon"),
        },
        {
          question: t("guide.faq.groups.evidence.q1"),
          answer: t(COLLECTIBLE_CATALOG_ENABLED ? "guide.faq.groups.evidence.a1Catalog" : "guide.faq.groups.evidence.a1Manual"),
        },
        {
          question: t(COLLECTIBLE_CATALOG_ENABLED ? "guide.faq.groups.evidence.q2Catalog" : "guide.faq.groups.evidence.q2Manual"),
          answer: t(COLLECTIBLE_CATALOG_ENABLED ? "guide.faq.groups.evidence.a2Catalog" : "guide.faq.groups.evidence.a2Manual"),
        },
        {
          question: t("guide.faq.groups.evidence.q3"),
          answer: t("guide.faq.groups.evidence.a3"),
        },
        {
          question: t("guide.faq.groups.evidence.q4"),
          answer: t("guide.faq.groups.evidence.a4"),
        },
        {
          question: t("guide.faq.groups.evidence.q5"),
          answer: t("guide.faq.groups.evidence.a5"),
        },
        {
          question: t("guide.faq.groups.evidence.q6"),
          answer: t("guide.faq.groups.evidence.a6"),
        },
        {
          question: t("guide.faq.groups.evidence.q7"),
          answer: t("guide.faq.groups.evidence.a7"),
        },
        {
          question: t("guide.faq.groups.evidence.q8"),
          answer: t("guide.faq.groups.evidence.a8"),
        },
      ],
    },
    {
      id: "actions",
      title: t("guide.faq.groups.actions.title"),
      intro: t("guide.faq.groups.actions.intro"),
      items: [
        {
          question: t("guide.faq.groups.actions.q1"),
          answer: t("guide.faq.groups.actions.a1"),
        },
        {
          question: t("guide.faq.groups.actions.q2"),
          answer: t("guide.faq.groups.actions.a2"),
        },
        {
          question: t("guide.faq.groups.actions.q3"),
          answer: t("guide.faq.groups.actions.a3"),
        },
        {
          question: t("guide.faq.groups.actions.q4"),
          answer: t("guide.faq.groups.actions.a4"),
        },
        {
          question: t("guide.faq.groups.actions.q5"),
          answer: t("guide.faq.groups.actions.a5"),
        },
      ],
    },
    {
      id: "token",
      title: t("guide.faq.groups.token.title"),
      intro: t("guide.faq.groups.token.intro"),
      items: [
        {
          question: t("guide.faq.groups.token.q1"),
          answer: t("guide.faq.groups.token.a1"),
        },
        {
          question: t("guide.faq.groups.token.q2"),
          answer: t("guide.faq.groups.token.a2"),
        },
        {
          question: t("guide.faq.groups.token.q3"),
          answer: t("guide.faq.groups.token.a3"),
        },
        {
          question: t("guide.faq.groups.token.q4"),
          answer: t("guide.faq.groups.token.a4"),
        },
        {
          question: t("guide.faq.groups.token.q5"),
          answer: (
            <>
              {t("guide.faq.groups.token.a5Prefix")}
              <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noreferrer" className={externalLinkClass}>{t("guide.faq.groups.token.a5Link")}</a>
              {t("guide.faq.groups.token.a5Suffix")}
            </>
          ),
        },
      ],
    },
    {
      id: "project",
      title: t("guide.faq.groups.project.title"),
      intro: t("guide.faq.groups.project.intro"),
      items: [
        {
          question: t("guide.faq.groups.project.q1"),
          answer: (
            <>
              {t("guide.faq.groups.project.a1Prefix")}
              <a href="https://github.com/ChainScoutAi/chainscout-source" target="_blank" rel="noreferrer" className={externalLinkClass}>github.com/ChainScoutAi/chainscout-source</a>
              {t("guide.faq.groups.project.a1Suffix")}
            </>
          ),
        },
        {
          question: t("guide.faq.groups.project.q2"),
          answer: t("guide.faq.groups.project.a2"),
        },
        {
          question: t("guide.faq.groups.project.q3"),
          answer: (
            <>
              {t("guide.faq.groups.project.a3Before")}
              <Link to="/guide" className={linkClass}>{t("guide.faq.groups.project.a3Guide")}</Link>
              {t("guide.faq.groups.project.a3BetweenDocs")}
              <Link to="/docs" className={linkClass}>{t("guide.faq.groups.project.a3Docs")}</Link>
              {t("guide.faq.groups.project.a3BetweenRoadmap")}
              <Link to="/roadmap" className={linkClass}>{t("guide.faq.groups.project.a3Roadmap")}</Link>
              {t("guide.faq.groups.project.a3After")}
            </>
          ),
        },
      ],
    },
  ];
}

export default function Faq() {
  const { t } = useI18n();
  const faqGroups = buildFaqGroups(t);
  const questionCount = faqGroups.reduce((total, group) => total + group.items.length, 0);
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <KnowledgeHeader active="faq" />

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <section className="max-w-[860px]">
          <div className="inline-flex items-center gap-2 border border-[#fa6c34]/40 bg-[#fa6c34]/8 px-3 py-2 font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
            <CircleHelp size={13} /> {t("guide.faq.badge", { count: questionCount })}
          </div>
          <h1 className="mt-6 text-[46px] font-medium leading-[0.96] tracking-[-0.05em] text-[#f0e8da] sm:text-[68px]">
            {t("guide.faq.titleLead")}<br /><span className="text-[#bdb3a6]">{t("guide.faq.titleAccent")}</span>
          </h1>
          <p className="mt-6 max-w-[720px] text-[15px] leading-relaxed text-[#9a938a]">
            {t("guide.faq.intro")}
          </p>
        </section>

        <section className="mt-9 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-3" aria-label={t("guide.faq.factsAria")}>
          {FACTS.map(({ icon: FactIcon, labelKey, copyKey }) => (
            <article key={labelKey} className="bg-[#222222] p-5 sm:p-6"><FactIcon size={16} className="text-[#fa6c34]" /><p className="mt-4 font-mono-d text-[9px] tracking-[0.13em] text-[#ded5c8]">{t(labelKey)}</p><p className="mt-2 text-[10.5px] leading-relaxed text-[#8f8880]">{t(copyKey)}</p></article>
          ))}
        </section>

        <nav className="mt-6 flex gap-2 overflow-x-auto pb-2" aria-label={t("guide.faq.categoriesAria")}>
          {faqGroups.map((group) => (
            <a key={group.id} href={`#${group.id}`} className="shrink-0 border border-[#45413e] bg-[#222222] px-3 py-2 font-mono-d text-[8px] tracking-[0.12em] text-[#9a938a] hover:border-[#fa6c34] hover:text-[#f0e8da]">{group.title.toUpperCase()}</a>
          ))}
        </nav>

        <div className="mt-12 space-y-16">
          {faqGroups.map((group) => (
            <section id={group.id} key={group.id} className="scroll-mt-24">
              <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{String(faqGroups.indexOf(group) + 1).padStart(2, "0")}</p>
              <div className="mt-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <h2 className="text-[29px] font-medium tracking-[-0.035em] text-[#f0e8da] sm:text-[36px]">{group.title}</h2>
                <p className="max-w-[430px] text-[11.5px] leading-relaxed text-[#716b65]">{group.intro}</p>
              </div>
              <div className="mt-5 border border-[#383838]">
                {group.items.map((item, index) => (
                  <details key={`${group.id}-${index}`} className="group border-b border-[#383838] bg-[#222222] last:border-b-0 open:bg-[#252321]">
                    <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 text-left outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#fa6c34] sm:px-6">
                      <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-[#ded5c8] sm:text-[15px]">{item.question}</span>
                      <ChevronDown size={15} className="shrink-0 text-[#fa6c34] transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-[#383838] px-5 pb-6 pt-5 sm:px-6">
                      <div className="max-w-[820px] text-[12.5px] leading-[1.8] text-[#aaa197]">{item.answer}</div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2">
          <div className="bg-[#242424] p-6 sm:p-8">
            <Bookend label={t("guide.faq.bookend.implementation")} />
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">{t("guide.faq.deeper.title")}</h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[#9a938a]">{t("guide.faq.deeper.copy")}</p>
            <Link to="/docs" className="mt-5 inline-flex items-center gap-2 font-mono-d text-[9px] tracking-[0.11em] text-[#fa6c34]">{t("guide.faq.deeper.action")} <ArrowRight size={12} /></Link>
          </div>
          <div className="bg-[#242424] p-6 sm:p-8">
            <Bookend label={t("guide.faq.bookend.code")} />
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">{t("guide.faq.source.title")}</h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[#9a938a]">{t("guide.faq.source.copy")}</p>
            <a href="https://github.com/ChainScoutAi/chainscout-source" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 font-mono-d text-[9px] tracking-[0.11em] text-[#fa6c34]">{t("guide.faq.source.action")} <Github size={12} /><ExternalLink size={10} /></a>
          </div>
        </section>

        <div className="mt-5 flex items-start gap-3 border border-[#6b4a3b] bg-[#2a211e] p-5">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-[#fa6c34]" />
          <p className="text-[11.5px] leading-relaxed text-[#b7aea2]"><strong className="text-[#e9e0d1]">{t("guide.faq.tokenReminder.label")}</strong> {t("guide.faq.tokenReminder.copy")}</p>
        </div>
      </main>
    </div>
  );
}

function Bookend({ label }: { label: string }) {
  return <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.14em] text-[#635d5a]"><Check size={11} className="text-[#7fb069]" />{label}</p>;
}
