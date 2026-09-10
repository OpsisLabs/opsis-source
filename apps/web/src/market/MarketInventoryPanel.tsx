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
import { useI18n } from "../i18n";

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
  providerName: "",
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

const INVENTORY_STATE_KEYS = {
  provider_available: "market.inventory.providerAvailable",
  provider_low_stock: "market.inventory.providerLowStock",
  provider_unavailable: "market.inventory.providerUnavailable",
  owner_available: "market.inventory.ownerAvailable",
  unknown: "market.inventory.unknown",
} as const;

const IDENTITY_CONFIDENCE_KEYS = {
  exact_provider_mapping: "market.confidence.exactProviderMapping",
  owner_linked: "market.confidence.ownerLinked",
  candidate: "market.confidence.candidate",
} as const;

export function MarketInventoryPanel({
  dealsOnly = false,
  assets,
  context,
  sessionId,
  onSaveContext,
}: Props) {
  const { t } = useI18n();
  const emptyComparison = (): ComparisonDraft => ({
    ...EMPTY_COMPARISON,
    providerName: t("market.comparison.ownerEnteredSource"),
  });
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
  const [comparison, setComparison] = useState(emptyComparison);
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
      chainScoutSummary: t("market.crypto.summaryChainScout", {
        contract: normalized,
      }),
      providerSummary: t("market.crypto.summaryProvider", {
        contract: normalized,
      }),
      disclosure: t("market.crypto.disclosure"),
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
      providers: [
        merchantName ||
          t("market.merchant.approvedMerchant", { merchant }),
      ],
      chainScoutSummary: t("market.merchant.summaryChainScout", {
        merchant,
        asset,
        sku: merchantSku,
        productId: merchantProductId,
        reviewedAt: merchantMappingReviewedAt,
      }),
      providerSummary: t("market.merchant.summaryProvider", {
        sku: merchantSku,
        productId: merchantProductId,
      }),
      disclosure: t("market.merchant.disclosure"),
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
        setNotice(t("market.notice.noMerchant"));
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("market.error.directoryLoad"),
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
      setComparison(emptyComparison());
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
            ? t(
                response.pairsShown === 1
                  ? "market.notice.cryptoPairsOne"
                  : "market.notice.cryptoPairsOther",
                { count: response.pairsShown },
              )
            : t("market.notice.cryptoEmpty"),
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
          setComparison(
            comparisonDraftFromOffer(
              response,
              t("market.merchant.returnNotSupplied"),
            ),
          );
          setProviderDraftDeadline(receivedAt + response.offer.freshForMs);
          setNotice(t("market.notice.merchantOffer"));
        } else {
          setComparison(emptyComparison());
          setProviderDraftDeadline(null);
          setNotice(t("market.notice.merchantEmpty"));
        }
      }
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (!receiptSaved) {
        setError(
          t("market.error.receiptSave", {
            message: vaultErrorMessage(requestError),
          }),
        );
      } else if (providerCompleted) {
        setError(
          t("market.error.providerLocalSave", {
            reason: localSaveFailure(
              requestError,
              t("market.error.localSave"),
            ),
          }),
        );
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("market.error.requestFailed"),
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
      setComparison(emptyComparison());
      setProviderDraftDeadline(null);
      setNotice(
        comparison.sourceKind === "provider_offer"
          ? t("market.notice.comparisonProvider")
          : t("market.notice.comparisonOwner"),
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
      setNotice(t("market.notice.comparisonRemoved"));
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
      setNotice(t("market.notice.reconfirmed"));
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
    () => calculateLandedCosts(context?.comparisons ?? [], freshIds, t),
    [context?.comparisons, freshIds, t],
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
          <BarChart3 size={14} />{" "}
          {dealsOnly
            ? t("market.header.dealsTitle")
            : t("market.header.title")}
        </p>
        <h2 className="mt-3 text-[26px] font-medium tracking-[-0.025em] text-[#f0e8da]">
          {t("market.hero.title")}
        </h2>
        <p className="mt-3 max-w-[820px] text-[12.5px] leading-relaxed text-[#9a938a]">
          {dealsOnly ? t("market.hero.bodyDeals") : t("market.hero.body")}
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
            eyebrow={t("market.crypto.eyebrow")}
            title={t("market.crypto.title")}
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8e8881]">
            {t("market.crypto.description")}
          </p>
          <Input
            label={t("market.crypto.contractLabel")}
            value={contract}
            onChange={setContract}
            placeholder={t("market.crypto.contractPlaceholder")}
            maxLength={42}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(contract.trim())}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 bg-[#fa6c34] font-mono-d text-[9.5px] font-medium text-[#1d1d1d] disabled:opacity-35"
          >
            <ShieldCheck size={13} /> {t("market.crypto.review")}
          </button>
        </form>}
        <form
          onSubmit={askMerchantPermission}
          className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-6"
        >
          <PanelTitle
            icon={<Boxes size={14} />}
            eyebrow={t("market.merchant.eyebrow")}
            title={t("market.merchant.title")}
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8e8881]">
            {t("market.merchant.description")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={loadApprovedMerchants}
            className="mt-4 min-h-[42px] w-full border border-[#4a4743] px-4 font-mono-d text-[8.5px] text-[#d6ccba] disabled:opacity-35"
          >
            {t("market.merchant.loadStores")}
          </button>
          {directory && directory.merchants.length > 0 && (
            <div
              className="mt-3 space-y-2"
              aria-label={t("market.merchant.mappingsAria")}
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
              label={t("market.merchant.idLabel")}
              value={merchantId}
              onChange={setMerchantId}
              placeholder={t("market.merchant.idPlaceholder")}
              maxLength={64}
              disabled
            />
            <Input
              label={t("market.merchant.assetLabel")}
              value={merchantAssetId}
              onChange={setMerchantAssetId}
              placeholder={t("market.merchant.assetPlaceholder")}
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
                {t("market.merchant.permissionEvidence")}
              </a>
              <a
                href={merchantMappingEvidence}
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
              >
                {t("market.merchant.mappingEvidence")}
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
            <ShieldCheck size={13} /> {t("market.merchant.review")}
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
          eyebrow={t("market.handoff.eyebrow")}
          title={t("market.handoff.title")}
        />
        <p className="mt-3 text-[11.5px] leading-relaxed text-[#8e8881]">
          {t("market.handoff.description")}
        </p>
        <label className="mt-4 block">
          <span className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">
            {t("market.handoff.collectibleLabel")}
          </span>
          <select
            value={handoffAssetId}
            onChange={(event) => setHandoffAssetId(event.target.value)}
            className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-3 text-[12px] text-[#e9e0d1] outline-none"
          >
            <option value="">{t("market.handoff.chooseCollectible")}</option>
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
                {t("market.handoff.searchOnly")}
              </p>
              <p className="mt-2 text-[13px] text-[#f0e8da]">{handoff.label}</p>
              <p className="mt-2 line-clamp-2 text-[10px] text-[#7f7972]">
                {handoff.query}
              </p>
              <span className="mt-3 flex items-center gap-1 font-mono-d text-[8px] text-[#9a938a]">
                {t("market.handoff.openDestination")}{" "}
                <ExternalLink size={10} />
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
  const { t } = useI18n();
  if (!observations.length) return null;
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle
        icon={<BarChart3 size={14} />}
        eyebrow={t("market.cryptoObs.eyebrow")}
        title={t("market.cryptoObs.title")}
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
                {t("market.cryptoObs.windowStatus", {
                  state: freshIds.has(observation.canonicalAssetId)
                    ? t("market.cryptoObs.currentWindow")
                    : t("market.cryptoObs.staleWindow"),
                  observed: observation.fetchedAt,
                  seconds: Math.round(observation.freshForMs / 1_000),
                })}
              </span>
            </div>
            <a
              href={observation.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block font-mono-d text-[8px] text-[#fa6c34] underline"
            >
              {t("market.cryptoObs.openSource")}{" "}
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
                    {t("market.cryptoObs.baseTokenPriced", {
                      dex: pair.dexId.toUpperCase(),
                    })}
                  </p>
                  <p className="mt-2 text-[12px] text-[#f0e8da]">
                    {pair.baseToken.symbol}/{pair.quoteToken.symbol}
                  </p>
                  <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                    {t("market.cryptoObs.pricedAddress", {
                      address: pair.pricedTokenAddress,
                    })}
                  </p>
                  <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                    {t("market.cryptoObs.pairId", { id: pair.pairAddress })}
                  </p>
                  <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                    {t("market.cryptoObs.baseQuote", {
                      base: pair.baseToken.address,
                      quote: pair.quoteToken.address,
                    })}
                  </p>
                  <p className="mt-2 font-mono-d text-[9px] text-[#d6ccba]">
                    {t("market.cryptoObs.baseUsd", {
                      usd: pair.baseTokenPriceUsd ?? t("market.common.notSupplied"),
                      quote:
                        pair.baseTokenPriceInQuote ?? t("market.common.notSupplied"),
                    })}
                  </p>
                  <p className="mt-1 font-mono-d text-[8px] text-[#8e8881]">
                    {t("market.cryptoObs.stats", {
                      liquidity:
                        pair.liquidityUsd ?? t("market.common.notSupplied"),
                      volume: pair.volume24hUsd ?? t("market.common.notSupplied"),
                      change:
                        pair.priceChange24hPercent ??
                        t("market.common.notSupplied"),
                    })}
                  </p>
                  <p className="mt-1 font-mono-d text-[7.5px] text-[#635d5a]">
                    {t("market.cryptoObs.pairCreated", {
                      created:
                        pair.pairCreatedAt ?? t("market.common.notSupplied"),
                    })}
                  </p>
                </a>
              ))}
            </div>
            {observation.pairs.length === 0 && (
              <p className="mt-3 border border-[#e0a96d]/25 px-3 py-2 text-[10px] text-[#e0a96d]">
                {t("market.cryptoObs.empty")}
              </p>
            )}
            {observation.pairs.length > 6 && (
              <p className="mt-3 text-[10px] text-[#e0a96d]">
                {t("market.cryptoObs.showing", {
                  total: observation.pairs.length,
                })}
              </p>
            )}
            {observation.truncated && (
              <p className="mt-3 text-[10px] text-[#e0a96d]">
                {t("market.cryptoObs.truncated")}
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
  const { t } = useI18n();
  if (!observations.length) return null;
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle
        icon={<Boxes size={14} />}
        eyebrow={t("market.merchantObs.eyebrow")}
        title={t("market.merchantObs.title")}
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
                  {t("market.merchantObs.noOffer", {
                    merchant: observation.merchant.name,
                  })}
                </p>
                <p className="mt-2 font-mono-d text-[8px] text-[#e0a96d]">
                  {t("market.merchantObs.validEmpty", {
                    state: freshIds.has(identity)
                      ? t("market.common.current")
                      : t("market.common.stale"),
                  })}
                </p>
                <p className="mt-2 break-all text-[10.5px] text-[#8e8881]">
                  {t("market.merchantObs.observedLine", {
                    id: observation.canonicalAssetId,
                    observed: observation.fetchedAt,
                  })}
                </p>
                <p className="mt-2 break-all font-mono-d text-[8px] text-[#7f7972]">
                  {t("market.merchantObs.mappingLine", {
                    sku: observation.mapping.sku,
                    productId: observation.mapping.productId,
                    reviewedAt: observation.mapping.reviewedAt,
                  })}
                </p>
                <a
                  href={observation.mapping.evidenceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-block font-mono-d text-[8px] text-[#fa6c34]"
                >
                  {t("market.merchantObs.openMapping")}{" "}
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
                    {t("market.merchantObs.exactMapping", {
                      merchant: offer.merchantName,
                    })}
                  </p>
                </div>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono-d text-[8px] text-[#fa6c34]"
                >
                  {t("market.merchantObs.openSource")}{" "}
                  <ExternalLink size={10} className="inline" />
                </a>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Fact
                  label={t("market.merchantObs.mappedVariant")}
                  value={`${offer.variantLabel} · ${offer.condition}`}
                />
                <Fact
                  label={t("market.merchantObs.publishedPrice")}
                  value={`${offer.unitPrice} ${offer.currency}`}
                />
                <Fact
                  label={t("market.merchantObs.providerAvailability")}
                  value={t(INVENTORY_STATE_KEYS[offer.inventoryState])}
                />
                <Fact
                  label={t("market.merchantObs.exactQuantity")}
                  value={t("market.common.notSupplied")}
                />
                <Fact
                  label={t("market.merchantObs.productRating")}
                  value={
                    offer.productRating
                      ? t("market.merchantObs.ratingValue", {
                          average: offer.productRating.average,
                          count: offer.productRating.count,
                        })
                      : t("market.common.notSupplied")
                  }
                />
                <Fact
                  label={t("market.merchantObs.sellerReputation")}
                  value={t("market.merchantObs.sellerReputationValue")}
                />
                <Fact
                  label={t("market.merchantObs.observed")}
                  value={offer.fetchedAt}
                />
                <Fact
                  label={t("market.merchantObs.mappingReviewed")}
                  value={offer.mappingReviewedAt}
                />
                <Fact
                  label={t("market.merchantObs.exactSku")}
                  value={offer.sku}
                />
                <Fact
                  label={t("market.merchantObs.expectedProductId")}
                  value={offer.productId}
                />
                <Fact
                  label={t("market.merchantObs.freshness")}
                  value={
                    freshIds.has(identity)
                      ? t("market.merchantObs.freshnessCurrent")
                      : t("market.merchantObs.freshnessStale")
                  }
                />
              </div>
              <a
                href={offer.mappingEvidenceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block font-mono-d text-[8px] text-[#7f7972] underline"
              >
                {t("market.merchantObs.reviewedMappingEvidence")}
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
  const { t } = useI18n();
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
        eyebrow={t("market.comparison.eyebrow")}
        title={t("market.comparison.title")}
      />
      <p className="mt-3 text-[11.5px] text-[#8e8881]">
        {t("market.comparison.description")}
      </p>
      {providerLocked && (
        <p className="mt-3 border border-[#7fb069]/25 bg-[#7fb069]/5 px-3 py-2 text-[10.5px] text-[#9fc68f]">
          {t("market.comparison.providerLocked")}
        </p>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="font-mono-d text-[8px] text-[#635d5a]">
            {t("market.comparison.linkedAsset")}
          </span>
          <select
            value={value.canonicalAssetId}
            onChange={(event) => set("canonicalAssetId", event.target.value)}
            disabled={providerLocked}
            className="mt-2 min-h-[42px] w-full border border-[#383838] bg-[#1d1d1d] px-3 text-[11px] text-[#e9e0d1]"
          >
            <option value="">{t("market.comparison.candidateOption")}</option>
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
          label={t("market.comparison.offerLabel")}
          value={value.label}
          onChange={(next) => set("label", next)}
          maxLength={160}
          required
          disabled={providerLocked}
        />
        <Input
          label={t("market.comparison.sourceName")}
          value={value.providerName}
          onChange={(next) => set("providerName", next)}
          maxLength={100}
          required
          disabled={providerLocked}
        />
        <Input
          label={t("market.comparison.sourceUrl")}
          value={value.sourceUrl}
          onChange={(next) => set("sourceUrl", next)}
          maxLength={1000}
          required
          type="url"
          disabled={providerLocked}
        />
        <Input
          label={t("market.comparison.condition")}
          value={value.condition}
          onChange={(next) => set("condition", next)}
          maxLength={120}
          required
          disabled={providerLocked}
        />
        <Input
          label={t("market.comparison.region")}
          value={value.region}
          onChange={(next) => set("region", next)}
          maxLength={120}
        />
        <Input
          label={t("market.comparison.unitPrice")}
          value={value.itemUnitPrice}
          onChange={(next) => set("itemUnitPrice", next)}
          decimal
          required
          disabled={providerLocked}
        />
        <Input
          label={t("market.comparison.quantity")}
          value={value.quantity}
          onChange={(next) => set("quantity", next)}
          decimal
          required
        />
        <Input
          label={t("market.comparison.currency")}
          value={value.currency}
          onChange={(next) => set("currency", next)}
          maxLength={12}
          required
          disabled={providerLocked}
        />
        <Input
          label={t("market.comparison.shipping")}
          value={value.shipping}
          onChange={(next) => set("shipping", next)}
          decimal
          placeholder={t("market.comparison.blankUnknown")}
        />
        <Input
          label={t("market.comparison.tax")}
          value={value.tax}
          onChange={(next) => set("tax", next)}
          decimal
          placeholder={t("market.comparison.blankUnknown")}
        />
        <Input
          label={t("market.comparison.duty")}
          value={value.duty}
          onChange={(next) => set("duty", next)}
          decimal
          placeholder={t("market.comparison.blankUnknown")}
        />
        <Input
          label={t("market.comparison.fees")}
          value={value.fees}
          onChange={(next) => set("fees", next)}
          decimal
          placeholder={t("market.comparison.blankUnknown")}
        />
        <Input
          label={t("market.comparison.discount")}
          value={value.discount}
          onChange={(next) => set("discount", next)}
          decimal
          placeholder={t("market.comparison.blankUnknown")}
        />
        <label>
          <span className="font-mono-d text-[8px] text-[#635d5a]">
            {providerLocked
              ? t("market.comparison.providerAvailability")
              : t("market.comparison.ownerAvailability")}
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
                {t(INVENTORY_STATE_KEYS[value.inventoryState])}
              </option>
            ) : (
              <>
                <option value="owner_available">
                  {t("market.comparison.ownerAvailable")}
                </option>
                <option value="unknown">
                  {t("market.common.unknown")}
                </option>
              </>
            )}
          </select>
        </label>
        <Input
          label={t("market.comparison.returnNotes")}
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
        <ShieldCheck size={13} /> {t("market.comparison.submit")}
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
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
      <PanelTitle
        icon={<Calculator size={14} />}
        eyebrow={t("market.results.eyebrow")}
        title={t("market.results.title")}
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
                  ? t("market.common.ownerEntered")
                  : t("market.common.providerOffer")}{" "}
                · {row.comparison.condition}
              </p>
              <p className="mt-1 font-mono-d text-[7.5px] text-[#7f7972]">
                {t("market.results.meta", {
                  confidence:
                    t(
                      IDENTITY_CONFIDENCE_KEYS[
                        row.comparison.identityConfidence
                      ],
                    ),
                  inventory: t(
                    INVENTORY_STATE_KEYS[row.comparison.inventoryState],
                  ),
                  freshness: row.fresh
                    ? t("market.results.freshWindow")
                    : t("market.common.stale"),
                })}
              </p>
              <p className="mt-1 text-[10px] text-[#8e8881]">
                {t("market.results.providerRegion", {
                  provider: row.comparison.providerName,
                  region:
                    row.comparison.region || t("market.common.notSpecified"),
                })}
              </p>
              <p className="mt-1 text-[10px] text-[#7f7972]">
                {t("market.results.returnNotesInline", {
                  notes:
                    row.comparison.returnNotes ||
                    t("market.common.notSupplied"),
                })}
              </p>
              {row.comparison.merchantMapping && (
                <p className="mt-1 break-all font-mono-d text-[7.5px] text-[#635d5a]">
                  {t("market.results.merchantMapping", {
                    merchant: row.comparison.merchantMapping.merchantId,
                    sku: row.comparison.merchantMapping.sku,
                    productId: row.comparison.merchantMapping.productId,
                    reviewedAt: row.comparison.merchantMapping.reviewedAt,
                  })}
                </p>
              )}
              <a
                href={row.comparison.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block font-mono-d text-[7.5px] text-[#fa6c34] underline"
              >
                {t("market.results.sourceObserved", {
                  observed: row.comparison.observedAt,
                })}
              </a>
              <p className="mt-2 font-mono-d text-[7.5px] leading-relaxed text-[#635d5a]">
                {t("market.results.breakdown", {
                  unitPrice: row.comparison.itemUnitPrice,
                  quantity: row.comparison.quantity,
                  shipping: row.comparison.shipping || "?",
                  tax: row.comparison.tax || "?",
                  duty: row.comparison.duty || "?",
                  fees: row.comparison.fees || "?",
                  discount: row.comparison.discount || "?",
                })}
              </p>
            </div>
            <div>
              <p className="font-mono-d text-[8px] text-[#635d5a]">
                {t("market.results.landedTotal")}
              </p>
              <p className="mt-1 text-[15px] text-[#d6ccba]">
                {row.landedTotal
                  ? `${row.landedTotal} ${row.comparison.currency}`
                  : t("market.results.notRanked")}
              </p>
            </div>
            <div>
              <p className="font-mono-d text-[8px] text-[#635d5a]">
                {t("market.results.localRank")}
              </p>
              <p className="mt-1 text-[15px] text-[#fa6c34]">
                {row.rank ? `#${row.rank}` : "—"}
              </p>
            </div>
            <div className="text-[10.5px] leading-relaxed text-[#8e8881]">
              {row.unavailableReason ?? t("market.results.comparableExplanation")}
            </div>
            <div className="flex flex-wrap gap-2 md:flex-col">
              {row.comparison.sourceKind === "owner_entered" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReconfirm(row.comparison.id)}
                  className="min-h-[36px] border border-[#7fb069]/35 px-3 font-mono-d text-[7.5px] text-[#9fc68f] disabled:opacity-35"
                >
                  {t("market.results.reconfirm")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(row.comparison.id)}
                className="min-h-[36px] border border-[#e0738a]/30 px-3 font-mono-d text-[7.5px] text-[#e0738a] disabled:opacity-35"
              >
                {t("market.results.remove")}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-[10px] leading-relaxed text-[#635d5a]">
        {t("market.results.disclaimer")}
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
  const { t } = useI18n();
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
              {t("market.dialog.eyebrow")}
            </p>
            <h3
              id="market-permission-title"
              className="mt-3 text-[24px] text-[#f0e8da]"
            >
              {t("market.dialog.title")}
            </h3>
          </div>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            aria-label={t("market.dialog.cancelAria")}
            className="p-2 text-[#635d5a]"
          >
            <X size={16} />
          </button>
        </div>
        <ReceiptBlock
          label={t("market.dialog.sentToChainScout")}
          value={pending.chainScoutSummary}
        />
        <ReceiptBlock
          label={t("market.dialog.sentToProviders", {
            providers: pending.providers.join(" + ").toUpperCase(),
          })}
          value={pending.providerSummary}
        />
        <p className="mt-4 text-[11px] leading-relaxed text-[#9a938a]">
          {pending.disclosure} {t("market.dialog.disclosureTail")}
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] flex-1 border border-[#4a4743] font-mono-d text-[9px] text-[#9a938a]"
          >
            {t("market.dialog.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-[#fa6c34] font-mono-d text-[9px] text-[#1d1d1d]"
          >
            <ShieldCheck size={13} /> {t("market.dialog.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function comparisonDraftFromOffer(
  response: MerchantInventoryResponse,
  returnNotes: string,
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
    returnNotes,
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

function localSaveFailure(error: unknown, localSaveMessage: string): string {
  const message = vaultErrorMessage(error);
  return message.includes("Nothing was sent to a server")
    ? localSaveMessage
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
