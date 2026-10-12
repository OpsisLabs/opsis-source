import { Search, Database, Sparkles, Link2 } from "lucide-react";
import ChainVisual from "./ChainVisual";

const STEPS = [
  { n: "01", label: "RESOLVE ENTITY", icon: Search },
  { n: "02", label: "FETCH SOURCES", icon: Database },
  { n: "03", label: "BUILD ANSWER", icon: Sparkles },
  { n: "04", label: "CITE & LINK", icon: Link2 },
];

const CELLS = [
  { t: "PLAIN ENGLISH", d: "No logs, selectors, or ABIs required to get a useful answer." },
  { t: "SOURCE-LINKED", d: "Every important claim points back to verifiable chain data." },
  { t: "READ-ONLY", d: "No keys, no transactions, no approvals. Analysis only." },
  { t: "CHAIN-NATIVE", d: "Purpose-built for Robinhood Chain, an EVM Arbitrum L2." },
];

export default function Overview() {
  return (
    <section id="overview" className="border-b border-[#2e2e2e]">
      {/* video frame */}
      <div className="px-8 py-16 md:px-12">
        <div className="ticks relative flex h-[380px] items-center justify-center overflow-hidden border border-[#2e2e2e] bg-[#181818] text-[#635d5a] md:h-[460px]">
          <ChainVisual />
          <div className="pointer-events-none absolute inset-6 border border-[#ffffff08]" />
          <div className="absolute left-8 top-8 z-10 font-mono-d text-[10.5px] tracking-wider text-[#9a938a]">
            ILLUSTRATIVE CHAIN MODEL · 4663
          </div>
          <div className="absolute bottom-8 right-8 z-10 font-mono-d text-[10.5px] tracking-wider text-[#fa6c34]">
            DECORATIVE · NOT LIVE DATA
          </div>
        </div>
      </div>

      {/* overview grid */}
      <div className="grid grid-cols-1 gap-12 px-8 pb-20 md:px-12 xl:grid-cols-[1.05fr_1fr]">
        <div>
          <div className="mb-10 flex items-center gap-3 border-y border-[#2e2e2e] py-3">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#e9e0d1]" />
            <span className="font-mono-d text-[12px] text-[#9a938a]">Overview</span>
            <span className="hatch h-3 flex-1 opacity-60" />
          </div>
          <p className="max-w-[560px] text-[26px] font-medium leading-[1.3] tracking-[-0.02em] text-[#d6ccba] md:text-[30px]">
            Block explorers are powerful, but hard for normal users to read. This product
            explains them.
          </p>
          <p className="mt-8 max-w-[560px] text-[26px] font-medium leading-[1.3] tracking-[-0.02em] text-[#d6ccba] md:text-[30px]">
            Opsis translates raw on-chain data into plain-language answers,
            with source links and citations for anyone who wants to verify the details.
          </p>
        </div>

        {/* workflow card */}
        <div className="ticks relative self-start p-6 text-[#635d5a]">
          <div className="hatch absolute inset-0 opacity-25" />
          <div className="relative">
            <div className="mb-6 flex items-center justify-between font-mono-d text-[12px] text-[#9a938a]">
              <span>Explain this transaction</span>
              <span className="hatch mx-4 h-px flex-1 self-center opacity-70" />
              <span>Answer pipeline</span>
            </div>
            <div className="space-y-0">
              {STEPS.map((s, i) => (
                <div key={s.n}>
                  <div className="flex items-center gap-6 border border-[#2e2e2e] bg-[#1d1d1d] px-6 py-5">
                    <span className="font-mono-d text-[12px] text-[#635d5a]">{s.n}</span>
                    <span className="flex-1 text-center font-mono-d text-[13px] tracking-wider text-[#d6ccba]">
                      {s.label}
                    </span>
                    <s.icon size={16} className="text-[#9a938a]" strokeWidth={1.5} />
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex justify-center py-1.5 text-[#635d5a]">
                      <svg width="12" height="18" viewBox="0 0 12 18" fill="none" stroke="currentColor">
                        <path d="M6 0v14M2 11l4 4 4-4" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* four pillars strip */}
      <div className="grid grid-cols-2 border-t border-[#2e2e2e] xl:grid-cols-4">
        {CELLS.map((c, i) => (
          <div key={c.t} className={`px-8 py-10 md:px-10 ${i > 0 ? "border-l border-[#2e2e2e]" : ""}`}>
            <h4 className="mb-3 text-[14px] font-semibold tracking-wide text-[#e9e0d1]">{c.t}</h4>
            <p className="text-[13.5px] leading-relaxed text-[#9a938a]">{c.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
