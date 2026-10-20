import { EXPLORER } from "../dashboard/adapters";
import { useI18n } from "../i18n";
import type { SwapFeeTierResult, SwapQuote } from "./api";
import "./fee-tier-comparison.css";

export function FeeTierComparison({ quote }: { quote: SwapQuote }) {
  const { t } = useI18n();
  const evidence = quote.onchain;
  const rows = evidence?.feeTiers;
  if (!rows?.length) return null;
  const labels = [t("trade.onchain.pool"), t("trade.feeTiers.output"), t("trade.quote.priceImpact"), t("trade.feeTiers.lpFee")];
  function fields(row: SwapFeeTierResult) {
    const pool = row.status === "no_pool" ? "—" : <a
      href={`${EXPLORER}/address/${row.poolAddress}`} target="_blank" rel="noopener noreferrer" title={row.poolAddress}
      aria-label={t("trade.feeTiers.poolLink", { address: row.poolAddress })}
    >{row.poolAddress.slice(0, 6)}…{row.poolAddress.slice(-4)} ↗</a>;
    const output = row.status === "quoted" ? <>
      {row.outputAmount} {quote.output.symbol}
      {row.highestOutput && <span className="swap-fee-tier-highest">{t("trade.feeTiers.highest")}</span>}
    </> : <>
      <span>{t(row.status === "no_pool" ? "trade.feeTiers.noPool" : "trade.feeTiers.refused")}</span>
      <span className="swap-fee-tier-reason">{t(`trade.feeTiers.reason.${row.reason}`)}</span>
    </>;
    const impact = row.status !== "quoted" ? "—" : row.priceImpactPercent === null
      ? t("trade.feeTiers.unknownImpact") : `${row.priceImpactPercent.toFixed(2)}%`;
    return [pool, output, impact, row.status === "no_pool" ? "—" : `${row.lpFeeAmount} ${quote.input.symbol}`];
  }
  return <section className="swap-fee-tiers" aria-label={t("trade.feeTiers.title")}>
    <h2>{t("trade.feeTiers.title")}</h2>
    <p>{t("trade.feeTiers.block", { block: evidence!.blockNumber })}</p>
    <table className="swap-fee-tiers-table" aria-label={t("trade.feeTiers.title")}>
      <thead><tr><th scope="col">{t("trade.feeTiers.fee")}</th>{labels.map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.feeTier}>
        <th scope="row">{row.feeTier / 10000}%</th>
        {fields(row).map((value, index) => <td key={labels[index]}>{value}</td>)}
      </tr>)}</tbody>
    </table>
    <div className="swap-fee-tiers-cards">
      {rows.map((row) => <article key={row.feeTier} aria-label={`${t("trade.feeTiers.fee")} ${row.feeTier / 10000}%`}>
        <h3>{t("trade.feeTiers.fee")} · {row.feeTier / 10000}%</h3>
        <dl>{fields(row).map((value, index) => <div key={labels[index]}><dt>{labels[index]}</dt><dd>{value}</dd></div>)}</dl>
      </article>)}
    </div>
  </section>;
}
