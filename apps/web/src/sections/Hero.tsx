import { useState } from "react";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

const CATEGORIES = [
  "Crypto",
  "NFTs",
  "Tokenized assets",
  "Pokémon / TCG",
  "Collectibles",
  "Any manual asset",
];
const LAYERS = [
  {
    title: "Track what you own",
    icon: Boxes,
    copy: "Keep purchase lots, notes, photos and dated values together—from crypto and NFTs to cards and other collectibles.",
  },
  {
    title: "Understand public activity",
    icon: Search,
    copy: "Paste a wallet, transaction, token or contract. Get a source-linked explanation without connecting a wallet.",
  },
  {
    title: "Build private context",
    icon: LockKeyhole,
    copy: "Your Vault stays encrypted on this device. Unlock it when you need it, and export an encrypted backup to keep it safe.",
  },
  {
    title: "Verify before you act",
    icon: ShieldCheck,
    copy: "Review public evidence and its limits. ChainScout never signs or moves funds; official external tools handle execution.",
  },
];

export default function Hero() {
  const [open, setOpen] = useState(0);
  return (
    <section id="hero" className="marketing-hero">
      <div className="marketing-hero-copy">
        <p
          data-hero-reveal
          className="mb-7 flex items-center gap-2 text-[12px] font-medium tracking-wide text-[#fa6c34]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#fa6c34]" /> YOUR
          PRIVATE ASSET WORKSPACE
        </p>
        <h1 className="overflow-hidden text-[clamp(40px,4.6vw,70px)] font-medium leading-[1.04] tracking-[-0.045em]">
          <span data-hero-line className="block text-[#f4ece4]">
            Know what you own.
          </span>
          <span data-hero-line className="block text-[#d8cec5]">
            Read what happened.
          </span>
          <span data-hero-line className="block text-[#fa6c34]">
            Keep context yours.
          </span>
        </h1>
        <p
          data-hero-reveal
          className="mt-6 max-w-[590px] text-[18px] leading-[1.65] text-[#b8b0a7]"
        >
          One private place for your crypto, NFTs, tokenized assets, Pokémon
          cards and collectibles—with source-linked tools to understand the
          public activity around them.
        </p>
        <div data-hero-reveal className="mt-6 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <span
              key={category}
              className="rounded-sm border border-[#514a45] px-3 py-1.5 text-[12px] text-[#b8b0a7]"
            >
              {category}
            </span>
          ))}
        </div>
        <div data-hero-reveal className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/vault?view=assets"
            className="clip-btn flex min-h-[54px] items-center justify-center gap-3 bg-[#fa6c34] px-6 text-[14px] font-semibold text-[#1d1d1d] transition-colors hover:bg-[#ff7d48]"
          >
            <LockKeyhole size={17} /> OPEN PRIVATE VAULT
          </Link>
          <Link
            to="/app"
            className="flex min-h-[54px] items-center justify-center gap-3 rounded-sm border border-[#66574d] px-6 text-[14px] font-medium text-[#f0e8df] transition-colors hover:border-[#fa6c34]"
          >
            TRY THE EXPLORER <ArrowRight size={16} />
          </Link>
        </div>
        <p data-hero-reveal className="mt-4 text-[14px] text-[#aaa39b]">
          No wallet needed to explore. No server copy of your Vault.
        </p>
      </div>
      <figure data-hero-art className="marketing-hero-art">
        <img
          src="/asset-collection-v3.jpg"
          width={1122}
          height={1402}
          fetchPriority="high"
          alt="Illustration of collectible cards, crypto coins and a tokenized asset certificate, grouped as one personal collection"
        />
        <figcaption>
          Different assets. One private place.
          <span>Conceptual illustration · not an actual portfolio</span>
        </figcaption>
      </figure>
      <div
        data-hero-reveal
        className="hero-workflows"
        aria-label="Ways to use ChainScout"
      >
        {LAYERS.map((layer, index) => (
          <div key={layer.title} className="hero-workflow">
            <button
              type="button"
              aria-expanded={open === index}
              aria-controls={`hero-workflow-${index}`}
              onClick={() => setOpen(open === index ? -1 : index)}
            >
              <layer.icon size={18} className="shrink-0 text-[#fa6c34]" />
              <span>{layer.title}</span>
              <ChevronDown
                size={16}
                className={open === index ? "rotate-180" : ""}
              />
            </button>
            <p id={`hero-workflow-${index}`} hidden={open !== index}>
              {layer.copy}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
