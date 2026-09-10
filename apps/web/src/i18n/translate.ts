import { en, type TranslationKey } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import { readLocaleCookie, type Locale } from "./locale";

export type TranslateParams = Record<string, string | number>;
export type { TranslationKey };

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : match,
  );
}

export function lookup(locale: Locale, key: string): string | undefined {
  if (locale === "zh-CN" && Object.prototype.hasOwnProperty.call(zhCN, key)) return zhCN[key];
  return Object.prototype.hasOwnProperty.call(en, key) ? en[key as TranslationKey] : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  params?: TranslateParams,
): string {
  return interpolate(lookup(locale, key) ?? key, params);
}

export function translateCurrent(
  key: string,
  params?: TranslateParams,
): string {
  return translate(readLocaleCookie(), key, params);
}
