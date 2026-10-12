import type { TranslateParams, TranslationKey } from "../i18n";

export type FeatureTranslate = (
  key: TranslationKey,
  params?: TranslateParams,
) => string;

export type ProductFeature = {
  id: string;
  group: "explore" | "vault" | "build";
  label: string;
  shortLabel: string;
  helpLabel: string;
  path: string;
  eyebrow: string;
  navHint: string;
  summary: string;
  bestFor: string;
  privacy: string;
  boundary: string;
  steps: string[];
};

export const PRODUCT_FEATURES: ProductFeature[] = [
  { id: "portfolio-stress-test", group: "explore", label: "Portfolio shocks", shortLabel: "Portfolio shocks", helpLabel: "About portfolio stress testing", path: "/stress-test", eyebrow: "TRY A WHAT-IF · NO WALLET", navHint: "See your portfolio's exposure", summary: "Change a hypothetical price and see the effect on a sample or manually entered portfolio.", bestFor: "Understanding concentration and a chosen scenario.", privacy: "Page-memory calculations; no wallet or provider lookup.", boundary: "Assumed values, not forecasts or a diversification score.", steps: ["Try an example and drag the slider.", "Compare single-position and all-position moves.", "Enter values or preview a share card."] },
  {"id": "situation-room", "group": "explore", "label": "World & markets", "shortLabel": "World & markets", "helpLabel": "About World & markets", "path": "/situation-room", "eyebrow": "NEWS CONTEXT · OBSERVED PRICES", "navHint": "Explore news and market reactions", "summary": "Explore source-linked news on a globe and compare observed crypto prices around publication.", "bestFor": "Checking the timing and context of reports beside dated price observations.", "privacy": "The published edition loads static public data. No wallet, private records, model requests or background polling.", "boundary": "A dated capture with prepared AI context. Publication timing does not establish causation; gaps stay unknown and pool prices are not executable quotes.", "steps": ["Select a report on the globe or in the feed.", "Compare the 15, 30 and 60 minute observation windows.", "Open AI insight for context, calculated price changes and follow-up checks.", "Inspect source details and save a local situation brief."]},
  { id: "kol-tracker", group: "explore", label: "KOL Tracker", shortLabel: "KOL calls", helpLabel: "About KOL Tracker", path: "/kol-tracker", eyebrow: "ORIGINAL POSTS · SOURCE HISTORY", navHint: "Track calls, coins and context", summary: "Review original KOL posts with real profiles, coin filters and prepared source context.", bestFor: "Checking what an author actually said before following a thesis.", privacy: "Static public sources; watch selections and saved receipts stay in this session. No account, polling or model requests.", boundary: "Selected dated history, not a comprehensive or live feed. No performance, accuracy or wallet ownership is inferred.", steps: ["Choose a KOL or token to filter source posts.", "Inspect targets, deadlines, conditions and the original X post.", "Compare calls, explore the timeline and reveal prepared AI context.", "Save a receipt in this session or download its source record."] },
  { id: "watch", group: "explore", label: "Watch", shortLabel: "Watchlist", helpLabel: "About Watch", path: "/watch", eyebrow: "PRIVATE WATCHLIST · ON DEMAND", navHint: "See what changed in a wallet", summary: "Save wallets locally and compare balances and newly observed activity between checks.", bestFor: "Returning to wallets you follow without reconstructing the last view.", privacy: "Labels and three snapshots per wallet are encrypted in your local Vault. Only the public address is sent on an approved refresh.", boundary: "Manual, bounded, non-final checks. Not continuous alerts, trade attribution, profit tracking or a safety verdict.", steps: ["Create or unlock your encrypted watchlist directly on the Watch page.", "Paste a Robinhood wallet address, review the public lookup and save a baseline.", "Refresh later and compare exact balances, missing entries and newly observed transactions.", "Export an encrypted backup; your watchlist is local to this browser and site."] },
  { id: "biggest-trades", group: "explore", label: "Biggest Observed Trades", shortLabel: "Big trades", helpLabel: "About observed trades", path: "/biggest-trades", eyebrow: "BOUNDED WINDOW · ONE VERIFIED POOL", navHint: "Compare largest observed swaps", summary: "Observe the largest recent signed Uniswap V3 Swap amounts in one factory-verified pool over a bounded recent block window.", bestFor: "Checking what actually swapped in one exact pool without a chain-wide, all-venue, or all-day claim.", privacy: "Only the public token contract, the factory-derived pool, and the bounded block window are sent after you click. No wallet, Vault, or AI data.", boundary: "A partial observation window, not a live feed, price, ranking of people, or profit signal. Each row is one signed Swap event that can coexist with flash loans and multi-hop routes.", steps: ["Keep the default WETH/USDG pair or paste one token contract.", "Review the public-address disclosure and click once to observe.", "Inspect exact window timestamps, scanned counts, and largest signed buys/sells.", "Follow only a verified public EOA sender through the Watch handoff."] },
  { id: "card-price-check", group: "explore", label: "Card Price Check", shortLabel: "Card prices", helpLabel: "About card price references", path: "/card-prices", eyebrow: "PICK A CARD · CHECK THE CONTEXT", navHint: "Pokémon & Yu-Gi-Oh! prices", summary: "Look up public card price references across supported markets without a wallet or Vault.", bestFor: "Getting price context before researching a collectible or seller's asking price.", privacy: "Only the public card ID and provider choice are sent after you click. No ownership, grades, notes or purchase prices are sent.", boundary: "Reference prices are not live offers, exact graded-card values, appraisals or guaranteed bargains. USD and EUR stay separate.", steps: ["Pick a named example, or search the Pokémon catalog.", "Click to retrieve public price references.", "Compare currencies, variants, price metrics and source timestamps.", "Open the cited provider or investigate exact listings independently."] },
  { id: "trade-simulator", group: "explore", label: "Trade scenarios", shortLabel: "Simulator", helpLabel: "About trade scenarios", path: "/simulate", eyebrow: "PRIVATE WHAT-IF", navHint: "Compare before and after", summary: "Model a WETH/USDG trade with a fresh quote and entered balances.", bestFor: "Comparing exact quantities and two-token allocation before independent execution.", privacy: "Balances and reference prices stay local; only pair and amount reach the quote provider.", boundary: "Not a guaranteed execution or full-wallet valuation; native ETH fees are separate. Saved reports are historical.", steps: ["Enter balances, amount and a reference price.", "Request a fresh quote.", "Compare expected and minimum outputs.", "Unlock local history to save an encrypted report."] },
  { id: "exit-check", group: "explore", label: "Trade Check", shortLabel: "Exit check", helpLabel: "About the exit estimate", path: "/exit-check", eyebrow: "READ-ONLY POOL ESTIMATE", navHint: "Estimate what a token could return", summary: "Quote the official Uniswap V3 factory pools for one token and amount at a captured, rechecked block.", bestFor: "Understanding the bounded pool depth and exact fee and price impact before doing your own research.", privacy: "Only the public token contract, amount, and output choice reach the dRPC Robinhood Chain gateway. dRPC is a paid gateway that may route each read to an independent node operator in its network.", boundary: "A quote is not proof of transferability, sellability, or guaranteed execution. Opsis never signs or broadcasts.", steps: ["Enter a public token contract and an amount.", "Review the selected factory pool, exact fee, and same-block price impact.", "Open the official Uniswap app only if you choose to continue."] },
  { id: "collectible-deal-finder", group: "vault", label: "Collectible Deal Finder", shortLabel: "Deal Finder", helpLabel: "About collectible comparisons", path: "/vault?view=deals", eyebrow: "PRIVATE SHOPPING RESEARCH", navHint: "Find and compare exact cards", summary: "Build precise collectible searches and compare saved offer costs.", bestFor: "Separating asking prices, sold evidence and complete landed costs.", privacy: "Your shopping brief stays local until you open a named marketplace. Saved offers are encrypted in your Vault.", boundary: "No live feed is implied; only reviewed opted-in merchants supply provider offers. Search handoffs and owner-entered prices are labeled separately.", steps: ["Unlock your Vault and identify the collectible.", "Specify printing, condition and grade.", "Inspect supported searches or reviewed merchant offers.", "Save exact comparable offers with all known costs."] },
  {
    id: "approval-manager", group: "vault", label: "Approval Manager", shortLabel: "Approvals",
    helpLabel: "About spending permissions", path: "/vault?view=approvals",
    eyebrow: "BOUNDED READ-ONLY REVIEW", navHint: "Review who can move assets",
    summary: "Review discovered spending permissions at a captured block.",
    bestFor: "Understanding limited, unlimited and NFT permissions before independent external review.",
    privacy: "Public-address reads are disclosed; saved evidence remains encrypted in your local Vault.",
    boundary: "Not an exhaustive scan or safety verdict. External tools and your wallet own revocation, with network costs.",
    steps: ["Unlock your Vault.", "Approve one public-address refresh.", "Filter permissions and inspect exact evidence.", "Review the external handoff; refresh after any change."]
  },
  {
    id: "private-explorer",
    group: "explore",
    label: "Research",
    shortLabel: "Research",
    helpLabel: "About private lookup",
    path: "/app",
    eyebrow: "NO ACCOUNT · EPHEMERAL",
    navHint: "Explain a wallet or transaction",
    summary:
      "Explain one public Robinhood Chain wallet, transaction, token, or contract with source-linked facts.",
    bestFor: "A fast answer without an account, with optional encrypted chat history on this device.",
    privacy:
      "The public identifier is sent only to the named chain-data providers. Your optional question is not sent to an AI model.",
    boundary:
      "Unsaved views clear on reload. Unlock local history to autosave new questions and answers in your encrypted Vault. No cloud history, signing, trading, or safety guarantee.",
    steps: [
      "Paste one public address or transaction hash.",
      "To retain new conversations, create a Vault and unlock Your chats, on this device before asking. Export encrypted backups regularly.",
      "Optionally choose the kind of explanation you want.",
      "Read the plain-English answer, risk notes, and source links.",
    ],
  },
  {
    id: "swap-preview",
    group: "explore",
    label: "Swap preview",
    shortLabel: "Swap preview",
    helpLabel: "About live swap previews",
    path: "/swap",
    eyebrow: "READ-ONLY UNISWAP ROUTE",
    navHint: "Preview a swap",
    summary:
      "Preview a current WETH/USDG route, minimum received, price impact, simulation, and estimated route cost.",
    bestFor: "Understanding a potential swap before opening the official Uniswap app.",
    privacy:
      "No wallet is requested. Uniswap receives the pair, amount, and a fixed non-user preview address.",
    boundary:
      "Opsis cannot approve, sign, submit, or broadcast. Uniswap independently requotes before execution.",
    steps: [
      "Choose the direction and enter an exact amount.",
      "Request a time-limited live preview.",
      "Continue to official Uniswap only if the explanation makes sense to you.",
    ],
  },
  {
    id: "rwa-verify",
    group: "explore",
    label: "Stock-token check",
    shortLabel: "Stock-token check",
    helpLabel: "About tokenized-asset evidence",
    path: "/rwa",
    eyebrow: "CONTRACT FIRST · CITED",
    navHint: "Check a token's claims",
    summary:
      "Inspect source-linked identity, oracle, corporate-action, vault, custody, and redemption evidence for supported tokenized assets.",
    bestFor: "Understanding what a token claims to represent and where that claim stops.",
    privacy:
      "Only the public contract and any required derived public feed address go to the providers named in the permission receipt.",
    boundary:
      "Evidence is not an authenticity guarantee, appraisal, redemption promise, or financial advice.",
    steps: [
      "Paste a token or vault contract.",
      "Review and approve the exact public network receipt.",
      "Compare confirmed evidence with unavailable, stale, or owner-reported claims.",
    ],
  },
  {
    id: "portfolio-intelligence",
    group: "vault",
    label: "Saved",
    shortLabel: "Saved",
    helpLabel: "About local portfolio snapshots",
    path: "/vault?view=portfolio",
    eyebrow: "ENCRYPTED · ON DEMAND",
    navHint: "See a wallet in one view",
    summary:
      "Capture one address at one rechecked current block, then view holdings, activity, decoded movements, and local reference values together.",
    bestFor: "A private, local dashboard for a public Robinhood Chain address.",
    privacy:
      "The address and derived public verification identifiers are sent only after permission. Labels, lots, prices, notes, and photos remain encrypted locally.",
    boundary:
      "The block anchor is current, not final. Coverage is bounded and partial or truncated sections stay visibly marked.",
    steps: [
      "Create or unlock the local Vault.",
      "Enter one public address and review the network receipt.",
      "Add local lot links or reference values without uploading them.",
    ],
  },
  {
    id: "collectible-catalog",
    group: "vault",
    label: "Collectible Catalog",
    shortLabel: "Collectibles",
    helpLabel: "About collectible identity",
    path: "/vault?view=collectibles",
    eyebrow: "CARD IDENTITY · LOCAL OWNERSHIP",
    navHint: "Add and identify a card",
    summary:
      "Match English card and set identity, then privately add your own printing, condition, grade, photo, cost, and dated value source.",
    bestFor: "Replacing a collectible spreadsheet without uploading ownership details.",
    privacy:
      "The catalog receives only the disclosed public lookup fields. Ownership, photos, grades, certificates, and values stay encrypted locally.",
    boundary:
      "A catalog match does not verify authenticity, condition, printing, inventory, or market value.",
    steps: [
      "Search by card name, collector number, and optional set ID.",
      "Confirm the catalog card and set identity.",
      "Add clearly labeled owner-reported details and save them locally.",
    ],
  },
  {
    id: "market-inventory",
    group: "vault",
    label: "Market & Inventory",
    shortLabel: "Market",
    helpLabel: "About market and inventory tools",
    path: "/vault?view=market",
    eyebrow: "FRESH SOURCES · EXACT INPUTS",
    navHint: "Compare markets and costs",
    summary:
      "Review exact-contract pool observations, opted-in merchant availability, and owner-entered landed-cost comparisons.",
    bestFor: "Comparing public market context and known costs without inventing missing fees or seller trust.",
    privacy:
      "Public lookups use an exact permission receipt. Private labels, ownership, costs, and comparisons stay encrypted in the Vault.",
    boundary:
      "Indexed observations are not executable quotes, appraisals, complete inventory, checkout, or recommendations.",
    steps: [
      "Look up an exact public token contract or an approved merchant mapping.",
      "Inspect freshness, identity, source, and limitation labels.",
      "Enter known costs locally; leave unknown tax, duty, or shipping blank.",
    ],
  },
  {
    id: "replay-actions",
    group: "vault",
    label: "Replay Actions",
    shortLabel: "Replay",
    helpLabel: "About rebuilding an action safely",
    path: "/vault?view=replay",
    eyebrow: "HISTORY AS CONTEXT · FRESH ACTION",
    navHint: "Rebuild a trade or purchase",
    summary:
      "Use a complete historical WETH/USDG movement pattern or a newly refreshed merchant offer as context, then make a fresh choice.",
    bestFor: "Starting a wholly new action from one narrow historical pattern without claiming the old intent or replaying transaction or checkout data.",
    privacy:
      "Historical hashes, wallet addresses, lots, labels, and costs stay inside the unlocked Vault. A new swap sends only direction and amount; a purchase lookup sends the exact reviewed merchant mapping after an encrypted local receipt is saved.",
    boundary:
      "Opsis never reuses calldata, approvals, carts, coupons, quantities, or orders. Uniswap or the merchant owns the new action.",
    steps: [
      "Choose a supported historical movement pattern or a current reviewed offer.",
      "Enter a new swap amount or explicitly select the new offer.",
      "Review the current information, then continue only on the official destination.",
    ],
  },
  {
    id: "open-data-api",
    group: "build",
    label: "Open Data API",
    shortLabel: "Developers",
    helpLabel: "About the public data boundary",
    path: "/developers",
    eyebrow: "TWO ROUTES · ZERO PROVIDER CALLS",
    navHint: "Reuse reviewed public facts",
    summary:
      "Read Opsis's two-entry launch support registry or normalize EVM-address syntax through a tightly capped v1 API.",
    bestFor: "Developers who need a reviewed two-asset support reference or Opsis-derived syntax normalization without importing private Vault or upstream-provider data.",
    privacy:
      "No account or API key is used. The normalizer receives one public address in a POST body; routes reject browser credentials and never call a provider.",
    boundary:
      "This is not a wallet, transaction, price, portfolio, inventory, search, bulk-export, or live-chain API. Unknown addresses are syntax-only.",
    steps: [
      "Read the exact two-route contract and hard caps.",
      "Use the reviewed WETH/USDG support registry or normalize one public EVM address.",
      "Retain the limitations and human-verification links in your consumer UI.",
    ],
  },
  {
    id: "manual-assets",
    group: "vault",
    label: "Manual Asset Records",
    shortLabel: "Manual assets",
    helpLabel: "About local manual records",
    path: "/vault?view=assets",
    eyebrow: "ANY ASSET · LOCAL ONLY",
    navHint: "Add anything manually",
    summary:
      "Create encrypted records for crypto, Pokémon and other collectibles, NFTs, real-world assets, or anything else you own.",
    bestFor: "Assets that have no supported provider, catalog match, or public identifier.",
    privacy:
      "Names, identifiers, collectible condition and grade, exact purchase lots, dated value references, notes, and locally processed photos stay inside the encrypted browser Vault.",
    boundary:
      "Manual entries and their charts are owner records, not provider verification, a live price feed, appraisal, tax accounting, or proof of ownership.",
    steps: [
      "Choose an asset type and give the record a useful name.",
      "For a collectible, add owner-reported printing, condition, grade, photo, and up to 20 dated source-linked reference values.",
      "Export an encrypted backup so browser storage is not your only copy.",
    ],
  },
];

function featureKey(id: string, field: string): TranslationKey {
  return `product.feature.${id}.${field}` as TranslationKey;
}

function featureStepKey(id: string, index: number): TranslationKey {
  return `product.feature.${id}.step.${index + 1}` as TranslationKey;
}

export function productFeatures(t: FeatureTranslate): ProductFeature[] {
  return PRODUCT_FEATURES.map((feature) => ({
    ...feature,
    label: t(featureKey(feature.id, "label")),
    shortLabel: t(featureKey(feature.id, "shortLabel")),
    helpLabel: t(featureKey(feature.id, "helpLabel")),
    eyebrow: t(featureKey(feature.id, "eyebrow")),
    navHint: t(featureKey(feature.id, "navHint")),
    summary: t(featureKey(feature.id, "summary")),
    bestFor: t(featureKey(feature.id, "bestFor")),
    privacy: t(featureKey(feature.id, "privacy")),
    boundary: t(featureKey(feature.id, "boundary")),
    steps: feature.steps.map((_, index) => t(featureStepKey(feature.id, index))),
  }));
}

export function featureById(id: string) {
  return PRODUCT_FEATURES.find((feature) => feature.id === id);
}
