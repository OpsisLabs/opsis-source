export const feed = {
  "feed.views": "Watch views",
  "feed.walletDetails": "Wallet details",
  "feed.open": "Activity feed",
  "feed.badge": "YOUR WATCHLIST · ONE FEED",
  "feed.title": "All your wallets. One view.",
  "feed.intro":
    "Review saved transactions across the wallets you follow. Filter the noise, then open the evidence. No extra lookups to browse this feed.",
  "feed.transactions": "Distinct saved transactions",
  "feed.wallets": "Watched wallets",
  "feed.coverage": "Saved checks, not a live stream",
  "feed.limits":
    "Combines the latest three saved checks per wallet, with up to 10 transactions per check. A shared transaction appears once, with each wallet’s perspective. Wallets may have different capture times. Old entries can leave this feed when checks rotate. Refresh a wallet from Wallet details; nothing polls in the background. Transfers are not proof of buys or sells, and an empty feed is not proof of no activity. Blocks are not finalized.",
  "feed.walletFilter": "Filter by wallet",
  "feed.typeFilter": "Filter by asset type",
  "feed.allWallets": "All watched wallets",
  "feed.kind.all": "All transactions",
  "feed.kind.native": "ETH movements",
  "feed.kind.tokens": "Token movements",
  "feed.kind.nfts": "NFT movements",
  "feed.search": "Search token, contract or transaction",
  "feed.showing": "Showing {count} of {total} matching transactions",
  "feed.reset": "Clear filters",
  "feed.empty": "Nothing to show in this view yet.",
  "feed.noMatch":
    "Try another wallet or asset type, or clear your search. Filters only inspect decoded saved evidence.",
  "feed.noEvidence":
    "Add a wallet or refresh an existing one to save available public activity. Missing provider data does not mean no activity.",
  "feed.timeUnknown": "Time unavailable",
  "feed.seenIn": "{count} wallet view(s)",
  "feed.conflict":
    "Saved observations disagree about this transaction or block. Review the source before drawing conclusions; this may reflect a reorganization or provider inconsistency.",
  "feed.discovery.baseline": "Already present in the first retained check",
  "feed.discovery.later":
    "First observed in a later check · after its previous block",
  "feed.discovery.older": "Older transaction discovered in a later check",
  "feed.failed":
    "Transaction failed. No successful asset movement is inferred; network fees may still apply.",
  "feed.noMovements":
    "No decoded asset movements were returned for this transaction.",
  "feed.details": "Details & full identifiers",
  "feed.captured": "Last observed {time} · captured block {block}",
  "feed.partial":
    "This observation has incomplete movement or provider coverage. The displayed movements may not explain the entire transaction.",
  "feed.partialShort": "Partial saved evidence · see details",
  "feed.more": "Show 12 more transactions",
} as const;
