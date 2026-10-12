export const docs = {
  "docs.nav.aria": "Technical documentation sections",
  "docs.nav.onThisPage": "ON THIS PAGE",
  "docs.nav.architecture": "Architecture",
  "docs.nav.vault": "Saved",
  "docs.nav.evidence": "Evidence pipeline",
  "docs.nav.adapters": "Feature adapters",
  "docs.nav.security": "Security boundary",
  "docs.nav.token": "Token design",

  "docs.header.eyebrow": "TECHNICAL REFERENCE · ROBINHOOD CHAIN 4663",
  "docs.title.line1": "How ChainScout",
  "docs.title.line2": "actually works.",
  "docs.header.description":
    "ChainScout is a read-only asset-intelligence layer plus a browser-encrypted ownership layer. It resolves exact public identifiers, normalizes bounded evidence, labels uncertainty, and keeps the private context that makes an asset yours off the server.",
  "docs.header.viewSource": "VIEW SOURCE",
  "docs.header.readFaq": "READ THE FAQ",

  "docs.label.input": "INPUT",
  "docs.label.path": "PATH",
  "docs.label.storage": "STORAGE",
  "docs.label.process": "PROCESS",
  "docs.label.output": "OUTPUT",
  "docs.label.boundary": "BOUNDARY",

  "docs.architecture.eyebrow": "01 · DATA PATHS",
  "docs.architecture.title": "Three modes, three different boundaries.",
  "docs.architecture.intro":
    "ChainScout separates unsaved public lookups from opt-in encrypted local history and ownership records. Cloud research is deferred to a future update, not a launch dependency.",
  "docs.architecture.mode.ephemeral.name": "EPHEMERAL LOOKUP",
  "docs.architecture.mode.ephemeral.input": "Public identifier",
  "docs.architecture.mode.ephemeral.path": "Same-origin API",
  "docs.architecture.mode.ephemeral.storage": "No server history",
  "docs.architecture.mode.ephemeral.copy":
    "Unsaved results clear on reload. Named providers receive only the disclosed public fields required for that lookup. Saved transcripts are not uploaded as context.",
  "docs.architecture.mode.vault.name": "LOCAL VAULT + CHATS",
  "docs.architecture.mode.vault.input": "Opt-in history and ownership",
  "docs.architecture.mode.vault.path": "Web Crypto + IndexedDB",
  "docs.architecture.mode.vault.storage": "Encrypted browser records",
  "docs.architecture.mode.vault.copy":
    "Unlock before asking to autosave questions, answers and sources. Record version 5 binds conversations to the existing AES-GCM Vault key. Backups authenticate and restore chats alongside asset records. Same browser profile and origin only; browser deletion or eviction still requires a backup.",
  "docs.architecture.mode.cloud.name": "CLOUD · FUTURE UPDATE",
  "docs.architecture.mode.cloud.input": "Not enabled for launch",
  "docs.architecture.mode.cloud.path": "Separate future workspace",
  "docs.architecture.mode.cloud.storage": "No cloud retention promised",
  "docs.architecture.mode.cloud.copy":
    "Existing account recovery/export routes remain available where configured. Cloud research is not needed for local chat history or the Vault.",
  "docs.architecture.pipeline.eyebrow": "PUBLIC LOOKUP PIPELINE",
  "docs.architecture.pipeline.browser.name": "BROWSER",
  "docs.architecture.pipeline.browser.note": "strict input",
  "docs.architecture.pipeline.origin.name": "SAME ORIGIN",
  "docs.architecture.pipeline.origin.note": "/v1 private route",
  "docs.architecture.pipeline.adapters.name": "ADAPTERS",
  "docs.architecture.pipeline.adapters.note": "fixed providers",
  "docs.architecture.pipeline.normalized.name": "NORMALIZED",
  "docs.architecture.pipeline.normalized.note": "sources + limits",

  "docs.vault.eyebrow": "02 · LOCAL CRYPTOGRAPHY",
  "docs.vault.title": "The Vault is encrypted before storage.",
  "docs.vault.keyLifecycle.title": "Key lifecycle",
  "docs.vault.keyLifecycle.item1":
    "Generate a random 256-bit data-encryption key in Web Crypto.",
  "docs.vault.keyLifecycle.item2":
    "Derive a wrapping key from the normalized passphrase using PBKDF2-HMAC-SHA-256, a random salt, and 600,000 iterations.",
  "docs.vault.keyLifecycle.item3":
    "Wrap the data key with AES-256-GCM. After unlock, use a non-extractable session key.",
  "docs.vault.keyLifecycle.item4":
    "Lock removes the app's references to plaintext state and the session key; reload returns locked.",
  "docs.vault.integrity.title": "Record integrity",
  "docs.vault.integrity.item1": "Each record uses a fresh 96-bit AES-GCM IV.",
  "docs.vault.integrity.item2":
    "Authenticated data binds the Vault ID, record ID, and record version, so ciphertext cannot be silently moved or relabeled.",
  "docs.vault.integrity.item3":
    "Revision checks stop stale tabs from overwriting newer local state.",
  "docs.vault.integrity.item4":
    "Encrypted backups authenticate the manifest and mixed record versions before replacing an existing Vault.",
  "docs.vault.warning.title": "WHAT THIS DOES NOT PROTECT",
  "docs.vault.warning.body":
    "A compromised browser, malicious extension, hostile same-origin code, screen capture, keylogger, or device attacker may see data while the Vault is unlocked. Browser storage can also be cleared or evicted. Keep an encrypted backup and its matching passphrase or recovery code somewhere separate.",
  "docs.vault.visual.eyebrow": "LOCAL VISUALIZATION LAYER",
  "docs.vault.visual.body":
    "Apache ECharts renders SVG inside the unlocked Vault. Record-mix charts use encrypted record counts; collectible history uses exact purchase lots plus up to 20 owner-entered dated references; portfolio allocation uses explicitly entered reference values and keeps currencies separate. JavaScript numbers are used only as plotting coordinates after exact-string math. The source values remain visible in an adjacent accessible table, and no chart library or chart API receives them over the network.",

  "docs.evidence.eyebrow": "03 · NORMALIZATION",
  "docs.evidence.title": "A source is not automatically a fact.",
  "docs.evidence.intro":
    "Every adapter converts provider-specific responses into a smaller internal model. The interface is designed to expose why a statement appears—not merely print whatever an API returned.",
  "docs.evidence.identity.title": "CANONICAL IDENTITY",
  "docs.evidence.identity.copy":
    "Match full chain, contract, transaction, card/set, product, or pool identifiers before attaching data.",
  "docs.evidence.exactValues.title": "EXACT VALUES",
  "docs.evidence.exactValues.copy":
    "Keep token IDs and large integers as strings. Local landed-cost math uses decimal coefficients, not JavaScript floats.",
  "docs.evidence.freshness.title": "FRESHNESS",
  "docs.evidence.freshness.copy":
    "Return fetched time and a bounded freshness duration. Current, stale, valid-empty, partial, and unavailable are different states.",
  "docs.evidence.reconciliation.title": "DIRECT RECONCILIATION",
  "docs.evidence.reconciliation.copy":
    "Indexed discovery finds candidates; direct chain reads win where the feature requires onchain ownership or state.",
  "docs.evidence.provenance.title": "PROVENANCE",
  "docs.evidence.provenance.copy":
    "Normalized rows retain a human source link and enough identity context to audit what was actually observed.",
  "docs.evidence.failClosed.title": "FAIL CLOSED",
  "docs.evidence.failClosed.copy":
    "Malformed, oversized, redirected, rate-limited, over-budget, or identity-conflicting responses do not become clean facts.",

  "docs.adapters.eyebrow": "04 · FEATURE CONTRACTS",
  "docs.adapters.title": "Different assets need different proof.",
  "docs.adapters.introEnabled":
    "Current founder-beta build: Research, Swap preview, Saved, Stock-token check, and Collectible Catalog are enabled. Market & Inventory, Open Data, and Replay Actions are coming soon.",
  "docs.adapters.introGated":
    "Current founder-beta build: Research, Swap preview, Saved, Stock-token check are enabled. Collectible Catalog, Market & Inventory, Open Data, and Replay Actions are coming soon.",
  "docs.adapters.comingSoon": "COMING SOON",
  "docs.adapters.privateExplorer.name": "Research",
  "docs.adapters.privateExplorer.input":
    "One public wallet, transaction, token, or contract",
  "docs.adapters.privateExplorer.process":
    "Bounded provider resolution + deterministic explanation",
  "docs.adapters.privateExplorer.output":
    "Source-linked facts, coverage, risks, and plain English",
  "docs.adapters.privateExplorer.limit":
    "Unsaved by default; optional encrypted local chat history",
  "docs.adapters.scoutSwap.name": "Swap preview",
  "docs.adapters.scoutSwap.input": "WETH/USDG direction and exact amount",
  "docs.adapters.scoutSwap.process":
    "Read-only Uniswap route using a fixed non-user preview address",
  "docs.adapters.scoutSwap.output":
    "Minimum, impact, simulation, route cost, official handoff",
  "docs.adapters.scoutSwap.limit": "ChainScout never signs or broadcasts",
  "docs.adapters.portfolio.name": "Saved",
  "docs.adapters.portfolio.input": "One approved Robinhood Chain address",
  "docs.adapters.portfolio.process":
    "Capture current block, reconcile direct reads, recheck block hash",
  "docs.adapters.portfolio.output":
    "Bounded holdings, activity, movements, approvals, coverage",
  "docs.adapters.portfolio.limit":
    "Current anchor is not final; partial data stays marked",
  "docs.adapters.rwaVerify.name": "Stock-token check",
  "docs.adapters.rwaVerify.input": "One public token or vault contract",
  "docs.adapters.rwaVerify.process":
    "Contract-first identity, oracle, role, vault, and source checks",
  "docs.adapters.rwaVerify.output":
    "Confirmed, unavailable, stale, and owner-reported evidence",
  "docs.adapters.rwaVerify.limit":
    "Evidence is not authenticity, redemption, or appraisal",
  "docs.adapters.collectibles.name": "COLLECTIBLES",
  "docs.adapters.collectibles.input":
    "English card name, number, and optional set",
  "docs.adapters.collectibles.process":
    "Field-selective TCGdex metadata + optional low-res asset-CDN image",
  "docs.adapters.collectibles.output":
    "Card/set identity and sanitized encrypted thumbnail; owner claims stay local",
  "docs.adapters.collectibles.limit":
    "No marketplace pricing, grading, authenticity, or inventory claim",
  "docs.adapters.marketInventory.name": "MARKET & INVENTORY",
  "docs.adapters.marketInventory.input":
    "Exact public contract or reviewed merchant mapping",
  "docs.adapters.marketInventory.process":
    "Bounded DEX observations or opted-in merchant availability",
  "docs.adapters.marketInventory.output":
    "Freshness, identity, source, availability, local landed cost",
  "docs.adapters.marketInventory.limit":
    "No execution, scraping, complete inventory, or seller score",
  "docs.adapters.openData.name": "OPEN DATA V1",
  "docs.adapters.openData.input":
    "One reviewed support-registry read or one public EVM address",
  "docs.adapters.openData.process":
    "Static ChainScout tuple or deterministic syntax normalization",
  "docs.adapters.openData.output":
    "Versioned annotations, limitations, and human-verification links",
  "docs.adapters.openData.limit":
    "Two routes; no provider calls, search, live state, API keys, or bulk data",
  "docs.adapters.replayActions.name": "REPLAY ACTIONS",
  "docs.adapters.replayActions.input":
    "One complete local movement pattern or freshly reviewed offer",
  "docs.adapters.replayActions.process":
    "Strict local pattern check + mandatory new direction/amount or current offer",
  "docs.adapters.replayActions.output":
    "Fresh quote or official product-page handoff",
  "docs.adapters.replayActions.limit":
    "No old calldata, approval, amount, cart, order, or checkout reuse",

  "docs.security.eyebrow": "05 · DEFENSE IN DEPTH",
  "docs.security.title": "Privacy is a collection of boundaries.",
  "docs.security.noSigner.title": "NO SIGNER",
  "docs.security.noSigner.copy":
    "ChainScout never asks for a seed phrase and does not approve, sign, route, submit, or broadcast transactions.",
  "docs.security.networkReceipts.title": "EXPLICIT NETWORK RECEIPTS",
  "docs.security.networkReceipts.copy":
    "Sensitive public associations are sent only after the UI names the destination and fields. The approved attempt is encrypted first where Vault state is involved.",
  "docs.security.sameOrigin.title": "SAME-ORIGIN BROWSER API",
  "docs.security.sameOrigin.copy":
    "Browser calls stay on the ChainScout origin. Nginx proxies to the API; credentials are omitted on anonymous private routes.",
  "docs.security.boundedDestinations.title": "BOUNDED DESTINATIONS",
  "docs.security.boundedDestinations.copy":
    "Provider hosts, methods, fields, response sizes, retries, concurrency, and budgets are constrained per adapter.",
  "docs.security.lowData.title": "LOW-DATA OPERATIONS",
  "docs.security.lowData.copy":
    "No passive analytics or third-party fonts. Request logs use route templates; public abuse-control keys are pseudonymized.",
  "docs.security.killSwitches.title": "KILL SWITCHES",
  "docs.security.killSwitches.copy":
    "Provider features have flags and shared spend/request budgets. When a critical guard is unavailable, production paths fail closed.",
  "docs.security.footer":
    "Open source helps people inspect these choices; it is not itself a security guarantee. Release gates combine typed builds, unit and browser failure tests, exact-commit staging, kill-switch exercises, and immutable release candidates.",

  "docs.token.eyebrow": "06 · DESIGN LAB · NOT LIVE",
  "docs.token.title": "Token utility without contaminating the product.",
  "docs.token.proposal.title": "PROPOSAL, NOT SHIPPED TOKENOMICS",
  "docs.token.proposal.body":
    "The ChainScout token is planned to launch through pons v2 on Robinhood Chain. Product utility, supply, allocation, vesting, quote asset, fees, creator tax, buyback setting, contract, and launch URL are not stated here as final until they exist and are publicly verified onchain.",
  "docs.token.candidates.betaAccess.label": "LOWEST COMPLEXITY",
  "docs.token.candidates.betaAccess.title": "Beta access pass",
  "docs.token.candidates.betaAccess.copy":
    "An optional wallet proof could unlock experimental modules before public release. Core privacy, Vault access, and safety explanations should remain available without a token.",
  "docs.token.candidates.apiQuota.label": "NOT IN V1",
  "docs.token.candidates.apiQuota.title": "Public API quota boosts",
  "docs.token.candidates.apiQuota.copy":
    "Open Data v1 has no keys or token entitlements. A later release could consider a bounded higher quota, but the global $0 spend ceiling and abuse limits would still override it.",
  "docs.token.candidates.partnerPerks.label": "PARTNER-FUNDED · LATER",
  "docs.token.candidates.partnerPerks.title": "Optional partner perks",
  "docs.token.candidates.partnerPerks.copy":
    "An opted-in merchant or protocol could offer a clearly scoped holder benefit. The partner funds and fulfills it; ChainScout labels the terms and never guarantees availability, value, or continuation.",
  "docs.token.candidates.sourceCuration.label": "ADVISORY ONLY",
  "docs.token.candidates.sourceCuration.title": "Advisory source curation",
  "docs.token.candidates.sourceCuration.copy":
    "Token holders could propose integrations or signal which public sources deserve review. Votes must never replace ChainScout's independent verification or make a fact true.",
  "docs.token.good.title": "GOOD TOKEN DESIGN",
  "docs.token.good.item1": "Optional, precise, auditable entitlement",
  "docs.token.good.item2":
    "Useful product entitlement rather than passive speculation",
  "docs.token.good.item3":
    "Global privacy, safety, and provider-budget limits still win",
  "docs.token.good.item4": "Official contract is the canonical identity",
  "docs.token.bad.title": "DO NOT BUILD",
  "docs.token.bad.item1": "Token-gated privacy, Vault access, or basic safety facts",
  "docs.token.bad.item2":
    "Implied equity, revenue share, yield, or guaranteed return",
  "docs.token.bad.item3": "Pay-to-rank sources, assets, or “verified” claims",
  "docs.token.bad.item4":
    "Hidden emissions, allocations, admin powers, or mutable economics",
  "docs.token.pons.title": "pons v2 is the launch rail, not the application.",
  "docs.token.pons.body":
    "Official pons v2 documentation describes a wallet-signed bonding-curve launch that graduates into a Uniswap v4 pool with its liquidity position locked. ChainScout does not run inside that curve, store Vault data in pons, or treat graduation as product quality. Every final launch term must be read from the deployed record.",
  "docs.token.pons.link": "OFFICIAL PONS V2 DOCS",
} as const;
