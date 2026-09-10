export const LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "chainscout_locale_v1";

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
    const entry = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${LOCALE_COOKIE}=`));
    const value = entry ? decodeURIComponent(entry.slice(LOCALE_COOKIE.length + 1)) : undefined;
    return isLocale(value) ? value : DEFAULT_LOCALE;
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
