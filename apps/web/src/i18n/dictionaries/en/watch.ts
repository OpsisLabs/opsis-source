export const watch = {
  "watch.title": "Scout Watch",
  "watch.headline": "Follow wallets. Catch the changes.",
  "watch.intro":
    "Keep a private watchlist of Robinhood Chain wallets. Check again to see what changed—not another wall of numbers.",
  "watch.badge": "READ-ONLY · ON DEMAND",
  "watch.step1": "Save a wallet",
  "watch.step2": "Check again later",
  "watch.step3": "See what changed",
  "watch.accessTitle": "Your watchlist, kept private",
  "watch.accessBody":
    "Labels and the latest three checks per wallet are encrypted in your Vault on this device. No account or wallet connection needed.",
  "watch.passphrase": "Vault passphrase",
  "watch.confirmPassphrase": "Confirm passphrase",
  "watch.create": "Create encrypted watchlist",
  "watch.unlock": "Unlock watchlist",
  "watch.checking": "Checking this device…",
  "watch.lock": "Lock watchlist",
  "watch.backup": "Export encrypted backup",
  "watch.backupReady": "Encrypted backup ready. Keep it somewhere safe.",
  "watch.manageVault": "Restore a backup or manage your Vault",
  "watch.storageNote":
    "Local-only: use this same browser and site. Clearing site data or browser eviction can remove it. Export backups. Locks when you leave the tab or after 10 minutes idle.",
  "watch.recoveryTitle": "Save your recovery key",
  "watch.recoveryBody":
    "Store this privately before continuing. It can unlock your encrypted backup if you forget the passphrase. We cannot recover it for you.",
  "watch.recoverySaved": "I saved my recovery key",
  "watch.add": "Add a wallet to watch",
  "watch.address": "Public Robinhood wallet address",
  "watch.label": "Private label (optional)",
  "watch.sample": "Use a public example",
  "watch.sampleLabel": "Public example · not a verified identity",
  "watch.save": "Save wallet & check",
  "watch.disclosure":
    "This check sends only the public address to ChainScout, Robinhood Public RPC and Blockscout. Private labels and saved history stay on this device. No AI model, signing or background polling.",
  "watch.consent": "Allow this public-address lookup",
  "watch.working": "Checking and encrypting…",
  "watch.savedBaseline":
    "Baseline saved. Refresh later to compare a newer block.",
  "watch.savedRefresh": "New check saved. Your comparison is ready.",
  "watch.renamed": "Private label updated on this device.",
  "watch.removed":
    "Wallet removed from this watchlist. Existing exported backups are unchanged.",
  "watch.list": "Your watchlist",
  "watch.count": "{count} / 10 wallets",
  "watch.empty": "Start with one wallet you want to keep an eye on.",
  "watch.emptyDetail":
    "A first check saves the baseline. Come back and refresh to reveal the differences.",
  "watch.refresh": "Refresh public data",
  "watch.rename": "Rename locally",
  "watch.renameLabel": "Private wallet label",
  "watch.remove": "Remove wallet",
  "watch.confirmRemove":
    "Remove this wallet and its saved checks from this device? Your other Vault records are untouched.",
  "watch.confirmDelete": "Yes, remove wallet",
  "watch.cancel": "Cancel",
  "watch.latest": "Latest saved check",
  "watch.before": "Before",
  "watch.after": "After",
  "watch.block": "Block {block}",
  "watch.blockNote":
    "Rechecked current blocks, not finalized. Later reorganizations can still change the evidence.",
  "watch.compare": "What changed?",
  "watch.baseline": "Baseline saved",
  "watch.baselineBody":
    "One check is a starting point, not a trend. Refresh after a newer block is available to compare balances and newly observed activity.",
  "watch.compareWith": "Compare latest with",
  "watch.changed": "Confirmed balance changes",
  "watch.observed": "Newly observed transactions",
  "watch.unknown": "Not comparable",
  "watch.balances": "Balance comparison",
  "watch.asset": "Asset / exact identifier",
  "watch.delta": "Difference",
  "watch.status.changed": "Balance changed",
  "watch.status.unchanged": "Unchanged in these checks",
  "watch.status.newly-observed": "Newly observed—not a proven purchase",
  "watch.status.unavailable": "Not returned—not a confirmed exit",
  "watch.status.metadata-changed": "Decimals changed—cannot compare",
  "watch.notReturned": "Not returned",
  "watch.currentHoldings": "Holdings returned in this check",
  "watch.activity": "Newly observed activity",
  "watch.noActivity":
    "No additional transactions appeared in the returned sample. This does not prove there was no activity.",
  "watch.afterBaseline": "After baseline block",
  "watch.olderDiscovered": "Older transaction, newly discovered",
  "watch.tx.success": "Succeeded",
  "watch.tx.failed": "Failed",
  "watch.flow.in": "Incoming",
  "watch.flow.out": "Outgoing",
  "watch.flow.self": "Self-transfer",
  "watch.flow.mixed": "Mixed activity",
  "watch.txLink": "Open transaction evidence",
  "watch.addressLink": "Open address evidence",
  "watch.explore": "Explain this wallet",
  "watch.coverage": "What this check covers",
  "watch.partialTitle": "Partial coverage",
  "watch.partialBody": "Some holdings or activity may be missing. An empty section is not a zero-balance or no-activity finding. Compare the verified entries below and review the source limits.",
  "watch.coverageBody":
    "This is a bounded snapshot comparison, not a complete activity feed. At most 10 tokens, 10 NFT entries and 10 transactions are checked per snapshot. Transfers do not establish buys, sells, profit, ownership identity or safety.",
  "watch.coverageGaps":
    "The provider reported gaps or limits. Original provider detail:",
  "watch.history": "Recent saved checks",
  "watch.retention":
    "Keeps the latest three checks per wallet. Refresh is manual; no alerts run while the site is closed.",
  "watch.sourceCount": "Source evidence ({count})",
  "watch.error.invalidRecord":
    "This encrypted Watch record is invalid or damaged. Restore an intact backup.",
  "watch.error.order": "These snapshots cannot be compared in this order.",
  "watch.error.invalidSnapshot":
    "The returned snapshot could not be verified. Your saved checks were not changed.",
  "watch.error.stale":
    "The provider returned an old or future-dated snapshot. Your saved baseline is unchanged; try again later.",
  "watch.error.older":
    "The provider returned an older block. Your latest saved check was kept.",
  "watch.error.reorg":
    "The same block now has a different hash. Possible chain reorganization; no comparison was saved. Wait for a newer block and refresh.",
  "watch.error.sameBlock":
    "This is still the same block. Your saved checks are unchanged. Try again after a newer block.",
  "watch.error.duplicateOrLimit":
    "That address is already watched, or your 10-wallet limit is reached. Select the existing wallet or remove one first.",
  "watch.error.label": "Enter a private label of up to 80 characters.",
  "watch.error.address":
    "Enter a valid 0x wallet address on Robinhood Chain. Mixed-case addresses must have a valid checksum.",
  "watch.error.confirm":
    "Passphrases must match and contain at least 12 characters.",
  "watch.error.vaultChanged":
    "Your Vault changed in another tab. Unlock the latest copy before continuing.",
  "watch.error.storage":
    "Local encrypted storage is unavailable. Check browser storage permissions and try again.",
  "watch.error.locked": "Watchlist locked before the operation finished.",
  "watch.error.refresh":
    "This check could not finish. Existing saved snapshots were kept; try again later.",
  "watch.error.disabled":
    "Scout Watch is temporarily unavailable. Your encrypted watchlist is unchanged.",
  "watch.metadata.title": "Scout Watch | Private wallet watchlist | ChainScout",
  "watch.metadata.description":
    "Save Robinhood Chain wallets privately and compare exact balance changes and newly observed activity between on-demand checks.",
  "product.feature.scout-watch.label": "Scout Watch",
  "product.feature.scout-watch.shortLabel": "Watchlist",
  "product.feature.scout-watch.helpLabel": "About Scout Watch",
  "product.feature.scout-watch.eyebrow": "PRIVATE WATCHLIST · ON DEMAND",
  "product.feature.scout-watch.navHint": "See what changed in a wallet",
  "product.feature.scout-watch.summary":
    "Save wallets locally, compare changes, browse a combined activity feed and find shared token holdings.",
  "product.feature.scout-watch.bestFor":
    "Returning to wallets you follow without reconstructing the last view.",
  "product.feature.scout-watch.privacy":
    "Labels and three snapshots per wallet are encrypted in your local Vault. Only the public address is sent on an approved refresh.",
  "product.feature.scout-watch.boundary":
    "Manual, bounded, non-final checks. Not continuous alerts, trade attribution, profit tracking or a safety verdict.",
  "product.feature.scout-watch.step.1":
    "Create or unlock your encrypted watchlist directly on the Watch page.",
  "product.feature.scout-watch.step.2":
    "Paste a Robinhood wallet address, review the public lookup and save a baseline.",
  "product.feature.scout-watch.step.3":
    "Refresh later to compare exact balances, or open Activity feed and Wallet overlap to explore your saved checks together.",
  "product.feature.scout-watch.step.4":
    "Export an encrypted backup; your watchlist is local to this browser and site.",
} as const;
