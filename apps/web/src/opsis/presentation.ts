export const OPSIS_PRESENTATION =
  import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";

/** Rename controlled UI templates before interpolation; never alter user data. */
export function opsisTemplate(template: string) {
  return template
    .replace(/ChainScout/g, "Opsis")
    .replace(/CHAINSCOUT/g, "OPSIS")
    .replace(/Scout Watch/g, "Wallet watch")
    .replace(/Scout Swap/g, "Swap preview")
    .replace(/SCOUT WATCH/g, "WALLET WATCH")
    .replace(/SCOUT SWAP/g, "SWAP PREVIEW");
}
