import { LOCALES, LOCALE_LABELS, type Locale } from "./locale";
import { useI18n } from "./context";

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("common.language.label")}
      className={`inline-flex items-center rounded-[3px] border border-[#4b403b] bg-[#201e1c] p-0.5 ${className}`}
    >
      {LOCALES.map((code: Locale) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={active}
            aria-label={t("common.language.switchTo", {
              language: LOCALE_LABELS[code],
            })}
            onClick={() => setLocale(code)}
            className={`min-h-[44px] whitespace-nowrap rounded-[2px] px-3 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#ffd0bc] ${
              active
                ? "bg-[#fa6c34] font-semibold text-[#1d1d1d]"
                : "text-[#b8b0a7] hover:bg-[#2a2421] hover:text-[#fff7ec]"
            }`}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
