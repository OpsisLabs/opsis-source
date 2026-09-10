import { Check, Clock3 } from "lucide-react";
import { isCollectibleCatalogEnabled } from "../product/availability";
import { SectionHeader } from "./AssetUniverse";
import { useI18n, type TranslationKey } from "../i18n";

export default function AvailabilityMatrix() {
  const { t } = useI18n();
  const catalogEnabled = isCollectibleCatalogEnabled();
  const availableItems: TranslationKey[] = [
    "landing.availability.item.explorer",
    "landing.availability.item.vault",
    "landing.availability.item.manualRecords",
    "landing.availability.item.charts",
    "landing.availability.item.portfolio",
    "landing.availability.item.rwa",
    "landing.availability.item.swap",
    ...(import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED === "true" ? ["cards.availability" as const] : []),
    ...(catalogEnabled ? ["landing.availability.item.tcgdex" as const] : []),
  ];
  const comingSoonItems: TranslationKey[] = [
    ...(!catalogEnabled ? ["landing.availability.item.tcgdex" as const] : []),
    "landing.availability.item.market",
    "landing.availability.item.replay",
    "landing.availability.item.openData",
  ];
  const groups: {
    labelKey: TranslationKey;
    icon: typeof Check;
    tone: string;
    itemKeys: TranslationKey[];
  }[] = [
    { labelKey: "landing.availability.group.available", icon: Check, tone: "#7fb069", itemKeys: availableItems },
    { labelKey: "landing.availability.group.comingSoon", icon: Clock3, tone: "#e0a96d", itemKeys: comingSoonItems },
    { labelKey: "landing.availability.group.next", icon: Clock3, tone: "#c9a6ff", itemKeys: ["landing.availability.item.coverage", "landing.availability.item.historical", "landing.availability.item.adapters"] },
  ];
  return (
    <section id="availability" data-home-reveal className="border-b border-[#34312f] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow={t("landing.availability.eyebrow")} title={<>{t("landing.availability.titleA")}<br />{t("landing.availability.titleB")}</>} copy={t("landing.availability.copy")} />
      <div className="mt-12 grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <article key={group.labelKey} className="rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-sm border" style={{ borderColor: `${group.tone}55`, color: group.tone }}><group.icon size={15} /></span><p className="text-[9px] font-medium" style={{ color: group.tone }}>{t(group.labelKey)}</p></div>
            <ul className="mt-7 space-y-0">
              {group.itemKeys.map((itemKey) => <li key={itemKey} className="border-t border-[#35312e] py-4 text-[12.5px] leading-relaxed text-[#aaa19a]">{t(itemKey)}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
