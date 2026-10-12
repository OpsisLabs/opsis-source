export const collectibles = {
  "collectibles.catalog.eyebrow": "COLLECTIBLE CATALOG",
  "collectibles.catalog.title": "Match the card. Keep ownership private.",
  "collectibles.catalog.description":
    "TCGdex supplies English card and set identity plus an optional low-resolution catalog thumbnail. Opsis sanitizes that image locally before it enters the encrypted Vault. Printing or variant, condition, grade, certificate, value, authenticity, and inventory remain owner claims; marketplace prices are not requested.",
  "collectibles.providerOriginalLanguage":
    "Card name, set, rarity, and illustrator are shown in the original language supplied by TCGdex.",
  "collectibles.catalog.addWithout": "ADD WITHOUT CATALOG",
  "collectibles.catalog.languageLabel": "LANGUAGE",
  "collectibles.catalog.languageEnglishLaunch": "English · launch",
  "collectibles.catalog.cardNameLabel": "CARD NAME",
  "collectibles.catalog.cardNamePlaceholder": "e.g. Charizard",
  "collectibles.catalog.numberLabel": "NUMBER",
  "collectibles.catalog.setIdLabel": "SET ID",
  "collectibles.catalog.optionalPlaceholder": "Optional",
  "collectibles.catalog.setSuffix": "set {setId}",
  "collectibles.catalog.submit": "REVIEW LOOKUP",
  "collectibles.catalog.tip":
    "TIP · SET ID + COLLECTOR NUMBER PRODUCES THE LEAST AMBIGUOUS MATCH",
  "collectibles.catalog.matchesShownOne":
    "{count} catalog match shown. Choose one to verify its card and set identity.",
  "collectibles.catalog.matchesShownMany":
    "{count} catalog matches shown. Choose one to verify its card and set identity.",
  "collectibles.catalog.noMatch":
    "No catalog match was found. You can adjust the search or add the asset manually.",
  "collectibles.catalog.detailResolved":
    "Catalog identity resolved. Owner details below remain local and are not verified by TCGdex.",
  "collectibles.catalog.receiptSaveFailed":
    "The encrypted permission receipt could not be saved, so Opsis did not contact the catalog.",
  "collectibles.catalog.requestFailed":
    "The catalog request failed. The manual Vault path is still available.",
  "collectibles.catalog.collectorNumber": "COLLECTOR #{number}",
  "collectibles.catalog.reviewExactMatch": "REVIEW EXACT MATCH →",
  "collectibles.catalog.truncated":
    "Results are bounded and truncated. Add a set ID or collector number to narrow the lookup.",
  "collectibles.catalog.license":
    "Community catalog metadata is supplied by TCGdex under its database license. Opsis is not affiliated with or endorsed by TCGdex, Nintendo, The Pokémon Company, any marketplace, or any grading company. Names and trademarks remain the property of their respective owners.",
  "collectibles.receipt.disclosureSearch":
    "Opsis receives the confirmed English card name, optional collector number, and optional set ID. TCGdex receives only the name and optional collector number. Ownership and other private fields remain encrypted in this browser.",
  "collectibles.receipt.disclosureDetail":
    "Opsis and TCGdex receive the selected public card ID. TCGdex returns allowlisted identity metadata and a catalog image path; the browser fetches the low-resolution image directly without cookies or a referrer. Ownership and other private fields remain encrypted in this browser.",
  "collectibles.permission.eyebrow": "EXACT NETWORK RECEIPT",
  "collectibles.permission.title": "Confirm this catalog lookup",
  "collectibles.permission.cancelAria": "Cancel catalog lookup",
  "collectibles.permission.sentToOpsis": "SENT TO OPSIS",
  "collectibles.permission.sentToTcgdex": "SENT TO TCGDEX",
  "collectibles.permission.encryptedTitle": "ENCRYPTED LOCALLY",
  "collectibles.permission.encryptedText":
    "Permission attempt, ownership fields, photos, costs, notes, grades, certificates, and manual values.",
  "collectibles.permission.notRequestedTitle": "NOT REQUESTED",
  "collectibles.permission.notRequestedSearch":
    "No account, wallet, AI model, artwork, marketplace price, printing claim, or server-stored catalog result.",
  "collectibles.permission.notRequestedDetail":
    "No account, wallet, AI model, marketplace price, printing claim, ownership field, or server-stored catalog result.",
  "collectibles.permission.searchNote":
    "Search requests only card IDs, collector numbers, and names—no artwork or marketplace fields.",
  "collectibles.permission.detailNote":
    "The detail request adds only the catalog image base. If supplied, your browser fetches its low-resolution image from TCGdex without credentials or a referrer, then strips metadata and re-encodes it locally.",
  "collectibles.permission.receiptNote":
    "The encrypted permission attempt is saved before the request. A catalog match or thumbnail is not proof that your physical card is authentic or currently worth any amount.",
  "collectibles.permission.cancel": "CANCEL",
  "collectibles.permission.confirm": "SAVE RECEIPT + LOOK UP",
  "collectibles.owner.identityResolved":
    "CATALOG IDENTITY RESOLVED · NOT AN AUTHENTICITY CHECK",
  "collectibles.owner.rarityNotSupplied": "Rarity not supplied",
  "collectibles.owner.closeAria": "Close resolved catalog card",
  "collectibles.owner.printingLabel": "OWNER-REPORTED PRINTING / VARIANT",
  "collectibles.owner.printingPlaceholder": "Optional · e.g. holo, shadowless",
  "collectibles.owner.conditionLabel": "OWNER-REPORTED CONDITION",
  "collectibles.owner.graderLabel": "OWNER-REPORTED GRADER",
  "collectibles.owner.quantityLabel": "QUANTITY",
  "collectibles.owner.gradeLabel": "OWNER-ENTERED GRADE",
  "collectibles.owner.certificateLabel": "OWNER-ENTERED CERTIFICATE",
  "collectibles.owner.purchasePriceLabel": "PURCHASE PRICE / UNIT",
  "collectibles.owner.purchaseCurrencyLabel": "PURCHASE CURRENCY",
  "collectibles.owner.acquiredDateLabel": "ACQUIRED DATE",
  "collectibles.owner.notesLabel": "PRIVATE NOTES",
  "collectibles.owner.notesPlaceholder":
    "Storage location, provenance, personal notes…",
  "collectibles.owner.valueReferenceTitle":
    "OPTIONAL MANUAL VALUE REFERENCE · NOT LIVE OR VERIFIED",
  "collectibles.owner.valueLabel": "VALUE",
  "collectibles.owner.currencyLabel": "CURRENCY",
  "collectibles.owner.observedDateLabel": "OBSERVED DATE",
  "collectibles.owner.sourceUrlLabel": "HTTPS SOURCE URL",
  "collectibles.owner.sourceUrlPlaceholder": "https://…",
  "collectibles.owner.sourceLabelLabel": "SOURCE LABEL",
  "collectibles.owner.sourceLabelPlaceholder": "e.g. sold listing",
  "collectibles.owner.photoAlt": "{name} sanitized thumbnail preview",
  "collectibles.owner.photoSanitizing": "SANITIZING…",
  "collectibles.owner.photoReplace": "REPLACE WITH OWNER PHOTO",
  "collectibles.owner.photoAdd": "ADD OWNER PHOTO",
  "collectibles.owner.photoAria": "OWNER-SUPPLIED COLLECTIBLE PHOTO",
  "collectibles.owner.photoRemove": "REMOVE PHOTO",
  "collectibles.owner.thumbnailLoading":
    "FETCHING + SANITIZING CATALOG THUMBNAIL…",
  "collectibles.owner.thumbnailReady":
    "CATALOG THUMBNAIL READY · SANITIZED LOCALLY",
  "collectibles.owner.thumbnailUnavailable":
    "Catalog thumbnail unavailable. You can still add an owner photo or save without one.",
  "collectibles.owner.thumbnailRestore": "RESTORE CATALOG THUMBNAIL",
  "collectibles.owner.thumbnailNote":
    "Catalog images are fetched directly from TCGdex without cookies or a referrer, then re-encoded locally. Only sanitized bytes are encrypted when you save; nothing is uploaded.",
  "collectibles.owner.photoRemoved": "Photo removed from this draft.",
  "collectibles.owner.photoTooLarge":
    "Use one owner-supplied JPEG, PNG, or WebP source up to 12 MB.",
  "collectibles.owner.ownerPhotoReady":
    "OWNER PHOTO READY · SANITIZED LOCALLY",
  "collectibles.owner.photoSanitizeFailed":
    "That photo could not be sanitized locally.",
  "collectibles.owner.gradedError":
    "A graded certificate must describe exactly one copy and include both grade and certificate number.",
  "collectibles.owner.referenceError":
    "A manual value reference needs value, date observed, source URL, and a short source label.",
  "collectibles.owner.saveFailed":
    "The encrypted collectible could not be saved.",
  "collectibles.owner.save": "SAVE PRIVATE COLLECTIBLE",
  "collectibles.owner.saving": "ENCRYPTING…",
  "collectibles.owner.sourcePrefix": "Catalog source: ",
  "collectibles.owner.sourceGraphql": "TCGdex GraphQL",
  "collectibles.owner.sourceLicense": "database license",
  "collectibles.owner.sourceFooterTail":
    ". The catalog thumbnail is visual reference only. Printing, condition, grade, certificate, value, authenticity, and inventory remain owner-entered or unsupported claims.",
  "collectibles.owner.condition.unknown": "Not entered",
  "collectibles.owner.condition.poor": "Poor",
  "collectibles.owner.condition.played": "Played",
  "collectibles.owner.condition.good": "Good",
  "collectibles.owner.condition.excellent": "Excellent",
  "collectibles.owner.condition.nearMint": "Near mint",
  "collectibles.owner.condition.mint": "Mint",
  "collectibles.owner.grader.ungraded": "Ungraded",
  "collectibles.owner.grader.psa": "PSA",
  "collectibles.owner.grader.cgc": "CGC",
  "collectibles.owner.grader.bgs": "BGS",
  "collectibles.owner.grader.other": "Other",
  "collectibles.api.englishOnly":
    "Collectible Catalog currently supports English metadata only",
  "collectibles.api.invalidSearch":
    "Opsis returned an invalid collectible search response",
  "collectibles.api.invalidDetail":
    "Opsis returned an invalid collectible detail response",
  "collectibles.api.invalidPrivacy":
    "Opsis returned an invalid collectible privacy receipt",
  "collectibles.thumbnail.unavailable": "Catalog thumbnail is unavailable",
  "collectibles.thumbnail.invalidType":
    "Catalog thumbnail has an invalid type",
  "collectibles.thumbnail.invalidSize":
    "Catalog thumbnail has an invalid size",
  "collectibles.thumbnail.invalidUrl": "Catalog thumbnail URL is invalid",
} as const;
