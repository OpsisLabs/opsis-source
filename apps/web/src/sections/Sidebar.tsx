import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";

const INDEX = [
  { n: "01", label: "What to track", id: "track" },
  { n: "02", label: "How it works", id: "workflow" },
  { n: "03", label: "Availability", id: "availability" },
  { n: "04", label: "Safety", id: "safety" },
  { n: "05", label: "FAQ", id: "faq" },
];

export default function Sidebar() {
  const [active, setActive] = useState("hero");

  useEffect(() => {
    const onScroll = () => {
      let current = "hero";
      for (const item of INDEX) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top < window.innerHeight * 0.48) {
          current = item.id;
        }
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[220px] flex-col border-r border-[#34312f] bg-[#1a1918] lg:flex">
      <a href="#hero" className="flex h-[84px] shrink-0 items-center gap-3 border-b border-[#34312f] px-5">
        <span className="clip-btn-sm flex h-11 w-11 items-center justify-center bg-[#fa6c34]">
          <img src="/logo.svg" alt="" className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-[15px] font-semibold tracking-[-0.02em] text-[#f4ece4]">ChainScout</span>
          <span className="mt-1 block font-mono-d text-[7.5px] tracking-[0.14em] text-[#9a938a]">PRIVATE ASSET WORKSPACE</span>
        </span>
      </a>

      <div className="px-5 pb-5 pt-7">
        <p className="text-[12px] leading-[1.65] text-[#a9a098]">
          Understand public activity. Keep ownership context encrypted on this device.
        </p>
      </div>

      <nav className="border-y border-[#34312f]" aria-label="Homepage sections">
        {INDEX.map((item) => {
          const selected = active === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={selected ? "location" : undefined}
              className={`group flex min-h-[50px] items-center gap-3 border-b border-[#2d2b29] px-5 text-[12px] transition-colors last:border-b-0 ${
                selected
                  ? "bg-[#24211f] text-[#f4ece4]"
                  : "text-[#99918a] hover:bg-[#211f1d] hover:text-[#e6ddd4]"
              }`}
            >
              <span className={`font-mono-d text-[8px] ${selected ? "text-[#fa6c34]" : "text-[#9a938a]"}`}>{item.n}</span>
              <span className="flex-1">{item.label}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-[#fa6c34]" : "bg-transparent"}`} />
            </a>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-[#34312f] p-5">
        <div className="rounded-sm border border-[#34312f] bg-[#201e1c] p-4">
          <p className="font-mono-d text-[8px] tracking-[0.13em] text-[#fa6c34]">FOUNDER BETA</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#9f9790]">Available tools are separated from coming-soon adapters.</p>
        </div>
        <Link to="/guide" className="flex min-h-[42px] items-center justify-between border border-[#4a4541] px-4 text-[11px] text-[#d6ccc2] transition-colors hover:border-[#fa6c34] hover:text-[#fff7ef]">
          Start guide <ArrowUpRight size={13} />
        </Link>
      </div>
    </aside>
  );
}
