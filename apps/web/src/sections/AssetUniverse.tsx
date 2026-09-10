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
import { useI18n } from "../i18n";

const ASSETS = [
  { id: "crypto", icon: Coins, color: "#fa6c34" },
  { id: "portfolio", icon: Orbit, color: "#7fb069" },
  { id: "nfts", icon: Image, color: "#7cc4f8" },
  { id: "rwa", icon: Landmark, color: "#c9a6ff" },
  { id: "collectibles", icon: Gem, color: "#e0a96d" },
  { id: "other", icon: Box, color: "#e0738a" },
] as const;

export default function AssetUniverse() {
  const { t } = useI18n();
  const catalogEnabled = isCollectibleCatalogEnabled();
  return (
    <section id="track" data-home-reveal className="border-b border-[#34312f] px-5 py-20 sm:px-8 md:px-12 md:py-24 xl:px-16">
      <SectionHeader eyebrow={t("landing.assets.eyebrow")} title={<>{t("landing.assets.titleA")}<br />{t("landing.assets.titleB")}</>} copy={t("landing.assets.copy")} />
      <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ASSETS.map((asset, index) => {
          const useCatalog = asset.id === "collectibles" && catalogEnabled;
          const state = useCatalog ? t("landing.assets.catalog.state") : t(`landing.assets.${asset.id}.state`);
          const copy = useCatalog ? t("landing.assets.catalog.copy") : t(`landing.assets.${asset.id}.copy`);
          return (
          <article key={asset.id} className="group relative min-h-[235px] rounded-[4px] border border-[#3a3633] bg-[#201e1c] p-6 transition-colors hover:border-[#554a44] hover:bg-[#24211f] sm:p-7">
            <div className="flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-sm border bg-[#24211f]" style={{ borderColor: `${asset.color}55`, color: asset.color }}><asset.icon size={19} /></span>
              <span className="font-mono-d text-[8px] text-[#9a938a]">0{index + 1}</span>
            </div>
            <p className="mt-7 text-[9px] font-medium" style={{ color: asset.color }}>{state}</p>
            <h3 className="mt-2 text-[21px] font-medium tracking-[-0.025em] text-[#f0e8da]">{t(`landing.assets.${asset.id}.title`)}</h3>
            <p className="mt-3 text-[12.5px] leading-[1.65] text-[#a19992]">{copy}</p>
          </article>
          );
        })}
      </div>
      <div className="mt-5 grid gap-4 rounded-[4px] border border-[#55483d] bg-[#211e1b] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div>
          <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#e0a96d]">{t("landing.assets.clarityEyebrow")}</p>
          <p className="mt-3 max-w-[850px] text-[12.5px] leading-relaxed text-[#b7aea2]">{catalogEnabled ? t("landing.assets.clarityCatalog") : t("landing.assets.clarityManual")}</p>
        </div>
        <Link to="/vault?view=assets" className="clip-btn-sm flex min-h-[46px] items-center justify-center bg-[#e0a96d] px-5 font-mono-d text-[9px] font-semibold tracking-wider text-[#211d18]">{t("landing.assets.addCollectible")}</Link>
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-[#7f7972]">{t("landing.assets.footnote")}</p>
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
