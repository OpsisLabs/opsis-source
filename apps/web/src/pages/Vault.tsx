import { OPSIS_PRESENTATION } from "../opsis/presentation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useVaultVisualizations } from "../charts/vault-visualizations-loader";
import { Link, useSearchParams } from "react-router";
import { useBackupDownload } from "../vault/useBackupDownload";
import { BackupDownloadLink } from "../vault/BackupDownloadLink";
import {
  ArchiveRestore,
  CheckCircle2,
  Download,
  FileKey2,
  FlaskConical,
  HardDrive,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  PackagePlus,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { isVaultPlatformSupported, vaultErrorMessage } from "../vault/crypto";
import {
  bootstrapVault,
  createLocalVault,
  deleteVaultAsset,
  deleteVaultAssets,
  destroyLocalVault,
  exportVault,
  importVaultBackup,
  parseVaultBackup,
  recoverLocalVault,
  recoverVaultBackup,
  saveVaultAsset,
  saveVaultAssets,
  saveVaultCollectibleContext,
  saveVaultMarketContext,
  saveVaultPortfolio,
  unlockLocalVault,
  updateVaultPassphrase,
  type UnlockedVault,
} from "../vault/service";
import {
  createVaultDemoDrafts,
  isVaultDemoAsset,
  promoteVaultDemoDraft,
} from "../vault/demo";
import { readStorageStatus, requestPersistentStorage } from "../vault/db";
import { fileToVaultPhoto, MAX_SOURCE_PHOTO_BYTES } from "../vault/photo";
import {
  type VaultAsset,
  type VaultAssetDraft,
  type VaultAssetType,
  type VaultCollectibleContext,
  type VaultCollectibleContextDraft,
  type VaultLotDraft,
  type VaultMeta,
  type VaultMarketContext,
  type VaultMarketContextDraft,
  type VaultPortfolioContext,
  type VaultPortfolioContextDraft,
  type VaultStorageStatus,
} from "../vault/types";
import { PortfolioPanel } from "../portfolio/PortfolioPanel";
import { isApprovalManagerEnabled, isDealFinderEnabled } from "../product/availability";
import { CollectibleCatalogPanel } from "../collectibles/CollectibleCatalogPanel";
import { MarketInventoryPanel } from "../market/MarketInventoryPanel";
import { ReplayActionsPanel } from "../replay/ReplayActionsPanel";
import { WorkspaceDisclosure } from "../product/WorkspaceDisclosure";
import {
  isCollectibleCatalogEnabled,
  isMarketInventoryEnabled,
  isReplayActionsEnabled,
  vaultWorkspaceFromSearch,
  type VaultWorkspace,
} from "../product/availability";
import { useI18n, type TranslateParams, type TranslationKey } from "../i18n";

type Translate = (key: TranslationKey, params?: TranslateParams) => string;

type Phase =
  "loading" | "empty" | "locked" | "unlocked" | "deleting" | "unsupported";
type Workspace = VaultWorkspace;
const AUTO_LOCK_MS = 10 * 60 * 1000;
const COLLECTIBLE_CATALOG_ENABLED = isCollectibleCatalogEnabled();
const MARKET_INVENTORY_ENABLED = isMarketInventoryEnabled();
const REPLAY_ACTIONS_ENABLED = isReplayActionsEnabled();
const ASSET_TYPE_FALLBACK_KEYS: Record<VaultAssetType, TranslationKey> = {
  collectible: "vault.card.fallbackCollectible",
  rwa: "vault.card.fallbackRwa",
  nft: "vault.card.fallbackNft",
  crypto: "vault.card.fallbackCrypto",
  other: "vault.card.fallbackOther",
};
const CONDITION_DISPLAY_KEYS: Record<NonNullable<VaultAsset["collectible"]>["condition"], TranslationKey> = {
  unknown: "vault.card.notEnteredUpper",
  poor: "vault.card.condition.poor",
  played: "vault.card.condition.played",
  good: "vault.card.condition.good",
  excellent: "vault.card.condition.excellent",
  "near-mint": "vault.card.condition.nearMint",
  mint: "vault.card.condition.mint",
};

function workspaceFromSearch(searchParams: URLSearchParams): Workspace {
  return vaultWorkspaceFromSearch(searchParams, {
    collectibleCatalog: COLLECTIBLE_CATALOG_ENABLED,
    marketInventory: MARKET_INVENTORY_ENABLED,
    replayActions: REPLAY_ACTIONS_ENABLED,
  });
}

function manualCollectibleDetails(
  photoAddedAt: string | null = null,
): NonNullable<VaultAssetDraft["collectible"]> {
  return {
    catalog: null,
    ownerPrinting: "",
    condition: "unknown",
    grader: "ungraded",
    grade: "",
    certificate: "",
    photoSource: photoAddedAt ? "owner_supplied" : null,
    photoAddedAt,
    references: [],
  };
}

function emptyAssetDraft(): VaultAssetDraft {
  return {
    name: "",
    assetType: "collectible",
    identifier: "",
    lots: [{ quantity: "1", unitPrice: "", currency: "USD", acquiredAt: "" }],
    notes: "",
    collectible: manualCollectibleDetails(),
  };
}

export default function VaultPage({ previewDeals = false }: { previewDeals?: boolean }) {
  // Load the chart code with the page so charts render together with the records.
  useVaultVisualizations();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const platformSupported = isVaultPlatformSupported();
  const [phase, setPhase] = useState<Phase>(
    platformSupported ? "loading" : "unsupported",
  );
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [portfolios, setPortfolios] = useState<UnlockedVault["portfolios"]>([]);
  const [collectibles, setCollectibles] = useState<
    UnlockedVault["collectibles"]
  >([]);
  const [markets, setMarkets] = useState<UnlockedVault["markets"]>([]);
  const workspace = previewDeals ? "deals" : workspaceFromSearch(searchParams);
  const [storage, setStorage] = useState<VaultStorageStatus>({
    supported: platformSupported,
    persistent: null,
    usage: null,
    quota: null,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<VaultAsset | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [recoverySecret, setRecoverySecret] = useState("");
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const deletionPendingRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const tabIdRef = useRef("");
  const unlockedStateRef = useRef({
    meta,
    sessionKey,
    assets,
    portfolios,
    collectibles,
    markets,
    phase,
  });

  const selectWorkspace = useCallback(
    (next: Workspace) => {
      const allowed = workspaceFromSearch(
        new URLSearchParams(next === "assets" ? "view=assets" : `view=${next}`),
      );
      setEditor(null);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("view", allowed);
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    unlockedStateRef.current = {
      meta,
      sessionKey,
      assets,
      portfolios,
      collectibles,
      markets,
      phase,
    };
  }, [assets, collectibles, markets, meta, phase, portfolios, sessionKey]);

  const bumpSession = useCallback(() => {
    const next = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = next;
    setSessionGeneration(next);
  }, []);

  const broadcast = useCallback(
    (
      event: "lock" | "changed" | "deleting" | "delete-cancelled" | "deleted",
      targetMeta = meta,
    ) => {
      if (!targetMeta) return;
      channelRef.current?.postMessage({
        event,
        vaultId: targetMeta.vaultId,
        revision: targetMeta.revision,
        source: tabIdRef.current,
      });
    },
    [meta],
  );

  useEffect(() => {
    let active = true;
    if (!isVaultPlatformSupported()) {
      return () => {
        active = false;
      };
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
    return () => {
      active = false;
    };
  }, []);

  const lock = useCallback(
    (
      message = t("vault.notice.locked"),
      notify = true,
    ) => {
      bumpSession();
      if (notify) broadcast("lock");
      setSessionKey(null);
      setAssets([]);
      setPortfolios([]);
      setCollectibles([]);
      setMarkets([]);
      setEditor(null);
      setSettingsOpen(false);
      setRecoverySecret("");
      setPhase(meta ? "locked" : "empty");
      setNotice(message);
      setError("");
    },
    [broadcast, bumpSession, meta, t],
  );

  useEffect(() => {
    if (!isVaultPlatformSupported() || typeof BroadcastChannel === "undefined")
      return;
    if (!tabIdRef.current) tabIdRef.current = crypto.randomUUID();
    let active = true;
    const channel = new BroadcastChannel("opsis-vault-control-v1");
    channelRef.current = channel;
    channel.onmessage = async (message: MessageEvent<unknown>) => {
      const value = message.data;
      if (!value || typeof value !== "object") return;
      const event = value as {
        event?: unknown;
        vaultId?: unknown;
        source?: unknown;
      };
      if (event.source === tabIdRef.current) return;
      if (
        deletionPendingRef.current &&
        event.event !== "deleted" &&
        event.event !== "delete-cancelled"
      )
        return;
      if (event.event === "changed") {
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || !savedMeta || savedMeta.vaultId !== event.vaultId)
          return;
        bumpSession();
        setSessionKey(null);
        setMeta(savedMeta);
        setAssets([]);
        setPortfolios([]);
        setCollectibles([]);
        setMarkets([]);
        setEditor(null);
        setSettingsOpen(false);
        setRecoverySecret("");
        setPhase("locked");
        setError("");
        setNotice(
          meta
            ? t("vault.notice.changedUnlock")
            : t("vault.notice.createdOtherTab"),
        );
        return;
      }
      if (event.event === "deleting") {
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || !savedMeta || savedMeta.vaultId !== event.vaultId)
          return;
        bumpSession();
        deletionPendingRef.current = true;
        setMeta(savedMeta);
        setSessionKey(null);
        setAssets([]);
        setPortfolios([]);
        setCollectibles([]);
        setMarkets([]);
        setEditor(null);
        setSettingsOpen(false);
        setRecoverySecret("");
        setPhase("deleting");
        setError("");
        setNotice(
          t("vault.notice.deletionPendingOtherTab"),
        );
      } else if (event.event === "delete-cancelled") {
        deletionPendingRef.current = false;
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || !savedMeta || savedMeta.vaultId !== event.vaultId)
          return;
        setMeta(savedMeta);
        setPhase("locked");
        setError("");
        setNotice(
          t("vault.notice.deletionCancelled"),
        );
      } else if (event.event === "deleted") {
        const savedMeta = await bootstrapVault().catch(() => null);
        if (!active || savedMeta) return;
        bumpSession();
        deletionPendingRef.current = false;
        setSessionKey(null);
        setMeta(null);
        setAssets([]);
        setPortfolios([]);
        setCollectibles([]);
        setMarkets([]);
        setEditor(null);
        setSettingsOpen(false);
        setRecoverySecret("");
        setPhase("empty");
        setError("");
        setNotice(t("vault.notice.deletedOtherTab"));
      } else if (
        event.event === "lock" &&
        meta &&
        event.vaultId === meta.vaultId
      ) {
        lock(t("vault.notice.lockedAcrossTabs"), false);
      }
    };
    return () => {
      active = false;
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [bumpSession, lock, meta, t]);

  useEffect(() => {
    if (phase !== "unlocked") return;
    let deadline = Date.now() + AUTO_LOCK_MS;
    let timer = window.setTimeout(enforceDeadline, AUTO_LOCK_MS);
    function enforceDeadline() {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        lock(t("vault.notice.autoLocked"));
      else timer = window.setTimeout(enforceDeadline, remaining);
    }
    const reset = () => {
      if (document.visibilityState === "hidden") return;
      deadline = Date.now() + AUTO_LOCK_MS;
      window.clearTimeout(timer);
      timer = window.setTimeout(enforceDeadline, AUTO_LOCK_MS);
    };
    const leavePage = () =>
      lock(t("vault.notice.lockedHidden"));
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") leavePage();
      else enforceDeadline();
    };
    const pageShown = (event: PageTransitionEvent) => {
      if (event.persisted || Date.now() >= deadline) leavePage();
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
    ];
    events.forEach((event) =>
      window.addEventListener(event, reset, { passive: true }),
    );
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
  }, [lock, phase, t]);

  const acceptUnlocked = (
    unlocked: UnlockedVault & { recoverySecret?: string },
    message: string,
  ) => {
    bumpSession();
    setSessionKey(unlocked.key);
    setMeta(unlocked.meta);
    setAssets(unlocked.assets);
    setPortfolios(unlocked.portfolios);
    setCollectibles(unlocked.collectibles);
    setMarkets(unlocked.markets);
    setEditor(null);
    setSettingsOpen(false);
    setPhase("unlocked");
    setRecoverySecret(unlocked.recoverySecret ?? "");
    setError("");
    setNotice(message);
  };

  const unlockedContext = (): UnlockedVault => {
    if (!meta || !sessionKey || phase !== "unlocked")
      throw new Error(t("vault.error.locked"));
    return { meta, key: sessionKey, assets, portfolios, collectibles, markets };
  };

  const saveAsset = async (
    draft: VaultAssetDraft,
    existing?: VaultAsset,
    expectedSession = sessionGenerationRef.current,
  ) => {
    try {
      const assertActive = () => {
        if (sessionGenerationRef.current !== expectedSession)
          throw new Error(t("vault.error.sessionChanged"));
      };
      assertActive();
      const current = unlockedStateRef.current;
      if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
        throw new Error(t("vault.error.locked"));
      const saved = await saveVaultAsset(
        {
          meta: current.meta,
          key: current.sessionKey,
          assets: current.assets,
          portfolios: current.portfolios,
          collectibles: current.collectibles,
          markets: current.markets,
        },
        existing && isVaultDemoAsset(existing)
          ? promoteVaultDemoDraft(draft)
          : draft,
        existing,
        assertActive,
      );
      assertActive();
      const nextAssets = [
        saved.asset,
        ...current.assets.filter((asset) => asset.id !== saved.asset.id),
      ];
      unlockedStateRef.current = {
        ...current,
        meta: saved.meta,
        assets: nextAssets,
      };
      setMeta(saved.meta);
      broadcast("changed", saved.meta);
      setAssets(nextAssets);
      setEditor(null);
      setError("");
      setNotice(
        existing
          ? t("vault.notice.assetUpdated")
          : t("vault.notice.assetSaved"),
      );
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
      setNotice(t("vault.notice.assetRemoved"));
      setError("");
    } catch (deleteError) {
      setError(vaultErrorMessage(deleteError));
    }
  };

  const loadDemoAssets = async (
    expectedSession = sessionGenerationRef.current,
  ) => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      const assertActive = () => {
        if (sessionGenerationRef.current !== expectedSession)
          throw new Error(t("vault.error.sessionChanged"));
      };
      assertActive();
      const current = unlockedStateRef.current;
      if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
        throw new Error(t("vault.error.locked"));
      const existingNames = new Set(
        current.assets.filter(isVaultDemoAsset).map((asset) => asset.name),
      );
      const drafts = createVaultDemoDrafts().filter(
        (draft) => !existingNames.has(draft.name),
      );
      if (drafts.length === 0) {
        setNotice(t("vault.notice.demoComplete"));
        setError("");
        return;
      }
      const saved = await saveVaultAssets(
        {
          meta: current.meta,
          key: current.sessionKey,
          assets: current.assets,
          portfolios: current.portfolios,
          collectibles: current.collectibles,
          markets: current.markets,
        },
        drafts,
        assertActive,
      );
      assertActive();
      const nextAssets = [...saved.assets, ...current.assets];
      unlockedStateRef.current = {
        ...current,
        meta: saved.meta,
        assets: nextAssets,
      };
      setMeta(saved.meta);
      setAssets(nextAssets);
      setEditor(null);
      broadcast("changed", saved.meta);
      setNotice(
        t("vault.notice.demoLoaded", { count: saved.assets.length }),
      );
      setError("");
      setStorage(await readStorageStatus());
    } catch (demoError) {
      setError(vaultErrorMessage(demoError));
    } finally {
      setDemoBusy(false);
    }
  };

  const removeDemoAssets = async (
    expectedSession = sessionGenerationRef.current,
  ) => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      const assertActive = () => {
        if (sessionGenerationRef.current !== expectedSession)
          throw new Error(t("vault.error.sessionChanged"));
      };
      assertActive();
      const current = unlockedStateRef.current;
      if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
        throw new Error(t("vault.error.locked"));
      const ids = current.assets.filter(isVaultDemoAsset).map((asset) => asset.id);
      if (ids.length === 0) {
        setNotice(t("vault.notice.demoNoneLeft"));
        setError("");
        return;
      }
      const nextMeta = await deleteVaultAssets(
        {
          meta: current.meta,
          key: current.sessionKey,
          assets: current.assets,
          portfolios: current.portfolios,
          collectibles: current.collectibles,
          markets: current.markets,
        },
        ids,
        assertActive,
      );
      assertActive();
      const nextAssets = current.assets.filter((asset) => !ids.includes(asset.id));
      unlockedStateRef.current = {
        ...current,
        meta: nextMeta,
        assets: nextAssets,
      };
      setMeta(nextMeta);
      setAssets(nextAssets);
      setEditor(null);
      broadcast("changed", nextMeta);
      setNotice(t("vault.notice.demoRemoved", { count: ids.length }));
      setError("");
      setStorage(await readStorageStatus());
    } catch (demoError) {
      setError(vaultErrorMessage(demoError));
    } finally {
      setDemoBusy(false);
    }
  };

  const savePortfolio = async (
    draft: VaultPortfolioContextDraft,
    existing?: VaultPortfolioContext,
    expectedSession = sessionGenerationRef.current,
  ): Promise<VaultPortfolioContext> => {
    const assertActive = () => {
      if (sessionGenerationRef.current !== expectedSession)
        throw new Error(t("vault.error.sessionChanged"));
    };
    assertActive();
    const current = unlockedStateRef.current;
    if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
      throw new Error(t("vault.error.locked"));
    const saved = await saveVaultPortfolio(
      {
        meta: current.meta,
        key: current.sessionKey,
        assets: current.assets,
        portfolios: current.portfolios,
        collectibles: current.collectibles,
        markets: current.markets,
      },
      draft,
      existing,
      assertActive,
    );
    assertActive();
    const nextPortfolios = [
      saved.portfolio,
      ...current.portfolios.filter(
        (portfolio) => portfolio.id !== saved.portfolio.id,
      ),
    ];
    unlockedStateRef.current = {
      ...current,
      meta: saved.meta,
      portfolios: nextPortfolios,
    };
    setMeta(saved.meta);
    setPortfolios(nextPortfolios);
    broadcast("changed", saved.meta);
    setStorage(await readStorageStatus());
    return saved.portfolio;
  };

  const saveCatalogAsset = async (
    draft: VaultAssetDraft,
    expectedSession: number,
  ): Promise<void> => {
    const assertActive = () => {
      if (sessionGenerationRef.current !== expectedSession)
        throw new Error(t("vault.error.sessionChanged"));
    };
    try {
      assertActive();
      const current = unlockedStateRef.current;
      if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
        throw new Error(t("vault.error.locked"));
      const saved = await saveVaultAsset(
        {
          meta: current.meta,
          key: current.sessionKey,
          assets: current.assets,
          portfolios: current.portfolios,
          collectibles: current.collectibles,
          markets: current.markets,
        },
        draft,
        undefined,
        assertActive,
      );
      assertActive();
      const nextAssets = [saved.asset, ...current.assets];
      unlockedStateRef.current = {
        ...current,
        meta: saved.meta,
        assets: nextAssets,
      };
      setMeta(saved.meta);
      setAssets(nextAssets);
      broadcast("changed", saved.meta);
      setNotice(
        t("vault.notice.catalogSaved"),
      );
      setError("");
      setStorage(await readStorageStatus());
    } catch (saveError) {
      setError(vaultErrorMessage(saveError));
      throw saveError;
    }
  };

  const saveCollectibleContext = async (
    draft: VaultCollectibleContextDraft,
    existing?: VaultCollectibleContext,
    expectedSession = sessionGenerationRef.current,
  ): Promise<VaultCollectibleContext> => {
    const assertActive = () => {
      if (sessionGenerationRef.current !== expectedSession)
        throw new Error(t("vault.error.sessionChanged"));
    };
    assertActive();
    const current = unlockedStateRef.current;
    if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
      throw new Error(t("vault.error.locked"));
    const saved = await saveVaultCollectibleContext(
      {
        meta: current.meta,
        key: current.sessionKey,
        assets: current.assets,
        portfolios: current.portfolios,
        collectibles: current.collectibles,
        markets: current.markets,
      },
      draft,
      existing,
      assertActive,
    );
    assertActive();
    const nextCollectibles = [
      saved.collectible,
      ...current.collectibles.filter(
        (item) => item.id !== saved.collectible.id,
      ),
    ];
    unlockedStateRef.current = {
      ...current,
      meta: saved.meta,
      collectibles: nextCollectibles,
    };
    setMeta(saved.meta);
    setCollectibles(nextCollectibles);
    broadcast("changed", saved.meta);
    setStorage(await readStorageStatus());
    return saved.collectible;
  };

  const saveMarketContext = async (
    draft: VaultMarketContextDraft,
    existing?: VaultMarketContext,
    expectedSession = sessionGenerationRef.current,
  ): Promise<VaultMarketContext> => {
    const assertActive = () => {
      if (sessionGenerationRef.current !== expectedSession)
        throw new Error(t("vault.error.sessionChanged"));
    };
    assertActive();
    const current = unlockedStateRef.current;
    if (!current.meta || !current.sessionKey || current.phase !== "unlocked")
      throw new Error(t("vault.error.locked"));
    const saved = await saveVaultMarketContext(
      {
        meta: current.meta,
        key: current.sessionKey,
        assets: current.assets,
        portfolios: current.portfolios,
        collectibles: current.collectibles,
        markets: current.markets,
      },
      draft,
      existing,
      assertActive,
    );
    assertActive();
    const nextMarkets = [
      saved.market,
      ...current.markets.filter((item) => item.id !== saved.market.id),
    ];
    unlockedStateRef.current = {
      ...current,
      meta: saved.meta,
      markets: nextMarkets,
    };
    setMeta(saved.meta);
    setMarkets(nextMarkets);
    broadcast("changed", saved.meta);
    setStorage(await readStorageStatus());
    return saved.market;
  };

  const destroy = async () => {
    try {
      bumpSession();
      deletionPendingRef.current = true;
      broadcast("deleting");
      setSessionKey(null);
      setAssets([]);
      setPortfolios([]);
      setCollectibles([]);
      setMarkets([]);
      setEditor(null);
      setSettingsOpen(false);
      setRecoverySecret("");
      setPhase("deleting");
      await destroyLocalVault(() => {
        setNotice(
          t("vault.notice.deletionWaiting"),
        );
      });
      deletionPendingRef.current = false;
      broadcast("deleted");
      setMeta(null);
      setPhase("empty");
      setError("");
      setNotice(
        t("vault.notice.deleted"),
      );
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
      <main className="workspace-layout">
        <VaultHero storage={storage} phase={phase} />

        {error && (
          <div
            role="alert"
            className="mt-6 border border-[#e0738a]/45 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mt-6 flex items-center gap-2 border border-[#7fb069]/35 bg-[#7fb069]/5 px-5 py-4 text-[12px] text-[#9fc68f]"
          >
            <CheckCircle2 size={14} /> {notice}
          </div>
        )}

        {phase === "loading" && <VaultLoading />}
        {phase === "deleting" && <VaultDeleting />}
        {phase === "unsupported" && <UnsupportedState />}
        {phase === "empty" && (
          <div className="vault-entry">
            <div className="vault-entry-notice">
              <strong>{t("vault.empty.haveVault")}</strong> {t("vault.empty.haveVaultBody")}
            </div>
            <div className="mt-5 space-y-4">
              <CreateVaultPanel
                onCreate={async (passphrase) => {
                  try {
                    const created = await createLocalVault(passphrase);
                    acceptUnlocked(
                      created,
                      t("vault.notice.created"),
                    );
                    broadcast("changed", created.meta);
                    setStorage(await readStorageStatus());
                  } catch (createError) {
                    setError(vaultErrorMessage(createError));
                  }
                }}
              />
              <WorkspaceDisclosure title={t("vault.disclosure.restoreBackup")}>
              <ImportVaultPanel
                existing={false}
                expectedMeta={null}
                onImport={(unlocked) => {
                  acceptUnlocked(
                    unlocked,
                    t("vault.notice.backupRestored"),
                  );
                  broadcast("changed", unlocked.meta);
                }}
              />
              </WorkspaceDisclosure>
              <WorkspaceDisclosure title={t("vault.disclosure.restoreWithRecovery")}>
              <BackupRecoveryPanel
                onRecover={(unlocked) => {
                  acceptUnlocked(
                    unlocked,
                    t("vault.notice.backupRecovered"),
                  );
                  broadcast("changed", unlocked.meta);
                }}
              />
              </WorkspaceDisclosure>
            </div>
          </div>
        )}
        {phase === "locked" && meta && (
          <div className="vault-entry space-y-4">
            <UnlockPanel
              onUnlock={async (passphrase) => {
                try {
                  acceptUnlocked(
                    await unlockLocalVault(meta, passphrase),
                    t("vault.notice.unlocked"),
                  );
                } catch (unlockError) {
                  setError(vaultErrorMessage(unlockError));
                }
              }}
            />
            <WorkspaceDisclosure title={t("vault.disclosure.forgotPassphrase")}>
              <RecoveryPanel
                meta={meta}
                onRecover={(recovered) => {
                  acceptUnlocked(
                    recovered,
                    t("vault.notice.recoverySucceeded"),
                  );
                  broadcast("changed", recovered.meta);
                }}
              />
            </WorkspaceDisclosure>
            <WorkspaceDisclosure title={t("vault.disclosure.restoreBackup")}>
              <ImportVaultPanel
                existing
                expectedMeta={meta}
                onImport={(unlocked) => {
                  acceptUnlocked(
                    unlocked,
                    t("vault.notice.backupReplaced"),
                  );
                  broadcast("changed", unlocked.meta);
                }}
              />
            </WorkspaceDisclosure>
            <WorkspaceDisclosure title={t("vault.disclosure.settingsDelete")}>
              <DeleteVaultPanel onDelete={destroy} compact />
            </WorkspaceDisclosure>
          </div>
        )}
        {phase === "unlocked" && meta && (
          <>
            {recoverySecret && (
              <RecoverySecretPanel
                secret={recoverySecret}
                onDone={() => setRecoverySecret("")}
              />
            )}
            <div
              className="vault-workspace-tabs mt-6 flex flex-wrap gap-1 border-b border-[#383838] pb-2"
            >
              <button
                type="button"
                onClick={() => selectWorkspace("portfolio")}
                className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "portfolio" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}
              >
                {t("vault.tab.portfolio")}
              </button>
              {COLLECTIBLE_CATALOG_ENABLED && (
                <button
                  type="button"
                  onClick={() => selectWorkspace("collectibles")}
                  className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "collectibles" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}
                >
                  {t("vault.tab.collectibles")}
                </button>
              )}
              {MARKET_INVENTORY_ENABLED && (
                <button
                  type="button"
                  onClick={() => selectWorkspace("market")}
                  className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "market" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}
                >
                  {t("vault.tab.market")}
                </button>
              )}
              {REPLAY_ACTIONS_ENABLED && (
                <button
                  type="button"
                  onClick={() => selectWorkspace("replay")}
                  className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "replay" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}
                >
                  {t("vault.tab.replay")}
                </button>
              )}
              <button
                type="button"
                onClick={() => selectWorkspace("assets")}
                className={`min-h-[48px] bg-[#202020] font-mono-d text-[10px] tracking-[0.14em] ${workspace === "assets" ? "text-[#fa6c34] shadow-[inset_0_-2px_0_#fa6c34]" : "text-[#7f7972] hover:text-[#d6ccba]"}`}
              >
                {t("vault.tab.assets")}
              </button>
            </div>
            {MARKET_INVENTORY_ENABLED && (
              <div hidden={workspace !== "market"}>
                <MarketInventoryPanel
                  key={`${meta.vaultId}:${sessionGeneration}:market`}
                  assets={assets}
                  context={markets[0]}
                  sessionId={sessionGeneration}
                  onSaveContext={saveMarketContext}
                />
              </div>
            )}
            {isApprovalManagerEnabled() && <button type="button" className="mt-4 min-h-[44px] border border-[#fa6c34] px-4 text-[#fa6c34]" onClick={() => selectWorkspace("approvals")}>{t("vault.tab.approvals")}</button>}
            {isDealFinderEnabled() && <button type="button" className="mt-4 min-h-[44px] border border-[#fa6c34] px-4 text-[#fa6c34]" onClick={() => selectWorkspace("deals")}>{t("vault.tab.deals")}</button>}
            {workspace === "deals" && (previewDeals || isDealFinderEnabled()) ? <MarketInventoryPanel key={`${meta.vaultId}:${sessionGeneration}:deals`} dealsOnly assets={assets.filter(asset => asset.assetType === "collectible")} context={markets[0]} sessionId={sessionGeneration} onSaveContext={saveMarketContext} /> : workspace === "market" &&
            MARKET_INVENTORY_ENABLED ? null : workspace === "portfolio" || workspace === "approvals" ? (
              <PortfolioPanel
                key={`${meta.vaultId}:${sessionGeneration}:${workspace}`}
                approvalsOnly={workspace === "approvals"}
                assets={assets}
                context={portfolios[0]}
                sessionId={sessionGeneration}
                onSave={savePortfolio}
              />
            ) : workspace === "replay" && REPLAY_ACTIONS_ENABLED ? (
              <ReplayActionsPanel
                key={`${meta.vaultId}:${sessionGeneration}:replay`}
                assets={assets}
                portfolios={portfolios}
                markets={markets}
                sessionId={sessionGeneration}
                onSaveContext={saveMarketContext}
              />
            ) : workspace === "collectibles" && COLLECTIBLE_CATALOG_ENABLED ? (
              <CollectibleCatalogPanel
                key={`${meta.vaultId}:${sessionGeneration}:collectibles`}
                context={collectibles[0]}
                sessionId={sessionGeneration}
                onSaveContext={saveCollectibleContext}
                onSaveAsset={saveCatalogAsset}
                onManual={() => {
                  selectWorkspace("assets");
                  setEditor("new");
                }}
              />
            ) : (
              <>
                <VaultDashboard
                  assets={assets}
                  onAdd={() => setEditor("new")}
                  demoBusy={demoBusy}
                  onLoadDemo={loadDemoAssets}
                  onRemoveDemo={removeDemoAssets}
                />
                {editor && (
                  <AssetEditor
                    key={editor === "new" ? "new" : editor.id}
                    asset={editor === "new" ? undefined : editor}
                    onCancel={() => setEditor(null)}
                    onSave={saveAsset}
                  />
                )}
                <AssetGrid
                  assets={assets}
                  onEdit={setEditor}
                  onDelete={removeAsset}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
              aria-expanded={settingsOpen}
              aria-controls="vault-settings"
              className="mt-8 flex w-full items-center justify-between border border-[#383838] bg-[#202020] px-5 py-4 text-left font-mono-d text-[10px] tracking-[0.14em] text-[#9a938a] hover:text-[#e9e0d1]"
            >
              <span>{t("vault.settings.toggleLabel")}</span>
              <span>{settingsOpen ? t("vault.settings.close") : t("vault.settings.open")}</span>
            </button>
            {settingsOpen && (
              <VaultSettings
                storage={storage}
                onStorage={async () =>
                  setStorage(await requestPersistentStorage())
                }
                onMeta={(nextMeta) => {
                  setMeta(nextMeta);
                  broadcast("changed", nextMeta);
                  setNotice(
                    t("vault.notice.passphraseChanged"),
                  );
                }}
                unlocked={unlockedContext()}
                onImport={(unlocked) => {
                  acceptUnlocked(
                    unlocked,
                    t("vault.notice.backupReplaced"),
                  );
                  broadcast("changed", unlocked.meta);
                }}
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
  const { t } = useI18n();
  if (OPSIS_PRESENTATION) return <div className="opsis-vault-controls"><span>{t("vault.header.encryptedVault")}</span>{phase === "unlocked" && <button type="button" onClick={onLock}><LockKeyhole size={14} /> {t("vault.header.lock")}</button>}</div>;
  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
      <Link
        to="/"
        className="flex items-center gap-3"
        aria-label={t("vault.header.homeLabel")}
      >
        <span
          className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]"
          style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}
        >
          <img src="/logo.svg" alt="" className="h-5 w-5" />
        </span>
        <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">
          OPSIS
        </span>
      </Link>
      <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#7fb069] sm:text-[10.5px]">
        <FileKey2 size={13} /> {t("vault.header.encryptedVault")}
      </div>
      {phase === "unlocked" ? (
        <button
          type="button"
          onClick={onLock}
          className="flex items-center gap-2 font-mono-d text-[9.5px] tracking-wider text-[#d6ccba] hover:text-[#fa6c34] sm:text-[10px]"
        >
          <LockKeyhole size={12} /> {t("vault.header.lock")}
        </button>
      ) : (
        <Link
          to="/app"
          className="font-mono-d text-[9.5px] tracking-wider text-[#7f7972] hover:text-[#e9e0d1] sm:text-[10px]"
        >
          {t("vault.header.explorer")}
        </Link>
      )}
    </header>
  );
}

function VaultHero({
  storage,
  phase,
}: {
  storage: VaultStorageStatus;
  phase: Phase;
}) {
  const { t } = useI18n();
  const storageLabel = !storage.supported
    ? t("vault.hero.storageUnsupported")
    : storage.persistent
      ? t("vault.hero.storagePersistent")
      : t("vault.hero.storageBackupAdvised");
  return (
    <section className="workspace-heading">
      {!OPSIS_PRESENTATION && (      <div>
        <p className="workspace-eyebrow">
          <LockKeyhole size={14} /> {t("vault.hero.eyebrow")}
        </p>
        <h1 className="workspace-title">
          {t("vault.hero.title.line1")}
          <br />
          <span className="text-[#d6ccba]">{t("vault.hero.title.line2")}</span>
        </h1>
        <p className="workspace-description">
          {t("vault.hero.description")}
        </p>
      </div>)}
      <WorkspaceDisclosure title={t("vault.hero.privacyTitle")} className="workspace-privacy-details">
      <div className="grid grid-cols-2 gap-px border border-[#383838] bg-[#383838]">
        <PrivacyTile label={t("vault.hero.cipher")} value="AES-256-GCM" />
        <PrivacyTile label={t("vault.hero.keyDerivation")} value="PBKDF2 · 600K" />
        <PrivacyTile label={t("vault.hero.serverCopy")} value={t("vault.hero.none")} />
        <PrivacyTile
          label={t("vault.hero.storage")}
          value={storageLabel}
          tone={storage.persistent ? "good" : "warn"}
        />
        {phase === "unlocked" && (
          <div className="col-span-2 bg-[#202020] px-4 py-3 font-mono-d text-[9px] tracking-wider text-[#635d5a]">
            {t("vault.hero.autoLock")}
          </div>
        )}
      </div>
      </WorkspaceDisclosure>
    </section>
  );
}

function CreateVaultPanel({
  onCreate,
}: {
  onCreate: (passphrase: string) => Promise<void>;
}) {
  const { t } = useI18n();
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
    <form
      onSubmit={submit}
      className="clip-panel border border-[#383838] bg-[#242424] p-6 sm:p-8"
    >
      <PanelTitle
        icon={<KeyRound size={15} />}
        eyebrow={t("vault.create.eyebrow")}
        title={t("vault.create.title")}
      />
      <p className="mt-4 text-[12.5px] leading-relaxed text-[#9a938a]">
        {t("vault.create.description")}
      </p>
      <PasswordField
        label={t("vault.field.vaultPassphrase")}
        value={passphrase}
        onChange={setPassphrase}
      />
      <PasswordField
        label={t("vault.field.confirmPassphrase")}
        value={confirmation}
        onChange={setConfirmation}
      />
      {confirmation && passphrase !== confirmation && (
        <p className="mt-2 text-[11px] text-[#e0738a]">
          {t("vault.create.mismatch")}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || passphrase.length < 12 || passphrase !== confirmation}
        className="clip-btn-sm mt-5 flex min-h-[46px] w-full items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-40"
      >
        <ShieldCheck size={14} />{" "}
        {busy ? t("vault.create.deriving") : t("vault.create.submit")}
      </button>
    </form>
  );
}

function UnlockPanel({
  onUnlock,
}: {
  onUnlock: (passphrase: string) => Promise<void>;
}) {
  const { t } = useI18n();
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
    <form
      onSubmit={submit}
      className="clip-panel border border-[#514a45] bg-[#242424] p-6 sm:p-8"
    >
      <PanelTitle
        icon={<LockKeyhole size={15} />}
        eyebrow={t("vault.unlock.eyebrow")}
        title={t("vault.unlock.title")}
        tone="good"
      />
      <p className="mt-4 text-[12.5px] leading-relaxed text-[#9a938a]">
        {t("vault.unlock.description")}
      </p>
      <PasswordField
        label={t("vault.field.vaultPassphrase")}
        value={passphrase}
        onChange={setPassphrase}
        autoFocus
      />
      <button
        type="submit"
        disabled={busy || passphrase.length < 12}
        className="clip-btn-sm mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 bg-[#fa6c34] px-5 text-[14px] font-semibold text-[#1d1d1d] disabled:opacity-40"
      >
        <KeyRound size={14} /> {busy ? t("vault.unlock.unwrapping") : t("vault.unlock.submit")}
      </button>
    </form>
  );
}

function VaultDashboard({
  assets,
  onAdd,
  demoBusy,
  onLoadDemo,
  onRemoveDemo,
}: {
  assets: VaultAsset[];
  onAdd: () => void;
  demoBusy: boolean;
  onLoadDemo: () => Promise<void>;
  onRemoveDemo: () => Promise<void>;
}) {
  const { t } = useI18n();
  const charts = useVaultVisualizations();
  const [confirmDemoRemoval, setConfirmDemoRemoval] = useState(false);
  const types = new Set(assets.map((asset) => asset.assetType)).size;
  const demoCount = assets.filter(isVaultDemoAsset).length;
  const lots = assets.reduce((total, asset) => total + asset.lots.length, 0);
  const pricedLots = assets.reduce(
    (total, asset) => total + asset.lots.filter((lot) => lot.unitPrice).length,
    0,
  );
  return (
    <div
      className={`vault-dashboard mt-8 grid gap-5 ${assets.length ? "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}`}
    >
      {assets.length > 0 && charts && (
        <charts.VaultRecordMixChart assets={assets} />
      )}
      <section className="clip-panel border border-[#383838] bg-[#242424]">
        <div className="grid h-full gap-px bg-[#383838] sm:grid-cols-[1fr_1fr_1fr_auto] xl:grid-cols-2">
          <Metric label={t("vault.dashboard.encryptedAssets")} value={String(assets.length)} />
          <Metric label={t("vault.dashboard.purchaseLots")} value={String(lots)} />
          <Metric
            label={t("vault.dashboard.pricedLots")}
            value={String(pricedLots)}
            note={types === 1 ? t("vault.dashboard.assetType.one", { count: types }) : t("vault.dashboard.assetType.other", { count: types })}
          />
          <div className="flex items-center bg-[#202020] p-4 sm:p-5">
            <button
              type="button"
              onClick={onAdd}
              className="clip-btn-sm flex min-h-[44px] w-full items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[10px] font-medium tracking-wider text-[#1d1d1d] sm:w-auto"
            >
              <PackagePlus size={14} /> {t("vault.dashboard.addAsset")}
            </button>
          </div>
        </div>
      </section>
      <section className={`clip-panel border border-[#4b403b] bg-[#211e1c] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 ${assets.length ? "xl:col-span-2" : ""}`} aria-label={t("vault.dashboard.demoAria")}>
        <div className="max-w-[690px]">
          <p className="flex items-center gap-2 font-mono-d text-[9px] font-semibold tracking-[0.15em] text-[#ff9a70]"><FlaskConical size={13} /> {t("vault.dashboard.demoTitle")}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-[#cfc5ba]">
            {t("vault.dashboard.demoDescription")}
          </p>
          {demoCount > 0 && (
            <p className="mt-2 font-mono-d text-[8px] tracking-[0.12em] text-[#8f8780]">{demoCount === 1 ? t("vault.dashboard.demoSaved.one", { count: demoCount }) : t("vault.dashboard.demoSaved.other", { count: demoCount })}</p>
          )}
        </div>
        <div className="mt-4 flex shrink-0 flex-col gap-2 sm:mt-0 sm:min-w-[210px]">
          {demoCount < 4 && (
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => {
                setConfirmDemoRemoval(false);
                void onLoadDemo();
              }}
              className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-5 font-mono-d text-[9.5px] font-semibold tracking-wider text-[#1d1d1d] disabled:opacity-40"
            >
              <FlaskConical size={13} /> {demoBusy ? t("vault.dashboard.encrypting") : demoCount ? t("vault.dashboard.restoreDemo") : t("vault.dashboard.loadDemo")}
            </button>
          )}
          {demoCount > 0 && (
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => {
                if (!confirmDemoRemoval) {
                  setConfirmDemoRemoval(true);
                  return;
                }
                setConfirmDemoRemoval(false);
                void onRemoveDemo();
              }}
              className={`flex min-h-[42px] items-center justify-center gap-2 border px-4 font-mono-d text-[8.5px] tracking-wider outline-none transition-colors disabled:opacity-40 ${confirmDemoRemoval ? "border-[#e0738a] bg-[#e0738a]/10 text-[#f09ab0]" : "border-[#4a4541] text-[#aaa19a] hover:border-[#e0738a]/55 hover:text-[#e0738a]"}`}
            >
              <Trash2 size={12} /> {confirmDemoRemoval ? t("vault.dashboard.confirmRemoveDemo", { count: demoCount }) : t("vault.dashboard.removeDemo")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function AssetEditor({
  asset,
  onCancel,
  onSave,
}: {
  asset?: VaultAsset;
  onCancel: () => void;
  onSave: (draft: VaultAssetDraft, existing?: VaultAsset) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<VaultAssetDraft>(
    () => (asset ? assetToDraft(asset) : emptyAssetDraft()),
  );
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [editorError, setEditorError] = useState("");
  const photoRequestRef = useRef(0);
  const certificateLocked = Boolean(
    draft.collectible && draft.collectible.grader !== "ungraded",
  );
  const set = <K extends keyof VaultAssetDraft>(
    key: K,
    value: VaultAssetDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const updateLot = (
    index: number,
    key: keyof VaultLotDraft,
    value: string,
  ) => {
    set(
      "lots",
      draft.lots.map((lot, lotIndex) =>
        lotIndex === index ? { ...lot, [key]: value } : lot,
      ),
    );
  };
  const updateCollectible = <
    K extends keyof NonNullable<VaultAssetDraft["collectible"]>,
  >(
    key: K,
    value: NonNullable<VaultAssetDraft["collectible"]>[K],
  ) => {
    setDraft((current) =>
      current.collectible
        ? { ...current, collectible: { ...current.collectible, [key]: value } }
        : current,
    );
  };
  const updateCollectibleReference = (
    index: number,
    key: "value" | "currency" | "observedAt" | "sourceUrl" | "label",
    value: string,
  ) => {
    setDraft((current) => {
      if (!current.collectible) return current;
      return {
        ...current,
        collectible: {
          ...current.collectible,
          references: current.collectible.references.map((reference, referenceIndex) =>
            referenceIndex === index ? { ...reference, [key]: value } : reference,
          ),
        },
      };
    });
  };
  const addCollectibleReference = () => {
    setDraft((current) =>
      current.collectible && current.collectible.references.length < 20
        ? {
            ...current,
            collectible: {
              ...current.collectible,
              references: [
                ...current.collectible.references,
                {
                  id: crypto.randomUUID(),
                  value: "",
                  currency: "USD",
                  observedAt: "",
                  sourceUrl: "",
                  label: "",
                },
              ],
            },
          }
        : current,
    );
  };
  const removeCollectibleReference = (index: number) => {
    setDraft((current) =>
      current.collectible
        ? {
            ...current,
            collectible: {
              ...current.collectible,
              references: current.collectible.references.filter(
                (_reference, referenceIndex) => referenceIndex !== index,
              ),
            },
          }
        : current,
    );
  };
  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const requestId = ++photoRequestRef.current;
    if (
      file.size > MAX_SOURCE_PHOTO_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setPhotoBusy(false);
      setPhotoError(t("vault.editor.photoSourceError"));
      return;
    }
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const photo = await fileToVaultPhoto(file);
      if (photoRequestRef.current === requestId) {
        setDraft((current) => ({
          ...current,
          photo,
          ...(current.collectible
            ? {
                collectible: {
                  ...current.collectible,
                  photoSource: "owner_supplied",
                  photoAddedAt: new Date().toISOString(),
                },
              }
            : {}),
        }));
      }
    } catch {
      if (photoRequestRef.current === requestId)
        setPhotoError(t("vault.editor.photoReadError"));
    } finally {
      if (photoRequestRef.current === requestId) setPhotoBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || photoBusy) return;
    setBusy(true);
    setEditorError("");
    try {
      await onSave(draft, asset);
    } catch (saveError) {
      setEditorError(
        saveError instanceof Error
          ? saveError.message
          : t("vault.editor.saveError"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      className="clip-panel mt-5 border border-[#fa6c34]/45 bg-[#242424] p-5 sm:p-7"
      data-testid="vault-asset-editor"
    >
      <div className="flex items-start justify-between gap-4">
        <PanelTitle
          icon={<PackagePlus size={15} />}
          eyebrow={asset ? t("vault.editor.editEyebrow") : t("vault.editor.newEyebrow")}
          title={asset ? asset.name : t("vault.editor.newTitle")}
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("vault.editor.closeAria")}
          className="p-2 text-[#635d5a] hover:text-[#e9e0d1]"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field
          label={t("vault.field.assetName")}
          value={draft.name}
          onChange={(value) => set("name", value)}
          maxLength={120}
          required
          placeholder={t("vault.editor.namePlaceholder")}
        />
        <SelectField
          label={t("vault.field.type")}
          value={draft.assetType}
          onChange={(value) => {
            const assetType = value as VaultAssetType;
            setDraft((current) => ({
              ...current,
              assetType,
              ...(assetType === "collectible"
                ? {
                    collectible:
                      current.collectible ??
                      manualCollectibleDetails(
                        current.photo ? new Date().toISOString() : null,
                      ),
                  }
                : { collectible: undefined }),
            }));
          }}
          disabled={Boolean(draft.collectible?.catalog)}
          options={[
            ["collectible", t("vault.options.collectible")],
            ["crypto", t("vault.options.crypto")],
            ["rwa", t("vault.options.rwa")],
            ["nft", t("vault.options.nft")],
            ["other", t("vault.options.other")],
          ]}
        />
        <Field
          label={t("vault.field.identifier")}
          value={draft.identifier}
          onChange={(value) => set("identifier", value)}
          maxLength={200}
          placeholder={t("vault.common.optional")}
          disabled={Boolean(draft.collectible?.catalog)}
        />
        <label className="md:col-span-2 lg:col-span-3">
          <span className="font-mono-d text-[9px] tracking-[0.13em] text-[#635d5a]">
            {t("vault.field.privateNotes")}
          </span>
          <textarea
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            maxLength={5_000}
            rows={4}
            placeholder={t("vault.editor.notesPlaceholder")}
            className="mt-2 w-full resize-y border border-[#383838] bg-[#1d1d1d] px-4 py-3 text-[12.5px] leading-relaxed text-[#e9e0d1] outline-none focus:border-[#fa6c34]"
          />
        </label>
      </div>
      {draft.collectible && (
        <div className="mt-5 border border-[#7fb069]/35 bg-[#20251f] p-4 sm:p-5">
          <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#7fb069]">
            {draft.collectible.catalog
              ? t("vault.editor.catalogDetailsTitle")
              : t("vault.editor.manualDetailsTitle")}
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed text-[#7f7972]">
            {draft.collectible.catalog ? t("vault.editor.catalogDisclaimer") : t("vault.editor.manualDisclaimer")}{t("vault.editor.detailsDisclaimer")}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Field
              label={t("vault.field.ownerPrinting")}
              value={draft.collectible.ownerPrinting}
              onChange={(value) => updateCollectible("ownerPrinting", value)}
              maxLength={120}
              placeholder={t("vault.editor.ownerPrintingPlaceholder")}
              flush
            />
            <SelectField
              label={t("vault.field.ownerCondition")}
              value={draft.collectible.condition}
              onChange={(value) =>
                updateCollectible(
                  "condition",
                  value as NonNullable<
                    VaultAssetDraft["collectible"]
                  >["condition"],
                )
              }
              options={[
                ["unknown", t("vault.options.conditionUnknown")],
                ["poor", t("vault.options.conditionPoor")],
                ["played", t("vault.options.conditionPlayed")],
                ["good", t("vault.options.conditionGood")],
                ["excellent", t("vault.options.conditionExcellent")],
                ["near-mint", t("vault.options.conditionNearMint")],
                ["mint", t("vault.options.conditionMint")],
              ]}
            />
            <SelectField
              label={t("vault.field.ownerGrader")}
              value={draft.collectible.grader}
              onChange={(value) => {
                const grader = value as NonNullable<
                  VaultAssetDraft["collectible"]
                >["grader"];
                if (
                  grader !== "ungraded" &&
                  (draft.lots.length !== 1 || draft.lots[0]?.quantity !== "1")
                ) {
                  setEditorError(
                    t("vault.editor.gradedError"),
                  );
                  return;
                }
                setEditorError("");
                setDraft((current) =>
                  current.collectible
                    ? {
                        ...current,
                        collectible: {
                          ...current.collectible,
                          grader,
                          ...(grader === "ungraded"
                            ? { grade: "", certificate: "" }
                            : {}),
                        },
                      }
                    : current,
                );
              }}
              options={[
                ["ungraded", t("vault.options.ungraded")],
                ["psa", "PSA"],
                ["cgc", "CGC"],
                ["bgs", "BGS"],
                ["other", t("vault.options.other")],
              ]}
            />
            {draft.collectible.grader !== "ungraded" && (
              <Field
                label={t("vault.field.ownerGrade")}
                value={draft.collectible.grade}
                onChange={(value) => updateCollectible("grade", value)}
                maxLength={40}
                required
                flush
              />
            )}
            {draft.collectible.grader !== "ungraded" && (
              <Field
                label={t("vault.field.ownerCertificate")}
                value={draft.collectible.certificate}
                onChange={(value) => updateCollectible("certificate", value)}
                maxLength={80}
                required
                flush
              />
            )}
          </div>
          <div className="mt-4 border-t border-[#383838] pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono-d text-[8px] tracking-wider text-[#fa6c34]">
                {t("vault.editor.historyTitle")}
              </p>
              <button
                type="button"
                onClick={addCollectibleReference}
                disabled={draft.collectible.references.length >= 20}
                className="font-mono-d text-[8px] text-[#9fc68f] disabled:text-[#4f4a46]"
              >
                {t("vault.editor.addReference")}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[#7f7972]">
              {t("vault.editor.historyDescription")}
            </p>
            {draft.collectible.references.length === 0 && (
              <button
                type="button"
                onClick={addCollectibleReference}
                className="mt-3 border border-dashed border-[#383838] px-4 py-3 font-mono-d text-[8px] text-[#9a938a]"
              >
                {t("vault.editor.addFirstReference")}
              </button>
            )}
            <div className="mt-3 space-y-3">
              {draft.collectible.references.map((reference, index) => (
                <div key={reference.id} className="border border-[#383838] bg-[#1d1d1d] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono-d text-[8px] text-[#9a938a]">{t("vault.editor.reference", { n: index + 1 })}</span>
                    <button type="button" onClick={() => removeCollectibleReference(index)} className="font-mono-d text-[8px] text-[#e0738a]">{t("vault.common.remove")}</button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                    <Field label={t("vault.editor.referenceValue", { n: index + 1 })} value={reference.value} onChange={(value) => updateCollectibleReference(index, "value", value)} maxLength={157} flush />
                    <Field label={t("vault.editor.referenceCurrency", { n: index + 1 })} value={reference.currency} onChange={(value) => updateCollectibleReference(index, "currency", value)} maxLength={12} flush />
                    <Field label={t("vault.editor.referenceObserved", { n: index + 1 })} value={reference.observedAt} onChange={(value) => updateCollectibleReference(index, "observedAt", value)} type="date" flush />
                    <Field label={t("vault.editor.referenceUrl", { n: index + 1 })} value={reference.sourceUrl} onChange={(value) => updateCollectibleReference(index, "sourceUrl", value)} maxLength={1_000} flush />
                    <Field label={t("vault.editor.referenceLabel", { n: index + 1 })} value={reference.label} onChange={(value) => updateCollectibleReference(index, "label", value)} maxLength={120} flush />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="mt-5 border border-[#383838] bg-[#202020] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
              {t("vault.editor.purchaseLots")}
            </p>
            <p className="mt-2 text-[11.5px] text-[#7f7972]">
              {t("vault.editor.purchaseLotsDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              set("lots", [
                ...draft.lots,
                {
                  quantity: "1",
                  unitPrice: "",
                  currency: "USD",
                  acquiredAt: "",
                },
              ])
            }
            disabled={certificateLocked || draft.lots.length >= 100}
            className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#d6ccba] disabled:opacity-30"
          >
            {t("vault.editor.addLot")}
          </button>
        </div>
        {certificateLocked && (
          <p className="mt-3 text-[10.5px] text-[#e0a96d]">
            {t("vault.editor.certificateLocked")}
          </p>
        )}
        <div className="mt-4 space-y-3">
          {draft.lots.map((lot, index) => (
            <div
              key={lot.id ?? `new-${index}`}
              className="grid gap-3 border border-[#343434] bg-[#1d1d1d] p-4 md:grid-cols-[0.8fr_1fr_0.7fr_1fr_auto] md:items-end"
            >
              <Field
                label={t("vault.editor.lotQuantity", { n: index + 1 })}
                value={lot.quantity}
                onChange={(value) => updateLot(index, "quantity", value)}
                inputMode="decimal"
                pattern="\d{1,78}(\.\d{1,78})?"
                maxLength={157}
                placeholder="1"
                required
                disabled={certificateLocked}
                flush
              />
              <Field
                label={t("vault.editor.pricePerUnit")}
                value={lot.unitPrice}
                onChange={(value) => updateLot(index, "unitPrice", value)}
                inputMode="decimal"
                pattern="\d{1,78}(\.\d{1,78})?"
                maxLength={157}
                placeholder={t("vault.common.optional")}
                flush
              />
              <Field
                label={t("vault.field.currency")}
                value={lot.currency}
                onChange={(value) => updateLot(index, "currency", value)}
                maxLength={12}
                required
                placeholder="USD"
                flush
              />
              <Field
                label={t("vault.field.acquiredDate")}
                value={lot.acquiredAt}
                onChange={(value) => updateLot(index, "acquiredAt", value)}
                type="date"
                flush
              />
              <button
                type="button"
                aria-label={t("vault.editor.removeLotAria", { n: index + 1 })}
                disabled={certificateLocked || draft.lots.length === 1}
                onClick={() =>
                  set(
                    "lots",
                    draft.lots.filter((_, lotIndex) => lotIndex !== index),
                  )
                }
                className="mb-1 p-3 text-[#635d5a] hover:text-[#e0738a] disabled:opacity-25"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-4 border-t border-[#383838] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#9a938a] hover:text-[#e9e0d1]">
            <ImagePlus size={13} />{" "}
            {photoBusy
              ? t("vault.editor.processingPhoto")
              : draft.photo
                ? t("vault.editor.replacePhoto")
                : t("vault.editor.addPhoto")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPhoto}
              disabled={busy || photoBusy}
              className="sr-only"
              aria-label={t("vault.editor.photoAria")}
            />
          </label>
          {draft.photo && (
            <button
              type="button"
              onClick={() => {
                photoRequestRef.current += 1;
                setPhotoBusy(false);
                setDraft((current) => ({
                  ...current,
                  photo: undefined,
                  ...(current.collectible
                    ? {
                        collectible: {
                          ...current.collectible,
                          photoSource: null,
                          photoAddedAt: null,
                        },
                      }
                    : {}),
                }));
              }}
              className="font-mono-d text-[9px] text-[#e0738a]"
            >
              {t("vault.editor.removePhoto")}
            </button>
          )}
          {photoBusy && (
            <span role="status" className="text-[11px] text-[#e0a96d]">
              {t("vault.editor.sanitizing")}
            </span>
          )}
          {photoError && (
            <span className="text-[11px] text-[#e0738a]">{photoError}</span>
          )}
        </div>
        <button
          type="submit"
          disabled={busy || photoBusy || !draft.name.trim()}
          className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-6 font-mono-d text-[10px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-40"
        >
          <LockKeyhole size={13} />{" "}
          {photoBusy
            ? t("vault.editor.processingPhoto")
            : busy
              ? t("vault.editor.encrypting")
              : t("vault.editor.encryptSave")}
        </button>
      </div>
      {editorError && (
        <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
          {editorError}
        </p>
      )}
    </form>
  );
}

function AssetGrid({
  assets,
  onEdit,
  onDelete,
}: {
  assets: VaultAsset[];
  onEdit: (asset: VaultAsset) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  if (!assets.length) {
    return (
      <div className="workspace-empty mt-5">
        <PackagePlus size={26} className="text-[#fa6c34]" />
        <h2 className="text-[18px] text-[#e9e0d1]">{t("vault.grid.emptyTitle")}</h2>
        <p>{t("vault.grid.emptyBody")}</p>
      </div>
    );
  }
  return (
    <section
      className="vault-asset-grid mt-6"
      data-testid="vault-assets"
    >
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onEdit={() => onEdit(asset)}
          onDelete={() => onDelete(asset.id)}
        />
      ))}
    </section>
  );
}

function AssetCard({
  asset,
  onEdit,
  onDelete,
}: {
  asset: VaultAsset;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const charts = useVaultVisualizations();
  const [confirm, setConfirm] = useState(false);
  const firstLot = asset.lots[0];
  const latestReference = asset.collectible?.references.reduce<typeof asset.collectible.references[number] | undefined>(
    (latest, reference) => !latest || reference.observedAt >= latest.observedAt ? reference : latest,
    undefined,
  );
  return (
    <article className="vault-asset-card overflow-hidden rounded-[6px] border border-[#383838] bg-[#242424]">
      {asset.photo ? (
        <div className="border-b border-[#383838] bg-[#191919]">
          <img
            src={asset.photo.dataUrl}
            alt={asset.collectible?.photoSource === "tcgdex_catalog" ? t("vault.card.altCatalog", { name: asset.name }) : t("vault.card.altOwner", { name: asset.name })}
            className="vault-asset-photo h-64 w-full object-contain p-4"
          />
          {asset.collectible && (
            <p className="px-3 py-2 font-mono-d text-[7.5px] tracking-wider text-[#635d5a]">
              {asset.collectible.photoSource === "tcgdex_catalog"
                ? t("vault.card.catalogThumbnail")
                : t("vault.card.ownerPhoto")}{" "}
              · {t("vault.card.added")}{" "}
              {asset.collectible.photoAddedAt?.slice(0, 10)}
            </p>
          )}
        </div>
      ) : (
        <div className="vault-asset-placeholder flex h-64 flex-col items-center justify-center gap-3 border-b border-[#383838] bg-[#201e1c] text-[#aaa39b]">
          <FileKey2 size={32} className="text-[#fa6c34]" />
          <span className="text-[12px]">{t(ASSET_TYPE_FALLBACK_KEYS[asset.assetType])} · {t("vault.card.noPhoto")}</span>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono-d text-[8.5px] tracking-[0.15em] text-[#7fb069]">
              {asset.collectible
                ? asset.collectible.catalog
                  ? t("vault.card.catalogEyebrow")
                  : t("vault.card.ownerCollectibleEyebrow")
                : asset.assetType.toUpperCase()}{t("vault.card.encryptedSuffix")}
            </p>
            <h3 className="mt-2 text-[18px] font-medium tracking-[-0.02em] text-[#f0e8da]">
              {asset.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("vault.card.editAria", { name: asset.name })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#514a45] text-[#aaa39b] hover:border-[#fa6c34] hover:text-[#e9e0d1]"
          >
            <Pencil size={14} />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px bg-[#383838]">
          <SmallMetric label={t("vault.card.lots")} value={String(asset.lots.length)} />
          <SmallMetric
            label={t("vault.card.firstUnitPrice")}
            value={
              firstLot?.unitPrice
                ? `${firstLot.unitPrice} ${firstLot.currency}`
                : "—"
            }
          />
        </div>
        {asset.collectible && (
          <div className="mt-px grid grid-cols-2 gap-px bg-[#383838]">
            <SmallMetric
              label={t("vault.field.ownerPrinting")}
              value={asset.collectible.ownerPrinting || t("vault.card.notEntered")}
            />
            <SmallMetric
              label={t("vault.field.ownerCondition")}
              value={t(CONDITION_DISPLAY_KEYS[asset.collectible.condition])}
            />
            <SmallMetric
              label={t("vault.card.ownerGradeCert")}
              value={asset.collectible.grader === "ungraded"
                ? t("vault.card.ungraded")
                : t("vault.card.graded", { grader: asset.collectible.grader.toUpperCase(), grade: asset.collectible.grade, certificate: asset.collectible.certificate })}
            />
            <SmallMetric
              label={t("vault.card.manualValueHistory")}
              value={latestReference
                ? (asset.collectible.references.length === 1
                  ? t("vault.card.references.one", { count: asset.collectible.references.length, value: latestReference.value, currency: latestReference.currency, date: latestReference.observedAt })
                  : t("vault.card.references.other", { count: asset.collectible.references.length, value: latestReference.value, currency: latestReference.currency, date: latestReference.observedAt }))
                : t("vault.card.notEnteredUpper")}
            />
          </div>
        )}
        {asset.identifier && (
          <p
            className="mt-4 truncate font-mono-d text-[9px] text-[#635d5a]"
            title={asset.identifier}
          >
            {asset.identifier}
          </p>
        )}
        {asset.notes && (
          <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-[#9a938a]">
            {asset.notes}
          </p>
        )}
        {asset.collectible && (
          <p className="mt-3 text-[9px] leading-relaxed text-[#635d5a]">
            {asset.collectible.catalog ? (
              <>
                {t("vault.card.catalogNote")}{" "}
                <a
                  href={asset.collectible.catalog.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#9a938a] underline"
                >
                  {t("vault.card.openCatalog")}
                </a>
              </>
            ) : (
              <>{t("vault.card.manualNote")}</>
            )}
            {asset.collectible.references.length > 0 && (
              <>
                {" "}
                ·{" "}
                <a
                  href={asset.collectible.references.at(-1)?.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#9a938a] underline"
                >
                  {t("vault.card.openValueSource")}
                </a>
              </>
            )}
          </p>
        )}
        {charts && <charts.CollectibleValueHistoryChart asset={asset} />}
        <div className="mt-5 border-t border-[#383838] pt-4">
          {!confirm ? (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="flex items-center gap-2 font-mono-d text-[8.5px] tracking-wider text-[#635d5a] hover:text-[#e0738a]"
            >
              <Trash2 size={11} /> {t("vault.card.removeRecord")}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onDelete}
                className="font-mono-d text-[9px] text-[#e0738a]"
              >
                {t("vault.card.confirmRemove")}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="font-mono-d text-[9px] text-[#635d5a]"
              >
                {t("vault.card.cancel")}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function VaultSettings({
  storage,
  onStorage,
  unlocked,
  onMeta,
  onImport,
  onDelete,
}: {
  storage: VaultStorageStatus;
  onStorage: () => Promise<void>;
  unlocked: UnlockedVault;
  onMeta: (meta: VaultMeta) => void;
  onImport: (unlocked: UnlockedVault) => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [backupError, setBackupError] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const { download, prepare } = useBackupDownload();
  const [storageError, setStorageError] = useState("");
  return (
    <div
      className="mt-4 grid gap-5 lg:grid-cols-2"
      data-testid="vault-settings"
      id="vault-settings"
    >
      <section className="clip-panel border border-[#383838] bg-[#242424] p-6">
        <PanelTitle
          icon={<Download size={15} />}
          eyebrow={t("vault.settings.recoveryEyebrow")}
          title={t("vault.settings.backupTitle")}
        />
        <p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">
          {t("vault.settings.backupDescription")}
        </p>
        {backupError && (
          <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
            {backupError}
          </p>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              setBackupBusy(true);
              prepare(await exportVault(unlocked));
              setBackupError("");
            } catch (downloadError) {
              setBackupError(vaultErrorMessage(downloadError));
            } finally {
              setBackupBusy(false);
            }
          }}
          disabled={backupBusy}
          className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#7fb069]/45 bg-[#7fb069]/5 font-mono-d text-[10px] text-[#9fc68f] disabled:opacity-50"
        >
          <Download size={13} /> {t("vault.settings.exportJson")}
        </button>
        <BackupDownloadLink download={download} />
        <div className="mt-5">
          <ImportVaultPanel
            existing
            expectedMeta={unlocked.meta}
            onImport={onImport}
            nested
          />
        </div>
      </section>
      <div className="space-y-5">
        <section className="clip-panel border border-[#383838] bg-[#242424] p-6">
          <PanelTitle
            icon={<HardDrive size={15} />}
            eyebrow={t("vault.settings.browserStorageEyebrow")}
            title={storage.persistent
              ? t("vault.settings.evictionGranted")
              : t("vault.settings.bestEffort")}
            tone={storage.persistent ? "good" : "warn"}
          />
          <p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">
            {t("vault.settings.storageDescription")}
          </p>
          {storageError && (
            <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
              {storageError}
            </p>
          )}
          {!storage.persistent && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await onStorage();
                  setStorageError("");
                } catch (persistenceError) {
                  setStorageError(vaultErrorMessage(persistenceError));
                }
              }}
              className="mt-4 border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba]"
            >
              {t("vault.settings.requestProtection")}
            </button>
          )}
          <p className="mt-3 font-mono-d text-[8.5px] text-[#635d5a]">
            {formatStorage(storage, t)}
          </p>
        </section>
        <ChangePassphrasePanel unlocked={unlocked} onMeta={onMeta} />
        <DeleteVaultPanel onDelete={onDelete} />
      </div>
    </div>
  );
}

function ChangePassphrasePanel({
  unlocked,
  onMeta,
}: {
  unlocked: UnlockedVault;
  onMeta: (meta: VaultMeta) => void;
}) {
  const { t } = useI18n();
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
    <form
      onSubmit={submit}
      className="clip-panel border border-[#383838] bg-[#242424] p-6"
    >
      <PanelTitle
        icon={<KeyRound size={15} />}
        eyebrow={t("vault.settings.keyControlEyebrow")}
        title={t("vault.settings.changePassphraseTitle")}
      />
      <PasswordField
        label={t("vault.field.currentPassphrase")}
        value={current}
        onChange={setCurrent}
      />
      <PasswordField label={t("vault.field.newPassphrase")} value={next} onChange={setNext} />
      <PasswordField
        label={t("vault.field.confirmNewPassphrase")}
        value={confirmation}
        onChange={setConfirmation}
      />
      {error && (
        <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={
          busy ||
          current.length < 12 ||
          next.length < 12 ||
          next !== confirmation
        }
        className="mt-4 border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba] disabled:opacity-40"
      >
        {busy ? t("vault.settings.rewrapping") : t("vault.settings.rewrap")}
      </button>
    </form>
  );
}

function RecoveryPanel({
  meta,
  onRecover,
}: {
  meta: VaultMeta;
  onRecover: (vault: UnlockedVault & { recoverySecret: string }) => void;
}) {
  const { t } = useI18n();
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
    <form
      onSubmit={submit}
      className="clip-panel border border-[#7fb069]/30 bg-[#20251f] p-5"
    >
      <PanelTitle
        icon={<ArchiveRestore size={15} />}
        eyebrow={t("vault.recovery.lostEyebrow")}
        title={t("vault.recovery.useCodeTitle")}
        tone="good"
      />
      <Field
        label={t("vault.field.recoveryCode")}
        value={secret}
        onChange={setSecret}
        placeholder="CSV1-…"
        autoComplete="off"
      />
      <PasswordField label={t("vault.field.newPassphrase")} value={next} onChange={setNext} />
      <PasswordField
        label={t("vault.field.confirmNewPassphrase")}
        value={confirmation}
        onChange={setConfirmation}
      />
      <p className="mt-3 text-[11px] leading-relaxed text-[#7f7972]">
        {t("vault.recovery.rotates")}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !secret || next.length < 12 || next !== confirmation}
        className="mt-4 flex min-h-[42px] items-center justify-center gap-2 border border-[#7fb069]/45 px-4 font-mono-d text-[9.5px] text-[#9fc68f] disabled:opacity-35"
      >
        <ArchiveRestore size={12} />{" "}
        {busy ? t("vault.recovery.recovering") : t("vault.recovery.recoverRotate")}
      </button>
    </form>
  );
}

function BackupRecoveryPanel({
  onRecover,
}: {
  onRecover: (vault: UnlockedVault & { recoverySecret: string }) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [secret, setSecret] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !secret || next.length < 12 || next !== confirmation || busy)
      return;
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
    <form
      onSubmit={submit}
      className="clip-panel border border-[#7fb069]/30 bg-[#20251f] p-6 sm:p-8 lg:col-span-2"
    >
      <PanelTitle
        icon={<ArchiveRestore size={15} />}
        eyebrow={t("vault.backupRecovery.eyebrow")}
        title={t("vault.backupRecovery.title")}
        tone="good"
      />
      <p className="mt-4 max-w-[820px] text-[12.5px] leading-relaxed text-[#9a938a]">
        {t("vault.backupRecovery.description")}
      </p>
      <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-[#4a4642] px-4 py-4 font-mono-d text-[9.5px] text-[#9a938a] hover:text-[#e9e0d1]">
        <Upload size={13} /> {file ? file.name : t("vault.common.selectJson")}
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="sr-only"
          aria-label={t("vault.backupRecovery.fileAria")}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <Field
          label={t("vault.field.backupRecoveryCode")}
          value={secret}
          onChange={setSecret}
          placeholder="CSV1-…"
          autoComplete="off"
        />
        <PasswordField
          label={t("vault.field.newBackupPassphrase")}
          value={next}
          onChange={setNext}
        />
        <PasswordField
          label={t("vault.field.confirmNewBackupPassphrase")}
          value={confirmation}
          onChange={setConfirmation}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={
          !file || !secret || next.length < 12 || next !== confirmation || busy
        }
        className="mt-5 flex min-h-[44px] items-center justify-center gap-2 border border-[#7fb069]/45 px-5 font-mono-d text-[9.5px] text-[#9fc68f] disabled:opacity-35"
      >
        <ArchiveRestore size={12} />{" "}
        {busy ? t("vault.backupRecovery.authenticating") : t("vault.backupRecovery.submit")}
      </button>
    </form>
  );
}

function RecoverySecretPanel({
  secret,
  onDone,
}: {
  secret: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const download = () => {
    const blob = new Blob(
      [
        `${t("vault.recoverySecret.downloadTitle")}\n\n`,
        `${secret}\n\n`,
        `${t("vault.recoverySecret.downloadNote")}\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `opsis-vault-recovery-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <section
      className="clip-panel mt-8 border border-[#e0a96d]/55 bg-[#e0a96d]/8 p-6 sm:p-8"
      data-testid="vault-recovery-secret"
    >
      <PanelTitle
        icon={<KeyRound size={15} />}
        eyebrow={t("vault.recoverySecret.eyebrow")}
        title={t("vault.recoverySecret.title")}
        tone="warn"
      />
      <p className="mt-4 max-w-[780px] text-[12.5px] leading-relaxed text-[#9a938a]">
        {t("vault.recoverySecret.description")}
      </p>
      <div
        className="mt-5 break-all border border-[#e0a96d]/35 bg-[#171717] p-4 font-mono-d text-[11px] leading-relaxed text-[#e6c493]"
        data-testid="recovery-code"
      >
        {secret}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
              setCopyFailed(false);
            } catch {
              setCopyFailed(true);
            }
          }}
          className="border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba]"
        >
          {copied
            ? t("vault.recoverySecret.copied")
            : copyFailed
              ? t("vault.recoverySecret.copyBlocked")
              : t("vault.recoverySecret.copy")}
        </button>
        <button
          type="button"
          onClick={download}
          className="border border-[#383838] px-4 py-3 font-mono-d text-[9.5px] text-[#d6ccba]"
        >
          {t("vault.recoverySecret.download")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border border-[#e0a96d]/45 px-4 py-3 font-mono-d text-[9.5px] text-[#e6c493]"
        >
          {t("vault.recoverySecret.saved")}
        </button>
      </div>
    </section>
  );
}

function ImportVaultPanel({
  existing,
  expectedMeta,
  onImport,
  nested = false,
}: {
  existing: boolean;
  expectedMeta: VaultMeta | null;
  onImport: (unlocked: UnlockedVault) => void;
  nested?: boolean;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !file ||
      passphrase.length < 12 ||
      (existing && replacement !== t("vault.import.replacePhrase")) ||
      busy
    )
      return;
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
    <form
      onSubmit={submit}
      className={
        nested
          ? "border-t border-[#383838] pt-5"
          : "clip-panel border border-[#383838] bg-[#242424] p-6 sm:p-8"
      }
    >
      <PanelTitle
        icon={<ArchiveRestore size={15} />}
        eyebrow={t("vault.import.eyebrow")}
        title={nested ? t("vault.import.titleNested") : t("vault.import.title")}
      />
      {!nested && (
        <p className="mt-4 text-[12.5px] leading-relaxed text-[#9a938a]">
          {t("vault.import.description")}
        </p>
      )}
      <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-[#4a4642] px-4 py-4 font-mono-d text-[9.5px] text-[#9a938a] hover:text-[#e9e0d1]">
        <Upload size={13} /> {file ? file.name : t("vault.common.selectJson")}
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="sr-only"
          aria-label={t("vault.import.fileAria")}
        />
      </label>
      <PasswordField
        label={t("vault.field.backupPassphrase")}
        value={passphrase}
        onChange={setPassphrase}
      />
      {existing && (
        <Field
          label={t("vault.import.typeReplace", { phrase: t("vault.import.replacePhrase") })}
          value={replacement}
          onChange={setReplacement}
          placeholder={t("vault.import.replacePhrase")}
        />
      )}
      {error && (
        <p role="alert" className="mt-3 text-[11px] text-[#e0738a]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={
          !file ||
          busy ||
          passphrase.length < 12 ||
          (existing && replacement !== t("vault.import.replacePhrase"))
        }
        className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#383838] bg-[#202020] font-mono-d text-[10px] text-[#d6ccba] disabled:opacity-40"
      >
        <ArchiveRestore size={13} />{" "}
        {busy
          ? t("vault.import.verifying")
          : existing
            ? t("vault.import.verifyReplace")
            : t("vault.import.verifyRestore")}
      </button>
    </form>
  );
}

function DeleteVaultPanel({
  onDelete,
  compact = false,
}: {
  onDelete: () => Promise<void>;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section
      className={`clip-panel border border-[#e0738a]/35 bg-[#e0738a]/5 ${compact ? "p-5" : "p-6"}`}
    >
      <PanelTitle
        icon={<Trash2 size={15} />}
        eyebrow={t("vault.delete.eyebrow")}
        title={t("vault.delete.title")}
        tone="danger"
      />
      <p className="mt-4 text-[12px] leading-relaxed text-[#9a938a]">
        {t("vault.delete.description")}
      </p>
      <Field
        label={t("vault.delete.typePhrase", { phrase: t("vault.delete.phrase") })}
        value={phrase}
        onChange={setPhrase}
        placeholder={t("vault.delete.phrase")}
      />
      <button
        type="button"
        disabled={phrase !== t("vault.delete.phrase") || busy}
        onClick={async () => {
          setBusy(true);
          await onDelete();
          setBusy(false);
        }}
        className="mt-4 flex min-h-[42px] items-center justify-center gap-2 border border-[#e0738a]/45 px-4 font-mono-d text-[9.5px] text-[#e0738a] disabled:opacity-35"
      >
        <Trash2 size={12} /> {busy ? t("vault.delete.deleting") : t("vault.delete.submit")}
      </button>
    </section>
  );
}

function VaultLoading() {
  const { t } = useI18n();
  return (
    <div className="scan-panel mt-8 flex min-h-[260px] items-center justify-center overflow-hidden border border-[#383838] bg-[#242424] font-mono-d text-[10px] tracking-[0.15em] text-[#7fb069]">
      {t("vault.loading")}
    </div>
  );
}

function VaultDeleting() {
  const { t } = useI18n();
  return (
    <section className="scan-panel mt-8 flex min-h-[280px] flex-col items-center justify-center overflow-hidden border border-[#e0a96d]/35 bg-[#242424] px-6 text-center">
      <HardDrive size={24} className="text-[#e0a96d]" />
      <h2 className="mt-5 text-[22px] font-medium text-[#f0e8da]">
        {t("vault.deleting.title")}
      </h2>
      <p className="mt-3 max-w-[620px] text-[12.5px] leading-relaxed text-[#9a938a]">
        {t("vault.deleting.description")}
      </p>
    </section>
  );
}

function UnsupportedState() {
  const { t } = useI18n();
  return (
    <section className="clip-panel mt-8 border border-[#e0738a]/40 bg-[#e0738a]/5 p-7">
      <PanelTitle
        icon={<LockKeyhole size={15} />}
        eyebrow={t("vault.unsupported.eyebrow")}
        title={t("vault.unsupported.title")}
        tone="danger"
      />
      <p className="mt-4 max-w-[720px] text-[13px] leading-relaxed text-[#9a938a]">
        {t("vault.unsupported.description")}
      </p>
    </section>
  );
}

function PanelTitle({
  icon,
  eyebrow,
  title,
  tone = "default",
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  const color =
    tone === "good"
      ? "text-[#7fb069]"
      : tone === "danger"
        ? "text-[#e0738a]"
        : tone === "warn"
          ? "text-[#e0a96d]"
          : "text-[#fa6c34]";
  return (
    <div>
      <div
        className={`flex items-center gap-2.5 font-mono-d text-[9.5px] tracking-[0.15em] ${color}`}
      >
        {icon} {eyebrow}
      </div>
      <h2 className="mt-3 text-[23px] font-medium tracking-[-0.025em] text-[#f0e8da]">
        {title}
      </h2>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      type="password"
      autoComplete="off"
      maxLength={256}
      autoFocus={autoFocus}
    />
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength,
  required,
  inputMode,
  pattern,
  autoComplete,
  autoFocus,
  disabled,
  flush = false,
}: {
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
  disabled?: boolean;
  flush?: boolean;
}) {
  const { t } = useI18n();
  const [validationError, setValidationError] = useState("");
  const validationId = useId();
  return (
    <label className={flush ? "block" : "mt-4 block"}>
      <span className="font-mono-d text-[9px] tracking-[0.13em] text-[#635d5a]">
        {label}
      </span>
      <input
        aria-label={label}
        aria-invalid={validationError ? true : undefined}
        aria-describedby={validationError ? validationId : undefined}
        type={type}
        value={value}
        onChange={(event) => {
          event.target.setCustomValidity("");
          setValidationError("");
          onChange(event.target.value);
        }}
        onInvalid={(event) => {
          if (inputMode === "decimal" && event.currentTarget.validity.patternMismatch) {
            const message = t("vault.field.decimalError");
            event.currentTarget.setCustomValidity(message);
            setValidationError(message);
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        inputMode={inputMode}
        pattern={pattern}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[11px] text-[#e9e0d1] outline-none placeholder:text-[#4f4a46] focus:border-[#fa6c34] disabled:opacity-50"
      />
      {validationError && <span id={validationId} role="alert" className="mt-2 block text-xs text-[#e0738a]">{validationError}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="font-mono-d text-[9px] tracking-[0.13em] text-[#635d5a]">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 min-h-[44px] w-full border border-[#383838] bg-[#1d1d1d] px-4 font-mono-d text-[11px] text-[#e9e0d1] outline-none focus:border-[#fa6c34] disabled:opacity-50"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrivacyTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="bg-[#202020] p-4">
      <p className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">
        {label}
      </p>
      <p
        className={`mt-3 font-mono-d text-[9.5px] tracking-wider ${tone === "good" ? "text-[#7fb069]" : tone === "warn" ? "text-[#e0a96d]" : "text-[#d6ccba]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-[#202020] p-4 sm:p-5">
      <p className="font-mono-d text-[8.5px] tracking-[0.14em] text-[#635d5a]">
        {label}
      </p>
      <p className="mt-3 text-[24px] font-medium text-[#f0e8da]">{value}</p>
      {note && (
        <p className="mt-1 font-mono-d text-[8px] text-[#635d5a]">{note}</p>
      )}
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#202020] p-3">
      <p className="font-mono-d text-[7.5px] tracking-wider text-[#635d5a]">
        {label}
      </p>
      <p
        title={value}
        className="mt-2 truncate font-mono-d text-[10px] text-[#d6ccba]"
      >
        {value}
      </p>
    </div>
  );
}

function assetToDraft(asset: VaultAsset): VaultAssetDraft {
  return {
    name: asset.name,
    assetType: asset.assetType,
    identifier: asset.identifier,
    lots: asset.lots.map((lot) => ({ ...lot })),
    notes: asset.notes,
    ...(asset.photo ? { photo: asset.photo } : {}),
    ...(asset.assetType === "collectible"
      ? {
          collectible:
            asset.collectible ??
            manualCollectibleDetails(asset.photo ? asset.updatedAt : null),
        }
      : {}),
  };
}

function formatStorage(storage: VaultStorageStatus, t: Translate): string {
  if (storage.usage === null || storage.quota === null)
    return storage.persistent ? t("vault.settings.persistent") : t("vault.settings.estimateUnavailable");
  return t("vault.settings.storageUsage", { used: formatBytes(storage.usage), quota: formatBytes(storage.quota) });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
