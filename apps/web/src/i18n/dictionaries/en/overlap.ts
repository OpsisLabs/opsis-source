export const overlap = {
  "overlap.open": "Wallet overlap",
  "overlap.badge": "EXACT CONTRACTS · SHARED HOLDINGS",
  "overlap.title": "What do your wallets have in common?",
  "overlap.intro":
    "Choose wallets from your watchlist. See which tokens have positive balances in at least two of their latest saved checks—without another lookup.",
  "overlap.shared": "Shared token contracts",
  "overlap.selected": "Selected wallets",
  "overlap.boundary":
    "Saved checks may have different timestamps. Shared holdings do not prove purchases, coordination, common ownership or token quality.",
  "overlap.partial":
    "Some selected checks have limited coverage. An unlisted token or wallet is not a confirmed zero balance.",
  "overlap.choose": "Choose wallets to compare",
  "overlap.selectAll": "Select all wallets",
  "overlap.clear": "Clear selection",
  "overlap.search": "Search shared token or exact contract",
  "overlap.count": "{count} matching shared token contract(s)",
  "overlap.needTwo": "Choose at least two saved wallets.",
  "overlap.needTwoBody":
    "Add wallets in Wallet details, save their checks, then select the ones you want to compare here.",
  "overlap.empty": "No shared tokens found in these checks.",
  "overlap.emptyBody":
    "Only positive ERC20 balances returned in the selected snapshots are compared. Limited provider coverage can hide an overlap; this is not proof that none exists.",
  "overlap.noMatch":
    "Try a different token name or contract, or clear the search.",
  "overlap.heldBy": "{count} of {total} selected wallets",
  "overlap.incompatible":
    "These observations disagree on token decimals or a same-height block hash. Quantities are shown as saved, not combined; inspect the source and refresh before comparing.",
  "overlap.change.changed": "balance change",
  "overlap.change.unchanged": "unchanged between checks",
  "overlap.change.baseline": "first check · no comparison yet",
  "overlap.change.missing": "not returned previously · change unknown",
  "overlap.change.metadata": "decimals changed · not comparable",
  "overlap.since": "Compared with {time}",
  "overlap.how": "How this comparison works",
  "overlap.method":
    "Matches exact ERC20 contracts on Robinhood Chain, never names or symbols. Native ETH and NFTs are excluded. Uses only each selected wallet’s latest saved check (up to 10 returned token entries), with its previous check for exact quantity changes where available. Missing tokens are not treated as zero. Quantities are not summed across wallets or valued as profit. Refresh wallets individually from Wallet details. Blocks are non-final; labels and checks remain encrypted on this device.",
} as const;
