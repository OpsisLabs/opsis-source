import { useI18n } from "../i18n";
export function useCopy() {
  const { locale } = useI18n();
  return (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
}
