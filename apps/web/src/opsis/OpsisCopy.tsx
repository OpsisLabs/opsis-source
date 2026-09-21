import { useMemo, type ReactNode } from "react";
import { I18nContext, useI18n } from "../i18n/context";
import { interpolate, lookup } from "../i18n/translate";
import { opsisTemplate } from "./presentation";
export default function OpsisCopy({ children }: { children: ReactNode }) {
  const parent = useI18n();
  const value = useMemo(
    () => ({
      ...parent,
      t: (
        key: Parameters<typeof parent.t>[0],
        params?: Parameters<typeof parent.t>[1],
      ) =>
        interpolate(opsisTemplate(lookup(parent.locale, key) ?? key), params),
    }),
    [parent],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
