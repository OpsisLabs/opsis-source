import { Check, Clock3, LockKeyhole } from "lucide-react";
import { SectionHeader } from "./AssetUniverse";

const GROUPS = [
  { label: "AVAILABLE IN FOUNDER BUILD", icon: Check, tone: "#7fb069", items: ["Private Explorer", "Encrypted Vault", "Manual crypto / NFT / RWA / collectible records", "Dated collectible value-history charts", "Portfolio Intelligence", "RWA Verify", "Scout Swap"] },
  { label: "BUILT · SEPARATELY GATED", icon: LockKeyhole, tone: "#e0a96d", items: ["TCGdex-assisted collectible identity", "Market & Inventory", "Replay Actions", "Open Data API"] },
  { label: "NEXT, AFTER THIS RELEASE", icon: Clock3, tone: "#c9a6ff", items: ["Additional source-reviewed asset coverage", "Historical market series only with approved data rights", "More opt-in data adapters after legal and spend review"] },
];

export default function AvailabilityMatrix() {
  return (
    <section id="availability" data-home-reveal className="border-b border-[#2e2e2e] px-5 py-20 sm:px-8 md:px-12 md:py-28">
      <SectionHeader eyebrow="WHAT WORKS IN THIS BUILD?" title={<>No mystery.<br />No silent fallbacks.</>} copy="The interface labels what is available, built but gated, and still planned. Disabled tools never pretend to be live or route you into a different workspace." />
      <div className="mt-14 grid gap-px border border-[#383838] bg-[#383838] xl:grid-cols-3">
        {GROUPS.map((group) => (
          <article key={group.label} className="bg-[#202020] p-6 sm:p-8">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center border" style={{ borderColor: `${group.tone}66`, color: group.tone }}><group.icon size={15} /></span><p className="font-mono-d text-[8.5px] tracking-[0.12em]" style={{ color: group.tone }}>{group.label}</p></div>
            <ul className="mt-7 space-y-0">
              {group.items.map((item) => <li key={item} className="border-t border-[#333] py-4 text-[12.5px] leading-relaxed text-[#b7aea2]">{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
