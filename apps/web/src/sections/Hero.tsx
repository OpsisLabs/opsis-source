import {
  ArrowRight,
  Boxes,
  Coins,
  GalleryVerticalEnd,
  Gem,
  Image,
  Landmark,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

const CATEGORIES = [
  "CRYPTO",
  "NFTS",
  "TOKENIZED ASSETS",
  "POKÉMON / TCG",
  "COLLECTIBLES",
  "ANY MANUAL ASSET",
];

const RECORDS = [
  {
    icon: Coins,
    type: "CRYPTO · PUBLIC SNAPSHOT",
    name: "WETH + USDG",
    detail: "Anchored holdings · local lots",
    color: "#fa6c34",
  },
  {
    icon: Image,
    type: "NFT · VERIFIED HOLDING",
    name: "ERC-721 / ERC-1155",
    detail: "Token IDs · encrypted notes",
    color: "#7cc4f8",
  },
  {
    icon: Landmark,
    type: "TOKENIZED ASSET · CITED",
    name: "AAPL Stock Token",
    detail: "Oracle · claims · limits",
    color: "#c9a6ff",
  },
  {
    icon: Gem,
    type: "POKÉMON / TCG · OWNER RECORD",
    name: "Charizard · Base Set 4/102",
    detail: "Condition · grade · dated values",
    color: "#7fb069",
  },
];

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative grid min-h-[calc(100vh-60px)] grid-cols-1 overflow-hidden border-b border-[#2e2e2e] xl:grid-cols-[0.98fr_1.02fr]"
    >
      <div className="relative border-r border-[#2e2e2e] px-6 pb-14 pt-20 sm:px-8 md:px-12 md:pt-28">
        <div className="pointer-events-none absolute -left-36 top-24 h-80 w-80 rounded-full bg-[#fa6c34]/[0.08] blur-3xl" />
        <div data-home-reveal className="relative mb-9 flex max-w-[650px] items-center gap-3 border-y border-[#2e2e2e] py-3">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#fa6c34]" />
          <span className="font-mono-d text-[10px] tracking-[0.14em] text-[#b7aea2] sm:text-[11px]">
            PRIVATE MULTI-ASSET COMMAND CENTER · ROBINHOOD CHAIN
          </span>
          <span className="hatch h-3 flex-1 opacity-60" />
        </div>

        <h1 data-home-reveal className="max-w-[720px] text-[42px] font-medium leading-[0.98] tracking-[-0.045em] sm:text-[58px] md:text-[72px] xl:text-[76px]">
          <span className="text-[#f0e8da]">Know what you own.</span>
          <br />
          <span className="text-[#d6ccba]">Understand what happened.</span>
          <br />
          <span className="text-[#fa6c34]">Keep the context yours.</span>
        </h1>

        <p data-home-reveal className="mt-7 max-w-[620px] text-[15px] leading-[1.75] text-[#b7aea2]">
          Track crypto, NFTs, tokenized assets, Pokémon cards, collectibles,
          and anything else in one encrypted local Vault—then use source-linked
          tools to understand public chain activity.
        </p>

        <div data-home-reveal className="mt-7 flex max-w-[650px] flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <span key={category} className="border border-[#fa6c34]/25 bg-[#fa6c34]/[0.06] px-3 py-2 font-mono-d text-[8px] tracking-[0.12em] text-[#d6ccba] sm:text-[9px]">
              {category}
            </span>
          ))}
        </div>

        <div data-home-reveal className="mt-9 grid max-w-[650px] gap-3 sm:grid-cols-2">
          <Link to="/vault?view=assets" className="clip-btn flex min-h-[58px] items-center justify-center gap-3 bg-[#fa6c34] px-5 font-mono-d text-[11px] font-semibold tracking-wide text-[#1d1d1d] transition-colors hover:bg-[#ff7d48]">
            <LockKeyhole size={15} /> OPEN PRIVATE VAULT
          </Link>
          <Link to="/app" className="clip-btn flex min-h-[58px] items-center justify-center gap-3 border border-[#fa6c34]/45 bg-[#fa6c34]/[0.04] px-5 font-mono-d text-[11px] font-medium tracking-wide text-[#f0e8da] transition-colors hover:border-[#fa6c34] hover:bg-[#fa6c34]/10">
            EXPLAIN A WALLET OR TX <ArrowRight size={14} />
          </Link>
        </div>

        <div data-home-reveal className="mt-8 flex max-w-[650px] flex-wrap gap-x-7 gap-y-3 border-t border-[#2e2e2e] pt-5 font-mono-d text-[8.5px] tracking-[0.1em] text-[#9a938a]">
          <span className="flex items-center gap-2"><ShieldCheck size={12} className="text-[#7fb069]" /> READ-ONLY PUBLIC TOOLS</span>
          <span className="flex items-center gap-2"><LockKeyhole size={12} className="text-[#7fb069]" /> LOCAL AES-256-GCM VAULT</span>
          <span className="flex items-center gap-2"><Boxes size={12} className="text-[#7fb069]" /> EXPORTABLE ENCRYPTED BACKUP</span>
        </div>
      </div>

      <div data-home-reveal className="dots relative flex min-h-[660px] items-center justify-center overflow-hidden bg-[#191919] p-5 sm:p-8 md:p-12">
        <div className="pointer-events-none absolute right-[-20%] top-[-10%] h-[520px] w-[520px] rounded-full border border-[#fa6c34]/15" />
        <div className="pointer-events-none absolute right-[-5%] top-[5%] h-[420px] w-[420px] rounded-full border border-[#c9a6ff]/10" />
        <div className="clip-panel relative w-full max-w-[700px] border border-[#4a4642] bg-[#202020]/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between border-b border-[#383838] px-4 py-4 sm:px-5">
            <div>
              <p className="font-mono-d text-[8px] tracking-[0.16em] text-[#fa6c34]">ENCRYPTED VAULT · LOCAL ONLY</p>
              <p className="mt-1 text-[13px] font-medium text-[#f0e8da]">Your asset command center</p>
            </div>
            <span className="flex items-center gap-2 border border-[#7fb069]/30 bg-[#7fb069]/5 px-3 py-2 font-mono-d text-[8px] text-[#9fc68f]"><LockKeyhole size={11} /> UNLOCKED</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[#383838] sm:grid-cols-4">
            <MiniMetric label="RECORD TYPES" value="CRYPTO → TCG" />
            <MiniMetric label="PURCHASE LOTS" value="EXACT DECIMALS" />
            <MiniMetric label="VALUE SOURCES" value="DATED · MANUAL" />
            <MiniMetric label="SERVER COPY" value="NONE" accent />
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono-d text-[8px] tracking-[0.14em] text-[#9a938a]">TRACKED RECORDS · EXAMPLE LAYOUT</p>
              <GalleryVerticalEnd size={14} className="text-[#635d5a]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {RECORDS.map((record, index) => (
                <article key={record.name} className="group relative overflow-hidden border border-[#383838] bg-[#242424] p-4 transition-colors hover:border-[#5a534d]">
                  <div className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: record.color }} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono-d text-[7px] tracking-[0.12em] text-[#7f7972]">{record.type}</p>
                      <h2 className="mt-2 text-[14px] font-medium text-[#f0e8da]">{record.name}</h2>
                      <p className="mt-2 text-[9px] text-[#9a938a]">{record.detail}</p>
                    </div>
                    <record.icon size={17} style={{ color: record.color }} />
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {[0, 1, 2, 3, 4, 5].map((bar) => (
                      <span key={bar} className="block h-[2px] flex-1" style={{ backgroundColor: `${record.color}${bar <= index + 1 ? "cc" : "25"}` }} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 border border-[#fa6c34]/25 bg-[#fa6c34]/[0.04] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono-d text-[7.5px] tracking-[0.13em] text-[#fa6c34]">COLLECTIBLE VALUE HISTORY</p>
                  <p className="mt-2 text-[9.5px] leading-relaxed text-[#9a938a]">Purchase lots + owner-entered dated references. Never presented as a live market feed.</p>
                </div>
                <div className="flex h-14 w-32 items-end gap-1.5 border-b border-l border-[#4a4642] px-2 pb-1">
                  {[18, 30, 25, 42, 36, 51, 47].map((height, index) => (
                    <span key={height} className="w-full bg-[#fa6c34]" style={{ height, opacity: 0.38 + index * 0.08 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#1d1d1d] px-3 py-4">
      <p className="font-mono-d text-[6.5px] tracking-[0.12em] text-[#635d5a]">{label}</p>
      <p className={`mt-2 font-mono-d text-[8px] ${accent ? "text-[#7fb069]" : "text-[#d6ccba]"}`}>{value}</p>
    </div>
  );
}
