import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { PortfolioSnapshot } from "@rh-chain/shared";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Eye,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { ApiError } from "../dashboard/http";
import type {
  VaultAsset,
  VaultPortfolioContext,
  VaultPortfolioContextDraft,
  VaultPortfolioValuation
} from "../vault/types";
import { requestPortfolioSnapshot } from "./api";
import { allocationPercent, buildPortfolioMath, formatDisplayDecimal, valueTotals, type PortfolioMathRow } from "./math";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function PortfolioPanel({
  assets,
  context,
  sessionId,
  onSave
}: {
  assets: VaultAsset[];
  context?: VaultPortfolioContext;
  sessionId: number;
  onSave: (draft: VaultPortfolioContextDraft, existing?: VaultPortfolioContext, expectedSession?: number) => Promise<VaultPortfolioContext>;
}) {
  const activeRef = useRef(true);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const savedRef = useRef(context);
  const [saved, setSaved] = useState(context);
  const [address, setAddress] = useState(context?.address ?? "");
  const [label, setLabel] = useState(context?.label ?? "");
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(context?.latestSnapshot ?? null);
  const [valuations, setValuations] = useState<VaultPortfolioValuation[]>(context?.valuations ?? []);
  const [receipts, setReceipts] = useState(context?.receipts ?? []);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const normalizedAddress = address.trim().toLowerCase();
  const rows = useMemo(
    () => snapshot ? buildPortfolioMath(snapshot, assets, valuations) : [],
    [assets, snapshot, valuations]
  );
  const totals = useMemo(() => valueTotals(rows), [rows]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      refreshControllerRef.current?.abort();
    };
  }, []);

  const persistDraft = async (draft: VaultPortfolioContextDraft) => {
    const next = await onSave(draft, savedRef.current, sessionId);
    savedRef.current = next;
    setSaved(next);
    return next;
  };

  const persist = async (
    nextSnapshot: PortfolioSnapshot | null,
    nextValuations: VaultPortfolioValuation[],
    nextReceipts = receipts,
    nextAddress = normalizedAddress
  ) => {
    return persistDraft({
      address: nextAddress,
      label,
      valuations: nextValuations,
      latestSnapshot: nextSnapshot,
      receipts: nextReceipts
    });
  };

  const refresh = async () => {
    if (!ADDRESS.test(normalizedAddress) || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = controller;
    const approvedAt = new Date().toISOString();
    const receipt = {
      id: crypto.randomUUID(),
      address: normalizedAddress,
      providerDestinations: ["alchemy", "blockscout"],
      disclosure: "Blockscout receives this public address for discovery. Alchemy receives the address plus derived public contract and transaction identifiers needed for direct finalized verification.",
      approvedAt,
      outcome: "approved" as const
    };
    const approvedReceipts = [receipt, ...receipts].slice(0, 50);
    let receiptSaved = false;
    let networkStarted = false;
    let networkCompleted = false;
    try {
      const current = savedRef.current;
      await persistDraft(current ? {
        address: current.address,
        label: current.label,
        valuations: current.valuations,
        latestSnapshot: current.latestSnapshot,
        receipts: approvedReceipts
      } : {
        address: normalizedAddress,
        label,
        valuations: [],
        latestSnapshot: null,
        receipts: approvedReceipts
      });
      receiptSaved = true;
      setReceipts(approvedReceipts);
      if (!activeRef.current || controller.signal.aborted) return;
      networkStarted = true;
      const nextSnapshot = await requestPortfolioSnapshot(normalizedAddress, controller.signal);
      networkCompleted = true;
      if (!activeRef.current || controller.signal.aborted) return;
      const completedReceipt = {
        ...receipt,
        providerDestinations: nextSnapshot.privacy.providerDestinations,
        disclosure: nextSnapshot.privacy.disclosure,
        outcome: "completed" as const,
        resolvedAt: new Date().toISOString()
      };
      const nextReceipts = approvedReceipts.map((item) => item.id === receipt.id ? completedReceipt : item);
      const nextValuations = savedRef.current?.address === normalizedAddress ? valuations : [];
      await persist(nextSnapshot, nextValuations, nextReceipts, normalizedAddress);
      if (!activeRef.current || controller.signal.aborted) return;
      setSnapshot(nextSnapshot);
      setValuations(nextValuations);
      setReceipts(nextReceipts);
      setPermissionOpen(false);
      setNotice("Finalized snapshot verified and encrypted inside this local Vault.");
    } catch (refreshError) {
      if (!activeRef.current || controller.signal.aborted) return;
      if (!receiptSaved) {
        setError("The encrypted permission receipt could not be saved, so nothing was sent. Unlock again before retrying.");
      } else if (networkStarted) {
        const failedReceipts = approvedReceipts.map((item) => item.id === receipt.id ? {
          ...receipt,
          outcome: "failed" as const,
          resolvedAt: new Date().toISOString()
        } : item);
        const current = savedRef.current;
        if (current) {
          await persistDraft({
            address: current.address,
            label: current.label,
            valuations: current.valuations,
            latestSnapshot: current.latestSnapshot,
            receipts: failedReceipts
          }).then(() => setReceipts(failedReceipts)).catch(() => undefined);
        }
        setError(networkCompleted
          ? "The address was sent and the finalized refresh completed, but the encrypted snapshot save failed. Your prior snapshot remains unchanged; the encrypted attempt receipt was kept."
          : `${refreshError instanceof ApiError ? refreshError.message : "The finalized portfolio snapshot could not be verified."} Your confirmed address may already have reached the named providers; the encrypted attempt receipt was kept.`);
      } else {
        setError("The finalized portfolio snapshot could not start. Nothing was sent.");
      }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  };

  const saveValuation = async (assetKey: string, unitPrice: string, currency: string) => {
    if (!snapshot || busy) return;
    const normalizedPrice = unitPrice.trim();
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^\d{1,78}(?:\.\d{1,78})?$/.test(normalizedPrice) || !/^[A-Z0-9._-]{1,12}$/.test(normalizedCurrency)) {
      setError("Enter a positive exact decimal reference price and a short currency code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const existing = valuations.find((valuation) => valuation.assetKey === assetKey);
      const valuation: VaultPortfolioValuation = {
        id: existing?.id ?? crypto.randomUUID(),
        assetKey,
        unitPrice: normalizedPrice,
        currency: normalizedCurrency,
        updatedAt: new Date().toISOString()
      };
      const nextValuations = [valuation, ...valuations.filter((item) => item.assetKey !== assetKey)];
      await persist(snapshot, nextValuations);
      setValuations(nextValuations);
      setNotice("Reference price encrypted locally. It was not sent to ChainScout or a provider.");
    } catch {
      setError("The local Vault changed or could not save. Lock and unlock before retrying.");
    } finally {
      setBusy(false);
    }
  };

  const saveLabel = async () => {
    if (!snapshot || normalizedAddress !== snapshot.address || busy) return;
    setBusy(true);
    setError("");
    try {
      await persist(snapshot, valuations);
      setNotice("Wallet label encrypted locally. It never crossed the network.");
    } catch {
      setError("The local Vault changed or could not save. Lock and unlock before retrying.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 space-y-5" data-testid="vault-portfolio-panel">
      <div className="clip-panel border border-[#fa6c34]/35 bg-[#242424] p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.16em] text-[#fa6c34]"><WalletCards size={14} /> FINALIZED PORTFOLIO LENS</p>
            <h2 className="mt-3 text-[28px] font-medium tracking-[-0.03em] text-[#f0e8da]">One local view of what you own.</h2>
            <p className="mt-3 max-w-[720px] text-[12.5px] leading-relaxed text-[#9a938a]">Refresh one public Robinhood Chain address on demand. ChainScout verifies indexed candidates at one finalized block, then encrypts the snapshot, your label, and your reference prices only inside this Vault.</p>
          </div>
          <div className="flex items-center gap-2 border border-[#7fb069]/30 bg-[#7fb069]/5 px-4 py-3 font-mono-d text-[9px] tracking-wider text-[#9fc68f]"><LockKeyhole size={12} /> NO AUTO-REFRESH · NO WALLET CONNECTION</div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.55fr_auto] lg:items-end">
          <PortfolioField label="ROBINHOOD ADDRESS" value={address} onChange={setAddress} placeholder="0x…" />
          <PortfolioField label="PRIVATE LOCAL LABEL" value={label} onChange={setLabel} placeholder="e.g. Main wallet" maxLength={120} />
          <div className="flex gap-2">
            {saved && snapshot?.address === normalizedAddress && (
              <button type="button" onClick={saveLabel} disabled={busy} className="min-h-[44px] border border-[#383838] px-4 font-mono-d text-[9px] tracking-wider text-[#9a938a] disabled:opacity-40">SAVE LABEL</button>
            )}
            <button type="button" onClick={() => setPermissionOpen(true)} disabled={!ADDRESS.test(normalizedAddress) || busy} className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[9.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-35"><RefreshCw size={13} /> REVIEW REFRESH</button>
          </div>
        </div>
        {snapshot && snapshot.address !== normalizedAddress && <p className="mt-3 text-[11px] text-[#e0a96d]">The encrypted snapshot below belongs to {shortAddress(snapshot.address)}. Review and confirm a refresh to replace it with this address.</p>}
      </div>

      {permissionOpen && (
        <div role="dialog" aria-label="Portfolio refresh permission" className="clip-panel border border-[#e0a96d]/50 bg-[#29251f] p-5 sm:p-7">
          <p className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.15em] text-[#e0a96d]"><Eye size={14} /> EXACT NETWORK RECEIPT · CONFIRM BEFORE SENDING</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ReceiptBlock title="SENT FOR THIS REFRESH" lines={[normalizedAddress, "Derived public contract + transaction identifiers needed to verify this address", "ChainScout API", "Alchemy finalized RPC", "Blockscout discovery"]} />
            <ReceiptBlock title="STAYS ENCRYPTED IN THIS BROWSER" lines={[label || "Your local label", "Other saved addresses", "Lots and purchase prices", "Notes, photos, Vault ID and passphrase"]} />
          </div>
          <p className="mt-5 text-[11.5px] leading-relaxed text-[#9a938a]">The address is public chain data, but its association with you can be sensitive. Blockscout receives the address for discovery; Alchemy receives the address plus derived public contract and transaction identifiers needed for direct finalized verification. ChainScout does not save the query or response, and no AI model receives the portfolio.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={refresh} disabled={busy} className="clip-btn-sm flex min-h-[44px] items-center gap-2 bg-[#e0a96d] px-5 font-mono-d text-[9.5px] font-medium tracking-wider text-[#211d18] disabled:opacity-40"><ShieldCheck size={13} /> {busy ? "VERIFYING FINALIZED STATE…" : "CONFIRM ONE-TIME REFRESH"}</button>
            <button type="button" onClick={() => setPermissionOpen(false)} disabled={busy} className="min-h-[44px] border border-[#4a4642] px-5 font-mono-d text-[9.5px] text-[#9a938a]">CANCEL · SEND NOTHING</button>
          </div>
        </div>
      )}

      {error && <div role="alert" className="border border-[#e0738a]/45 bg-[#e0738a]/10 px-5 py-4 text-[12px] text-[#e0738a]">{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 border border-[#7fb069]/35 bg-[#7fb069]/5 px-5 py-4 text-[11.5px] text-[#9fc68f]"><CheckCircle2 size={14} /> {notice}</div>}

      {snapshot && (
        <>
          <SnapshotHeader snapshot={snapshot} totals={totals} label={saved?.label || label} />
          {snapshot.attention.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {snapshot.attention.map((item, index) => (
                <article key={`${item.title}-${index}`} className={`border p-4 ${item.severity === "high" ? "border-[#e0738a]/45 bg-[#e0738a]/8" : item.severity === "medium" ? "border-[#e0a96d]/40 bg-[#e0a96d]/5" : "border-[#383838] bg-[#202020]"}`}>
                  <p className="flex items-center gap-2 text-[12px] font-medium text-[#e9e0d1]"><AlertTriangle size={13} /> {item.title}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#9a938a]">{item.detail}</p>
                </article>
              ))}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => <HoldingCard key={`${snapshot.address}:${row.assetKey}`} row={row} totals={totals} onSave={saveValuation} busy={busy} />)}
          </div>
          <ActivityPanel snapshot={snapshot} />
        </>
      )}
    </section>
  );
}

function SnapshotHeader({ snapshot, totals, label }: {
  snapshot: PortfolioSnapshot;
  totals: Array<{ currency: string; value: string }>;
  label: string;
}) {
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424]">
      <div className="grid gap-px bg-[#383838] sm:grid-cols-2 lg:grid-cols-5">
        <SnapshotMetric label="PROFILE" value={label || shortAddress(snapshot.address)} />
        <SnapshotMetric label="FINALIZED BLOCK" value={snapshot.finality.blockNumber.toLocaleString("en-US")} />
        <SnapshotMetric label="FINALITY LAG" value={age(snapshot.finality.timestamp)} />
        <SnapshotMetric label="VERIFIED HOLDINGS" value={String(1 + snapshot.tokens.length + snapshot.nfts.length)} />
        <SnapshotMetric label="LOCAL REFERENCE VALUE" value={totals.length ? totals.map((total) => `${formatDisplayDecimal(total.value, 2)} ${total.currency}`).join(" · ") : "NOT ENTERED"} />
      </div>
      <div className="flex flex-col gap-2 border-t border-[#383838] px-5 py-4 font-mono-d text-[8.5px] leading-relaxed tracking-wider text-[#635d5a] sm:flex-row sm:items-center sm:justify-between">
        <span>ANCHOR {snapshot.finality.blockHash.slice(0, 14)}… · REFRESHED {new Date(snapshot.finality.fetchedAt).toLocaleString()}</span>
        <span>{snapshot.reconciliation.degradedSources.length ? `PARTIAL · ${snapshot.reconciliation.degradedSources.join(", ")}` : "ALCHEMY DIRECT READS + BLOCKSCOUT DISCOVERY"}</span>
      </div>
    </div>
  );
}

function HoldingCard({ row, totals, onSave, busy }: { row: PortfolioMathRow; totals: Array<{ currency: string; value: string }>; onSave: (key: string, price: string, currency: string) => Promise<void>; busy: boolean }) {
  const [price, setPrice] = useState(row.reference?.unitPrice ?? "");
  const [currency, setCurrency] = useState(row.reference?.currency ?? "USD");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(row.assetKey, price, currency);
  };
  const currencyTotal = row.reference ? totals.find((total) => total.currency === row.reference?.currency) : undefined;
  const allocation = row.currentValue && currencyTotal ? allocationPercent(row.currentValue, currencyTotal.value) : null;
  return (
    <article className="clip-panel border border-[#383838] bg-[#242424] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{row.assetKey.startsWith("nft:") ? "NFT HOLDING" : row.assetKey.startsWith("token:") ? "TOKEN HOLDING" : "NATIVE HOLDING"}</p>
          <h3 className="mt-2 text-[19px] font-medium text-[#f0e8da]">{row.symbol}</h3>
          <p className="mt-1 text-[10.5px] text-[#7f7972]">{row.name}</p>
        </div>
        <p title={row.quantity} className="max-w-[55%] truncate text-right font-mono-d text-[13px] text-[#d6ccba]">{formatDisplayDecimal(row.quantity, 8)}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px bg-[#383838] sm:grid-cols-3">
        <MiniMetric label="VAULT LOT LINK" value={row.linkedAsset ? row.linkedAsset.name : "NOT LINKED"} />
        <MiniMetric label="LOT QUANTITY" value={row.lotQuantity ?? "NOT ENTERED"} tone={row.linkedAsset && !row.quantityMatches ? "warn" : "default"} />
        <MiniMetric label="ACQUISITION COST" value={row.acquisition.length ? row.acquisition.map((cost) => `${formatDisplayDecimal(cost.cost, 2)} ${cost.currency}${cost.complete ? "" : " partial"}`).join(" · ") : "NOT ENTERED"} />
        <MiniMetric label="CURRENT REFERENCE VALUE" value={row.currentValue && row.reference ? `${formatDisplayDecimal(row.currentValue, 2)} ${row.reference.currency}` : "NOT ENTERED"} />
        <MiniMetric label="ALLOCATION IN CURRENCY" value={allocation ? `${allocation}% ${row.reference?.currency}` : "NOT CALCULATED"} />
        <MiniMetric label="UNREALIZED CHANGE" value={row.unrealizedGain && row.reference ? `${formatDisplayDecimal(row.unrealizedGain, 2)} ${row.reference.currency}` : "NOT CALCULATED"} tone={row.unrealizedGain?.startsWith("-") ? "warn" : row.unrealizedGain ? "good" : "default"} />
      </div>
      {row.gainUnavailableReason && <p className="mt-3 text-[10.5px] leading-relaxed text-[#7f7972]">{row.gainUnavailableReason}</p>}
      <form onSubmit={submit} className="mt-4 grid grid-cols-[1fr_0.42fr_auto] items-end gap-2">
        <PortfolioField label="LOCAL UNIT VALUE" value={price} onChange={setPrice} placeholder="0.00" />
        <PortfolioField label="CURRENCY" value={currency} onChange={setCurrency} maxLength={12} />
        <button type="submit" disabled={busy || !price} className="min-h-[42px] border border-[#7fb069]/35 px-3 font-mono-d text-[8.5px] tracking-wider text-[#9fc68f] disabled:opacity-35">SAVE LOCALLY</button>
      </form>
    </article>
  );
}

function ActivityPanel({ snapshot }: { snapshot: PortfolioSnapshot }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
      <section className="clip-panel border border-[#383838] bg-[#242424] p-5">
        <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]"><Activity size={13} /> FINALIZED ACTIVITY · BOUNDED WINDOW</p>
        <div className="mt-4 space-y-2">
          {snapshot.transactions.length === 0 && <EmptyLine>No confirmed activity in the fetched window.</EmptyLine>}
          {snapshot.transactions.map((transaction) => (
            <div key={transaction.hash} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-[#333] bg-[#202020] px-4 py-3 text-[10.5px]">
              <span className={transaction.status === "success" ? "text-[#7fb069]" : "text-[#e0738a]"}>{transaction.status === "success" ? "●" : "×"}</span>
              <div className="min-w-0"><p className="truncate font-mono-d text-[#d6ccba]">{transaction.method || "contract interaction"} · {transaction.hash.slice(0, 12)}…</p><p className="mt-1 text-[9px] text-[#635d5a]">BLOCK {transaction.blockNumber.toLocaleString("en-US")} · {transaction.direction.toUpperCase()} · {transaction.movementCount} MOVEMENT{transaction.movementCount === 1 ? "" : "S"}{transaction.movementCoverage === "partial" ? " · PARTIAL DECODE" : ""}</p></div>
              <span className="font-mono-d text-[9px] text-[#7f7972]">{transaction.nativeValueEth !== "0" ? `${transaction.status === "failed" ? "ATTEMPTED " : ""}${formatDisplayDecimal(transaction.nativeValueEth, 6)} ETH` : "—"}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="clip-panel border border-[#383838] bg-[#242424] p-5">
        <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.14em] text-[#e0a96d]"><DatabaseZap size={13} /> APPROVALS FOUND IN THIS WINDOW</p>
        <p className="mt-3 text-[10.5px] leading-relaxed text-[#7f7972]">This is not a complete approval inventory. ChainScout checks only approval targets discovered in the bounded fetched activity, then reads their current state at the finalized block.</p>
        <div className="mt-4 space-y-2">
          {snapshot.approvals.length === 0 && <EmptyLine>No approval target was confirmed in this window.</EmptyLine>}
          {snapshot.approvals.map((approval) => (
            <div key={`${approval.transactionHash}-${approval.spender}`} className="border border-[#333] bg-[#202020] px-4 py-3">
              <p className={`font-mono-d text-[9.5px] ${approval.active ? "text-[#e0a96d]" : "text-[#7fb069]"}`}>{approval.symbol} · {approval.active ? approval.unlimited ? "ACTIVE BROAD ACCESS" : "ACTIVE" : "INACTIVE"}</p>
              <p className="mt-2 truncate font-mono-d text-[8px] text-[#635d5a]">SPENDER {approval.spender}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="clip-panel border border-[#383838] bg-[#242424] p-5 lg:col-span-2">
        <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.14em] text-[#7fb069]"><DatabaseZap size={13} /> VERIFIED MOVEMENTS · RECEIPT-DECODED</p>
        <p className="mt-3 text-[10.5px] leading-relaxed text-[#7f7972]">Owner-involving native, ERC-20, ERC-721, and ERC-1155 movements decoded from the confirmed receipts above. Partial activity stays visibly marked instead of being presented as zero movement.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {snapshot.movements.length === 0 && <EmptyLine>No verified token or native movement was decoded in this window.</EmptyLine>}
          {snapshot.movements.map((movement, index) => (
            <article key={`${movement.transactionHash}:${movement.kind}:${movement.contract ?? "native"}:${movement.tokenId ?? "none"}:${index}`} className="border border-[#333] bg-[#202020] p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-mono-d text-[9.5px] text-[#d6ccba]">{movement.direction.toUpperCase()} · {movement.kind.toUpperCase()} · {movement.symbol}{movement.tokenId ? ` #${movement.tokenId}` : ""}</p><p title={movement.quantity} className="mt-2 break-all font-mono-d text-[12px] text-[#f0e8da]">{formatDisplayDecimal(movement.quantity, 8)}</p></div>
                <span className="font-mono-d text-[8px] text-[#635d5a]">BLOCK {movement.blockNumber.toLocaleString("en-US")}</span>
              </div>
              <p className="mt-3 break-all font-mono-d text-[8px] leading-relaxed text-[#635d5a]">{movement.contract ? `CONTRACT ${movement.contract}` : "NATIVE ETH"}{movement.counterparty ? ` · COUNTERPARTY ${movement.counterparty}` : ""}</p>
              <p className="mt-2 font-mono-d text-[8px] text-[#635d5a]">TX {movement.transactionHash.slice(0, 18)}… · SOURCES {movement.sourceIds.join(" + ")}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 border-t border-[#333] pt-4">
          <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">SNAPSHOT SOURCES</p>
          <div className="mt-2 space-y-1">
            {snapshot.citations.map((citation) => <p key={citation.id} className="break-all text-[9.5px] leading-relaxed text-[#7f7972]">{citation.provider.toUpperCase()} · {citation.description} · {citation.url}</p>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function ReceiptBlock({ title, lines }: { title: string; lines: string[] }) {
  return <div className="border border-[#4a4642] bg-[#211f1c] p-4"><p className="font-mono-d text-[8.5px] tracking-wider text-[#e0a96d]">{title}</p><ul className="mt-3 space-y-2 text-[10.5px] text-[#9a938a]">{lines.map((line) => <li key={line} className="break-all">· {line}</li>)}</ul></div>;
}

function PortfolioField({ label, value, onChange, placeholder, maxLength = 200 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number }) {
  return <label className="block"><span className="font-mono-d text-[8.5px] tracking-[0.13em] text-[#635d5a]">{label}</span><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} autoComplete="off" className="mt-2 min-h-[42px] w-full border border-[#383838] bg-[#1d1d1d] px-3 font-mono-d text-[10.5px] text-[#e9e0d1] outline-none placeholder:text-[#4f4a46] focus:border-[#fa6c34]" /></label>;
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-[#202020] p-4"><p className="font-mono-d text-[7.5px] tracking-wider text-[#635d5a]">{label}</p><p title={value} className="mt-3 truncate font-mono-d text-[10.5px] text-[#d6ccba]">{value}</p></div>;
}

function MiniMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "warn" }) {
  return <div className="min-w-0 bg-[#202020] p-3"><p className="font-mono-d text-[7px] tracking-wider text-[#635d5a]">{label}</p><p title={value} className={`mt-2 truncate font-mono-d text-[9px] ${tone === "good" ? "text-[#7fb069]" : tone === "warn" ? "text-[#e0a96d]" : "text-[#d6ccba]"}`}>{value}</p></div>;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-[#383838] px-4 py-5 text-center text-[10.5px] text-[#635d5a]">{children}</div>;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function age(timestamp: string): string {
  const milliseconds = Math.max(0, Date.now() - Date.parse(timestamp));
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return "<1 MINUTE";
  if (minutes < 120) return `${minutes} MINUTES`;
  const hours = Math.floor(minutes / 60);
  return `${hours} HOURS`;
}
