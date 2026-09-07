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
  {
    id: "private-explorer",
    group: "explore",
    label: "Private Explorer",
    shortLabel: "Explorer",
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
    id: "scout-swap",
    group: "explore",
    label: "Scout Swap",
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
      "ChainScout cannot approve, sign, submit, or broadcast. Uniswap independently requotes before execution.",
    steps: [
      "Choose the direction and enter an exact amount.",
      "Request a time-limited live preview.",
      "Continue to official Uniswap only if the explanation makes sense to you.",
    ],
  },
  {
    id: "rwa-verify",
    group: "explore",
    label: "RWA Verify",
    shortLabel: "RWA evidence",
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
    label: "Portfolio Intelligence",
    shortLabel: "Portfolio",
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
      "ChainScout never reuses calldata, approvals, carts, coupons, quantities, or orders. Uniswap or the merchant owns the new action.",
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
      "Read ChainScout's two-entry launch support registry or normalize EVM-address syntax through a tightly capped v1 API.",
    bestFor: "Developers who need a reviewed two-asset support reference or ChainScout-derived syntax normalization without importing private Vault or upstream-provider data.",
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

export function featureById(id: string) {
  return PRODUCT_FEATURES.find((feature) => feature.id === id);
}
