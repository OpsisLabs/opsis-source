import { useState } from "react";

const TABS = ["EXPLORER DATA", "RPC & ANCHORS", "LOCAL INTELLIGENCE", "AI MODES"];

const SETS: Record<string, { name: string; d: string; mark: React.ReactNode }[]> = {
  "EXPLORER DATA": [
    { name: "BLOCKSCOUT PRO", d: "Indexed explorer API, 100M credits tier", mark: <GlobeMark /> },
    { name: "BLOCKSCOUT API", d: "Per-instance explorer endpoints, v2", mark: <DotsMark /> },
    { name: "TX RECEIPTS", d: "Logs, status, and gas per transaction", mark: <SlantMark /> },
    { name: "ADDRESS INDEX", d: "Transactions, transfers, internals", mark: <LoopMark /> },
    { name: "CONTRACT META", d: "Verification status and ABI availability", mark: <LodoMark /> },
    { name: "TOKEN INDEX", d: "Metadata, holders, and transfer activity", mark: <BarsMark /> },
  ],
  "RPC & ANCHORS": [
    { name: "DRPC ROBINHOOD CHAIN GATEWAY", d: "Read-only mainnet calls for chain 4663", mark: <DotsMark /> },
    { name: "CAPTURED BLOCK", d: "Every snapshot starts from one current block", mark: <GlobeMark /> },
    { name: "EXACT STATE", d: "Balances and approvals use that block number", mark: <LoopMark /> },
    { name: "DIRECT RECEIPTS", d: "Transactions and logs are verified directly", mark: <BarsMark /> },
    { name: "HASH RECHECK", d: "A changed anchor discards the response", mark: <SlantMark /> },
    { name: "FAIL-CLOSED", d: "Rate limits or outages preserve the prior Vault snapshot", mark: <LodoMark /> },
  ],
  "LOCAL INTELLIGENCE": [
    { name: "ENCRYPTED VAULT", d: "Ownership context stays encrypted in the browser", mark: <GlobeMark /> },
    { name: "APPROVAL WINDOW", d: "Only discovered approval targets are checked", mark: <DotsMark /> },
    { name: "RECEIPT MOVEMENTS", d: "Owner-involving movements are decoded and bounded", mark: <LoopMark /> },
    { name: "MANUAL VALUE", d: "Reference prices and lot math stay local", mark: <BarsMark /> },
    { name: "SHARED BUDGET", d: "Redis enforces the daily RPC ceiling", mark: <SlantMark /> },
    { name: "SOURCE RECEIPTS", d: "Every displayed result names its public sources", mark: <LodoMark /> },
  ],
  "AI MODES": [
    { name: "OPTIONAL OPENAI", d: "Server-configured cited explanations when enabled", mark: <GlobeMark /> },
    { name: "OLLAMA LOCAL", d: "Self-hosted compact models for dev", mark: <DotsMark /> },
    { name: "MODEL REGISTRY", d: "Env-driven model selection, no hard-coding", mark: <LoopMark /> },
    { name: "SCHEMA VALIDATION", d: "Zod-checked answers, one corrective retry", mark: <BarsMark /> },
    { name: "FALLBACK MODE", d: "Deterministic summaries when AI is down", mark: <SlantMark /> },
    { name: "PROVIDER IFACE", d: "Swap vendors without touching app logic", mark: <LodoMark /> },
  ],
};

function GlobeMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="#635d5a" strokeWidth="1.4">
      <circle cx="17" cy="17" r="12" />
      <ellipse cx="17" cy="17" rx="6" ry="12" />
      <path d="M5 17h24M7 10h20M7 24h20" />
    </svg>
  );
}
function DotsMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="#635d5a">
      <rect x="4" y="10" width="9" height="9" />
      <circle cx="18" cy="14" r="5" />
      <circle cx="26" cy="20" r="5" fillOpacity="0.7" />
    </svg>
  );
}
function SlantMark() {
  return (
    <svg width="40" height="26" viewBox="0 0 40 26" fill="#635d5a">
      <path d="M0 26 8 0h7l-8 26Z" />
      <path d="M13 26 21 0h7l-8 26Z" />
      <path d="M26 26 34 0h6l-8 26Z" />
    </svg>
  );
}
function LoopMark() {
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" fill="none" stroke="#635d5a" strokeWidth="1.6">
      <ellipse cx="17" cy="13" rx="14" ry="6" />
      <ellipse cx="17" cy="13" rx="14" ry="6" transform="rotate(55 17 13)" />
      <ellipse cx="17" cy="13" rx="14" ry="6" transform="rotate(-55 17 13)" />
    </svg>
  );
}
function LodoMark() {
  return (
    <svg width="40" height="22" viewBox="0 0 40 22" fill="none" stroke="#635d5a" strokeWidth="2">
      <path d="M2 20V4" />
      <circle cx="13" cy="14" r="6" />
      <circle cx="27" cy="14" r="6" />
      <circle cx="38" cy="14" r="2.5" fill="#635d5a" stroke="none" />
    </svg>
  );
}
function BarsMark() {
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" fill="#635d5a">
      <path d="M0 24 10 0h6L6 24Z" />
      <path d="M16 24 26 0h6l-10 24Z" />
    </svg>
  );
}

export default function Integrations() {
  const [tab, setTab] = useState("EXPLORER DATA");
  return (
    <section id="integrations" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Providers</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Modular providers,
            <br />
            no vendor lock-in
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            Chain data and explanation modes sit behind internal interfaces. The launch path uses
            Blockscout discovery, dRPC Robinhood Chain gateway verification, and encrypted local context.
          </p>
        </div>

        <div className="grid grid-cols-1 border border-[#1d1d1d]/15 lg:grid-cols-[280px_1fr]">
          {/* tabs */}
          <div className="flex flex-col border-b border-[#1d1d1d]/15 lg:border-b-0 lg:border-r">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center justify-between border-b border-[#1d1d1d]/10 px-6 py-5 text-left font-mono-d text-[12.5px] tracking-wide transition-colors last:border-b-0 ${
                  tab === t ? "bg-[#1d1d1d]/5 text-[#1d1d1d]" : "text-[#1d1d1d]/55 hover:text-[#1d1d1d]"
                }`}
              >
                {t}
                <span className={`h-1.5 w-1.5 rounded-full ${tab === t ? "bg-[#fa6c34]" : "bg-[#1d1d1d]/25"}`} />
              </button>
            ))}
            <div className="mt-auto hidden gap-2 px-6 py-5 lg:flex">
              {["Server-side keys", "Circuit breakers"].map((b) => (
                <span key={b} className="border border-[#1d1d1d]/20 px-3 py-1.5 font-mono-d text-[10px] text-[#1d1d1d]/60">
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {SETS[tab].map((c, i) => (
              <div
                key={c.name}
                className={`flex min-h-[240px] flex-col justify-between border-[#1d1d1d]/10 p-7 ${
                  i % 3 !== 0 ? "xl:border-l" : ""
                } ${i % 2 !== 0 ? "sm:border-l xl:border-l" : ""} ${i > 1 ? "border-t" : ""} ${i > 2 ? "xl:border-t" : ""}`}
              >
                <div className="flex h-16 items-start">{c.mark}</div>
                <div>
                  <h4 className="text-[15px] font-semibold tracking-wide">{c.name}</h4>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#1d1d1d]/60">{c.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2 lg:hidden">
          {["Server-side keys", "Circuit breakers", "Shared budgets"].map((b) => (
            <span key={b} className="border border-[#1d1d1d]/20 px-3 py-1.5 font-mono-d text-[10px] text-[#1d1d1d]/60">
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
