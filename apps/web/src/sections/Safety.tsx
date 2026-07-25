const IS = [
  "A blockchain explorer assistant for Robinhood Chain",
  "A natural-language chat interface for on-chain data",
  "Source-linked explanations with risk notes",
  "A read-only intelligence product",
];

const IS_NOT = [
  "A trading bot, wallet, or swap app",
  "A financial, legal, or tax advisor",
  "A scam detector making absolute claims",
  "A tool that asks for seed phrases or private keys",
  "Anything that signs or submits transactions",
];

const CHIPS = [
  "Informational only",
  "Read-only analysis",
  "Source-linked explanations",
  "Risk notes are evidence-based",
  "No trading recommendations",
];

export default function Safety() {
  return (
    <section id="safety" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Safety</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Read-only by design.
            <br />
            Careful by default.
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            The assistant flags approvals, unknown contracts, and failed transactions, without
            pretending to know more than the data supports.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* what it is */}
          <div className="border border-[#1d1d1d]/15 bg-[#f0e8da] p-8">
            <p className="mb-6 font-mono-d text-[12px] tracking-wider text-[#1d1d1d]/60">WHAT IT IS</p>
            {IS.map((t) => (
              <div key={t} className="flex items-start gap-3.5 border-t border-[#1d1d1d]/10 py-4 first:border-t-0 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1d1d1d]">
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#e9e0d1" strokeWidth="1.6">
                    <path d="M1.5 5.5 4 8l4.5-6" />
                  </svg>
                </span>
                <span className="text-[14px] leading-relaxed text-[#1d1d1d]/80">{t}</span>
              </div>
            ))}
          </div>

          {/* what it is not */}
          <div className="border border-[#1d1d1d]/15 bg-[#f0e8da] p-8">
            <p className="mb-6 font-mono-d text-[12px] tracking-wider text-[#1d1d1d]/60">WHAT IT IS NOT</p>
            {IS_NOT.map((t) => (
              <div key={t} className="flex items-start gap-3.5 border-t border-[#1d1d1d]/10 py-4 first:border-t-0 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#1d1d1d]/30 text-[11px] text-[#1d1d1d]/60">
                  ×
                </span>
                <span className="text-[14px] leading-relaxed text-[#1d1d1d]/80">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* compliance chips */}
        <div className="mt-6 flex flex-wrap gap-2 border border-[#1d1d1d]/15 bg-[#f0e8da] p-6">
          {CHIPS.map((c) => (
            <span key={c} className="border border-[#1d1d1d]/20 px-3.5 py-2 font-mono-d text-[10.5px] tracking-wide text-[#1d1d1d]/65">
              {c}
            </span>
          ))}
          <span className="ml-auto self-center font-mono-d text-[10.5px] tracking-wide text-[#1d1d1d]/45">
            RISK LANGUAGE RULES ENFORCED IN EVERY ANSWER
          </span>
        </div>
      </div>
    </section>
  );
}
