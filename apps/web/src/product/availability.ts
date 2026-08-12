export type ProductBuildFlags = {
  collectibleCatalog: string | undefined;
  marketInventory: string | undefined;
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
  };
}

function currentAvailability() {
  return productAvailability({
    collectibleCatalog: import.meta.env.VITE_COLLECTIBLE_CATALOG_ENABLED,
    marketInventory: import.meta.env.VITE_MARKET_INVENTORY_ENABLED,
    development: import.meta.env.DEV,
  });
}

export function isCollectibleCatalogEnabled() {
  return currentAvailability().collectibleCatalog;
}

export function isMarketInventoryEnabled() {
  return currentAvailability().marketInventory;
}

export function isProductFeatureEnabled(id: string) {
  if (id === "collectible-catalog") return isCollectibleCatalogEnabled();
  if (id === "market-inventory") return isMarketInventoryEnabled();
  return true;
}
