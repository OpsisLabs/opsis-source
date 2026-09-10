import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext, type I18nContextValue } from "./context";
import {
  localeLanguageTag,
  readLocaleCookie,
  writeLocaleCookie,
  type Locale,
} from "./locale";
import { translate, type TranslateParams, type TranslationKey } from "./translate";

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readLocaleCookie());

  useEffect(() => {
    const root = document.documentElement;
    root.lang = localeLanguageTag(locale);
    root.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeLocaleCookie(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
    });
    return {
      locale,
      setLocale,
      t: (key: TranslationKey, params?: TranslateParams) =>
        translate(locale, key, params),
      formatNumber: (input: number) => new Intl.NumberFormat(locale).format(input),
      formatDate: (input) => dateFormatter.format(toDate(input)),
      formatDateTime: (input) => formatter.format(toDate(input)),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
