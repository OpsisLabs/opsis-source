import { Link } from "react-router";
import { Eye } from "lucide-react";
import { useI18n } from "../i18n";
import { isProductFeatureEnabled } from "../product/availability";
import { toFollowableWallet, type WalletClassification } from "./followWallet";

/**
 * The single, chain-aware "Follow this wallet" action. Later releases (for
 * example the Biggest Trades worker) should render this component rather than
 * building a new link, so the consent boundary and URL shape stay identical.
 *
 * Props:
 * - address: the public address to follow.
 * - chainId: only chains Scout Watch supports render an action.
 * - classification: "wallet" shows the verified-wallet wording; "unknown"
 *   honestly shows a public-address wording; "contract" renders nothing.
 * - variant: "primary" is the flat orange call to action, "row" is the compact
 *   bordered action used in lists.
 *
 * It links to Scout Watch with the public address only. It performs no lookup,
 * save or consent and never places an encrypted label in the URL. When Scout
 * Watch is disabled the action fails closed and renders nothing.
 */
export type FollowWalletActionProps = {
  address: string;
  chainId: number;
  classification?: WalletClassification;
  variant?: "primary" | "row";
  className?: string;
};

const PRIMARY =
  "clip-btn-sm inline-flex min-h-11 items-center justify-center gap-2 bg-[#fa6c34] px-4 py-2 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] transition-colors hover:bg-[#ff8655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff985e]";
const ROW =
  "inline-flex min-h-11 items-center gap-2 rounded-sm border border-[#fa6c34] px-3 py-2 text-[14px] text-[#ff985e] transition-colors hover:bg-[#fa6c34]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff985e]";

export function FollowWalletAction({
  address,
  chainId,
  classification,
  variant = "primary",
  className = "",
}: FollowWalletActionProps) {
  const { t } = useI18n();
  const target = toFollowableWallet({ address, chainId, classification });
  if (!target || !isProductFeatureEnabled("scout-watch")) return null;

  const label =
    target.classification === "unknown"
      ? t("watch.follow.publicAddress")
      : t("watch.follow.wallet");

  return (
    <Link
      to={`/watch?address=${encodeURIComponent(target.address)}`}
      className={`${variant === "row" ? ROW : PRIMARY} ${className}`.trim()}
      aria-label={`${label} · ${target.address}`}
      title={t("watch.follow.aria", { address: target.address })}
    >
      <Eye size={15} aria-hidden />
      {label}
    </Link>
  );
}

export default FollowWalletAction;
