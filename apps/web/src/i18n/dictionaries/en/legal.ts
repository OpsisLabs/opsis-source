export const legal = {
  "legal.chrome.tag": "Legal",
  "legal.chrome.skip": "SKIP TO MAIN CONTENT",
  "legal.chrome.back": "← BACK TO SITE",
  "legal.chrome.footer":
    "© OPSIS, 2026 · INFORMATIONAL ONLY. NOT FINANCIAL ADVICE",

  "legal.privacy.title": "Privacy Policy",
  "legal.privacy.updated": "LAST UPDATED · SEPTEMBER 2026",

  "legal.privacy.s01.title": "What this product is",
  "legal.privacy.s01.body":
    "Opsis is a read-only analysis tool for public blockchain data. It explains wallets, transactions, tokens, and contracts on Robinhood Chain (chain ID 4663) in plain English, with source citations. Private Mode works without an account or wallet connection and does not create server chat history. Cloud research is deferred for the private launch. In a separately enabled cloud workspace, sign-in asks your wallet for a single message signature that proves you control the address; it authorizes nothing on-chain. The product never asks for seed phrases, private keys, or wallet credentials, and it never executes blockchain transactions or requests token approvals.",

  "legal.privacy.s02.title": "Data we collect",
  "legal.privacy.s02.privateMode.lead": "Private Mode.",
  "legal.privacy.s02.privateMode.body":
    "We do not save your question, result, or an account link on our servers. The public wallet, transaction, token, or contract identifier must be sent to the chain-data providers named in the on-screen privacy receipt. It may pass through our server memory while the response is produced. Reloading clears an unsaved browser view. If you unlock local history before asking, new questions, answer text, summaries and citations are encrypted in this browser's Vault. The passphrase, saved transcripts and encryption key are not uploaded for this local-history feature. These records survive ordinary reloads and browser restarts, but are limited to this site origin and browser profile. Clearing browser storage, eviction, private browsing or device loss can remove them; keep encrypted backups and your passphrase or matching recovery code.",
  "legal.privacy.s02.cloudAccount.lead": "Optional cloud account data.",
  "legal.privacy.s02.cloudAccount.body":
    "Wallet sign-in accounts store the public wallet address and username you choose. If email registration is enabled, we store your email address and an Argon2id hash of your password. We never store plaintext passwords.",
  "legal.privacy.s02.vault.lead": "Encrypted local Vault.",
  "legal.privacy.s02.vault.body":
    "Asset names, purchase lots, exact price and quantity strings, notes, identifiers, and locally processed photos are encrypted in this browser before they enter IndexedDB. Manual Vault records do not call a Opsis API, wallet provider, analytics service, or asset-data provider. Opsis's servers do not receive the Vault passphrase, recovery code, master key, plaintext portfolio, or encrypted records.",
  "legal.privacy.s02.portfolio.lead": "Saved.",
  "legal.privacy.s02.portfolio.body":
    "The browser sends one public Robinhood Chain address only after you review and confirm an on-screen permission receipt. Opsis and the listed providers use it transiently to produce one exact snapshot at a captured current block. That block is not final and can reorganize after the response; Opsis rechecks its hash before returning the result. We do not save the query or response. Wallet labels, other addresses, purchase lots, costs, notes, photos, manual reference prices, Vault identifiers, and the resulting ownership association stay inside encrypted local records and are not included in that request. Portfolio refresh never runs automatically or in the background.",
  "legal.privacy.s02.usage.lead": "Cloud-account usage data.",
  "legal.privacy.s02.usage.body":
    "We record usage events such as AI messages sent, chain lookups performed, provider calls, and cache hits, tied to your account for quota enforcement and abuse prevention.",
  "legal.privacy.s02.rwa.lead": "Stock-token check.",
  "legal.privacy.s02.rwa.body":
    "After an on-screen confirmation, the browser sends one public contract address to Opsis. Robinhood's public Stock Token API and the dRPC Robinhood Chain gateway are used for canonical identity and direct contract evidence. dRPC is a paid gateway that may route each read to an independent node operator in its network. Contracts not found in that registry can be checked by exact address against Morpho's public Vault API; a matching Stock Token can cause its derived public Chainlink feed address to be read. Opsis does not save the query or result, send it to a model, connect a wallet, or prepare a transaction.",
  "legal.privacy.s02.collectible.lead": "Collectible Catalog.",
  "legal.privacy.s02.collectible.enabled":
    "When you use this enabled tool, after an on-screen confirmation, Opsis receives the English card name, optional set, and optional collector number; TCGdex receives only the name and optional collector number. A selected public card ID is sent to both for detail lookup. An encrypted permission-attempt receipt is saved locally first. Search requests only card IDs, numbers, and names. A detail request may also retrieve TCGdex's catalog image base; the browser then requests a low-resolution image directly from TCGdex's asset CDN without account credentials or a referrer. Opsis does not request marketplace prices, inventory, third-party pricing fields, or printing metadata. It does not cache the query or result or send it to a model. The image is stripped of metadata and re-encoded locally before its processed bytes can enter the encrypted Vault. Owner-entered printing, condition, grade, certificate, sanitized photo, purchase data, notes, and dated manual value sources remain in the encrypted local Vault and are not included in catalog requests.",
  "legal.privacy.s02.collectible.comingSoon":
    "This tool is coming soon. If released, after an on-screen confirmation, Opsis receives the English card name, optional set, and optional collector number; TCGdex receives only the name and optional collector number. A selected public card ID is sent to both for detail lookup. An encrypted permission-attempt receipt is saved locally first. Search requests only card IDs, numbers, and names. A detail request may also retrieve TCGdex's catalog image base; the browser then requests a low-resolution image directly from TCGdex's asset CDN without account credentials or a referrer. Opsis does not request marketplace prices, inventory, third-party pricing fields, or printing metadata. It does not cache the query or result or send it to a model. The image is stripped of metadata and re-encoded locally before its processed bytes can enter the encrypted Vault. Owner-entered printing, condition, grade, certificate, sanitized photo, purchase data, notes, and dated manual value sources remain in the encrypted local Vault and are not included in catalog requests.",
  "legal.privacy.s02.market.lead": "Market & Inventory.",
  "legal.privacy.s02.market.body":
    "This tool is coming soon. If released, after an encrypted permission-attempt receipt is saved, an exact public Robinhood Chain contract can be sent transiently to Opsis and DEX Screener for bounded indexed pool context. For an explicitly opted-in WooCommerce merchant, the public canonical asset, reviewed merchant ID, code-reviewed SKU, expected product ID, and mapping review date go to Opsis. Only the SKU and expected product ID go to that store. Ownership, lots, labels, purchase price, shipping, tax, duty, fees, discounts, condition targets, region, notes, photos, other assets, account cookies, wallet connections, and AI are excluded. Those comparison inputs and normalized observations are encrypted locally. Unsupported marketplaces are opened only through a user-clicked search link; Opsis does not fetch, pre-load, scrape, rank, or claim inventory from those pages.",
  "legal.privacy.s02.savedQueries.lead": "Saved cloud queries.",
  "legal.privacy.s02.savedQueries.body":
    "Only queries submitted inside the optional saved cloud workspace are stored with chat sessions so you can revisit them. All queried chain data is already public on Robinhood Chain.",
  "legal.privacy.s02.technical.lead": "Technical data.",
  "legal.privacy.s02.technical.body":
    "Rate-limit identities use keyed, pseudonymous values instead of raw IPs. We keep structured request logs (route template, status, and latency), never questions, identifiers, user IDs, passwords, tokens, API keys, or full request headers.",

  "legal.privacy.s03.title": "Data we never collect",
  "legal.privacy.s03.body":
    "We do not collect or store private keys, seed phrases, recovery phrases, wallet passwords, or signing credentials of any kind. Wallet sign-in requests only a plain-text ownership message. Swap preview does not request or transmit your wallet address: its server sends Uniswap the selected pair, amount, and a fixed non-user preview address.",

  "legal.privacy.s04.title": "Retention",
  "legal.privacy.s04.p1":
    "Private Mode questions and answers are not retained by Opsis. Optional cloud-account source documents retrieved from chain data providers may be retained for 30 to 90 days for citation durability. Saved cloud chat messages are kept until you delete your account or an admin retention policy clears them. Raw usage events are retained for 90 days; aggregated usage metrics for up to 12 months.",
  "legal.privacy.s04.p2":
    "Local Vault ciphertext remains in this browser until you delete the Vault or the browser clears the site's storage. Opsis has no server copy and cannot set or enforce a retention period for data kept only on your device.",
  "legal.privacy.s04.p3":
    "Opsis may keep a non-sensitive, host-only, SameSite browser cookie so the introductory product tour does not reopen on every visit. It records only that the tour was dismissed—not an address, account, query, asset, holding, price, note, or Vault field—and can be recreated by opening the tour from the product sidebar.",

  "legal.privacy.s05.title": "Third-party providers",
  "legal.privacy.s05.p1":
    "Private Mode queries Blockscout for public chain data. If the indexer cannot return wallet token balances, it may send the public wallet address plus Opsis's fixed 12-contract reviewed sample to the dRPC Robinhood Chain gateway in one read-only balance call. dRPC is a paid gateway that may route each read to an independent node operator in its network. That bounded sample is not a complete asset list, price feed, valuation, activity history, or wallet-safety assessment. The on-screen receipt names every provider that received the public identifier, and your question is not sent to a model provider. The optional saved cloud workspace may use OpenAI or a self-hosted model to word an explanation. Swap preview sends Uniswap only the pair, amount, chain, and fixed non-user preview address needed for a quote. If you choose to continue, you leave Opsis for the official Uniswap app, where Uniswap's own terms and privacy policy apply. Provider API keys stay server-side and are never exposed to the frontend. We do not attach your email, username, or stored wallet address to provider requests.",
  "legal.privacy.s05.p2":
    "A confirmed Saved refresh sends the one address named in the receipt to Opsis and Blockscout. The dRPC Robinhood Chain gateway receives that address plus derived public contract, transaction, token ID, spender, and operator identifiers needed for exact reads at one captured current block. dRPC is a paid gateway that may route each read to an independent node operator in its network. That anchor is not final. The RPC gateway is rate-limited and may be unavailable; Opsis fails closed and keeps the prior encrypted local snapshot. Blockscout discovery can lag or omit data, so direct read-only RPC calls at that one block confirm displayed holdings and activity. The feature is bounded and does not claim to discover every token, NFT, internal movement, or approval. No model provider receives Saved context.",
  "legal.privacy.s05.p3":
    "Stock-token check names the attempted public providers before a lookup. Robinhood, Chainlink, and Morpho apply their own policies to public contract and derived feed requests. Opsis treats backing, custody, insurance, and redemption statements as issuer claims unless direct evidence proves a narrower fact. An onchain token, image, serial number, certificate, or provider listing does not prove a physical object exists or is authentic.",
  "legal.privacy.s05.collectible.enabled":
    "Collectible Catalog names TCGdex before each lookup. TCGdex applies its own terms and policies to public catalog searches. A catalog match identifies English card and set metadata; printing or variant remains owner-entered. It does not authenticate the object you own, verify an owner-entered grade or certificate, provide a current appraisal, or establish that marketplace inventory exists. External catalog/license/source links open only after your explicit click. A low-resolution TCGdex catalog image may be retrieved automatically after you approve an exact detail lookup; it is visual reference, not proof of authenticity, condition, ownership, or value.",
  "legal.privacy.s05.collectible.comingSoon":
    "When separately enabled, Collectible Catalog names TCGdex before each lookup. TCGdex applies its own terms and policies to public catalog searches. A catalog match identifies English card and set metadata; printing or variant remains owner-entered. It does not authenticate the object you own, verify an owner-entered grade or certificate, provide a current appraisal, or establish that marketplace inventory exists. External catalog/license/source links open only after your explicit click. A low-resolution TCGdex catalog image may be retrieved automatically after you approve an exact detail lookup; it is visual reference, not proof of authenticity, condition, ownership, or value.",
  "legal.privacy.s05.p5":
    "When separately enabled, Deal Finder can retrieve free reference prices from TCGdex (Pokémon) and YGOPRODeck (Yu-Gi-Oh!). Only the public card ID and chosen provider are submitted after an explicit click. Public responses may be cached by Opsis; wallet addresses, ownership, grades, notes and purchase prices are not included. References are not available inventory, graded-card valuations or verified sold listings. Provider mapping limitations, currencies and known or unknown update times are shown. The browser view is ephemeral and clears on Vault lock.",
  "legal.privacy.s05.p6":
    "When separately enabled, Market & Inventory names DEX Screener or the opted-in merchant before a live lookup. DEX Screener's indexed price describes the pair's base token and is not an executable quote, route, market-wide inventory claim, or recommendation. WooCommerce availability can include backorders and does not provide exact quantity. A store's product rating and review count are not seller reputation or Opsis verification. Landed-cost ordering uses only same-currency, same-identity, same-condition, same-quantity, same-region rows with every required cost entered; it never estimates tax, converts currency, or includes hidden reputation weights. The official destination independently controls any later trade, order, payment, shipping, return, and data collection.",

  "legal.privacy.s06.title": "Security",
  "legal.privacy.s06.p1":
    "Passwords are hashed with Argon2id. Browser access and refresh credentials use host-only, Secure, HttpOnly, SameSite=Strict cookies and cannot be read by page JavaScript. Refresh credentials are stored hashed and rotated on use. State-changing account requests enforce exact-origin and anti-CSRF checks. API requests are validated and rate-limited, CORS is restricted to our allowlist in production, and all database access is parameterized. Chain-data calls are read-only; write RPC methods are disabled in our provider layer.",
  "legal.privacy.s06.p2":
    "The local Vault uses a random AES-256-GCM master key. A PBKDF2-HMAC-SHA-256 key derived from the Vault passphrase wraps that master key with authenticated encryption. Each encrypted record receives a fresh authenticated-encryption nonce bound to its vault, record identity, and record version. This includes local Saved snapshots, catalog-backed collectible identities, owner claims, Market & Inventory observations, landed-cost inputs, labels, permission receipts, and reference valuations. The unlocked key is non-exportable and held only in page memory; reload, manual lock, and inactivity lock remove the app's reference to it. Browser JavaScript cannot guarantee erasure from the device's memory, and an unlocked Vault cannot protect against a compromised device, malicious browser extension, or hostile code running on the same site origin.",

  "legal.privacy.s07.title": "Your choices",
  "legal.privacy.s07.p1":
    "The optional cloud workspace includes account privacy controls that download a versioned JSON export with sessions, messages, citation references, token-usage metadata, usage records, and audit events. Deletion permanently removes the account, credentials, sessions, messages, linked usage, and linked audit rows; copied access tokens stop authorizing requests as soon as the account is gone. Deletion cannot erase public blockchain history or shared, de-associated public source documents. Private Mode has no saved Opsis history to delete.",
  "legal.privacy.s07.p2":
    "The local Vault can export a versioned encrypted backup and request browser storage persistence. Persistence lowers automatic-eviction risk but is not a backup. Clearing site data, using private browsing, losing the device, or moving to a different site origin can remove access to the Vault. An exported backup can be restored with the passphrase that existed when it was exported, or recovered with that backup's matching one-time recovery code and a new passphrase. Changing a live Vault passphrase or using recovery does not update older downloaded files. The code rotates after use and is never stored by Opsis. Losing the passphrase, recovery code, and usable backup is irreversible. Local deletion removes only the Vault IndexedDB database after the browser confirms it; it does not delete unrelated Opsis browser state.",

  "legal.privacy.s08.title": "Contact",
  "legal.privacy.s08.contact": "A support and security contact is to be published on this page.",
  "legal.privacy.s08.prefix":
    "Opsis is currently operated as an independent source-available beta.",
  "legal.privacy.s08.suffix":
    "Do not post a Vault passphrase, recovery code, wallet secret, account credential, or other private data. This policy may be updated as the product evolves; material changes will be noted on this page.",

  "legal.privacy.s09.title": "Credentialless Open Data API",
  "legal.privacy.s09.p1":
    "When enabled, Open Data v1 provides two capped public routes: a static Opsis-reviewed WETH/USDG support registry and syntax-only EVM address normalization. The routes reject account cookies and bearer credentials. A pseudonymous HMAC of the normalized client network address is stored temporarily in Redis for an hourly limit, alongside a global daily request count. The submitted public address is processed in memory and is not written to the Vault, account database, API cache, logs, analytics, or an upstream provider. Redis failure disables the surface rather than bypassing its cap.",
  "legal.privacy.s09.p2":
    "Open Data v1 does not expose wallets, transactions, balances, prices, portfolios, inventory, Vault records, user history, provider payloads, or a live-chain guarantee. Human-verification links navigate to the named third-party source; they do not copy or sublicense that source's response. Opsis claims authorship only over its response schema, deterministic normalization, support annotations, and limitations—not third-party names, symbols, addresses, trademarks, or linked materials.",

  "legal.terms.title": "Terms of Use",
  "legal.terms.updated": "LAST UPDATED · AUGUST 2026",

  "legal.terms.s01.title": "The service",
  "legal.terms.s01.body":
    "Opsis provides read-only explanations of public Robinhood Chain activity and read-only quote previews for supported token pairs. It also provides an optional local, encrypted asset Vault that does not synchronize portfolio data to Opsis servers. Saved can fetch one user-approved public address at one captured current block; private labels, purchase records, reference prices, and the combined portfolio remain local. Stock-token check can inspect one user-approved public contract against supported primary-source registries and direct read-only chain evidence without saving the lookup. Answers are grounded in public data and include citations so you can verify important claims against the source.",

  "legal.terms.s02.title": "Informational only, no advice",
  "legal.terms.s02.body":
    "The service is informational only. It does not provide investment, legal, tax, or trading advice, and nothing in an answer constitutes a recommendation to buy, sell, or hold any asset. Risk notes are evidence-based observations drawn from available on-chain data; they are not scam verdicts, safety guarantees, or proof of intent behind any wallet or contract. Quote previews are time-limited estimates, not offers or guarantees. A user who continues in Uniswap may pay network gas, liquidity-provider or protocol fees, price impact, slippage, approval costs, and token-specific fees. Stock Token availability, rights, and redemption eligibility vary by jurisdiction and may involve identity checks outside Opsis. Robinhood's published materials describe restrictions including U.S. persons, Canada, the United Kingdom, and Switzerland; users must check the current issuer terms. Morpho listing and trailing APY are provider data, not endorsements or guaranteed yield. Opsis does not mint, redeem, deposit, withdraw, sign, or broadcast an RWA transaction.",

  "legal.terms.s03.title": "Read-only boundary",
  "legal.terms.s03.p1":
    "Opsis does not execute, sign, submit, or broadcast blockchain transactions. Swap preview explains a short-lived Uniswap quote and provides a link to the official Uniswap app, which independently requotes and owns every approval, signature, and transaction. A separately enabled read-only Replay tool may use a supported historical movement pattern already decrypted inside the local Vault as context, but it never sends or reuses the old hash, calldata, amount, approval, wallet, cart, coupon, order, or checkout state. A newly entered WETH/USDG amount is sent transiently to Opsis and Uniswap and may be held in a quote cache for less than 30 seconds without a historical or account association. Merchant handoffs require a newly refreshed reviewed offer and open only the merchant's product page; the merchant owns any later cart, checkout, tax, shipping, payment, and purchase confirmation. Signing in to Opsis asks for one plain-text message signature to prove address ownership; that signature authorizes nothing on-chain and cannot move funds. Opsis never requests seed phrases, private keys, or wallet credentials, and never asks you to sign a transaction. Anyone asking for these in the product's name is not us.",
  "legal.terms.s03.p2":
    "A Vault recovery code is an application recovery secret, not a wallet seed phrase and cannot move blockchain assets. Anyone with that code plus access to the encrypted Vault can reset its passphrase, so you are responsible for keeping it separate and private.",

  "legal.terms.s04.title": "Accuracy and AI limitations",
  "legal.terms.s04.body":
    "AI can make mistakes and data providers can return incomplete data. Answers distinguish confirmed facts from inference and label uncertainty, but we do not guarantee accuracy, completeness, or timeliness. Always verify important claims through the cited explorer links before acting on them.",

  "legal.terms.s05.title": "Open Data API use",
  "legal.terms.s05.body":
    "Open Data v1, when enabled, is a small developer surface with two routes, no cross-origin browser CORS, and no service-level or redistribution guarantee. You may consume the Opsis-authored schema, deterministic normalization, support annotations, and limitations subject to applicable product terms. You receive no license from Opsis to third-party names, symbols, contract addresses, trademarks, or linked materials. You must keep identity and limitation labels accurate, respect the published caps, and may not evade them, imply official Robinhood or Blockscout status, or present syntax normalization as proof that an address exists or is safe. Opsis may reduce the cap, disable the surface, or change a future version. There is no API-key, paid-overage, bulk, live-data, or guaranteed-availability entitlement in v1.",

  "legal.terms.s06.title": "Accounts and acceptable use",
  "legal.terms.s06.body":
    "Private Mode requires no account. If you choose the optional saved cloud workspace, you are responsible for activity under that account. Usage is subject to rate limits and monthly quotas (for example, 500 AI messages and 5,000 chain lookups on standard plans). We may disable accounts that abuse the service, attempt to bypass limits, probe provider keys, or generate excessive error patterns.",

  "legal.terms.s07.title": "Independence",
  "legal.terms.s07.body":
    "Opsis is an independent tool built to help users understand public Robinhood Chain data. Except where explicitly stated, it is not an official product of, or endorsed by, Robinhood.",

  "legal.terms.s08.title": "Availability and changes",
  "legal.terms.s08.body":
    "The service depends on third-party chain data and AI providers; degraded provider performance may affect answers, in which case the product falls back to cached or deterministic summaries and says so. We may update these terms as the product evolves; continued use after an update constitutes acceptance.",

  "legal.terms.s09.title": "Liability",
  "legal.terms.s09.body":
    "To the maximum extent permitted by law, we are not liable for decisions made based on the service's output, for provider outages or data gaps, or for any indirect or consequential losses. Browser storage can be cleared or evicted, and a forgotten Vault passphrase cannot be reset without the matching recovery code. You are responsible for keeping current encrypted backups and recovery material. The service is provided \"as is\" during the beta period.",
} as const;
