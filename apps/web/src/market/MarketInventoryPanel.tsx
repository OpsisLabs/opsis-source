import type {
  ApprovedMerchantDirectoryResponse,
  CryptoMarketResponse,
  MerchantInventoryResponse,
} from "@rh-chain/shared";
import {
  BarChart3,
  Boxes,
  Calculator,
  ExternalLink,
  Search,
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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type {
  VaultAsset,
  VaultMarketComparison,
  VaultMarketContext,
  VaultMarketContextDraft,
  VaultMarketReceipt,
} from "../vault/types";
import { vaultErrorMessage } from "../vault/crypto";
import {
  fetchApprovedMerchants,
  fetchCryptoMarket,
  fetchMerchantInventory,
} from "./api";
import { buildMarketHandoffs, calculateLandedCosts } from "./math";
import { DealBrief } from "../deals/DealBrief";
import { Benchmarks } from "../deals/Benchmarks";

type Props = {
  dealsOnly?: boolean;
  assets: VaultAsset[];
  context?: VaultMarketContext;
  sessionId: number;
  onSaveContext: (
    draft: VaultMarketContextDraft,
    existing?: VaultMarketContext,
    expectedSession?: number,
  ) => Promise<VaultMarketContext>;
};

type PendingRequest =
  | {
      operation: "crypto";
      contract: string;
      publicIdentifier: string;
      providers: string[];
      chainScoutSummary: string;
      providerSummary: string;
      disclosure: string;
    }
  | {
      operation: "merchant";
      merchantId: string;
      canonicalAssetId: string;
      sku: string;
      productId: string;
      reviewedAt: string;
      publicIdentifier: string;
      providers: string[];
      chainScoutSummary: string;
      providerSummary: string;
      disclosure: string;
    };

type ComparisonDraft = {
  canonicalAssetId: string;
  label: string;
  providerName: string;
  sourceUrl: string;
  currency: string;
  itemUnitPrice: string;
  quantity: string;
  shipping: string;
  tax: string;
  duty: string;
  fees: string;
  discount: string;
  inventoryState: VaultMarketComparison["inventoryState"];
  condition: string;
  region: string;
  returnNotes: string;
  sourceKind: VaultMarketComparison["sourceKind"];
  identityConfidence: VaultMarketComparison["identityConfidence"];
  merchantMapping: VaultMarketComparison["merchantMapping"];
  observedAt: string;
  freshForMs: number;
};

const EMPTY_COMPARISON: ComparisonDraft = {
  canonicalAssetId: "",
  label: "",
  providerName: "Owner-entered source",
  sourceUrl: "",
  currency: "USD",
  itemUnitPrice: "",
  quantity: "1",
  shipping: "",
  tax: "",
  duty: "",
  fees: "",
  discount: "",
  inventoryState: "owner_available",
  condition: "",
  region: "",
  returnNotes: "",
  sourceKind: "owner_entered",
  identityConfidence: "candidate",
  merchantMapping: null,
  observedAt: "",
  freshForMs: 86_400_000,
};

export function MarketInventoryPanel({
  dealsOnly = false,
  assets,
  context,
  sessionId,
  onSaveContext,
}: Props) {
  const [contract, setContract] = useState(
    cryptoIdentifier(
      assets.find((asset) => asset.assetType === "crypto")?.identifier ?? "",
    ),
  );
  const [merchantId, setMerchantId] = useState("");
  const [merchantAssetId, setMerchantAssetId] = useState(
    assets.find((asset) => asset.identifier)?.identifier ?? "",
  );
  const [merchantSku, setMerchantSku] = useState("");
  const [merchantProductId, setMerchantProductId] = useState("");
  const [merchantMappingReviewedAt, setMerchantMappingReviewedAt] =
    useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantPermissionEvidence, setMerchantPermissionEvidence] =
    useState("");
  const [merchantMappingEvidence, setMerchantMappingEvidence] = useState("");
  const [directory, setDirectory] =
    useState<ApprovedMerchantDirectoryResponse | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comparison, setComparison] = useState(EMPTY_COMPARISON);
  const [providerDraftDeadline, setProviderDraftDeadline] = useState<
    number | null
  >(null);
  const [freshDeadlines, setFreshDeadlines] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [freshnessNow, setFreshnessNow] = useState(0);
  const [handoffAssetId, setHandoffAssetId] = useState(
    assets.find((asset) => asset.collectible)?.id ?? "",
  );
  const [permissionTrigger, setPermissionTrigger] =
    useState<HTMLElement | null>(null);
  const contextRef = useRef(context);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const refresh = () => setFreshnessNow(performance.now());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  useEffect(() => {
    const now = performance.now();
    const next = Math.min(
      ...[...freshDeadlines.values()].filter((deadline) => deadline > now),
    );
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(
      () => setFreshnessNow(performance.now()),
      Math.max(0, next - now + 1),
    );
    return () => window.clearTimeout(timer);
  }, [freshDeadlines, freshnessNow]);

  const draftFor = (
    overrides: Partial<VaultMarketContextDraft> = {},
  ): VaultMarketContextDraft => ({
    cryptoObservations: contextRef.current?.cryptoObservations ?? [],
    merchantObservations: contextRef.current?.merchantObservations ?? [],
    comparisons: contextRef.current?.comparisons ?? [],
    receipts: contextRef.current?.receipts ?? [],
    ...overrides,
  });

  const saveContext = async (
    draft: VaultMarketContextDraft,
  ): Promise<VaultMarketContext> => {
    const saved = await onSaveContext(draft, contextRef.current, sessionId);
    contextRef.current = saved;
    return saved;
  };

  const persistReceipt = async (
    receipt: VaultMarketReceipt,
  ): Promise<VaultMarketContext> => {
    const receipts = [
      ...(contextRef.current?.receipts ?? []).filter(
        (item) => item.id !== receipt.id,
      ),
      receipt,
    ].slice(-50);
    return saveContext(draftFor({ receipts }));
  };

  const askCryptoPermission = (event: FormEvent) => {
    event.preventDefault();
    const normalized = contract.trim().toLowerCase();
    if (busy || !/^0x[0-9a-f]{40}$/.test(normalized)) return;
    setPermissionTrigger(submitter(event));
    setPending({
      operation: "crypto",
      contract: normalized,
      publicIdentifier: `eip155:4663/erc20:${normalized}`,
      providers: ["DEX Screener"],
      chainScoutSummary: `Robinhood Chain 4663 · ${normalized}`,
      providerSummary: `Robinhood token-pairs lookup · ${normalized}`,
      disclosure:
        "The exact public chain ID and token contract go transiently to ChainScout and DEX Screener. Ownership, lots, costs, labels, notes, photos, other assets, cookies, wallet connections, and AI are excluded.",
    });
  };

  const askMerchantPermission = (event: FormEvent) => {
    event.preventDefault();
    const merchant = merchantId.trim().toLowerCase();
    const asset = merchantAssetId.trim().toLowerCase();
    if (
      busy ||
      !/^[a-z0-9-]{2,64}$/.test(merchant) ||
      asset.length < 3 ||
      !merchantSku ||
      !merchantProductId ||
      !merchantMappingReviewedAt
    )
      return;
    setPermissionTrigger(submitter(event));
    setPending({
      operation: "merchant",
      merchantId: merchant,
      canonicalAssetId: asset,
      sku: merchantSku,
      productId: merchantProductId,
      reviewedAt: merchantMappingReviewedAt,
      publicIdentifier: `${merchant}:${asset}`,
      providers: [merchantName || `approved merchant ${merchant}`],
      chainScoutSummary: `Merchant ID ${merchant} · canonical asset ${asset} · reviewed SKU ${merchantSku} · expected product ID ${merchantProductId} · mapping reviewed ${merchantMappingReviewedAt}`,
      providerSummary: `Exact reviewed SKU ${merchantSku} · expected product ID ${merchantProductId}`,
      disclosure:
        "The public canonical asset ID, approved merchant ID, reviewed SKU, expected product ID, and mapping review date go transiently to ChainScout. Only the reviewed SKU and expected product ID go to that opted-in merchant. Ownership, lots, costs, labels, notes, photos, other assets, cookies, wallet connections, and AI are excluded.",
    });
  };

  const loadApprovedMerchants = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    try {
      const response = await fetchApprovedMerchants(controller.signal, dealsOnly);
      setDirectory(response);
      if (response.merchants.length === 0) {
        setNotice(
          "No merchant is enabled yet. Live stock stays off until a store affirmatively opts in and its exact product mapping is reviewed.",
        );
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The approved merchant directory could not be loaded.",
        );
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const runPending = async () => {
    if (!pending || busy) return;
    const request = pending;
    setPending(null);
    setBusy(true);
    setError("");
    setNotice("");
    if (
      request.operation === "merchant" &&
      comparison.sourceKind === "provider_offer"
    ) {
      setComparison(EMPTY_COMPARISON);
      setProviderDraftDeadline(null);
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const receipt: VaultMarketReceipt = {
      id: crypto.randomUUID(),
      operation: request.operation,
      publicIdentifier: request.publicIdentifier,
      merchantMapping:
        request.operation === "merchant"
          ? {
              sku: request.sku,
              productId: request.productId,
              reviewedAt: request.reviewedAt,
            }
          : null,
      providerDestinations: request.providers,
      disclosure: request.disclosure,
      approvedAt: new Date().toISOString(),
      outcome: "approved",
    };
    let receiptSaved = false;
    let providerCompleted = false;
    try {
      await persistReceipt(receipt);
      receiptSaved = true;
      if (controller.signal.aborted) return;
      if (request.operation === "crypto") {
        const response = await fetchCryptoMarket(
          request.contract,
          controller.signal,
        );
        providerCompleted = true;
        const observations = [
          response,
          ...(contextRef.current?.cryptoObservations ?? []).filter(
            (item) => item.canonicalAssetId !== response.canonicalAssetId,
          ),
        ].slice(0, 10);
        const receipts = replaceReceipt(
          contextRef.current?.receipts ?? [],
          receipt,
          "completed",
        );
        await saveContext(
          draftFor({ cryptoObservations: observations, receipts }),
        );
        const receivedAt = performance.now();
        setFreshDeadlines((deadlines) =>
          new Map(deadlines).set(
            cryptoFreshnessKey(response.canonicalAssetId),
            receivedAt + response.freshForMs,
          ),
        );
        setFreshnessNow(receivedAt);
        setNotice(
          response.pairs.length
            ? `${response.pairsShown} exact-contract pool observation${response.pairsShown === 1 ? "" : "s"} saved encrypted. These are indexed references, not executable quotes.`
            : "DEX Screener returned a valid empty pair collection. That does not prove no pool exists elsewhere.",
        );
      } else {
        const response = await fetchMerchantInventory(
          request.merchantId,
          request.canonicalAssetId,
          {
            sku: request.sku,
            productId: request.productId,
            reviewedAt: request.reviewedAt,
          },
          controller.signal,
          dealsOnly,
        );
        providerCompleted = true;
        const observationIdentity = merchantObservationKey(
          response.merchant.id,
          response.canonicalAssetId,
        );
        const observations = [
          response,
          ...(contextRef.current?.merchantObservations ?? []).filter(
            (item) =>
              merchantObservationKey(
                item.merchant.id,
                item.canonicalAssetId,
              ) !== observationIdentity,
          ),
        ].slice(0, 50);
        const receipts = replaceReceipt(
          contextRef.current?.receipts ?? [],
          receipt,
          "completed",
        );
        await saveContext(
          draftFor({ merchantObservations: observations, receipts }),
        );
        const receivedAt = performance.now();
        setFreshDeadlines((current) => {
          const deadlines = new Map(current);
          deadlines.set(observationIdentity, receivedAt + response.freshForMs);
          for (const item of contextRef.current?.comparisons ?? []) {
            if (
              item.sourceKind === "provider_offer" &&
              item.merchantMapping?.merchantId === response.merchant.id &&
              item.canonicalAssetId === response.canonicalAssetId
            )
              deadlines.delete(item.id);
          }
          return deadlines;
        });
        setFreshnessNow(receivedAt);
        if (response.offer) {
          setComparison(comparisonDraftFromOffer(response));
          setProviderDraftDeadline(receivedAt + response.offer.freshForMs);
          setNotice(
            "The reviewed price and conservative availability are locked into the editor. Enter your own quantity and explicit local costs, then encrypt the comparison. Exact stock quantity and merchant reputation were not supplied.",
          );
        } else {
          setComparison(EMPTY_COMPARISON);
          setProviderDraftDeadline(null);
          setNotice(
            "The opted-in merchant returned a valid empty exact-SKU result. That dated empty observation replaced its prior current state; older comparisons remain encrypted but stale.",
          );
        }
      }
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (!receiptSaved) {
        setError(
          `The encrypted permission receipt could not be saved. ${vaultErrorMessage(requestError)} ChainScout did not contact a market provider.`,
        );
      } else if (providerCompleted) {
        setError(
          `The provider returned a result and the approved public identifier was sent, but ${localSaveFailure(requestError)} The result was not persisted; the prior encrypted observation remains unchanged.`,
        );
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The market request failed after approval. The public identifier may already have been sent; prior encrypted observations remain unchanged.",
        );
        await persistReceipt({
          ...receipt,
          outcome: "failed",
          resolvedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const saveComparison = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const now = new Date().toISOString();
    const saved: VaultMarketComparison = {
      id: crypto.randomUUID(),
      canonicalAssetId: comparison.canonicalAssetId.trim().toLowerCase(),
      label: comparison.label.trim(),
      sourceKind: comparison.sourceKind,
      identityConfidence:
        comparison.sourceKind === "provider_offer"
          ? "exact_provider_mapping"
          : comparison.canonicalAssetId.trim()
            ? "owner_linked"
            : "candidate",
      merchantMapping: comparison.merchantMapping,
      providerName: comparison.providerName.trim(),
      sourceUrl: comparison.sourceUrl.trim(),
      observedAt:
        comparison.sourceKind === "provider_offer"
          ? comparison.observedAt
          : now,
      freshForMs: comparison.freshForMs,
      currency: comparison.currency.trim().toUpperCase(),
      itemUnitPrice: comparison.itemUnitPrice.trim(),
      quantity: comparison.quantity.trim(),
      shipping: comparison.shipping.trim(),
      tax: comparison.tax.trim(),
      duty: comparison.duty.trim(),
      fees: comparison.fees.trim(),
      discount: comparison.discount.trim(),
      inventoryState: comparison.inventoryState,
      condition: comparison.condition.trim(),
      region: comparison.region.trim(),
      returnNotes: comparison.returnNotes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      const prior = contextRef.current?.comparisons ?? [];
      const comparisons =
        comparison.sourceKind === "provider_offer"
          ? [
              saved,
              ...prior.filter(
                (item) =>
                  !(
                    item.sourceKind === "provider_offer" &&
                    item.merchantMapping?.merchantId ===
                      saved.merchantMapping?.merchantId &&
                    item.canonicalAssetId === saved.canonicalAssetId
                  ),
              ),
            ]
          : [saved, ...prior];
      await saveContext(draftFor({ comparisons: comparisons.slice(0, 100) }));
      const savedAt = performance.now();
      setFreshDeadlines((current) =>
        new Map(current).set(
          saved.id,
          comparison.sourceKind === "provider_offer"
            ? (providerDraftDeadline ?? 0)
            : savedAt + saved.freshForMs,
        ),
      );
      setFreshnessNow(savedAt);
      setComparison(EMPTY_COMPARISON);
      setProviderDraftDeadline(null);
      setNotice(
        comparison.sourceKind === "provider_offer"
          ? "The reviewed merchant observation and your local costs were saved encrypted. It ranks only while the original provider freshness window remains open."
          : "Owner-entered offer saved encrypted. It is ranked only against complete comparisons with the same linked identity, currency, condition, quantity, and region in this unlocked session.",
      );
      setError("");
    } catch (saveError) {
      setError(vaultErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const removeComparison = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveContext(
        draftFor({
          comparisons: (contextRef.current?.comparisons ?? []).filter(
            (item) => item.id !== id,
          ),
        }),
      );
      setFreshDeadlines((current) => {
        const deadlines = new Map(current);
        deadlines.delete(id);
        return deadlines;
      });
      setNotice(
        "The selected local comparison was removed from the encrypted Vault.",
      );
    } catch (saveError) {
      setError(vaultErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const reconfirmComparison = async (id: string) => {
    if (busy) return;
    const current = (contextRef.current?.comparisons ?? []).find(
      (item) => item.id === id,
    );
    if (!current || current.sourceKind !== "owner_entered") return;
    setBusy(true);
    setError("");
    const now = new Date().toISOString();
    try {
      await saveContext(
        draftFor({
          comparisons: (contextRef.current?.comparisons ?? []).map((item) =>
            item.id === id
              ? { ...item, observedAt: now, updatedAt: now }
              : item,
          ),
        }),
      );
      const reconfirmedAt = performance.now();
      setFreshDeadlines((deadlines) =>
        new Map(deadlines).set(id, reconfirmedAt + current.freshForMs),
      );
      setFreshnessNow(reconfirmedAt);
      setNotice(
        "You reconfirmed this owner-entered offer for the current unlocked session. ChainScout did not contact its source.",
      );
    } catch (saveError) {
      setError(vaultErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const freshIds = useMemo(() => {
    return new Set(
      [...freshDeadlines.entries()]
        .filter(([, deadline]) => deadline > freshnessNow)
        .map(([id]) => id),
    );
  }, [freshDeadlines, freshnessNow]);
  const rows = useMemo(
    () => calculateLandedCosts(context?.comparisons ?? [], freshIds),
    [context?.comparisons, freshIds],
  );
  const freshCryptoIds = useMemo(
    () =>
      new Set(
        (context?.cryptoObservations ?? [])
          .filter((observation) =>
            freshIds.has(cryptoFreshnessKey(observation.canonicalAssetId)),
          )
          .map((observation) => observation.canonicalAssetId),
      ),
    [context?.cryptoObservations, freshIds],
  );
  const freshMerchantIds = useMemo(
    () =>
      new Set(
        (context?.merchantObservations ?? [])
          .filter((observation) =>
            freshIds.has(
              merchantObservationKey(
                observation.merchant.id,
                observation.canonicalAssetId,
              ),
            ),
          )
          .map((observation) =>
            merchantObservationKey(
              observation.merchant.id,
              observation.canonicalAssetId,
            ),
          ),
      ),
    [context?.merchantObservations, freshIds],
  );
  const selectedHandoffAsset = assets.find(
    (asset) => asset.id === handoffAssetId,
  );
  const handoffs = selectedHandoffAsset?.collectible?.catalog
    ? buildMarketHandoffs(
        selectedHandoffAsset.collectible.catalog.name,
        selectedHandoffAsset.collectible.catalog.set.name,
        selectedHandoffAsset.collectible.catalog.number,
      )
    : [];

  return (
    <section className="mt-8 space-y-5" data-testid="market-inventory">
      <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
        <p className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.15em] text-[#fa6c34]">
          <BarChart3 size={14} /> {dealsOnly ? "COLLECTIBLE DEAL FINDER" : "MARKET & INVENTORY"}
        </p>
        <h2 className="mt-3 text-[26px] font-medium tracking-[-0.025em] text-[#f0e8da]">
          Compare what is actually comparable.
        </h2>
        <p className="mt-3 max-w-[820px] text-[12.5px] leading-relaxed text-[#9a938a]">
          {dealsOnly
            ? "Exact-card searches and private landed-cost comparisons. Live merchant inventory requires an approved, opted-in source. No checkout, hidden tax estimates, or automatic marketplace scraping."
            : "Exact-contract crypto context, opted-in merchant stock, private landed-cost math, and click-only marketplace searches. No scraping, checkout, currency conversion, hidden tax estimate, or paid provider path."}
        </p>
        {error && (
          <div
            role="alert"
            className="mt-5 border border-[#e0738a]/40 bg-[#e0738a]/8 px-4 py-3 text-[11.5px] text-[#e0738a]"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mt-5 border border-[#7fb069]/30 bg-[#7fb069]/5 px-4 py-3 text-[11.5px] text-[#9fc68f]"
          >
            {notice}
          </div>
        )}
      </div>

      {dealsOnly && <DealBrief />}
      {dealsOnly && <Benchmarks />}
      <div className="grid gap-5 lg:grid-cols-2">
        {!dealsOnly && <form
          onSubmit={askCryptoPermission}
          className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6"
        >
          <PanelTitle
            icon={<BarChart3 size={14} />}
            eyebrow="LIVE PUBLIC CONTEXT"
            title="Robinhood token pools"
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8e8881]">
            DEX Screener prices the pair's base token. The searched contract can
            be the quote token, so ChainScout shows the priced address
            explicitly and never silently inverts it.
          </p>
          <Input
            label="TOKEN CONTRACT"
            value={contract}
            onChange={setContract}
            placeholder="0x…"
            maxLength={42}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(contract.trim())}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 bg-[#fa6c34] font-mono-d text-[9.5px] font-medium text-[#1d1d1d] disabled:opacity-35"
          >
            <ShieldCheck size={13} /> REVIEW EXACT-CONTRACT LOOKUP
          </button>
        </form>}
        <form
          onSubmit={askMerchantPermission}
          className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6"
        >
          <PanelTitle
            icon={<Boxes size={14} />}
            eyebrow="OPT-IN MERCHANTS ONLY"
            title="Reviewed Woo inventory"
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8e8881]">
            A live lookup works only after an opted-in store and exact
            simple-product mapping are code-reviewed. Unapproved Shopify paths
            stay off; supported public venues remain click-only searches.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={loadApprovedMerchants}
            className="mt-4 min-h-[42px] w-full border border-[#4a4743] px-4 font-mono-d text-[8.5px] text-[#d6ccba] disabled:opacity-35"
          >
            LOAD APPROVED STORES
          </button>
          {directory && directory.merchants.length > 0 && (
            <div
              className="mt-3 space-y-2"
              aria-label="Approved merchant mappings"
            >
              {directory.merchants.flatMap((merchant) =>
                merchant.mappings.map((mapping) => (
                  <button
                    key={`${merchant.id}:${mapping.canonicalAssetId}`}
                    type="button"
                    onClick={() => {
                      setMerchantId(merchant.id);
                      setMerchantAssetId(mapping.canonicalAssetId);
                      setMerchantSku(mapping.sku);
                      setMerchantProductId(mapping.productId);
                      setMerchantMappingReviewedAt(mapping.reviewedAt);
                      setMerchantName(merchant.name);
                      setMerchantPermissionEvidence(
                        merchant.permissionEvidenceUrl,
                      );
                      setMerchantMappingEvidence(mapping.evidenceUrl);
                    }}
                    className="flex min-h-[42px] w-full items-center justify-between gap-3 border border-[#383838] bg-[#1d1d1d] px-3 text-left"
                  >
                    <span className="text-[11px] text-[#e9e0d1]">
                      {merchant.name}
                    </span>
                    <span className="font-mono-d text-[7.5px] text-[#7fb069]">
                      {mapping.variantLabel} · {mapping.condition} · SKU{" "}
                      {mapping.sku}
                    </span>
                  </button>
                )),
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="MERCHANT ID"
              value={merchantId}
              onChange={setMerchantId}
              placeholder="Approved ID"
              maxLength={64}
              disabled
            />
            <Input
              label="CANONICAL ASSET ID"
              value={merchantAssetId}
              onChange={setMerchantAssetId}
              placeholder="tcgdex:en:…"
              maxLength={200}
              disabled
            />
          </div>
          {merchantPermissionEvidence && merchantMappingEvidence && (
            <p className="mt-3 flex flex-wrap gap-3 font-mono-d text-[8px] text-[#7f7972]">
              <a
                href={merchantPermissionEvidence}
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
              >
                MERCHANT PERMISSION EVIDENCE
              </a>
              <a
                href={merchantMappingEvidence}
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
              >
                EXACT MAPPING EVIDENCE
              </a>
            </p>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              !/^[a-z0-9-]{2,64}$/.test(merchantId.trim()) ||
              merchantAssetId.trim().length < 3 ||
              !merchantSku ||
              !merchantProductId ||
              !merchantMappingReviewedAt
            }
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#7fb069]/45 bg-[#7fb069]/5 font-mono-d text-[9.5px] text-[#9fc68f] disabled:opacity-35"
          >
            <ShieldCheck size={13} /> REVIEW MERCHANT LOOKUP
          </button>
        </form>
      </div>

      {!dealsOnly && <CryptoObservations
        observations={context?.cryptoObservations ?? []}
        freshIds={freshCryptoIds}
      />}
      <MerchantObservations
        observations={context?.merchantObservations ?? []}
        freshIds={freshMerchantIds}
      />
      <ComparisonEditor
        value={comparison}
        onChange={setComparison}
        onSubmit={saveComparison}
        busy={busy}
        assets={assets}
      />
      <ComparisonTable
        rows={rows}
        busy={busy}
        onRemove={removeComparison}
        onReconfirm={reconfirmComparison}
      />

      <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
        <PanelTitle
          icon={<Search size={14} />}
          eyebrow="UNSUPPORTED VENUES"
          title="Precise click-only searches"
        />
        <p className="mt-3 text-[11.5px] leading-relaxed text-[#8e8881]">
          These links contain only public card identity. ChainScout does not
          fetch, pre-load, rank, or claim inventory from the destination. Review
          the exact query before opening.
        </p>
        <label className="mt-4 block">
          <span className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">
            ENCRYPTED COLLECTIBLE
          </span>
          <select
            value={handoffAssetId}
            onChange={(event) => setHandoffAssetId(event.target.value)}
            className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-3 text-[12px] text-[#e9e0d1] outline-none"
          >
            <option value="">Choose a catalog-matched collectible</option>
            {assets
              .filter((asset) => asset.collectible)
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
          </select>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {handoffs.map((handoff) => (
            <a
              key={handoff.id}
              href={handoff.url}
              target="_blank"
              rel="noreferrer noopener"
              className="border border-[#383838] bg-[#1d1d1d] p-4 hover:border-[#fa6c34]"
            >
              <p className="font-mono-d text-[8px] text-[#fa6c34]">
                SEARCH ONLY · NO LIVE DATA
              </p>
              <p className="mt-2 text-[13px] text-[#f0e8da]">{handoff.label}</p>
              <p className="mt-2 line-clamp-2 text-[10px] text-[#7f7972]">
                {handoff.query}
              </p>
              <span className="mt-3 flex items-center gap-1 font-mono-d text-[8px] text-[#9a938a]">
                OPEN DESTINATION <ExternalLink size={10} />
              </span>
            </a>
          ))}
        </div>
      </div>

      {pending && (
        <PermissionDialog
          pending={pending}
          returnFocus={permissionTrigger}
          onCancel={() => setPending(null)}
          onConfirm={runPending}
        />
      )}
    </section>
  );
}

function CryptoObservations({
  observations,
  freshIds,
}: {
  observations: CryptoMarketResponse[];
  freshIds: ReadonlySet<string>;
}) {
  if (!observations.length) return null;
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle
        icon={<BarChart3 size={14} />}
        eyebrow="ENCRYPTED OBSERVATIONS"
        title="Indexed pool context"
      />
      <div className="mt-4 space-y-4">
        {observations.map((observation) => (
          <div
            key={observation.canonicalAssetId}
            className="border border-[#383838] bg-[#1d1d1d] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-all font-mono-d text-[9px] text-[#d6ccba]">
                {observation.contract}
              </p>
              <span className="font-mono-d text-[8px] text-[#e0a96d]">
                {freshIds.has(observation.canonicalAssetId)
                  ? "CURRENT REFERENCE WINDOW"
                  : "STALE · REFRESH TO UPDATE"}{" "}
                · OBSERVED {observation.fetchedAt} ·{" "}
                {Math.round(observation.freshForMs / 1_000)}S WINDOW
              </span>
            </div>
            <a
              href={observation.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block font-mono-d text-[8px] text-[#fa6c34] underline"
            >
              OPEN DEX SCREENER SOURCE{" "}
              <ExternalLink size={10} className="inline" />
            </a>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {observation.pairs.slice(0, 6).map((pair) => (
                <a
                  key={pair.pairAddress}
                  href={pair.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="border border-[#343434] p-3 hover:border-[#fa6c34]"
                >
                  <p className="font-mono-d text-[8px] text-[#7fb069]">
                    {pair.dexId.toUpperCase()} · BASE TOKEN PRICED
                  </p>
                  <p className="mt-2 text-[12px] text-[#f0e8da]">
                    {pair.baseToken.symbol}/{pair.quoteToken.symbol}
                  </p>
                  <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                    PRICED ADDRESS {pair.pricedTokenAddress}
                  </p>
                  <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                    PAIR ID {pair.pairAddress}
                  </p>
                  <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                    BASE {pair.baseToken.address} · QUOTE{" "}
                    {pair.quoteToken.address}
                  </p>
                  <p className="mt-2 font-mono-d text-[9px] text-[#d6ccba]">
                    BASE USD {pair.baseTokenPriceUsd ?? "Not supplied"} · BASE
                    IN QUOTE {pair.baseTokenPriceInQuote ?? "Not supplied"}
                  </p>
                  <p className="mt-1 font-mono-d text-[8px] text-[#8e8881]">
                    LIQ {pair.liquidityUsd ?? "Not supplied"} · VOL 24H{" "}
                    {pair.volume24hUsd ?? "Not supplied"} · CHANGE 24H{" "}
                    {pair.priceChange24hPercent ?? "Not supplied"}
                  </p>
                  <p className="mt-1 font-mono-d text-[7.5px] text-[#635d5a]">
                    PAIR CREATED {pair.pairCreatedAt ?? "Not supplied"}
                  </p>
                </a>
              ))}
            </div>
            {observation.pairs.length === 0 && (
              <p className="mt-3 border border-[#e0a96d]/25 px-3 py-2 text-[10px] text-[#e0a96d]">
                VALID EMPTY · DEX Screener returned no exact-contract pair in
                this bounded response. That does not prove no pool exists
                elsewhere.
              </p>
            )}
            {observation.pairs.length > 6 && (
              <p className="mt-3 text-[10px] text-[#e0a96d]">
                Showing 6 of {observation.pairs.length} encrypted exact-contract
                pool observations in this compact view. Open the source for the
                broader indexed list.
              </p>
            )}
            {observation.truncated && (
              <p className="mt-3 text-[10px] text-[#e0a96d]">
                Provider collection reached ChainScout's observed safety bound;
                additional pools may be omitted.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MerchantObservations({
  observations,
  freshIds,
}: {
  observations: MerchantInventoryResponse[];
  freshIds: ReadonlySet<string>;
}) {
  if (!observations.length) return null;
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle
        icon={<Boxes size={14} />}
        eyebrow="REVIEWED MERCHANT OBSERVATIONS"
        title="Exact mapped simple products"
      />
      <div className="mt-4 space-y-3">
        {observations.map((observation) => {
          const offer = observation.offer;
          const identity = merchantObservationKey(
            observation.merchant.id,
            observation.canonicalAssetId,
          );
          if (!offer) {
            return (
              <article
                key={identity}
                className="border border-[#383838] bg-[#1d1d1d] p-4"
              >
                <p className="text-[13px] text-[#f0e8da]">
                  {observation.merchant.name} · no exact mapped product returned
                </p>
                <p className="mt-2 font-mono-d text-[8px] text-[#e0a96d]">
                  VALID EMPTY · {freshIds.has(identity) ? "CURRENT" : "STALE"}
                </p>
                <p className="mt-2 break-all text-[10.5px] text-[#8e8881]">
                  {observation.canonicalAssetId} · observed{" "}
                  {observation.fetchedAt}
                </p>
                <p className="mt-2 break-all font-mono-d text-[8px] text-[#7f7972]">
                  SKU {observation.mapping.sku} · PRODUCT ID{" "}
                  {observation.mapping.productId} · MAPPING REVIEWED{" "}
                  {observation.mapping.reviewedAt}
                </p>
                <a
                  href={observation.mapping.evidenceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-block font-mono-d text-[8px] text-[#fa6c34]"
                >
                  OPEN MAPPING EVIDENCE{" "}
                  <ExternalLink size={10} className="inline" />
                </a>
              </article>
            );
          }
          return (
            <article
              key={identity}
              className="border border-[#383838] bg-[#1d1d1d] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] text-[#f0e8da]">{offer.title}</p>
                  <p className="mt-1 font-mono-d text-[8px] text-[#7fb069]">
                    EXACT REVIEWED SIMPLE-PRODUCT MAPPING · {offer.merchantName}
                  </p>
                </div>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono-d text-[8px] text-[#fa6c34]"
                >
                  OPEN PRODUCT SOURCE{" "}
                  <ExternalLink size={10} className="inline" />
                </a>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Fact
                  label="MAPPED VARIANT"
                  value={`${offer.variantLabel} · ${offer.condition}`}
                />
                <Fact
                  label="PUBLISHED PRICE"
                  value={`${offer.unitPrice} ${offer.currency}`}
                />
                <Fact
                  label="PROVIDER AVAILABILITY"
                  value={offer.inventoryState.replaceAll("_", " ")}
                />
                <Fact label="EXACT QUANTITY" value="Not supplied" />
                <Fact
                  label="PRODUCT RATING · NOT SELLER REPUTATION"
                  value={
                    offer.productRating
                      ? `${offer.productRating.average}/5 · ${offer.productRating.count} reviews`
                      : "Not supplied"
                  }
                />
                <Fact
                  label="SELLER REPUTATION"
                  value="Not supplied by this adapter"
                />
                <Fact label="OBSERVED" value={offer.fetchedAt} />
                <Fact
                  label="MAPPING REVIEWED"
                  value={offer.mappingReviewedAt}
                />
                <Fact label="EXACT SKU" value={offer.sku} />
                <Fact label="EXPECTED PRODUCT ID" value={offer.productId} />
                <Fact
                  label="FRESHNESS"
                  value={
                    freshIds.has(identity)
                      ? "Current observation window"
                      : "Stale · refresh before comparing"
                  }
                />
              </div>
              <a
                href={offer.mappingEvidenceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block font-mono-d text-[8px] text-[#7f7972] underline"
              >
                REVIEWED MAPPING EVIDENCE
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonEditor({
  value,
  onChange,
  onSubmit,
  busy,
  assets,
}: {
  value: typeof EMPTY_COMPARISON;
  onChange: (value: typeof EMPTY_COMPARISON) => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
  assets: VaultAsset[];
}) {
  const providerLocked = value.sourceKind === "provider_offer";
  const set = <K extends keyof typeof EMPTY_COMPARISON>(
    key: K,
    next: (typeof EMPTY_COMPARISON)[K],
  ) => onChange({ ...value, [key]: next });
  return (
    <form
      onSubmit={onSubmit}
      className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7"
      data-testid="market-comparison-editor"
    >
      <PanelTitle
        icon={<Calculator size={14} />}
        eyebrow="ENCRYPTED LOCAL MATH"
        title="Add a landed-cost comparison"
      />
      <p className="mt-3 text-[11.5px] text-[#8e8881]">
        Blank means unknown. Type 0 when a cost is explicitly zero. ChainScout
        never estimates tax, duty, shipping, or exchange rates.
      </p>
      {providerLocked && (
        <p className="mt-3 border border-[#7fb069]/25 bg-[#7fb069]/5 px-3 py-2 text-[10.5px] text-[#9fc68f]">
          Merchant identity, condition, unit price, currency, and availability
          are locked to the reviewed response. Only your quantity and local cost
          fields can change.
        </p>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="font-mono-d text-[8px] text-[#635d5a]">
            LINKED ASSET
          </span>
          <select
            value={value.canonicalAssetId}
            onChange={(event) => set("canonicalAssetId", event.target.value)}
            disabled={providerLocked}
            className="mt-2 min-h-[42px] w-full border border-[#383838] bg-[#1d1d1d] px-3 text-[11px] text-[#e9e0d1]"
          >
            <option value="">Candidate / not linked</option>
            {assets
              .filter((asset) => asset.identifier)
              .map((asset) => (
                <option key={asset.id} value={asset.identifier}>
                  {asset.name}
                </option>
              ))}
          </select>
        </label>
        <Input
          label="OFFER LABEL"
          value={value.label}
          onChange={(next) => set("label", next)}
          maxLength={160}
          required
          disabled={providerLocked}
        />
        <Input
          label="SOURCE NAME"
          value={value.providerName}
          onChange={(next) => set("providerName", next)}
          maxLength={100}
          required
          disabled={providerLocked}
        />
        <Input
          label="SOURCE URL"
          value={value.sourceUrl}
          onChange={(next) => set("sourceUrl", next)}
          maxLength={1000}
          required
          type="url"
          disabled={providerLocked}
        />
        <Input
          label="CONDITION / VARIANT"
          value={value.condition}
          onChange={(next) => set("condition", next)}
          maxLength={120}
          required
          disabled={providerLocked}
        />
        <Input
          label="REGION"
          value={value.region}
          onChange={(next) => set("region", next)}
          maxLength={120}
        />
        <Input
          label="UNIT PRICE"
          value={value.itemUnitPrice}
          onChange={(next) => set("itemUnitPrice", next)}
          decimal
          required
          disabled={providerLocked}
        />
        <Input
          label="QUANTITY"
          value={value.quantity}
          onChange={(next) => set("quantity", next)}
          decimal
          required
        />
        <Input
          label="CURRENCY"
          value={value.currency}
          onChange={(next) => set("currency", next)}
          maxLength={12}
          required
          disabled={providerLocked}
        />
        <Input
          label="SHIPPING"
          value={value.shipping}
          onChange={(next) => set("shipping", next)}
          decimal
          placeholder="Blank = unknown"
        />
        <Input
          label="TAX"
          value={value.tax}
          onChange={(next) => set("tax", next)}
          decimal
          placeholder="Blank = unknown"
        />
        <Input
          label="DUTY"
          value={value.duty}
          onChange={(next) => set("duty", next)}
          decimal
          placeholder="Blank = unknown"
        />
        <Input
          label="FEES"
          value={value.fees}
          onChange={(next) => set("fees", next)}
          decimal
          placeholder="Blank = unknown"
        />
        <Input
          label="DISCOUNT"
          value={value.discount}
          onChange={(next) => set("discount", next)}
          decimal
          placeholder="Blank = unknown"
        />
        <label>
          <span className="font-mono-d text-[8px] text-[#635d5a]">
            {providerLocked ? "PROVIDER AVAILABILITY" : "OWNER AVAILABILITY"}
          </span>
          <select
            value={value.inventoryState}
            onChange={(event) =>
              set(
                "inventoryState",
                event.target.value as typeof value.inventoryState,
              )
            }
            disabled={providerLocked}
            className="mt-2 min-h-[42px] w-full border border-[#383838] bg-[#1d1d1d] px-3 text-[11px] text-[#e9e0d1]"
          >
            {providerLocked ? (
              <option value={value.inventoryState}>
                {value.inventoryState.replaceAll("_", " ")}
              </option>
            ) : (
              <>
                <option value="owner_available">Owner says available</option>
                <option value="unknown">Unknown</option>
              </>
            )}
          </select>
        </label>
        <Input
          label="RETURN NOTES"
          value={value.returnNotes}
          onChange={(next) => set("returnNotes", next)}
          maxLength={500}
        />
      </div>
      <button
        type="submit"
        disabled={
          busy ||
          !value.label.trim() ||
          !value.sourceUrl.trim() ||
          !value.condition.trim() ||
          !validDecimal(value.itemUnitPrice) ||
          !validPositiveDecimal(value.quantity)
        }
        className="mt-5 flex min-h-[44px] items-center justify-center gap-2 border border-[#7fb069]/45 bg-[#7fb069]/5 px-5 font-mono-d text-[9.5px] text-[#9fc68f] disabled:opacity-35"
      >
        <ShieldCheck size={13} /> ENCRYPT & ADD COMPARISON
      </button>
    </form>
  );
}

function ComparisonTable({
  rows,
  busy,
  onRemove,
  onReconfirm,
}: {
  rows: ReturnType<typeof calculateLandedCosts>;
  busy: boolean;
  onRemove: (id: string) => void;
  onReconfirm: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle
        icon={<Calculator size={14} />}
        eyebrow="LOCAL RESULTS"
        title="Comparable landed cost"
      />
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <article
            key={row.comparison.id}
            className="grid gap-3 border border-[#383838] bg-[#1d1d1d] p-4 md:grid-cols-[1.2fr_0.75fr_0.55fr_1.2fr_auto] md:items-center"
          >
            <div>
              <p className="text-[13px] text-[#f0e8da]">
                {row.comparison.label}
              </p>
              <p className="mt-1 font-mono-d text-[8px] text-[#635d5a]">
                {row.comparison.sourceKind === "owner_entered"
                  ? "OWNER-ENTERED"
                  : "PROVIDER OFFER"}{" "}
                · {row.comparison.condition}
              </p>
              <p className="mt-1 font-mono-d text-[7.5px] text-[#7f7972]">
                {row.comparison.identityConfidence.replaceAll("_", " ")} ·{" "}
                {row.comparison.inventoryState.replaceAll("_", " ")} ·{" "}
                {row.fresh ? "FRESH WINDOW" : "STALE"}
              </p>
              <p className="mt-1 text-[10px] text-[#8e8881]">
                {row.comparison.providerName} · region{" "}
                {row.comparison.region || "Not specified"}
              </p>
              <p className="mt-1 text-[10px] text-[#7f7972]">
                Return notes: {row.comparison.returnNotes || "Not supplied"}
              </p>
              {row.comparison.merchantMapping && (
                <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                  MERCHANT {row.comparison.merchantMapping.merchantId} · SKU{" "}
                  {row.comparison.merchantMapping.sku} · PRODUCT{" "}
                  {row.comparison.merchantMapping.productId} · REVIEWED{" "}
                  {row.comparison.merchantMapping.reviewedAt}
                </p>
              )}
              <a
                href={row.comparison.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block font-mono-d text-[7.5px] text-[#fa6c34] underline"
              >
                SOURCE · OBSERVED {row.comparison.observedAt}
              </a>
              <p className="mt-2 font-mono-d text-[7.5px] leading-relaxed text-[#635d5a]">
                {row.comparison.itemUnitPrice} × {row.comparison.quantity} +
                ship {row.comparison.shipping || "?"} + tax{" "}
                {row.comparison.tax || "?"} + duty {row.comparison.duty || "?"}{" "}
                + fees {row.comparison.fees || "?"} − discount{" "}
                {row.comparison.discount || "?"}
              </p>
            </div>
            <div>
              <p className="font-mono-d text-[8px] text-[#635d5a]">
                LANDED TOTAL
              </p>
              <p className="mt-1 text-[15px] text-[#d6ccba]">
                {row.landedTotal
                  ? `${row.landedTotal} ${row.comparison.currency}`
                  : "NOT RANKED"}
              </p>
            </div>
            <div>
              <p className="font-mono-d text-[8px] text-[#635d5a]">
                LOCAL RANK
              </p>
              <p className="mt-1 text-[15px] text-[#fa6c34]">
                {row.rank ? `#${row.rank}` : "—"}
              </p>
            </div>
            <div className="text-[10.5px] leading-relaxed text-[#8e8881]">
              {row.unavailableReason ??
                "Same owner-linked identifier, condition, currency, quantity, region, explicit costs, current-session confirmation, and available state."}
            </div>
            <div className="flex flex-wrap gap-2 md:flex-col">
              {row.comparison.sourceKind === "owner_entered" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReconfirm(row.comparison.id)}
                  className="min-h-[36px] border border-[#7fb069]/35 px-3 font-mono-d text-[7.5px] text-[#9fc68f] disabled:opacity-35"
                >
                  RECONFIRM MY INPUTS
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(row.comparison.id)}
                className="min-h-[36px] border border-[#e0738a]/30 px-3 font-mono-d text-[7.5px] text-[#e0738a] disabled:opacity-35"
              >
                REMOVE
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-[#635d5a]">
        Rank is lowest entered landed total inside one owner-linked local
        comparison group. Owner links are not independent identity verification.
        It is not a market-wide best price, recommendation, appraisal, tax
        quote, or merchant reputation score.
      </p>
    </div>
  );
}

function PermissionDialog({
  pending,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  pending: PendingRequest;
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
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href]",
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div
      ref={dialogRef}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-permission-title"
    >
      <div className="clip-panel w-full max-w-[640px] border border-[#fa6c34]/55 bg-[#242424] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-d text-[9px] text-[#fa6c34]">
              EXACT NETWORK RECEIPT
            </p>
            <h3
              id="market-permission-title"
              className="mt-3 text-[24px] text-[#f0e8da]"
            >
              Confirm this public lookup
            </h3>
          </div>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            aria-label="Cancel market lookup"
            className="p-2 text-[#635d5a]"
          >
            <X size={16} />
          </button>
        </div>
        <ReceiptBlock
          label="SENT TO CHAINSCOUT"
          value={pending.chainScoutSummary}
        />
        <ReceiptBlock
          label={`SENT TO ${pending.providers.join(" + ").toUpperCase()}`}
          value={pending.providerSummary}
        />
        <p className="mt-4 text-[11px] leading-relaxed text-[#9a938a]">
          {pending.disclosure} The encrypted permission attempt is saved before
          the request. Indexed market facts are not an executable quote,
          complete inventory, appraisal, or recommendation.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] flex-1 border border-[#4a4743] font-mono-d text-[9px] text-[#9a938a]"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-[#fa6c34] font-mono-d text-[9px] text-[#1d1d1d]"
          >
            <ShieldCheck size={13} /> SAVE RECEIPT + LOOK UP
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function comparisonDraftFromOffer(
  response: MerchantInventoryResponse,
): ComparisonDraft {
  const offer = response.offer;
  if (!offer) throw new Error("No exact merchant offer was supplied");
  return {
    canonicalAssetId: offer.canonicalAssetId,
    label: `${offer.merchantName} · ${offer.title}`,
    sourceKind: "provider_offer",
    identityConfidence: "exact_provider_mapping",
    merchantMapping: {
      merchantId: offer.merchantId,
      sku: offer.sku,
      productId: offer.productId,
      reviewedAt: offer.mappingReviewedAt,
      evidenceUrl: offer.mappingEvidenceUrl,
    },
    providerName: offer.merchantName,
    sourceUrl: offer.url,
    observedAt: offer.fetchedAt,
    freshForMs: offer.freshForMs,
    currency: offer.currency,
    itemUnitPrice: offer.unitPrice,
    quantity: "1",
    shipping: "",
    tax: "",
    duty: "",
    fees: "",
    discount: "",
    inventoryState: offer.inventoryState,
    condition: `${offer.variantLabel} · ${offer.condition}`,
    region: "",
    returnNotes: "Merchant return policy not supplied",
  };
}

function replaceReceipt(
  receipts: VaultMarketReceipt[],
  receipt: VaultMarketReceipt,
  outcome: "completed" | "failed",
): VaultMarketReceipt[] {
  return [
    ...receipts.filter((item) => item.id !== receipt.id),
    { ...receipt, outcome, resolvedAt: new Date().toISOString() },
  ].slice(-50);
}
function submitter(event: FormEvent): HTMLElement | null {
  const native = event.nativeEvent as SubmitEvent;
  return native.submitter instanceof HTMLElement
    ? native.submitter
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
}
function cryptoIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(normalized)) return normalized;
  const match = /^eip155:4663\/erc20:(0x[0-9a-f]{40})$/.exec(normalized);
  return match?.[1] ?? "";
}
function validDecimal(value: string): boolean {
  return /^\d{1,78}(?:\.\d{1,78})?$/.test(value);
}
function validPositiveDecimal(value: string): boolean {
  return validDecimal(value) && !/^0+(?:\.0+)?$/.test(value);
}

function cryptoFreshnessKey(canonicalAssetId: string): string {
  return `crypto:${canonicalAssetId}`;
}

function merchantObservationKey(
  merchantId: string,
  canonicalAssetId: string,
): string {
  return `merchant:${merchantId}:${canonicalAssetId}`;
}

function localSaveFailure(error: unknown): string {
  const message = vaultErrorMessage(error);
  return message.includes("Nothing was sent to a server")
    ? "the local encrypted save failed."
    : message;
}
function ReceiptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 border border-[#383838] bg-[#1d1d1d] p-4">
      <p className="font-mono-d text-[8px] text-[#635d5a]">{label}</p>
      <p className="mt-2 break-words font-mono-d text-[10px] text-[#d6ccba]">
        {value}
      </p>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#343434] p-3">
      <p className="font-mono-d text-[7.5px] text-[#635d5a]">{label}</p>
      <p className="mt-1 break-words text-[10.5px] text-[#d6ccba]">{value}</p>
    </div>
  );
}
function PanelTitle({
  icon,
  eyebrow,
  title,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 font-mono-d text-[8.5px] text-[#fa6c34]">
        {icon} {eyebrow}
      </p>
      <h3 className="mt-2 text-[20px] text-[#f0e8da]">{title}</h3>
    </div>
  );
}
function Input({
  label,
  value,
  onChange,
  maxLength = 157,
  placeholder = "",
  required = false,
  disabled = false,
  type = "text",
  decimal = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  decimal?: boolean;
}) {
  return (
    <label>
      <span className="font-mono-d text-[8px] text-[#635d5a]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        inputMode={decimal ? "decimal" : undefined}
        pattern={decimal ? "\\d{1,78}(\\.\\d{1,78})?" : undefined}
        className="mt-2 min-h-[42px] w-full border border-[#383838] bg-[#1d1d1d] px-3 text-[11px] text-[#e9e0d1] outline-none focus:border-[#fa6c34] disabled:opacity-40"
      />
    </label>
  );
}
