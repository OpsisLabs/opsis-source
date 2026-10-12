export const LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "opsis_locale_v1";
const LEGACY_LOCALE_COOKIE = "chainscout_locale_v1";

export const LOCALE_MAX_AGE = 31536000;

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function readLocaleCookie(): Locale {
  try {
    if (typeof document === "undefined") return DEFAULT_LOCALE;
    const entries = document.cookie.split(";").map(part => part.trim());
    for (const name of [LOCALE_COOKIE, LEGACY_LOCALE_COOKIE]) {
      const entry = entries.find(part => part.startsWith(`${name}=`));
      if (!entry) continue;
      try {
        const value = decodeURIComponent(entry.slice(name.length + 1));
        if (isLocale(value)) return value;
      } catch { /* Try the older preference when the current value is malformed. */ }
    }
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined" || !isLocale(locale)) return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  const attributes = [
    `${LOCALE_COOKIE}=${locale}`,
    `Max-Age=${LOCALE_MAX_AGE}`,
    "Path=/",
    "SameSite=Strict",
  ].join("; ");
  try { document.cookie = `${attributes}${secure}`; } catch { /* The current page can still switch when preference storage is blocked. */ }
}

export function localeLanguageTag(locale: Locale): string {
  return locale;
}
