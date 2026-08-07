import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Bot,
  Check,
  CircleDollarSign,
  Copy,
  Landmark,
  Menu,
  Repeat2,
  ShieldCheck,
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
    id: "approval-guard",
    number: "02",
    branch: "release/02-approval-guard",
    title: "Approval Guard",
    eyebrow: "KNOW EVERY SPENDER",
    summary: "Turn invisible token permissions into a readable map of what each known contract can access.",
    outcome: "See who can spend",
    icon: ShieldCheck,
    capabilities: [
      { kicker: "SPENDER MAP", title: "Read current allowances for canonical Permit2 and router contracts", signal: "ONCHAIN READ", bars: [80, 56, 72, 44, 62, 36] },
      { kicker: "RISK LEVEL", title: "Explain unlimited, bounded, active, and unused token approvals", signal: "RISK LABELED", bars: [30, 38, 52, 66, 76, 88] },
      { kicker: "SOURCE LINK", title: "Show the spender address and evidence in the chain explorer", signal: "VERIFY DIRECTLY", bars: [88, 74, 64, 52, 46, 34] },
    ],
    gate: "Allowances match direct contract reads; spender addresses are versioned; the feature stays read-only.",
    snapshot: "approval-guard-rc1",
  },
  {
    id: "transaction-translator",
    number: "03",
    branch: "release/03-transaction-translator",
    title: "Transaction Translator",
    eyebrow: "FROM HASH TO HUMAN",
    summary: "Turn a dense Robinhood Chain receipt into a sourced explanation of what actually happened.",
    outcome: "Understand a transaction",
    icon: Bot,
    capabilities: [
      { kicker: "VALUE FLOW", title: "Reconcile token movements, native value, approvals, and net wallet change", signal: "RECEIPT MATCHED", bars: [42, 74, 58, 86, 64, 78] },
      { kicker: "CALL TRACE", title: "Name supported contracts and explain the purpose of each call", signal: "SOURCE LINKED", bars: [82, 70, 62, 54, 48, 40] },
      { kicker: "CONFIDENCE", title: "Refuse ambiguous interpretations instead of inventing an answer", signal: "NO GUESSING", bars: [34, 46, 38, 62, 72, 92] },
    ],
    gate: "Receipts, logs, and movements reconcile; unsupported intent is clearly labeled, never guessed.",
    snapshot: "tx-translator-rc1",
  },
  {
    id: "wallet-safety",
    number: "04",
    branch: "release/04-wallet-safety",
    title: "Wallet Safety Snapshot",
    eyebrow: "NO ACCOUNT REQUIRED",
    summary: "Give any address a calm, local-first safety view without turning ChainScout into another profile system.",
    outcome: "Inspect wallet risk",
    icon: WalletCards,
    capabilities: [
      { kicker: "ASSET VIEW", title: "Canonical balances, suspicious-token filters, and readable allocation", signal: "FINALIZED BLOCK", bars: [30, 34, 46, 58, 76, 92] },
      { kicker: "ACTIVITY LENS", title: "Recent transfers, counterparties, failures, and unusual movements", signal: "DECODED LOCALLY", bars: [64, 70, 66, 76, 72, 84] },
      { kicker: "LOCAL WATCHLIST", title: "Save addresses and preferences inside this browser, not a new account", signal: "NO SERVER PROFILE", bars: [26, 52, 38, 70, 48, 86] },
    ],
    gate: "Balances and approvals reconcile at a finalized block; saved addresses stay browser-local.",
    snapshot: "wallet-safety-rc1",
  },
  {
    id: "token-yield-verify",
    number: "05",
    branch: "release/05-token-yield-verify",
    title: "Token & Yield Verify",
    eyebrow: "VERIFY BEFORE TRUSTING",
    summary: "Check the real contract and unpack where a displayed price or yield figure actually comes from.",
    outcome: "Verify tokens and yield",
    icon: Landmark,
    capabilities: [
      { kicker: "TOKEN CHECK", title: "Canonical Stock Token contract, issuer context, and multiplier", signal: "PRIMARY SOURCES", bars: [28, 42, 54, 66, 78, 90] },
      { kicker: "ORACLE HEALTH", title: "Chainlink feed address, timestamp, sequencer state, and staleness", signal: "STALENESS HARD STOP", bars: [84, 74, 64, 56, 48, 42] },
      { kicker: "YIELD SOURCE", title: "Read-only Morpho vault APY, allocations, fees, and variable-yield risks", signal: "ONCHAIN FALLBACK", bars: [40, 52, 46, 68, 58, 88] },
    ],
    gate: "Contracts use primary allowlists; stale data disappears; no price redistribution or transaction CTA.",
    snapshot: "token-yield-rc1",
  },
  {
    id: "replay-lab",
    number: "06",
    branch: "release/06-replay-lab",
    title: "Replay Lab",
    eyebrow: "HISTORY, REBUILT SAFELY",
    summary: "Learn from a supported Uniswap trade, choose a new amount, and preview today's completely fresh route.",
    outcome: "Rebuild safely from history",
    icon: Copy,
    capabilities: [
      { kicker: "INTENT PARSER", title: "Explain the supported historical swap and its observed outcome", signal: "CONFIDENCE SCORED", bars: [32, 48, 64, 58, 76, 92] },
      { kicker: "AMOUNT CONTROL", title: "Require a new user-selected amount before building any preview", signal: "USER DEFINED", bars: [88, 72, 62, 54, 42, 34] },
      { kicker: "FRESH ROUTE", title: "Fetch today's Uniswap quote and continue only in the official app", signal: "NO OLD CALLDATA", bars: [24, 36, 50, 64, 78, 94] },
    ],
    gate: "Historic calldata and transaction parameters never enter the new path; execution stays on Uniswap.",
    snapshot: "replay-lab-rc1",
  },
];

const RELEASE_LOOP = [
  { label: "Build", note: "Develop on the next cumulative branch", icon: Blocks },
  { label: "Deploy", note: "Point the single staging service at it", icon: Zap },
  { label: "Test", note: "Run UX, data, and transaction checks", icon: Bot },
  { label: "Freeze", note: "Tag the approved release candidate", icon: ShieldCheck },
  { label: "Release", note: "Merge to main and move staging ahead", icon: Check },
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

      <nav className="flex flex-1 flex-col justify-center">
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
          <a href="#protocol" className="transition-colors hover:text-[#e9e0d1]">PROTOCOL</a>
        </nav>
        <Link
          to="/login"
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
          <a href="#protocol" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 font-mono-d text-[12px] text-[#9a938a]">
            RELEASE PROTOCOL <ArrowRight size={14} />
          </a>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Link to="/" className="clip-btn-sm flex items-center justify-center border border-[#383838] py-3.5 font-mono-d text-[11px] text-[#d6ccba]">HOME</Link>
            <Link to="/login" className="clip-btn-sm flex items-center justify-center bg-[#fa6c34] py-3.5 font-mono-d text-[11px] font-medium text-[#1d1d1d]">TRY EXPLORER</Link>
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
          "right-[4%] top-[22%]",
          "right-[3%] bottom-[22%]",
          "left-[48%] bottom-[1%]",
          "left-[3%] bottom-[22%]",
          "left-[4%] top-[22%]",
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
                  {[0, 1, 2, 3, 4, 5].map((segment) => (
                    <span key={segment} className={`h-[2px] flex-1 ${segment <= index ? "bg-[#fa6c34]" : "bg-[#383838]"}`} />
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
      description.content = "Explore ChainScout's zero-new-spend roadmap for live Uniswap previews, approval checks, transaction translation, wallet safety, token verification, and replay.";
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
      document.title = "Robinhood Chain AI Explorer: Understand On-Chain Activity in Plain English";
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
                <span className="font-mono-d text-[9px] text-[#635d5a]">R01-R06</span>
              </div>

              <h1 className="roadmap-hero-in roadmap-delay-1 mt-10 max-w-[740px] text-[46px] font-medium leading-[0.98] tracking-[-0.045em] text-[#d6ccba] sm:text-[64px] md:text-[78px] xl:text-[82px]">
                From explorer
                <br />
                <span className="font-serif-d font-normal italic text-[#f0e8da]">to informed action.</span>
              </h1>
              <p className="roadmap-hero-in roadmap-delay-2 mt-8 max-w-[560px] text-[15px] leading-7 text-[#9a938a]">
                Six focused releases help beginners understand, verify, and prepare—then hand final
                execution to the official Uniswap app.
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
              to="/login"
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
