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

const LANGUAGES: Array<[CollectibleLanguage, string]> = [["en", "English · launch"]];

export function CollectibleCatalogPanel({ context, sessionId, onSaveContext, onSaveAsset, onManual }: Props) {
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
      summary: `${language.toUpperCase()} · ${name.trim()}${number.trim() ? ` · #${number.trim()}` : ""}${setId.trim() ? ` · set ${setId.trim()}` : ""}`
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
        ? "ChainScout receives the confirmed English card name, optional collector number, and optional set ID. TCGdex receives only the name and optional collector number. Ownership and other private fields remain encrypted in this browser."
        : "ChainScout and TCGdex receive the selected public card ID. Ownership and other private fields remain encrypted in this browser.",
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
          ? `${response.matchesShown} catalog match${response.matchesShown === 1 ? "" : "es"} shown. Choose one to verify its card and set identity.`
          : "No catalog match was found. You can adjust the search or add the asset manually.");
      } else {
        const response = await collectibleDetail(request.language, request.card.catalogId, controller.signal);
        setCard(response.card);
        setNotice("Catalog identity resolved. Owner details below remain local and are not verified by TCGdex.");
      }
      await persistReceipt({ ...receipt, outcome: "completed", resolvedAt: new Date().toISOString() });
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (!receiptSaved) {
        setError("The encrypted permission receipt could not be saved, so ChainScout did not contact the catalog.");
      } else {
        setError(requestError instanceof Error ? requestError.message : "The catalog request failed. The manual Vault path is still available.");
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
            <p className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.15em] text-[#fa6c34]"><BookOpenCheck size={14} /> COLLECTIBLE CATALOG</p>
            <h2 className="mt-3 text-[26px] font-medium tracking-[-0.025em] text-[#f0e8da]">Match the card. Keep ownership private.</h2>
            <p className="mt-3 max-w-[760px] text-[12.5px] leading-relaxed text-[#9a938a]">TCGdex supplies English card and set identity only. Printing or variant, condition, grade, certificate, value, authenticity, and inventory remain owner claims. Artwork and marketplace prices are not requested.</p>
          </div>
          <button type="button" onClick={onManual} className="min-h-[42px] border border-[#4a4743] px-4 font-mono-d text-[9px] tracking-wider text-[#d6ccba] hover:border-[#fa6c34]">ADD WITHOUT CATALOG</button>
        </div>

        <form onSubmit={requestSearch} className="mt-6 grid gap-3 md:grid-cols-[0.65fr_1.5fr_0.7fr_0.8fr_auto] md:items-end">
          <Select label="LANGUAGE" value={language} onChange={(value) => setLanguage(value as CollectibleLanguage)} options={LANGUAGES} disabled={busy} />
          <Input label="CARD NAME" value={name} onChange={setName} placeholder="e.g. Charizard" maxLength={80} required disabled={busy} />
          <Input label="NUMBER" value={number} onChange={setNumber} placeholder="Optional" maxLength={24} disabled={busy} />
          <Input label="SET ID" value={setId} onChange={setSetId} placeholder="Optional" maxLength={32} disabled={busy} />
          <button type="submit" disabled={busy || name.trim().length < 2} className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[9.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-40"><Search size={13} /> REVIEW LOOKUP</button>
        </form>
        <p className="mt-3 font-mono-d text-[8.5px] leading-relaxed tracking-wide text-[#635d5a]">TIP · SET ID + COLLECTOR NUMBER PRODUCES THE LEAST AMBIGUOUS MATCH</p>
        {error && <div role="alert" className="mt-5 border border-[#e0738a]/40 bg-[#e0738a]/8 px-4 py-3 text-[11.5px] text-[#e0738a]">{error}</div>}
        {notice && <div role="status" className="mt-5 border border-[#7fb069]/30 bg-[#7fb069]/5 px-4 py-3 text-[11.5px] text-[#9fc68f]">{notice}</div>}

        {results.length > 0 && !card && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {results.map((result) => (
              <button key={result.catalogId} type="button" disabled={busy} onClick={(event) => { setPermissionTrigger(event.currentTarget); setPending({ operation: "detail", language: resultLanguage, card: result, summary: `${resultLanguage.toUpperCase()} · ${result.catalogId}` }); }} className="border border-[#383838] bg-[#1f1f1f] p-4 text-left hover:border-[#fa6c34] disabled:opacity-40">
                <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">TCGDEX · {result.catalogId}</p>
                <p className="mt-3 text-[15px] font-medium text-[#f0e8da]">{result.name}</p>
                <p className="mt-2 font-mono-d text-[9px] text-[#d6ccba]">COLLECTOR #{result.number}</p>
                <p className="mt-4 font-mono-d text-[8px] text-[#fa6c34]">REVIEW EXACT MATCH →</p>
              </button>
            ))}
          </div>
        )}
        {truncated && <p className="mt-3 text-[10.5px] text-[#e0a96d]">Results are bounded and truncated. Add a set ID or collector number to narrow the lookup.</p>}
        <p className="mt-5 border-t border-[#383838] pt-4 text-[9.5px] leading-relaxed text-[#635d5a]">Community catalog metadata is supplied by TCGdex under its database license. ChainScout is not affiliated with or endorsed by TCGdex, Nintendo, The Pokémon Company, any marketplace, or any grading company. Names and trademarks remain the property of their respective owners.</p>
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
          <div><p className="font-mono-d text-[9px] tracking-[0.15em] text-[#fa6c34]">EXACT NETWORK RECEIPT</p><h3 id="catalog-permission-title" className="mt-3 text-[24px] font-medium text-[#f0e8da]">Confirm this catalog lookup</h3></div>
          <button ref={cancelRef} type="button" onClick={onCancel} aria-label="Cancel catalog lookup" className="p-2 text-[#635d5a] hover:text-[#f0e8da]"><X size={16} /></button>
        </div>
        <div className="mt-5 border border-[#383838] bg-[#1d1d1d] p-4">
          <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">SENT TO CHAINSCOUT</p>
          <p className="mt-2 break-words font-mono-d text-[10px] text-[#d6ccba]">{pending.summary}</p>
        </div>
        <div className="mt-3 border border-[#383838] bg-[#1d1d1d] p-4">
          <p className="font-mono-d text-[8px] tracking-wider text-[#635d5a]">SENT TO TCGDEX</p>
          <p className="mt-2 break-words font-mono-d text-[10px] text-[#d6ccba]">{providerSummary(pending)}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PrivacyFact title="ENCRYPTED LOCALLY" text="Permission attempt, ownership fields, photos, costs, notes, grades, certificates, and manual values." />
          <PrivacyFact title="NOT REQUESTED" text="No account, wallet, AI model, artwork, marketplace price, printing claim, or server-stored catalog result." />
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-[#9a938a]">ChainScout uses a field-selective GraphQL request for identity metadata, so artwork and marketplace fields are never requested or received. The encrypted permission attempt is saved before the request. A catalog match is not proof that your physical card is authentic or currently worth any amount.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="min-h-[44px] flex-1 border border-[#4a4743] font-mono-d text-[9px] text-[#9a938a]">CANCEL</button>
          <button type="button" onClick={onConfirm} className="clip-btn-sm flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-[#fa6c34] font-mono-d text-[9px] font-medium text-[#1d1d1d]"><ShieldCheck size={13} /> SAVE RECEIPT + LOOK UP</button>
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoRequestRef = useRef(0);
  const graded = grader !== "ungraded";

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const requestId = ++photoRequestRef.current;
    if (file.size > MAX_SOURCE_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use one owner-supplied JPEG, PNG, or WebP source up to 12 MB.");
      return;
    }
    setPhotoBusy(true);
    setError("");
    try {
      const next = await fileToVaultPhoto(file);
      if (photoRequestRef.current === requestId) setPhoto(next);
    } catch {
      if (photoRequestRef.current === requestId) setError("That photo could not be sanitized locally.");
    } finally {
      if (photoRequestRef.current === requestId) setPhotoBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || parentBusy || photoBusy) return;
    if (graded && (quantity !== "1" || !grade.trim() || !certificate.trim())) {
      setError("A graded certificate must describe exactly one copy and include both grade and certificate number.");
      return;
    }
    const hasReference = Boolean(referenceValue || referenceDate || referenceUrl || referenceLabel);
    if (hasReference && (!referenceValue || !referenceDate || !referenceUrl || !referenceLabel)) {
      setError("A manual value reference needs value, date observed, source URL, and a short source label.");
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
          photoSource: photo ? "owner_supplied" : null,
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
      setError(saveError instanceof Error ? saveError.message : "The encrypted collectible could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="clip-panel mt-5 border border-[#7fb069]/40 bg-[#222722] p-5 sm:p-7" data-testid="collectible-owner-form">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono-d text-[9px] tracking-wider text-[#7fb069]">CATALOG IDENTITY RESOLVED · NOT AN AUTHENTICITY CHECK</p><h3 className="mt-3 text-[24px] font-medium text-[#f0e8da]">{card.name}</h3><p className="mt-2 text-[12px] text-[#9a938a]">{card.set.name} · #{card.number} · {card.rarity ?? "Rarity not supplied"}</p></div>
        <button type="button" onClick={onBack} className="p-2 text-[#635d5a] hover:text-[#f0e8da]" aria-label="Close resolved catalog card"><X size={16} /></button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Input label="OWNER-REPORTED PRINTING / VARIANT" value={ownerPrinting} onChange={setOwnerPrinting} maxLength={120} placeholder="Optional · e.g. holo, shadowless" />
        <Select label="OWNER-REPORTED CONDITION" value={condition} onChange={(value) => setCondition(value as VaultCollectibleCondition)} options={[["unknown", "Not entered"], ["poor", "Poor"], ["played", "Played"], ["good", "Good"], ["excellent", "Excellent"], ["near-mint", "Near mint"], ["mint", "Mint"]]} />
        <Select label="OWNER-REPORTED GRADER" value={grader} onChange={(value) => {
          const next = value as VaultCollectibleGrader;
          setGrader(next);
          if (next === "ungraded") { setGrade(""); setCertificate(""); }
          else setQuantity("1");
        }} options={[["ungraded", "Ungraded"], ["psa", "PSA"], ["cgc", "CGC"], ["bgs", "BGS"], ["other", "Other"]]} />
        <Input label="QUANTITY" value={quantity} onChange={setQuantity} maxLength={157} required disabled={graded} />
        {graded && <><Input label="OWNER-ENTERED GRADE" value={grade} onChange={setGrade} maxLength={40} required /><Input label="OWNER-ENTERED CERTIFICATE" value={certificate} onChange={setCertificate} maxLength={80} required /></>}
        <Input label="PURCHASE PRICE / UNIT" value={unitPrice} onChange={setUnitPrice} maxLength={157} placeholder="Optional" />
        <Input label="PURCHASE CURRENCY" value={currency} onChange={setCurrency} maxLength={12} required />
        <Input label="ACQUIRED DATE" value={acquiredAt} onChange={setAcquiredAt} type="date" />
      </div>
      <label className="mt-4 block"><span className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">PRIVATE NOTES</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5_000} rows={3} className="mt-2 w-full border border-[#383838] bg-[#1d1d1d] px-4 py-3 text-[12px] text-[#e9e0d1] outline-none focus:border-[#fa6c34]" placeholder="Storage location, provenance, personal notes…" /></label>
      <div className="mt-5 border border-[#383838] bg-[#1d1d1d] p-4 sm:p-5">
        <p className="font-mono-d text-[8.5px] tracking-wider text-[#fa6c34]">OPTIONAL MANUAL VALUE REFERENCE · NOT LIVE OR VERIFIED</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Input label="VALUE" value={referenceValue} onChange={setReferenceValue} maxLength={157} placeholder="Optional" />
          <Input label="CURRENCY" value={referenceCurrency} onChange={setReferenceCurrency} maxLength={12} />
          <Input label="OBSERVED DATE" value={referenceDate} onChange={setReferenceDate} type="date" />
          <Input label="HTTPS SOURCE URL" value={referenceUrl} onChange={setReferenceUrl} maxLength={1_000} placeholder="https://…" />
          <Input label="SOURCE LABEL" value={referenceLabel} onChange={setReferenceLabel} maxLength={120} placeholder="e.g. sold listing" />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4 border-t border-[#383838] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-[42px] cursor-pointer items-center gap-2 border border-[#383838] px-4 font-mono-d text-[9px] text-[#9a938a] hover:text-[#f0e8da]"><ImagePlus size={13} /> {photoBusy ? "SANITIZING…" : photo ? "REPLACE OWNER PHOTO" : "ADD OWNER PHOTO"}<input aria-label="OWNER-SUPPLIED COLLECTIBLE PHOTO" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={busy || photoBusy} className="sr-only" /></label>
          {photo && <button type="button" onClick={() => { photoRequestRef.current += 1; setPhoto(undefined); }} className="font-mono-d text-[8.5px] text-[#e0738a]">REMOVE PHOTO</button>}
          <p className="max-w-[420px] text-[10px] leading-relaxed text-[#635d5a]">Processed locally to strip metadata; never fetched from the catalog and never uploaded.</p>
        </div>
        <button type="submit" disabled={busy || parentBusy || photoBusy} className="clip-btn-sm flex min-h-[46px] items-center justify-center gap-2 bg-[#7fb069] px-6 font-mono-d text-[9.5px] font-medium tracking-wider text-[#172015] disabled:opacity-40"><LockKeyhole size={13} /> {busy ? "ENCRYPTING…" : "SAVE PRIVATE COLLECTIBLE"}</button>
      </div>
      {error && <p role="alert" className="mt-4 text-[11px] text-[#e0738a]">{error}</p>}
      <p className="mt-4 text-[10px] leading-relaxed text-[#635d5a]">Catalog source: <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="text-[#9a938a] underline">TCGdex GraphQL</a> · <a href={card.licenseUrl} target="_blank" rel="noreferrer" className="text-[#9a938a] underline">metadata license</a>. Printing, photo, condition, grade, certificate, value, and source are owner-entered claims.</p>
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
