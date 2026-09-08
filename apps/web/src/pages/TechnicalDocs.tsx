import {
  ArrowDown,
  ArrowRight,
  Binary,
  BookOpenText,
  Braces,
  Check,
  CircleAlert,
  Code2,
  Database,
  ExternalLink,
  Fingerprint,
  Gauge,
  KeyRound,
  LockKeyhole,
  Network,
  ScanSearch,
  ServerCog,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { Link } from "react-router";
import KnowledgeHeader from "./KnowledgeHeader";
import { isCollectibleCatalogEnabled } from "../product/availability";

const COLLECTIBLE_CATALOG_ENABLED = isCollectibleCatalogEnabled();

const SECTIONS = [
  ["architecture", "Architecture"],
  ["vault", "Encrypted Vault"],
  ["evidence", "Evidence pipeline"],
  ["adapters", "Feature adapters"],
  ["security", "Security boundary"],
  ["token", "Token design"],
] as const;

const ADAPTERS = [
  {
    name: "PRIVATE EXPLORER",
    input: "One public wallet, transaction, token, or contract",
    process: "Bounded provider resolution + deterministic explanation",
    output: "Source-linked facts, coverage, risks, and plain English",
    limit: "Unsaved by default; optional encrypted local chat history",
  },
  {
    name: "SCOUT SWAP",
    input: "WETH/USDG direction and exact amount",
    process: "Read-only Uniswap route using a fixed non-user preview address",
    output: "Minimum, impact, simulation, route cost, official handoff",
    limit: "ChainScout never signs or broadcasts",
  },
  {
    name: "PORTFOLIO",
    input: "One approved Robinhood Chain address",
    process: "Capture current block, reconcile direct reads, recheck block hash",
    output: "Bounded holdings, activity, movements, approvals, coverage",
    limit: "Current anchor is not final; partial data stays marked",
  },
  {
    name: "RWA VERIFY",
    input: "One public token or vault contract",
    process: "Contract-first identity, oracle, role, vault, and source checks",
    output: "Confirmed, unavailable, stale, and owner-reported evidence",
    limit: "Evidence is not authenticity, redemption, or appraisal",
  },
  {
    name: "COLLECTIBLES",
    input: "English card name, number, and optional set",
    process: "Field-selective TCGdex metadata + optional low-res asset-CDN image",
    output: "Card/set identity and sanitized encrypted thumbnail; owner claims stay local",
    limit: "No marketplace pricing, grading, authenticity, or inventory claim",
    gated: !COLLECTIBLE_CATALOG_ENABLED,
  },
  {
    name: "MARKET & INVENTORY",
    input: "Exact public contract or reviewed merchant mapping",
    process: "Bounded DEX observations or opted-in merchant availability",
    output: "Freshness, identity, source, availability, local landed cost",
    limit: "No execution, scraping, complete inventory, or seller score",
    gated: true,
  },
  {
    name: "OPEN DATA V1",
    input: "One reviewed support-registry read or one public EVM address",
    process: "Static ChainScout tuple or deterministic syntax normalization",
    output: "Versioned annotations, limitations, and human-verification links",
    limit: "Two routes; no provider calls, search, live state, API keys, or bulk data",
    gated: true,
  },
  {
    name: "REPLAY ACTIONS",
    input: "One complete local movement pattern or freshly reviewed offer",
    process: "Strict local pattern check + mandatory new direction/amount or current offer",
    output: "Fresh quote or official product-page handoff",
    limit: "No old calldata, approval, amount, cart, order, or checkout reuse",
    gated: true,
  },
];

const TOKEN_CANDIDATES = [
  {
    title: "Beta access pass",
    copy: "An optional wallet proof could unlock experimental modules before public release. Core privacy, Vault access, and safety explanations should remain available without a token.",
    label: "LOWEST COMPLEXITY",
  },
  {
    title: "Public API quota boosts",
    copy: "Open Data v1 has no keys or token entitlements. A later release could consider a bounded higher quota, but the global $0 spend ceiling and abuse limits would still override it.",
    label: "NOT IN V1",
  },
  {
    title: "Optional partner perks",
    copy: "An opted-in merchant or protocol could offer a clearly scoped holder benefit. The partner funds and fulfills it; ChainScout labels the terms and never guarantees availability, value, or continuation.",
    label: "PARTNER-FUNDED · LATER",
  },
  {
    title: "Advisory source curation",
    copy: "Token holders could propose integrations or signal which public sources deserve review. Votes must never replace ChainScout's independent verification or make a fact true.",
    label: "ADVISORY ONLY",
  },
];

function DocSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[#383838] pt-12 sm:pt-16">
      <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{eyebrow}</p>
      <h2 className="mt-3 text-[31px] font-medium tracking-[-0.035em] text-[#f0e8da] sm:text-[40px]">{title}</h2>
      {children}
    </section>
  );
}

export default function TechnicalDocs() {
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <KnowledgeHeader active="docs" />

      <main className="mx-auto grid w-full max-w-[1240px] gap-10 px-4 pb-24 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 border-l border-[#383838] pl-4" aria-label="Technical documentation sections">
            <p className="mb-4 font-mono-d text-[8px] tracking-[0.18em] text-[#635d5a]">ON THIS PAGE</p>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block py-2 text-[11.5px] text-[#8f8880] transition-colors hover:text-[#fa6c34]">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <section className="max-w-[900px]">
            <div className="inline-flex items-center gap-2 border border-[#fa6c34]/40 bg-[#fa6c34]/8 px-3 py-2 font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
              <Code2 size={13} /> TECHNICAL REFERENCE · ROBINHOOD CHAIN 4663
            </div>
            <h1 className="mt-6 text-[46px] font-medium leading-[0.96] tracking-[-0.05em] text-[#f0e8da] sm:text-[68px]">
              How ChainScout<br /><span className="text-[#bdb3a6]">actually works.</span>
            </h1>
            <p className="mt-6 max-w-[760px] text-[15px] leading-relaxed text-[#9a938a]">
              ChainScout is a read-only asset-intelligence layer plus a browser-encrypted ownership layer. It resolves exact public identifiers, normalizes bounded evidence, labels uncertainty, and keeps the private context that makes an asset yours off the server.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <a href="https://github.com/ChainScoutAi/chainscout-source" target="_blank" rel="noreferrer" className="clip-btn-sm inline-flex items-center gap-2 bg-[#fa6c34] px-5 py-3 font-mono-d text-[9px] font-semibold tracking-[0.1em] text-[#1d1d1d] hover:bg-[#ff7c48]">
                VIEW SOURCE <ExternalLink size={12} />
              </a>
              <Link to="/faq" className="inline-flex items-center gap-2 border border-[#484848] px-5 py-3 font-mono-d text-[9px] tracking-[0.1em] text-[#c7bdb0] hover:border-[#fa6c34] hover:text-[#f0e8da]">
                READ THE FAQ <ArrowRight size={12} />
              </Link>
            </div>
          </section>

          <DocSection id="architecture" eyebrow="01 · DATA PATHS" title="Three modes, three different boundaries.">
            <p className="mt-4 max-w-[760px] text-[13.5px] leading-relaxed text-[#9a938a]">
              ChainScout separates unsaved public lookups from opt-in encrypted local history and ownership records. Cloud research is deferred to a future update, not a launch dependency.
            </p>
            <div className="mt-7 grid gap-px border border-[#383838] bg-[#383838] md:grid-cols-3">
              {[
                [ScanSearch, "EPHEMERAL LOOKUP", "Public identifier", "Same-origin API", "No server history", "Unsaved results clear on reload. Named providers receive only the disclosed public fields required for that lookup. Saved transcripts are not uploaded as context."],
                [LockKeyhole, "LOCAL VAULT + CHATS", "Opt-in history and ownership", "Web Crypto + IndexedDB", "Encrypted browser records", "Unlock before asking to autosave questions, answers and sources. Record version 5 binds conversations to the existing AES-GCM Vault key. Backups authenticate and restore chats alongside asset records. Same browser profile and origin only; browser deletion or eviction still requires a backup."],
                [ServerCog, "CLOUD · FUTURE UPDATE", "Not enabled for launch", "Separate future workspace", "No cloud retention promised", "Existing account recovery/export routes remain available where configured. Cloud research is not needed for local chat history or the Vault."],
              ].map(([Icon, name, input, path, storage, copy]) => {
                const DataIcon = Icon as typeof ScanSearch;
                return (
                  <article key={String(name)} className="bg-[#222222] p-5 sm:p-6">
                    <DataIcon size={18} className="text-[#fa6c34]" />
                    <h3 className="mt-5 font-mono-d text-[10px] tracking-[0.13em] text-[#f0e8da]">{String(name)}</h3>
                    <dl className="mt-5 space-y-3 text-[10.5px]">
                      <div><dt className="text-[#635d5a]">INPUT</dt><dd className="mt-1 text-[#b7aea2]">{String(input)}</dd></div>
                      <div><dt className="text-[#635d5a]">PATH</dt><dd className="mt-1 text-[#b7aea2]">{String(path)}</dd></div>
                      <div><dt className="text-[#635d5a]">STORAGE</dt><dd className="mt-1 text-[#b7aea2]">{String(storage)}</dd></div>
                    </dl>
                    <p className="mt-5 border-t border-[#383838] pt-4 text-[11px] leading-relaxed text-[#8f8880]">{String(copy)}</p>
                  </article>
                );
              })}
            </div>

            <div className="mt-7 overflow-hidden border border-[#3b3735] bg-[#211f1e] p-5 sm:p-7">
              <p className="font-mono-d text-[8px] tracking-[0.16em] text-[#635d5a]">PUBLIC LOOKUP PIPELINE</p>
              <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
                {[
                  [Braces, "BROWSER", "strict input"],
                  [Network, "SAME ORIGIN", "/v1 private route"],
                  [ServerCog, "ADAPTERS", "fixed providers"],
                  [ShieldCheck, "NORMALIZED", "sources + limits"],
                ].map(([Icon, name, note], index) => {
                  const FlowIcon = Icon as typeof Braces;
                  return (
                    <div key={String(name)} className="contents">
                      <div className="border border-[#3b3735] bg-[#252321] p-4 text-center">
                        <FlowIcon size={15} className="mx-auto text-[#fa6c34]" />
                        <p className="mt-3 font-mono-d text-[8px] tracking-[0.12em] text-[#ded5c8]">{String(name)}</p>
                        <p className="mt-1 text-[9.5px] text-[#716b65]">{String(note)}</p>
                      </div>
                      {index < 3 && <ArrowDown size={13} className="mx-auto rotate-0 text-[#fa6c34] sm:-rotate-90" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </DocSection>

          <DocSection id="vault" eyebrow="02 · LOCAL CRYPTOGRAPHY" title="The Vault is encrypted before storage.">
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <article className="border border-[#383838] bg-[#222222] p-6">
                <KeyRound size={19} className="text-[#fa6c34]" />
                <h3 className="mt-5 text-[20px] text-[#f0e8da]">Key lifecycle</h3>
                <ol className="mt-5 space-y-4">
                  {[
                    "Generate a random 256-bit data-encryption key in Web Crypto.",
                    "Derive a wrapping key from the normalized passphrase using PBKDF2-HMAC-SHA-256, a random salt, and 600,000 iterations.",
                    "Wrap the data key with AES-256-GCM. After unlock, use a non-extractable session key.",
                    "Lock removes the app's references to plaintext state and the session key; reload returns locked.",
                  ].map((item, index) => (
                    <li key={item} className="flex gap-3 text-[11.5px] leading-relaxed text-[#9a938a]"><span className="font-mono-d text-[9px] text-[#fa6c34]">0{index + 1}</span>{item}</li>
                  ))}
                </ol>
              </article>
              <article className="border border-[#383838] bg-[#222222] p-6">
                <Database size={19} className="text-[#fa6c34]" />
                <h3 className="mt-5 text-[20px] text-[#f0e8da]">Record integrity</h3>
                <ul className="mt-5 space-y-4">
                  {[
                    "Each record uses a fresh 96-bit AES-GCM IV.",
                    "Authenticated data binds the Vault ID, record ID, and record version, so ciphertext cannot be silently moved or relabeled.",
                    "Revision checks stop stale tabs from overwriting newer local state.",
                    "Encrypted backups authenticate the manifest and mixed record versions before replacing an existing Vault.",
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-[11.5px] leading-relaxed text-[#9a938a]"><Check size={12} className="mt-0.5 shrink-0 text-[#7fb069]" />{item}</li>
                  ))}
                </ul>
              </article>
            </div>
            <div className="mt-4 border border-[#6b4a3b] bg-[#2a211e] p-5">
              <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.13em] text-[#ff9b72]"><CircleAlert size={13} /> WHAT THIS DOES NOT PROTECT</p>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[#b7aea2]">A compromised browser, malicious extension, hostile same-origin code, screen capture, keylogger, or device attacker may see data while the Vault is unlocked. Browser storage can also be cleared or evicted. Keep an encrypted backup and its matching passphrase or recovery code somewhere separate.</p>
            </div>
            <div className="mt-4 border border-[#383838] bg-[#222222] p-5 sm:p-6">
              <p className="font-mono-d text-[9px] tracking-[0.13em] text-[#fa6c34]">LOCAL VISUALIZATION LAYER</p>
              <p className="mt-3 max-w-[800px] text-[11.5px] leading-relaxed text-[#9a938a]">
                Apache ECharts renders SVG inside the unlocked Vault. Record-mix charts use encrypted record counts; collectible history uses exact purchase lots plus up to 20 owner-entered dated references; portfolio allocation uses explicitly entered reference values and keeps currencies separate. JavaScript numbers are used only as plotting coordinates after exact-string math. The source values remain visible in an adjacent accessible table, and no chart library or chart API receives them over the network.
              </p>
            </div>
          </DocSection>

          <DocSection id="evidence" eyebrow="03 · NORMALIZATION" title="A source is not automatically a fact.">
            <p className="mt-4 max-w-[760px] text-[13.5px] leading-relaxed text-[#9a938a]">Every adapter converts provider-specific responses into a smaller internal model. The interface is designed to expose why a statement appears—not merely print whatever an API returned.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [Fingerprint, "CANONICAL IDENTITY", "Match full chain, contract, transaction, card/set, product, or pool identifiers before attaching data."],
                [Binary, "EXACT VALUES", "Keep token IDs and large integers as strings. Local landed-cost math uses decimal coefficients, not JavaScript floats."],
                [Gauge, "FRESHNESS", "Return fetched time and a bounded freshness duration. Current, stale, valid-empty, partial, and unavailable are different states."],
                [ScanSearch, "DIRECT RECONCILIATION", "Indexed discovery finds candidates; direct chain reads win where the feature requires onchain ownership or state."],
                [BookOpenText, "PROVENANCE", "Normalized rows retain a human source link and enough identity context to audit what was actually observed."],
                [ShieldCheck, "FAIL CLOSED", "Malformed, oversized, redirected, rate-limited, over-budget, or identity-conflicting responses do not become clean facts."],
              ].map(([Icon, title, copy]) => {
                const EvidenceIcon = Icon as typeof Fingerprint;
                return (
                  <article key={String(title)} className="border border-[#383838] bg-[#222222] p-5">
                    <EvidenceIcon size={16} className="text-[#fa6c34]" />
                    <h3 className="mt-4 font-mono-d text-[9px] tracking-[0.12em] text-[#ded5c8]">{String(title)}</h3>
                    <p className="mt-3 text-[11px] leading-relaxed text-[#8f8880]">{String(copy)}</p>
                  </article>
                );
              })}
            </div>
          </DocSection>

          <DocSection id="adapters" eyebrow="04 · FEATURE CONTRACTS" title="Different assets need different proof.">
            <p className="mt-4 max-w-[780px] text-[12px] leading-relaxed text-[#b7aea2]">
              Current founder-beta build: Private Explorer, Scout Swap, Portfolio,
              RWA Verify{COLLECTIBLE_CATALOG_ENABLED ? ", and Collectible Catalog" : ""} are enabled. {COLLECTIBLE_CATALOG_ENABLED ? "Market & Inventory, Open Data, and Replay Actions" : "Collectible Catalog, Market & Inventory, Open Data, and Replay Actions"} are coming soon.
            </p>
            <div className="mt-7 overflow-hidden border border-[#383838]">
              {ADAPTERS.map((adapter) => (
                <details key={adapter.name} className="group border-b border-[#383838] bg-[#222222] last:border-b-0 open:bg-[#252321]">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#fa6c34]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#fa6c34]/45 font-mono-d text-[8px] text-[#fa6c34]">{adapter.name.slice(0, 2)}</span>
                    <span className="font-mono-d text-[9px] tracking-[0.12em] text-[#e2d9cc]">{adapter.name}</span>
                    {adapter.gated && <span className="border border-[#766f68] px-2 py-1 font-mono-d text-[7px] tracking-[0.1em] text-[#c8beb4]">COMING SOON</span>}
                    <span className="ml-auto text-[#fa6c34] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <dl className="grid gap-px border-t border-[#383838] bg-[#383838] sm:grid-cols-2">
                    {[
                      ["INPUT", adapter.input],
                      ["PROCESS", adapter.process],
                      ["OUTPUT", adapter.output],
                      ["BOUNDARY", adapter.limit],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-[#1f1f1f] p-5"><dt className="font-mono-d text-[8px] tracking-[0.14em] text-[#635d5a]">{label}</dt><dd className="mt-2 text-[11px] leading-relaxed text-[#aaa197]">{value}</dd></div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          </DocSection>

          <DocSection id="security" eyebrow="05 · DEFENSE IN DEPTH" title="Privacy is a collection of boundaries.">
            <div className="mt-7 grid gap-px border border-[#383838] bg-[#383838] md:grid-cols-2">
              {[
                ["NO SIGNER", "ChainScout never asks for a seed phrase and does not approve, sign, route, submit, or broadcast transactions."],
                ["EXPLICIT NETWORK RECEIPTS", "Sensitive public associations are sent only after the UI names the destination and fields. The approved attempt is encrypted first where Vault state is involved."],
                ["SAME-ORIGIN BROWSER API", "Browser calls stay on the ChainScout origin. Nginx proxies to the API; credentials are omitted on anonymous private routes."],
                ["BOUNDED DESTINATIONS", "Provider hosts, methods, fields, response sizes, retries, concurrency, and budgets are constrained per adapter."],
                ["LOW-DATA OPERATIONS", "No passive analytics or third-party fonts. Request logs use route templates; public abuse-control keys are pseudonymized."],
                ["KILL SWITCHES", "Provider features have flags and shared spend/request budgets. When a critical guard is unavailable, production paths fail closed."],
              ].map(([title, copy]) => (
                <article key={title} className="bg-[#222222] p-5 sm:p-6"><p className="font-mono-d text-[9px] tracking-[0.13em] text-[#fa6c34]">{title}</p><p className="mt-3 text-[11.5px] leading-relaxed text-[#9a938a]">{copy}</p></article>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-[#716b65]">Open source helps people inspect these choices; it is not itself a security guarantee. Release gates combine typed builds, unit and browser failure tests, exact-commit staging, kill-switch exercises, and immutable release candidates.</p>
          </DocSection>

          <DocSection id="token" eyebrow="06 · DESIGN LAB · NOT LIVE" title="Token utility without contaminating the product.">
            <div className="mt-5 border border-[#fa6c34] bg-[#fa6c34] p-5 text-[#1d1d1d] sm:p-6">
              <p className="flex items-center gap-2 font-mono-d text-[9px] font-semibold tracking-[0.14em]"><Sparkles size={13} /> PROPOSAL, NOT SHIPPED TOKENOMICS</p>
              <p className="mt-3 max-w-[780px] text-[12px] font-medium leading-relaxed text-[#1d1d1d]">The ChainScout token is planned to launch through pons v2 on Robinhood Chain. Product utility, supply, allocation, vesting, quote asset, fees, creator tax, buyback setting, contract, and launch URL are not stated here as final until they exist and are publicly verified onchain.</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TOKEN_CANDIDATES.map((item) => (
                <article key={item.title} className="border border-[#4a3b35] bg-[#24211f] p-5 sm:p-6">
                  <p className="font-mono-d text-[8px] tracking-[0.14em] text-[#fa6c34]">{item.label}</p>
                  <h3 className="mt-3 text-[20px] text-[#f0e8da]">{item.title}</h3>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-[#9a938a]">{item.copy}</p>
                </article>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <article className="border border-[#3d5538] bg-[#20251f] p-5 sm:p-6">
                <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.13em] text-[#7fb069]"><Check size={13} /> GOOD TOKEN DESIGN</p>
                <ul className="mt-4 space-y-3 text-[11.5px] leading-relaxed text-[#a8a198]">
                  <li>• Optional, precise, auditable entitlement</li>
                  <li>• Useful product entitlement rather than passive speculation</li>
                  <li>• Global privacy, safety, and provider-budget limits still win</li>
                  <li>• Official contract is the canonical identity</li>
                </ul>
              </article>
              <article className="border border-[#6a3b45] bg-[#282022] p-5 sm:p-6">
                <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.13em] text-[#e0738a]"><X size={13} /> DO NOT BUILD</p>
                <ul className="mt-4 space-y-3 text-[11.5px] leading-relaxed text-[#aaa197]">
                  <li>• Token-gated privacy, Vault access, or basic safety facts</li>
                  <li>• Implied equity, revenue share, yield, or guaranteed return</li>
                  <li>• Pay-to-rank sources, assets, or “verified” claims</li>
                  <li>• Hidden emissions, allocations, admin powers, or mutable economics</li>
                </ul>
              </article>
            </div>
            <div className="mt-5 border border-[#383838] bg-[#222222] p-5 sm:p-6">
              <div className="flex items-center gap-3"><WalletCards size={17} className="text-[#fa6c34]" /><h3 className="text-[18px] text-[#e9e0d1]">pons v2 is the launch rail, not the application.</h3></div>
              <p className="mt-3 max-w-[820px] text-[11.5px] leading-relaxed text-[#9a938a]">Official pons v2 documentation describes a wallet-signed bonding-curve launch that graduates into a Uniswap v4 pool with its liquidity position locked. ChainScout does not run inside that curve, store Vault data in pons, or treat graduation as product quality. Every final launch term must be read from the deployed record.</p>
              <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 font-mono-d text-[9px] tracking-[0.12em] text-[#fa6c34] hover:text-[#ff9b72]">OFFICIAL PONS V2 DOCS <ExternalLink size={11} /></a>
            </div>
          </DocSection>
        </div>
      </main>
    </div>
  );
}
