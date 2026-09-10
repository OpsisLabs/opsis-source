import { useState } from "react";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import { useI18n } from "../i18n";
import { approvalIdentity, permissionMeaning, uniqueApprovals } from "./model";

export function ApprovalManager({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [handoff, setHandoff] = useState(false);
  let rows;
  try { rows = uniqueApprovals(snapshot.approvals); }
  catch { return <p role="alert">{t("actions.approvals.conflict")}</p>; }
  const unresolved = Math.max(0, snapshot.reconciliation.approvalCandidates - snapshot.reconciliation.approvalConfirmed);
  const filtered = rows.filter(row => (filter === "all" || (filter === "active" ? row.active : !row.active)) && `${row.symbol} ${row.contract} ${row.spender}`.toLowerCase().includes(query.toLowerCase()));
  return <section aria-label={t("actions.approvals.title")} className="mt-6 space-y-5 border border-[#383838] bg-[#242424] p-5 text-[#e9e0d1]">
    <h2 className="text-2xl">{t("actions.approvals.title")}</h2>
    <p className="break-all text-sm">{t("actions.approvals.snapshotWallet", { address: snapshot.address })}</p>
    <p className="text-sm text-[#b5ada2]">{t("actions.approvals.snapshotMeta", { block: snapshot.anchor.blockNumber, fetched: new Date(snapshot.anchor.fetchedAt).toLocaleString() })}</p>
    <p>{t("actions.approvals.summary", { active: rows.filter(row => row.active).length, broad: rows.filter(row => row.active && row.unlimited).length, unresolved })}</p>
    <p className="text-sm text-[#b5ada2]">{t("actions.approvals.discoveryLimit")}</p>
    {snapshot.reconciliation.degradedSources.length > 0 && <p role="status">{t("actions.approvals.partialSources", { sources: snapshot.reconciliation.degradedSources.join(", ") })}</p>}
    <label className="block">{t("actions.approvals.filterLabel")}<select className="ml-3 bg-[#1d1d1d] p-3" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t("actions.approvals.filterAll")}</option><option value="active">{t("actions.approvals.filterActive")}</option><option value="inactive">{t("actions.approvals.filterInactive")}</option></select></label>
    <label className="block">{t("actions.approvals.findLabel")}<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label>
    {!filtered.length && <p role="status">{t("actions.approvals.empty")}</p>}
    {filtered.map(row => <article key={approvalIdentity(row)} className="space-y-3 border border-[#555] p-4">
      <h3>{row.symbol} · {row.active ? row.unlimited ? t("actions.approvals.stateBroad") : t("actions.approvals.stateActive") : t("actions.approvals.stateInactive")}</h3>
      <p className="text-sm">{permissionMeaning(row)}</p>
      <p className="break-all text-sm">{t("actions.approvals.contract", { contract: row.contract })}</p><p className="break-all text-sm">{t("actions.approvals.spender", { spender: row.spender })}</p>
      <details><summary className="cursor-pointer text-[#fa6c34]">{t("actions.approvals.evidenceSummary")}</summary><p className="break-all">{t("actions.approvals.rawState", { amount: row.currentAmount })}</p><p className="break-all">{t("actions.approvals.discoveryTx", { hash: row.transactionHash })}</p><p>{t("actions.approvals.sourceIds", { ids: row.sourceIds.join(", ") })}</p>{/^0x[0-9a-f]{64}$/i.test(row.transactionHash) && <a className="block text-[#fa6c34] underline" href={`https://robinhoodchain.blockscout.com/tx/${row.transactionHash}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("actions.approvals.inspectTx")}</a>}<p>{t("actions.approvals.txHistorical", { block: snapshot.anchor.blockNumber })}</p></details>
    </article>)}
    <button className="min-h-[44px] border border-[#fa6c34] px-4 text-[#fa6c34]" onClick={() => setHandoff(!handoff)} aria-expanded={handoff}>{t("actions.approvals.reviewRevocation")}</button>
    {handoff && <div className="space-y-3 border border-[#fa6c34] p-4"><h3>{t("actions.approvals.handoffTitle")}</h3><p>{t("actions.approvals.handoffBody")}</p><p>{t("actions.approvals.handoffPrivacy")}</p><a className="inline-block min-h-[44px] text-[#fa6c34] underline" href="https://revoke.cash/token-approval-checker/robinhood-chain" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("actions.approvals.handoffLink")}</a></div>}
  </section>;
}
