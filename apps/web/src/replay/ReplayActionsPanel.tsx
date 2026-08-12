import type { ApprovedMerchantDirectoryResponse } from "@rh-chain/shared";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ExternalLink,
  History,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ApiError } from "../dashboard/http";
import { fetchApprovedMerchants, fetchMerchantInventory } from "../market/api";
import { QuotePanel } from "../pages/ScoutSwap";
import {
  SWAP_TOKENS,
  getScoutSwapQuote,
  type ScoutSwapQuote,
  type SwapDirection,
} from "../swap/api";
import type {
  VaultAsset,
  VaultMarketContext,
  VaultMarketContextDraft,
  VaultMarketReceipt,
  VaultPortfolioContext,
} from "../vault/types";
import { vaultErrorMessage } from "../vault/crypto";
import {
  currentPurchaseOffer,
  deriveTradeReplayCandidates,
  purchaseAssets,
  purchaseSelections,
  type CurrentPurchaseOffer,
  type PurchaseReplaySelection,
  type TradeReplayCandidate,
} from "./model";

type Props = {
  assets: VaultAsset[];
  portfolios: VaultPortfolioContext[];
  markets: VaultMarketContext[];
  sessionId: number;
  onSaveContext: (
    draft: VaultMarketContextDraft,
    existing?: VaultMarketContext,
    expectedSession?: number,
  ) => Promise<VaultMarketContext>;
};

export function ReplayActionsPanel({ assets, portfolios, markets, sessionId, onSaveContext }: Props) {
  const candidates = useMemo(
    () => deriveTradeReplayCandidates(portfolios.map((portfolio) => portfolio.latestSnapshot)),
    [portfolios],
  );
  return (
    <section className="mt-5 space-y-5" data-testid="replay-actions-panel" data-session={sessionId}>
      <header className="clip-panel border border-[#fa6c34]/40 bg-[#242424] p-5 sm:p-7">
        <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]"><History size={14} /> RELEASE 08 · SAFE REBUILD</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_0.62fr] lg:items-end">
          <div>
            <h2 className="text-[31px] font-medium leading-tight tracking-[-0.035em] text-[#f0e8da] sm:text-[40px]">Repeat the idea.<br /><span className="text-[#fa6c34]">Never replay the old action.</span></h2>
            <p className="mt-4 max-w-[760px] text-[12.5px] leading-relaxed text-[#9a938a]">ChainScout can recognize one narrow, complete WETH/USDG movement pattern already inside your encrypted snapshot. You choose the direction again, type a new amount, and request a fresh quote. Historical calldata, approvals, amounts, carts, orders, and checkout state are never reused.</p>
          </div>
          <div className="border border-[#7fb069]/30 bg-[#7fb069]/5 p-4">
            <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-wider text-[#9fc68f]"><LockKeyhole size={12} /> LOCAL HISTORY BOUNDARY</p>
            <p className="mt-3 text-[10.5px] leading-relaxed text-[#7f7972]">The historical hash and wallet snapshot stay in this unlocked Vault. The new pair and amount go transiently to ChainScout and Uniswap and may be held in a quote cache for less than 30 seconds.</p>
          </div>
        </div>
      </header>

      <TradeReplay
        key={`${sessionId}:${candidates.map((candidate) => candidate.id).join("|")}`}
        candidates={candidates}
        sessionId={sessionId}
      />
      <PurchaseReplay
        key={`${sessionId}:${assets.map((asset) => asset.id).join("|")}`}
        assets={assets}
        markets={markets}
        sessionId={sessionId}
        onSaveContext={onSaveContext}
      />
    </section>
  );
}

function TradeReplay({ candidates, sessionId }: { candidates: TradeReplayCandidate[]; sessionId: number }) {
  const [selectedId, setSelectedId] = useState("");
  const [direction, setDirection] = useState<SwapDirection | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ScoutSwapQuote | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const input = direction === "USDG_TO_WETH" ? SWAP_TOKENS.USDG : SWAP_TOKENS.WETH;
  const amountValid = direction !== null && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) && Number(amount) > 0 && (amount.split(".")[1]?.length ?? 0) <= input.decimals;

  useEffect(() => () => controllerRef.current?.abort(), [sessionId]);
  useEffect(() => {
    if (!quote || receivedAt === null) return;
    const timer = window.setInterval(() => setElapsedMs(performance.now() - receivedAt), 250);
    return () => window.clearInterval(timer);
  }, [quote, receivedAt]);

  const resetResult = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setQuote(null);
    setReceivedAt(null);
    setElapsedMs(0);
    setError("");
  };

  const chooseHistory = (id: string) => {
    resetResult();
    setSelectedId(id);
    setDirection(null);
    setAmount("");
  };

  const requestQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !direction || !amountValid || busy) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    setQuote(null);
    try {
      const response = await getScoutSwapQuote({ direction, amount }, controller.signal);
      if (controller.signal.aborted) return;
      setReceivedAt(performance.now());
      setElapsedMs(0);
      setQuote(response);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(requestError instanceof ApiError
        ? requestError.message
        : requestError instanceof Error
          ? requestError.message
          : "The fresh Uniswap preview is unavailable.");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <section className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle icon={<ArrowLeftRight size={14} />} eyebrow="TRADE REBUILD" title="Start from a supported movement—not old calldata" />
      {candidates.length === 0 ? (
        <div className="mt-5 border border-dashed border-[#4a4541] bg-[#202020] p-5 text-[11px] leading-relaxed text-[#7f7972]">No eligible trade pattern is present in the saved portfolio snapshot. Refresh Portfolio Intelligence first. ChainScout intentionally rejects failed, partial, truncated, multi-action, native, NFT, and unsupported-token histories.</div>
      ) : (
        <>
          <label className="mt-5 block">
            <span className="font-mono-d text-[8.5px] tracking-[0.14em] text-[#635d5a]">LOCAL HISTORICAL EVIDENCE</span>
            <select aria-label="Local historical movement" value={selectedId} onChange={(event) => chooseHistory(event.target.value)} className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-3 font-mono-d text-[9.5px] text-[#d6ccba]">
              <option value="">Choose one complete supported movement pattern</option>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>BLOCK {candidate.blockNumber} · {candidate.suggestedDirection.replaceAll("_", " → ")} · {candidate.transactionHash.slice(0, 14)}…</option>)}
            </select>
          </label>
          {selected && (
            <form onSubmit={requestQuote} className="mt-5 border border-[#383838] bg-[#202020] p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <p className="font-mono-d text-[8px] tracking-[0.14em] text-[#635d5a]">HISTORY SUGGESTS · NOT PROVEN INTENT</p>
                  <p className="mt-2 font-mono-d text-[11px] text-[#d6ccba]">{selected.suggestedDirection.replaceAll("_", " → ")}</p>
                  <p className="mt-2 break-all font-mono-d text-[8px] text-[#635d5a]">TX {selected.transactionHash}</p>
                </div>
                <div>
                  <p className="font-mono-d text-[8px] tracking-[0.14em] text-[#635d5a]">CHOOSE THE NEW DIRECTION YOURSELF</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["WETH_TO_USDG", "USDG_TO_WETH"] as const).map((choice) => <button type="button" key={choice} aria-pressed={direction === choice} onClick={() => { resetResult(); setDirection(choice); setAmount(""); }} className={`min-h-[44px] border px-3 font-mono-d text-[9px] ${direction === choice ? "border-[#fa6c34] bg-[#fa6c34] text-[#1d1d1d]" : "border-[#4a4541] text-[#9a938a] hover:border-[#fa6c34]"}`}>{choice === "WETH_TO_USDG" ? "WETH → USDG" : "USDG → WETH"}</button>)}
                  </div>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="font-mono-d text-[8.5px] tracking-[0.14em] text-[#635d5a]">NEW AMOUNT · NEVER PREFILLED FROM HISTORY</span>
                <input aria-label="New replay amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => { resetResult(); setAmount(event.target.value); }} placeholder={direction ? `New ${input.symbol} amount` : "Choose direction first"} disabled={!direction || busy} className="mt-2 min-h-[48px] w-full border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[18px] text-[#f0e8da] outline-none placeholder:text-[#4f4a46] focus:border-[#fa6c34] disabled:opacity-45" />
              </label>
              <button type="submit" disabled={!amountValid || busy} className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[10px] font-semibold tracking-[0.12em] text-[#1d1d1d] disabled:opacity-35">{busy ? <><RefreshCw size={13} className="animate-spin" /> FETCHING FRESH QUOTE…</> : <><ShieldCheck size={13} /> BUILD NEW READ-ONLY PREVIEW</>}</button>
              <p className="mt-3 text-[10px] leading-relaxed text-[#635d5a]">The request contains only this newly chosen direction and amount. It contains no historical hash, wallet, old amount, method, approval, or transaction data.</p>
            </form>
          )}
        </>
      )}
      {error && <div role="alert" className="mt-4 flex gap-3 border border-[#e0738a]/35 bg-[#e0738a]/5 p-4 text-[11px] text-[#d99aab]"><AlertTriangle size={14} className="shrink-0" />{error}</div>}
      {quote && <div className="mt-5"><QuotePanel quote={quote} elapsedMs={elapsedMs} /></div>}
    </section>
  );
}

function PurchaseReplay({
  assets,
  markets,
  sessionId,
  onSaveContext,
}: {
  assets: VaultAsset[];
  markets: VaultMarketContext[];
  sessionId: number;
  onSaveContext: Props["onSaveContext"];
}) {
  const [directory, setDirectory] = useState<ApprovedMerchantDirectoryResponse | null>(null);
  const [selectionKey, setSelectionKey] = useState("");
  const [pending, setPending] = useState<PurchaseReplaySelection | null>(null);
  const [permissionTrigger, setPermissionTrigger] = useState<HTMLElement | null>(null);
  const [offer, setOffer] = useState<CurrentPurchaseOffer | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const contextRef = useRef<VaultMarketContext | undefined>(markets[0]);
  const selections = useMemo(() => directory ? purchaseSelections(assets, directory) : [], [assets, directory]);
  const selection = selections.find((candidate) => selectionId(candidate) === selectionKey) ?? null;
  const current = deadline !== null && now < deadline;
  const eligibleAssets = purchaseAssets(assets);

  useEffect(() => () => controllerRef.current?.abort(), [sessionId]);
  useEffect(() => {
    contextRef.current = markets[0];
  }, [markets]);
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const resetOffer = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setOffer(null);
    setDeadline(null);
    setNow(performance.now());
    setError("");
    setPending(null);
  };

  const draftFor = (
    overrides: Partial<VaultMarketContextDraft> = {},
  ): VaultMarketContextDraft => ({
    cryptoObservations: contextRef.current?.cryptoObservations ?? [],
    merchantObservations: contextRef.current?.merchantObservations ?? [],
    comparisons: contextRef.current?.comparisons ?? [],
    receipts: contextRef.current?.receipts ?? [],
    ...overrides,
  });

  const persistReceipt = async (
    receipt: VaultMarketReceipt,
  ): Promise<VaultMarketContext> => {
    const receipts = [
      ...(contextRef.current?.receipts ?? []).filter((item) => item.id !== receipt.id),
      receipt,
    ].slice(-50);
    const saved = await onSaveContext(
      draftFor({ receipts }),
      contextRef.current,
      sessionId,
    );
    contextRef.current = saved;
    return saved;
  };

  const loadDirectory = async () => {
    if (busy) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    setOffer(null);
    try {
      const response = await fetchApprovedMerchants(controller.signal);
      if (controller.signal.aborted) return;
      purchaseSelections(assets, response);
      setDirectory(response);
      setSelectionKey("");
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "The approved merchant directory is unavailable.");
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
    }
  };

  const refreshOffer = async () => {
    if (!pending || busy) return;
    const request = pending;
    setPending(null);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setBusy(true);
    setError("");
    setOffer(null);
    const receipt: VaultMarketReceipt = {
      id: crypto.randomUUID(),
      operation: "merchant",
      publicIdentifier: `merchant:${request.merchant.id}:product:${request.mapping.productId}`,
      merchantMapping: {
        sku: request.mapping.sku,
        productId: request.mapping.productId,
        reviewedAt: request.mapping.reviewedAt,
      },
      providerDestinations: [request.merchant.name],
      disclosure: `ChainScout receives merchant ${request.merchant.id}, canonical asset ${request.asset.identifier}, reviewed SKU ${request.mapping.sku}, expected product ${request.mapping.productId}, and mapping review date ${request.mapping.reviewedAt}. ${request.merchant.name} receives only the reviewed SKU and expected product ID. No historic lot, price, quantity, cart, order, coupon, wallet, note, photo, or other Vault field is sent.`,
      approvedAt: new Date().toISOString(),
      outcome: "approved",
    };
    let receiptSaved = false;
    let providerCompleted = false;
    let offerValidated = false;
    try {
      await persistReceipt(receipt);
      receiptSaved = true;
      if (controller.signal.aborted) return;
      const response = await fetchMerchantInventory(request.merchant.id, request.asset.identifier, {
        sku: request.mapping.sku,
        productId: request.mapping.productId,
        reviewedAt: request.mapping.reviewedAt,
      }, controller.signal);
      providerCompleted = true;
      if (controller.signal.aborted) return;
      const next = currentPurchaseOffer(request, response, Date.now());
      offerValidated = true;
      await persistReceipt({
        ...receipt,
        outcome: "completed",
        resolvedAt: new Date().toISOString(),
      });
      if (controller.signal.aborted) return;
      const received = performance.now();
      setOffer(next);
      setDeadline(received + next.freshForMs);
      setNow(received);
      setPending(null);
    } catch (requestError) {
      if (!controller.signal.aborted) {
        if (!receiptSaved) {
          setError(`The encrypted permission receipt could not be saved. ${vaultErrorMessage(requestError)} ChainScout did not contact the merchant.`);
        } else if (providerCompleted && offerValidated) {
          setError(`The merchant returned a result and the approved public identifiers were sent, but ${vaultErrorMessage(requestError)} The offer was not displayed or persisted.`);
        } else if (providerCompleted) {
          setError(`${requestError instanceof Error ? requestError.message : "The merchant returned an invalid result."} The approved public identifiers were sent, but no handoff was created.`);
          await persistReceipt({
            ...receipt,
            outcome: "failed",
            resolvedAt: new Date().toISOString(),
          }).catch(() => undefined);
        } else {
          setError(requestError instanceof Error ? requestError.message : "The merchant request failed after approval. The public identifiers may already have been sent.");
          await persistReceipt({
            ...receipt,
            outcome: "failed",
            resolvedAt: new Date().toISOString(),
          }).catch(() => undefined);
        }
      }
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
    }
  };

  const cancelPending = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setPending(null);
  };

  return (
    <section className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle icon={<PackageCheck size={14} />} eyebrow="PURCHASE REBUILD" title="Choose a new reviewed offer—never an old cart" />
      <p className="mt-3 max-w-[820px] text-[11.5px] leading-relaxed text-[#8e8881]">A recorded local asset can only match an actively reviewed merchant mapping. ChainScout requests a new product observation after your confirmation, then opens only the normalized merchant product page. The merchant independently reconfirms price, stock, quantity, shipping, tax, payment, and checkout.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
        <div className="border border-[#383838] bg-[#202020] p-4">
          <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">ELIGIBLE LOCAL ASSETS</p>
          <p className="mt-2 font-mono-d text-[22px] text-[#f0e8da]">{eligibleAssets.length}</p>
          <p className="mt-2 text-[10px] leading-relaxed text-[#7f7972]">An asset needs an exact identifier and at least one positive recorded lot. Lot price, quantity, notes, photos, and ownership never enter the merchant request.</p>
        </div>
        <div className="border border-[#383838] bg-[#202020] p-4">
          <button type="button" onClick={loadDirectory} disabled={busy} className="flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#fa6c34]/50 bg-[#fa6c34]/5 px-4 font-mono-d text-[9px] tracking-wider text-[#fa6c34] disabled:opacity-35"><RefreshCw size={12} className={busy ? "animate-spin" : ""} /> CHECK CURRENT APPROVED STORES</button>
          {directory && directory.merchants.length === 0 && <p className="mt-3 border border-[#e0a96d]/25 p-3 text-[10.5px] leading-relaxed text-[#e0a96d]">NO APPROVED MERCHANT IS ENABLED YET. Purchase rebuild stays unavailable until a store opts in and its exact product mapping is code-reviewed.</p>}
          {selections.length > 0 && <label className="mt-3 block"><span className="font-mono-d text-[8px] text-[#635d5a]">CURRENT REVIEWED ASSET / MERCHANT MATCH</span><select aria-label="Current reviewed purchase match" value={selectionKey} onChange={(event) => { resetOffer(); setSelectionKey(event.target.value); }} className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-3 font-mono-d text-[9px] text-[#d6ccba]"><option value="">Choose a new offer source</option>{selections.map((candidate) => <option key={selectionId(candidate)} value={selectionId(candidate)}>{candidate.asset.name} · {candidate.merchant.name} · SKU {candidate.mapping.sku}</option>)}</select></label>}
        </div>
      </div>
      {selection && !offer && <div className="mt-4 border border-[#fa6c34]/40 bg-[#211f1c] p-4"><p className="font-mono-d text-[8.5px] tracking-[0.14em] text-[#fa6c34]">EXACT NETWORK RECEIPT</p><ul className="mt-3 space-y-2 text-[10.5px] text-[#9a938a]"><li>· ChainScout receives merchant {selection.merchant.id}, canonical asset {selection.asset.identifier}, SKU {selection.mapping.sku}, product {selection.mapping.productId}, and review date {selection.mapping.reviewedAt}.</li><li>· The opted-in merchant receives only its reviewed SKU and expected product ID.</li><li>· No lot, historic purchase price, quantity, cart, order, coupon, cookie, wallet, note, photo, or other Vault field is sent.</li><li>· This approval attempt is encrypted locally before ChainScout contacts the merchant.</li></ul><button type="button" onClick={(event) => { setPermissionTrigger(event.currentTarget); setPending(selection); }} disabled={busy} className="mt-4 min-h-[44px] border border-[#fa6c34] bg-[#fa6c34] px-5 font-mono-d text-[9px] font-semibold tracking-wider text-[#1d1d1d]">REVIEW & CONFIRM NEW OFFER LOOKUP</button></div>}
      {pending && (
        <PurchasePermissionDialog
          busy={busy}
          returnFocus={permissionTrigger}
          onCancel={cancelPending}
          onConfirm={refreshOffer}
        />
      )}
      {error && <div role="alert" className="mt-4 flex gap-3 border border-[#e0738a]/35 bg-[#e0738a]/5 p-4 text-[11px] text-[#d99aab]"><AlertTriangle size={14} className="shrink-0" />{error}</div>}
      {offer && <article className="mt-5 border border-[#7fb069]/35 bg-[#202020] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono-d text-[8px] tracking-wider text-[#7fb069]">{current ? "CURRENT REVIEWED OFFER" : "OFFER EXPIRED · REFRESH REQUIRED"}</p><h3 className="mt-2 text-[18px] text-[#f0e8da]">{offer.title}</h3><p className="mt-2 text-[11px] text-[#9a938a]">{offer.merchantName} · {offer.condition} · {offer.unitPrice} {offer.currency}</p><p className="mt-2 font-mono-d text-[8px] text-[#635d5a]">SKU {offer.sku} · PRODUCT {offer.productId} · {offer.inventoryState.replaceAll("_", " ")}</p></div>{current ? <a href={offer.url} target="_blank" rel="noreferrer noopener" className="flex min-h-[44px] items-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[9px] font-semibold tracking-wider text-[#1d1d1d]">OPEN MERCHANT PRODUCT <ExternalLink size={12} /></a> : <span className="border border-[#e0a96d]/30 px-4 py-3 font-mono-d text-[8px] text-[#e0a96d]">NO CURRENT HANDOFF</span>}</div><p className="mt-4 flex items-start gap-2 text-[10.5px] leading-relaxed text-[#7f7972]"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#7fb069]" />This opens a product page only. ChainScout does not create a cart, choose quantity, apply a coupon, submit an order, collect payment, or call it checkout.</p></article>}
      {markets.length > 0 && <p className="mt-4 text-[9px] leading-relaxed text-[#635d5a]">Saved Market & Inventory records remain readable for research, but imported or previously saved offer URLs are never trusted as replay handoffs. A new directory check and exact offer refresh are always required.</p>}
    </section>
  );
}

function PanelTitle({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return <div><p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.15em] text-[#fa6c34]">{icon}{eyebrow}</p><h2 className="mt-3 text-[24px] font-medium tracking-[-0.025em] text-[#f0e8da]">{title}</h2></div>;
}

function PurchasePermissionDialog({
  busy,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  returnFocus: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    cancelRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
      queueMicrotask(() => returnFocus?.focus());
    };
  }, [returnFocus]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div ref={dialogRef} onKeyDown={onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="replay-purchase-title">
      <div className="clip-panel w-full max-w-[560px] border border-[#fa6c34] bg-[#242424] p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-d text-[9px] text-[#fa6c34]">CONFIRM CURRENT OFFER LOOKUP</p>
            <h3 id="replay-purchase-title" className="mt-3 text-[22px] text-[#f0e8da]">Ask the merchant for a new product result?</h3>
          </div>
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} aria-label="Cancel current merchant lookup" className="p-2 text-[#635d5a] hover:text-[#f0e8da] disabled:opacity-35"><X size={16} /></button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-[#9a938a]">This requests a new result. It does not repeat the original purchase or create a cart.</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-[44px] flex-1 border border-[#4a4541] px-4 font-mono-d text-[9px] text-[#9a938a] disabled:opacity-35">CANCEL</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="min-h-[44px] flex-1 bg-[#fa6c34] px-4 font-mono-d text-[9px] font-semibold text-[#1d1d1d] disabled:opacity-35">{busy ? "REFRESHING…" : "CONFIRM & REFRESH"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function selectionId(selection: PurchaseReplaySelection): string {
  return `${selection.asset.id}:${selection.merchant.id}:${selection.mapping.productId}`;
}
