import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Github,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router";
import KnowledgeHeader from "./KnowledgeHeader";
import { isCollectibleCatalogEnabled } from "../product/availability";

const COLLECTIBLE_CATALOG_ENABLED = isCollectibleCatalogEnabled();

type FaqItem = {
  question: string;
  answer: React.ReactNode;
};

const FAQ_GROUPS: Array<{ id: string; title: string; intro: string; items: FaqItem[] }> = [
  {
    id: "basics",
    title: "What it is—and is not",
    intro: "The questions to answer before trusting a new asset product.",
    items: [
      {
        question: "What is ChainScout in one sentence?",
        answer: "ChainScout turns scattered public asset evidence into one understandable workspace, then lets you combine it with ownership details that can remain encrypted on your device.",
      },
      {
        question: "Is ChainScout a wallet, exchange, broker, or custodian?",
        answer: "No. ChainScout is a read-only research and organization layer. It does not hold funds or keys, collect seed phrases, approve tokens, sign transactions, submit orders, or broadcast anything to a network.",
      },
      {
        question: "Do I need to connect a wallet or create an account?",
        answer: "No for the main product. Private Explorer needs neither. The local Vault uses a passphrase, not a wallet. Wallet sign-in belongs only to the separate optional saved-research workspace.",
      },
      {
        question: "Does ChainScout tell me what to buy?",
        answer: "No. It presents sourced facts, uncertainty, comparisons, and limitations. It does not give personalized investment instructions, guarantee a price, or certify that an asset is safe.",
      },
      {
        question: "Why is ChainScout focused on Robinhood Chain?",
        answer: "The launch product is deliberately narrow: Robinhood Chain mainnet, chain ID 4663. That lets each adapter have explicit contracts, providers, failure states, and coverage instead of pretending a shallow multichain result is complete.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy and the encrypted Vault",
    intro: "What leaves the browser, what stays local, and what the word private really means.",
    items: [
      {
        question: "Will my chats still be here after restarting?",
        answer: "Yes, successfully saved chats remain encrypted in the same browser profile at the same site address. Unlock your Vault again to reopen them. You must enable local autosave before asking; unsaved lookups are not retroactively retained. A site update does not intentionally clear history. Browser storage can still be cleared or evicted, so export an encrypted backup regularly. Incognito, a different browser, a different domain, a lost passphrase or device failure are not covered by a retention guarantee.",
      },
      {
        question: "Are saved answers still current?",
        answer: "No. Saved answers and citations are dated snapshots. Ask again for a fresh lookup. Each question is independently resolved; the saved transcript is never uploaded as conversation context. Local history preserves the answer text, summary and source links, not a live provider connection.",
      },
      {
        question: "What information is stored on ChainScout's servers?",
        answer: "Private Explorer and the no-account Vault do not save chats or portfolios on our servers. Public lookup fields pass through server memory to disclosed providers. If you unlock local history before asking, your questions, answers and sources are encrypted in this browser's Vault. Cloud research is a future update.",
      },
      {
        question: "What stays inside the local Vault?",
        answer: "Asset names, ownership groupings, wallet labels, purchase lots, prices, notes, locally processed photos, reference values, and permission receipts are encrypted before IndexedDB stores them in your browser. Coming-soon tools cannot add records unless they are explicitly released later.",
      },
      {
        question: "Can ChainScout see a public wallet address I look up?",
        answer: "During an approved network lookup, yes: ChainScout, Railway, and the providers named in the receipt can transiently see the public identifier and normal network metadata. Private means the association is minimized and not stored as a server portfolio—not that the network request is invisible.",
      },
      {
        question: "How is the Vault encrypted?",
        answer: "The browser generates a random AES-256-GCM data key. A key derived from your passphrase with PBKDF2-HMAC-SHA-256, a random salt, and 600,000 iterations wraps that data key. Individual records use fresh IVs and authenticated record identity. The unlocked session key is non-extractable.",
      },
      {
        question: "What happens if I lose the device or clear browser data?",
        answer: "Local storage can be cleared or evicted. Export an encrypted backup and keep its matching passphrase or recovery code separately. Without a usable local Vault, backup, passphrase, or recovery code, ChainScout cannot reset the encryption for you.",
      },
      {
        question: "Does local encryption protect me from everything?",
        answer: "No. A compromised device, browser, extension, screen recorder, keylogger, or hostile code running on the same origin may see data while the Vault is unlocked. Lock when finished and keep the device and browser updated.",
      },
    ],
  },
  {
    id: "evidence",
    title: "Accuracy, values, and verification",
    intro: "How to read the words current, exact, verified, empty, and unavailable.",
    items: [
      {
        question: "Where do values and prices come from?",
        answer: `In the enabled founder beta, swap previews come from Uniswap; onchain balances and states come from the named chain providers; RWA facts come from their named sources; and manual values are owner-entered and dated. Vault charts visualize those exact local inputs and expose an accessible data table; they do not create a live price feed or appraisal. ${COLLECTIBLE_CATALOG_ENABLED ? "TCGdex catalog assistance is enabled for English card/set identity and optional sanitized thumbnails; it does not provide marketplace pricing or appraisal." : "TCGdex catalog assistance is coming soon."} DEX Screener market observations remain coming soon.`,
      },
      {
        question: COLLECTIBLE_CATALOG_ENABLED ? "How does Pokémon card matching work?" : "Can I track Pokémon cards before the catalog is enabled?",
        answer: COLLECTIBLE_CATALOG_ENABLED ? "Open Collectible Catalog in the unlocked Vault, confirm the exact network receipt, and search an English card name with optional number and set. TCGdex supplies bounded card/set identity and an optional low-resolution thumbnail that ChainScout sanitizes locally. Printing, condition, grade, certificate, authenticity, purchase lots, and dated values remain owner-entered and encrypted." : "Yes. Create a manual Collectible record in the local Vault. You can save an identifier, owner-reported printing and condition, one-copy grade and certificate details, exact purchase lots, a locally processed photo, and up to 20 dated source-linked reference values. The chart uses those encrypted inputs and never calls them catalog-verified or live market prices.",
      },
      {
        question: "Does ChainScout calculate my portfolio profit?",
        answer: "Only when the required local inputs are comparable. ChainScout keeps exact decimal strings, does not silently mix currencies, and does not invent missing prices, tax lots, foreign-exchange rates, shipping, fees, or disposals.",
      },
      {
        question: "What does “verified” mean here?",
        answer: "It means a specific fact passed that feature's identity and source checks—for example, an exact contract read or exact reviewed merchant mapping. It does not mean the whole asset is authentic, solvent, redeemable, profitable, safe, endorsed, or legally compliant.",
      },
      {
        question: "Why can two providers disagree?",
        answer: "Indexers update at different times and model data differently. For state that can be checked directly onchain, ChainScout treats indexed data as discovery and the direct read as authoritative. The interface keeps partial, stale, conflicting, and unavailable states visible rather than merging them into false certainty.",
      },
      {
        question: "Does “valid empty” prove nothing exists?",
        answer: "No. It means the named provider returned a structurally valid empty result inside the documented bounded query. A pool, listing, transfer, or item may exist outside that provider's coverage or response cap.",
      },
      {
        question: "How fresh is the information?",
        answer: "Enabled network results expose their captured time, anchor, or expiry as applicable. The coming-soon Market tool additionally has bounded saved-observation freshness; it cannot rank an expired offer if that tool is released later.",
      },
      {
        question: "Does ChainScout use AI to invent the answer?",
        answer: "No. The no-account Private Explorer uses deterministic, source-linked explanations and does not send the optional question to an AI model. Any future or optional model-assisted rewriting must use an explicit disclosed payload; the facts and citations come from validated adapters first.",
      },
    ],
  },
  {
    id: "actions",
    title: "Trading, merchants, and external actions",
    intro: "Where ChainScout stops and another product takes over.",
    items: [
      {
        question: "Can I execute a swap inside ChainScout?",
        answer: "No. Scout Swap explains a short-lived read-only Uniswap preview. If you continue, the official Uniswap interface owns the wallet connection, fresh quote, approval, signature, fees, and execution.",
      },
      {
        question: "What does Replay Actions actually replay?",
        answer: "Replay Actions is coming soon. Its reviewed boundary never replays anything: one complete WETH/USDG movement pattern is only local context, direction is reconfirmed, and the new amount starts blank. Its purchase branch requires a newly refreshed reviewed offer and opens a product page—not an old cart or checkout.",
      },
      {
        question: "Why not scrape every store and marketplace?",
        answer: "Because technical access is not the same as permission, accuracy, or stable rights. Merchant inventory is coming soon and its real registry is currently empty. If released later, ChainScout will query a merchant only after explicit opt-in and a reviewed exact mapping; unsupported venues never become hidden scrapers.",
      },
      {
        question: "Does a merchant result include seller reputation?",
        answer: "Not unless an approved source supplies a clearly defined seller-reputation field. A WooCommerce product rating is a product signal, not seller reputation, and it is never used to secretly weight landed-cost rankings.",
      },
      {
        question: "Are ChainScout actions free?",
        answer: "Do not assume that. ChainScout's infrastructure is designed around a $0 incremental vendor-spend constraint, but users may still pay network gas, protocol or creator fees, slippage, merchant prices, shipping, tax, duty, grading, or other external costs. The official venue shows the final action cost.",
      },
    ],
  },
  {
    id: "token",
    title: "ChainScout token and tokenomics",
    intro: "What is planned, what is merely proposed, and what should never be implied.",
    items: [
      {
        question: "Is there an official ChainScout token contract?",
        answer: "A ChainScout token is planned to launch through pons v2 on Robinhood Chain, but this page does not publish a token contract, ticker, quote asset, supply, allocation, fees, creator tax, buyback setting, or launch URL as final. Verify the official contract after deployment; names and tickers can be copied.",
      },
      {
        question: "What would the token actually do?",
        answer: "No product utility is approved as live today. The current design candidates are optional beta access, bounded public-API quota boosts after that API ships, advisory source curation, and optional partner-funded perks. None should paywall the Vault, privacy, or basic safety information, and ChainScout should never guarantee a partner benefit.",
      },
      {
        question: "Does the token represent equity, revenue, yield, or guaranteed returns?",
        answer: "No such right is stated or implied. A launch token can be highly volatile and can lose all value. Product access, governance, payment, burning, staking, allocations, admin controls, vesting, and any economic right must be described precisely only if they are implemented and approved.",
      },
      {
        question: "Does pons or Robinhood operate or endorse ChainScout?",
        answer: "No endorsement or partnership is implied. pons v2 is the planned launch protocol, Robinhood Chain is the network, and ChainScout is a separate application. The Vault does not store data in pons and the product does not depend on a token graduating.",
      },
      {
        question: "What happens during a pons v2 launch?",
        answer: (
          <>
            Official pons v2 documentation describes wallet-signed trading on a bonding curve followed by graduation into a Uniswap v4 pool whose full-range liquidity position is locked. Fees, creator tax, quote asset, buyback setting, and phase vary by the deployed launch and must be checked before interacting. See the{" "}
            <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noreferrer" className="text-[#fa6c34] underline decoration-[#fa6c34]/45 underline-offset-4 hover:text-[#ff9b72]">official pons v2 documentation</a>.
          </>
        ),
      },
    ],
  },
  {
    id: "project",
    title: "Project, code, and support",
    intro: "How to inspect the implementation and understand what is still planned.",
    items: [
      {
        question: "Is ChainScout open source?",
        answer: (
          <>
            The public repository is available at{" "}
            <a href="https://github.com/ChainScoutAi/chainscout-source" target="_blank" rel="noreferrer" className="text-[#fa6c34] underline decoration-[#fa6c34]/45 underline-offset-4 hover:text-[#ff9b72]">github.com/ChainScoutAi/chainscout-source</a>. Open source improves inspectability; it does not automatically prove that deployed code is bug-free or that every third-party source is correct.
          </>
        ),
      },
      {
        question: "Is there a public ChainScout API?",
        answer: "A deliberately small Open Data v1 is coming soon: one reviewed WETH/USDG support registry and one syntax-only EVM-address normalizer. It has no API keys, search, bulk export, wallet or transaction summaries, prices, Vault data, provider calls, or mirrored provider payloads. Its public release still depends on final nominative trademark and API-terms review.",
      },
      {
        question: "Where can I see what is live versus planned?",
        answer: (
          <>
            Use the <Link to="/guide" className="text-[#fa6c34] underline decoration-[#fa6c34]/45 underline-offset-4">Start Guide</Link> for available flows and clearly labeled coming-soon tools, the <Link to="/docs" className="text-[#fa6c34] underline decoration-[#fa6c34]/45 underline-offset-4">Technical Docs</Link> for implementation boundaries, and the <Link to="/roadmap" className="text-[#fa6c34] underline decoration-[#fa6c34]/45 underline-offset-4">Roadmap</Link> for future releases. Proposed token utility is not a shipped feature. Merchant inventory also remains unavailable until a real store explicitly opts in and its exact mapping is reviewed.
          </>
        ),
      },
    ],
  },
];

export default function Faq() {
  const questionCount = FAQ_GROUPS.reduce((total, group) => total + group.items.length, 0);
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <KnowledgeHeader active="faq" />

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <section className="max-w-[860px]">
          <div className="inline-flex items-center gap-2 border border-[#fa6c34]/40 bg-[#fa6c34]/8 px-3 py-2 font-mono-d text-[9px] tracking-[0.14em] text-[#fa6c34]">
            <CircleHelp size={13} /> {questionCount} STRAIGHT ANSWERS
          </div>
          <h1 className="mt-6 text-[46px] font-medium leading-[0.96] tracking-[-0.05em] text-[#f0e8da] sm:text-[68px]">
            Questions people ask<br /><span className="text-[#bdb3a6]">before they trust it.</span>
          </h1>
          <p className="mt-6 max-w-[720px] text-[15px] leading-relaxed text-[#9a938a]">
            Plain English first. No pretending every data source is complete, every “verified” label means the same thing, or proposed token utility already exists.
          </p>
        </section>

        <section className="mt-9 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-3" aria-label="ChainScout quick facts">
          {[
            [ShieldCheck, "READ-ONLY", "No signing, broadcasting, custody, or seed phrases"],
            [LockKeyhole, "LOCAL VAULT", "Ownership context encrypted before browser storage"],
            [WalletCards, "NO WALLET REQUIRED", "Use the core product without connecting one"],
          ].map(([Icon, title, copy]) => {
            const FactIcon = Icon as typeof ShieldCheck;
            return (
              <article key={String(title)} className="bg-[#222222] p-5 sm:p-6"><FactIcon size={16} className="text-[#fa6c34]" /><p className="mt-4 font-mono-d text-[9px] tracking-[0.13em] text-[#ded5c8]">{String(title)}</p><p className="mt-2 text-[10.5px] leading-relaxed text-[#8f8880]">{String(copy)}</p></article>
            );
          })}
        </section>

        <nav className="mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="FAQ categories">
          {FAQ_GROUPS.map((group) => (
            <a key={group.id} href={`#${group.id}`} className="shrink-0 border border-[#45413e] bg-[#222222] px-3 py-2 font-mono-d text-[8px] tracking-[0.12em] text-[#9a938a] hover:border-[#fa6c34] hover:text-[#f0e8da]">{group.title.toUpperCase()}</a>
          ))}
        </nav>

        <div className="mt-12 space-y-16">
          {FAQ_GROUPS.map((group) => (
            <section id={group.id} key={group.id} className="scroll-mt-24">
              <p className="font-mono-d text-[9px] tracking-[0.18em] text-[#fa6c34]">{String(FAQ_GROUPS.indexOf(group) + 1).padStart(2, "0")}</p>
              <div className="mt-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <h2 className="text-[29px] font-medium tracking-[-0.035em] text-[#f0e8da] sm:text-[36px]">{group.title}</h2>
                <p className="max-w-[430px] text-[11.5px] leading-relaxed text-[#716b65]">{group.intro}</p>
              </div>
              <div className="mt-5 border border-[#383838]">
                {group.items.map((item) => (
                  <details key={item.question} className="group border-b border-[#383838] bg-[#222222] last:border-b-0 open:bg-[#252321]">
                    <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 text-left outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#fa6c34] sm:px-6">
                      <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-[#ded5c8] sm:text-[15px]">{item.question}</span>
                      <ChevronDown size={15} className="shrink-0 text-[#fa6c34] transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-[#383838] px-5 pb-6 pt-5 sm:px-6">
                      <div className="max-w-[820px] text-[12.5px] leading-[1.8] text-[#aaa197]">{item.answer}</div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 grid gap-px border border-[#383838] bg-[#383838] sm:grid-cols-2">
          <div className="bg-[#242424] p-6 sm:p-8">
            <Bookend label="WANT THE IMPLEMENTATION DETAILS?" />
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">Go one layer deeper.</h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[#9a938a]">See the exact data paths, Vault cryptography, adapter contracts, and token design guardrails.</p>
            <Link to="/docs" className="mt-5 inline-flex items-center gap-2 font-mono-d text-[9px] tracking-[0.11em] text-[#fa6c34]">OPEN TECH DOCS <ArrowRight size={12} /></Link>
          </div>
          <div className="bg-[#242424] p-6 sm:p-8">
            <Bookend label="WANT TO INSPECT THE CODE?" />
            <h2 className="mt-3 text-[22px] text-[#e9e0d1]">Follow the source.</h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[#9a938a]">Read the public repository, tests, release evidence, and integration register directly.</p>
            <a href="https://github.com/ChainScoutAi/chainscout-source" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 font-mono-d text-[9px] tracking-[0.11em] text-[#fa6c34]">OPEN GITHUB <Github size={12} /><ExternalLink size={10} /></a>
          </div>
        </section>

        <div className="mt-5 flex items-start gap-3 border border-[#6b4a3b] bg-[#2a211e] p-5">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-[#fa6c34]" />
          <p className="text-[11.5px] leading-relaxed text-[#b7aea2]"><strong className="text-[#e9e0d1]">Token reminder:</strong> a proposed utility card is not a promise. Final token mechanics must be implemented, reviewed, and linked to the exact onchain contract before ChainScout describes them as live.</p>
        </div>
      </main>
    </div>
  );
}

function Bookend({ label }: { label: string }) {
  return <p className="flex items-center gap-2 font-mono-d text-[9px] tracking-[0.14em] text-[#635d5a]"><Check size={11} className="text-[#7fb069]" />{label}</p>;
}
