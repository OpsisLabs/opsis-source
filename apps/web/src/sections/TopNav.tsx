import { useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";

const LINKS = [
  { label: "Product", href: "#capabilities" },
  { label: "Scout Swap", href: "/swap" },
  { label: "Private Vault", href: "/vault" },
  { label: "Providers", href: "#integrations" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Comparison", href: "#comparison" },
  { label: "Safety", href: "#safety" },
  { label: "FAQ", href: "#faq" },
];

export default function TopNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-30 flex h-[60px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/90 backdrop-blur lg:left-[220px]">
        {/* mobile logo block */}
        <a
          href="#hero"
          className="flex h-full w-[60px] shrink-0 items-center justify-center bg-[#fa6c34] lg:hidden"
          style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)" }}
        >
          <img src="/logo.svg" alt="RH Chain AI Explorer" className="h-6 w-6" />
        </a>

        <div className="flex-1" />

        <nav className="hidden items-center gap-10 pr-10 text-[13px] text-[#9a938a] md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-[#e9e0d1]">
              {l.label}
            </a>
          ))}
        </nav>

        <Link
          to="/app"
          className="clip-btn-sm mr-3 hidden items-center bg-[#fa6c34] px-5 py-2.5 font-mono-d text-[11px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7038] sm:flex md:mr-0 md:h-full md:px-8 md:text-[12px]"
        >
          TRY THE EXPLORER
        </Link>

        {/* hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="flex h-full w-[60px] items-center justify-center border-l border-[#2e2e2e] text-[#e9e0d1] md:hidden"
          aria-label="Menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* mobile menu */}
      {open && (
        <div className="fixed inset-x-0 top-[60px] z-40 border-b border-[#2e2e2e] bg-[#1d1d1d] md:hidden">
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
              TRY THE EXPLORER
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
