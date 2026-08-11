import { useState } from "react";
import { Link } from "react-router";

const LAYERS = [
  {
    n: "01",
    title: "Transaction Explanation",
    items: ["Paste any tx hash, get a readable breakdown.", "Who sent it, what moved, what was called.", "Success, failure, gas: all cited."],
  },
  {
    n: "02",
    title: "Wallet Summary",
    items: ["Balances and recent activity in plain English.", "Token transfers, counterparties, failures.", "Unusual or high-value movements flagged."],
  },
  {
    n: "03",
    title: "Token & Contract Review",
    items: ["Metadata, supply, and verification status.", "Unknown methods and proxy hints surfaced.", "Risk notes that stay evidence-based."],
  },
  {
    n: "04",
    title: "Approval Review",
    items: ["Approval targets found in the fetched activity window.", "Current allowances and NFT access checked at a finalized block.", "Large or unlimited access highlighted without claiming complete coverage."],
  },
];

/** Stacked geometric diagram with callout labels */
function Diagram() {
  const label = (x1: number, y1: number, x2: number, text: string) => (
    <g stroke="#d6ccba" strokeWidth="1" opacity="0.9">
      <line x1={x1} y1={y1} x2={x2} y2={y1} />
      <circle cx={x1} cy={y1} r="2.6" fill="#e9e0d1" stroke="none" />
      <circle cx={x2} cy={y1} r="2.6" fill="#e9e0d1" stroke="none" />
      <text x={x2 + 8} y={y1 + 3.5} fill="#d6ccba" stroke="none" fontSize="10" fontFamily="IBM Plex Mono, monospace" letterSpacing="1">
        {text}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 520 700" className="h-full w-full" fill="none">
      {/* axis */}
      <line x1="260" y1="30" x2="260" y2="670" stroke="#635d5a" strokeWidth="1" strokeDasharray="2 5" opacity="0.7" />
      <circle cx="260" cy="34" r="3" fill="#e9e0d1" />
      <g stroke="#d6ccba" strokeWidth="1.1">
        {/* top diamond */}
        <path d="M260 60 380 130 260 200 140 130Z" opacity="0.95" />
        <path d="M260 60 380 130 260 200 140 130Z" fill="#2e2e2e" fillOpacity="0.55" stroke="none" />
        <path d="M140 130 260 200 380 130" opacity="0.6" />
        <path d="M260 200 260 250" strokeDasharray="3 4" opacity="0.6" />
        {/* wide diamond */}
        <path d="M260 210 440 320 260 430 80 320Z" opacity="0.55" />
        {/* circle */}
        <circle cx="260" cy="330" r="105" opacity="0.9" />
        <circle cx="260" cy="330" r="105" fill="#262626" fillOpacity="0.5" stroke="none" />
        <ellipse cx="260" cy="330" rx="105" ry="34" opacity="0.5" />
        <circle cx="260" cy="330" r="16" fill="#424242" stroke="#d6ccba" />
        {/* hex block */}
        <path d="M170 460 260 405 350 460 350 540 260 595 170 540Z" opacity="0.9" />
        <path d="M170 460 260 405 350 460 350 540 260 595 170 540Z" fill="#2e2e2e" fillOpacity="0.55" stroke="none" />
        <path d="M170 460 260 515 350 460M260 515 260 595" opacity="0.7" />
        <ellipse cx="260" cy="458" rx="26" ry="10" opacity="0.85" />
        {/* base squares */}
        <path d="M180 620 260 575 340 620 260 665Z" opacity="0.85" />
        <path d="M180 620 260 575 340 620 260 665Z" fill="#2e2e2e" fillOpacity="0.6" stroke="none" />
        <path d="M205 640 260 610 315 640 260 670Z" opacity="0.6" />
        <path d="M160 655 260 600 360 655" opacity="0.4" />
      </g>
      {label(380, 130, 430, "WALLETS")}
      {label(365, 330, 430, "TRANSACTIONS")}
      {label(350, 460, 430, "TOKENS")}
      {label(340, 620, 430, "CONTRACTS")}
    </svg>
  );
}

export default function Hero() {
  const [open, setOpen] = useState(0);
  return (
    <section id="hero" className="grid grid-cols-1 border-b border-[#2e2e2e] xl:grid-cols-[1fr_1fr]">
      {/* left */}
      <div className="border-r border-[#2e2e2e] px-8 pb-14 pt-28 md:px-12">
        <div className="mb-12 flex items-center gap-3 border-y border-[#2e2e2e] py-3">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#e9e0d1]" />
          <span className="font-mono-d text-[12px] text-[#9a938a]">Read-only AI explorer · Chain ID 4663</span>
          <span className="hatch h-3 flex-1 opacity-60" />
        </div>

        <h1 className="text-[40px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[50px] md:text-[68px]">
          <span className="text-[#d6ccba]">Understand</span>
          <br />
          <span className="text-[#d6ccba]">Robinhood Chain</span>
          <br />
          <span className="text-[#f0e8da]">in plain English</span>
        </h1>

        <p className="mt-7 max-w-[480px] text-[15px] leading-relaxed text-[#9a938a]">
          Paste a wallet, transaction, token, or contract for a sourced explanation—or build one
          encrypted local view of your holdings, purchase lots, activity, and reference value.
        </p>

        <div className="mt-10 grid w-full max-w-[480px] gap-3 sm:grid-cols-2">
          <Link
            to="/vault"
            className="clip-btn flex h-[58px] items-center justify-center bg-[#e9e0d1] font-mono-d text-[12px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#f0e8da]"
          >
            OPEN MY PORTFOLIO
          </Link>
          <Link
            to="/app"
            className="clip-btn flex h-[58px] items-center justify-center border border-[#4a4642] font-mono-d text-[12px] font-medium tracking-wide text-[#d6ccba] transition-colors hover:border-[#7f7972]"
          >
            TRY THE EXPLORER
          </Link>
        </div>

        {/* use-case accordion */}
        <div className="mt-16 max-w-[480px]">
          {LAYERS.map((l, i) => (
            <div key={l.n} className="border-t border-[#2e2e2e] last:border-b">
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="flex w-full items-center gap-4 py-5 text-left"
              >
                <span className="font-mono-d text-[12px] text-[#635d5a]">{l.n}</span>
                <span className="flex-1 text-[15px] text-[#e9e0d1]">{l.title}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  className={`text-[#9a938a] transition-transform ${open === i ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>
              {open === i && (
                <ul className="pb-6 pl-9">
                  {l.items.map((it) => (
                    <li key={it} className="flex items-start gap-3 py-1.5 text-[13.5px] text-[#9a938a]">
                      <span className="mt-px font-mono-d text-[13px] text-[#635d5a]">+</span>
                      {it}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* right diagram */}
      <div className="dots relative hidden items-center justify-center overflow-hidden bg-[#1c1c1c] py-16 xl:flex">
        <div className="h-[720px] w-full max-w-[560px]">
          <Diagram />
        </div>
      </div>
    </section>
  );
}
