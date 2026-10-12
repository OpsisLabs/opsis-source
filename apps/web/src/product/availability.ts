export type ProductBuildFlags = {
  collectibleCatalog: string | undefined;
  marketInventory: string | undefined;
  replayActions: string | undefined;
  openDataApi: string | undefined;
  development: boolean;
};

export function productAvailability(flags: ProductBuildFlags) {
  return {
    collectibleCatalog:
      flags.collectibleCatalog === "true" ||
      (flags.development && flags.collectibleCatalog !== "false"),
    marketInventory:
      flags.marketInventory === "true" ||
      (flags.development && flags.marketInventory !== "false"),
    replayActions:
      flags.replayActions === "true" ||
      (flags.development && flags.replayActions !== "false"),
    openDataApi:
      flags.openDataApi === "true" ||
      (flags.development && flags.openDataApi !== "false"),
  };
}

function currentAvailability() {
  return productAvailability({
    collectibleCatalog: import.meta.env.VITE_COLLECTIBLE_CATALOG_ENABLED,
    marketInventory: import.meta.env.VITE_MARKET_INVENTORY_ENABLED,
    replayActions: import.meta.env.VITE_REPLAY_ACTIONS_ENABLED,
    openDataApi: import.meta.env.VITE_OPEN_DATA_API_ENABLED,
    development: import.meta.env.DEV,
  });
}

export function isCollectibleCatalogEnabled() {
  return currentAvailability().collectibleCatalog;
}

export function isMarketInventoryEnabled() {
  return currentAvailability().marketInventory;
}

export function isReplayActionsEnabled() {
  return currentAvailability().replayActions;
}

export function isOpenDataApiEnabled() {
  return currentAvailability().openDataApi;
}

export function isProductFeatureEnabled(id: string) {
  if (id === "kol-tracker") return import.meta.env.VITE_KOL_TRACKER_ENABLED === "true";
  if (id === "portfolio-stress-test") return import.meta.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true";
  if (id === "situation-room") return import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true";
  if (id === "watch") return isWatchEnabled();
  if (id === "card-price-check") return import.meta.env.VITE_CARD_PRICE_CHECK_ENABLED === "true";
  if (id === "trade-simulator") return import.meta.env.VITE_TRADE_SIMULATOR_ENABLED === "true";
  if (id === "biggest-trades") return isObservedTradesEnabled();
  if (id === "exit-check") return isExitCheckEnabled();
  if (id === "approval-manager") return isApprovalManagerEnabled();
  if (id === "collectible-deal-finder") return isDealFinderEnabled();
  if (id === "collectible-catalog") return isCollectibleCatalogEnabled();
  if (id === "market-inventory") return isMarketInventoryEnabled();
  if (id === "replay-actions") return isReplayActionsEnabled();
  if (id === "open-data-api") return isOpenDataApiEnabled();
  return true;
}

export function isApprovalManagerEnabled() {
  return import.meta.env.VITE_APPROVAL_MANAGER_ENABLED === "true";
}

export function isExitCheckEnabled() {
  return import.meta.env.VITE_EXIT_CHECK_ENABLED === "true";
}

export function isDealFinderEnabled() { return import.meta.env.VITE_COLLECTIBLE_DEAL_FINDER_ENABLED === "true"; }
export function isObservedTradesEnabled() { return import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true"; }
export type VaultWorkspace = "assets" | "portfolio" | "collectibles" | "market" | "replay" | "approvals" | "deals";

type VaultAvailability = Pick<ReturnType<typeof productAvailability>, "collectibleCatalog" | "marketInventory" | "replayActions">;

export function vaultWorkspaceFromSearch(
  searchParams: URLSearchParams,
  availability: VaultAvailability = currentAvailability(),
): VaultWorkspace {
  const requested = searchParams.get("view");
  if (requested === "approvals" && isApprovalManagerEnabled()) return requested;
  if (requested === "deals" && isDealFinderEnabled()) return requested;
  if (requested === "portfolio") return requested;
  if (requested === "collectibles" && availability.collectibleCatalog)
    return requested;
  if (requested === "market" && availability.marketInventory) return requested;
  if (requested === "replay" && availability.replayActions) return requested;
  return "assets";
}

export function watchBuildEnabled(flags: { VITE_WATCH_ENABLED?: string }) {
  return flags.VITE_WATCH_ENABLED === "true";
}

export function isWatchEnabled() {
  return watchBuildEnabled({
    VITE_WATCH_ENABLED: import.meta.env.VITE_WATCH_ENABLED,
  });
}
