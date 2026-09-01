import { ArrowRight, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { SectionHeader } from "./AssetUniverse";

const JOBS = [
  { n: "01", icon: ScanSearch, title: "Understand", signal: "NO ACCOUNT · EPHEMERAL", copy: "Explain a wallet, transaction, token, or contract. Inspect activity, approvals, risk notes, and citations without creating a profile.", link: "/app", action: "START PRIVATE EXPLORER" },
  { n: "02", icon: LockKeyhole, title: "Track", signal: "ENCRYPTED · BROWSER-LOCAL", copy: "Save manual assets, exact purchase lots, private notes, locally processed photos, portfolio snapshots, and dated reference values.", link: "/vault?view=assets", action: "OPEN LOCAL VAULT" },
  { n: "03", icon: ShieldCheck, title: "Act carefully", signal: "READ-ONLY · OFFICIAL HANDOFF", copy: "Verify tokenized-asset evidence or preview a current WETH/USDG route. ChainScout never signs, submits, or broadcasts.", link: "/rwa", action: "VERIFY PUBLIC EVIDENCE" },
];

export default function ProductWorkflow() {
  return (
    <section id="workflow" data-home-reveal className="border-b border-[#34312f] bg-[#191817] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow="ONE PRODUCT · THREE JOBS" title={<>Understand. Track.<br /><span className="text-[#fa6c34]">Act carefully.</span></>} copy="Start with the job you have. Public network facts stay visibly separate from private owner-entered context, and uncertain coverage stays marked." />
      <div className="mt-12 grid gap-4 xl:grid-cols-3">
        {JOBS.map((job) => (
          <article key={job.title} className="flex min-h-[330px] flex-col rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
            <div className="flex items-center justify-between"><span className="font-mono-d text-[8px] text-[#9a938a]">{job.n}</span><span className="flex h-10 w-10 items-center justify-center rounded-sm border border-[#55443d] text-[#fa6c34]"><job.icon size={18} /></span></div>
            <p className="mt-9 text-[9px] text-[#8fba7f]">{job.signal}</p>
            <h3 className="mt-3 text-[31px] font-medium tracking-[-0.035em] text-[#f0e8da]">{job.title}</h3>
            <p className="mt-4 flex-1 text-[13px] leading-[1.7] text-[#a19992]">{job.copy}</p>
            <Link to={job.link} className="mt-7 flex min-h-[44px] items-center justify-between border-t border-[#383431] pt-5 text-[10px] font-medium text-[#ddd3ca] transition-colors hover:text-[#fa6c34]">{job.action}<ArrowRight size={13} /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
