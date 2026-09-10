import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Blocks,
  Bot,
  Check,
  CircleDollarSign,
  Code2,
  Copy,
  EyeOff,
  KeyRound,
  Landmark,
  LockKeyhole,
  Menu,
  PackageSearch,
  Repeat2,
  ScanSearch,
  ShieldCheck,
  ShoppingCart,
  Store,
  Trash2,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";

type Release = {
  id: string;
  number: string;
  branch: string;
  titleKey: TranslationKey;
  eyebrowKey: TranslationKey;
  summaryKey: TranslationKey;
  outcomeKey: TranslationKey;
  icon: LucideIcon;
  capabilities: Array<{
    kickerKey: TranslationKey;
    titleKey: TranslationKey;
    signalKey: TranslationKey;
    bars: number[];
  }>;
  gateKey: TranslationKey;
  snapshot: string;
};

type HorizonIdea = {
  code: string;
  eyebrowKey: TranslationKey;
  titleKey: TranslationKey;
  summaryKey: TranslationKey;
  outcomeKey: TranslationKey;
  icon: LucideIcon;
  featureKeys: TranslationKey[];
  signalKeys: TranslationKey[];
  boundaryKey: TranslationKey;
};

const RELEASES: Release[] = [
  {
    id: "scout-swap",
    number: "01",
    branch: "release/01-scout-swap",
    titleKey: "roadmap.release.scout-swap.title",
    eyebrowKey: "roadmap.release.scout-swap.eyebrow",
    summaryKey: "roadmap.release.scout-swap.summary",
    outcomeKey: "roadmap.release.scout-swap.outcome",
    icon: Repeat2,
    capabilities: [
      { kickerKey: "roadmap.release.scout-swap.cap1.kicker", titleKey: "roadmap.release.scout-swap.cap1.title", signalKey: "roadmap.release.scout-swap.cap1.signal", bars: [32, 48, 40, 66, 58, 88] },
      { kickerKey: "roadmap.release.scout-swap.cap2.kicker", titleKey: "roadmap.release.scout-swap.cap2.title", signalKey: "roadmap.release.scout-swap.cap2.signal", bars: [72, 62, 52, 44, 36, 28] },
      { kickerKey: "roadmap.release.scout-swap.cap3.kicker", titleKey: "roadmap.release.scout-swap.cap3.title", signalKey: "roadmap.release.scout-swap.cap3.signal", bars: [24, 31, 46, 55, 74, 92] },
    ],
    gateKey: "roadmap.release.scout-swap.gate",
    snapshot: "scout-swap-rc1",
  },
  {
    id: "privacy-foundation",
    number: "02",
    branch: "release/02-privacy-foundation",
    titleKey: "roadmap.release.privacy-foundation.title",
    eyebrowKey: "roadmap.release.privacy-foundation.eyebrow",
    summaryKey: "roadmap.release.privacy-foundation.summary",
    outcomeKey: "roadmap.release.privacy-foundation.outcome",
    icon: ShieldCheck,
    capabilities: [
      { kickerKey: "roadmap.release.privacy-foundation.cap1.kicker", titleKey: "roadmap.release.privacy-foundation.cap1.title", signalKey: "roadmap.release.privacy-foundation.cap1.signal", bars: [80, 56, 72, 44, 62, 36] },
      { kickerKey: "roadmap.release.privacy-foundation.cap2.kicker", titleKey: "roadmap.release.privacy-foundation.cap2.title", signalKey: "roadmap.release.privacy-foundation.cap2.signal", bars: [30, 38, 52, 66, 76, 88] },
      { kickerKey: "roadmap.release.privacy-foundation.cap3.kicker", titleKey: "roadmap.release.privacy-foundation.cap3.title", signalKey: "roadmap.release.privacy-foundation.cap3.signal", bars: [88, 74, 64, 52, 46, 34] },
    ],
    gateKey: "roadmap.release.privacy-foundation.gate",
    snapshot: "privacy-foundation-rc1",
  },
  {
    id: "encrypted-vault",
    number: "03",
    branch: "release/03-encrypted-vault",
    titleKey: "roadmap.release.encrypted-vault.title",
    eyebrowKey: "roadmap.release.encrypted-vault.eyebrow",
    summaryKey: "roadmap.release.encrypted-vault.summary",
    outcomeKey: "roadmap.release.encrypted-vault.outcome",
    icon: LockKeyhole,
    capabilities: [
      { kickerKey: "roadmap.release.encrypted-vault.cap1.kicker", titleKey: "roadmap.release.encrypted-vault.cap1.title", signalKey: "roadmap.release.encrypted-vault.cap1.signal", bars: [42, 74, 58, 86, 64, 78] },
      { kickerKey: "roadmap.release.encrypted-vault.cap2.kicker", titleKey: "roadmap.release.encrypted-vault.cap2.title", signalKey: "roadmap.release.encrypted-vault.cap2.signal", bars: [82, 70, 62, 54, 48, 40] },
      { kickerKey: "roadmap.release.encrypted-vault.cap3.kicker", titleKey: "roadmap.release.encrypted-vault.cap3.title", signalKey: "roadmap.release.encrypted-vault.cap3.signal", bars: [34, 46, 38, 62, 72, 92] },
    ],
    gateKey: "roadmap.release.encrypted-vault.gate",
    snapshot: "encrypted-vault-rc1",
  },
  {
    id: "portfolio-intelligence",
    number: "04",
    branch: "release/04-portfolio-intelligence",
    titleKey: "roadmap.release.portfolio-intelligence.title",
    eyebrowKey: "roadmap.release.portfolio-intelligence.eyebrow",
    summaryKey: "roadmap.release.portfolio-intelligence.summary",
    outcomeKey: "roadmap.release.portfolio-intelligence.outcome",
    icon: WalletCards,
    capabilities: [
      { kickerKey: "roadmap.release.portfolio-intelligence.cap1.kicker", titleKey: "roadmap.release.portfolio-intelligence.cap1.title", signalKey: "roadmap.release.portfolio-intelligence.cap1.signal", bars: [30, 34, 46, 58, 76, 92] },
      { kickerKey: "roadmap.release.portfolio-intelligence.cap2.kicker", titleKey: "roadmap.release.portfolio-intelligence.cap2.title", signalKey: "roadmap.release.portfolio-intelligence.cap2.signal", bars: [64, 70, 66, 76, 72, 84] },
      { kickerKey: "roadmap.release.portfolio-intelligence.cap3.kicker", titleKey: "roadmap.release.portfolio-intelligence.cap3.title", signalKey: "roadmap.release.portfolio-intelligence.cap3.signal", bars: [26, 52, 38, 70, 48, 86] },
    ],
    gateKey: "roadmap.release.portfolio-intelligence.gate",
    snapshot: "portfolio-intelligence-rc1",
  },
  {
    id: "rwa-phygital-verify",
    number: "05",
    branch: "release/05-rwa-phygital-verify",
    titleKey: "roadmap.release.rwa-phygital-verify.title",
    eyebrowKey: "roadmap.release.rwa-phygital-verify.eyebrow",
    summaryKey: "roadmap.release.rwa-phygital-verify.summary",
    outcomeKey: "roadmap.release.rwa-phygital-verify.outcome",
    icon: Landmark,
    capabilities: [
      { kickerKey: "roadmap.release.rwa-phygital-verify.cap1.kicker", titleKey: "roadmap.release.rwa-phygital-verify.cap1.title", signalKey: "roadmap.release.rwa-phygital-verify.cap1.signal", bars: [28, 42, 54, 66, 78, 90] },
      { kickerKey: "roadmap.release.rwa-phygital-verify.cap2.kicker", titleKey: "roadmap.release.rwa-phygital-verify.cap2.title", signalKey: "roadmap.release.rwa-phygital-verify.cap2.signal", bars: [84, 74, 64, 56, 48, 42] },
      { kickerKey: "roadmap.release.rwa-phygital-verify.cap3.kicker", titleKey: "roadmap.release.rwa-phygital-verify.cap3.title", signalKey: "roadmap.release.rwa-phygital-verify.cap3.signal", bars: [40, 52, 46, 68, 58, 88] },
    ],
    gateKey: "roadmap.release.rwa-phygital-verify.gate",
    snapshot: "rwa-phygital-rc1",
  },
  {
    id: "collectible-catalog",
    number: "06",
    branch: "release/06-collectible-catalog",
    titleKey: "roadmap.release.collectible-catalog.title",
    eyebrowKey: "roadmap.release.collectible-catalog.eyebrow",
    summaryKey: "roadmap.release.collectible-catalog.summary",
    outcomeKey: "roadmap.release.collectible-catalog.outcome",
    icon: ScanSearch,
    capabilities: [
      { kickerKey: "roadmap.release.collectible-catalog.cap1.kicker", titleKey: "roadmap.release.collectible-catalog.cap1.title", signalKey: "roadmap.release.collectible-catalog.cap1.signal", bars: [32, 48, 64, 58, 76, 92] },
      { kickerKey: "roadmap.release.collectible-catalog.cap2.kicker", titleKey: "roadmap.release.collectible-catalog.cap2.title", signalKey: "roadmap.release.collectible-catalog.cap2.signal", bars: [88, 72, 62, 54, 42, 34] },
      { kickerKey: "roadmap.release.collectible-catalog.cap3.kicker", titleKey: "roadmap.release.collectible-catalog.cap3.title", signalKey: "roadmap.release.collectible-catalog.cap3.signal", bars: [24, 36, 50, 64, 78, 94] },
    ],
    gateKey: "roadmap.release.collectible-catalog.gate",
    snapshot: "collectible-catalog-rc1",
  },
  {
    id: "market-inventory",
    number: "07",
    branch: "release/07-market-inventory",
    titleKey: "roadmap.release.market-inventory.title",
    eyebrowKey: "roadmap.release.market-inventory.eyebrow",
    summaryKey: "roadmap.release.market-inventory.summary",
    outcomeKey: "roadmap.release.market-inventory.outcome",
    icon: PackageSearch,
    capabilities: [
      { kickerKey: "roadmap.release.market-inventory.cap1.kicker", titleKey: "roadmap.release.market-inventory.cap1.title", signalKey: "roadmap.release.market-inventory.cap1.signal", bars: [31, 54, 43, 68, 61, 91] },
      { kickerKey: "roadmap.release.market-inventory.cap2.kicker", titleKey: "roadmap.release.market-inventory.cap2.title", signalKey: "roadmap.release.market-inventory.cap2.signal", bars: [76, 61, 70, 53, 44, 32] },
      { kickerKey: "roadmap.release.market-inventory.cap3.kicker", titleKey: "roadmap.release.market-inventory.cap3.title", signalKey: "roadmap.release.market-inventory.cap3.signal", bars: [28, 43, 57, 63, 81, 94] },
    ],
    gateKey: "roadmap.release.market-inventory.gate",
    snapshot: "market-inventory-rc1",
  },
  {
    id: "replay-actions",
    number: "08",
    branch: "release/08-replay-actions",
    titleKey: "roadmap.release.replay-actions.title",
    eyebrowKey: "roadmap.release.replay-actions.eyebrow",
    summaryKey: "roadmap.release.replay-actions.summary",
    outcomeKey: "roadmap.release.replay-actions.outcome",
    icon: Copy,
    capabilities: [
      { kickerKey: "roadmap.release.replay-actions.cap1.kicker", titleKey: "roadmap.release.replay-actions.cap1.title", signalKey: "roadmap.release.replay-actions.cap1.signal", bars: [36, 51, 62, 55, 73, 90] },
      { kickerKey: "roadmap.release.replay-actions.cap2.kicker", titleKey: "roadmap.release.replay-actions.cap2.title", signalKey: "roadmap.release.replay-actions.cap2.signal", bars: [87, 74, 63, 50, 41, 33] },
      { kickerKey: "roadmap.release.replay-actions.cap3.kicker", titleKey: "roadmap.release.replay-actions.cap3.title", signalKey: "roadmap.release.replay-actions.cap3.signal", bars: [23, 38, 49, 66, 80, 95] },
    ],
    gateKey: "roadmap.release.replay-actions.gate",
    snapshot: "replay-actions-rc1",
  },
  {
    id: "open-data-api",
    number: "09",
    branch: "release/09-open-data-api",
    titleKey: "roadmap.release.open-data-api.title",
    eyebrowKey: "roadmap.release.open-data-api.eyebrow",
    summaryKey: "roadmap.release.open-data-api.summary",
    outcomeKey: "roadmap.release.open-data-api.outcome",
    icon: Code2,
    capabilities: [
      { kickerKey: "roadmap.release.open-data-api.cap1.kicker", titleKey: "roadmap.release.open-data-api.cap1.title", signalKey: "roadmap.release.open-data-api.cap1.signal", bars: [29, 45, 60, 55, 77, 91] },
      { kickerKey: "roadmap.release.open-data-api.cap2.kicker", titleKey: "roadmap.release.open-data-api.cap2.title", signalKey: "roadmap.release.open-data-api.cap2.signal", bars: [84, 70, 58, 49, 42, 35] },
      { kickerKey: "roadmap.release.open-data-api.cap3.kicker", titleKey: "roadmap.release.open-data-api.cap3.title", signalKey: "roadmap.release.open-data-api.cap3.signal", bars: [27, 41, 52, 68, 82, 96] },
    ],
    gateKey: "roadmap.release.open-data-api.gate",
    snapshot: "open-data-api-rc1",
  },
  {
    id: "launch-hardening",
    number: "10",
    branch: "release/10-launch-hardening",
    titleKey: "roadmap.release.launch-hardening.title",
    eyebrowKey: "roadmap.release.launch-hardening.eyebrow",
    summaryKey: "roadmap.release.launch-hardening.summary",
    outcomeKey: "roadmap.release.launch-hardening.outcome",
    icon: BadgeCheck,
    capabilities: [
      { kickerKey: "roadmap.release.launch-hardening.cap1.kicker", titleKey: "roadmap.release.launch-hardening.cap1.title", signalKey: "roadmap.release.launch-hardening.cap1.signal", bars: [34, 48, 57, 69, 83, 97] },
      { kickerKey: "roadmap.release.launch-hardening.cap2.kicker", titleKey: "roadmap.release.launch-hardening.cap2.title", signalKey: "roadmap.release.launch-hardening.cap2.signal", bars: [90, 77, 66, 53, 44, 31] },
      { kickerKey: "roadmap.release.launch-hardening.cap3.kicker", titleKey: "roadmap.release.launch-hardening.cap3.title", signalKey: "roadmap.release.launch-hardening.cap3.signal", bars: [25, 39, 51, 65, 79, 96] },
    ],
    gateKey: "roadmap.release.launch-hardening.gate",
    snapshot: "launch-hardening-rc1",
  },
];

const RELEASE_LOOP = [
  { labelKey: "roadmap.loop.build.label", noteKey: "roadmap.loop.build.note", icon: Blocks },
  { labelKey: "roadmap.loop.deploy.label", noteKey: "roadmap.loop.deploy.note", icon: Zap },
  { labelKey: "roadmap.loop.test.label", noteKey: "roadmap.loop.test.note", icon: Bot },
  { labelKey: "roadmap.loop.freeze.label", noteKey: "roadmap.loop.freeze.note", icon: ShieldCheck },
  { labelKey: "roadmap.loop.release.label", noteKey: "roadmap.loop.release.note", icon: Check },
] satisfies Array<{ labelKey: TranslationKey; noteKey: TranslationKey; icon: LucideIcon }>;

const HORIZON_IDEAS: HorizonIdea[] = [
  {
    code: "API",
    eyebrowKey: "roadmap.horizon.api.eyebrow",
    titleKey: "roadmap.horizon.api.title",
    summaryKey: "roadmap.horizon.api.summary",
    outcomeKey: "roadmap.horizon.api.outcome",
    icon: Code2,
    featureKeys: [
      "roadmap.horizon.api.feature1",
      "roadmap.horizon.api.feature2",
      "roadmap.horizon.api.feature3",
    ],
    signalKeys: [
      "roadmap.horizon.api.signal1",
      "roadmap.horizon.api.signal2",
      "roadmap.horizon.api.signal3",
    ],
    boundaryKey: "roadmap.horizon.api.boundary",
  },
  {
    code: "FIND",
    eyebrowKey: "roadmap.horizon.find.eyebrow",
    titleKey: "roadmap.horizon.find.title",
    summaryKey: "roadmap.horizon.find.summary",
    outcomeKey: "roadmap.horizon.find.outcome",
    icon: PackageSearch,
    featureKeys: [
      "roadmap.horizon.find.feature1",
      "roadmap.horizon.find.feature2",
      "roadmap.horizon.find.feature3",
    ],
    signalKeys: [
      "roadmap.horizon.find.signal1",
      "roadmap.horizon.find.signal2",
      "roadmap.horizon.find.signal3",
    ],
    boundaryKey: "roadmap.horizon.find.boundary",
  },
  {
    code: "BUY",
    eyebrowKey: "roadmap.horizon.buy.eyebrow",
    titleKey: "roadmap.horizon.buy.title",
    summaryKey: "roadmap.horizon.buy.summary",
    outcomeKey: "roadmap.horizon.buy.outcome",
    icon: ShoppingCart,
    featureKeys: [
      "roadmap.horizon.buy.feature1",
      "roadmap.horizon.buy.feature2",
      "roadmap.horizon.buy.feature3",
    ],
    signalKeys: [
      "roadmap.horizon.buy.signal1",
      "roadmap.horizon.buy.signal2",
      "roadmap.horizon.buy.signal3",
    ],
    boundaryKey: "roadmap.horizon.buy.boundary",
  },
  {
    code: "TRUST",
    eyebrowKey: "roadmap.horizon.trust.eyebrow",
    titleKey: "roadmap.horizon.trust.title",
    summaryKey: "roadmap.horizon.trust.summary",
    outcomeKey: "roadmap.horizon.trust.outcome",
    icon: BadgeCheck,
    featureKeys: [
      "roadmap.horizon.trust.feature1",
      "roadmap.horizon.trust.feature2",
      "roadmap.horizon.trust.feature3",
    ],
    signalKeys: [
      "roadmap.horizon.trust.signal1",
      "roadmap.horizon.trust.signal2",
      "roadmap.horizon.trust.signal3",
    ],
    boundaryKey: "roadmap.horizon.trust.boundary",
  },
];

const COMMERCE_FLOW = [
  { labelKey: "roadmap.commerce.identify.label", noteKey: "roadmap.commerce.identify.note", icon: ScanSearch },
  { labelKey: "roadmap.commerce.find.label", noteKey: "roadmap.commerce.find.note", icon: Store },
  { labelKey: "roadmap.commerce.compare.label", noteKey: "roadmap.commerce.compare.note", icon: CircleDollarSign },
  { labelKey: "roadmap.commerce.verify.label", noteKey: "roadmap.commerce.verify.note", icon: ShieldCheck },
  { labelKey: "roadmap.commerce.continue.label", noteKey: "roadmap.commerce.continue.note", icon: ArrowRight },
] satisfies Array<{ labelKey: TranslationKey; noteKey: TranslationKey; icon: LucideIcon }>;

const PRIVACY_PROMISES = [
  {
    number: "01",
    titleKey: "roadmap.privacy.promises.encryptedVault.title",
    bodyKey: "roadmap.privacy.promises.encryptedVault.body",
    icon: LockKeyhole,
  },
  {
    number: "02",
    titleKey: "roadmap.privacy.promises.clearPermission.title",
    bodyKey: "roadmap.privacy.promises.clearPermission.body",
    icon: KeyRound,
  },
  {
    number: "03",
    titleKey: "roadmap.privacy.promises.minimalFootprint.title",
    bodyKey: "roadmap.privacy.promises.minimalFootprint.body",
    icon: EyeOff,
  },
  {
    number: "04",
    titleKey: "roadmap.privacy.promises.deleteAnytime.title",
    bodyKey: "roadmap.privacy.promises.deleteAnytime.body",
    icon: Trash2,
  },
] satisfies Array<{ number: string; titleKey: TranslationKey; bodyKey: TranslationKey; icon: LucideIcon }>;

function RoadmapSidebar({ active }: { active: string }) {
  const { t } = useI18n();
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[220px] flex-col border-r border-[#2e2e2e] bg-[#1d1d1d] lg:flex">
      <Link
        to="/"
        className="relative block h-[74px] shrink-0 bg-[#fa6c34]"
        style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)" }}
        aria-label={t("roadmap.sidebar.homeLabel")}
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <img src="/logo.svg" alt="" className="h-8 w-8" />
        </span>
      </Link>

      <div className="border-b border-[#2e2e2e] px-6 py-7">
        <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#635d5a]">{t("roadmap.sidebar.productPath")}</p>
        <p className="mt-2 text-[15px] text-[#d6ccba]">{t("roadmap.sidebar.releaseRoadmap")}</p>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto py-2">
        {RELEASES.map((release) => {
          const isActive = active === release.id;
          return (
            <a
              key={release.id}
              href={`#${release.id}`}
              className={`group relative flex items-center gap-3 border-t border-[#2e2e2e] px-6 py-4 font-mono-d text-[11px] transition-colors last:border-b ${
                isActive ? "bg-[#242424] text-[#e9e0d1]" : "text-[#635d5a] hover:text-[#9a938a]"
              }`}
            >
              {isActive && <span className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#fa6c34]" />}
              <span className={isActive ? "text-[#fa6c34]" : ""}>{release.number}</span>
              <span className="truncate">{t(release.outcomeKey)}</span>
            </a>
          );
        })}
      </nav>

      <div className="border-t border-[#2e2e2e] p-6">
        <div className="flex items-center gap-3">
          <span className="roadmap-live-dot h-2 w-2 rounded-full bg-[#fa6c34]" />
          <div>
            <p className="font-mono-d text-[10px] tracking-[0.14em] text-[#9a938a]">{t("roadmap.sidebar.sequential")}</p>
            <p className="mt-1 text-[11px] text-[#635d5a]">{t("roadmap.sidebar.oneAtATime")}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function RoadmapNav() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-30 flex h-[60px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/90 backdrop-blur lg:left-[220px]">
        <Link
          to="/"
          className="flex h-full w-[60px] shrink-0 items-center justify-center bg-[#fa6c34] lg:hidden"
          style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)" }}
          aria-label={t("roadmap.nav.homeLabel")}
        >
          <img src="/logo.svg" alt="" className="h-6 w-6" />
        </Link>
        <Link to="/" className="ml-6 hidden items-center gap-2 font-mono-d text-[11px] text-[#9a938a] transition-colors hover:text-[#e9e0d1] sm:flex">
          <ArrowLeft size={13} />
          {t("roadmap.nav.home")}
        </Link>
        <div className="flex-1" />
        <nav className="hidden items-center gap-8 pr-8 font-mono-d text-[11px] tracking-wide text-[#9a938a] md:flex">
          <a href="#releases" className="transition-colors hover:text-[#e9e0d1]">{t("roadmap.nav.releases")}</a>
          <a href="#horizon" className="transition-colors hover:text-[#e9e0d1]">{t("roadmap.nav.utility")}</a>
          <a href="#privacy" className="transition-colors hover:text-[#e9e0d1]">{t("roadmap.nav.privacy")}</a>
          <a href="#protocol" className="transition-colors hover:text-[#e9e0d1]">{t("roadmap.nav.protocol")}</a>
        </nav>
        <Link
          to="/app"
          className="clip-btn-sm mr-3 hidden h-full items-center bg-[#fa6c34] px-8 font-mono-d text-[11px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7038] sm:flex md:mr-0"
        >
          {t("roadmap.nav.tryExplorer")}
        </Link>
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex h-full w-[60px] items-center justify-center border-l border-[#2e2e2e] text-[#e9e0d1] md:hidden"
          aria-label={t("roadmap.nav.toggle")}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[60px] z-40 border-b border-[#2e2e2e] bg-[#1d1d1d] md:hidden">
          <a href="#releases" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            {t("roadmap.nav.releases")} <ArrowRight size={14} />
          </a>
          <a href="#horizon" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            {t("roadmap.nav.utility")} <ArrowRight size={14} />
          </a>
          <a href="#privacy" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            {t("roadmap.nav.privacy")} <ArrowRight size={14} />
          </a>
          <a href="#protocol" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            {t("roadmap.nav.releaseProtocol")} <ArrowRight size={14} />
          </a>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Link to="/" className="clip-btn-sm flex items-center justify-center border border-[#383838] py-3.5 font-mono-d text-[11px] text-[#d6ccba]">{t("roadmap.nav.home")}</Link>
            <Link to="/app" className="clip-btn-sm flex items-center justify-center bg-[#fa6c34] py-3.5 font-mono-d text-[11px] font-medium text-[#1d1d1d]">{t("roadmap.nav.tryExplorerShort")}</Link>
          </div>
        </div>
      )}
    </>
  );
}

function TrajectoryDiagram() {
  const { t } = useI18n();
  return (
    <div className="roadmap-orbit roadmap-orbit-parallax relative mx-auto aspect-square w-full max-w-[560px]" aria-hidden="true">
      <div className="absolute inset-[8%] rounded-full border border-[#383838]" />
      <div className="absolute inset-[19%] rounded-full border border-dashed border-[#383838]" />
      <div className="absolute inset-[31%] rounded-full border border-[#2e2e2e]" />
      <div className="roadmap-orbit-ring absolute inset-[8%] rounded-full">
        <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fa6c34]" />
      </div>
      <div className="roadmap-orbit-ring-reverse absolute inset-[19%] rounded-full">
        <span className="absolute bottom-[8%] left-[8%] h-1.5 w-1.5 rounded-full bg-[#d6ccba]" />
      </div>
      <svg viewBox="0 0 560 560" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M280 44V516M44 280H516" stroke="#2e2e2e" strokeWidth="1" strokeDasharray="2 7" />
        <path d="M112 448 280 112 448 448Z" stroke="#635d5a" strokeWidth="1" opacity="0.55" />
        <path d="m158 381 122-72 122 72-122 72Z" stroke="#d6ccba" strokeWidth="1" opacity="0.65" />
        <path d="m158 381 122 72 122-72v35l-122 72-122-72Z" fill="#242424" stroke="#635d5a" strokeWidth="1" />
        <path d="m196 255 84-48 84 48-84 48Z" fill="#242424" stroke="#d6ccba" strokeWidth="1" />
        <path d="M196 255v32l84 48 84-48v-32" stroke="#635d5a" strokeWidth="1" />
        <circle cx="280" cy="112" r="6" fill="#fa6c34" />
        <circle cx="158" cy="381" r="4" fill="#e9e0d1" />
        <circle cx="402" cy="381" r="4" fill="#e9e0d1" />
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[#383838] bg-[#1d1d1d] text-center">
        <CircleDollarSign size={22} strokeWidth={1.2} className="text-[#fa6c34]" />
        <span className="mt-2 font-mono-d text-[9px] tracking-[0.18em] text-[#9a938a]">{t("roadmap.trajectory.zeroSpend")}</span>
        <span className="font-mono-d text-[9px] tracking-[0.18em] text-[#9a938a]">{t("roadmap.trajectory.utilityStack")}</span>
      </div>
      {RELEASES.map((release, index) => {
        const positions = [
          "left-[48%] top-[1%]",
          "right-[16%] top-[9%]",
          "right-[2%] top-[31%]",
          "right-[2%] bottom-[31%]",
          "right-[16%] bottom-[9%]",
          "left-[48%] bottom-[1%]",
          "left-[16%] bottom-[9%]",
          "left-[2%] bottom-[31%]",
          "left-[2%] top-[31%]",
          "left-[16%] top-[9%]",
        ];
        return (
          <div
            key={release.id}
            className={`roadmap-node absolute ${positions[index]} flex h-8 w-8 items-center justify-center rounded-full border border-[#383838] bg-[#242424] font-mono-d text-[9px] text-[#d6ccba]`}
            style={{ "--node-delay": `${index * 180}ms` } as CSSProperties}
          >
            {release.number}
          </div>
        );
      })}
    </div>
  );
}

function ReleaseCard({ release, index }: { release: Release; index: number }) {
  const { t } = useI18n();
  const Icon = release.icon;
  return (
    <article
      id={release.id}
      data-roadmap-phase={release.id}
      className="roadmap-reveal roadmap-release-card scroll-mt-24 border-t border-[#2e2e2e]"
      style={{ "--reveal-delay": `${Math.min(index, 3) * 60}ms` } as CSSProperties}
    >
      <div className="grid grid-cols-1 xl:grid-cols-[170px_minmax(0,1fr)_330px]">
        <div className="roadmap-release-index relative flex min-h-[170px] flex-col justify-between overflow-hidden border-b border-[#2e2e2e] p-7 xl:border-b-0 xl:border-r">
          <div className="roadmap-card-scan absolute inset-0" />
          <div className="relative flex items-start justify-between xl:block">
            <span className="font-serif-d text-[76px] leading-none text-[#383838]">{release.number}</span>
            <Icon size={22} strokeWidth={1.25} className="mt-2 text-[#fa6c34] xl:mt-8" />
          </div>
          <p className="relative mt-8 font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">{t("roadmap.release.cumulative")}</p>
        </div>

        <div className="border-b border-[#2e2e2e] p-7 sm:p-10 xl:border-b-0 xl:border-r xl:p-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono-d text-[10px] tracking-[0.17em] text-[#fa6c34]">{t(release.eyebrowKey)}</span>
            <span className="h-px w-8 bg-[#383838]" />
            <span className="font-mono-d text-[9px] tracking-[0.12em] text-[#635d5a]">{t("roadmap.release.buildsOn", { base: index === 0 ? t("roadmap.release.core") : `R${RELEASES[index - 1].number}` })}</span>
          </div>
          <h2 className="mt-5 max-w-[680px] text-[32px] font-medium leading-[1.03] tracking-[-0.03em] text-[#e9e0d1] sm:text-[42px]">
            {t(release.titleKey)}
          </h2>
          <p className="mt-5 max-w-[620px] text-[14px] leading-7 text-[#9a938a]">{t(release.summaryKey)}</p>

          <div className="mt-9 grid gap-px overflow-hidden border border-[#2e2e2e] bg-[#2e2e2e] md:grid-cols-3">
            {release.capabilities.map((capability, capabilityIndex) => (
              <div key={capability.titleKey} className="roadmap-capability group relative min-h-[205px] overflow-hidden bg-[#1d1d1d] p-5 transition-colors hover:bg-[#242424]">
                <span className="pointer-events-none absolute -right-1 top-7 font-serif-d text-[62px] leading-none text-[#2b2b2b] transition-colors group-hover:text-[#302823]">
                  0{capabilityIndex + 1}
                </span>
                <div className="relative flex items-center justify-between">
                  <span className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">{t(capability.kickerKey)}</span>
                  <span className="roadmap-point-beacon flex h-5 w-5 items-center justify-center rounded-full border border-[#383838]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34] opacity-60 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <p className="relative mt-6 max-w-[190px] text-[13px] leading-[1.65] text-[#c1b8ab]">{t(capability.titleKey)}</p>

                <div className="relative mt-7 flex items-end justify-between gap-5 border-t border-[#2e2e2e] pt-4">
                  <div>
                    <p className="font-mono-d text-[8px] tracking-[0.13em] text-[#635d5a]">{t("roadmap.release.signal")}</p>
                    <p className="mt-1.5 font-mono-d text-[8px] tracking-[0.08em] text-[#9a938a]">{t(capability.signalKey)}</p>
                  </div>
                  <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
                    {capability.bars.map((height, barIndex) => (
                      <span
                        key={`${height}-${barIndex}`}
                        className="roadmap-microbar w-[3px] bg-[#635d5a] transition-colors group-hover:bg-[#fa6c34]"
                        style={{
                          height: `${height}%`,
                          "--bar-delay": `${capabilityIndex * 80 + barIndex * 35}ms`,
                        } as CSSProperties}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="roadmap-release-aside flex flex-col justify-between bg-[#202020] p-7 sm:p-10">
          <div>
            <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">{t("roadmap.release.outcomeLabel")}</p>
            <p className="mt-3 text-[21px] tracking-[-0.02em] text-[#d6ccba]">{t(release.outcomeKey)}</p>
            <div className="mt-7 grid grid-cols-[74px_1fr] items-center gap-5 border border-[#2e2e2e] bg-[#1d1d1d]/45 p-4">
              <div className="roadmap-readiness relative flex h-[74px] w-[74px] items-center justify-center rounded-full border border-[#383838]">
                <div className="absolute inset-[7px] rounded-full border border-dashed border-[#383838]" />
                <div className="absolute inset-[15px] rounded-full border border-[#2e2e2e]" />
                <span className="relative font-serif-d text-[19px] text-[#fa6c34]">R{release.number}</span>
              </div>
              <div>
                <p className="font-mono-d text-[8px] tracking-[0.16em] text-[#635d5a]">{t("roadmap.release.capabilityNode")}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
                  <span className="font-mono-d text-[9px] tracking-[0.1em] text-[#b1aaa0]">{t("roadmap.release.plannedSequential")}</span>
                </div>
                <div className="mt-3 flex gap-1">
                  {RELEASES.map((segmentRelease, segment) => (
                    <span key={segmentRelease.id} className={`h-[2px] flex-1 ${segment <= index ? "bg-[#fa6c34]" : "bg-[#383838]"}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="my-10 border-y border-[#2e2e2e] py-6">
            <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">{t("roadmap.release.shipGate")}</p>
            <p className="mt-3 text-[12.5px] leading-6 text-[#9a938a]">{t(release.gateKey)}</p>
            <div className="mt-5 grid grid-cols-3 gap-1.5">
              {[t("roadmap.release.check.data"), t("roadmap.release.check.ux"), t("roadmap.release.check.safety")].map((check) => (
                <span key={check} className="flex items-center justify-center gap-1.5 border border-[#383838] py-2 font-mono-d text-[7px] tracking-[0.1em] text-[#635d5a]">
                  <Check size={8} className="text-[#fa6c34]" />
                  {check}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">{t("roadmap.release.frozenAs")}</p>
              <p className="mt-2 font-mono-d text-[10px] text-[#d6ccba]">{release.snapshot}</p>
              <p className="mt-2 max-w-[210px] truncate font-mono-d text-[8px] text-[#635d5a]">{release.branch}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#383838] text-[#635d5a]">
              <Check size={15} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Roadmap() {
  const [active, setActive] = useState(RELEASES[0].id);
  const { t } = useI18n();

  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.14 },
    );
    document.querySelectorAll(".roadmap-reveal").forEach((element) => revealObserver.observe(element));

    const phaseObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const phase = visible?.target.getAttribute("data-roadmap-phase");
        if (phase) setActive(phase);
      },
      { rootMargin: "-25% 0px -48% 0px", threshold: [0.1, 0.35, 0.7] },
    );
    document.querySelectorAll("[data-roadmap-phase]").forEach((element) => phaseObserver.observe(element));

    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motionFrame = 0;
    const updateScrollMotion = () => {
      motionFrame = 0;
      if (reducedMotion.matches) return;

      root.style.setProperty("--roadmap-hero-parallax", `${Math.min(window.scrollY * 0.045, 38)}px`);

      const releases = document.getElementById("releases");
      if (releases) {
        const rect = releases.getBoundingClientRect();
        const distance = Math.max(rect.height - window.innerHeight * 0.7, 1);
        const progress = Math.max(0, Math.min(1, (window.innerHeight * 0.35 - rect.top) / distance));
        root.style.setProperty("--roadmap-stack-progress", `${progress * 100}%`);
      }

      document.querySelectorAll<HTMLElement>("[data-roadmap-phase]").forEach((card) => {
        const rect = card.getBoundingClientRect();
        const relativeCenter = (rect.top + rect.height / 2 - window.innerHeight * 0.52) / window.innerHeight;
        const clamped = Math.max(-1, Math.min(1, relativeCenter));
        const focus = Math.max(0, 1 - Math.abs(clamped) * 1.55);
        card.style.setProperty("--roadmap-card-focus", focus.toFixed(3));
        card.style.setProperty("--roadmap-card-drift", `${clamped * 9}px`);
        card.style.setProperty("--roadmap-aside-drift", `${clamped * -4}px`);
      });
    };
    const queueScrollMotion = () => {
      if (!motionFrame) motionFrame = window.requestAnimationFrame(updateScrollMotion);
    };
    updateScrollMotion();
    window.addEventListener("scroll", queueScrollMotion, { passive: true });
    window.addEventListener("resize", queueScrollMotion);

    return () => {
      revealObserver.disconnect();
      phaseObserver.disconnect();
      window.removeEventListener("scroll", queueScrollMotion);
      window.removeEventListener("resize", queueScrollMotion);
      if (motionFrame) window.cancelAnimationFrame(motionFrame);
      root.style.removeProperty("--roadmap-hero-parallax");
      root.style.removeProperty("--roadmap-stack-progress");
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#1d1d1d]">
      <RoadmapSidebar active={active} />
      <RoadmapNav />

      <main className="pt-[60px] lg:pl-[220px]">
        <section className="roadmap-hero relative grid min-h-[calc(100vh-60px)] grid-cols-1 overflow-hidden border-b border-[#2e2e2e] xl:grid-cols-[1.05fr_0.95fr]">
          <div className="relative z-10 flex flex-col justify-between border-b border-[#2e2e2e] px-7 pb-10 pt-14 sm:px-10 sm:pb-14 sm:pt-20 xl:border-b-0 xl:border-r xl:px-12 xl:pb-12 xl:pt-24">
            <div>
              <div className="roadmap-hero-in flex max-w-[620px] items-center gap-3 border-y border-[#2e2e2e] py-3">
                <span className="roadmap-live-dot h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
                <span className="font-mono-d text-[10px] tracking-[0.14em] text-[#9a938a] sm:text-[11px]">{t("roadmap.hero.badge")}</span>
                <span className="hatch h-3 flex-1 opacity-50" />
                <span className="font-mono-d text-[9px] text-[#635d5a]">{t("roadmap.hero.train")}</span>
              </div>

              <h1 className="roadmap-hero-in roadmap-delay-1 mt-10 max-w-[740px] text-[46px] font-medium leading-[0.98] tracking-[-0.045em] text-[#d6ccba] sm:text-[64px] md:text-[78px] xl:text-[82px]">
                {t("roadmap.hero.titleLine1")}
                <br />
                <span className="font-serif-d font-normal italic text-[#f0e8da]">{t("roadmap.hero.titleLine2")}</span>
              </h1>
              <p className="roadmap-hero-in roadmap-delay-2 mt-8 max-w-[560px] text-[15px] leading-7 text-[#9a938a]">
                {t("roadmap.hero.intro")}
              </p>
            </div>

            <div className="roadmap-hero-in roadmap-delay-3 mt-14 grid max-w-[650px] grid-cols-3 gap-px overflow-hidden border border-[#2e2e2e] bg-[#2e2e2e] xl:mt-10">
              {([
                { value: "$0", labelKey: "roadmap.hero.stat.vendorLabel" },
                { value: "00", labelKey: "roadmap.hero.stat.kybLabel" },
                { value: "01", labelKey: "roadmap.hero.stat.handoffLabel" },
              ] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey }>).map(({ value, labelKey }) => (
                <div key={labelKey} className="bg-[#1d1d1d] p-4 sm:p-5">
                  <p className="font-serif-d text-[34px] leading-none text-[#e9e0d1]">{value}</p>
                  <p className="mt-3 font-mono-d text-[8px] leading-4 tracking-[0.08em] text-[#635d5a] sm:text-[9px] sm:tracking-[0.1em]">{t(labelKey).toUpperCase()}</p>
                </div>
              ))}
            </div>
            <p className="roadmap-hero-in roadmap-delay-3 mt-4 max-w-[650px] font-mono-d text-[8px] leading-4 tracking-[0.06em] text-[#635d5a]">
              {t("roadmap.hero.footnote")}
            </p>
          </div>

          <div className="dots relative flex min-h-[520px] items-center justify-center overflow-hidden bg-[#1c1c1c] p-5 sm:p-10 xl:min-h-0">
            <div className="absolute left-0 right-0 top-8 flex items-center gap-3 px-8">
              <span className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">{t("roadmap.hero.trajectory")}</span>
              <span className="h-px flex-1 bg-[#2e2e2e]" />
              <span className="font-mono-d text-[9px] text-[#635d5a]">{t("roadmap.hero.trajectoryCode")}</span>
            </div>
            <TrajectoryDiagram />
            <div className="absolute bottom-7 left-8 right-8 flex items-center justify-between font-mono-d text-[9px] tracking-[0.12em] text-[#635d5a]">
              <span>{t("roadmap.hero.understand")}</span>
              <span className="mx-4 h-px flex-1 bg-[#4a4541]" />
              <span>{t("roadmap.hero.prepare")}</span>
            </div>
          </div>
        </section>

        <section id="releases" className="scroll-mt-20">
          <div className="grid border-b border-[#2e2e2e] bg-[#e9e0d1] text-[#1d1d1d] md:grid-cols-[1fr_1fr]">
            <div className="border-b border-[#1d1d1d]/15 px-7 py-10 sm:px-10 md:border-b-0 md:border-r md:px-12 md:py-14">
              <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#1d1d1d]/55">{t("roadmap.stack.eyebrow")}</p>
              <h2 className="mt-4 max-w-[580px] text-[34px] font-medium leading-[1.05] tracking-[-0.035em] sm:text-[46px]">
                {t("roadmap.stack.title")}
              </h2>
            </div>
            <div className="dots-dark flex items-end px-7 py-10 sm:px-10 md:px-12 md:py-14">
              <p className="max-w-[570px] text-[14px] leading-7 text-[#1d1d1d]/65">
                {t("roadmap.stack.body")}
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute bottom-0 left-[84px] top-0 hidden w-px bg-[#2e2e2e] xl:block" />
            <div className="roadmap-timeline-signal absolute left-[82px] top-0 hidden h-14 w-[5px] rounded-full bg-[#fa6c34] xl:block" />
            {RELEASES.map((release, index) => (
              <ReleaseCard key={release.id} release={release} index={index} />
            ))}
          </div>
        </section>

        <section id="horizon" className="scroll-mt-20 border-t border-[#2e2e2e] bg-[#171717]">
          <div className="grid border-b border-[#2e2e2e] xl:grid-cols-[0.9fr_1.1fr]">
            <div className="roadmap-reveal border-b border-[#2e2e2e] px-7 py-14 sm:px-10 md:px-12 md:py-20 xl:border-b-0 xl:border-r">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#fa6c34]" />
                <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#fa6c34]">{t("roadmap.utility.eyebrow")}</p>
              </div>
              <h2 className="mt-7 max-w-[620px] text-[42px] font-medium leading-[0.98] tracking-[-0.04em] text-[#e9e0d1] sm:text-[58px]">
                {t("roadmap.utility.titleLine1")}
                <br />
                <span className="font-serif-d font-normal italic text-[#f0e8da]">{t("roadmap.utility.titleLine2")}</span>
              </h2>
              <p className="mt-7 max-w-[550px] text-[14px] leading-7 text-[#9a938a]">
                {t("roadmap.utility.intro")}
              </p>
              <div className="mt-9 inline-flex items-center gap-3 border border-[#383838] bg-[#1d1d1d] px-4 py-3">
                <Zap size={14} className="text-[#fa6c34]" />
                <span className="font-mono-d text-[9px] tracking-[0.12em] text-[#9a938a]">{t("roadmap.utility.releaseNote")}</span>
              </div>
            </div>

            <div className="roadmap-reveal dots flex flex-col justify-center p-7 sm:p-10 md:p-12">
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">{t("roadmap.utility.flowEyebrow")}</p>
              <div className="mt-6 grid gap-px overflow-hidden border border-[#2e2e2e] bg-[#2e2e2e] sm:grid-cols-5">
                {COMMERCE_FLOW.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.labelKey} className="roadmap-commerce-step group relative min-h-[180px] bg-[#1d1d1d] p-4 transition-colors hover:bg-[#242424]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-d text-[8px] text-[#635d5a]">0{index + 1}</span>
                        <Icon size={16} strokeWidth={1.35} className="text-[#fa6c34]" />
                      </div>
                      <div className="mt-12 sm:mt-16">
                        <p className="text-[16px] text-[#d6ccba]">{t(step.labelKey)}</p>
                        <p className="mt-2 text-[10.5px] leading-5 text-[#635d5a]">{t(step.noteKey)}</p>
                      </div>
                      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#fa6c34] transition-all duration-500 group-hover:w-full" />
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 font-mono-d text-[8px] leading-5 tracking-[0.08em] text-[#635d5a]">
                {t("roadmap.utility.bestNote")}
              </p>
            </div>
          </div>

          <div className="grid gap-px bg-[#2e2e2e] lg:grid-cols-2">
            {HORIZON_IDEAS.map((idea, index) => {
              const Icon = idea.icon;
              return (
                <article
                  key={idea.code}
                  className="roadmap-reveal roadmap-horizon-card group relative overflow-hidden bg-[#1d1d1d] p-7 sm:p-10 md:p-12"
                  style={{ "--reveal-delay": `${Math.min(index, 3) * 80}ms` } as CSSProperties}
                >
                  <div className="roadmap-horizon-scan pointer-events-none absolute inset-0" />
                  <div className="relative flex items-start justify-between gap-6">
                    <div>
                      <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{t(idea.eyebrowKey)}</p>
                      <h3 className="mt-5 text-[30px] font-medium leading-none tracking-[-0.03em] text-[#e9e0d1] sm:text-[38px]">{t(idea.titleKey)}</h3>
                    </div>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#383838] bg-[#202020] transition-colors group-hover:border-[#fa6c34]/60">
                      <Icon size={21} strokeWidth={1.25} className="text-[#fa6c34]" />
                    </div>
                  </div>

                  <p className="relative mt-6 max-w-[630px] text-[13.5px] leading-7 text-[#9a938a]">{t(idea.summaryKey)}</p>

                  <div className="relative mt-8 border border-[#2e2e2e] bg-[#202020]/70">
                    <div className="flex items-center justify-between border-b border-[#2e2e2e] px-5 py-4">
                      <span className="font-mono-d text-[8px] tracking-[0.15em] text-[#635d5a]">{t("roadmap.horizon.consumerOutcome")}</span>
                      <span className="font-serif-d text-[24px] text-[#383838]">{idea.code}</span>
                    </div>
                    <p className="px-5 py-5 text-[18px] leading-7 text-[#d6ccba]">{t(idea.outcomeKey)}</p>
                  </div>

                  <div className="relative mt-7 space-y-0 border-y border-[#2e2e2e]">
                    {idea.featureKeys.map((featureKey, featureIndex) => (
                      <div key={featureKey} className="flex gap-4 border-b border-[#2e2e2e] py-4 last:border-b-0">
                        <span className="mt-0.5 font-mono-d text-[9px] text-[#fa6c34]">0{featureIndex + 1}</span>
                        <p className="text-[12.5px] leading-6 text-[#b1aaa0]">{t(featureKey)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="relative mt-7 flex flex-wrap gap-2">
                    {idea.signalKeys.map((signalKey) => (
                      <span key={signalKey} className="border border-[#383838] px-3 py-2 font-mono-d text-[8px] tracking-[0.1em] text-[#9a938a] transition-colors group-hover:border-[#4a3a32] group-hover:text-[#d6ccba]">
                        {t(signalKey)}
                      </span>
                    ))}
                  </div>

                  <div className="relative mt-7 flex gap-3 bg-[#171717] p-4">
                    <ShieldCheck size={15} strokeWidth={1.3} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                    <p className="text-[10.5px] leading-5 text-[#635d5a]">{t(idea.boundaryKey)}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid border-t border-[#2e2e2e] bg-[#e9e0d1] text-[#1d1d1d] md:grid-cols-[0.7fr_1.3fr]">
            <div className="border-b border-[#1d1d1d]/15 px-7 py-10 sm:px-10 md:border-b-0 md:border-r md:px-12">
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#1d1d1d]/50">{t("roadmap.utility.doableEyebrow")}</p>
              <p className="mt-3 text-[24px] font-medium tracking-[-0.025em]">{t("roadmap.utility.doableTitle")}</p>
            </div>
            <div className="px-7 py-10 sm:px-10 md:px-12">
              <p className="max-w-[820px] text-[13px] leading-7 text-[#1d1d1d]/65">
                {t("roadmap.utility.doableBody")}
              </p>
            </div>
          </div>
        </section>

        <section id="privacy" className="scroll-mt-20 border-t border-[#2e2e2e]">
          <div className="grid bg-[#e9e0d1] text-[#1d1d1d] xl:grid-cols-[0.88fr_1.12fr]">
            <div className="roadmap-reveal relative overflow-hidden border-b border-[#1d1d1d]/15 px-7 py-14 sm:px-10 md:px-12 md:py-20 xl:border-b-0 xl:border-r">
              <div className="roadmap-privacy-orbit pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full border border-[#1d1d1d]/10" aria-hidden="true">
                <div className="absolute inset-10 rounded-full border border-dashed border-[#1d1d1d]/15" />
                <div className="absolute inset-[84px] flex items-center justify-center rounded-full bg-[#fa6c34]">
                  <LockKeyhole size={26} strokeWidth={1.35} />
                </div>
              </div>
              <div className="relative">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#fa6c34]" />
                  <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#1d1d1d]/55">{t("roadmap.privacySection.eyebrow")}</p>
                </div>
                <h2 className="mt-7 max-w-[610px] text-[44px] font-medium leading-[0.96] tracking-[-0.045em] sm:text-[62px]">
                  {t("roadmap.privacySection.titleLine1")}
                  <br />
                  <span className="font-serif-d font-normal italic text-[#fa6c34]">{t("roadmap.privacySection.titleLine2")}</span>
                </h2>
                <p className="mt-7 max-w-[520px] text-[14px] leading-7 text-[#1d1d1d]/65">
                  {t("roadmap.privacySection.intro")}
                </p>
                <div className="mt-9 inline-flex items-center gap-3 border border-[#1d1d1d]/20 bg-[#e2d9ca] px-4 py-3">
                  <ShieldCheck size={14} className="text-[#fa6c34]" />
                  <span className="font-mono-d text-[8px] leading-4 tracking-[0.1em] text-[#1d1d1d]/60">
                    {t("roadmap.privacySection.designTarget")}
                  </span>
                </div>
              </div>
            </div>

            <div className="roadmap-reveal dots-dark bg-[#1d1d1d] p-7 text-[#e9e0d1] sm:p-10 md:p-12">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{t("roadmap.privacySection.receiptEyebrow")}</p>
                  <h3 className="mt-4 text-[27px] font-medium tracking-[-0.025em] sm:text-[34px]">{t("roadmap.privacySection.receiptTitle")}</h3>
                </div>
                <span className="border border-[#383838] px-3 py-2 font-mono-d text-[8px] tracking-[0.12em] text-[#635d5a]">{t("roadmap.privacySection.receiptBadge")}</span>
              </div>

              <div className="mt-9 overflow-hidden border border-[#383838] bg-[#202020]/90">
                {([
                  {
                    labelKey: "roadmap.privacySection.row.deviceLabel",
                    bodyKey: "roadmap.privacySection.row.deviceBody",
                  },
                  {
                    labelKey: "roadmap.privacySection.row.answerLabel",
                    bodyKey: "roadmap.privacySection.row.answerBody",
                  },
                  {
                    labelKey: "roadmap.privacySection.row.noSaveLabel",
                    bodyKey: "roadmap.privacySection.row.noSaveBody",
                  },
                ] as const satisfies ReadonlyArray<{ labelKey: TranslationKey; bodyKey: TranslationKey }>).map((row) => (
                  <div key={row.labelKey} className="roadmap-privacy-row group relative border-b border-[#383838] p-5 last:border-b-0 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-[#fa6c34]" />
                      <p className="font-mono-d text-[8px] tracking-[0.14em] text-[#fa6c34]">{t(row.labelKey)}</p>
                    </div>
                    <p className="mt-3 max-w-[570px] pl-5 text-[12.5px] leading-6 text-[#9a938a]">{t(row.bodyKey)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-5 border border-[#383838] bg-[#171717] p-4">
                <div className="flex items-center gap-3">
                  <Check size={14} className="text-[#fa6c34]" />
                  <span className="text-[12px] text-[#d6ccba]">{t("roadmap.privacySection.approvedNote")}</span>
                </div>
                <span className="font-mono-d text-[8px] tracking-[0.1em] text-[#635d5a]">{t("roadmap.privacySection.reviewable")}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-px bg-[#2e2e2e] sm:grid-cols-2 xl:grid-cols-4">
            {PRIVACY_PROMISES.map((promise, index) => {
              const Icon = promise.icon;
              return (
                <article
                  key={promise.number}
                  className="roadmap-reveal roadmap-privacy-promise group relative min-h-[265px] overflow-hidden bg-[#1d1d1d] p-7 sm:p-8"
                  style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono-d text-[9px] text-[#fa6c34]">{promise.number}</span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#383838] text-[#fa6c34] transition-colors group-hover:border-[#fa6c34]/55">
                      <Icon size={18} strokeWidth={1.3} />
                    </span>
                  </div>
                  <h3 className="mt-10 text-[23px] font-medium tracking-[-0.025em] text-[#e9e0d1]">{t(promise.titleKey)}</h3>
                  <p className="mt-4 text-[12.5px] leading-6 text-[#9a938a]">{t(promise.bodyKey)}</p>
                  <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#fa6c34] transition-all duration-500 group-hover:w-full" />
                </article>
              );
            })}
          </div>

          <div className="roadmap-reveal grid bg-[#fa6c34] text-[#1d1d1d] xl:grid-cols-[1fr_auto]">
            <div className="border-b border-[#1d1d1d]/20 px-7 py-10 sm:px-10 md:px-12 xl:border-b-0 xl:border-r">
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#1d1d1d]/55">{t("roadmap.privacySection.trustEyebrow")}</p>
              <p className="mt-4 max-w-[900px] text-[26px] font-medium leading-tight tracking-[-0.025em] sm:text-[34px]">
                {t("roadmap.privacySection.trustTitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-7 py-8 sm:px-10 xl:max-w-[360px] xl:px-10">
              {[
                "roadmap.privacySection.badge.vault",
                "roadmap.privacySection.badge.noAccount",
                "roadmap.privacySection.badge.noTrackers",
                "roadmap.privacySection.badge.noSeed",
              ].map((labelKey) => (
                <span key={labelKey} className="border border-[#1d1d1d]/25 px-3 py-2 font-mono-d text-[8px] tracking-[0.1em]">
                  {t(labelKey as TranslationKey)}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="protocol" className="scroll-mt-20 bg-[#fa6c34] text-[#1d1d1d]">
          <div className="grid border-b border-[#1d1d1d]/20 xl:grid-cols-[0.82fr_1.18fr]">
            <div className="border-b border-[#1d1d1d]/20 px-7 py-14 sm:px-10 md:px-12 md:py-20 xl:border-b-0 xl:border-r">
              <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#1d1d1d]/55">{t("roadmap.protocol.eyebrow")}</p>
              <h2 className="mt-5 max-w-[520px] text-[42px] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[56px]">
                {t("roadmap.protocol.titleLine1")}
                <br />
                <span className="font-serif-d font-normal italic">{t("roadmap.protocol.titleLine2")}</span>
              </h2>
              <p className="mt-7 max-w-[480px] text-[14px] leading-7 text-[#1d1d1d]/70">
                {t("roadmap.protocol.intro")}
              </p>
            </div>

            <div className="hatch-orange p-7 sm:p-10 md:p-12">
              <div className="grid gap-px overflow-hidden border border-[#1d1d1d]/20 bg-[#1d1d1d]/20 sm:grid-cols-5">
                {RELEASE_LOOP.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.labelKey} className="roadmap-protocol-step relative min-h-[190px] bg-[#fa6c34] p-5 sm:min-h-[260px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-d text-[10px] text-[#1d1d1d]/50">0{index + 1}</span>
                        <Icon size={17} strokeWidth={1.4} />
                      </div>
                      <div className="mt-12 sm:mt-24">
                        <p className="text-[18px] font-medium">{t(step.labelKey)}</p>
                        <p className="mt-3 text-[11.5px] leading-5 text-[#1d1d1d]/65">{t(step.noteKey)}</p>
                      </div>
                      {index < RELEASE_LOOP.length - 1 && (
                        <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 sm:block" size={18} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-col justify-between gap-4 border border-[#1d1d1d]/20 bg-[#fa6c34]/80 p-5 font-mono-d text-[10px] sm:flex-row sm:items-center">
                <span className="tracking-[0.14em]">{t("roadmap.protocol.snapshotRule.label")}</span>
                <span className="text-[#1d1d1d]/65">{t("roadmap.protocol.snapshotRule.value")}</span>
              </div>
              <div className="mt-2 flex flex-col justify-between gap-4 border border-[#1d1d1d]/20 bg-[#fa6c34]/80 p-5 font-mono-d text-[10px] sm:flex-row sm:items-center">
                <span className="tracking-[0.14em]">{t("roadmap.protocol.zeroSpendRule.label")}</span>
                <span className="text-[#1d1d1d]/65">{t("roadmap.protocol.zeroSpendRule.value")}</span>
              </div>
              <div className="mt-2 flex flex-col justify-between gap-4 border border-[#1d1d1d]/20 bg-[#fa6c34]/80 p-5 font-mono-d text-[10px] sm:flex-row sm:items-center">
                <span className="tracking-[0.14em]">{t("roadmap.protocol.identityRule.label")}</span>
                <span className="text-[#1d1d1d]/65">{t("roadmap.protocol.identityRule.value")}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-8 px-7 py-10 sm:px-10 md:flex-row md:items-center md:px-12">
            <div>
              <p className="font-mono-d text-[10px] tracking-[0.17em] text-[#1d1d1d]/55">{t("roadmap.protocol.brand")}</p>
              <p className="mt-2 text-[20px] font-medium">{t("roadmap.protocol.tagline")}</p>
            </div>
            <Link
              to="/app"
              className="clip-btn flex min-h-[56px] w-full items-center justify-between bg-[#1d1d1d] px-7 font-mono-d text-[11px] tracking-[0.08em] text-[#e9e0d1] transition-transform hover:-translate-y-0.5 sm:w-[280px]"
            >
              {t("roadmap.protocol.cta")}
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col items-start justify-between gap-4 border-t border-[#2e2e2e] bg-[#1d1d1d] px-7 py-6 text-[11px] text-[#635d5a] sm:px-10 md:flex-row md:items-center md:px-12">
          <span>{t("roadmap.footer.copyright")}</span>
          <span className="font-mono-d tracking-[0.2em]">{t("roadmap.footer.workflow")}</span>
          <div className="flex gap-6">
            <Link to="/terms" className="transition-colors hover:text-[#e9e0d1]">{t("roadmap.footer.terms")}</Link>
            <Link to="/privacy" className="transition-colors hover:text-[#e9e0d1]">{t("roadmap.footer.privacy")}</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
