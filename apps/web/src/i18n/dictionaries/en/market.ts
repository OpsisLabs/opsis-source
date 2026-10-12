export const market = {
  "market.common.notSupplied": "Not supplied",
  "market.common.notSpecified": "Not specified",
  "market.common.unknown": "Unknown",
  "market.common.current": "CURRENT",
  "market.common.stale": "STALE",
  "market.common.ownerEntered": "OWNER-ENTERED",
  "market.common.providerOffer": "PROVIDER OFFER",

  "market.header.title": "MARKET & INVENTORY",
  "market.header.dealsTitle": "COLLECTIBLE DEAL FINDER",
  "market.hero.title": "Compare what is actually comparable.",
  "market.hero.body":
    "Exact-contract crypto context, opted-in merchant stock, private landed-cost math, and click-only marketplace searches. No scraping, checkout, currency conversion, hidden tax estimate, or paid provider path.",
  "market.hero.bodyDeals":
    "Exact-card searches and private landed-cost comparisons. Live merchant inventory requires an approved, opted-in source. No checkout, hidden tax estimates, or automatic marketplace scraping.",

  "market.crypto.eyebrow": "LIVE PUBLIC CONTEXT",
  "market.crypto.title": "Robinhood token pools",
  "market.crypto.description":
    "DEX Screener prices the pair's base token. The searched contract can be the quote token, so Opsis shows the priced address explicitly and never silently inverts it.",
  "market.crypto.contractLabel": "TOKEN CONTRACT",
  "market.crypto.contractPlaceholder": "0x…",
  "market.crypto.review": "REVIEW EXACT-CONTRACT LOOKUP",
  "market.crypto.summaryOpsis": "Robinhood Chain 4663 · {contract}",
  "market.crypto.summaryProvider":
    "Robinhood token-pairs lookup · {contract}",
  "market.crypto.disclosure":
    "The exact public chain ID and token contract go transiently to Opsis and DEX Screener. Ownership, lots, costs, labels, notes, photos, other assets, cookies, wallet connections, and AI are excluded.",

  "market.cryptoObs.eyebrow": "ENCRYPTED OBSERVATIONS",
  "market.cryptoObs.title": "Indexed pool context",
  "market.cryptoObs.currentWindow": "CURRENT REFERENCE WINDOW",
  "market.cryptoObs.staleWindow": "STALE · REFRESH TO UPDATE",
  "market.cryptoObs.windowStatus":
    "{state} · OBSERVED {observed} · {seconds}S WINDOW",
  "market.cryptoObs.openSource": "OPEN DEX SCREENER SOURCE",
  "market.cryptoObs.baseTokenPriced": "{dex} · BASE TOKEN PRICED",
  "market.cryptoObs.pricedAddress": "PRICED ADDRESS {address}",
  "market.cryptoObs.pairId": "PAIR ID {id}",
  "market.cryptoObs.baseQuote": "BASE {base} · QUOTE {quote}",
  "market.cryptoObs.baseUsd": "BASE USD {usd} · BASE IN QUOTE {quote}",
  "market.cryptoObs.stats":
    "LIQ {liquidity} · VOL 24H {volume} · CHANGE 24H {change}",
  "market.cryptoObs.pairCreated": "PAIR CREATED {created}",
  "market.cryptoObs.empty":
    "VALID EMPTY · DEX Screener returned no exact-contract pair in this bounded response. That does not prove no pool exists elsewhere.",
  "market.cryptoObs.showing":
    "Showing 6 of {total} encrypted exact-contract pool observations in this compact view. Open the source for the broader indexed list.",
  "market.cryptoObs.truncated":
    "Provider collection reached Opsis's observed safety bound; additional pools may be omitted.",

  "market.merchant.eyebrow": "OPT-IN MERCHANTS ONLY",
  "market.merchant.title": "Reviewed Woo inventory",
  "market.merchant.description":
    "A live lookup works only after an opted-in store and exact simple-product mapping are code-reviewed. Unapproved Shopify paths stay off; supported public venues remain click-only searches.",
  "market.merchant.loadStores": "LOAD APPROVED STORES",
  "market.merchant.mappingsAria": "Approved merchant mappings",
  "market.merchant.idLabel": "MERCHANT ID",
  "market.merchant.idPlaceholder": "Approved ID",
  "market.merchant.assetLabel": "CANONICAL ASSET ID",
  "market.merchant.assetPlaceholder": "tcgdex:en:…",
  "market.merchant.permissionEvidence": "MERCHANT PERMISSION EVIDENCE",
  "market.merchant.mappingEvidence": "EXACT MAPPING EVIDENCE",
  "market.merchant.review": "REVIEW MERCHANT LOOKUP",
  "market.merchant.approvedMerchant": "approved merchant {merchant}",
  "market.merchant.summaryOpsis":
    "Merchant ID {merchant} · canonical asset {asset} · reviewed SKU {sku} · expected product ID {productId} · mapping reviewed {reviewedAt}",
  "market.merchant.summaryProvider":
    "Exact reviewed SKU {sku} · expected product ID {productId}",
  "market.merchant.disclosure":
    "The public canonical asset ID, approved merchant ID, reviewed SKU, expected product ID, and mapping review date go transiently to Opsis. Only the reviewed SKU and expected product ID go to that opted-in merchant. Ownership, lots, costs, labels, notes, photos, other assets, cookies, wallet connections, and AI are excluded.",
  "market.merchant.returnNotSupplied": "Merchant return policy not supplied",

  "market.merchantObs.eyebrow": "REVIEWED MERCHANT OBSERVATIONS",
  "market.merchantObs.title": "Exact mapped simple products",
  "market.merchantObs.noOffer":
    "{merchant} · no exact mapped product returned",
  "market.merchantObs.validEmpty": "VALID EMPTY · {state}",
  "market.merchantObs.observedLine": "{id} · observed {observed}",
  "market.merchantObs.mappingLine":
    "SKU {sku} · PRODUCT ID {productId} · MAPPING REVIEWED {reviewedAt}",
  "market.merchantObs.openMapping": "OPEN MAPPING EVIDENCE",
  "market.merchantObs.exactMapping":
    "EXACT REVIEWED SIMPLE-PRODUCT MAPPING · {merchant}",
  "market.merchantObs.openSource": "OPEN PRODUCT SOURCE",
  "market.merchantObs.mappedVariant": "MAPPED VARIANT",
  "market.merchantObs.publishedPrice": "PUBLISHED PRICE",
  "market.merchantObs.providerAvailability": "PROVIDER AVAILABILITY",
  "market.merchantObs.exactQuantity": "EXACT QUANTITY",
  "market.merchantObs.productRating":
    "PRODUCT RATING · NOT SELLER REPUTATION",
  "market.merchantObs.ratingValue": "{average}/5 · {count} reviews",
  "market.merchantObs.sellerReputation": "SELLER REPUTATION",
  "market.merchantObs.sellerReputationValue": "Not supplied by this adapter",
  "market.merchantObs.observed": "OBSERVED",
  "market.merchantObs.mappingReviewed": "MAPPING REVIEWED",
  "market.merchantObs.exactSku": "EXACT SKU",
  "market.merchantObs.expectedProductId": "EXPECTED PRODUCT ID",
  "market.merchantObs.freshness": "FRESHNESS",
  "market.merchantObs.freshnessCurrent": "Current observation window",
  "market.merchantObs.freshnessStale": "Stale · refresh before comparing",
  "market.merchantObs.reviewedMappingEvidence":
    "REVIEWED MAPPING EVIDENCE",

  "market.inventory.providerAvailable": "provider available",
  "market.inventory.providerLowStock": "provider low stock",
  "market.inventory.providerUnavailable": "provider unavailable",
  "market.inventory.ownerAvailable": "owner available",
  "market.inventory.unknown": "unknown",

  "market.confidence.exactProviderMapping": "exact provider mapping",
  "market.confidence.ownerLinked": "owner linked",
  "market.confidence.candidate": "candidate",

  "market.comparison.eyebrow": "ENCRYPTED LOCAL MATH",
  "market.comparison.title": "Add a landed-cost comparison",
  "market.comparison.description":
    "Blank means unknown. Type 0 when a cost is explicitly zero. Opsis never estimates tax, duty, shipping, or exchange rates.",
  "market.comparison.providerLocked":
    "Merchant identity, condition, unit price, currency, and availability are locked to the reviewed response. Only your quantity and local cost fields can change.",
  "market.comparison.linkedAsset": "LINKED ASSET",
  "market.comparison.candidateOption": "Candidate / not linked",
  "market.comparison.ownerEnteredSource": "Owner-entered source",
  "market.comparison.offerLabel": "OFFER LABEL",
  "market.comparison.sourceName": "SOURCE NAME",
  "market.comparison.sourceUrl": "SOURCE URL",
  "market.comparison.condition": "CONDITION / VARIANT",
  "market.comparison.region": "REGION",
  "market.comparison.unitPrice": "UNIT PRICE",
  "market.comparison.quantity": "QUANTITY",
  "market.comparison.currency": "CURRENCY",
  "market.comparison.shipping": "SHIPPING",
  "market.comparison.tax": "TAX",
  "market.comparison.duty": "DUTY",
  "market.comparison.fees": "FEES",
  "market.comparison.discount": "DISCOUNT",
  "market.comparison.blankUnknown": "Blank = unknown",
  "market.comparison.providerAvailability": "PROVIDER AVAILABILITY",
  "market.comparison.ownerAvailability": "OWNER AVAILABILITY",
  "market.comparison.ownerAvailable": "Owner says available",
  "market.comparison.returnNotes": "RETURN NOTES",
  "market.comparison.submit": "ENCRYPT & ADD COMPARISON",

  "market.results.eyebrow": "LOCAL RESULTS",
  "market.results.title": "Comparable landed cost",
  "market.results.meta": "{confidence} · {inventory} · {freshness}",
  "market.results.freshWindow": "FRESH WINDOW",
  "market.results.providerRegion": "{provider} · region {region}",
  "market.results.returnNotesInline": "Return notes: {notes}",
  "market.results.merchantMapping":
    "MERCHANT {merchant} · SKU {sku} · PRODUCT {productId} · REVIEWED {reviewedAt}",
  "market.results.sourceObserved": "SOURCE · OBSERVED {observed}",
  "market.results.breakdown":
    "{unitPrice} × {quantity} + ship {shipping} + tax {tax} + duty {duty} + fees {fees} − discount {discount}",
  "market.results.landedTotal": "LANDED TOTAL",
  "market.results.notRanked": "NOT RANKED",
  "market.results.localRank": "LOCAL RANK",
  "market.results.comparableExplanation":
    "Same owner-linked identifier, condition, currency, quantity, region, explicit costs, current-session confirmation, and available state.",
  "market.results.reconfirm": "RECONFIRM MY INPUTS",
  "market.results.remove": "REMOVE",
  "market.results.disclaimer":
    "Rank is lowest entered landed total inside one owner-linked local comparison group. Owner links are not independent identity verification. It is not a market-wide best price, recommendation, appraisal, tax quote, or merchant reputation score.",

  "market.dialog.eyebrow": "EXACT NETWORK RECEIPT",
  "market.dialog.title": "Confirm this public lookup",
  "market.dialog.cancelAria": "Cancel market lookup",
  "market.dialog.sentToOpsis": "SENT TO OPSIS",
  "market.dialog.sentToProviders": "SENT TO {providers}",
  "market.dialog.disclosureTail":
    "The encrypted permission attempt is saved before the request. Indexed market facts are not an executable quote, complete inventory, appraisal, or recommendation.",
  "market.dialog.cancel": "CANCEL",
  "market.dialog.confirm": "SAVE RECEIPT + LOOK UP",

  "market.notice.noMerchant":
    "No merchant is enabled yet. Live stock stays off until a store affirmatively opts in and its exact product mapping is reviewed.",
  "market.notice.cryptoPairsOne":
    "{count} exact-contract pool observation saved encrypted. These are indexed references, not executable quotes.",
  "market.notice.cryptoPairsOther":
    "{count} exact-contract pool observations saved encrypted. These are indexed references, not executable quotes.",
  "market.notice.cryptoEmpty":
    "DEX Screener returned a valid empty pair collection. That does not prove no pool exists elsewhere.",
  "market.notice.merchantOffer":
    "The reviewed price and conservative availability are locked into the editor. Enter your own quantity and explicit local costs, then encrypt the comparison. Exact stock quantity and merchant reputation were not supplied.",
  "market.notice.merchantEmpty":
    "The opted-in merchant returned a valid empty exact-SKU result. That dated empty observation replaced its prior current state; older comparisons remain encrypted but stale.",
  "market.notice.comparisonProvider":
    "The reviewed merchant observation and your local costs were saved encrypted. It ranks only while the original provider freshness window remains open.",
  "market.notice.comparisonOwner":
    "Owner-entered offer saved encrypted. It is ranked only against complete comparisons with the same linked identity, currency, condition, quantity, and region in this unlocked session.",
  "market.notice.comparisonRemoved":
    "The selected local comparison was removed from the encrypted Vault.",
  "market.notice.reconfirmed":
    "You reconfirmed this owner-entered offer for the current unlocked session. Opsis did not contact its source.",

  "market.error.directoryLoad":
    "The approved merchant directory could not be loaded.",
  "market.error.receiptSave":
    "The encrypted permission receipt could not be saved. {message} Opsis did not contact a market provider.",
  "market.error.providerLocalSave":
    "The provider returned a result and the approved public identifier was sent, but {reason} The result was not persisted; the prior encrypted observation remains unchanged.",
  "market.error.requestFailed":
    "The market request failed after approval. The public identifier may already have been sent; prior encrypted observations remain unchanged.",
  "market.error.localSave": "the local encrypted save failed.",

  "market.math.reasonCandidate":
    "Identity or variant is only a candidate match.",
  "market.math.reasonCondition": "Condition or variant is missing.",
  "market.math.reasonAvailability": "Availability is unknown or unavailable.",
  "market.math.reasonStale":
    "Observation is stale until you refresh or reconfirm it.",
  "market.math.reasonMissingCosts":
    "Enter shipping, tax, duty, fees, and discount; explicit zero is allowed.",
  "market.math.reasonDiscountExceeds":
    "Discount exceeds the entered landed cost.",

  "market.handoff.eyebrow": "UNSUPPORTED VENUES",
  "market.handoff.title": "Precise click-only searches",
  "market.handoff.description":
    "These links contain only public card identity. Opsis does not fetch, pre-load, rank, or claim inventory from the destination. Review the exact query before opening.",
  "market.handoff.collectibleLabel": "ENCRYPTED COLLECTIBLE",
  "market.handoff.chooseCollectible":
    "Choose a catalog-matched collectible",
  "market.handoff.searchOnly": "SEARCH ONLY · NO LIVE DATA",
  "market.handoff.openDestination": "OPEN DESTINATION",
  "market.handoff.ebay": "eBay search",
  "market.handoff.tcgplayer": "TCGplayer search",
  "market.handoff.cardmarket": "Cardmarket search",
} as const;
