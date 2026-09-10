import { useState } from "react";
import { ArrowRight, Boxes, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { useI18n } from "../i18n";

const CATEGORIES = [
  "landing.hero.category.crypto",
  "landing.hero.category.nfts",
  "landing.hero.category.tokenized",
  "landing.hero.category.pokemon",
  "landing.hero.category.collectibles",
  "landing.hero.category.manual",
] as const;

const LAYERS = [
  {
    n: "01",
    titleKey: "landing.hero.layer1.title",
    icon: Boxes,
    itemKeys: [
      "landing.hero.layer1.item1",
      "landing.hero.layer1.item2",
      "landing.hero.layer1.item3",
    ],
  },
  {
    n: "02",
    titleKey: "landing.hero.layer2.title",
    icon: Search,
    itemKeys: [
      "landing.hero.layer2.item1",
      "landing.hero.layer2.item2",
      "landing.hero.layer2.item3",
    ],
  },
  {
    n: "03",
    titleKey: "landing.hero.layer3.title",
    icon: LockKeyhole,
    itemKeys: [
      "landing.hero.layer3.item1",
      "landing.hero.layer3.item2",
      "landing.hero.layer3.item3",
    ],
  },
  {
    n: "04",
    titleKey: "landing.hero.layer4.title",
    icon: ShieldCheck,
    itemKeys: [
      "landing.hero.layer4.item1",
      "landing.hero.layer4.item2",
      "landing.hero.layer4.item3",
    ],
  },
] as const;

function AssetDiagram() {
  const { t } = useI18n();
  const label = (x1: number, y1: number, x2: number, text: string, side: "left" | "right" = "right") => (
    <g stroke="#d8cec5" strokeWidth="1" opacity="0.92">
      <line x1={x1} y1={y1} x2={x2} y2={y1} />
      <circle cx={x1} cy={y1} r="2.7" fill="#fa6c34" stroke="none" />
      <circle cx={x2} cy={y1} r="2.4" fill="#d8cec5" stroke="none" />
      <text
        x={side === "right" ? x2 + 9 : x2 - 9}
        y={y1 + 4}
        fill="#d8cec5"
        stroke="none"
        textAnchor={side === "right" ? "start" : "end"}
        fontSize="10"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        letterSpacing="1.2"
      >
        {text}
      </text>
    </g>
  );

  return (
    <svg viewBox="0 0 620 720" className="h-full w-full" fill="none" role="img" aria-label={t("landing.hero.diagram.label")}>
      <line x1="310" y1="25" x2="310" y2="688" stroke="#665f59" strokeWidth="1" strokeDasharray="2 6" />
      <circle className="hero-geo-node" cx="310" cy="28" r="4" fill="#fa6c34" />

      <g data-hero-shape className="hero-geo-layer hero-geo-layer-a">
        <path d="M310 62 430 132 310 202 190 132Z" fill="#fa6c34" fillOpacity="0.08" stroke="#f0e8df" strokeWidth="1.2" />
        <path d="M190 132 310 202 430 132M310 62V202" stroke="#8f8780" strokeWidth="1" opacity="0.7" />
        <path d="M228 132 310 84 392 132 310 180Z" stroke="#fa6c34" strokeWidth="1" opacity="0.7" />
        {label(430, 132, 492, t("landing.hero.diagram.crypto"))}
      </g>

      <g data-hero-shape className="hero-geo-layer hero-geo-layer-b">
        <path d="M310 216 488 320 310 424 132 320Z" stroke="#8f8780" strokeWidth="1" opacity="0.55" />
        <circle cx="310" cy="320" r="104" fill="#201f1e" fillOpacity="0.72" stroke="#f0e8df" strokeWidth="1.2" />
        <ellipse className="hero-geo-orbit" cx="310" cy="320" rx="104" ry="34" stroke="#fa6c34" strokeWidth="1.2" opacity="0.78" />
        <ellipse cx="310" cy="320" rx="34" ry="104" stroke="#706860" strokeWidth="1" opacity="0.72" />
        <circle cx="310" cy="320" r="18" fill="#fa6c34" fillOpacity="0.12" stroke="#fa6c34" />
        {label(206, 320, 112, t("landing.hero.diagram.nfts"), "left")}
      </g>

      <g data-hero-shape className="hero-geo-layer hero-geo-layer-c">
        <path d="M216 460 310 404 404 460 404 544 310 600 216 544Z" fill="#fa6c34" fillOpacity="0.08" stroke="#f0e8df" strokeWidth="1.2" />
        <path d="M216 460 310 516 404 460M310 516V600" stroke="#8f8780" strokeWidth="1" />
        <ellipse cx="310" cy="458" rx="28" ry="11" stroke="#fa6c34" strokeWidth="1.2" />
        <path d="M282 458V480C282 486 295 491 310 491S338 486 338 480V458" stroke="#fa6c34" opacity="0.72" />
        {label(404, 460, 492, t("landing.hero.diagram.tokenized"))}
      </g>

      <g data-hero-shape className="hero-geo-layer hero-geo-layer-d">
        <path d="M218 628 310 576 402 628 310 680Z" fill="#252321" stroke="#f0e8df" strokeWidth="1.2" />
        <path d="M246 643 310 607 374 643 310 679Z" stroke="#fa6c34" strokeWidth="1" opacity="0.82" />
        <path d="M192 660 310 594 428 660" stroke="#706860" strokeWidth="1" opacity="0.72" />
        {label(218, 628, 112, t("landing.hero.diagram.pokemonCards"), "left")}
        {label(402, 628, 492, t("landing.hero.diagram.collectibles"))}
      </g>

      <g className="font-mono-d">
        <rect x="248" y="337" width="124" height="34" rx="17" fill="#181716" stroke="#4a443f" />
        <text x="310" y="358" textAnchor="middle" fill="#f0e8df" fontSize="9" letterSpacing="1.3">{t("landing.hero.diagram.oneLocalView")}</text>
      </g>
    </svg>
  );
}

export default function Hero() {
  const { t } = useI18n();
  const [open, setOpen] = useState(0);

  return (
    <section id="hero" className="grid grid-cols-1 overflow-hidden border-b border-[#34312f] xl:grid-cols-[0.96fr_1.04fr]">
      <div className="relative border-r border-[#34312f] px-6 pb-14 pt-20 sm:px-8 md:px-12 md:pt-24 xl:px-16">
        <div data-hero-reveal className="relative mb-9 flex max-w-[680px] items-center gap-3 border-y border-[#34312f] py-3">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
          <span className="font-mono-d text-[9px] tracking-[0.14em] text-[#b7aea2] sm:text-[10px]">{t("landing.hero.badge")}</span>
          <span className="hatch h-3 flex-1 opacity-45" />
        </div>

        <h1 className="relative max-w-[720px] overflow-hidden text-[43px] font-medium leading-[1.02] tracking-[-0.045em] sm:text-[54px] md:text-[60px] xl:text-[56px] 2xl:text-[64px]">
          <span data-hero-line className="block text-[#f4ece4]">{t("landing.hero.headline1")}</span>
          <span data-hero-line className="block text-[#d8cec5]">{t("landing.hero.headline2")}</span>
          <span data-hero-line className="block text-[#fa6c34]">{t("landing.hero.headline3")}</span>
        </h1>

        <p data-hero-reveal className="relative mt-7 max-w-[610px] text-[15px] leading-[1.75] text-[#aaa19a]">
          {t("landing.hero.intro")}
        </p>

        <div data-hero-reveal className="relative mt-7 flex max-w-[680px] flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <span key={category} className="border border-[#fa6c34]/25 bg-[#fa6c34]/[0.05] px-3 py-2 font-mono-d text-[8px] tracking-[0.1em] text-[#d8cec5]">
              {t(category)}
            </span>
          ))}
        </div>

        <div data-hero-reveal className="relative mt-8 grid max-w-[650px] gap-3 sm:grid-cols-2">
          <Link to="/vault?view=assets" className="clip-btn flex min-h-[58px] items-center justify-center gap-3 bg-[#fa6c34] px-5 font-mono-d text-[10px] font-semibold tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7d48]">
            <LockKeyhole size={15} /> {t("landing.hero.openVault")}
          </Link>
          <Link to="/app" className="clip-btn flex min-h-[58px] items-center justify-center gap-3 border border-[#514a45] px-5 font-mono-d text-[10px] font-medium tracking-wide text-[#f0e8df] transition-colors hover:border-[#fa6c34] hover:bg-[#fa6c34]/5">
            {t("landing.hero.tryExplorer")} <ArrowRight size={14} />
          </Link>
        </div>

        <p data-hero-reveal className="relative mt-4 max-w-[650px] text-[12px] leading-relaxed text-[#aaa19a]">
          {t("landing.hero.noWallet")}
        </p>
        {import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED === "true" && <Link data-hero-reveal to="/card-prices" className="relative mt-5 flex min-h-[52px] max-w-[650px] items-center justify-between gap-3 border border-[#fa6c34]/50 bg-[#28221e] px-4 py-3 text-[13px] text-[#e9e0d1] transition-colors hover:border-[#fa6c34]">
          <span><span className="mr-2 font-mono-d text-[10px] text-[#fa6c34]">{t("cards.new")}</span> {t("cards.heroLink")}</span><ArrowRight size={16} className="shrink-0 text-[#fa6c34]" />
        </Link>}

        <div data-hero-reveal className="relative mt-10 max-w-[650px]">
          {LAYERS.map((layer, index) => (
            <div key={layer.n} className="border-t border-[#34312f] last:border-b">
              <button
                type="button"
                aria-expanded={open === index}
                aria-controls={`hero-workflow-${index}`}
                onClick={() => setOpen(open === index ? -1 : index)}
                className="flex min-h-[58px] w-full items-center gap-4 py-4 text-left"
              >
                <span className="font-mono-d text-[9px] text-[#9a938a]">{layer.n}</span>
                <layer.icon size={14} className="text-[#fa6c34]" />
                <span className="flex-1 text-[14px] text-[#e9e0d8]">{t(layer.titleKey)}</span>
                <span aria-hidden="true" className={`text-[15px] text-[#9a938a] transition-transform ${open === index ? "rotate-45" : ""}`}>+</span>
              </button>
              {open === index && (
                <ul id={`hero-workflow-${index}`} className="pb-5 pl-[72px] pr-4">
                  {layer.itemKeys.map((itemKey) => (
                    <li key={itemKey} className="flex items-start gap-3 py-1.5 text-[12px] leading-relaxed text-[#9a938a]">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#fa6c34]" />
                      {t(itemKey)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <div data-hero-art className="dots relative hidden items-start justify-center overflow-hidden bg-[#181716] px-8 xl:flex">
        <div className="sticky top-[60px] flex h-[calc(100vh-60px)] min-h-[660px] max-h-[820px] w-full items-center justify-center">
          <div className="pointer-events-none absolute left-0 top-8 font-mono-d text-[8px] tracking-[0.16em] text-[#9a938a]">{t("landing.hero.illustrative")}</div>
          <div className="pointer-events-none absolute bottom-8 right-0 font-mono-d text-[8px] tracking-[0.16em] text-[#fa6c34]">{t("landing.hero.privateContext")}</div>
          <div className="relative h-full max-h-[740px] w-full max-w-[640px]">
            <AssetDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
