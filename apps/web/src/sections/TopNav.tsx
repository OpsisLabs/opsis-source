import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import LanguageSwitcher from "../i18n/LanguageSwitcher";
import { useI18n } from "../i18n";

const LINKS = [
  { labelKey: "landing.nav.track", href: "#track" },
  { labelKey: "landing.nav.howItWorks", href: "#workflow" },
  { labelKey: "landing.nav.availability", href: "#availability" },
  { labelKey: "landing.nav.safety", href: "#safety" },
  { labelKey: "landing.nav.faq", href: "#faq" },
  { labelKey: "landing.nav.guide", href: "/guide" },
] as const;

export default function TopNav() {
  const { t } = useI18n();
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
      <header className="fixed left-0 right-0 top-0 z-30 flex h-[60px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/90 backdrop-blur lg:left-[220px]">
        {/* mobile logo block */}
        <a
          href="#hero"
          className="flex h-full w-[60px] shrink-0 items-center justify-center bg-[#fa6c34] lg:hidden"
          style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)" }}
          aria-label={t("landing.nav.homeLabel")}
        >
          <img src="/logo.svg" alt="" className="h-6 w-6" />
        </a>

        <div className="flex-1" />

        <nav aria-label={t("landing.nav.sectionsLabel")} className="hidden items-center gap-4 pr-4 text-[12px] text-[#9a938a] min-[1200px]:flex xl:gap-6 xl:pr-6 xl:text-[13px]">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-[#e9e0d1]">
              {t(l.labelKey)}
            </a>
          ))}
        </nav>

        <LanguageSwitcher className="mr-3 shrink-0" />

        <Link
          to="/app"
          className="clip-btn-sm mr-3 hidden items-center bg-[#fa6c34] px-5 py-2.5 font-mono-d text-[11px] font-medium tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7038] sm:flex md:mr-0 md:h-full md:px-8 md:text-[12px]"
        >
          {t("landing.nav.openExplorer")}
        </Link>

        {/* hamburger */}
        <button
          ref={trigger}
          onClick={() => setOpen(!open)}
          className="flex h-full w-[60px] shrink-0 items-center justify-center border-l border-[#2e2e2e] text-[#e9e0d1] min-[1200px]:hidden"
          aria-label={t("landing.nav.openMenu")}
          aria-expanded={open}
          aria-controls="homepage-mobile-menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* mobile menu */}
      {open && (
        <nav id="homepage-mobile-menu" aria-label={t("landing.nav.mobileSectionsLabel")} className="fixed inset-x-0 top-[60px] z-40 max-h-[calc(100dvh-60px)] overflow-y-auto border-b border-[#2e2e2e] bg-[#1d1d1d] min-[1200px]:hidden">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-4 text-[14px] text-[#9a938a] transition-colors hover:text-[#e9e0d1]"
            >
              {t(l.labelKey)}
              <span className="font-mono-d text-[10px] text-[#635d5a]">→</span>
            </a>
          ))}
          <div className="space-y-3 p-4">
            <LanguageSwitcher className="w-full justify-center" />
            <Link
              to="/app"
              onClick={() => setOpen(false)}
              className="clip-btn-sm flex items-center justify-center bg-[#fa6c34] py-3.5 font-mono-d text-[12px] font-medium tracking-wide text-[#1d1d1d]"
            >
              {t("landing.nav.openExplorer")}
            </Link>
          </div>
        </nav>
      )}
    </>
  );
}
