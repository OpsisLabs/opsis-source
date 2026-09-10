import { useState } from "react";
import { shoppingLinks, type ShoppingBrief } from "./model";
import { useI18n, type TranslationKey } from "../i18n";
const empty: ShoppingBrief = { name: "", set: "", number: "", printing: "", condition: "", grader: "", grade: "" };
const FIELD_LABEL_KEYS: Record<keyof ShoppingBrief, TranslationKey> = {
  name: "cloud.deals.brief.field.name",
  set: "cloud.deals.brief.field.set",
  number: "cloud.deals.brief.field.number",
  printing: "cloud.deals.brief.field.printing",
  condition: "cloud.deals.brief.field.condition",
  grader: "cloud.deals.brief.field.grader",
  grade: "cloud.deals.brief.field.grade",
};
export function DealBrief() {
  const { t } = useI18n();
  const [brief, setBrief] = useState(empty);
  let links: ReturnType<typeof shoppingLinks> | null = null;
  try { links = shoppingLinks(brief); } catch { /* Incomplete brief has no links. */ }
  return <section aria-label={t("cloud.deals.brief.ariaLabel")} className="space-y-4 border border-[#555] bg-[#242424] p-5 text-[#e9e0d1]">
    <h2 className="text-2xl">{t("cloud.deals.brief.title")}</h2>
    <p>{t("cloud.deals.brief.intro")}</p>
    <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(empty) as (keyof ShoppingBrief)[]).map(key => <label key={key} className="capitalize">{t(FIELD_LABEL_KEYS[key])}<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" maxLength={80} value={brief[key]} onChange={event => setBrief({ ...brief, [key]: event.target.value })} /></label>)}</div>
    <p className="text-sm">{t("cloud.deals.brief.fieldsNote")}</p>
    {links ? <div className="flex flex-wrap gap-4"><a className="min-h-[44px] text-[#fa6c34] underline" href={links.listings} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("cloud.deals.brief.searchListings")}</a><a className="min-h-[44px] text-[#fa6c34] underline" href={links.completed} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("cloud.deals.brief.inspectSold")}</a></div> : <p role="status">{t("cloud.deals.brief.prompt")}</p>}
    <p>{t("cloud.deals.brief.footnote")}</p>
  </section>;
}
