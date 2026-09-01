import { Check, Clock3 } from "lucide-react";
import { isCollectibleCatalogEnabled } from "../product/availability";
import { SectionHeader } from "./AssetUniverse";

export default function AvailabilityMatrix() {
  const catalogEnabled = isCollectibleCatalogEnabled();
  const groups = [
    { label: "AVAILABLE IN FOUNDER BUILD", icon: Check, tone: "#7fb069", items: ["Private Explorer", "Encrypted Vault", "Manual crypto / NFT / RWA / collectible records", "Dated collectible value-history charts", "Portfolio Intelligence", "RWA Verify", "Scout Swap", ...(catalogEnabled ? ["TCGdex-assisted collectible identity"] : [])] },
    { label: "COMING SOON", icon: Clock3, tone: "#e0a96d", items: [...(!catalogEnabled ? ["TCGdex-assisted collectible identity"] : []), "Market & Inventory", "Replay Actions", "Open Data API"] },
    { label: "NEXT, AFTER THIS RELEASE", icon: Clock3, tone: "#c9a6ff", items: ["Additional source-reviewed asset coverage", "Historical market series only with approved data rights", "More opt-in data adapters after legal and spend review"] },
  ];
  return (
    <section id="availability" data-home-reveal className="border-b border-[#34312f] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow="WHAT WORKS IN THIS BUILD?" title={<>No mystery.<br />No silent fallbacks.</>} copy="The interface separates what is available now from what is coming soon. Upcoming tools never pretend to be live or route you into a different workspace." />
      <div className="mt-12 grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <article key={group.label} className="rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-sm border" style={{ borderColor: `${group.tone}55`, color: group.tone }}><group.icon size={15} /></span><p className="text-[9px] font-medium" style={{ color: group.tone }}>{group.label}</p></div>
            <ul className="mt-7 space-y-0">
              {group.items.map((item) => <li key={item} className="border-t border-[#35312e] py-4 text-[12.5px] leading-relaxed text-[#aaa19a]">{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
