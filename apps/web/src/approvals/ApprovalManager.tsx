import { useState } from "react";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import { approvalIdentity, permissionMeaning, uniqueApprovals } from "./model";

export function ApprovalManager({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [handoff, setHandoff] = useState(false);
  let rows;
  try { rows = uniqueApprovals(snapshot.approvals); }
  catch { return <p role="alert">Conflicting permission evidence. Refresh before reviewing permissions.</p>; }
  const unresolved = Math.max(0, snapshot.reconciliation.approvalCandidates - snapshot.reconciliation.approvalConfirmed);
  const filtered = rows.filter(row => (filter === "all" || (filter === "active" ? row.active : !row.active)) && `${row.symbol} ${row.contract} ${row.spender}`.toLowerCase().includes(query.toLowerCase()));
  return <section aria-label="Approval Manager" className="mt-6 space-y-5 border border-[#383838] bg-[#242424] p-5 text-[#e9e0d1]">
    <h2 className="text-2xl">Approval Manager</h2>
    <p className="break-all text-sm">Snapshot wallet: {snapshot.address}</p>
    <p className="text-sm text-[#b5ada2]">Snapshot at block {snapshot.anchor.blockNumber} · fetched {new Date(snapshot.anchor.fetchedAt).toLocaleString()}. Historical, non-final evidence—not a live safety score. Refresh after any external change.</p>
    <p>{rows.filter(row => row.active).length} active · {rows.filter(row => row.active && row.unlimited).length} broad · {unresolved} unresolved reads</p>
    <p className="text-sm text-[#b5ada2]">Discovery is limited to the fetched activity window. Missing approvals, signatures and unsupported contracts may exist. No discovered approvals does not mean no permissions.</p>
    {snapshot.reconciliation.degradedSources.length > 0 && <p role="status">Partial sources: {snapshot.reconciliation.degradedSources.join(", ")}</p>}
    <label className="block">Filter permissions<select className="ml-3 bg-[#1d1d1d] p-3" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All confirmed</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    <label className="block">Find token or address<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label>
    {!filtered.length && <p role="status">No confirmed permissions match this view. Unresolved or undiscovered permissions are not included.</p>}
    {filtered.map(row => <article key={approvalIdentity(row)} className="space-y-3 border border-[#555] p-4">
      <h3>{row.symbol} · {row.active ? row.unlimited ? "ACTIVE BROAD ACCESS" : "ACTIVE" : "INACTIVE AT SNAPSHOT"}</h3>
      <p className="text-sm">{permissionMeaning(row)}</p>
      <p className="break-all text-sm">Contract: {row.contract}</p><p className="break-all text-sm">Spender: {row.spender}</p>
      <details><summary className="cursor-pointer text-[#fa6c34]">Evidence and exact values</summary><p className="break-all">Raw state: {row.currentAmount}</p><p className="break-all">Discovery transaction: {row.transactionHash}</p><p>Source IDs: {row.sourceIds.join(", ")}</p>{/^0x[0-9a-f]{64}$/i.test(row.transactionHash) && <a className="block text-[#fa6c34] underline" href={`https://robinhoodchain.blockscout.com/tx/${row.transactionHash}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Inspect discovery transaction on Blockscout</a>}<p>Discovery transaction is historical; current permission state was read at block {snapshot.anchor.blockNumber}.</p></details>
    </article>)}
    <button className="min-h-[44px] border border-[#fa6c34] px-4 text-[#fa6c34]" onClick={() => setHandoff(!handoff)} aria-expanded={handoff}>Review external revocation</button>
    {handoff && <div className="space-y-3 border border-[#fa6c34] p-4"><h3>Continue outside ChainScout</h3><p>Revoke.cash supports Robinhood Chain. Enter your wallet there and independently verify the chain, token and spender. Nothing has been revoked here. Revoke.cash and your wallet own execution; network gas and any external service fees are yours. Revoking does not recover stolen funds or repair a compromised key.</p><p>No wallet address or private label is included in this link.</p><a className="inline-block min-h-[44px] text-[#fa6c34] underline" href="https://revoke.cash/token-approval-checker/robinhood-chain" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open Revoke.cash for Robinhood Chain</a></div>}
  </section>;
}
