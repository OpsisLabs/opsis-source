import { Check, Minus, ShieldCheck, X } from "lucide-react";
import { SectionHeader } from "./AssetUniverse";

const IS = [
  "An encrypted browser-local asset Vault",
  "A read-only Robinhood Chain explorer assistant",
  "A source-linked public evidence workspace",
  "An exact-decimal lot and owner-context tracker",
];

const IS_NOT = [
  "A custodian, wallet, exchange, or marketplace",
  "A live price oracle or professional appraisal",
  "A guarantee of authenticity, ownership, or completeness",
  "A tool that asks for seed phrases or private keys",
  "Anything that signs or broadcasts transactions",
];

export default function Safety() {
  return (
    <section id="safety" data-home-reveal className="border-b border-[#34312f] bg-[#191817] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow="BUILT-IN BOUNDARIES" title={<>Useful context.<br /><span className="text-[#7fb069]">Honest limits.</span></>} copy="Public facts, provider observations, and owner-entered records are labeled separately. A chart never upgrades a manual value into a market price." />
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <BoundaryCard title="WHAT CHAINSCOUT IS" items={IS} icon="check" />
        <BoundaryCard title="WHAT CHAINSCOUT IS NOT" items={IS_NOT} icon="x" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SafetySignal icon={<ShieldCheck size={16} />} title="READ-ONLY" copy="ChainScout does not sign, submit, approve, buy, sell, or move funds." />
        <SafetySignal icon={<Minus size={16} />} title="NO FALSE PRECISION" copy="Unknown, stale, partial, manual, and unavailable states remain visible." />
        <SafetySignal icon={<Check size={16} />} title="INSPECTABLE" copy="Exact values, source links, coverage notes, and encrypted receipts stay reviewable." />
      </div>
    </section>
  );
}

function BoundaryCard({ title, items, icon }: { title: string; items: string[]; icon: "check" | "x" }) {
  return (
    <article className="rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
      <p className={`font-mono-d text-[9px] tracking-[0.14em] ${icon === "check" ? "text-[#7fb069]" : "text-[#e0a96d]"}`}>{title}</p>
      <div className="mt-6">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 border-t border-[#333] py-4 first:border-t-0 first:pt-0">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${icon === "check" ? "border-[#7fb069]/40 text-[#7fb069]" : "border-[#e0a96d]/40 text-[#e0a96d]"}`}>{icon === "check" ? <Check size={10} /> : <X size={10} />}</span>
            <span className="text-[13px] leading-relaxed text-[#b7aea2]">{item}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SafetySignal({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded-[4px] border border-[#35312e] bg-[#1d1b1a] p-5 sm:p-6">
      <div className="flex items-center gap-3 font-mono-d text-[9px] tracking-[0.13em] text-[#fa6c34]">{icon}{title}</div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-[#9a938a]">{copy}</p>
    </div>
  );
}
