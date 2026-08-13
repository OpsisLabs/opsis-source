import { useState } from "react";

const QA = [
  {
    q: "Is this an official Robinhood product?",
    a: "No. ChainScout is an independent tool built to help users understand public Robinhood Chain data.",
  },
  {
    q: "Does the product trade or move funds?",
    a: "No. The product is strictly read-only. It never executes swaps, trades, transfers, approvals, or contract writes.",
  },
  {
    q: "Do I need to connect a wallet?",
    a: "No. Private Explorer, Scout Swap, RWA Verify, and the encrypted local Vault need no connected wallet or account. A wallet signature is used only if you deliberately open the optional saved cloud workspace; it proves address control, moves no funds, and grants no approvals.",
  },
  {
    q: "Can the AI be wrong?",
    a: "Yes. AI can make mistakes and data providers can return incomplete data, which is why every answer includes source links, citations, and uncertainty notes.",
  },
  {
    q: "Can it tell me whether a token is a scam?",
    a: "It highlights risk signals such as unverified contracts, unknown methods, failed transactions, and unusual approvals, but it does not make absolute claims without trusted source evidence.",
  },
  {
    q: "Is this financial advice?",
    a: "No. The product is informational only and does not provide investment, legal, tax, or trading advice.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">FAQ</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>

        <div className="grid grid-cols-1 gap-12 xl:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
              Frequently asked
              <br />
              questions
            </h2>
            <div className="mt-14">
              <p className="font-mono-d text-[12px] leading-5 tracking-wide text-[#1d1d1d]/70">
                STILL HAVE QUESTIONS?
                <br />
                WE'RE HERE TO HELP
              </p>
              <div className="mt-6 border-t border-[#1d1d1d]/15 pt-6">
                <p className="max-w-[320px] text-[13px] leading-relaxed text-[#1d1d1d]/65">
                  Questions about providers, quotas, or self-hosting? Our team can walk you
                  through the setup.
                </p>
                <a
                  href="https://github.com/ChainScoutAi/ChainScout/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="clip-btn-sm mt-6 inline-flex bg-[#e9e0d1] px-5 py-3 font-mono-d text-[11px] font-medium tracking-wide transition-colors hover:bg-[#d6ccba]"
                >
                  OPEN SUPPORT TRACKER
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {QA.map((item, i) => (
              <div key={item.q} className="border border-[#1d1d1d]/15 bg-[#f0e8da]">
                <button
                  onClick={() => setOpen(open === i ? -1 : i)}
                  className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left"
                >
                  <span className="text-[16px] font-medium">{item.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] transition-colors ${
                      open === i ? "bg-[#1d1d1d] text-[#e9e0d1]" : "bg-[#1d1d1d]/10 text-[#1d1d1d]"
                    }`}
                  >
                    {open === i ? "×" : "+"}
                  </span>
                </button>
                {open === i && (
                  <p className="max-w-[560px] px-6 pb-6 text-[13.5px] leading-relaxed text-[#1d1d1d]/70">
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
