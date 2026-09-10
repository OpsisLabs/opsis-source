import { useState } from "react";
import { Link } from "react-router";
import { Minus, Plus } from "lucide-react";
import { SectionHeader } from "./AssetUniverse";
import { isCollectibleCatalogEnabled } from "../product/availability";
import { useI18n } from "../i18n";

export default function Faq() {
  const { t } = useI18n();
  const catalogEnabled = isCollectibleCatalogEnabled();
  const qa = [
    { q: t("landing.faq.q1"), a: t(catalogEnabled ? "landing.faq.a1Catalog" : "landing.faq.a1Manual") },
    { q: t("landing.faq.q2"), a: t("landing.faq.a2") },
    { q: t("landing.faq.q3"), a: t("landing.faq.a3") },
    { q: t("landing.faq.q4"), a: t("landing.faq.a4") },
    { q: t("landing.faq.q5"), a: t("landing.faq.a5") },
    { q: t("landing.faq.q6"), a: t("landing.faq.a6") },
  ];
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" data-home-reveal className="border-b border-[#34312f] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow={t("landing.faq.eyebrow")} title={<>{t("landing.faq.titleA")}<br />{t("landing.faq.titleB")}</>} copy={t("landing.faq.copy")} />
      <div className="mt-12 grid gap-6 xl:grid-cols-[0.68fr_1.32fr]">
        <aside className="h-fit rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
          <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">{t("landing.faq.goDeeper")}</p>
          <p className="mt-4 text-[13px] leading-relaxed text-[#9a938a]">{t("landing.faq.goDeeperCopy")}</p>
          <div className="mt-6 grid gap-2">
            <Link to="/guide" className="clip-btn-sm flex min-h-[46px] items-center justify-center bg-[#fa6c34] px-4 font-mono-d text-[9px] font-semibold text-[#1d1d1d]">{t("landing.faq.openGuide")}</Link>
            <Link to="/docs" className="clip-btn-sm flex min-h-[46px] items-center justify-center border border-[#4a4642] px-4 font-mono-d text-[9px] text-[#d6ccba]">{t("landing.faq.readDocs")}</Link>
            <Link to="/faq" className="clip-btn-sm flex min-h-[46px] items-center justify-center border border-[#4a4642] px-4 font-mono-d text-[9px] text-[#d6ccba]">{t("landing.faq.viewFullFaq")}</Link>
          </div>
        </aside>
        <div className="space-y-2">
          {qa.map((item, index) => {
            const expanded = open === index;
            return (
              <article key={item.q} className="rounded-[3px] border border-[#3a3633] bg-[#201e1c]">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : index)} className="flex min-h-[64px] w-full items-center justify-between gap-6 px-5 py-4 text-left sm:px-6">
                  <span className="text-[14px] font-medium text-[#e9e0d1]">{item.q}</span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${expanded ? "border-[#fa6c34] bg-[#fa6c34] text-[#1d1d1d]" : "border-[#4a4642] text-[#9a938a]"}`}>{expanded ? <Minus size={13} /> : <Plus size={13} />}</span>
                </button>
                {expanded && <p className="max-w-[760px] border-t border-[#333] px-5 py-5 text-[12.5px] leading-[1.75] text-[#9a938a] sm:px-6">{item.a}</p>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
