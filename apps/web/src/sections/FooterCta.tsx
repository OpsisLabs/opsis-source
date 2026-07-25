import { useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";

function Arcs() {
  return (
    <svg viewBox="0 0 560 300" className="h-full w-full" fill="none" stroke="#d6ccba" strokeWidth="1.2">
      {Array.from({ length: 9 }).map((_, i) => (
        <path
          key={i}
          d={`M${-80 + i * 80} 320 Q ${60 + i * 60} ${-60 - i * 8} ${300 + i * 40} 320`}
          opacity={0.55 + (i % 3) * 0.15}
        />
      ))}
    </svg>
  );
}

export default function FooterCta() {
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  return (
    <>
      {/* coming soon popup */}
      {comingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1d1d]/80 px-4 backdrop-blur-sm"
          onClick={() => setComingSoon(null)}
        >
          <div
            className="clip-panel w-full max-w-[360px] border border-[#383838] bg-[#242424] p-8 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setComingSoon(null)}
              className="ml-auto flex h-7 w-7 items-center justify-center text-[#635d5a] transition-colors hover:text-[#e9e0d1]"
              aria-label="Close"
            >
              <X size={15} />
            </button>
            <div className="mx-auto my-5 h-px w-10 bg-[#fa6c34]" />
            <p className="font-mono-d text-[11px] tracking-wider text-[#635d5a]">{comingSoon.toUpperCase()}</p>
            <p className="mt-3 text-[24px] font-medium tracking-[-0.02em] text-[#e9e0d1]">Coming soon</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#9a938a]">
              This link is not live yet. Check back after the next release.
            </p>
            <button
              onClick={() => setComingSoon(null)}
              className="clip-btn-sm mt-6 w-full bg-[#e9e0d1] py-3 font-mono-d text-[11px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#f0e8da]"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* CTA */}
      <section className="grid grid-cols-1 border-b border-[#2e2e2e] xl:grid-cols-[1.2fr_1fr]">
        <div className="border-r border-[#2e2e2e] px-8 py-20 md:px-12">
          <div className="mb-12 flex max-w-[480px] items-center gap-3 border-y border-[#2e2e2e] py-3">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#e9e0d1]" />
            <span className="font-mono-d text-[12px] text-[#9a938a]">From transaction hash to human answer</span>
            <span className="hatch h-3 flex-1 opacity-60" />
          </div>
          <h2 className="text-[38px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[52px] md:text-[68px]">
            <span className="text-[#f0e8da]">Paste an address.</span>
            <br />
            <span className="text-[#d6ccba]">Ask anything.</span>
          </h2>
          <p className="mt-7 max-w-[460px] text-[15px] leading-relaxed text-[#9a938a]">
            No wallet connection. No signing. Just read-only Robinhood Chain analysis with
            source-linked answers.
          </p>
          <Link
            to="/login"
            className="clip-btn mt-12 flex h-[58px] w-full max-w-[480px] items-center justify-center bg-[#e9e0d1] font-mono-d text-[13px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#f0e8da]"
          >
            START EXPLORING
          </Link>
        </div>

        <div className="grid grid-rows-[1fr_auto]">
          <div className="dots relative overflow-hidden bg-[#1c1c1c]">
            <Arcs />
          </div>
          <div className="grid grid-cols-2 border-t border-[#2e2e2e]">
            <div className="border-r border-[#2e2e2e] p-8">
              <p className="mb-4 font-mono-d text-[11px] tracking-wider text-[#635d5a]">PAGES</p>
              <a href="#hero" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Homepage</a>
              <a href="#capabilities" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Product</a>
              <a href="#comparison" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Comparison</a>
              <a href="#safety" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Safety</a>
              <Link to="/login" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Sign in</Link>
              <a href="#faq" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">FAQ</a>
            </div>
            <div className="p-8">
              <p className="mb-4 font-mono-d text-[11px] tracking-wider text-[#635d5a]">RESOURCES</p>
              {["Blockscout", "Documentation", "X", "Chain status"].map((l) => (
                <button
                  key={l}
                  onClick={() => setComingSoon(l)}
                  className="block w-full border-b border-[#2e2e2e] py-2.5 text-left text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* orange footer band */}
      <footer className="bg-[#fa6c34] text-[#1d1d1d]">
        <div className="grid grid-cols-1 gap-8 border-b border-[#1d1d1d]/20 px-8 py-10 md:grid-cols-3 md:px-12">
          <div>
            <p className="font-mono-d text-[13px] font-semibold tracking-wide">READ-ONLY</p>
            <p className="mt-1 text-[13px] text-[#1d1d1d]/70">Analysis mode</p>
          </div>
          <div>
            <p className="font-mono-d text-[13px] font-semibold tracking-wide">4,208,551</p>
            <p className="mt-1 text-[13px] text-[#1d1d1d]/70">Answers cited</p>
          </div>
          <p className="max-w-[420px] font-mono-d text-[12px] leading-relaxed text-[#1d1d1d]/80 md:justify-self-end">
            Robinhood Chain AI Explorer is a read-only AI assistant for Robinhood Chain. It
            explains wallets, transactions, tokens, and contracts in plain English, with
            citations. Informational only, not financial advice.
          </p>
        </div>

        <div className="hatch-orange relative overflow-hidden px-8 md:px-12">
          <svg viewBox="0 0 1200 300" className="block w-full" preserveAspectRatio="xMidYMid meet">
            <text
              x="600"
              y="245"
              textAnchor="middle"
              textLength="1140"
              lengthAdjust="spacingAndGlyphs"
              fill="#1d1d1d"
              fontFamily="Playfair Display, Instrument Serif, Georgia, serif"
              fontWeight="600"
              fontSize="290"
            >
              Explorer
            </text>
          </svg>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[#1d1d1d]/20 bg-[#1d1d1d] px-8 py-5 text-[12px] text-[#9a938a] md:flex-row md:px-12">
          <span>© RH Chain AI Explorer, 2026</span>
          <span className="font-mono-d tracking-widest text-[#635d5a]">····················</span>
          <span>Informational only. Not financial advice.</span>
          <span className="flex gap-8">
            <Link to="/terms" className="transition-colors hover:text-[#e9e0d1]">Terms of use</Link>
            <Link to="/privacy" className="transition-colors hover:text-[#e9e0d1]">Privacy Policy</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
