import { CheckCircle2, Clock, ExternalLink } from "lucide-react";

const COLS = [
  { t: "RETRIEVE", d: "Pull real data from Blockscout, Alchemy, and cache layers." },
  { t: "NORMALIZE", d: "Standardize transactions, transfers, logs, and approvals." },
  { t: "EXPLAIN", d: "Convert technical records into plain-English answers." },
  { t: "CITE", d: "Attach source links and evidence IDs to every claim." },
];

const BULLETS = [
  { t: "5 incoming token transfers found", p: "src_1" },
  { t: "2 contract calls succeeded", p: "src_2" },
  { t: "1 approval may deserve review", p: "src_7" },
];

const SOURCES = [
  { id: "src_1", t: "Blockscout address transactions", s: "blockscout", c: "#7cc4f8" },
  { id: "src_2", t: "Alchemy transaction receipts", s: "alchemy", c: "#7fb069" },
  { id: "src_3", t: "Blockscout token transfers", s: "blockscout", c: "#7cc4f8" },
  { id: "src_7", t: "ERC-20 approval event logs", s: "alchemy", c: "#e0738a" },
  { id: "src_9", t: "Contract verification status", s: "blockscout", c: "#7cc4f8" },
];

export default function Capabilities() {
  return (
    <section id="capabilities" className="px-4 py-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        {/* header */}
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">How it works</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Retrieve, normalize,
            <br />
            explain, cite.
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            A generic chatbot may guess. The Explorer retrieves real on-chain data first, then
            uses AI to explain it, grounded in citations.
          </p>
        </div>

        {/* answering monitor mock */}
        <div className="hatch-dark ticks relative p-3 text-[#1d1d1d]/60">
          <div className="overflow-x-auto bg-[#1d1d1d] p-5 md:p-8">
            {/* browser bar */}
            <div className="mb-6 flex items-center justify-between border border-[#2e2e2e] bg-[#242424] px-4 py-2.5">
              <span className="font-mono-d text-[11px] text-[#635d5a]">explorer://chain/4663</span>
              <span className="font-mono-d text-[11px] text-[#635d5a]">Session: wallet review</span>
              <span className="flex flex-col gap-[3px]">
                <i className="block h-px w-4 bg-[#635d5a]" />
                <i className="block h-px w-4 bg-[#635d5a]" />
                <i className="block h-px w-4 bg-[#635d5a]" />
              </span>
            </div>
            <h3 className="mb-5 text-[20px] font-medium text-[#e9e0d1]">Answering monitor</h3>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
              {/* left panel */}
              <div className="space-y-4">
                <div className="border border-[#2e2e2e] bg-[#242424] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[15px] text-[#e9e0d1]">What did this wallet do today?</p>
                    <span className="font-mono-d text-[10.5px] text-[#635d5a]">0x7f3a…9c2e</span>
                  </div>
                  <div className="mb-2 flex items-center justify-between font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">
                    <span>SUMMARY BULLETS</span>
                    <span>⌄</span>
                  </div>
                  {BULLETS.map((a) => (
                    <div key={a.t} className="flex items-center gap-3 border-t border-[#2e2e2e] py-2.5 text-[12.5px] text-[#9a938a]">
                      <CheckCircle2 size={13} className="text-[#635d5a]" />
                      <span className="flex-1">{a.t}</span>
                      <span className="font-mono-d text-[10.5px] text-[#7fb069]">{a.p}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-[#2e2e2e] bg-[#1c1c1c] p-5 font-mono-d text-[11px] leading-relaxed">
                  <span className="text-[#e0738a]">export const</span> <span className="text-[#9a938a]">answer = {"{"}</span>
                  <br />
                  <span className="text-[#7fb069]">&nbsp;&nbsp;"explain --entity 0x7f3a…9c2e --window today --cite blockscout,alchemy",</span>
                  <br />
                  <span className="text-[#7fb069]">&nbsp;&nbsp;"risk-notes --heuristics on --language plain --no-verdicts",</span>
                  <br />
                  <span className="text-[#9a938a]">{"}"};</span>
                </div>
              </div>

              {/* right panel */}
              <div className="flex flex-col gap-4">
                <div className="flex-1 border border-[#2e2e2e] bg-[#242424] p-4">
                  <div className="mb-1 flex items-center justify-between font-mono-d text-[10px] tracking-wider text-[#635d5a]">
                    <span>SOURCE</span>
                    <span>CITATIONS</span>
                    <span>PROVIDER</span>
                  </div>
                  {SOURCES.map((t) => (
                    <div key={t.id} className="flex items-center gap-4 border-b border-[#2e2e2e] py-2.5 text-[12px] last:border-0">
                      <span className="font-mono-d text-[10.5px] text-[#635d5a]">{t.id}</span>
                      <span className="flex flex-1 items-center gap-1.5 truncate text-[#9a938a]">
                        {t.t}
                        <ExternalLink size={10} className="shrink-0 text-[#635d5a]" />
                      </span>
                      <span className="font-mono-d text-[10.5px]" style={{ color: t.c }}>
                        {t.s}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 border border-[#2e2e2e] bg-[#242424] px-5 py-4">
                  <Clock size={15} className="text-[#635d5a]" />
                  <span className="flex-1 text-[13px] text-[#9a938a]">Median answer time</span>
                  <span className="font-num text-[15px] text-[#e9e0d1]">3.2s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* four columns */}
        <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-8 xl:grid-cols-4">
          {COLS.map((c) => (
            <div key={c.t}>
              <h4 className="mb-2.5 text-[15px] font-semibold tracking-wide">{c.t}</h4>
              <p className="text-[13.5px] leading-relaxed text-[#1d1d1d]/70">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
