import type {
  CollectibleCardBrief,
  CollectibleCardDetail,
  CollectibleLanguage
} from "@rh-chain/shared";
import { BookOpenCheck, ImagePlus, LockKeyhole, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { collectibleDetail, searchCollectibles, type CatalogSearch } from "./api";
import { fileToVaultPhoto, MAX_SOURCE_PHOTO_BYTES } from "../vault/photo";
import { catalogImageToVaultPhoto } from "./catalog-image";
import { useI18n } from "../i18n";
import type {
  VaultAssetDraft,
  VaultCollectibleCondition,
  VaultCollectibleContext,
  VaultCollectibleContextDraft,
  VaultCollectibleGrader,
  VaultCollectibleReceipt,
  VaultPhoto
} from "../vault/types";

type Props = {
  context?: VaultCollectibleContext;
  sessionId: number;
  onSaveContext: (
    draft: VaultCollectibleContextDraft,
    existing?: VaultCollectibleContext,
    expectedSession?: number
  ) => Promise<VaultCollectibleContext>;
  onSaveAsset: (draft: VaultAssetDraft, expectedSession: number) => Promise<void>;
  onManual: () => void;
};

type PendingRequest =
  | { operation: "search"; input: CatalogSearch; summary: string }
  | { operation: "detail"; language: CollectibleLanguage; card: CollectibleCardBrief; summary: string };

export function CollectibleCatalogPanel({ context, sessionId, onSaveContext, onSaveAsset, onManual }: Props) {
  const { t } = useI18n();
  const [language, setLanguage] = useState<CollectibleLanguage>("en");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [setId, setSetId] = useState("");
  const [results, setResults] = useState<CollectibleCardBrief[]>([]);
  const [resultLanguage, setResultLanguage] = useState<CollectibleLanguage>("en");
  const [truncated, setTruncated] = useState(false);
  const [card, setCard] = useState<CollectibleCardDetail | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const contextRef = useRef(context);
  const abortRef = useRef<AbortController | null>(null);
  const [permissionTrigger, setPermissionTrigger] = useState<HTMLElement | null>(null);
  const languageOptions: Array<[CollectibleLanguage, string]> = [["en", t("collectibles.catalog.languageEnglishLaunch")]];

  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const requestSearch = (event: FormEvent) => {
    event.preventDefault();
    if (busy || name.trim().length < 2) return;
    setPermissionTrigger((event.nativeEvent as SubmitEvent).submitter instanceof HTMLElement
      ? (event.nativeEvent as SubmitEvent).submitter as HTMLElement
      : document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const input: CatalogSearch = {
      language,
      name: name.trim(),
      ...(number.trim() ? { number: number.trim() } : {}),
      ...(setId.trim() ? { setId: setId.trim() } : {})
    };
    setPending({
      operation: "search",
      input,
      summary: `${language.toUpperCase()} · ${name.trim()}${number.trim() ? ` · #${number.trim()}` : ""}${setId.trim() ? ` · ${t("collectibles.catalog.setSuffix", { setId: setId.trim() })}` : ""}`
    });
  };

  const persistReceipt = async (receipt: VaultCollectibleReceipt): Promise<VaultCollectibleContext> => {
    const current = contextRef.current;
    const receipts = [...(current?.receipts ?? []).filter((item) => item.id !== receipt.id), receipt].slice(-50);
    const saved = await onSaveContext({ receipts }, current, sessionId);
    contextRef.current = saved;
    return saved;
  };

  const runPending = async () => {
    if (!pending || busy) return;
    const request = pending;
    setPending(null);
    setBusy(true);
    setError("");
    setNotice("");
    setCard(null);
    if (request.operation === "search") {
      setResults([]);
      setTruncated(false);
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const receipt: VaultCollectibleReceipt = {
      id: crypto.randomUUID(),
      operation: request.operation,
      language: request.operation === "search" ? request.input.language : request.language,
      query: request.summary,
      providerDestinations: ["TCGdex"],
      disclosure: request.operation === "search"
        ? t("collectibles.receipt.disclosureSearch")
        : t("collectibles.receipt.disclosureDetail"),
      approvedAt: new Date().toISOString(),
      outcome: "approved"
    };
    let receiptSaved = false;
    try {
      await persistReceipt(receipt);
      receiptSaved = true;
      if (controller.signal.aborted) return;
      if (request.operation === "search") {
        const response = await searchCollectibles(request.input, controller.signal);
        setResults(response.results);
        setResultLanguage(request.input.language);
        setTruncated(response.truncated);
        setNotice(response.results.length
          ? t(response.matchesShown === 1 ? "collectibles.catalog.matchesShownOne" : "collectibles.catalog.matchesShownMany", { count: response.matchesShown })
          : t("collectibles.catalog.noMatch"));
      } else {
        const response = await collectibleDetail(request.language, request.card.catalogId, controller.signal);
        setCard(response.card);
        setNotice(t("collectibles.catalog.detailResolved"));
      }
      await persistReceipt({ ...receipt, outcome: "completed", resolvedAt: new Date().toISOString() });
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (!receiptSaved) {
        setError(t("collectibles.catalog.receiptSaveFailed"));
      } else {
        setError(requestError instanceof Error ? requestError.message : t("collectibles.catalog.requestFailed"));
        await persistReceipt({ ...receipt, outcome: "failed", resolvedAt: new Date().toISOString() }).catch(() => undefined);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <section className="mt-8" data-testid="collectible-catalog">
      <div className="clip-panel border border-[#383838] bg-[#242424] p-5 sm:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.15em] text-[#fa6c34]"><BookOpenCheck size={14} /> {t("collectibles.catalog.eyebrow")}</p>
            <h2 className="mt-3 text-[26px] font-medium tracking-[-0.025em] text-[#f0e8da]">{t("collectibles.catalog.title")}</h2>
            <p className="mt-3 max-w-[760px] text-[12.5px] leading-relaxed text-[#9a938a]">{t("collectibles.catalog.description")}</p>
          </div>
          <button type="button" onClick={onManual} className="min-h-[42px] border border-[#4a4743] px-4 font-mono-d text-[9px] tracking-wider text-[#d6ccba] hover:border-[#fa6c34]">{t("collectibles.catalog.addWithout")}</button>
        </div>

        <form onSubmit={requestSearch} className="mt-6 grid gap-3 md:grid-cols-[0.65fr_1.5fr_0.7fr_0.8fr_auto] md:items-end">
          <Select label={t("collectibles.catalog.languageLabel")} value={language} onChange={(value) => setLanguage(value as CollectibleLanguage)} options={languageOptions} disabled={busy} />
          <Input label={t("collectibles.catalog.cardNameLabel")} value={name} onChange={setName} placeholder={t("collectibles.catalog.cardNamePlaceholder")} maxLength={80} required disabled={busy} />
          <Input label={t("collectibles.catalog.numberLabel")} value={number} onChange={setNumber} placeholder={t("collectibles.catalog.optionalPlaceholder")} maxLength={24} disabled={busy} />
          <Input label={t("collectibles.catalog.setIdLabel")} value={setId} onChange={setSetId} placeholder={t("collectibles.catalog.optionalPlaceholder")} maxLength={32} disabled={busy} />
          <button type="submit" disabled={busy || name.trim().length < 2} className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[9.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-40"><Search size={13} /> {t("collectibles.catalog.submit")}</button>
        </form>
        <p className="mt-3 font-mono-d text-[8.5px] leading-relaxed tracking-wide text-[#635d5a]">{t("collectibles.catalog.tip")}</p>
        {error && <div role="alert" className="mt-5 border border-[#e0738a]/40 bg-[#e0738a]/8 px-4 py-3 text-[11.5px] text-[#e0738a]">{error}</div>}
        {notice && <div role="status" className="mt-5 border border-[#7fb069]/30 bg-[#7fb069]/5 px-4 py-3 text-[11.5px] text-[#9fc68f]">{notice}</div>}

        {results.length > 0 && !card && (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {results.map((result) => (
                <button key={result.catalogId} type="button" disabled={busy} onClick={(event) => { setPermissionTrigger(event.currentTarget); setPending({ operation: "detail", language: resultLanguage, card: result, summary: `${resultLanguage.toUpperCase()} · ${result.catalogId}` }); }} className="border border-[#383838] bg-[#1f1f1f] p-4 text-left hover:border-[#fa6c34] disabled:opacity-40">
                  <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">TCGDEX · {result.catalogId}</p>
                  <p className="mt-3 text-[15px] font-medium text-[#f0e8da]">{result.name}</p>
                  <p className="mt-2 font-mono-d text-[9px] text-[#d6ccba]">{t("collectibles.catalog.collectorNumber", { number: result.number })}</p>
                  <p className="mt-4 font-mono-d text-[8px] text-[#fa6c34]">{t("collectibles.catalog.reviewExactMatch")}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 font-mono-d text-[8.5px] leading-relaxed tracking-wide text-[#635d5a]">{t("collectibles.providerOriginalLanguage")}</p>
          </>
        )}
        {truncated && <p className="mt-3 text-[10.5px] text-[#e0a96d]">{t("collectibles.catalog.truncated")}</p>}
        <p className="mt-5 border-t border-[#383838] pt-4 text-[9.5px] leading-relaxed text-[#635d5a]">{t("collectibles.catalog.license")}</p>
      </div>

      {card && (
        <CollectibleOwnerForm
          key={card.catalogId}
          card={card}
          busy={busy}
          sessionId={sessionId}
          onSave={onSaveAsset}
          onBack={() => setCard(null)}
        />
      )}

      {pending && (
        <PermissionDialog pending={pending} returnFocus={permissionTrigger} onCancel={() => setPending(null)} onConfirm={runPending} />
      )}
    </section>
  );
}

function PermissionDialog({ pending, returnFocus, onCancel, onConfirm }: { pending: PendingRequest; returnFocus: HTMLElement | null; onCancel: () => void; onConfirm: () => void }) {
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
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]") ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(
    <div ref={dialogRef} onKeyDown={onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="catalog-permission-title">
      <div className="clip-panel w-full max-w-[620px] border border-[#fa6c34]/55 bg-[#242424] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="font-mono-d text-[9px] tracking-[0.15em] text-[#fa6c34]">{t("collectibles.permission.eyebrow")}</p><h3 id="catalog-permission-title" className="mt-3 text-[24px] font-medium text-[#f0e8da]">{t("collectibles.permission.title")}</h3></div>
          <button ref={cancelRef} type="button" onClick={onCancel} aria-label={t("collectibles.permission.cancelAria")} className="p-2 text-[#635d5a] hover:text-[#f0e8da]"><X size={16} /></button>
        </div>
        <div className="mt-5 border border-[#383838] bg-[#1d1d1d] p-4">
          <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">{t("collectibles.permission.sentToChainScout")}</p>
          <p className="mt-2 break-words font-mono-d text-[10px] text-[#d6ccba]">{pending.summary}</p>
        </div>
        <div className="mt-3 border border-[#383838] bg-[#1d1d1d] p-4">
          <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">{t("collectibles.permission.sentToTcgdex")}</p>
          <p className="mt-2 break-words font-mono-d text-[10px] text-[#d6ccba]">{providerSummary(pending)}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PrivacyFact title={t("collectibles.permission.encryptedTitle")} text={t("collectibles.permission.encryptedText")} />
          <PrivacyFact title={t("collectibles.permission.notRequestedTitle")} text={pending.operation === "search" ? t("collectibles.permission.notRequestedSearch") : t("collectibles.permission.notRequestedDetail")} />
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-[#9a938a]">{t(pending.operation === "search" ? "collectibles.permission.searchNote" : "collectibles.permission.detailNote")} {t("collectibles.permission.receiptNote")}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="min-h-[44px] flex-1 border border-[#4a4743] font-mono-d text-[9px] text-[#9a938a]">{t("collectibles.permission.cancel")}</button>
          <button type="button" onClick={onConfirm} className="clip-btn-sm flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-[#fa6c34] font-mono-d text-[9px] font-medium text-[#1d1d1d]"><ShieldCheck size={13} /> {t("collectibles.permission.confirm")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function providerSummary(pending: PendingRequest): string {
  if (pending.operation === "detail") return pending.summary;
  return `${pending.input.language.toUpperCase()} · ${pending.input.name}${pending.input.number ? ` · #${pending.input.number}` : ""}`;
}

function CollectibleOwnerForm({ card, busy: parentBusy, sessionId, onSave, onBack }: {
  card: CollectibleCardDetail;
  busy: boolean;
  sessionId: number;
  onSave: (draft: VaultAssetDraft, expectedSession: number) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [ownerPrinting, setOwnerPrinting] = useState("");
  const [condition, setCondition] = useState<VaultCollectibleCondition>("unknown");
  const [grader, setGrader] = useState<VaultCollectibleGrader>("ungraded");
  const [grade, setGrade] = useState("");
  const [certificate, setCertificate] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [notes, setNotes] = useState("");
  const [referenceValue, setReferenceValue] = useState("");
  const [referenceCurrency, setReferenceCurrency] = useState("USD");
  const [referenceDate, setReferenceDate] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceLabel, setReferenceLabel] = useState("");
  const [photo, setPhoto] = useState<VaultPhoto>();
  const [photoSource, setPhotoSource] = useState<"owner_supplied" | "tcgdex_catalog" | null>(null);
  const [photoBusy, setPhotoBusy] = useState(Boolean(card.imageUrl));
  const [photoNotice, setPhotoNotice] = useState(card.imageUrl ? t("collectibles.owner.thumbnailLoading") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoRequestRef = useRef(0);
  const graded = grader !== "ungraded";

  const conditionOptions: Array<[VaultCollectibleCondition, string]> = [
    ["unknown", t("collectibles.owner.condition.unknown")],
    ["poor", t("collectibles.owner.condition.poor")],
    ["played", t("collectibles.owner.condition.played")],
    ["good", t("collectibles.owner.condition.good")],
    ["excellent", t("collectibles.owner.condition.excellent")],
    ["near-mint", t("collectibles.owner.condition.nearMint")],
    ["mint", t("collectibles.owner.condition.mint")]
  ];
  const graderOptions: Array<[VaultCollectibleGrader, string]> = [
    ["ungraded", t("collectibles.owner.grader.ungraded")],
    ["psa", t("collectibles.owner.grader.psa")],
    ["cgc", t("collectibles.owner.grader.cgc")],
    ["bgs", t("collectibles.owner.grader.bgs")],
    ["other", t("collectibles.owner.grader.other")]
  ];

  const loadCatalogThumbnail = async () => {
    if (!card.imageUrl) return;
    const requestId = ++photoRequestRef.current;
    const controller = new AbortController();
    setPhotoBusy(true);
    setPhotoNotice(t("collectibles.owner.thumbnailLoading"));
    try {
      const next = await catalogImageToVaultPhoto(card.imageUrl, card.catalogId, controller.signal);
      if (photoRequestRef.current === requestId) {
        setPhoto(next);
        setPhotoSource("tcgdex_catalog");
        setPhotoNotice(t("collectibles.owner.thumbnailReady"));
      }
    } catch (thumbnailError) {
      if (photoRequestRef.current === requestId && !(thumbnailError instanceof DOMException && thumbnailError.name === "AbortError")) {
        setPhotoNotice(t("collectibles.owner.thumbnailUnavailable"));
      }
    } finally {
      if (photoRequestRef.current === requestId) setPhotoBusy(false);
    }
    return () => controller.abort();
  };

  useEffect(() => {
    if (!card.imageUrl) return;
    const requestId = ++photoRequestRef.current;
    const controller = new AbortController();
    const start = window.setTimeout(() => {
      void catalogImageToVaultPhoto(card.imageUrl!, card.catalogId, controller.signal)
        .then((next) => {
          if (photoRequestRef.current !== requestId) return;
          setPhoto(next);
          setPhotoSource("tcgdex_catalog");
          setPhotoNotice(t("collectibles.owner.thumbnailReady"));
        })
        .catch((thumbnailError: unknown) => {
          if (photoRequestRef.current !== requestId || (thumbnailError instanceof DOMException && thumbnailError.name === "AbortError")) return;
          setPhotoNotice(t("collectibles.owner.thumbnailUnavailable"));
        })
        .finally(() => {
          if (photoRequestRef.current === requestId) setPhotoBusy(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(start);
      photoRequestRef.current += 1;
      controller.abort();
    };
  }, [card.catalogId, card.imageUrl, t]);

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const requestId = ++photoRequestRef.current;
    if (file.size > MAX_SOURCE_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("collectibles.owner.photoTooLarge"));
      return;
    }
    setPhotoBusy(true);
    setError("");
    try {
      const next = await fileToVaultPhoto(file);
      if (photoRequestRef.current === requestId) {
        setPhoto(next);
        setPhotoSource("owner_supplied");
        setPhotoNotice(t("collectibles.owner.ownerPhotoReady"));
      }
    } catch {
      if (photoRequestRef.current === requestId) setError(t("collectibles.owner.photoSanitizeFailed"));
    } finally {
      if (photoRequestRef.current === requestId) setPhotoBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || parentBusy || photoBusy) return;
    if (graded && (quantity !== "1" || !grade.trim() || !certificate.trim())) {
      setError(t("collectibles.owner.gradedError"));
      return;
    }
    const hasReference = Boolean(referenceValue || referenceDate || referenceUrl || referenceLabel);
    if (hasReference && (!referenceValue || !referenceDate || !referenceUrl || !referenceLabel)) {
      setError(t("collectibles.owner.referenceError"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      await onSave({
        name: `${card.name} · ${card.set.name} #${card.number}`,
        assetType: "collectible",
        identifier: `tcgdex:${card.language}:${card.catalogId}`,
        lots: [{ quantity, unitPrice, currency, acquiredAt }],
        notes,
        ...(photo ? { photo } : {}),
        collectible: {
          catalog: card,
          ownerPrinting: ownerPrinting.trim(),
          condition,
          grader,
          grade,
          certificate,
          photoSource: photo ? photoSource : null,
          photoAddedAt: photo ? now : null,
          references: hasReference ? [{
            id: crypto.randomUUID(),
            value: referenceValue,
            currency: referenceCurrency,
            observedAt: referenceDate,
            sourceUrl: referenceUrl,
            label: referenceLabel
          }] : []
        }
      }, sessionId);
      onBack();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("collectibles.owner.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="clip-panel mt-5 border border-[#7fb069]/40 bg-[#222722] p-5 sm:p-7" data-testid="collectible-owner-form">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono-d text-[9px] tracking-wider text-[#7fb069]">{t("collectibles.owner.identityResolved")}</p><h3 className="mt-3 text-[24px] font-medium text-[#f0e8da]">{card.name}</h3><p className="mt-2 text-[12px] text-[#9a938a]">{card.set.name} · #{card.number} · {card.rarity ?? t("collectibles.owner.rarityNotSupplied")}</p><p className="mt-2 font-mono-d text-[8.5px] tracking-wide text-[#635d5a]">{t("collectibles.providerOriginalLanguage")}</p></div>
        <button type="button" onClick={onBack} className="p-2 text-[#635d5a] hover:text-[#f0e8da]" aria-label={t("collectibles.owner.closeAria")}><X size={16} /></button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Input label={t("collectibles.owner.printingLabel")} value={ownerPrinting} onChange={setOwnerPrinting} maxLength={120} placeholder={t("collectibles.owner.printingPlaceholder")} />
        <Select label={t("collectibles.owner.conditionLabel")} value={condition} onChange={(value) => setCondition(value as VaultCollectibleCondition)} options={conditionOptions} />
        <Select label={t("collectibles.owner.graderLabel")} value={grader} onChange={(value) => {
          const next = value as VaultCollectibleGrader;
          setGrader(next);
          if (next === "ungraded") { setGrade(""); setCertificate(""); }
          else setQuantity("1");
        }} options={graderOptions} />
        <Input label={t("collectibles.owner.quantityLabel")} value={quantity} onChange={setQuantity} maxLength={157} required disabled={graded} />
        {graded && <><Input label={t("collectibles.owner.gradeLabel")} value={grade} onChange={setGrade} maxLength={40} required /><Input label={t("collectibles.owner.certificateLabel")} value={certificate} onChange={setCertificate} maxLength={80} required /></>}
        <Input label={t("collectibles.owner.purchasePriceLabel")} value={unitPrice} onChange={setUnitPrice} maxLength={157} placeholder={t("collectibles.catalog.optionalPlaceholder")} />
        <Input label={t("collectibles.owner.purchaseCurrencyLabel")} value={currency} onChange={setCurrency} maxLength={12} required />
        <Input label={t("collectibles.owner.acquiredDateLabel")} value={acquiredAt} onChange={setAcquiredAt} type="date" />
      </div>
      <label className="mt-4 block"><span className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{t("collectibles.owner.notesLabel")}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5_000} rows={3} className="mt-2 w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 text-[12px] text-[#e9e0d1] outline-none focus:border-[#fa6c34]" placeholder={t("collectibles.owner.notesPlaceholder")} /></label>
      <div className="mt-5 border border-[#383838] bg-[#1d1d1d] p-4 sm:p-5">
        <p className="font-mono-d text-[8.5px] tracking-wider text-[#fa6c34]">{t("collectibles.owner.valueReferenceTitle")}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Input label={t("collectibles.owner.valueLabel")} value={referenceValue} onChange={setReferenceValue} maxLength={157} placeholder={t("collectibles.catalog.optionalPlaceholder")} />
          <Input label={t("collectibles.owner.currencyLabel")} value={referenceCurrency} onChange={setReferenceCurrency} maxLength={12} />
          <Input label={t("collectibles.owner.observedDateLabel")} value={referenceDate} onChange={setReferenceDate} type="date" />
          <Input label={t("collectibles.owner.sourceUrlLabel")} value={referenceUrl} onChange={setReferenceUrl} maxLength={1_000} placeholder={t("collectibles.owner.sourceUrlPlaceholder")} />
          <Input label={t("collectibles.owner.sourceLabelLabel")} value={referenceLabel} onChange={setReferenceLabel} maxLength={120} placeholder={t("collectibles.owner.sourceLabelPlaceholder")} />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4 border-t border-[#383838] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {photo && <img src={photo.dataUrl} alt={t("collectibles.owner.photoAlt", { name: card.name })} className="h-36 w-28 rounded-sm border border-[#383838] bg-[#1d1d1d] object-contain p-2" />}
          <label className="flex min-h-[42px] cursor-pointer items-center gap-2 border border-[#383838] px-4 font-mono-d text-[9px] text-[#9a938a] hover:text-[#f0e8da]"><ImagePlus size={13} /> {photoBusy ? t("collectibles.owner.photoSanitizing") : photo ? t("collectibles.owner.photoReplace") : t("collectibles.owner.photoAdd")}<input aria-label={t("collectibles.owner.photoAria")} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={busy || photoBusy} className="sr-only" /></label>
          {photo && <button type="button" onClick={() => { photoRequestRef.current += 1; setPhoto(undefined); setPhotoSource(null); setPhotoNotice(t("collectibles.owner.photoRemoved")); }} className="font-mono-d text-[8.5px] text-[#e0738a]">{t("collectibles.owner.photoRemove")}</button>}
          {!photo && card.imageUrl && <button type="button" onClick={() => { void loadCatalogThumbnail(); }} disabled={photoBusy} className="font-mono-d text-[8.5px] text-[#7fb069] disabled:opacity-40">{t("collectibles.owner.thumbnailRestore")}</button>}
          <div className="max-w-[440px]"><p role="status" className="font-mono-d text-[8.5px] text-[#7fb069]">{photoNotice}</p><p className="mt-1 text-[10px] leading-relaxed text-[#635d5a]">{t("collectibles.owner.thumbnailNote")}</p></div>
        </div>
        <button type="submit" disabled={busy || parentBusy || photoBusy} className="clip-btn-sm flex min-h-[46px] items-center justify-center gap-2 bg-[#7fb069] px-6 font-mono-d text-[9.5px] font-medium tracking-wider text-[#172015] disabled:opacity-40"><LockKeyhole size={13} /> {busy ? t("collectibles.owner.saving") : t("collectibles.owner.save")}</button>
      </div>
      {error && <p role="alert" className="mt-4 text-[11px] text-[#e0738a]">{error}</p>}
      <p className="mt-4 text-[10px] leading-relaxed text-[#635d5a]">{t("collectibles.owner.sourcePrefix")}<a href={card.sourceUrl} target="_blank" rel="noreferrer" className="text-[#9a938a] underline">{t("collectibles.owner.sourceGraphql")}</a> · <a href={card.licenseUrl} target="_blank" rel="noreferrer" className="text-[#9a938a] underline">{t("collectibles.owner.sourceLicense")}</a>{t("collectibles.owner.sourceFooterTail")}</p>
    </form>
  );
}

function PrivacyFact({ title, text }: { title: string; text: string }) {
  return <div className="border border-[#383838] bg-[#202020] p-4"><p className="font-mono-d text-[8px] tracking-wider text-[#7fb069]">{title}</p><p className="mt-2 text-[10.5px] leading-relaxed text-[#7f7972]">{text}</p></div>;
}

function Input({ label, value, onChange, type = "text", placeholder, maxLength, required, disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; maxLength?: number; required?: boolean; disabled?: boolean }) {
  return <label className="block"><span className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{label}</span><input aria-label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} required={required} disabled={disabled} className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-3 font-mono-d text-[10px] text-[#e9e0d1] outline-none focus:border-[#fa6c34] disabled:opacity-50" /></label>;
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]>; disabled?: boolean }) {
  return <label className="block"><span className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-3 font-mono-d text-[10px] text-[#e9e0d1] outline-none focus:border-[#fa6c34] disabled:opacity-50">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
