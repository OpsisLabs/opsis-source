import { ArrowRight, BookOpenText, Check, LockKeyhole, ShieldX } from "lucide-react";
import { Link } from "react-router";
import { PRODUCT_FEATURES } from "../product/features";

export default function FeatureGuide() {
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label="ChainScout home">
          <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}>
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">CHAINSCOUT</span>
        </Link>
        <div className="flex items-center gap-2 font-mono-d text-[10px] tracking-[0.14em] text-[#fa6c34]"><BookOpenText size={14} /> FEATURE GUIDE</div>
        <Link to="/roadmap" className="font-mono-d text-[9px] tracking-wider text-[#7f7972] hover:text-[#e9e0d1] sm:text-[10px]">ROADMAP →</Link>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="font-mono-d text-[10px] tracking-[0.2em] text-[#fa6c34]">ONE PRODUCT · SEVEN CLEAR TOOLS</p>
            <h1 className="mt-5 max-w-[780px] text-[46px] font-medium leading-[0.98] tracking-[-0.045em] text-[#f0e8da] sm:text-[68px]">
              Know where to go.<br /><span className="text-[#d6ccba]">Know what stays private.</span>
            </h1>
            <p className="mt-6 max-w-[720px] text-[15px] leading-relaxed text-[#9a938a]">
              ChainScout separates fast public-chain explanations from your encrypted local asset workspace. This guide explains what each screen does, what leaves your browser, and what the feature deliberately cannot do.
            </p>
          </div>
          <div className="border-l border-[#383838] pl-6">
            <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">THE SIMPLE RULE</p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#d6ccba]">
              Use <span className="text-[#fa6c34]">Explore</span> for a temporary public lookup. Use the <span className="text-[#fa6c34]">Vault</span> when you want to save private ownership, costs, notes, or photos locally.
            </p>
          </div>
        </section>

        <nav className="mt-10 flex flex-wrap gap-2" aria-label="Feature guide index">
          {PRODUCT_FEATURES.map((feature, index) => (
            <a key={feature.id} href={`#${feature.id}`} className="border border-[#383838] bg-[#242424] px-3 py-2 font-mono-d text-[9px] tracking-[0.08em] text-[#9a938a] hover:border-[#fa6c34]/50 hover:text-[#e9e0d1]">
              {String(index + 1).padStart(2, "0")} · {feature.shortLabel.toUpperCase()}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-6">
          {PRODUCT_FEATURES.map((feature, index) => (
            <article id={feature.id} key={feature.id} className="scroll-mt-24 border border-[#383838] bg-[#222222]">
              <div className="grid lg:grid-cols-[0.36fr_0.64fr]">
                <div className="border-b border-[#383838] p-6 lg:border-b-0 lg:border-r sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-d text-[10px] tracking-[0.18em] text-[#fa6c34]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-mono-d text-[8px] tracking-[0.14em] text-[#635d5a]">{feature.eyebrow}</span>
                  </div>
                  <h2 className="mt-7 text-[29px] font-medium tracking-[-0.035em] text-[#f0e8da]">{feature.label}</h2>
                  <p className="mt-4 text-[13.5px] leading-relaxed text-[#9a938a]">{feature.summary}</p>
                  <Link to={feature.path} className="clip-btn-sm mt-7 inline-flex items-center gap-2 bg-[#fa6c34] px-5 py-3 font-mono-d text-[10px] font-semibold tracking-[0.1em] text-[#1d1d1d] hover:bg-[#ff7038]">
                    OPEN FEATURE <ArrowRight size={13} />
                  </Link>
                </div>
                <div className="grid gap-px bg-[#383838] sm:grid-cols-2">
                  <div className="bg-[#1f1f1f] p-6">
                    <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.15em] text-[#7fb069]"><Check size={12} /> BEST FOR</p>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#b7aea2]">{feature.bestFor}</p>
                  </div>
                  <div className="bg-[#1f1f1f] p-6">
                    <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.15em] text-[#7fb069]"><LockKeyhole size={12} /> PRIVACY</p>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#b7aea2]">{feature.privacy}</p>
                  </div>
                  <div className="bg-[#1f1f1f] p-6 sm:col-span-2">
                    <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.15em] text-[#e0738a]"><ShieldX size={12} /> DOES NOT DO</p>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-[#b7aea2]">{feature.boundary}</p>
                  </div>
                  <div className="bg-[#1f1f1f] p-6 sm:col-span-2">
                    <p className="font-mono-d text-[9px] tracking-[0.15em] text-[#635d5a]">HOW TO USE IT</p>
                    <ol className="mt-4 grid gap-3 md:grid-cols-3">
                      {feature.steps.map((step, stepIndex) => (
                        <li key={step} className="flex gap-3 text-[12px] leading-relaxed text-[#9a938a]">
                          <span className="font-mono-d text-[9px] text-[#fa6c34]">{stepIndex + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-8 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2">
          <div className="bg-[#242424] p-6 sm:p-8">
            <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">OPTIONAL SAVED CLOUD</p>
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">Saved research is separate.</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#9a938a]">Wallet sign-in is optional and belongs only to the legacy saved-research workspace. The encrypted Vault does not need a wallet, account, or signature.</p>
            <Link to="/login" className="mt-5 inline-flex font-mono-d text-[10px] tracking-wider text-[#fa6c34]">OPEN SAVED RESEARCH →</Link>
          </div>
          <div className="bg-[#242424] p-6 sm:p-8">
            <p className="font-mono-d text-[9px] tracking-[0.16em] text-[#635d5a]">NEED THE RELEASE ORDER?</p>
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">See what ships next.</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#9a938a]">The roadmap separates features available in this build from later updates, so current capability is never confused with planned work.</p>
            <Link to="/roadmap" className="mt-5 inline-flex font-mono-d text-[10px] tracking-wider text-[#fa6c34]">OPEN ROADMAP →</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
