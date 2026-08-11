import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode
} from "react";
import { Link } from "react-router";
import {
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileKey2,
  HardDrive,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  PackagePlus,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { isVaultPlatformSupported, vaultErrorMessage } from "../vault/crypto";
import {
  bootstrapVault,
  createLocalVault,
  deleteVaultAsset,
  destroyLocalVault,
  exportVault,
  importVaultBackup,
  parseVaultBackup,
  recoverLocalVault,
  recoverVaultBackup,
  saveVaultAsset,
  saveVaultPortfolio,
  unlockLocalVault,
  updateVaultPassphrase,
  type UnlockedVault
} from "../vault/service";
import { readStorageStatus, requestPersistentStorage } from "../vault/db";
import { readImageDimensions } from "../vault/photo";
import {
  VAULT_MAX_BACKUP_BYTES,
  VAULT_MAX_PHOTO_BYTES,
  type VaultAsset,
  type VaultAssetDraft,
  type VaultAssetType,
  type VaultLotDraft,
  type VaultMeta,
  type VaultPhoto,
  type VaultPortfolioContext,
  type VaultPortfolioContextDraft,
  type VaultStorageStatus
} from "../vault/types";
import { PortfolioPanel } from "../portfolio/PortfolioPanel";

type Phase = "loading" | "empty" | "locked" | "unlocked" | "deleting" | "unsupported";
const DELETE_PHRASE = "DELETE MY LOCAL VAULT";
const REPLACE_PHRASE = "REPLACE MY LOCAL VAULT";
const AUTO_LOCK_MS = 10 * 60 * 1000;
const MAX_SOURCE_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 24_000_000;

const EMPTY_DRAFT: VaultAssetDraft = {
  name: "",
  assetType: "collectible",
  identifier: "",
  lots: [{ quantity: "1", unitPrice: "", currency: "USD", acquiredAt: "" }],
  notes: ""
};

export default function VaultPage() {
  const platformSupported = isVaultPlatformSupported();
  const [phase, setPhase] = useState<Phase>(platformSupported ? "loading" : "unsupported");
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [portfolios, setPortfolios] = useState<UnlockedVault["portfolios"]>([]);
  const [workspace, setWorkspace] = useState<"assets" | "portfolio">("assets");
  const [storage, setStorage] = useState<VaultStorageStatus>({ supported: platformSupported, persistent: null, usage: null, quota: null });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<VaultAsset | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recoverySecret, setRecoverySecret] = useState("");
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const deletionPendingRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const tabIdRef = useRef("");
  const unlockedStateRef = useRef({ meta, sessionKey, assets, portfolios, phase });

  useEffect(() => {
    unlockedStateRef.current = { meta, sessionKey, assets, portfolios, phase };
  }, [assets, meta, phase, portfolios, sessionKey]);

  const bumpSession = useCallback(() => {
    const next = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = next;
    setSessionGeneration(next);
  }, []);

  const broadcast = useCallback((event: "lock" | "changed" | "deleting" | "delete-cancelled" | "deleted", targetMeta = meta) => {
    if (!targetMeta) return;
    channelRef.current?.postMessage({
      event,
      vaultId: targetMeta.vaultId,
      revision: targetMeta.revision,
      source: tabIdRef.current
    });
  }, [meta]);

  useEffect(() => {
    let active = true;
    if (!isVaultPlatformSupported()) {
      return () => { active = false; };
    }
    Promise.all([bootstrapVault(), readStorageStatus()])
      .then(([savedMeta, status]) => {
        if (!active) return;
        setMeta(savedMeta);
        setStorage(status);
        setPhase(savedMeta ? "locked" : "empty");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(vaultErrorMessage(loadError));
        setPhase("unsupported");
      });
    return () => { active = false; };
  }, []);

  const lock = useCallback((message = "Vault locked. The decryption key was removed from page memory.", notify = true) => {
    bumpSession();
    if (notify) broadcast("lock");
    setSessionKey(null);
    setAssets([]);
    setPortfolios([]);
    setEditor(null);
    setSettingsOpen(false);
    setRecoverySecret("");
    setPhase(meta ? "locked" : "empty");
    setNotice(message);
    setError("");
  }, [broadcast, bumpSession, meta]);

  useEffect(() => {
    if (!isVaultPlatformSupported() || typeof BroadcastChannel === "undefined") return;
    if (!tabIdRef.current) tabIdRef.current = crypto.randomUUID();
    let active = true;
    const channel = new BroadcastChannel("chainscout-vault-control-v1");
    channelRef.current = channel;
    channel.onmessage = async (message: MessageEvent<unknown>) => {
      const value = message.data;
      if (!value || typeof value !== "object") return;
      const event = value as { event?: unknown; vaultId?: unknown; source?: unknown };
      if (event.source === tabIdRef.current) return;
      if (deletionPendingRef.current && event.event !== "deleted" && event.event !== "delete-cancelled") return;
      if (event.event === "changed") {
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || !savedMeta || savedMeta.vaultId !== event.vaultId) return;
        bumpSession();
        setSessionKey(null);
        setMeta(savedMeta);
        setAssets([]);
        setPortfolios([]);
        setEditor(null);
        setSettingsOpen(false);
        setRecoverySecret("");
        setPhase("locked");
        setError("");
        setNotice(meta
          ? "This Vault changed in another tab. Unlock again to load the newest revision."
          : "A Vault was created in another ChainScout tab. Unlock it here to continue.");
        return;
      }
      if (event.event === "deleting") {
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || !savedMeta || savedMeta.vaultId !== event.vaultId) return;
        bumpSession();
        deletionPendingRef.current = true;
        setMeta(savedMeta);
        setSessionKey(null);
        setAssets([]);
        setPortfolios([]);
        setEditor(null);
        setSettingsOpen(false);
        setRecoverySecret("");
        setPhase("deleting");
        setError("");
        setNotice("Deletion is pending in another ChainScout tab. Vault operations are disabled until the browser finishes.");
      } else if (event.event === "delete-cancelled") {
        deletionPendingRef.current = false;
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || !savedMeta || savedMeta.vaultId !== event.vaultId) return;
        setMeta(savedMeta);
        setPhase("locked");
        setError("");
        setNotice("Local deletion did not complete. The Vault remains locked and unchanged.");
      } else if (event.event === "deleted") {
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || savedMeta) return;
        bumpSession();
        deletionPendingRef.current = false;
        setSessionKey(null);
        setMeta(null);
        setAssets([]);
        setPortfolios([]);
        setEditor(null);
        setSettingsOpen(false);
        setRecoverySecret("");
        setPhase("empty");
        setError("");
        setNotice("This Vault was deleted in another ChainScout tab.");
      } else if (event.event === "lock" && meta && event.vaultId === meta.vaultId) {
        lock("Vault locked across open ChainScout tabs.", false);
      }
    };
    return () => {
      active = false;
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [bumpSession, lock, meta]);

  useEffect(() => {
    if (phase !== "unlocked") return;
    let deadline = Date.now() + AUTO_LOCK_MS;
    let timer = window.setTimeout(enforceDeadline, AUTO_LOCK_MS);
    function enforceDeadline() {
      const remaining = deadline - Date.now();
      if (remaining <= 0) lock("Vault auto-locked after 10 minutes without activity.");
      else timer = window.setTimeout(enforceDeadline, remaining);
    }
    const reset = () => {
      if (document.visibilityState === "hidden") return;
      deadline = Date.now() + AUTO_LOCK_MS;
      window.clearTimeout(timer);
      timer = window.setTimeout(enforceDeadline, AUTO_LOCK_MS);
    };
    const leavePage = () => lock("Vault locked because this page was hidden or left.");
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") leavePage();
      else enforceDeadline();
    };
    const pageShown = (event: PageTransitionEvent) => {
      if (event.persisted || Date.now() >= deadline) leavePage();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", leavePage);
    window.addEventListener("pageshow", pageShown);
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", leavePage);
      window.removeEventListener("pageshow", pageShown);
    };
  }, [lock, phase]);

  const acceptUnlocked = (unlocked: UnlockedVault & { recoverySecret?: string }, message: string) => {
    bumpSession();
    setSessionKey(unlocked.key);
    setMeta(unlocked.meta);
    setAssets(unlocked.assets);
    setPortfolios(unlocked.portfolios);
    setWorkspace("assets");
    setEditor(null);
    setSettingsOpen(false);
    setPhase("unlocked");
    setRecoverySecret(unlocked.recoverySecret ?? "");
    setError("");
    setNotice(message);
  };

  const unlockedContext = (): UnlockedVault => {
    if (!meta || !sessionKey || phase !== "unlocked") throw new Error("Vault is locked");
    return { meta, key: sessionKey, assets, portfolios };
  };

  const saveAsset = async (draft: VaultAssetDraft, existing?: VaultAsset) => {
    try {
      const saved = await saveVaultAsset(unlockedContext(), draft, existing);
      setMeta(saved.meta);
      broadcast("changed", saved.meta);
      setAssets((current) => [saved.asset, ...current.filter((asset) => asset.id !== saved.asset.id)]);
      setEditor(null);
      setError("");
      setNotice(existing ? "Encrypted asset updated locally." : "Asset encrypted and saved locally.");
      setStorage(await readStorageStatus());
    } catch (saveError) {
      setError(vaultErrorMessage(saveError));
    }
  };

  const removeAsset = async (id: string) => {
    try {
      const nextMeta = await deleteVaultAsset(unlockedContext(), id);
      setMeta(nextMeta);
      broadcast("changed", nextMeta);
      setAssets((current) => current.filter((asset) => asset.id !== id));
      setNotice("Encrypted asset removed from this device.");
      setError("");
    } catch (deleteError) {
      setError(vaultErrorMessage(deleteError));
    }
  };

  const savePortfolio = async (
    draft: VaultPortfolioContextDraft,
    existing?: VaultPortfolioContext,
    expectedSession = sessionGenerationRef.current
  ): Promise<VaultPortfolioContext> => {
    const assertActive = () => {
      if (sessionGenerationRef.current !== expectedSession) throw new Error("Vault session changed");
    };
    assertActive();
    const current = unlockedStateRef.current;
    if (!current.meta || !current.sessionKey || current.phase !== "unlocked") throw new Error("Vault is locked");
    const saved = await saveVaultPortfolio({
      meta: current.meta,
      key: current.sessionKey,
      assets: current.assets,
      portfolios: current.portfolios
    }, draft, existing, assertActive);
    assertActive();
    const nextPortfolios = [saved.portfolio, ...current.portfolios.filter((portfolio) => portfolio.id !== saved.portfolio.id)];
    unlockedStateRef.current = { ...current, meta: saved.meta, portfolios: nextPortfolios };
    setMeta(saved.meta);
    setPortfolios(nextPortfolios);
    broadcast("changed", saved.meta);
    setStorage(await readStorageStatus());
    return saved.portfolio;
  };

  const destroy = async () => {
    try {
      bumpSession();
      deletionPendingRef.current = true;
      broadcast("deleting");
      setSessionKey(null);
      setAssets([]);
      setPortfolios([]);
      setEditor(null);
      setSettingsOpen(false);
      setRecoverySecret("");
      setPhase("deleting");
      await destroyLocalVault(() => {
        setNotice("Deletion is waiting for another tab or browser process to release this Vault. Keep this page open and close the blocker; deletion will finish automatically.");
      });
      deletionPendingRef.current = false;
      broadcast("deleted");
      setMeta(null);
      setPhase("empty");
      setError("");
      setNotice("The local encrypted vault was permanently deleted from this browser.");
      setStorage(await readStorageStatus());
    } catch (deleteError) {
      deletionPendingRef.current = false;
      setError(vaultErrorMessage(deleteError));
      setPhase(meta ? "locked" : "empty");
      if (meta) broadcast("delete-cancelled", meta);
    }
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <VaultHeader phase={phase} onLock={() => lock()} />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-10 sm:px-6 lg:pt-14">
        <Link to="/app" className="mb-8 inline-flex items-center gap-2 font-mono-d text-[10px] tracking-wider text-[#635d5a] hover:text-[#d6ccba]">
          <ArrowLeft size={12} /> PRIVATE EXPLORER
        </Link>
        <VaultHero storage={storage} phase={phase} />

        {error && <div role="alert" className="mt-6 border border-[#e0738a]/45 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]">{error}</div>}
        {notice && <div role="status" className="mt-6 flex items-center gap-2 border border-[#7fb069]/35 bg-[#7fb069]/5 px-5 py-4 text-[12px] text-[#9fc68f]"><CheckCircle2 size={14} /> {notice}</div>}

        {phase === "loading" && <VaultLoading />}
        {phase === "deleting" && <VaultDeleting />}
        {phase === "unsupported" && <UnsupportedState />}
        {phase === "empty" && (
          <div className="mt-8">
            <div className="border border-[#e0a96d]/30 bg-[#e0a96d]/5 px-5 py-4 text-[11.5px] leading-relaxed text-[#b7a17e]">NO VAULT FOUND · If you expected one here, this browser may have cleared or evicted the site's local data. Restore an encrypted backup; do not create a replacement until you have checked your backup.</div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <CreateVaultPanel onCreate={async (passphrase) => {
              try {
                const created = await createLocalVault(passphrase);
                acceptUnlocked(created, "Vault created. The decryption key exists only in this page's memory.");
                broadcast("changed", created.meta);
                setStorage(await readStorageStatus());
              } catch (createError) {
                setError(vaultErrorMessage(createError));
              }
              }} />
              <ImportVaultPanel existing={false} expectedMeta={null} onImport={(unlocked) => { acceptUnlocked(unlocked, "Encrypted backup verified and restored locally."); broadcast("changed", unlocked.meta); }} />
              <BackupRecoveryPanel onRecover={(unlocked) => { acceptUnlocked(unlocked, "Backup recovered with the one-time code. Save the newly rotated code and export a fresh backup now; older backups still require their older credentials."); broadcast("changed", unlocked.meta); }} />
            </div>
          </div>
        )}
        {phase === "locked" && meta && (
          <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <UnlockPanel onUnlock={async (passphrase) => {
              try {
                acceptUnlocked(await unlockLocalVault(meta, passphrase), "Vault unlocked locally. It will auto-lock after 10 minutes without activity.");
              } catch (unlockError) {
                setError(vaultErrorMessage(unlockError));
              }
            }} />
            <div className="space-y-5">
              <RecoveryPanel meta={meta} onRecover={(recovered) => { acceptUnlocked(recovered, "Recovery succeeded. Save the newly rotated code and export a fresh backup now; older backups still require their older credentials."); broadcast("changed", recovered.meta); }} />
              <ImportVaultPanel existing expectedMeta={meta} onImport={(unlocked) => { acceptUnlocked(unlocked, "Encrypted backup verified and replaced the local vault."); broadcast("changed", unlocked.meta); }} />
              <DeleteVaultPanel onDelete={destroy} compact />
            </div>
          </div>
        )}
        {phase === "unlocked" && meta && (
          <>
            {recoverySecret && <RecoverySecretPanel secret={recoverySecret} onDone={() => setRecoverySecret("")} />}
            <div className="mt-8 grid grid-cols-2 gap-px border border-[#383838] bg-[#383838]">
              <button type="button" onClick={() => { setWorkspace("portfolio"); setEditor(null); }} className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "portfolio" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}>PORTFOLIO INTELLIGENCE</button>
              <button type="button" onClick={() => setWorkspace("assets")} className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "assets" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}>MANUAL ASSET RECORDS</button>
            </div>
            {workspace === "portfolio" ? (
              <PortfolioPanel
                key={`${meta.vaultId}:${sessionGeneration}:portfolio`}
                assets={assets}
                context={portfolios[0]}
                sessionId={sessionGeneration}
                onSave={savePortfolio}
              />
            ) : (
              <>
                <VaultDashboard assets={assets} onAdd={() => setEditor("new")} />
                {editor && (
                  <AssetEditor
                    key={editor === "new" ? "new" : editor.id}
                    asset={editor === "new" ? undefined : editor}
                    onCancel={() => setEditor(null)}
                    onSave={saveAsset}
                  />
                )}
                <AssetGrid assets={assets} onEdit={setEditor} onDelete={removeAsset} />
              </>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
              className="mt-8 flex w-full items-center justify-between border border-[#383838] bg-[#202020] px-5 py-4 text-left font-mono-d text-[10px] tracking-[0.14em] text-[#9a938a] hover:text-[#e9e0d1]"
            >
              <span>BACKUP · RECOVERY · STORAGE · PASSPHRASE</span>
              <span>{settingsOpen ? "CLOSE −" : "OPEN +"}</span>
            </button>
            {settingsOpen && (
              <VaultSettings
                storage={storage}
                onStorage={async () => setStorage(await requestPersistentStorage())}
                onMeta={(nextMeta) => {
                  setMeta(nextMeta);
                  broadcast("changed", nextMeta);
                  setNotice("Passphrase changed. Export a fresh backup now; older backups still require the passphrase that wrapped them.");
                }}
                unlocked={unlockedContext()}
                onImport={(unlocked) => { acceptUnlocked(unlocked, "Encrypted backup verified and replaced the local vault."); broadcast("changed", unlocked.meta); }}
                onDelete={destroy}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function VaultHeader({ phase, onLock }: { phase: Phase; onLock: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
      <Link to="/" className="flex items-center gap-3" aria-label="ChainScout home">
        <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}>
          <img src="/logo.svg" alt="" className="h-5 w-5" />
        </span>
        <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">CHAINSCOUT</span>
      </Link>
      <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#7fb069] sm:text-[10.5px]">
        <FileKey2 size={13} /> ENCRYPTED VAULT
      </div>
      {phase === "unlocked" ? (
        <button type="button" onClick={onLock} className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-wider text-[#d6ccba] hover:text-[#fa6c34] sm:text-[10px]">
          <LockKeyhole size={12} /> LOCK
        </button>
      ) : (
        <Link to="/app" className="font-mono-d text-[9.5px] tracking-wider text-[#7f7972] hover:text-[#e9e0d1] sm:text-[10px]">EXPLORER →</Link>
      )}
    </header>
  );
}

function VaultHero({ storage, phase }: { storage: VaultStorageStatus; phase: Phase }) {
  const storageLabel = !storage.supported
    ? "UNSUPPORTED"
    : storage.persistent
      ? "PERSISTENT STORAGE"
      : "BACKUP ADVISED";
  return (
    <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
      <div>
        <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#fa6c34]">LOCAL-FIRST · ZERO SERVER SYNC · USER-HELD KEY</p>
        <h1 className="mt-4 max-w-[760px] text-[42px] font-medium leading-[1.02] tracking-[-0.04em] text-[#f0e8da] sm:text-[58px]">
          Your assets.<br /><span className="text-[#d6ccba]">Encrypted on this device.</span>
        </h1>
        <p className="mt-5 max-w-[690px] text-[15px] leading-relaxed text-[#9a938a]">
          Track purchase prices, quantities, notes, identifiers, and photos without creating an account or uploading a portfolio. Your passphrase never leaves this page.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px border border-[#383838] bg-[#383838]">
        <PrivacyTile label="CIPHER" value="AES-256-GCM" />
        <PrivacyTile label="KEY DERIVATION" value="PBKDF2 · 600K" />
        <PrivacyTile label="SERVER COPY" value="NONE" />
        <PrivacyTile label="STORAGE" value={storageLabel} tone={storage.persistent ? "good" : "warn"} />
        {phase === "unlocked" && <div className="col-span-2 bg-[#202020] px-4 py-3 font-mono-d text-[9px] tracking-wider text-[#635d5a]">AUTO-LOCK · 10 MINUTES INACTIVE</div>}
      </div>
    </section>
  );
}

function CreateVaultPanel({ onCreate }: { onCreate: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (passphrase !== confirmation || passphrase.length < 12 || busy) return;
    setBusy(true);
    await onCreate(passphrase);
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="clip-panel border border-[#383838] bg-[#242424] p-6 sm:p-8">
      <PanelTitle icon={<KeyRound size={15} />} eyebrow="NEW LOCAL VAULT" title="Create your encryption key" />
      <p className="mt-4 text-[12.5px] leading-relaxed text-[#9a938a]">Use a unique passphrase with at least 12 characters. ChainScout cannot recover it. Save the one-time recovery code and an encrypted backup. Browser storage is tied to this exact site address, so export before any domain change.</p>
      <PasswordField label="VAULT PASSPHRASE" value={passphrase} onChange={setPassphrase} />
      <PasswordField label="CONFIRM PASSPHRASE" value={confirmation} onChange={setConfirmation} />
      {confirmation && passphrase !== confirmation && <p className="mt-2 text-[11px] text-[#e0738a]">Passphrases do not match.</p>}
      <button type="submit" disabled={busy || passphrase.length < 12 || passphrase !== confirmation} className="clip-btn-sm mt-5 flex min-h-[46px] w-full items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-40">
        <ShieldCheck size={14} /> {busy ? "DERIVING KEY…" : "CREATE ENCRYPTED VAULT"}
      </button>
    </form>
  );
}

function UnlockPanel({ onUnlock }: { onUnlock: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    await onUnlock(passphrase);
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="clip-panel border border-[#7fb069]/35 bg-[#20251f] p-6 sm:p-8">
      <PanelTitle icon={<LockKeyhole size={15} />} eyebrow="LOCAL VAULT FOUND" title="Unlock on this device" tone="good" />
      <p className="mt-4 text-[12.5px] leading-relaxed text-[#9a938a]">The encrypted records are present. Decryption happens in this page only; the key is removed from memory when you lock or reload.</p>
      <PasswordField label="VAULT PASSPHRASE" value={passphrase} onChange={setPassphrase} autoFocus />
      <button type="submit" disabled={busy || passphrase.length < 12} className="clip-btn-sm mt-5 flex min-h-[46px] w-full items-center justify-center gap-2 bg-[#7fb069] px-5 font-mono-d text-[10.5px] font-medium tracking-wider text-[#172015] disabled:opacity-40">
        <KeyRound size={14} /> {busy ? "UNWRAPPING KEY…" : "UNLOCK LOCALLY"}
      </button>
    </form>
  );
}

function VaultDashboard({ assets, onAdd }: { assets: VaultAsset[]; onAdd: () => void }) {
  const types = new Set(assets.map((asset) => asset.assetType)).size;
  const lots = assets.reduce((total, asset) => total + asset.lots.length, 0);
  const pricedLots = assets.reduce((total, asset) => total + asset.lots.filter((lot) => lot.unitPrice).length, 0);
  return (
    <section className="clip-panel mt-8 border border-[#383838] bg-[#242424]">
      <div className="grid gap-px bg-[#383838] sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Metric label="ENCRYPTED ASSETS" value={String(assets.length)} />
        <Metric label="PURCHASE LOTS" value={String(lots)} />
        <Metric label="PRICED LOTS" value={String(pricedLots)} note={`${types} asset type${types === 1 ? "" : "s"}`} />
        <div className="flex items-center bg-[#202020] p-4 sm:p-5">
          <button type="button" onClick={onAdd} className="clip-btn-sm flex min-h-[44px] w-full items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[10px] font-medium tracking-wider text-[#1d1d1d] sm:w-auto">
            <PackagePlus size={14} /> ADD ASSET
          </button>
        </div>
      </div>
    </section>
  );
}

function AssetEditor({ asset, onCancel, onSave }: {
  asset?: VaultAsset;
  onCancel: () => void;
  onSave: (draft: VaultAssetDraft, existing?: VaultAsset) => Promise<void>;
}) {
  const [draft, setDraft] = useState<VaultAssetDraft>(asset ? assetToDraft(asset) : EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoRequestRef = useRef(0);
  const set = <K extends keyof VaultAssetDraft>(key: K, value: VaultAssetDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateLot = (index: number, key: keyof VaultLotDraft, value: string) => {
    set("lots", draft.lots.map((lot, lotIndex) => lotIndex === index ? { ...lot, [key]: value } : lot));
  };
  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const requestId = ++photoRequestRef.current;
    if (file.size > MAX_SOURCE_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoBusy(false);
      setPhotoError("Use one JPEG, PNG, or WebP source up to 12 MB.");
      return;
    }
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const photo = await fileToPhoto(file);
      if (photoRequestRef.current === requestId) set("photo", photo);
    } catch {
      if (photoRequestRef.current === requestId) setPhotoError("That image could not be read locally.");
    } finally {
      if (photoRequestRef.current === requestId) setPhotoBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || photoBusy) return;
    setBusy(true);
    await onSave(draft, asset);
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="clip-panel mt-5 border border-[#fa6c34]/45 bg-[#242424] p-5 sm:p-7" data-testid="vault-asset-editor">
      <div className="flex items-start justify-between gap-4">
        <PanelTitle icon={<PackagePlus size={15} />} eyebrow={asset ? "EDIT ENCRYPTED RECORD" : "NEW ENCRYPTED RECORD"} title={asset ? asset.name : "Add an owned asset"} />
        <button type="button" onClick={onCancel} aria-label="Close asset editor" className="p-2 text-[#635d5a] hover:text-[#e9e0d1]"><X size={16} /></button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="ASSET NAME" value={draft.name} onChange={(value) => set("name", value)} maxLength={120} required placeholder="e.g. PSA 10 Charizard" />
        <SelectField label="TYPE" value={draft.assetType} onChange={(value) => set("assetType", value as VaultAssetType)} options={[
          ["collectible", "Collectible"], ["crypto", "Crypto"], ["rwa", "Real-world asset"], ["nft", "NFT"], ["other", "Other"]
        ]} />
        <Field label="IDENTIFIER / CONTRACT / SKU" value={draft.identifier} onChange={(value) => set("identifier", value)} maxLength={200} placeholder="Optional" />
        <label className="md:col-span-2 lg:col-span-3">
          <span className="font-mono-d text-[9px] tracking-[0.13em] text-[#635d5a]">PRIVATE NOTES</span>
          <textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} maxLength={5_000} rows={4} placeholder="Condition, provenance, thesis, storage location…" className="mt-2 w-full resize-y border border-[#383838] bg-[#1d1d1d] px-4 py-3 text-[12.5px] leading-relaxed text-[#e9e0d1] outline-none focus:border-[#fa6c34]" />
        </label>
      </div>
      <div className="mt-5 border border-[#383838] bg-[#202020] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">PURCHASE LOTS</p><p className="mt-2 text-[11.5px] text-[#7f7972]">Exact decimal strings; ChainScout does not round money or quantities.</p></div>
          <button type="button" onClick={() => set("lots", [...draft.lots, { quantity: "1", unitPrice: "", currency: "USD", acquiredAt: "" }])} disabled={draft.lots.length >= 100} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#d6ccba]">+ ADD LOT</button>
        </div>
        <div className="mt-4 space-y-3">
          {draft.lots.map((lot, index) => (
            <div key={lot.id ?? `new-${index}`} className="grid gap-3 border border-[#343434] bg-[#1d1d1d] p-4 md:grid-cols-[0.8fr_1fr_0.7fr_1fr_auto] md:items-end">
              <Field label={`LOT ${index + 1} QUANTITY`} value={lot.quantity} onChange={(value) => updateLot(index, "quantity", value)} inputMode="decimal" pattern="\d{1,78}(\.\d{1,78})?" maxLength={157} placeholder="1" required flush />
              <Field label="PRICE PER UNIT" value={lot.unitPrice} onChange={(value) => updateLot(index, "unitPrice", value)} inputMode="decimal" pattern="\d{1,78}(\.\d{1,78})?" maxLength={157} placeholder="Optional" flush />
              <Field label="CURRENCY" value={lot.currency} onChange={(value) => updateLot(index, "currency", value)} maxLength={12} required placeholder="USD" flush />
              <Field label="ACQUIRED DATE" value={lot.acquiredAt} onChange={(value) => updateLot(index, "acquiredAt", value)} type="date" flush />
              <button type="button" aria-label={`Remove lot ${index + 1}`} disabled={draft.lots.length === 1} onClick={() => set("lots", draft.lots.filter((_, lotIndex) => lotIndex !== index))} className="mb-1 p-3 text-[#635d5a] hover:text-[#e0738a] disabled:opacity-25"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4 border-t border-[#383838] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#9a938a] hover:text-[#e9e0d1]">
            <ImagePlus size={13} /> {photoBusy ? "PROCESSING PHOTO…" : draft.photo ? "REPLACE PHOTO" : "ADD PRIVATE PHOTO"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={busy || photoBusy} className="sr-only" aria-label="Private asset photo" />
          </label>
          {draft.photo && <button type="button" onClick={() => { photoRequestRef.current += 1; setPhotoBusy(false); set("photo", undefined); }} className="font-mono-d text-[9px] text-[#e0738a]">REMOVE PHOTO</button>}
          {photoBusy && <span role="status" className="text-[11px] text-[#e0a96d]">Sanitizing locally before save…</span>}
          {photoError && <span className="text-[11px] text-[#e0738a]">{photoError}</span>}
        </div>
        <button type="submit" disabled={busy || photoBusy || !draft.name.trim()} className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-6 font-mono-d text-[10px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-40">
          <LockKeyhole size={13} /> {photoBusy ? "PROCESSING PHOTO…" : busy ? "ENCRYPTING…" : "ENCRYPT & SAVE"}
        </button>
      </div>
    </form>
  );
}

function AssetGrid({ assets, onEdit, onDelete }: {
  assets: VaultAsset[];
  onEdit: (asset: VaultAsset) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  if (!assets.length) {
    return <div className="dots mt-5 flex min-h-[240px] items-center justify-center border border-[#2e2e2e] px-6 text-center font-mono-d text-[10px] leading-relaxed tracking-[0.12em] text-[#635d5a]">NO ENCRYPTED ASSETS YET<br />ADD THE FIRST ITEM YOU OWN</div>;
  }
  return (
    <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="vault-assets">
      {assets.map((asset) => <AssetCard key={asset.id} asset={asset} onEdit={() => onEdit(asset)} onDelete={() => onDelete(asset.id)} />)}
    </section>
  );
}

function AssetCard({ asset, onEdit, onDelete }: { asset: VaultAsset; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const firstLot = asset.lots[0];
  return (
    <article className="clip-panel overflow-hidden border border-[#383838] bg-[#242424]">
      {asset.photo ? (
        <div className="h-44 border-b border-[#383838] bg-[#191919]"><img src={asset.photo.dataUrl} alt="" className="h-full w-full object-cover" /></div>
      ) : (
        <div className="dots flex h-28 items-center justify-center border-b border-[#383838] text-[#4f4a46]"><FileKey2 size={24} /></div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono-d text-[8.5px] tracking-[0.15em] text-[#7fb069]">{asset.assetType.toUpperCase()} · ENCRYPTED</p>
            <h3 className="mt-2 text-[18px] font-medium tracking-[-0.02em] text-[#f0e8da]">{asset.name}</h3>
          </div>
          <button type="button" onClick={onEdit} aria-label={`Edit ${asset.name}`} className="p-2 text-[#635d5a] hover:text-[#e9e0d1]"><Pencil size={14} /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px bg-[#383838]">
          <SmallMetric label="LOTS" value={String(asset.lots.length)} />
          <SmallMetric label="FIRST UNIT PRICE" value={firstLot?.unitPrice ? `${firstLot.unitPrice} ${firstLot.currency}` : "—"} />
        </div>
        {asset.identifier && <p className="mt-4 truncate font-mono-d text-[9px] text-[#635d5a]" title={asset.identifier}>{asset.identifier}</p>}
        {asset.notes && <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-[#9a938a]">{asset.notes}</p>}
        <div className="mt-5 border-t border-[#383838] pt-4">
          {!confirm ? (
            <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-2 font-mono-d text-[8.5px] tracking-wider text-[#635d5a] hover:text-[#e0738a]"><Trash2 size={11} /> REMOVE LOCAL RECORD</button>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={onDelete} className="font-mono-d text-[9px] text-[#e0738a]">CONFIRM REMOVE</button>
              <button type="button" onClick={() => setConfirm(false)} className="font-mono-d text-[9px] text-[#635d5a]">CANCEL</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function VaultSettings({ storage, onStorage, unlocked, onMeta, onImport, onDelete }: {
  storage: VaultStorageStatus;
  onStorage: () => Promise<void>;
  unlocked: UnlockedVault;
  onMeta: (meta: VaultMeta) => void;
  onImport: (unlocked: UnlockedVault) => void;
  onDelete: () => Promise<void>;
}) {
  const [backupError, setBackupError] = useState("");
  const [storageError, setStorageError] = useState("");
  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-2" data-testid="vault-settings">
      <section className="clip-panel border border-[#383838] bg-[#242424] p-6">
        <PanelTitle icon={<Download size={15} />} eyebrow="RECOVERY" title="Encrypted backup" />
        <p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">The download contains the wrapped key and ciphertext only. Recovery on another device requires this file plus either the passphrase that existed at export or that backup's matching recovery code.</p>
        {backupError && <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">{backupError}</p>}
        <button type="button" onClick={async () => {
          try {
            await downloadEncryptedBackup(unlocked);
            setBackupError("");
          } catch (downloadError) {
            setBackupError(vaultErrorMessage(downloadError));
          }
        }} className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#7fb069]/45 bg-[#7fb069]/5 font-mono-d text-[10px] text-[#9fc68f]"><Download size={13} /> EXPORT ENCRYPTED JSON</button>
        <div className="mt-5"><ImportVaultPanel existing expectedMeta={unlocked.meta} onImport={onImport} nested /></div>
      </section>
      <div className="space-y-5">
        <section className="clip-panel border border-[#383838] bg-[#242424] p-6">
          <PanelTitle icon={<HardDrive size={15} />} eyebrow="BROWSER STORAGE" title={storage.persistent ? "Eviction protection granted" : "Best-effort storage"} tone={storage.persistent ? "good" : "warn"} />
          <p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">Browsers can clear site data. Persistent storage lowers automatic eviction risk but cannot protect against manual clearing, private browsing cleanup, or device loss.</p>
          {storageError && <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">{storageError}</p>}
          {!storage.persistent && <button type="button" onClick={async () => {
            try {
              await onStorage();
              setStorageError("");
            } catch (persistenceError) {
              setStorageError(vaultErrorMessage(persistenceError));
            }
          }} className="mt-4 border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba]">REQUEST EVICTION PROTECTION</button>}
          <p className="mt-3 font-mono-d text-[8.5px] text-[#635d5a]">{formatStorage(storage)}</p>
        </section>
        <ChangePassphrasePanel unlocked={unlocked} onMeta={onMeta} />
        <DeleteVaultPanel onDelete={onDelete} />
      </div>
    </div>
  );
}

function ChangePassphrasePanel({ unlocked, onMeta }: { unlocked: UnlockedVault; onMeta: (meta: VaultMeta) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirmation || next.length < 12 || busy) return;
    setBusy(true);
    try {
      onMeta(await updateVaultPassphrase(unlocked, current, next));
      setCurrent("");
      setNext("");
      setConfirmation("");
      setError("");
    } catch (changeError) {
      setError(vaultErrorMessage(changeError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="clip-panel border border-[#383838] bg-[#242424] p-6">
      <PanelTitle icon={<KeyRound size={15} />} eyebrow="KEY CONTROL" title="Change passphrase" />
      <PasswordField label="CURRENT PASSPHRASE" value={current} onChange={setCurrent} />
      <PasswordField label="NEW PASSPHRASE" value={next} onChange={setNext} />
      <PasswordField label="CONFIRM NEW PASSPHRASE" value={confirmation} onChange={setConfirmation} />
      {error && <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">{error}</p>}
      <button type="submit" disabled={busy || current.length < 12 || next.length < 12 || next !== confirmation} className="mt-4 border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba] disabled:opacity-40">{busy ? "REWRAPPING…" : "REWRAP MASTER KEY"}</button>
    </form>
  );
}

function RecoveryPanel({ meta, onRecover }: { meta: VaultMeta; onRecover: (vault: UnlockedVault & { recoverySecret: string }) => void }) {
  const [secret, setSecret] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || next !== confirmation || next.length < 12) return;
    setBusy(true);
    setError("");
    try {
      onRecover(await recoverLocalVault(meta, secret, next));
      setSecret("");
      setNext("");
      setConfirmation("");
    } catch (recoveryError) {
      setError(vaultErrorMessage(recoveryError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="clip-panel border border-[#7fb069]/30 bg-[#20251f] p-5">
      <PanelTitle icon={<ArchiveRestore size={15} />} eyebrow="LOST PASSPHRASE" title="Use recovery code" tone="good" />
      <Field label="RECOVERY CODE" value={secret} onChange={setSecret} placeholder="CSV1-…" autoComplete="off" />
      <PasswordField label="NEW PASSPHRASE" value={next} onChange={setNext} />
      <PasswordField label="CONFIRM NEW PASSPHRASE" value={confirmation} onChange={setConfirmation} />
      <p className="mt-3 text-[11px] leading-relaxed text-[#7f7972]">Successful recovery rotates the code. The old passphrase and old code stop working.</p>
      {error && <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">{error}</p>}
      <button type="submit" disabled={busy || !secret || next.length < 12 || next !== confirmation} className="mt-4 flex min-h-[42px] items-center justify-center gap-2 border border-[#7fb069]/45 px-4 font-mono-d text-[9.5px] text-[#9fc68f] disabled:opacity-35"><ArchiveRestore size={12} /> {busy ? "RECOVERING…" : "RECOVER & ROTATE CODE"}</button>
    </form>
  );
}

function BackupRecoveryPanel({ onRecover }: { onRecover: (vault: UnlockedVault & { recoverySecret: string }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [secret, setSecret] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !secret || next.length < 12 || next !== confirmation || busy) return;
    setBusy(true);
    setError("");
    try {
      const backup = await parseVaultBackup(file);
      onRecover(await recoverVaultBackup(backup, secret, next, null));
      setFile(null);
      setSecret("");
      setNext("");
      setConfirmation("");
    } catch (recoveryError) {
      setError(vaultErrorMessage(recoveryError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="clip-panel border border-[#7fb069]/30 bg-[#20251f] p-6 sm:p-8 lg:col-span-2">
      <PanelTitle icon={<ArchiveRestore size={15} />} eyebrow="FORGOT THE BACKUP PASSPHRASE" title="Recover an exported Vault with its one-time code" tone="good" />
      <p className="mt-4 max-w-[820px] text-[12.5px] leading-relaxed text-[#9a938a]">Select the encrypted backup and enter the recovery code that belonged to that backup. Every record is authenticated before anything is restored. Recovery sets a new passphrase and rotates the code.</p>
      <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-[#4a4642] px-4 py-4 font-mono-d text-[9.5px] text-[#9a938a] hover:text-[#e9e0d1]">
        <Upload size={13} /> {file ? file.name : "SELECT ENCRYPTED JSON"}
        <input type="file" accept="application/json,.json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="sr-only" aria-label="Encrypted vault backup for recovery" />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="BACKUP RECOVERY CODE" value={secret} onChange={setSecret} placeholder="CSV1-…" autoComplete="off" />
        <PasswordField label="NEW BACKUP PASSPHRASE" value={next} onChange={setNext} />
        <PasswordField label="CONFIRM NEW BACKUP PASSPHRASE" value={confirmation} onChange={setConfirmation} />
      </div>
      {error && <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">{error}</p>}
      <button type="submit" disabled={!file || !secret || next.length < 12 || next !== confirmation || busy} className="mt-5 flex min-h-[44px] items-center justify-center gap-2 border border-[#7fb069]/45 px-5 font-mono-d text-[9.5px] text-[#9fc68f] disabled:opacity-35">
        <ArchiveRestore size={12} /> {busy ? "AUTHENTICATING EVERY RECORD…" : "RECOVER BACKUP & ROTATE CODE"}
      </button>
    </form>
  );
}

function RecoverySecretPanel({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const download = () => {
    const blob = new Blob([
      "ChainScout encrypted vault recovery code\n\n",
      `${secret}\n\n`,
      "Keep this file separate from your encrypted vault backup and passphrase. Anyone with this code and access to the local vault or backup can reset the passphrase.\n"
    ], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chainscout-vault-recovery-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <section className="clip-panel mt-8 border border-[#e0a96d]/55 bg-[#e0a96d]/8 p-6 sm:p-8" data-testid="vault-recovery-secret">
      <PanelTitle icon={<KeyRound size={15} />} eyebrow="SHOWING ONCE" title="Save your recovery code now" tone="warn" />
      <p className="mt-4 max-w-[780px] text-[12.5px] leading-relaxed text-[#9a938a]">This high-entropy code can reset a forgotten passphrase and is not stored anywhere. Keep it separate from the encrypted backup. ChainScout cannot recreate it.</p>
      <div className="mt-5 break-all border border-[#e0a96d]/35 bg-[#171717] p-4 font-mono-d text-[11px] leading-relaxed text-[#e6c493]" data-testid="recovery-code">{secret}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setCopyFailed(false);
          } catch {
            setCopyFailed(true);
          }
        }} className="border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba]">{copied ? "COPIED" : copyFailed ? "COPY BLOCKED · DOWNLOAD" : "COPY CODE"}</button>
        <button type="button" onClick={download} className="border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba]">DOWNLOAD CODE</button>
        <button type="button" onClick={onDone} className="border border-[#e0a96d]/45 px-4 py-3 font-mono-d text-[9.5px] text-[#e6c493]">I SAVED IT · HIDE CODE</button>
      </div>
    </section>
  );
}

function ImportVaultPanel({ existing, expectedMeta, onImport, nested = false }: {
  existing: boolean;
  expectedMeta: VaultMeta | null;
  onImport: (unlocked: UnlockedVault) => void;
  nested?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || passphrase.length < 12 || (existing && replacement !== REPLACE_PHRASE) || busy) return;
    setBusy(true);
    setError("");
    try {
      const backup = await parseVaultBackup(file);
      onImport(await importVaultBackup(backup, passphrase, expectedMeta));
      setFile(null);
      setPassphrase("");
      setReplacement("");
    } catch (importError) {
      setError(vaultErrorMessage(importError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={nested ? "border-t border-[#383838] pt-5" : "clip-panel border border-[#383838] bg-[#242424] p-6 sm:p-8"}>
      <PanelTitle icon={<ArchiveRestore size={15} />} eyebrow="IMPORT & RECOVER" title={nested ? "Restore this backup" : "Have an encrypted backup?"} />
      {!nested && <p className="mt-4 text-[12.5px] leading-relaxed text-[#9a938a]">ChainScout verifies the wrapped key and decrypts every record before replacing anything. The file and passphrase stay inside this page.</p>}
      <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-[#4a4642] px-4 py-4 font-mono-d text-[9.5px] text-[#9a938a] hover:text-[#e9e0d1]">
        <Upload size={13} /> {file ? file.name : "SELECT ENCRYPTED JSON"}
        <input type="file" accept="application/json,.json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="sr-only" aria-label="Encrypted vault backup" />
      </label>
      <PasswordField label="BACKUP PASSPHRASE" value={passphrase} onChange={setPassphrase} />
      {existing && <Field label={`TYPE ${REPLACE_PHRASE}`} value={replacement} onChange={setReplacement} placeholder={REPLACE_PHRASE} />}
      {error && <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">{error}</p>}
      <button type="submit" disabled={!file || busy || passphrase.length < 12 || (existing && replacement !== REPLACE_PHRASE)} className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#383838] bg-[#202020] font-mono-d text-[10px] text-[#d6ccba] disabled:opacity-40">
        <ArchiveRestore size={13} /> {busy ? "VERIFYING EVERY RECORD…" : existing ? "VERIFY & REPLACE LOCAL VAULT" : "VERIFY & RESTORE LOCALLY"}
      </button>
    </form>
  );
}

function DeleteVaultPanel({ onDelete, compact = false }: { onDelete: () => Promise<void>; compact?: boolean }) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className={`clip-panel border border-[#e0738a]/35 bg-[#e0738a]/5 ${compact ? "p-5" : "p-6"}`}>
      <PanelTitle icon={<Trash2 size={15} />} eyebrow="PERMANENT LOCAL DELETION" title="Delete this vault" tone="danger" />
      <p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">This removes the wrapped key and every encrypted record from this browser. It cannot be undone without an exported backup and its passphrase.</p>
      <Field label={`TYPE ${DELETE_PHRASE}`} value={phrase} onChange={setPhrase} placeholder={DELETE_PHRASE} />
      <button type="button" disabled={phrase !== DELETE_PHRASE || busy} onClick={async () => { setBusy(true); await onDelete(); setBusy(false); }} className="mt-4 flex min-h-[42px] items-center justify-center gap-2 border border-[#e0738a]/45 px-4 font-mono-d text-[9.5px] text-[#e0738a] disabled:opacity-35">
        <Trash2 size={12} /> {busy ? "DELETING…" : "DELETE LOCAL VAULT"}
      </button>
    </section>
  );
}

function VaultLoading() {
  return <div className="scan-panel mt-8 flex min-h-[260px] items-center justify-center overflow-hidden border border-[#383838] bg-[#242424] font-mono-d text-[10px] tracking-[0.15em] text-[#7fb069]">CHECKING LOCAL ENCRYPTED STORAGE…</div>;
}

function VaultDeleting() {
  return (
    <section className="scan-panel mt-8 flex min-h-[280px] flex-col items-center justify-center overflow-hidden border border-[#e0a96d]/35 bg-[#242424] px-6 text-center">
      <HardDrive size={24} className="text-[#e0a96d]" />
      <h2 className="mt-5 text-[22px] font-medium text-[#f0e8da]">Local deletion is in progress</h2>
      <p className="mt-3 max-w-[620px] text-[12.5px] leading-relaxed text-[#9a938a]">Vault controls stay disabled because an IndexedDB deletion cannot be cancelled once requested. If this is waiting on another tab or browser process, close that blocker and keep this page open.</p>
    </section>
  );
}

function UnsupportedState() {
  return (
    <section className="clip-panel mt-8 border border-[#e0738a]/40 bg-[#e0738a]/5 p-7">
      <PanelTitle icon={<LockKeyhole size={15} />} eyebrow="VAULT UNAVAILABLE" title="Secure local storage is not available" tone="danger" />
      <p className="mt-4 max-w-[720px] text-[13px] leading-relaxed text-[#9a938a]">Use a current browser over HTTPS with Web Crypto and IndexedDB enabled. ChainScout fails closed instead of saving unencrypted data.</p>
    </section>
  );
}

function PanelTitle({ icon, eyebrow, title, tone = "default" }: { icon: ReactNode; eyebrow: string; title: string; tone?: "default" | "good" | "warn" | "danger" }) {
  const color = tone === "good" ? "text-[#7fb069]" : tone === "danger" ? "text-[#e0738a]" : tone === "warn" ? "text-[#e0a96d]" : "text-[#fa6c34]";
  return <div><div className={`flex items-center gap-2.5 font-mono-d text-[9.5px] tracking-[0.15em] ${color}`}>{icon} {eyebrow}</div><h2 className="mt-3 text-[23px] font-medium tracking-[-0.025em] text-[#f0e8da]">{title}</h2></div>;
}

function PasswordField({ label, value, onChange, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return <Field label={label} value={value} onChange={onChange} type="password" autoComplete="off" maxLength={256} autoFocus={autoFocus} />;
}

function Field({ label, value, onChange, type = "text", placeholder, maxLength, required, inputMode, pattern, autoComplete, autoFocus, flush = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  inputMode?: "text" | "decimal";
  pattern?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  flush?: boolean;
}) {
  return (
    <label className={flush ? "block" : "mt-4 block"}>
      <span className="font-mono-d text-[9px] tracking-[0.13em] text-[#635d5a]">{label}</span>
      <input aria-label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} required={required} inputMode={inputMode} pattern={pattern} autoComplete={autoComplete} autoFocus={autoFocus} className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[11px] text-[#e9e0d1] outline-none placeholder:text-[#4f4a46] focus:border-[#fa6c34]" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label>
      <span className="font-mono-d text-[9px] tracking-[0.13em] text-[#635d5a]">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[11px] text-[#e9e0d1] outline-none focus:border-[#fa6c34]">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function PrivacyTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "warn" }) {
  return <div className="bg-[#202020] p-4"><p className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{label}</p><p className={`mt-3 font-mono-d text-[9.5px] tracking-wider ${tone === "good" ? "text-[#7fb069]" : tone === "warn" ? "text-[#e0a96d]" : "text-[#d6ccba]"}`}>{value}</p></div>;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="bg-[#202020] p-4 sm:p-5"><p className="font-mono-d text-[8.5px] tracking-[0.14em] text-[#635d5a]">{label}</p><p className="mt-3 text-[24px] font-medium text-[#f0e8da]">{value}</p>{note && <p className="mt-1 font-mono-d text-[8px] text-[#635d5a]">{note}</p>}</div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#202020] p-3"><p className="font-mono-d text-[7.5px] tracking-wider text-[#635d5a]">{label}</p><p title={value} className="mt-2 truncate font-mono-d text-[10px] text-[#d6ccba]">{value}</p></div>;
}

async function fileToPhoto(file: File): Promise<VaultPhoto> {
  const dimensions = readImageDimensions(new Uint8Array(await file.arrayBuffer()), file.type);
  if (!dimensions || dimensions.width > MAX_SOURCE_PIXELS / dimensions.height) {
    throw new Error("Image dimensions are invalid or too large");
  }
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
    bitmap.close();
    throw new Error("Image dimensions are too large");
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    bitmap.close();
    throw new Error("Canvas is unavailable");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let processed = await canvasBlob(canvas, "image/webp", 0.84);
  if (!processed || processed.size > VAULT_MAX_PHOTO_BYTES) processed = await canvasBlob(canvas, "image/jpeg", 0.76);
  if (!processed || processed.size > VAULT_MAX_PHOTO_BYTES) throw new Error("Processed image is too large");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid photo"));
    reader.onerror = () => reject(reader.error ?? new Error("Photo read failed"));
    reader.readAsDataURL(processed);
  });
  return {
    name: file.name.replace(/\.[^.]+$/, "") + (processed.type === "image/webp" ? ".webp" : ".jpg"),
    mimeType: processed.type as VaultPhoto["mimeType"],
    size: processed.size,
    dataUrl
  };
}

function canvasBlob(canvas: HTMLCanvasElement, type: "image/webp" | "image/jpeg", quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function assetToDraft(asset: VaultAsset): VaultAssetDraft {
  return {
    name: asset.name,
    assetType: asset.assetType,
    identifier: asset.identifier,
    lots: asset.lots.map((lot) => ({ ...lot })),
    notes: asset.notes,
    ...(asset.photo ? { photo: asset.photo } : {})
  };
}

async function downloadEncryptedBackup(unlocked: UnlockedVault): Promise<void> {
  const backup = await exportVault(unlocked);
  const serialized = JSON.stringify(backup, null, 2);
  const blob = new Blob([serialized], { type: "application/json" });
  if (blob.size > VAULT_MAX_BACKUP_BYTES) {
    throw new Error("Encrypted backup exceeds the supported size");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chainscout-encrypted-vault-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  // Revoking synchronously can race the browser's download reader and produce
  // an empty file. Keep the object URL alive just long enough for that reader.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function formatStorage(storage: VaultStorageStatus): string {
  if (storage.usage === null || storage.quota === null) return storage.persistent ? "PERSISTENT" : "ESTIMATE UNAVAILABLE";
  return `${formatBytes(storage.usage)} USED · ${formatBytes(storage.quota)} QUOTA`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
