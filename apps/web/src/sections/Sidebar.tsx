import { useEffect, useState } from "react";

const INDEX = [
  { n: "01", label: "What to track", id: "track" },
  { n: "02", label: "How it works", id: "workflow" },
  { n: "03", label: "Availability", id: "availability" },
  { n: "04", label: "Safety", id: "safety" },
  { n: "05", label: "FAQ", id: "faq" },
];

function LogoMark({ className = "w-8 h-8" }: { className?: string }) {
  return <img src="/logo.svg" alt="ChainScout" className={className} />;
}

export default function Sidebar() {
  const [mode, setMode] = useState<"hero" | "gap" | "index" | "end">("hero");
  const [active, setActive] = useState("");

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const doc = document.documentElement.scrollHeight - window.innerHeight;
      const hero = document.getElementById("hero");
      const heroBottom = hero ? hero.offsetTop + hero.offsetHeight : 900;
      const cap = document.getElementById("track");
      const capTop = cap ? cap.offsetTop : 2200;

      if (y > doc - 1400) setMode("end");
      else if (y > capTop - window.innerHeight * 0.6) setMode("index");
      else if (y > heroBottom + 200) setMode("gap");
      else setMode("hero");

      let cur = "";
      for (const s of INDEX) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) cur = s.id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[220px] flex-col border-r border-[#2e2e2e] bg-[#1d1d1d] lg:flex">
      {/* logo block */}
      <a href="#hero" className="relative block h-[74px] shrink-0 bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)" }}>
        <span className="absolute inset-0 flex items-center justify-center">
          <LogoMark />
        </span>
      </a>

      {mode === "hero" && (
        <div className="flex flex-1 flex-col justify-end">
          <div className="px-6 pb-6 font-mono-d text-[12px] leading-5 text-[#9a938a]">
            One place for<br />assets + context:
          </div>
          {["blockscout", "robinhood", "local-vault"].map((k) => (
            <div key={k} className="flex h-[120px] items-center justify-center border-t border-[#2e2e2e]">
              {k === "blockscout" && (
                <svg width="46" height="26" viewBox="0 0 46 26"><g fill="#635d5a"><path d="M0 26 8 0h8L8 26Z"/><path d="M15 26 23 0h8l-8 26Z"/><path d="M30 26 38 0h8l-8 26Z"/></g></svg>
              )}
              {k === "robinhood" && (
                <svg width="40" height="34" viewBox="0 0 40 34" stroke="#635d5a" fill="none" strokeWidth="2"><path d="M20 2 38 11 20 20 2 11Z"/><path d="M2 18 20 27 38 18"/><path d="M6 25l14 7 14-7"/></svg>
              )}
              {k === "local-vault" && (
                <svg width="42" height="30" viewBox="0 0 42 30" stroke="#635d5a" fill="none" strokeWidth="2"><ellipse cx="21" cy="15" rx="18" ry="8"/><ellipse cx="21" cy="15" rx="18" ry="8" transform="rotate(60 21 15)"/><ellipse cx="21" cy="15" rx="18" ry="8" transform="rotate(-60 21 15)"/></svg>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === "gap" && <div className="flex-1" />}

      {mode === "index" && (
        <nav className="flex flex-1 flex-col justify-center">
          {INDEX.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`group flex items-baseline gap-3 border-t border-[#2e2e2e] px-6 py-4 font-mono-d text-[13px] transition-colors last:border-b ${
                active === s.id ? "text-[#e9e0d1]" : "text-[#635d5a] hover:text-[#9a938a]"
              }`}
            >
              <span className="text-[11px]">{s.n}</span>
              <span className="relative">
                {s.label}
                {active === s.id && <span className="absolute -bottom-1 left-0 h-px w-6 bg-[#e9e0d1]" />}
              </span>
            </a>
          ))}
        </nav>
      )}

      {mode === "end" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-7">
          <a href="#hero" className="font-mono-d text-[12px] text-[#9a938a] hover:text-[#e9e0d1]">⌃ Back to top</a>
          {["EVM L2", "4663", "V1"].map((b) => (
            <div key={b} className="flex flex-col items-center gap-2">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#383838] text-[9px] font-mono-d text-[#635d5a]">
                {b === "EVM L2" ? "ARB" : b === "4663" ? "CHAIN" : "BETA"}
              </span>
              <span className="font-mono-d text-[11px] text-[#9a938a]">{b}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
