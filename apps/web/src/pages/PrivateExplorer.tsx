import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  DatabaseZap,
  EyeOff,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2
} from "lucide-react";
import { AnswerCard, ResolvingAnswerCard } from "../dashboard/ChatPage";
import { classify, SAMPLE_TX, SAMPLE_WALLET } from "../dashboard/api";
import { ApiError } from "../dashboard/http";
import type { ChatSession } from "../dashboard/types";
import { analyzePrivate, type PrivateAnalysis } from "../private/api";

const PROMPTS = [
  "What stands out to a beginner?",
  "Show the evidence-based risk notes.",
  "Explain the recent activity in plain English."
];

export default function PrivateExplorer() {
  const [entityInput, setEntityInput] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<PrivateAnalysis | null>(null);
  const [pendingEntity, setPendingEntity] = useState<ChatSession["entity"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = entityInput.trim();
    if (!value || pendingRef.current) return;
    const identified = classify(value);
    if (identified.type === "unknown" || identified.id.toLowerCase() !== value.toLowerCase()) {
      setError("Enter one complete wallet or contract address, or one complete transaction hash.");
      return;
    }
    pendingRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);
    setPendingEntity({ type: identified.type, chainId: identified.chainId, id: identified.id });
    try {
      setResult(await analyzePrivate({
        entity: identified.id,
        entityType: identified.type === "transaction" ? "transaction" : "unknown",
        ...(question.trim() ? { question: question.trim() } : {})
      }));
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : "The public chain providers are unavailable right now. Nothing was saved; try again shortly.");
    } finally {
      pendingRef.current = false;
      setLoading(false);
      setPendingEntity(undefined);
    }
  };

  const chooseEntity = (value: string) => {
    setEntityInput(value);
    setResult(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clear = () => {
    setEntityInput("");
    setQuestion("");
    setResult(null);
    setError("");
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label="ChainScout home">
          <span className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]" style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}>
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">CHAINSCOUT</span>
        </Link>
        <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#7fb069] sm:text-[10.5px]">
          <ShieldCheck size={13} /> PRIVATE MODE
        </div>
        <Link to="/login" className="font-mono-d text-[9.5px] tracking-wider text-[#7f7972] transition-colors hover:text-[#e9e0d1] sm:text-[10px]">
          SAVED CLOUD →
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-10 sm:px-6 lg:pt-14">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 font-mono-d text-[10px] tracking-wider text-[#635d5a] hover:text-[#d6ccba]">
          <ArrowLeft size={12} /> HOME
        </Link>
        <section className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <p className="font-mono-d text-[10px] tracking-[0.18em] text-[#fa6c34]">NO ACCOUNT · NO WALLET · NO HISTORY</p>
            <h1 className="mt-4 max-w-[760px] text-[42px] font-medium leading-[1.02] tracking-[-0.04em] text-[#f0e8da] sm:text-[58px]">
              Understand the chain.<br /><span className="text-[#d6ccba]">Leave no profile behind.</span>
            </h1>
            <p className="mt-5 max-w-[660px] text-[15px] leading-relaxed text-[#9a938a]">
              Paste one public Robinhood Chain identifier. ChainScout returns sourced, read-only facts without an account, model provider, or saved server record.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px border border-[#383838] bg-[#383838]">
            <PrivacyTile icon={<LockKeyhole size={14} />} label="ACCOUNT" value="NOT NEEDED" />
            <PrivacyTile icon={<EyeOff size={14} />} label="AI UPLOAD" value="NONE" />
            <PrivacyTile icon={<DatabaseZap size={14} />} label="SERVER HISTORY" value="NONE" />
            <PrivacyTile icon={<Trash2 size={14} />} label="ON RELOAD" value="CLEARED" />
          </div>
        </section>

        <form onSubmit={run} className="clip-panel mt-10 border border-[#383838] bg-[#242424]">
          <div className="flex items-center gap-2.5 border-b border-[#383838] px-5 py-4 sm:px-6">
            <Search size={14} className="text-[#fa6c34]" />
            <span className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">PRIVATE LOOKUP</span>
            <span className="ml-auto font-mono-d text-[9px] tracking-wider text-[#635d5a]">ROBINHOOD CHAIN · 4663</span>
          </div>
          <div className="grid gap-0 lg:grid-cols-[1fr_0.72fr]">
            <label className="border-b border-[#383838] p-5 lg:border-b-0 lg:border-r sm:p-6">
              <span className="font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a]">ADDRESS OR TRANSACTION HASH</span>
              <input
                value={entityInput}
                onChange={(event) => {
                  setEntityInput(event.target.value);
                  if (error) setError("");
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="0x…"
                className="mt-3 w-full bg-transparent font-mono-d text-[13px] text-[#e9e0d1] outline-none placeholder:text-[#4f4a46] sm:text-[15px]"
                aria-label="Public chain identifier"
              />
            </label>
            <label className="p-5 sm:p-6">
              <span className="font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a]">OPTIONAL QUESTION</span>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={500}
                autoComplete="off"
                placeholder="What should I notice?"
                className="mt-3 w-full bg-transparent text-[13px] text-[#e9e0d1] outline-none placeholder:text-[#4f4a46] sm:text-[14px]"
                aria-label="Optional question"
              />
            </label>
          </div>
          <div className="flex flex-col gap-3 border-t border-[#383838] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => chooseEntity(SAMPLE_WALLET)} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#7f7972] hover:text-[#e9e0d1]">SAMPLE WALLET</button>
              <button type="button" onClick={() => chooseEntity(SAMPLE_TX)} className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#7f7972] hover:text-[#e9e0d1]">SAMPLE TX</button>
              {PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => setQuestion(prompt)} className="hidden border border-[#383838] px-3 py-2 text-[10px] text-[#7f7972] hover:text-[#e9e0d1] xl:block">{prompt}</button>)}
            </div>
            <button type="submit" disabled={!entityInput.trim() || loading} className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-6 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-50">
              <Sparkles size={13} /> {loading ? "RESOLVING…" : "EXPLAIN PRIVATELY"}
            </button>
          </div>
        </form>

        {error && <div role="alert" className="mt-5 border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]">{error}</div>}

        <div className="mt-7">
          {loading && <ResolvingAnswerCard entity={pendingEntity} />}
          {result && (
            <div className="space-y-4">
              <AnswerCard ai={result.answer} onPivot={chooseEntity} animateText eyebrow="DETERMINISTIC ANSWER · CITED" />
              <section data-testid="privacy-receipt" className="clip-panel border border-[#7fb069]/35 bg-[#7fb069]/5 p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#7fb069]" />
                    <div>
                      <p className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#7fb069]">PRIVACY RECEIPT</p>
                      <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-[#9a938a]">{result.privacy.disclosure}</p>
                      <p className="mt-2 font-mono-d text-[9.5px] text-[#635d5a]">
                        DESTINATIONS · {result.privacy.providerDestinations.length ? result.privacy.providerDestinations.join(" · ").toUpperCase() : "NO LIVE PROVIDER"}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={clear} className="flex shrink-0 items-center gap-2 border border-[#383838] px-4 py-2.5 font-mono-d text-[9.5px] text-[#7f7972] hover:text-[#e9e0d1]">
                    <Trash2 size={12} /> CLEAR THIS VIEW
                  </button>
                </div>
              </section>
            </div>
          )}
          {!loading && !result && !error && (
            <div className="dots mt-10 flex min-h-[220px] items-center justify-center border border-[#2e2e2e] text-center">
              <p className="max-w-[420px] px-6 font-mono-d text-[10px] leading-relaxed tracking-[0.12em] text-[#635d5a]">
                THIS VIEW IS EPHEMERAL<br />RELOAD THE PAGE AND IT IS GONE
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function PrivacyTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#202020] p-4">
      <div className="flex items-center gap-2 text-[#7fb069]">{icon}<span className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">{label}</span></div>
      <p className="mt-3 font-mono-d text-[10px] tracking-wider text-[#d6ccba]">{value}</p>
    </div>
  );
}
