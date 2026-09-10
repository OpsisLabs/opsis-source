import { BookOpenText, Braces, CircleHelp, Compass } from "lucide-react";
import { Link } from "react-router";
import { isOpenDataApiEnabled } from "../product/availability";
import { useI18n } from "../i18n";
import LanguageSwitcher from "../i18n/LanguageSwitcher";

type KnowledgePage = "guide" | "docs" | "faq" | "developers";

const PAGES = [
  { id: "guide" as const, labelKey: "guide.header.nav.guide" as const, path: "/guide", icon: Compass },
  { id: "docs" as const, labelKey: "guide.header.nav.docs" as const, path: "/docs", icon: BookOpenText },
  { id: "faq" as const, labelKey: "guide.header.nav.faq" as const, path: "/faq", icon: CircleHelp },
  { id: "developers" as const, labelKey: "guide.header.nav.developers" as const, path: "/developers", icon: Braces },
];

export default function KnowledgeHeader({ active }: { active: KnowledgePage }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-3 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-3">
        <Link to="/" className="flex shrink-0 items-center gap-3" aria-label={t("guide.header.homeAria")}>
          <span
            className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]"
            style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}
          >
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="hidden font-mono-d text-[10px] tracking-[0.14em] text-[#d6ccba] xl:block">
            {t("guide.header.brand")}
          </span>
        </Link>
        <LanguageSwitcher className="ml-auto" />

        <nav
          className="ml-auto flex min-w-0 flex-wrap items-center gap-1 rounded-sm border border-[#383838] bg-[#222222] p-1"
          aria-label={t("guide.header.pagesAria")}
        >
          {PAGES.filter(({ id }) => id !== "developers" || isOpenDataApiEnabled()).map(({ id, labelKey, path, icon: Icon }) => {
            const selected = active === id;
            return (
              <Link
                key={id}
                to={path}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 whitespace-nowrap px-2.5 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#fa6c34] sm:px-3 ${
                  selected
                    ? "bg-[#fa6c34] font-semibold text-[#1d1d1d]"
                    : "text-[#8f8880] hover:bg-[#2b2725] hover:text-[#f0e8da]"
                }`}
              >
                <Icon size={12} className="hidden sm:block" />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
