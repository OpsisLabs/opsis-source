import { Link } from "react-router";

function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return <img src="/logo.svg" alt="ChainScout" className={className} />;
}

function Shell({ tag, title, updated, children }: { tag: string; title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <header className="flex h-[64px] items-center justify-between border-b border-[#2e2e2e] px-6 md:px-12">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center bg-[#fa6c34]">
            <LogoMark />
          </span>
          <span className="font-mono-d text-[11px] leading-4 text-[#9a938a]">
            CHAIN
            <br />
            SCOUT
          </span>
        </Link>
        <Link to="/" className="font-mono-d text-[11px] tracking-wider text-[#9a938a] transition-colors hover:text-[#e9e0d1]">
          ← BACK TO SITE
        </Link>
      </header>

      <main className="mx-auto max-w-[860px] px-6 py-16 md:px-12">
        <div className="mb-10 flex items-center gap-3 border-y border-[#2e2e2e] py-3">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#e9e0d1]" />
          <span className="font-mono-d text-[12px] text-[#9a938a]">{tag}</span>
          <span className="hatch h-3 flex-1 opacity-60" />
          <span className="font-mono-d text-[11px] text-[#635d5a]">{updated}</span>
        </div>
        <h1 className="text-[40px] font-medium leading-[1.05] tracking-[-0.03em] md:text-[52px]">{title}</h1>
        <div className="mt-12 space-y-12">{children}</div>
      </main>

      <footer className="border-t border-[#2e2e2e] px-6 py-8 text-center font-mono-d text-[10.5px] tracking-wider text-[#635d5a] md:px-12">
        © CHAINSCOUT, 2026 · INFORMATIONAL ONLY. NOT FINANCIAL ADVICE
      </footer>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-4 text-[20px] font-medium tracking-[-0.01em] text-[#f0e8da]">
        <span className="font-mono-d text-[12px] text-[#635d5a]">{n}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 border-l border-[#2e2e2e] pl-8 text-[14px] leading-relaxed text-[#9a938a]">
        {children}
      </div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <Shell tag="Legal" title="Privacy Policy" updated="LAST UPDATED · AUGUST 2026">
      <Section n="01" title="What this product is">
        <p>
          ChainScout is a read-only analysis tool for public blockchain data. It
          explains wallets, transactions, tokens, and contracts on Robinhood Chain (chain ID 4663)
          in plain English, with source citations. Private Mode works without an account or wallet
          connection and does not create server chat history. Optional cloud-account sign-in asks your wallet for a single
          message signature that proves you control the address; it authorizes nothing on-chain.
          The product never asks for seed phrases, private keys, or wallet credentials, and it
          never executes blockchain transactions or requests token approvals.
        </p>
      </Section>

      <Section n="02" title="Data we collect">
        <p>
          <span className="text-[#e9e0d1]">Private Mode.</span> We do not save your question,
          result, or an account link. The public wallet, transaction, token, or contract identifier
          must be sent to the chain-data providers named in the on-screen privacy receipt. It may
          pass through our server memory while the response is produced. Reloading clears the browser view.
        </p>
        <p>
          <span className="text-[#e9e0d1]">Optional cloud account data.</span> Wallet sign-in accounts store the
          public wallet address and username you choose. If email registration is enabled, we
          store your email address and an Argon2id hash of your password. We never store plaintext
          passwords.
        </p>
        <p>
          <span className="text-[#e9e0d1]">Cloud-account usage data.</span> We record usage events such as AI
          messages sent, chain lookups performed, provider calls, and cache hits, tied to your
          account for quota enforcement and abuse prevention.
        </p>
        <p>
          <span className="text-[#e9e0d1]">Saved cloud queries.</span> Only queries submitted inside
          the optional saved cloud workspace are stored with chat sessions so you can revisit them. All
          queried chain data is already public on Robinhood Chain.
        </p>
        <p>
          <span className="text-[#e9e0d1]">Technical data.</span> Rate-limit identities use keyed,
          pseudonymous values instead of raw IPs. We keep structured request logs (route template,
          status, and latency), never questions, identifiers, user IDs,
          passwords, tokens, API keys, or full request headers.
        </p>
      </Section>

      <Section n="03" title="Data we never collect">
        <p>
          We do not collect or store private keys, seed phrases, recovery phrases, wallet
          passwords, or signing credentials of any kind. Wallet sign-in requests only a plain-text
          ownership message. Scout Swap does not request or transmit your wallet address: its
          server sends Uniswap the selected pair, amount, and a fixed non-user preview address.
        </p>
      </Section>

      <Section n="04" title="Retention">
        <p>
          Private Mode questions and answers are not retained by ChainScout. Optional cloud-account
          source documents retrieved from chain data providers may be retained for 30 to 90 days for
          citation durability. Saved cloud chat messages are kept until you delete your
          account or an admin retention policy clears them. Raw usage events are retained for 90
          days; aggregated usage metrics for up to 12 months.
        </p>
      </Section>

      <Section n="05" title="Third-party providers">
        <p>
          Private Mode queries Blockscout, Alchemy, and optionally GoldRush for public chain data;
          the on-screen receipt names the providers actually used, and your question is not sent to
          a model provider. The optional saved cloud workspace may use OpenAI or a self-hosted model
          to word an explanation. Scout Swap sends Uniswap only the pair, amount, chain, and fixed non-user
          preview address needed for a quote. If you choose to continue, you leave ChainScout for
          the official Uniswap app, where Uniswap's own terms and privacy policy apply. Provider
          API keys stay server-side and are never exposed to the frontend. We do not attach your
          email, username, or stored wallet address to provider requests.
        </p>
      </Section>

      <Section n="06" title="Security">
        <p>
          Passwords are hashed with Argon2id. Browser access and refresh credentials use host-only,
          Secure, HttpOnly, SameSite=Strict cookies and cannot be read by page JavaScript. Refresh
          credentials are stored hashed and rotated on use. State-changing account requests enforce
          exact-origin and anti-CSRF checks. API requests are validated and rate-limited, CORS is restricted to our allowlist in
          production, and all database access is parameterized. Chain-data calls are read-only;
          write RPC methods are disabled in our provider layer.
        </p>
      </Section>

      <Section n="07" title="Your choices">
        <p>
          The optional cloud workspace includes account privacy controls that download a versioned
          JSON export with sessions, messages, citation references, token-usage metadata, usage
          records, and audit events. Deletion permanently removes the account, credentials, sessions,
          messages, linked usage, and linked audit rows; copied access tokens stop authorizing requests
          as soon as the account is gone. Deletion cannot erase public blockchain history or shared,
          de-associated public source documents. Private Mode has no saved ChainScout history to delete.
        </p>
      </Section>

      <Section n="08" title="Contact">
        <p>
          Questions about this policy or your data: reach the team through the contact link on the
          homepage. This policy may be updated as the product evolves; material changes will be
          noted on this page.
        </p>
      </Section>
    </Shell>
  );
}

export function TermsPage() {
  return (
    <Shell tag="Legal" title="Terms of Use" updated="LAST UPDATED · AUGUST 2026">
      <Section n="01" title="The service">
        <p>
          ChainScout provides read-only explanations of public Robinhood Chain activity and
          read-only quote previews for supported token pairs. Answers are grounded in public data
          and include citations so you can verify important claims against the source.
        </p>
      </Section>

      <Section n="02" title="Informational only, no advice">
        <p>
          The service is informational only. It does not provide investment, legal, tax, or
          trading advice, and nothing in an answer constitutes a recommendation to buy, sell, or
          hold any asset. Risk notes are evidence-based observations drawn from available on-chain
          data; they are not scam verdicts, safety guarantees, or proof of intent behind any
          wallet or contract. Quote previews are time-limited estimates, not offers or guarantees.
          A user who continues in Uniswap may pay network gas, liquidity-provider or protocol
          fees, price impact, slippage, approval costs, and token-specific fees.
        </p>
      </Section>

      <Section n="03" title="Read-only boundary">
        <p>
          ChainScout does not execute, sign, submit, or broadcast blockchain transactions. Scout
          Swap explains a short-lived Uniswap quote and provides a link to the official Uniswap
          app, which independently requotes and owns every approval, signature, and transaction.
          Signing in to ChainScout asks for one plain-text message signature to prove address
          ownership; that signature authorizes nothing on-chain and cannot move funds. ChainScout
          never requests seed phrases, private keys, or wallet credentials, and never asks you to
          sign a transaction. Anyone asking for these in the product's name is not us.
        </p>
      </Section>

      <Section n="04" title="Accuracy and AI limitations">
        <p>
          AI can make mistakes and data providers can return incomplete data. Answers distinguish
          confirmed facts from inference and label uncertainty, but we do not guarantee accuracy,
          completeness, or timeliness. Always verify important claims through the cited explorer
          links before acting on them.
        </p>
      </Section>

      <Section n="05" title="Accounts and acceptable use">
        <p>
          Private Mode requires no account. If you choose the optional saved cloud workspace, you
          are responsible for activity under that account. Usage is subject to rate limits and
          monthly quotas (for example, 500 AI messages and 5,000 chain lookups on standard plans).
          We may disable accounts that abuse the service, attempt to bypass limits, probe
          provider keys, or generate excessive error patterns.
        </p>
      </Section>

      <Section n="06" title="Independence">
        <p>
          ChainScout is an independent tool built to help users understand public
          Robinhood Chain data. Except where explicitly stated, it is not an official product of,
          or endorsed by, Robinhood.
        </p>
      </Section>

      <Section n="07" title="Availability and changes">
        <p>
          The service depends on third-party chain data and AI providers; degraded provider
          performance may affect answers, in which case the product falls back to cached or
          deterministic summaries and says so. We may update these terms as the product evolves;
          continued use after an update constitutes acceptance.
        </p>
      </Section>

      <Section n="08" title="Liability">
        <p>
          To the maximum extent permitted by law, we are not liable for decisions made based on
          the service's output, for provider outages or data gaps, or for any indirect or
          consequential losses. The service is provided "as is" during the beta period.
        </p>
      </Section>
    </Shell>
  );
}
