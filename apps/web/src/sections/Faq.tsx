import { useState } from "react";
import { Link } from "react-router";
import { Minus, Plus } from "lucide-react";
import { SectionHeader } from "./AssetUniverse";

const QA = [
  { q: "Can I track Pokémon cards and physical collectibles?", a: "Yes. The founder build supports encrypted manual collectible records with identifiers, owner-reported printing and condition, graded-certificate details, exact purchase lots, locally processed photos, and dated source-linked reference values. Catalog-assisted matching is coming soon." },
  { q: "Where do the dashboard charts get their data?", a: "Vault charts use only your encrypted purchase lots, owner-entered dated references, or a public snapshot that you explicitly refreshed. They are not hidden live feeds, appraisals, or price predictions. Every chart includes an exact-value table." },
  { q: "Does my Vault sync to ChainScout servers?", a: "No. Vault records are encrypted in this browser with WebCrypto and stored in IndexedDB. Export an encrypted backup because browser storage can be cleared or evicted, and another origin or device cannot see this Vault automatically." },
  { q: "Do I need to connect a wallet?", a: "No. Private Explorer, Scout Swap, RWA Verify, and the local Vault need no wallet connection. The optional cloud workspace has a separate signature-based sign-in, but it is not required for the private tools." },
  { q: "Does ChainScout trade, buy cards, or move funds?", a: "No. ChainScout is read-only. It can explain public evidence and create an official external handoff where supported, but it never signs, broadcasts, checks out, or stores payment state." },
  { q: "Can AI or provider data be wrong?", a: "Yes. AI can be wrong, indexers can lag, providers can fail, and a manual reference can become stale. ChainScout preserves citations, privacy receipts, anchor details, and explicit incomplete or unavailable states so you can inspect the evidence." },
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" data-home-reveal className="border-b border-[#34312f] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow="QUICK ANSWERS" title={<>The questions<br />people ask first.</>} copy="The short version is here. The full Guide explains workflows; Technical Docs covers architecture, privacy boundaries, providers, and exact API behavior." />
      <div className="mt-12 grid gap-6 xl:grid-cols-[0.68fr_1.32fr]">
        <aside className="h-fit rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
          <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">GO DEEPER</p>
          <p className="mt-4 text-[13px] leading-relaxed text-[#9a938a]">See the current-build matrix, step-by-step workflows, technical internals, privacy constraints, and API contracts.</p>
          <div className="mt-6 grid gap-2">
            <Link to="/guide" className="clip-btn-sm flex min-h-[46px] items-center justify-center bg-[#fa6c34] px-4 font-mono-d text-[9px] font-semibold text-[#1d1d1d]">OPEN FEATURE GUIDE</Link>
            <Link to="/docs" className="clip-btn-sm flex min-h-[46px] items-center justify-center border border-[#4a4642] px-4 font-mono-d text-[9px] text-[#d6ccba]">READ TECHNICAL DOCS</Link>
            <Link to="/faq" className="clip-btn-sm flex min-h-[46px] items-center justify-center border border-[#4a4642] px-4 font-mono-d text-[9px] text-[#d6ccba]">VIEW FULL FAQ</Link>
          </div>
        </aside>
        <div className="space-y-2">
          {QA.map((item, index) => {
            const expanded = open === index;
            return (
              <article key={item.q} className="rounded-[3px] border border-[#3a3633] bg-[#201e1c]">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : index)} className="flex min-h-[64px] w-full items-center justify-between gap-6 px-5 py-4 text-left sm:px-6">
                  <span className="text-[14px] font-medium text-[#e9e0d1]">{item.q}</span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${expanded ? "border-[#fa6c34] bg-[#fa6c34] text-[#1d1d1d]" : "border-[#4a4642] text-[#9a938a]"}`}>{expanded ? <Minus size={13} /> : <Plus size={13} />}</span>
                </button>
                {expanded && <p className="max-w-[760px] border-t border-[#333] px-5 py-5 text-[12.5px] leading-[1.75] text-[#9a938a] sm:px-6">{item.a}</p>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
