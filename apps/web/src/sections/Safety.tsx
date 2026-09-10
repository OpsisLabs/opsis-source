import { Check, Minus, ShieldCheck, X } from "lucide-react";
import { SectionHeader } from "./AssetUniverse";
import { useI18n } from "../i18n";

const IS = [
  "landing.safety.is1",
  "landing.safety.is2",
  "landing.safety.is3",
  "landing.safety.is4",
] as const;

const IS_NOT = [
  "landing.safety.isNot1",
  "landing.safety.isNot2",
  "landing.safety.isNot3",
  "landing.safety.isNot4",
  "landing.safety.isNot5",
] as const;

export default function Safety() {
  const { t } = useI18n();
  return (
    <section id="safety" data-home-reveal className="border-b border-[#34312f] bg-[#191817] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow={t("landing.safety.eyebrow")} title={<>{t("landing.safety.titleA")}<br /><span className="text-[#7fb069]">{t("landing.safety.titleB")}</span></>} copy={t("landing.safety.copy")} />
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <BoundaryCard title={t("landing.safety.isTitle")} items={IS.map((key) => t(key))} icon="check" />
        <BoundaryCard title={t("landing.safety.isNotTitle")} items={IS_NOT.map((key) => t(key))} icon="x" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SafetySignal icon={<ShieldCheck size={16} />} title={t("landing.safety.readOnly.title")} copy={t("landing.safety.readOnly.copy")} />
        <SafetySignal icon={<Minus size={16} />} title={t("landing.safety.precision.title")} copy={t("landing.safety.precision.copy")} />
        <SafetySignal icon={<Check size={16} />} title={t("landing.safety.inspectable.title")} copy={t("landing.safety.inspectable.copy")} />
      </div>
    </section>
  );
}

function BoundaryCard({ title, items, icon }: { title: string; items: string[]; icon: "check" | "x" }) {
  return (
    <article className="rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
      <p className={`font-mono-d text-[9px] tracking-[0.14em] ${icon === "check" ? "text-[#7fb069]" : "text-[#e0a96d]"}`}>{title}</p>
      <div className="mt-6">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 border-t border-[#333] py-4 first:border-t-0 first:pt-0">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${icon === "check" ? "border-[#7fb069]/40 text-[#7fb069]" : "border-[#e0a96d]/40 text-[#e0a96d]"}`}>{icon === "check" ? <Check size={10} /> : <X size={10} />}</span>
            <span className="text-[13px] leading-relaxed text-[#b7aea2]">{item}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SafetySignal({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded-[4px] border border-[#35312e] bg-[#1d1b1a] p-5 sm:p-6">
      <div className="flex items-center gap-3 font-mono-d text-[9px] tracking-[0.13em] text-[#fa6c34]">{icon}{title}</div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-[#9a938a]">{copy}</p>
    </div>
  );
}
