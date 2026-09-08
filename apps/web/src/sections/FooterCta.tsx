import { Link } from "react-router";

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
  return (
    <>
      {/* CTA */}
      <section className="grid grid-cols-1 border-b border-[#2e2e2e] xl:grid-cols-[1.2fr_1fr]">
        <div className="border-r border-[#2e2e2e] px-8 py-20 md:px-12">
          <div className="mb-12 flex max-w-[480px] items-center gap-3 border-y border-[#2e2e2e] py-3">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#e9e0d1]" />
            <span className="font-mono-d text-[12px] text-[#9a938a]">From scattered assets to one private record</span>
            <span className="hatch h-3 flex-1 opacity-60" />
          </div>
          <h2 className="text-[38px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[52px] md:text-[68px]">
            <span className="text-[#f0e8da]">Track what matters.</span>
            <br />
            <span className="text-[#d6ccba]">Keep the context.</span>
          </h2>
          <p className="mt-7 max-w-[460px] text-[15px] leading-relaxed text-[#9a938a]">
            Start with an encrypted local record for crypto, an NFT, a tokenized
            asset, a Pokémon card, or anything else you own. Add public evidence
            only when you explicitly ask for it.
          </p>
          <Link
            to="/vault?view=assets"
            className="clip-btn mt-12 flex h-[58px] w-full max-w-[480px] items-center justify-center bg-[#fa6c34] font-mono-d text-[13px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7d48]"
          >
            OPEN PRIVATE VAULT
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
              <a href="#track" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">What to track</a>
              <a href="#workflow" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">How it works</a>
              <a href="#availability" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Availability</a>
              <a href="#safety" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Safety</a>
              <Link to="/roadmap" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Roadmap</Link>
              <Link to="/app#local-history" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Encrypted local chats</Link>
              <a href="#faq" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">FAQ</a>
            </div>
            <div className="p-8">
              <p className="mb-4 font-mono-d text-[11px] tracking-wider text-[#635d5a]">RESOURCES</p>
              <Link to="/docs" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Technical docs</Link>
              <Link to="/faq" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Full FAQ</Link>
              <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Robinhood Blockscout</a>
              <a href="https://github.com/ChainScoutAi/chainscout-source" target="_blank" rel="noreferrer" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Source code</a>
              <a href="https://github.com/ChainScoutAi/chainscout-source/issues" target="_blank" rel="noreferrer" className="block border-b border-[#2e2e2e] py-2.5 text-[13.5px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]">Support tracker</a>
            </div>
          </div>
        </div>
      </section>

      {/* orange footer band */}
      <footer className="bg-[#fa6c34] text-[#1d1d1d]">
        <div className="grid grid-cols-1 gap-8 border-b border-[#1d1d1d]/20 px-8 py-10 md:grid-cols-3 md:px-12">
          <div>
            <p className="font-mono-d text-[13px] font-semibold tracking-wide">READ-ONLY</p>
            <p className="mt-1 text-[13px] text-[#1d1d1d]">Analysis mode</p>
          </div>
          <div>
            <p className="font-mono-d text-[13px] font-semibold tracking-wide">SOURCE-LINKED</p>
            <p className="mt-1 text-[13px] text-[#1d1d1d]">Evidence stays inspectable</p>
          </div>
          <p className="max-w-[420px] font-mono-d text-[12px] leading-relaxed text-[#1d1d1d] md:justify-self-end">
            ChainScout combines an encrypted browser-local asset Vault with
            read-only, source-linked Robinhood Chain tools. Informational only,
            not financial advice or an appraisal.
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
              Vault
            </text>
          </svg>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[#1d1d1d]/20 bg-[#1d1d1d] px-8 py-5 text-[12px] text-[#9a938a] md:flex-row md:px-12">
          <span>© ChainScout, 2026</span>
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
