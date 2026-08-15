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

type Release = {
  id: string;
  number: string;
  branch: string;
  title: string;
  eyebrow: string;
  summary: string;
  outcome: string;
  icon: LucideIcon;
  capabilities: Array<{
    kicker: string;
    title: string;
    signal: string;
    bars: number[];
  }>;
  gate: string;
  snapshot: string;
};

type HorizonIdea = {
  code: string;
  eyebrow: string;
  title: string;
  summary: string;
  outcome: string;
  icon: LucideIcon;
  features: string[];
  signals: string[];
  boundary: string;
};

const RELEASES: Release[] = [
  {
    id: "scout-swap",
    number: "01",
    branch: "release/01-scout-swap",
    title: "Scout Swap",
    eyebrow: "LIVE ROUTE. CLEAR OUTCOME.",
    summary: "Preview a current Uniswap route, understand every tradeoff, then continue in the official app.",
    outcome: "Preview a live swap",
    icon: Repeat2,
    capabilities: [
      { kicker: "LIVE QUOTE", title: "Current WETH/USDG route, price impact, gas, and minimum received", signal: "FREE API / FRESH", bars: [32, 48, 40, 66, 58, 88] },
      { kicker: "SIMULATION", title: "Plain-English predicted balance changes and failure states", signal: "EXPLAIN ONLY", bars: [72, 62, 52, 44, 36, 28] },
      { kicker: "UNISWAP HANDOFF", title: "Open the official Uniswap app with pair and amount prefilled", signal: "REQUOTES THERE", bars: [24, 31, 46, 55, 74, 92] },
    ],
    gate: "Fresh quote and successful simulation; all user-paid costs disclosed; no signing method exists.",
    snapshot: "scout-swap-rc1",
  },
  {
    id: "privacy-foundation",
    number: "02",
    branch: "release/02-privacy-foundation",
    title: "Privacy Foundation",
    eyebrow: "USE IT WITHOUT BECOMING A PROFILE",
    summary: "Make no-account Private Mode the default and remove private details from server storage, logs, and browser-readable credentials.",
    outcome: "Use ChainScout privately",
    icon: ShieldCheck,
    capabilities: [
      { kicker: "PRIVATE MODE", title: "Research public assets with no account and no permanent server-side history", signal: "DEFAULT ON", bars: [80, 56, 72, 44, 62, 36] },
      { kicker: "SAFE SESSION", title: "Host-only secure cookies, bounded logs, and aggregate-only metrics", signal: "NO PROFILE", bars: [30, 38, 52, 66, 76, 88] },
      { kicker: "PRIVACY RECEIPT", title: "Review the exact public facts approved for optional AI", signal: "CLEAR PERMISSION", bars: [88, 74, 64, 52, 46, 34] },
    ],
    gate: "Private fields never enter logs, analytics, saved server records, or unapproved network requests.",
    snapshot: "privacy-foundation-rc1",
  },
  {
    id: "encrypted-vault",
    number: "03",
    branch: "release/03-encrypted-vault",
    title: "Encrypted Asset Vault",
    eyebrow: "YOUR ASSETS. YOUR DEVICE.",
    summary: "Track purchase lots, notes, photos, grades, and manual assets in one encrypted browser Vault.",
    outcome: "Track every asset privately",
    icon: LockKeyhole,
    capabilities: [
      { kicker: "ENCRYPTED LOCALLY", title: "Protect lots, cost basis, notes, and photos before they enter storage", signal: "AES-GCM", bars: [42, 74, 58, 86, 64, 78] },
      { kicker: "ANY ASSET", title: "Add crypto, cards, phygitals, or a completely manual item", signal: "ONE VAULT", bars: [82, 70, 62, 54, 48, 40] },
      { kicker: "BACKUP CONTROL", title: "Lock, export, import, recover, inspect storage health, or delete", signal: "USER OWNED", bars: [34, 46, 38, 62, 72, 92] },
    ],
    gate: "Plaintext never crosses the network; encryption, recovery, corruption, eviction, and deletion states pass.",
    snapshot: "encrypted-vault-rc1",
  },
  {
    id: "portfolio-intelligence",
    number: "04",
    branch: "release/04-portfolio-intelligence",
    title: "Portfolio Intelligence",
    eyebrow: "ONE VIEW. LESS NOISE.",
    summary: "Combine holdings, cost basis, activity, approvals, performance, and plain-English transaction explanations.",
    outcome: "Understand the whole portfolio",
    icon: WalletCards,
    capabilities: [
      { kicker: "PORTFOLIO VIEW", title: "Holdings, allocation, cost basis, gain or loss, and freshness in one place", signal: "LOCAL MATH", bars: [30, 34, 46, 58, 76, 92] },
      { kicker: "TRANSACTION LENS", title: "Reconcile movements, approvals, failures, calls, and net wallet change", signal: "SOURCE MATCHED", bars: [64, 70, 66, 76, 72, 84] },
      { kicker: "APPROVAL GUARD", title: "Explain who can spend, how much, and where to verify or revoke", signal: "READ ONLY", bars: [26, 52, 38, 70, 48, 86] },
    ],
    gate: "Balances, NFTs, lots, activity, and approvals reconcile; unsupported intent is never guessed.",
    snapshot: "portfolio-intelligence-rc1",
  },
  {
    id: "rwa-phygital-verify",
    number: "05",
    branch: "release/05-rwa-phygital-verify",
    title: "RWA & Phygital Verify",
    eyebrow: "VERIFY THE CLAIM, NOT THE HYPE",
    summary: "Explain Stock Tokens, yield, custody, redemption, and where a physical claim still cannot be proven.",
    outcome: "Understand RWAs and phygitals",
    icon: Landmark,
    capabilities: [
      { kicker: "STOCK TOKEN", title: "Canonical contract, multiplier, corporate actions, price timestamp, and trading state", signal: "PRIMARY SOURCES", bars: [28, 42, 54, 66, 78, 90] },
      { kicker: "ORACLE + YIELD", title: "Chainlink freshness and Morpho vault APY, fees, liquidity, and allocations", signal: "VARIABLE / SOURCED", bars: [84, 74, 64, 56, 48, 42] },
      { kicker: "PHYGITAL PROOF", title: "Custody, redemption, serial, jurisdiction, rights, and missing evidence", signal: "NO FALSE CERTAINTY", bars: [40, 52, 46, 68, 58, 88] },
    ],
    gate: "Every claim is source-linked; stale data stops; an image or token is never called proof of the physical object.",
    snapshot: "rwa-phygital-rc1",
  },
  {
    id: "collectible-catalog",
    number: "06",
    branch: "release/06-collectible-catalog",
    title: "Collectible Catalog",
    eyebrow: "FROM CARD TO TRACKED ASSET",
    summary: "Match supported trading-card metadata, then add owner-reported details and a private local photo without uploading ownership data.",
    outcome: "Add collectibles without a spreadsheet",
    icon: ScanSearch,
    capabilities: [
      { kicker: "CATALOG MATCH", title: "Resolve English card ID, set, collector number, rarity, and illustrator", signal: "SOURCE LINKED", bars: [32, 48, 64, 58, 76, 92] },
      { kicker: "OWNER LAYER", title: "Encrypt a sanitized local photo, condition, grade, certificate, and dated manual reference", signal: "CLEARLY LABELED", bars: [88, 72, 62, 54, 42, 34] },
      { kicker: "MANUAL PATH", title: "Track any unsupported card or physical collectible immediately", signal: "NEVER BLOCKED", bars: [24, 36, 50, 64, 78, 94] },
    ],
    gate: "Catalog facts and owner claims remain distinct; no artwork, marketplace pricing, authenticity, or inventory is implied.",
    snapshot: "collectible-catalog-rc1",
  },
  {
    id: "market-inventory",
    number: "07",
    branch: "release/07-market-inventory",
    title: "Market & Inventory",
    eyebrow: "FIND THE REAL AVAILABLE OPTION",
    summary: "Compare exact-match crypto liquidity, opt-in retailer stock, landed costs, and available product/source signals.",
    outcome: "Compare price, stock, and source facts",
    icon: PackageSearch,
    capabilities: [
      { kicker: "CRYPTO LIQUIDITY", title: "Match indexed pools by chain and contract, with base-price orientation, volume, liquidity, and freshness", signal: "NOT BY TICKER", bars: [31, 54, 43, 68, 61, 91] },
      { kicker: "MERCHANT STOCK", title: "Read exact reviewed products from opted-in WooCommerce feeds; keep unapproved Shopify paths off", signal: "PERMISSIONED SOURCES", bars: [76, 61, 70, 53, 44, 32] },
      { kicker: "REAL OUTCOME", title: "Compare fees, shipping, tax inputs, condition, returns, and disclosed product signals", signal: "MISSING INPUTS SHOWN", bars: [28, 43, 57, 63, 81, 94] },
    ],
    gate: "Only fresh comparable exact matches are ranked; unsupported venues receive precise search handoffs.",
    snapshot: "market-inventory-rc1",
  },
  {
    id: "replay-actions",
    number: "08",
    branch: "release/08-replay-actions",
    title: "Replay & Actions",
    eyebrow: "LEARN FROM HISTORY. ACT ON TODAY.",
    summary: "Rebuild a supported trade with a new amount or choose a current offer, then continue safely at the official venue.",
    outcome: "Rebuild a trade or purchase safely",
    icon: Copy,
    capabilities: [
      { kicker: "PATTERN CHECK", title: "Recognize one complete WETH/USDG movement pattern without claiming its historical intent", signal: "LOCAL CONTEXT", bars: [36, 51, 62, 55, 73, 90] },
      { kicker: "NEW CHOICE", title: "Require a wholly new direction and amount or a freshly reviewed current offer", signal: "USER DEFINED", bars: [87, 74, 63, 50, 41, 33] },
      { kicker: "OFFICIAL HANDOFF", title: "Let Uniswap or the merchant requote, sign, charge, fulfill, and support", signal: "CHAINSCOUT NEVER EXECUTES", bars: [23, 38, 49, 66, 80, 95] },
    ],
    gate: "No historic execution payload survives; every action starts fresh and leaves ChainScout before signing or payment.",
    snapshot: "replay-actions-rc1",
  },
  {
    id: "open-data-api",
    number: "09",
    branch: "release/09-open-data-api",
    title: "ChainScout Open Data",
    eyebrow: "PUBLIC FACTS. REUSABLE EVIDENCE.",
    summary: "Expose one deliberately small, capped static support registry plus independently derived syntax normalization.",
    outcome: "Reuse ChainScout public intelligence",
    icon: Code2,
    capabilities: [
      { kicker: "TWO-ROUTE V1", title: "Read the reviewed WETH/USDG support registry or normalize one EVM address", signal: "OPENAPI", bars: [29, 45, 60, 55, 77, 91] },
      { kicker: "SAFE DATA CLASS", title: "Separate reviewed static references from ChainScout-derived normalization—never Vault or provider payloads", signal: "HUMAN LINKS", bars: [84, 70, 58, 49, 42, 35] },
      { kicker: "HARD BUDGET", title: "Use Redis identity and global caps; every API response makes zero provider calls", signal: "$0 OVERAGE", bars: [27, 41, 52, 68, 82, 96] },
    ],
    gate: "No private or restricted data escapes; static provenance, human links, hard caps, and the kill switch are verified.",
    snapshot: "open-data-api-rc1",
  },
  {
    id: "launch-hardening",
    number: "10",
    branch: "release/10-launch-hardening",
    title: "Launch Hardening",
    eyebrow: "THE ENABLED PRODUCT, PROVEN",
    summary: "Certify the enabled launch journey under real devices, stale providers, corrupted data, quota pressure, and human confusion; keep upcoming tools clearly marked as coming soon.",
    outcome: "Certify the enabled command center",
    icon: BadgeCheck,
    capabilities: [
      { kicker: "FULL JOURNEYS", title: "Private onboarding, Vault, portfolio, evidence, handoff, backup, and deletion", signal: "DESKTOP + MOBILE", bars: [34, 48, 57, 69, 83, 97] },
      { kicker: "BREAK IT SAFELY", title: "Provider chaos, load, quota, security, privacy, migration, and rollback drills", signal: "FAIL CLOSED", bars: [90, 77, 66, 53, 44, 31] },
      { kicker: "HUMAN READY", title: "Accessibility, beginner comprehension, accurate legal copy, and independent review", signal: "GA GATE", bars: [25, 39, 51, 65, 79, 96] },
    ],
    gate: "Every launch gate passes on the exact deployed SHA; the private Vault receives independent security review.",
    snapshot: "launch-hardening-rc1",
  },
];

const RELEASE_LOOP = [
  { label: "Build", note: "Develop on the next cumulative branch", icon: Blocks },
  { label: "Deploy", note: "Point the single staging service at it", icon: Zap },
  { label: "Test", note: "Run UX, data, and transaction checks", icon: Bot },
  { label: "Freeze", note: "Tag the approved release candidate", icon: ShieldCheck },
  { label: "Release", note: "Merge to main and move staging ahead", icon: Check },
];

const HORIZON_IDEAS: HorizonIdea[] = [
  {
    code: "API",
    eyebrow: "OPEN INTELLIGENCE LAYER",
    title: "ChainScout Open Data",
    summary: "Let another application reuse a tiny, documented set of ChainScout-authored support annotations without proxying provider data.",
    outcome: "A bounded foundation for reusable public facts",
    icon: Code2,
    features: [
      "Exactly two credentialless v1 routes: reviewed WETH/USDG support and EVM-address syntax normalization",
      "OpenAPI documentation, human-verification links, explicit rights exclusions, and deterministic limitations",
      "No search, wallet or transaction summaries, live prices, bulk snapshots, provider calls, or upstream payloads",
    ],
    signals: ["$0 OVERAGE", "NO KYB", "SOURCE LINKED"],
    boundary: "IP-only Redis limits, a global daily ceiling, and a kill switch prevent public traffic from creating provider or paid-overage spend.",
  },
  {
    code: "FIND",
    eyebrow: "UNIVERSAL OFFER GRAPH",
    title: "Inventory Everywhere",
    summary: "Match one exact asset to live crypto liquidity, marketplace listings, retailer stock, and opt-in merchant catalogs.",
    outcome: "See where the exact asset is actually available",
    icon: PackageSearch,
    features: [
      "Crypto pools and quotes matched by chain and contract—not ticker or token name",
      "Cards matched by English catalog set and number, then paired with owner-reported printing, condition, grade, and certificate",
      "Opted-in WooCommerce feeds, reviewed merchant sources, and click-only searches for supported public venues",
    ],
    signals: ["LAST CHECKED", "EXACT MATCH", "STOCK CONFIDENCE"],
    boundary: "Unsupported stores get a searchable deep link; ChainScout never bypasses logins, CAPTCHA, robots, or marketplace terms.",
  },
  {
    code: "BUY",
    eyebrow: "BEST REAL OUTCOME",
    title: "Scout Price & Purchase",
    summary: "Compare the outcome the buyer receives—not the most attractive headline number—then continue through the official venue.",
    outcome: "Find the best trusted route and open checkout",
    icon: ShoppingCart,
    features: [
      "Rank crypto quotes after gas, price impact, slippage, route risk, and minimum received",
      "Rank physical offers after condition, shipping, taxes, duties, returns, and seller reputation",
      "Use prefilled deep links or native-feeling merchant carts that redirect to official checkout",
    ],
    signals: ["LANDED COST", "REPUTATION", "OFFICIAL HANDOFF"],
    boundary: "ChainScout prepares and explains. Uniswap or the merchant owns signatures, payment details, fulfillment, and execution.",
  },
  {
    code: "TRUST",
    eyebrow: "PHYSICAL + DIGITAL PROOF",
    title: "Trust & Phygital Advisor",
    summary: "Explain whether a digital claim is connected to a real object, who holds it, how it can be redeemed, and what can fail.",
    outcome: "Understand the asset before committing money",
    icon: BadgeCheck,
    features: [
      "Check contract controls, creator history, holders, liquidity, verified source, and protocol reputation",
      "Check custody, redemption rights, serial or grader certificate, audits, insurance, fees, and jurisdiction",
      "Give plain-English buy, verify, store, redeem, and exit checklists with evidence—not invented certainty",
    ],
    signals: ["PROOF LEVEL", "CUSTODY", "EXIT PATH"],
    boundary: "A token or photograph cannot prove physical authenticity or ownership; uncertain claims remain visibly unverified.",
  },
];

const COMMERCE_FLOW = [
  { label: "Identify", note: "Exact contract or collectible", icon: ScanSearch },
  { label: "Find", note: "Fresh inventory and liquidity", icon: Store },
  { label: "Compare", note: "True cost and reputation", icon: CircleDollarSign },
  { label: "Verify", note: "Rights, custody, and risks", icon: ShieldCheck },
  { label: "Continue", note: "Official protocol or checkout", icon: ArrowRight },
];

const PRIVACY_PROMISES = [
  {
    number: "01",
    title: "Encrypted Vault",
    body: "Purchase prices, wallet groupings, notes, photos, and profit or loss stay encrypted on the device.",
    icon: LockKeyhole,
  },
  {
    number: "02",
    title: "Clear permission",
    body: "Before an AI request, ChainScout shows the exact public facts that will leave the Vault.",
    icon: KeyRound,
  },
  {
    number: "03",
    title: "Minimal footprint",
    body: "Private Mode needs no account, seed phrase, advertising tracker, or permanent server-side portfolio.",
    icon: EyeOff,
  },
  {
    number: "04",
    title: "Delete anytime",
    body: "One clear action removes the local Vault, remembered wallets, photos, caches, and encryption keys.",
    icon: Trash2,
  },
];

function RoadmapSidebar({ active }: { active: string }) {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[220px] flex-col border-r border-[#2e2e2e] bg-[#1d1d1d] lg:flex">
      <Link
        to="/"
        className="relative block h-[74px] shrink-0 bg-[#fa6c34]"
        style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)" }}
        aria-label="Back to ChainScout home"
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <img src="/logo.svg" alt="" className="h-8 w-8" />
        </span>
      </Link>

      <div className="border-b border-[#2e2e2e] px-6 py-7">
        <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#635d5a]">PRODUCT PATH</p>
        <p className="mt-2 text-[15px] text-[#d6ccba]">Release roadmap</p>
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
              <span className="truncate">{release.outcome}</span>
            </a>
          );
        })}
      </nav>

      <div className="border-t border-[#2e2e2e] p-6">
        <div className="flex items-center gap-3">
          <span className="roadmap-live-dot h-2 w-2 rounded-full bg-[#fa6c34]" />
          <div>
            <p className="font-mono-d text-[10px] tracking-[0.14em] text-[#9a938a]">SEQUENTIAL</p>
            <p className="mt-1 text-[11px] text-[#635d5a]">One release at a time</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function RoadmapNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-30 flex h-[60px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/90 backdrop-blur lg:left-[220px]">
        <Link
          to="/"
          className="flex h-full w-[60px] shrink-0 items-center justify-center bg-[#fa6c34] lg:hidden"
          style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)" }}
          aria-label="ChainScout home"
        >
          <img src="/logo.svg" alt="" className="h-6 w-6" />
        </Link>
        <Link to="/" className="ml-6 hidden items-center gap-2 font-mono-d text-[11px] text-[#9a938a] transition-colors hover:text-[#e9e0d1] sm:flex">
          <ArrowLeft size={13} />
          HOME
        </Link>
        <div className="flex-1" />
        <nav className="hidden items-center gap-8 pr-8 font-mono-d text-[11px] tracking-wide text-[#9a938a] md:flex">
          <a href="#releases" className="transition-colors hover:text-[#e9e0d1]">RELEASES</a>
          <a href="#horizon" className="transition-colors hover:text-[#e9e0d1]">UTILITY</a>
          <a href="#privacy" className="transition-colors hover:text-[#e9e0d1]">PRIVACY</a>
          <a href="#protocol" className="transition-colors hover:text-[#e9e0d1]">PROTOCOL</a>
        </nav>
        <Link
          to="/app"
          className="clip-btn-sm mr-3 hidden h-full items-center bg-[#fa6c34] px-8 font-mono-d text-[11px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7038] sm:flex md:mr-0"
        >
          TRY THE EXPLORER
        </Link>
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex h-full w-[60px] items-center justify-center border-l border-[#2e2e2e] text-[#e9e0d1] md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[60px] z-40 border-b border-[#2e2e2e] bg-[#1d1d1d] md:hidden">
          <a href="#releases" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            RELEASES <ArrowRight size={14} />
          </a>
          <a href="#horizon" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            UTILITY <ArrowRight size={14} />
          </a>
          <a href="#privacy" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            PRIVACY <ArrowRight size={14} />
          </a>
          <a href="#protocol" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            RELEASE PROTOCOL <ArrowRight size={14} />
          </a>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Link to="/" className="clip-btn-sm flex items-center justify-center border border-[#383838] py-3.5 font-mono-d text-[11px] text-[#d6ccba]">HOME</Link>
            <Link to="/app" className="clip-btn-sm flex items-center justify-center bg-[#fa6c34] py-3.5 font-mono-d text-[11px] font-medium text-[#1d1d1d]">TRY EXPLORER</Link>
          </div>
        </div>
      )}
    </>
  );
}

function TrajectoryDiagram() {
  return (
    <div className="roadmap-orbit roadmap-orbit-parallax relative mx-auto aspect-square w-full max-w-[560px]" aria-hidden="true">
      <div className="absolute inset-[8%] rounded-full border border-[#383838]" />
      <div className="absolute inset-[19%] rounded-full border border-dashed border-[#383838]" />
      <div className="absolute inset-[31%] rounded-full border border-[#2e2e2e]" />
      <div className="roadmap-orbit-ring absolute inset-[8%] rounded-full">
        <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fa6c34] shadow-[0_0_24px_rgba(250,108,52,0.8)]" />
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
      <div className="absolute left-1/2 top-1/2 flex h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[#383838] bg-[#1d1d1d] text-center shadow-[0_0_60px_rgba(0,0,0,0.45)]">
        <CircleDollarSign size={22} strokeWidth={1.2} className="text-[#fa6c34]" />
        <span className="mt-2 font-mono-d text-[9px] tracking-[0.18em] text-[#9a938a]">$0 NEW SPEND</span>
        <span className="font-mono-d text-[9px] tracking-[0.18em] text-[#9a938a]">UTILITY STACK</span>
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
          <p className="relative mt-8 font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">CUMULATIVE RELEASE</p>
        </div>

        <div className="border-b border-[#2e2e2e] p-7 sm:p-10 xl:border-b-0 xl:border-r xl:p-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono-d text-[10px] tracking-[0.17em] text-[#fa6c34]">{release.eyebrow}</span>
            <span className="h-px w-8 bg-[#383838]" />
            <span className="font-mono-d text-[9px] tracking-[0.12em] text-[#635d5a]">BUILDS ON {index === 0 ? "CORE" : `R${RELEASES[index - 1].number}`}</span>
          </div>
          <h2 className="mt-5 max-w-[680px] text-[32px] font-medium leading-[1.03] tracking-[-0.03em] text-[#e9e0d1] sm:text-[42px]">
            {release.title}
          </h2>
          <p className="mt-5 max-w-[620px] text-[14px] leading-7 text-[#9a938a]">{release.summary}</p>

          <div className="mt-9 grid gap-px overflow-hidden border border-[#2e2e2e] bg-[#2e2e2e] md:grid-cols-3">
            {release.capabilities.map((capability, capabilityIndex) => (
              <div key={capability.title} className="roadmap-capability group relative min-h-[205px] overflow-hidden bg-[#1d1d1d] p-5 transition-colors hover:bg-[#242424]">
                <span className="pointer-events-none absolute -right-1 top-7 font-serif-d text-[62px] leading-none text-[#2b2b2b] transition-colors group-hover:text-[#302823]">
                  0{capabilityIndex + 1}
                </span>
                <div className="relative flex items-center justify-between">
                  <span className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">{capability.kicker}</span>
                  <span className="roadmap-point-beacon flex h-5 w-5 items-center justify-center rounded-full border border-[#383838]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34] opacity-60 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <p className="relative mt-6 max-w-[190px] text-[13px] leading-[1.65] text-[#c1b8ab]">{capability.title}</p>

                <div className="relative mt-7 flex items-end justify-between gap-5 border-t border-[#2e2e2e] pt-4">
                  <div>
                    <p className="font-mono-d text-[8px] tracking-[0.13em] text-[#635d5a]">SIGNAL</p>
                    <p className="mt-1.5 font-mono-d text-[8px] tracking-[0.08em] text-[#9a938a]">{capability.signal}</p>
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
            <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">RELEASE OUTCOME</p>
            <p className="mt-3 text-[21px] tracking-[-0.02em] text-[#d6ccba]">{release.outcome}</p>
            <div className="mt-7 grid grid-cols-[74px_1fr] items-center gap-5 border border-[#2e2e2e] bg-[#1d1d1d]/45 p-4">
              <div className="roadmap-readiness relative flex h-[74px] w-[74px] items-center justify-center rounded-full border border-[#383838]">
                <div className="absolute inset-[7px] rounded-full border border-dashed border-[#383838]" />
                <div className="absolute inset-[15px] rounded-full border border-[#2e2e2e]" />
                <span className="relative font-serif-d text-[19px] text-[#fa6c34]">R{release.number}</span>
              </div>
              <div>
                <p className="font-mono-d text-[8px] tracking-[0.16em] text-[#635d5a]">CAPABILITY NODE</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
                  <span className="font-mono-d text-[9px] tracking-[0.1em] text-[#b1aaa0]">PLANNED / SEQUENTIAL</span>
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
            <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">SHIP GATE</p>
            <p className="mt-3 text-[12.5px] leading-6 text-[#9a938a]">{release.gate}</p>
            <div className="mt-5 grid grid-cols-3 gap-1.5">
              {["DATA", "UX", "SAFETY"].map((check) => (
                <span key={check} className="flex items-center justify-center gap-1.5 border border-[#383838] py-2 font-mono-d text-[7px] tracking-[0.1em] text-[#635d5a]">
                  <Check size={8} className="text-[#fa6c34]" />
                  {check}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">FROZEN AS</p>
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

  useEffect(() => {
    document.title = "Product Roadmap | ChainScout";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    if (description) {
      description.content = "Explore ChainScout's zero-new-spend roadmap for safer swaps, open asset data, universal inventory, best-price routing, reputation, and phygital verification.";
    }

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
      document.title = "ChainScout: Robinhood Chain Intelligence in Plain English";
      if (description && previousDescription) description.content = previousDescription;
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
                <span className="font-mono-d text-[10px] tracking-[0.14em] text-[#9a938a] sm:text-[11px]">CHAINSCOUT PRODUCT ROADMAP</span>
                <span className="hatch h-3 flex-1 opacity-50" />
                <span className="font-mono-d text-[9px] text-[#635d5a]">R01-R10 / ENGINEERING TRAIN</span>
              </div>

              <h1 className="roadmap-hero-in roadmap-delay-1 mt-10 max-w-[740px] text-[46px] font-medium leading-[0.98] tracking-[-0.045em] text-[#d6ccba] sm:text-[64px] md:text-[78px] xl:text-[82px]">
                From explorer
                <br />
                <span className="font-serif-d font-normal italic text-[#f0e8da]">to informed action.</span>
              </h1>
              <p className="roadmap-hero-in roadmap-delay-2 mt-8 max-w-[560px] text-[15px] leading-7 text-[#9a938a]">
                Ten cumulative releases build and harden a private asset command center. The live
                build labels each tool as available now or coming soon instead of implying every adapter is public.
              </p>
            </div>

            <div className="roadmap-hero-in roadmap-delay-3 mt-14 grid max-w-[650px] grid-cols-3 gap-px overflow-hidden border border-[#2e2e2e] bg-[#2e2e2e] xl:mt-10">
              {[
                ["$0", "New vendor spend"],
                ["00", "Public KYB steps*"],
                ["01", "Official handoff"],
              ].map(([value, label]) => (
                <div key={label} className="bg-[#1d1d1d] p-4 sm:p-5">
                  <p className="font-serif-d text-[34px] leading-none text-[#e9e0d1]">{value}</p>
                  <p className="mt-3 font-mono-d text-[8px] leading-4 tracking-[0.08em] text-[#635d5a] sm:text-[9px] sm:tracking-[0.1em]">{label.toUpperCase()}</p>
                </div>
              ))}
            </div>
            <p className="roadmap-hero-in roadmap-delay-3 mt-4 max-w-[650px] font-mono-d text-[8px] leading-4 tracking-[0.06em] text-[#635d5a]">
              * Selected provider path has no publicly stated KYB/KYC requirement. Ordinary account,
              API-key, and terms acceptance may apply. User-paid network and liquidity costs remain.
            </p>
          </div>

          <div className="dots relative flex min-h-[520px] items-center justify-center overflow-hidden bg-[#1c1c1c] p-5 sm:p-10 xl:min-h-0">
            <div className="absolute left-0 right-0 top-8 flex items-center gap-3 px-8">
              <span className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">RELEASE TRAJECTORY</span>
              <span className="h-px flex-1 bg-[#2e2e2e]" />
              <span className="font-mono-d text-[9px] text-[#635d5a]">4663 / PRODUCT</span>
            </div>
            <TrajectoryDiagram />
            <div className="absolute bottom-7 left-8 right-8 flex items-center justify-between font-mono-d text-[9px] tracking-[0.12em] text-[#635d5a]">
              <span>UNDERSTAND</span>
              <span className="mx-4 h-px flex-1 bg-gradient-to-r from-[#383838] via-[#fa6c34] to-[#383838]" />
              <span>PREPARE</span>
            </div>
          </div>
        </section>

        <section id="releases" className="scroll-mt-20">
          <div className="grid border-b border-[#2e2e2e] bg-[#e9e0d1] text-[#1d1d1d] md:grid-cols-[1fr_1fr]">
            <div className="border-b border-[#1d1d1d]/15 px-7 py-10 sm:px-10 md:border-b-0 md:border-r md:px-12 md:py-14">
              <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#1d1d1d]/55">THE RELEASE STACK</p>
              <h2 className="mt-4 max-w-[580px] text-[34px] font-medium leading-[1.05] tracking-[-0.035em] sm:text-[46px]">
                Each update makes the next one possible.
              </h2>
            </div>
            <div className="dots-dark flex items-end px-7 py-10 sm:px-10 md:px-12 md:py-14">
              <p className="max-w-[570px] text-[14px] leading-7 text-[#1d1d1d]/65">
                These are cumulative snapshots, not parallel experiments. Release 02 includes 01;
                release 03 includes both. What passes stays stable while the product moves forward.
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute bottom-0 left-[84px] top-0 hidden w-px bg-[#2e2e2e] xl:block" />
            <div className="roadmap-timeline-signal absolute left-[82px] top-0 hidden h-14 w-[5px] rounded-full bg-[#fa6c34] shadow-[0_0_18px_rgba(250,108,52,0.55)] xl:block" />
            {RELEASES.map((release, index) => (
              <ReleaseCard key={release.id} release={release} index={index} />
            ))}
          </div>
        </section>

        <section id="horizon" className="scroll-mt-20 border-t border-[#2e2e2e] bg-[#171717]">
          <div className="grid border-b border-[#2e2e2e] xl:grid-cols-[0.9fr_1.1fr]">
            <div className="roadmap-reveal border-b border-[#2e2e2e] px-7 py-14 sm:px-10 md:px-12 md:py-20 xl:border-b-0 xl:border-r">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#fa6c34] shadow-[0_0_18px_rgba(250,108,52,0.75)]" />
                <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#fa6c34]">THE LAUNCH UTILITY</p>
              </div>
              <h2 className="mt-7 max-w-[620px] text-[42px] font-medium leading-[0.98] tracking-[-0.04em] text-[#e9e0d1] sm:text-[58px]">
                One lens for
                <br />
                <span className="font-serif-d font-normal italic text-[#f0e8da]">anything with value.</span>
              </h2>
              <p className="mt-7 max-w-[550px] text-[14px] leading-7 text-[#9a938a]">
                Discover it, prove what it is, see every comparable place it is available, understand
                the real cost and risk, then continue through the official protocol or merchant.
              </p>
              <div className="mt-9 inline-flex items-center gap-3 border border-[#383838] bg-[#1d1d1d] px-4 py-3">
                <Zap size={14} className="text-[#fa6c34]" />
                <span className="font-mono-d text-[9px] tracking-[0.12em] text-[#9a938a]">BUILT SEQUENTIALLY INTO RELEASES 05—09</span>
              </div>
            </div>

            <div className="roadmap-reveal dots flex flex-col justify-center p-7 sm:p-10 md:p-12">
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#635d5a]">A SINGLE CONSUMER FLOW</p>
              <div className="mt-6 grid gap-px overflow-hidden border border-[#2e2e2e] bg-[#2e2e2e] sm:grid-cols-5">
                {COMMERCE_FLOW.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="roadmap-commerce-step group relative min-h-[180px] bg-[#1d1d1d] p-4 transition-colors hover:bg-[#242424]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-d text-[8px] text-[#635d5a]">0{index + 1}</span>
                        <Icon size={16} strokeWidth={1.35} className="text-[#fa6c34]" />
                      </div>
                      <div className="mt-12 sm:mt-16">
                        <p className="text-[16px] text-[#d6ccba]">{step.label}</p>
                        <p className="mt-2 text-[10.5px] leading-5 text-[#635d5a]">{step.note}</p>
                      </div>
                      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#fa6c34] transition-all duration-500 group-hover:w-full" />
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 font-mono-d text-[8px] leading-5 tracking-[0.08em] text-[#635d5a]">
                “BEST” MEANS THE STRONGEST OBSERVED COMPARABLE OUTCOME—AFTER FEES, CONDITION,
                FRESHNESS, REPUTATION, AND RISK. AVAILABILITY CAN CHANGE BEFORE CHECKOUT.
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
                      <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{idea.eyebrow}</p>
                      <h3 className="mt-5 text-[30px] font-medium leading-none tracking-[-0.03em] text-[#e9e0d1] sm:text-[38px]">{idea.title}</h3>
                    </div>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#383838] bg-[#202020] transition-colors group-hover:border-[#fa6c34]/60">
                      <Icon size={21} strokeWidth={1.25} className="text-[#fa6c34]" />
                    </div>
                  </div>

                  <p className="relative mt-6 max-w-[630px] text-[13.5px] leading-7 text-[#9a938a]">{idea.summary}</p>

                  <div className="relative mt-8 border border-[#2e2e2e] bg-[#202020]/70">
                    <div className="flex items-center justify-between border-b border-[#2e2e2e] px-5 py-4">
                      <span className="font-mono-d text-[8px] tracking-[0.15em] text-[#635d5a]">CONSUMER OUTCOME</span>
                      <span className="font-serif-d text-[24px] text-[#383838]">{idea.code}</span>
                    </div>
                    <p className="px-5 py-5 text-[18px] leading-7 text-[#d6ccba]">{idea.outcome}</p>
                  </div>

                  <div className="relative mt-7 space-y-0 border-y border-[#2e2e2e]">
                    {idea.features.map((feature, featureIndex) => (
                      <div key={feature} className="flex gap-4 border-b border-[#2e2e2e] py-4 last:border-b-0">
                        <span className="mt-0.5 font-mono-d text-[9px] text-[#fa6c34]">0{featureIndex + 1}</span>
                        <p className="text-[12.5px] leading-6 text-[#b1aaa0]">{feature}</p>
                      </div>
                    ))}
                  </div>

                  <div className="relative mt-7 flex flex-wrap gap-2">
                    {idea.signals.map((signal) => (
                      <span key={signal} className="border border-[#383838] px-3 py-2 font-mono-d text-[8px] tracking-[0.1em] text-[#9a938a] transition-colors group-hover:border-[#4a3a32] group-hover:text-[#d6ccba]">
                        {signal}
                      </span>
                    ))}
                  </div>

                  <div className="relative mt-7 flex gap-3 bg-[#171717] p-4">
                    <ShieldCheck size={15} strokeWidth={1.3} className="mt-0.5 shrink-0 text-[#fa6c34]" />
                    <p className="text-[10.5px] leading-5 text-[#635d5a]">{idea.boundary}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid border-t border-[#2e2e2e] bg-[#e9e0d1] text-[#1d1d1d] md:grid-cols-[0.7fr_1.3fr]">
            <div className="border-b border-[#1d1d1d]/15 px-7 py-10 sm:px-10 md:border-b-0 md:border-r md:px-12">
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#1d1d1d]/50">DOABLE BY DESIGN</p>
              <p className="mt-3 text-[24px] font-medium tracking-[-0.025em]">Adapters, not one giant scraper.</p>
            </div>
            <div className="px-7 py-10 sm:px-10 md:px-12">
              <p className="max-w-[820px] text-[13px] leading-7 text-[#1d1d1d]/65">
                Start with onchain state and official APIs. Add approved marketplace integrations,
                opted-in WooCommerce product data, merchant-submitted feeds, and permitted
                Product/Offer metadata. Every adapter reports freshness and can fail independently without
                taking down the rest of ChainScout.
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
                  <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#1d1d1d]/55">RELEASES 02—03 / VAULT PRIVACY MODEL</p>
                </div>
                <h2 className="mt-7 max-w-[610px] text-[44px] font-medium leading-[0.96] tracking-[-0.045em] sm:text-[62px]">
                  Private by design.
                  <br />
                  <span className="font-serif-d font-normal italic text-[#fa6c34]">Useful by default.</span>
                </h2>
                <p className="mt-7 max-w-[520px] text-[14px] leading-7 text-[#1d1d1d]/65">
                  A portfolio should make people feel informed and in control—not watched. The Vault
                  is designed to keep sensitive ownership context on the device while ChainScout works
                  with public asset facts.
                </p>
                <div className="mt-9 inline-flex items-center gap-3 border border-[#1d1d1d]/20 bg-[#e2d9ca] px-4 py-3">
                  <ShieldCheck size={14} className="text-[#fa6c34]" />
                  <span className="font-mono-d text-[8px] leading-4 tracking-[0.1em] text-[#1d1d1d]/60">
                    DESIGN TARGET / EACH PROTECTION MUST PASS ITS RELEASE GATE
                  </span>
                </div>
              </div>
            </div>

            <div className="roadmap-reveal dots-dark bg-[#1d1d1d] p-7 text-[#e9e0d1] sm:p-10 md:p-12">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">YOUR PRIVACY RECEIPT</p>
                  <h3 className="mt-4 text-[27px] font-medium tracking-[-0.025em] sm:text-[34px]">This answer used less than you think.</h3>
                </div>
                <span className="border border-[#383838] px-3 py-2 font-mono-d text-[8px] tracking-[0.12em] text-[#635d5a]">PLANNED UX</span>
              </div>

              <div className="mt-9 overflow-hidden border border-[#383838] bg-[#202020]/90">
                {[
                  {
                    label: "STAYED ON YOUR DEVICE",
                    body: "Wallet groupings, purchase prices, notes, photos, grades, and profit or loss.",
                  },
                  {
                    label: "USED FOR THIS ANSWER",
                    body: "One public contract address, its network, and the question the user approved.",
                  },
                  {
                    label: "PRIVATE MODE DOES NOT SAVE",
                    body: "The portfolio, personal context, or private conversation history.",
                  },
                ].map((row) => (
                  <div key={row.label} className="roadmap-privacy-row group relative border-b border-[#383838] p-5 last:border-b-0 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-[#fa6c34] shadow-[0_0_12px_rgba(250,108,52,0.45)]" />
                      <p className="font-mono-d text-[8px] tracking-[0.14em] text-[#fa6c34]">{row.label}</p>
                    </div>
                    <p className="mt-3 max-w-[570px] pl-5 text-[12.5px] leading-6 text-[#9a938a]">{row.body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-5 border border-[#383838] bg-[#171717] p-4">
                <div className="flex items-center gap-3">
                  <Check size={14} className="text-[#fa6c34]" />
                  <span className="text-[12px] text-[#d6ccba]">No other Vault fields are approved for this request.</span>
                </div>
                <span className="font-mono-d text-[8px] tracking-[0.1em] text-[#635d5a]">CLEAR / REVIEWABLE</span>
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
                  <h3 className="mt-10 text-[23px] font-medium tracking-[-0.025em] text-[#e9e0d1]">{promise.title}</h3>
                  <p className="mt-4 text-[12.5px] leading-6 text-[#9a938a]">{promise.body}</p>
                  <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#fa6c34] transition-all duration-500 group-hover:w-full" />
                </article>
              );
            })}
          </div>

          <div className="roadmap-reveal grid bg-[#fa6c34] text-[#1d1d1d] xl:grid-cols-[1fr_auto]">
            <div className="border-b border-[#1d1d1d]/20 px-7 py-10 sm:px-10 md:px-12 xl:border-b-0 xl:border-r">
              <p className="font-mono-d text-[9px] tracking-[0.17em] text-[#1d1d1d]/55">THE TRUST HOOK</p>
              <p className="mt-4 max-w-[900px] text-[26px] font-medium leading-tight tracking-[-0.025em] sm:text-[34px]">
                ChainScout knows the assets. It does not need to know which ones are yours.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-7 py-8 sm:px-10 xl:max-w-[360px] xl:px-10">
              {["ENCRYPTED VAULT", "NO ACCOUNT", "NO TRACKERS", "NO SEED PHRASES"].map((label) => (
                <span key={label} className="border border-[#1d1d1d]/25 px-3 py-2 font-mono-d text-[8px] tracking-[0.1em]">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="protocol" className="scroll-mt-20 bg-[#fa6c34] text-[#1d1d1d]">
          <div className="grid border-b border-[#1d1d1d]/20 xl:grid-cols-[0.82fr_1.18fr]">
            <div className="border-b border-[#1d1d1d]/20 px-7 py-14 sm:px-10 md:px-12 md:py-20 xl:border-b-0 xl:border-r">
              <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#1d1d1d]/55">ONE LINK. ZERO NEW SPEND.</p>
              <h2 className="mt-5 max-w-[520px] text-[42px] font-medium leading-[0.98] tracking-[-0.04em] sm:text-[56px]">
                The release
                <br />
                <span className="font-serif-d font-normal italic">protocol.</span>
              </h2>
              <p className="mt-7 max-w-[480px] text-[14px] leading-7 text-[#1d1d1d]/70">
                Railway staging follows the branch currently under test. Production stays on main
                until the candidate clears its gate. Provider adapters degrade before a free-tier
                limit can create a bill.
              </p>
            </div>

            <div className="hatch-orange p-7 sm:p-10 md:p-12">
              <div className="grid gap-px overflow-hidden border border-[#1d1d1d]/20 bg-[#1d1d1d]/20 sm:grid-cols-5">
                {RELEASE_LOOP.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="roadmap-protocol-step relative min-h-[190px] bg-[#fa6c34] p-5 sm:min-h-[260px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-d text-[10px] text-[#1d1d1d]/50">0{index + 1}</span>
                        <Icon size={17} strokeWidth={1.4} />
                      </div>
                      <div className="mt-12 sm:mt-24">
                        <p className="text-[18px] font-medium">{step.label}</p>
                        <p className="mt-3 text-[11.5px] leading-5 text-[#1d1d1d]/65">{step.note}</p>
                      </div>
                      {index < RELEASE_LOOP.length - 1 && (
                        <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 sm:block" size={18} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-col justify-between gap-4 border border-[#1d1d1d]/20 bg-[#fa6c34]/80 p-5 font-mono-d text-[10px] sm:flex-row sm:items-center">
                <span className="tracking-[0.14em]">SNAPSHOT RULE</span>
                <span className="text-[#1d1d1d]/65">A TAG NEVER MOVES. STAGING DOES.</span>
              </div>
              <div className="mt-2 flex flex-col justify-between gap-4 border border-[#1d1d1d]/20 bg-[#fa6c34]/80 p-5 font-mono-d text-[10px] sm:flex-row sm:items-center">
                <span className="tracking-[0.14em]">ZERO-SPEND RULE</span>
                <span className="text-[#1d1d1d]/65">CACHE, DEGRADE, THEN DISABLE—NEVER AUTO-UPGRADE.</span>
              </div>
              <div className="mt-2 flex flex-col justify-between gap-4 border border-[#1d1d1d]/20 bg-[#fa6c34]/80 p-5 font-mono-d text-[10px] sm:flex-row sm:items-center">
                <span className="tracking-[0.14em]">IDENTITY RULE</span>
                <span className="text-[#1d1d1d]/65">NO SALES-GATED OR KYB-REQUIRED PROVIDERS.</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-8 px-7 py-10 sm:px-10 md:flex-row md:items-center md:px-12">
            <div>
              <p className="font-mono-d text-[10px] tracking-[0.17em] text-[#1d1d1d]/55">CHAINSCOUT / ROBINHOOD CHAIN</p>
              <p className="mt-2 text-[20px] font-medium">Understand here. Execute in official tools.</p>
            </div>
            <Link
              to="/app"
              className="clip-btn flex min-h-[56px] w-full items-center justify-between bg-[#1d1d1d] px-7 font-mono-d text-[11px] tracking-[0.08em] text-[#e9e0d1] transition-transform hover:-translate-y-0.5 sm:w-[280px]"
            >
              EXPLORE THE CURRENT BUILD
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col items-start justify-between gap-4 border-t border-[#2e2e2e] bg-[#1d1d1d] px-7 py-6 text-[11px] text-[#635d5a] sm:px-10 md:flex-row md:items-center md:px-12">
          <span>© ChainScout, 2026</span>
          <span className="font-mono-d tracking-[0.2em]">BUILD / TEST / TAG / MERGE</span>
          <div className="flex gap-6">
            <Link to="/terms" className="transition-colors hover:text-[#e9e0d1]">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-[#e9e0d1]">Privacy</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
