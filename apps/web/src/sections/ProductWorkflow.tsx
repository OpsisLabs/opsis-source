import { ArrowRight, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { SectionHeader } from "./AssetUniverse";
import { useI18n } from "../i18n";

const JOBS = [
  { n: "01", icon: ScanSearch, titleKey: "landing.workflow.understand.title", signalKey: "landing.workflow.understand.signal", copyKey: "landing.workflow.understand.copy", link: "/app", actionKey: "landing.workflow.understand.action" },
  { n: "02", icon: LockKeyhole, titleKey: "landing.workflow.track.title", signalKey: "landing.workflow.track.signal", copyKey: "landing.workflow.track.copy", link: "/vault?view=assets", actionKey: "landing.workflow.track.action" },
  { n: "03", icon: ShieldCheck, titleKey: "landing.workflow.act.title", signalKey: "landing.workflow.act.signal", copyKey: "landing.workflow.act.copy", link: "/rwa", actionKey: "landing.workflow.act.action" },
] as const;

export default function ProductWorkflow() {
  const { t } = useI18n();
  return (
    <section id="workflow" data-home-reveal className="border-b border-[#34312f] bg-[#191817] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow={t("landing.workflow.eyebrow")} title={<>{t("landing.workflow.titleA")}<br /><span className="text-[#fa6c34]">{t("landing.workflow.titleB")}</span></>} copy={t("landing.workflow.copy")} />
      <div className="mt-12 grid gap-4 xl:grid-cols-3">
        {JOBS.map((job) => (
          <article key={job.titleKey} className="flex min-h-[330px] flex-col rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
            <div className="flex items-center justify-between"><span className="font-mono-d text-[8px] text-[#9a938a]">{job.n}</span><span className="flex h-10 w-10 items-center justify-center rounded-sm border border-[#55443d] text-[#fa6c34]"><job.icon size={18} /></span></div>
            <p className="mt-9 text-[9px] text-[#8fba7f]">{t(job.signalKey)}</p>
            <h3 className="mt-3 text-[31px] font-medium tracking-[-0.035em] text-[#f0e8da]">{t(job.titleKey)}</h3>
            <p className="mt-4 flex-1 text-[13px] leading-[1.7] text-[#a19992]">{t(job.copyKey)}</p>
            <Link to={job.link} className="mt-7 flex min-h-[44px] items-center justify-between border-t border-[#383431] pt-5 text-[10px] font-medium text-[#ddd3ca] transition-colors hover:text-[#fa6c34]">{t(job.actionKey)}<ArrowRight size={13} /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
