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
    <section id="workflow" data-home-reveal className="border-b border-[#2e2e2e] bg-[#191919] px-5 py-20 sm:px-8 md:px-12 md:py-28">
      <SectionHeader eyebrow="ONE PRODUCT · THREE JOBS" title={<>Understand. Track.<br /><span className="text-[#fa6c34]">Act carefully.</span></>} copy="Start with the job you have. Public network facts stay visibly separate from private owner-entered context, and uncertain coverage stays marked." />
      <div className="mt-14 grid gap-5 xl:grid-cols-3">
        {JOBS.map((job) => (
          <article key={job.title} className="clip-panel flex min-h-[390px] flex-col border border-[#383838] bg-[#202020] p-6 sm:p-8">
            <div className="flex items-center justify-between"><span className="font-mono-d text-[9px] text-[#635d5a]">{job.n}</span><job.icon size={20} className="text-[#fa6c34]" /></div>
            <p className="mt-14 font-mono-d text-[8px] tracking-[0.13em] text-[#7fb069]">{job.signal}</p>
            <h3 className="mt-4 text-[35px] font-medium tracking-[-0.035em] text-[#f0e8da]">{job.title}</h3>
            <p className="mt-5 flex-1 text-[13px] leading-[1.75] text-[#9a938a]">{job.copy}</p>
            <Link to={job.link} className="mt-8 flex min-h-[46px] items-center justify-between border-t border-[#383838] pt-5 font-mono-d text-[9px] tracking-[0.12em] text-[#d6ccba] transition-colors hover:text-[#fa6c34]">{job.action}<ArrowRight size={13} /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
