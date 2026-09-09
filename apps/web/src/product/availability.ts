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
  if (id === "collectible-deal-finder") return isDealFinderEnabled();
  if (id === "collectible-catalog") return isCollectibleCatalogEnabled();
  if (id === "market-inventory") return isMarketInventoryEnabled();
  if (id === "replay-actions") return isReplayActionsEnabled();
  if (id === "open-data-api") return isOpenDataApiEnabled();
  return true;
}

export function isDealFinderEnabled() { return import.meta.env.VITE_COLLECTIBLE_DEAL_FINDER_ENABLED === "true"; }
export type VaultWorkspace = "assets" | "portfolio" | "collectibles" | "market" | "replay" | "deals";

type VaultAvailability = Pick<ReturnType<typeof productAvailability>, "collectibleCatalog" | "marketInventory" | "replayActions">;

export function vaultWorkspaceFromSearch(
  searchParams: URLSearchParams,
  availability: VaultAvailability = currentAvailability(),
): VaultWorkspace {
  const requested = searchParams.get("view");
  if (requested === "deals" && isDealFinderEnabled()) return requested;
  if (requested === "portfolio") return requested;
  if (requested === "collectibles" && availability.collectibleCatalog)
    return requested;
  if (requested === "market" && availability.marketInventory) return requested;
  if (requested === "replay" && availability.replayActions) return requested;
  return "assets";
}
