export const trades = {
  "trades.metadata.title": "Big trades | ChainScout",
  "trades.metadata.description":
    "Observe the largest recent signed Uniswap V3 Swap amounts in one factory-verified pool over a bounded block window.",

  "trades.page.eyebrow": "Big trades",
  "trades.page.title": "Big trades",
  "trades.page.intro":
    "Choose the default WETH/USDG pair or one token contract. After your click, ChainScout reads a bounded recent block window from the dRPC Robinhood Chain gateway and ranks signed Uniswap V3 Swap amounts from that one pool. Nothing is fetched automatically and no wallet connects.",

  "trades.form.tokenLabel": "Token contract (optional)",
  "trades.form.tokenPlaceholder": "0x… — leave blank for WETH/USDG",
  "trades.form.tokenHint":
    "A valid address is paired against WETH. WETH/USDG is the default pair.",
  "trades.form.feeLabel": "Verified pool fee",
  "trades.form.feeAuto": "First factory-verified tier",
  "trades.form.feeOption": "Fee {fee} ({pct}%)",
  "trades.form.windowLabel": "Recent window",
  "trades.form.windowOption": "Last {blocks} blocks",

  "trades.consent.title": "Public-address disclosure",
  "trades.consent.body":
    "Clicking once sends the public token contract, the factory-derived pool address, and the bounded block window to the dRPC Robinhood Chain gateway. dRPC is a paid gateway that may route each read to an independent node operator in its network. No wallet, Vault, note, or AI data is sent. ChainScout does not fetch before you click and never signs or trades.",
  "trades.consent.button": "OBSERVE RECENT SWAPS",
  "trades.consent.loading": "OBSERVING…",

  "trades.disabled.title": "Big trades unavailable",
  "trades.disabled.body":
    "This build has the observed-trades feature off. Nothing was requested and no provider was called.",

  "trades.error.title": "The observation did not complete",
  "trades.error.generic": "The bounded observation failed; try again.",
  "trades.error.retry": "TRY AGAIN",

  "trades.empty.title": "No swaps matched in this window",
  "trades.empty.body":
    "The verified pool had no Swap events in the observed block range. This is an empty window, not a zero-value trade and not an all-day total.",

  "trades.result.pairLabel": "Observed pair",
  "trades.result.poolLabel": "Factory-verified pool",
  "trades.result.windowLabel": "Exact window (blocks {from}–{to})",
  "trades.result.windowValue": "{fromTime} → {toTime}",
  "trades.result.scannedLabel": "Logs scanned / matched",
  "trades.result.scannedValue": "{scanned} scanned · {matched} matched · cap {cap}",
  "trades.result.methodLabel": "Classification",
  "trades.result.methodValue":
    "Signed Uniswap V3 Swap amounts only — token transfers were not used.",
  "trades.result.rpcLabel": "RPC units used",
  "trades.result.notes": "Window notes",
  "trades.summary.observed": "{count} observed swaps, largest first.",
  "trades.summary.empty": "No observed swaps in this window.",

  "trades.table.caption": "Observed swaps, largest quote notional first",
  "trades.table.side": "Side",
  "trades.table.base": "Base amount",
  "trades.table.quote": "Quote amount",
  "trades.table.notional": "Quote notional",
  "trades.table.tx": "Transaction",
  "trades.table.sender": "Transaction sender",
  "trades.table.eventSender": "Event sender (not necessarily the owner)",
  "trades.table.eventRecipient": "Event recipient (not necessarily the trader)",
  "trades.table.follow": "Follow this public address",
  "trades.table.viewTx": "View transaction",
  "trades.table.viewAddress": "View address",

  "trades.side.buy": "BUY BASE",
  "trades.side.sell": "SELL BASE",
  "trades.sender.eoa": "verified EOA",
  "trades.sender.contract": "contract address",
  "trades.sender.unknown": "unclassified",

  "trades.limitations.title": "What this does not claim",
  "trades.privacy.label": "Privacy receipt",

  "product.feature.biggest-trades.label": "Big trades",
  "product.feature.biggest-trades.shortLabel": "Big trades",
  "product.feature.biggest-trades.helpLabel": "About Big trades",
  "product.feature.biggest-trades.eyebrow": "BOUNDED WINDOW · ONE VERIFIED POOL",
  "product.feature.biggest-trades.navHint": "Compare largest observed swaps",
  "product.feature.biggest-trades.summary":
    "Observe the largest recent signed Uniswap V3 Swap amounts in one factory-verified pool over a bounded recent block window.",
  "product.feature.biggest-trades.bestFor":
    "Checking what actually swapped in one exact pool without a chain-wide, all-venue, or all-day claim.",
  "product.feature.biggest-trades.privacy":
    "Only the public token contract, the factory-derived pool, and the bounded block window are sent after you click. No wallet, Vault, or AI data.",
  "product.feature.biggest-trades.boundary":
    "A partial observation window, not a live feed, price, ranking of people, or profit signal. Each row is one signed Swap event that can coexist with flash loans and multi-hop routes.",
  "product.feature.biggest-trades.step.1":
    "Keep the default WETH/USDG pair or paste one token contract.",
  "product.feature.biggest-trades.step.2":
    "Review the public-address disclosure and click once to observe.",
  "product.feature.biggest-trades.step.3":
    "Inspect exact window timestamps, scanned counts, and largest signed buys/sells.",
  "product.feature.biggest-trades.step.4":
    "Follow only a verified public EOA sender through the Watch handoff.",
};
