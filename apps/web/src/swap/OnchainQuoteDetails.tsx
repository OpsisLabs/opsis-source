import { useI18n } from "../i18n";
import type { SwapQuote } from "./api";

/** Shared evidence and cost labels for Swap preview and Trade scenarios. */
export function OnchainQuoteDetails({ quote }: { quote: SwapQuote }) {
  const { t } = useI18n();
  const evidence = quote.onchain;
  if (!evidence) return null;
  return <section className="space-y-2 break-words border border-[#383838] p-4" aria-label={t("trade.onchain.evidence")}>
    <p>{t("trade.onchain.singlePool")}</p>
    <p>{t("trade.onchain.route", { fee: evidence.feeTier / 10000 })}</p>
    <p className="break-all">{t("trade.onchain.pool")}: {evidence.poolAddress}</p>
    <p>{t("trade.onchain.block", { block: evidence.blockNumber })}</p>
    <p>{t("trade.onchain.lpFee", { amount: evidence.lpFeeAmount, symbol: quote.input.symbol, fee: evidence.feeTier / 10000 })}</p>
    <p>{t("trade.onchain.networkFee", { eth: quote.estimatedGas.nativeAmount ?? t("trade.common.unknown"), usd: quote.estimatedGas.usdAmount ? displayUsd(quote.estimatedGas.usdAmount) : t("trade.common.unknown") })}</p>
    <p>{t("trade.onchain.gasBasis")}</p>
    <p>{t("trade.onchain.feed", { price: evidence.ethUsd, time: evidence.ethUsdObservedAt })}</p>
    <p>{t("trade.onchain.impact")}</p>
    <p>{t("trade.onchain.noSimulation")}</p>
    {evidence.nativeSide && <p>{t("trade.onchain.nativeWeth")}</p>}
  </section>;
}

// Display only: four significant figures (the exact value stays in the quote evidence).
function displayUsd(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4, useGrouping: false }).format(amount)
    : value;
}
