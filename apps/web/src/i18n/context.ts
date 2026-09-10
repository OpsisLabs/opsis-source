import { createContext, useContext } from "react";
import type { Locale } from "./locale";
import type { TranslateParams, TranslationKey } from "./translate";

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  formatNumber: (value: number) => string;
  formatDate: (value: Date | number | string) => string;
  formatDateTime: (value: Date | number | string) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return value;
}
