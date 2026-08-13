import {
  Box,
  Coins,
  Gem,
  Image,
  Landmark,
  Orbit,
} from "lucide-react";
import { Link } from "react-router";

const ASSETS = [
  { icon: Coins, title: "Crypto & tokens", state: "AVAILABLE", copy: "Encrypted lots and notes beside an on-demand snapshot at one captured current block, sourced from Robinhood Public RPC and hash-rechecked before return.", color: "#fa6c34" },
  { icon: Orbit, title: "Wallet portfolio", state: "AVAILABLE", copy: "Holdings, activity, decoded movements, approvals, and owner-entered reference values in one local view.", color: "#7fb069" },
  { icon: Image, title: "NFTs", state: "AVAILABLE", copy: "Verified ERC-721 and ERC-1155 holdings can link to encrypted owner records, notes, lots, and local photos.", color: "#7cc4f8" },
  { icon: Landmark, title: "Tokenized assets & RWA", state: "AVAILABLE", copy: "Track owned records locally and inspect source-linked identity, oracle, vault, custody, and redemption evidence.", color: "#c9a6ff" },
  { icon: Gem, title: "Pokémon, TCG & collectibles", state: "MANUAL RECORDS LIVE", copy: "Save set and collector IDs, printing, condition, grade, certificate, lots, local photos, and dated reference values.", color: "#e0a96d" },
  { icon: Box, title: "Anything else", state: "AVAILABLE", copy: "Create a private manual record even when no chain, catalog, provider, or public identifier exists.", color: "#e0738a" },
];

export default function AssetUniverse() {
  return (
    <section id="track" data-home-reveal className="border-b border-[#2e2e2e] px-5 py-20 sm:px-8 md:px-12 md:py-28">
      <SectionHeader eyebrow="WHAT CAN I TRACK?" title={<>One private record for<br />every kind of asset.</>} copy="ChainScout combines public, source-linked evidence with private owner context without pretending they are the same thing." />
      <div className="mt-14 grid gap-px border border-[#383838] bg-[#383838] md:grid-cols-2 xl:grid-cols-3">
        {ASSETS.map((asset, index) => (
          <article key={asset.title} className="group relative min-h-[270px] overflow-hidden bg-[#202020] p-6 transition-colors hover:bg-[#242424] sm:p-8">
            <div className="absolute right-[-45px] top-[-45px] h-32 w-32 rounded-full border opacity-20 transition-transform duration-500 group-hover:scale-125" style={{ borderColor: asset.color }} />
            <div className="flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center border" style={{ borderColor: `${asset.color}66`, color: asset.color }}><asset.icon size={19} /></span>
              <span className="font-mono-d text-[8px] text-[#635d5a]">0{index + 1}</span>
            </div>
            <p className="mt-8 font-mono-d text-[8px] tracking-[0.13em]" style={{ color: asset.color }}>{asset.state}</p>
            <h3 className="mt-3 text-[22px] font-medium tracking-[-0.025em] text-[#f0e8da]">{asset.title}</h3>
            <p className="mt-4 text-[12.5px] leading-[1.7] text-[#9a938a]">{asset.copy}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 grid gap-4 border border-[#e0a96d]/30 bg-[#e0a96d]/[0.04] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div>
          <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#e0a96d]">POKÉMON / TCG CLARITY</p>
          <p className="mt-3 max-w-[850px] text-[12.5px] leading-relaxed text-[#b7aea2]">Private manual collectible records and value-history charts work now. Assisted TCGdex card/set matching is built but stays disabled in this founder build until its separate legal enablement review. We never call owner-entered data provider-verified.</p>
        </div>
        <Link to="/vault?view=assets" className="clip-btn-sm flex min-h-[46px] items-center justify-center bg-[#e0a96d] px-5 font-mono-d text-[9px] font-semibold tracking-wider text-[#211d18]">ADD A COLLECTIBLE</Link>
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-[#7f7972]">A failed refresh preserves the prior encrypted snapshot; partial provider results are visibly marked and may still replace it after confirmation.</p>
    </section>
  );
}

export function SectionHeader({ eyebrow, title, copy }: { eyebrow: string; title: React.ReactNode; copy: string }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
      <div>
        <div className="mb-8 flex items-center gap-3 border-y border-[#2e2e2e] py-3"><span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34]" /><span className="font-mono-d text-[10px] tracking-[0.14em] text-[#b7aea2]">{eyebrow}</span><span className="hatch h-3 flex-1 opacity-60" /></div>
        <h2 className="text-[39px] font-medium leading-[1.02] tracking-[-0.04em] text-[#f0e8da] sm:text-[52px] md:text-[64px]">{title}</h2>
      </div>
      <p className="max-w-[520px] text-[14px] leading-[1.75] text-[#b7aea2] xl:justify-self-end">{copy}</p>
    </div>
  );
}
