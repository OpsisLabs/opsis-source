const ROWS = [
  {
    vs: "Normal explorer",
    them: "Shows raw data (logs, method selectors, internal transactions) and leaves the decoding to you.",
    us: "Explains what the data means, in plain English, with source links for every claim.",
  },
  {
    vs: "Generic AI chatbot",
    them: "May guess from training data and invent facts that were never on-chain.",
    us: "Retrieves real Robinhood Chain data first, then explains it, grounded in citations.",
  },
  {
    vs: "Solscan-style tools",
    them: "A familiar search-and-inspect mental model, built for Solana's data model.",
    us: "The same search-and-understand experience, purpose-built for an EVM Arbitrum L2, with AI built in from the start.",
  },
  {
    vs: "Trading tools",
    them: "Focused on execution, signals, and moving funds.",
    us: "Focused on understanding: improving confidence and reducing confusion. Read-only, always.",
  },
];

export default function Comparison() {
  return (
    <section id="comparison" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Comparison</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Explorers show data.
            <br />
            We explain it.
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            The easiest way to understand what happened on Robinhood Chain, measured against
            the tools people use today.
          </p>
        </div>

        <div className="overflow-x-auto border border-[#1d1d1d]/15 bg-[#f0e8da]">
          {/* header row */}
          <div className="hidden grid-cols-[1fr_64px_1.3fr] border-b border-[#1d1d1d]/15 md:grid">
            <div className="px-7 py-4 font-mono-d text-[11px] tracking-wider text-[#1d1d1d]/50">COMPARED WITH</div>
            <div />
            <div className="border-l border-[#1d1d1d]/15 px-7 py-4 font-mono-d text-[11px] tracking-wider text-[#1d1d1d]">
              CHAINSCOUT
            </div>
          </div>
          {ROWS.map((r, i) => (
            <div key={r.vs} className={`grid grid-cols-1 md:grid-cols-[1fr_64px_1.3fr] ${i > 0 ? "border-t border-[#1d1d1d]/10" : ""}`}>
              <div className="px-7 py-7">
                <p className="font-mono-d text-[12px] tracking-wider text-[#1d1d1d]/50">{r.vs.toUpperCase()}</p>
                <p className="mt-3 max-w-[380px] text-[13.5px] leading-relaxed text-[#1d1d1d]/65">{r.them}</p>
              </div>
              <div className="hidden items-center justify-center md:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#1d1d1d]/25 font-mono-d text-[10px] text-[#1d1d1d]/60">
                  VS
                </span>
              </div>
              <div className="border-t border-[#1d1d1d]/10 bg-[#1d1d1d]/[0.045] px-7 py-7 md:border-l md:border-t-0">
                <p className="max-w-[460px] text-[14px] font-medium leading-relaxed text-[#1d1d1d]">{r.us}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 font-mono-d text-[11px] tracking-wide text-[#1d1d1d]/50">
          * INFORMATIONAL ONLY. THE EXPLORER DOES NOT EXECUTE TRADES, SWAPS, OR TRANSFERS.
        </p>
      </div>
    </section>
  );
}
