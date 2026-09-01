import {
  Box,
  Coins,
  Gem,
  Image,
  Landmark,
  Orbit,
} from "lucide-react";
import { Link } from "react-router";
import { isCollectibleCatalogEnabled } from "../product/availability";

const ASSETS = [
  { icon: Coins, title: "Crypto & tokens", state: "AVAILABLE", copy: "Encrypted lots and notes beside an on-demand snapshot at one captured current block, sourced from Robinhood Public RPC and hash-rechecked before return.", color: "#fa6c34" },
  { icon: Orbit, title: "Wallet portfolio", state: "AVAILABLE", copy: "Holdings, activity, decoded movements, approvals, and owner-entered reference values in one local view.", color: "#7fb069" },
  { icon: Image, title: "NFTs", state: "AVAILABLE", copy: "Verified ERC-721 and ERC-1155 holdings can link to encrypted owner records, notes, lots, and local photos.", color: "#7cc4f8" },
  { icon: Landmark, title: "Tokenized assets & RWA", state: "AVAILABLE", copy: "Track owned records locally and inspect source-linked identity, oracle, vault, custody, and redemption evidence.", color: "#c9a6ff" },
  { icon: Gem, title: "Pokémon, TCG & collectibles", state: "MANUAL RECORDS LIVE", copy: "Save set and collector IDs, printing, condition, grade, certificate, lots, local photos, and dated reference values.", color: "#e0a96d" },
  { icon: Box, title: "Anything else", state: "AVAILABLE", copy: "Create a private manual record even when no chain, catalog, provider, or public identifier exists.", color: "#e0738a" },
];

export default function AssetUniverse() {
  const catalogEnabled = isCollectibleCatalogEnabled();
  return (
    <section id="track" data-home-reveal className="border-b border-[#34312f] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow="WHAT CAN I TRACK?" title={<>One private record for<br />every kind of asset.</>} copy="ChainScout combines public, source-linked evidence with private owner context without pretending they are the same thing." />
      <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ASSETS.map((asset, index) => {
          const visibleAsset = asset.title === "Pokémon, TCG & collectibles" && catalogEnabled
            ? { ...asset, state: "CATALOG + MANUAL RECORDS LIVE", copy: "Match English card and set identity through TCGdex, add a sanitized catalog thumbnail, then save owner-reported printing, condition, grade, certificate, lots, photos, and dated values locally." }
            : asset;
          return (
          <article key={visibleAsset.title} className="group relative min-h-[235px] rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 transition-colors hover:border-[#554a44] hover:bg-[#24211f] sm:p-7">
            <div className="flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-sm border bg-[#24211f]" style={{ borderColor: `${visibleAsset.color}55`, color: visibleAsset.color }}><visibleAsset.icon size={19} /></span>
              <span className="font-mono-d text-[8px] text-[#9a938a]">0{index + 1}</span>
            </div>
            <p className="mt-7 text-[9px] font-medium" style={{ color: visibleAsset.color }}>{visibleAsset.state}</p>
            <h3 className="mt-2 text-[21px] font-medium tracking-[-0.025em] text-[#f0e8da]">{visibleAsset.title}</h3>
            <p className="mt-3 text-[12.5px] leading-[1.65] text-[#a19992]">{visibleAsset.copy}</p>
          </article>
          );
        })}
      </div>
      <div className="mt-5 grid gap-4 rounded-[4px] border border-[#55483d] bg-[#211e1b] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div>
          <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#e0a96d]">POKÉMON / TCG CLARITY</p>
          <p className="mt-3 max-w-[850px] text-[12.5px] leading-relaxed text-[#b7aea2]">{catalogEnabled ? "Assisted TCGdex English card/set matching, sanitized catalog thumbnails, private manual collectible records, and value-history charts work in this build. Card identity is source-linked; owner-entered condition, grade, certificate, value, and authenticity are never called provider-verified." : "Private manual collectible records and value-history charts work now. Assisted TCGdex card/set matching is coming soon after its separate legal review. We never call owner-entered data provider-verified."}</p>
        </div>
        <Link to="/vault?view=assets" className="clip-btn-sm flex min-h-[46px] items-center justify-center bg-[#e0a96d] px-5 font-mono-d text-[9px] font-semibold tracking-wider text-[#211d18]">ADD A COLLECTIBLE</Link>
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-[#7f7972]">A failed refresh preserves the prior encrypted snapshot; partial provider results are visibly marked and may still replace it after confirmation.</p>
    </section>
  );
}

export function SectionHeader({ eyebrow, title, copy }: { eyebrow: string; title: React.ReactNode; copy: string }) {
  return (
    <div className="grid gap-7 xl:grid-cols-[1.12fr_0.88fr] xl:items-end">
      <div>
        <div className="mb-6 flex items-center gap-3"><span className="h-px w-8 bg-[#fa6c34]" /><span className="font-mono-d text-[9px] tracking-[0.14em] text-[#aaa19a]">{eyebrow}</span></div>
        <h2 className="text-[38px] font-medium leading-[1.04] tracking-[-0.04em] text-[#f0e8da] sm:text-[49px] md:text-[58px]">{title}</h2>
      </div>
      <p className="max-w-[520px] text-[14px] leading-[1.7] text-[#aaa19a] xl:justify-self-end">{copy}</p>
    </div>
  );
}
