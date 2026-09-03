import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";

const LINKS = [
  { label: "Track", href: "#track" },
  { label: "How it works", href: "#workflow" },
  { label: "Availability", href: "#availability" },
  { label: "Safety", href: "#safety" },
  { label: "FAQ", href: "#faq" },
  { label: "Guide", href: "/guide" },
];

export default function TopNav() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-[72px] items-center gap-3 border-b border-[#383838] bg-[#1d1d1d] px-4 sm:px-6 xl:px-10">
        {/* mobile logo block */}
        <a
          href="#hero"
          className="flex shrink-0 items-center gap-3 text-[18px] font-semibold text-[#f0e8da]"
          aria-label="ChainScout home"
        >
          <span className="clip-btn-sm flex h-10 w-10 items-center justify-center bg-[#fa6c34]"><img src="/logo.svg" alt="" className="h-6 w-6" /></span><span>ChainScout</span>
        </a>

        <div className="flex-1" />

        <nav aria-label="Homepage sections" className="hidden items-center gap-5 pr-3 text-[14px] text-[#b8b0a7] lg:flex xl:gap-7">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-[#e9e0d1]">
              {l.label}
            </a>
          ))}
        </nav>

        <Link
          to="/app"
          className="clip-btn-sm hidden min-h-11 items-center bg-[#fa6c34] px-5 text-[14px] font-semibold text-[#1d1d1d] transition-colors hover:bg-[#ff7038] sm:flex"
        >
          OPEN EXPLORER
        </Link>

        {/* hamburger */}
        <button
          ref={trigger}
          onClick={() => setOpen(!open)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#514a45] text-[#e9e0d1] lg:hidden"
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="homepage-mobile-menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* mobile menu */}
      {open && (
        <nav id="homepage-mobile-menu" aria-label="Mobile homepage sections" className="fixed inset-x-0 top-[72px] z-40 max-h-[calc(100dvh-72px)] overflow-y-auto border-b border-[#383838] bg-[#1d1d1d] lg:hidden">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 text-[14px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]"
            >
              {l.label}
              <span className="font-mono-d text-[10px] text-[#635d5a]">→</span>
            </a>
          ))}
          <div className="p-4">
            <Link
              to="/app"
              onClick={() => setOpen(false)}
              className="clip-btn-sm flex items-center justify-center bg-[#fa6c34] py-3.5 font-mono-d text-[12px] font-medium tracking-wide text-[#1d1d1d]"
            >
              OPEN EXPLORER
            </Link>
          </div>
        </nav>
      )}
    </>
  );
}
