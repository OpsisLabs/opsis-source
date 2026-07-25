import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useOutletContext, useParams } from "react-router";
import { AlertTriangle, ArrowUp, CheckCircle2, ExternalLink, Info, Sparkles } from "lucide-react";
import { classify, getEntitySummary, listMessages, listSessions, SAMPLE_TX, SAMPLE_WALLET, sendMessage } from "./api";
import { useWallet } from "./walletStore";
import { shortAddress } from "./wallet";
import type { AiExplorerAnswer, ChatMessage, ChatSession, EntitySummary, Severity } from "./types";

const SEV_STYLE: Record<Severity, { dot: string; text: string; icon: React.ReactNode }> = {
  info: { dot: "#7cc4f8", text: "text-[#7cc4f8]", icon: <Info size={12} /> },
  low: { dot: "#d6ccba", text: "text-[#d6ccba]", icon: <Info size={12} /> },
  medium: { dot: "#fa6c34", text: "text-[#fa6c34]", icon: <AlertTriangle size={12} /> },
  high: { dot: "#e0738a", text: "text-[#e0738a]", icon: <AlertTriangle size={12} /> },
};

const STARTERS = [
  "What did this wallet do today?",
  "Explain this transaction like I am new.",
  "Show me the risky approvals for this address.",
  "Is this token contract verified?",
];

function AnswerCard({ ai }: { ai: AiExplorerAnswer }) {
  const [tab, setTab] = useState<"facts" | "risk" | "sources">("facts");
  return (
    <div className="clip-panel border border-[#2e2e2e] bg-[#242424]">
      <div className="flex items-center gap-2 border-b border-[#2e2e2e] px-6 py-3.5">
        <Sparkles size={13} className="text-[#fa6c34]" />
        <span className="font-mono-d text-[10.5px] tracking-wider text-[#9a938a]">AI ANSWER · CITED</span>
      </div>
      <div className="px-6 py-5">
        <p className="text-[14.5px] leading-relaxed text-[#e9e0d1]">{ai.answer}</p>
        {ai.summaryBullets.length > 0 && (
          <ul className="mt-4 space-y-2">
            {ai.summaryBullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[13px] text-[#9a938a]">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#7fb069]" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* tabs */}
      <div className="flex border-t border-[#2e2e2e] font-mono-d text-[10.5px] tracking-wider">
        {(
          [
            ["facts", `FACTS ${ai.confirmedFacts.length}`],
            ["risk", `RISK NOTES ${ai.riskNotes.length}`],
            ["sources", `SOURCES ${ai.citations.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 border-r border-[#2e2e2e] py-2.5 transition-colors last:border-r-0 ${
              tab === k ? "bg-[#2e2e2e] text-[#e9e0d1]" : "text-[#635d5a] hover:text-[#9a938a]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border-t border-[#2e2e2e] px-6 py-4">
        {tab === "facts" && (
          <div className="space-y-3">
            {ai.confirmedFacts.length === 0 && <p className="text-[12.5px] text-[#635d5a]">No confirmed facts extracted for this answer.</p>}
            {ai.confirmedFacts.map((f) => (
              <div key={f.fact} className="flex items-start justify-between gap-4 text-[12.5px]">
                <span className="text-[#9a938a]">{f.fact}</span>
                <span className="shrink-0 font-mono-d text-[10px] text-[#635d5a]">{f.sourceIds.join(", ")}</span>
              </div>
            ))}
            {ai.inferences.map((inf) => (
              <div key={inf.inference} className="flex items-start justify-between gap-4 border-t border-[#2e2e2e] pt-3 text-[12.5px]">
                <span className="text-[#635d5a]">
                  <span className="mr-2 font-mono-d text-[10px] uppercase text-[#7cc4f8]">inference · {inf.confidence}</span>
                  {inf.inference}
                </span>
                <span className="shrink-0 font-mono-d text-[10px] text-[#635d5a]">{inf.sourceIds.join(", ")}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "risk" && (
          <div className="space-y-3">
            {ai.riskNotes.length === 0 && (
              <p className="flex items-center gap-2 text-[12.5px] text-[#7fb069]">
                <CheckCircle2 size={13} /> No risk signals triggered in the retrieved data.
              </p>
            )}
            {ai.riskNotes.map((r) => (
              <div key={r.note} className="flex items-start gap-3 text-[12.5px]">
                <span className={`mt-0.5 shrink-0 ${SEV_STYLE[r.severity].text}`}>{SEV_STYLE[r.severity].icon}</span>
                <div>
                  <span className={`mr-2 font-mono-d text-[10px] uppercase ${SEV_STYLE[r.severity].text}`}>{r.severity}</span>
                  <span className="text-[#9a938a]">{r.note}</span>
                  <span className="ml-2 font-mono-d text-[10px] text-[#635d5a]">{r.sourceIds.join(", ")}</span>
                </div>
              </div>
            ))}
            <p className="border-t border-[#2e2e2e] pt-3 font-mono-d text-[10px] leading-relaxed text-[#635d5a]">
              RISK NOTES ARE EVIDENCE-BASED OBSERVATIONS, NOT VERDICTS OR ADVICE.
            </p>
          </div>
        )}
        {tab === "sources" && (
          <div className="space-y-2.5">
            {ai.citations.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-12 shrink-0 font-mono-d text-[10px] text-[#635d5a]">{c.id}</span>
                <span className="flex-1 truncate text-[#9a938a]">{c.label}</span>
                <span className="shrink-0 font-mono-d text-[10px] uppercase text-[#7cc4f8]">{c.provider}</span>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 text-[#635d5a] transition-colors hover:text-[#fa6c34]" aria-label="Open in explorer">
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="w-3 shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityPanel({ summary }: { summary: EntitySummary | null }) {
  if (!summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="dots h-16 w-16 opacity-40" />
        <p className="font-mono-d text-[10.5px] leading-relaxed tracking-wider text-[#635d5a]">
          NO ENTITY RESOLVED
          <br />
          PASTE AN ADDRESS TO INSPECT
        </p>
      </div>
    );
  }
  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">ENTITY SUMMARY</span>
        <span className="border border-[#fa6c34]/40 bg-[#fa6c34]/10 px-2 py-0.5 font-mono-d text-[9.5px] uppercase tracking-wider text-[#fa6c34]">
          {summary.kind}
        </span>
      </div>
      <p className="break-all font-mono-d text-[11px] leading-relaxed text-[#9a938a]">{summary.address}</p>
      <a href={summary.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-mono-d text-[10.5px] text-[#7cc4f8] hover:underline">
        Open in Blockscout <ExternalLink size={10} />
      </a>

      <div className="mt-5 border border-[#2e2e2e] bg-[#242424] p-4">
        <p className="font-mono-d text-[10px] tracking-wider text-[#635d5a]">NATIVE BALANCE</p>
        <p className="font-num mt-1 text-[26px] text-[#e9e0d1]">{summary.nativeBalanceEth} ETH</p>
        <div className="mt-3 space-y-1.5 border-t border-[#2e2e2e] pt-3">
          {summary.tokenBalances.map((t) => (
            <div key={t.symbol} className="flex justify-between text-[12px]">
              <span className="text-[#635d5a]">{t.symbol}</span>
              <span className="font-mono-d text-[#d6ccba]">{t.balance}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 border border-[#2e2e2e] bg-[#242424] p-4">
        <p className="mb-2.5 font-mono-d text-[10px] tracking-wider text-[#635d5a]">ACTIVE APPROVALS</p>
        {summary.approvals.map((a) => (
          <div key={a.token + a.spender} className="mb-2 flex items-center justify-between text-[12px] last:mb-0">
            <span className="text-[#d6ccba]">{a.token}</span>
            <span className="font-mono-d text-[10.5px] text-[#635d5a]">{a.spender}</span>
            <span className={`font-mono-d text-[10.5px] ${a.amount === "Unlimited" ? "text-[#fa6c34]" : "text-[#9a938a]"}`}>{a.amount}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 border border-[#2e2e2e] bg-[#242424] p-4">
        <p className="mb-2.5 font-mono-d text-[10px] tracking-wider text-[#635d5a]">RISK SIGNALS</p>
        {summary.riskSignals.map((r) => (
          <div key={r.code} className="mb-2 flex items-center gap-2.5 text-[12px] last:mb-0">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEV_STYLE[r.severity].dot }} />
            <span className="text-[#9a938a]">{r.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { sessionId } = useParams();
  const location = useLocation() as { state?: { firstMessage?: string } };
  useOutletContext<{ refreshSessions: () => void }>();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [entity, setEntity] = useState<EntitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handledFirst = useRef<string | null>(null);
  const { wallet } = useWallet();

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    listSessions()
      .then((ss) => setSession(ss.find((s) => s.id === sessionId) ?? null))
      .catch((err) => console.error("failed to load session", err));
    listMessages(sessionId)
      .then(setMessages)
      .catch((err) => console.error("failed to load messages", err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    const ent = session?.entity?.id;
    if (ent) getEntitySummary(ent).then(setEntity);
    else setEntity(null);
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const ask = async (text: string) => {
    if (!sessionId || !text.trim() || pending) return;
    const ent = classify(text);
    setPending(true);
    setMessages((m) => [...m, { id: `tmp_${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() }]);
    const ai = await sendMessage(sessionId, text, ent.type !== "unknown" ? ent.id : session?.entity?.id);
    if (ent.type !== "unknown") getEntitySummary(ent.id).then(setEntity);
    setMessages((m) => [...m.filter((x) => !x.id.startsWith("tmp_")), { id: `u_${ai.id}`, role: "USER", content: text, createdAt: new Date().toISOString() }, ai]);
    setPending(false);
  };

  // handle firstMessage passed from search bar
  useEffect(() => {
    const fm = location.state?.firstMessage;
    if (fm && sessionId && handledFirst.current !== sessionId) {
      handledFirst.current = sessionId;
      ask(fm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, sessionId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
    setInput("");
  };

  const lastAi = [...messages].reverse().find((m) => m.ai)?.ai;

  return (
    <div className="grid flex-1 grid-cols-1 xl:grid-cols-[1fr_300px]">
      {/* chat column */}
      <div className="flex min-h-[calc(100vh-64px)] flex-col">
        <div className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-3.5">
          <div>
            <p className="text-[14px] text-[#e9e0d1]">{session?.title ?? "Session"}</p>
            <p className="mt-0.5 font-mono-d text-[10px] text-[#635d5a]">
              {session?.entity ? `${session.entity.type.toUpperCase()} · CHAIN 4663` : "NO ENTITY · CHAIN 4663"}
            </p>
          </div>
          <span className="font-mono-d text-[10px] tracking-wider text-[#635d5a]">{messages.length} MESSAGES</span>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-8">
          {loading && (
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse border border-[#2e2e2e] bg-[#242424]" />
              ))}
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="mx-auto max-w-[560px] pt-14 text-center">
              <div className="dots mx-auto mb-8 h-20 w-20 opacity-50" />
              <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[#e9e0d1]">Ask about anything on Robinhood Chain</h2>
              <p className="mx-auto mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-[#9a938a]">
                Paste a wallet, transaction hash, token, or contract, or start with one of these:
              </p>
              <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="border border-[#2e2e2e] bg-[#242424] px-4 py-3.5 text-left text-[12.5px] text-[#9a938a] transition-colors hover:border-[#fa6c34]/50 hover:text-[#e9e0d1]"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-center gap-2.5">
                <button onClick={() => ask(`Summarize this wallet: ${SAMPLE_WALLET}`)} className="font-mono-d text-[10.5px] text-[#7cc4f8] hover:underline">
                  Try sample wallet →
                </button>
                <button onClick={() => ask(`Explain this transaction: ${SAMPLE_TX}`)} className="font-mono-d text-[10.5px] text-[#7cc4f8] hover:underline">
                  Try sample tx →
                </button>
                {wallet && (
                  <button
                    onClick={() => ask(`What did my wallet do today? ${wallet.address}`)}
                    className="font-mono-d text-[10.5px] text-[#fa6c34] hover:underline"
                  >
                    Ask about my wallet ({shortAddress(wallet.address)}) →
                  </button>
                )}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "USER" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[75%] border border-[#383838] bg-[#2e2e2e] px-5 py-3.5">
                  <p className="break-all text-[13.5px] leading-relaxed text-[#e9e0d1]">{m.content}</p>
                </div>
              </div>
            ) : (
              m.ai && (
                <div key={m.id} className="max-w-[92%]">
                  <AnswerCard ai={m.ai} />
                </div>
              )
            )
          )}

          {pending && (
            <div className="flex max-w-[92%] items-center gap-3 border border-[#2e2e2e] bg-[#242424] px-6 py-4">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#fa6c34]" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </span>
              <span className="font-mono-d text-[10.5px] tracking-wider text-[#9a938a]">RETRIEVING SOURCES · NORMALIZING · ANSWERING</span>
            </div>
          )}

          {lastAi && lastAi.suggestedFollowUps.length > 0 && !pending && (
            <div className="flex flex-wrap gap-2">
              {lastAi.suggestedFollowUps.map((f) => (
                <button
                  key={f}
                  onClick={() => ask(f)}
                  className="border border-[#2e2e2e] px-3.5 py-2 font-mono-d text-[10.5px] text-[#9a938a] transition-colors hover:border-[#fa6c34]/50 hover:text-[#e9e0d1]"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* composer */}
        <form onSubmit={submit} className="border-t border-[#2e2e2e] p-4">
          <div className="flex items-center gap-3 border border-[#383838] bg-[#242424] pl-5 pr-2 transition-colors focus-within:border-[#fa6c34]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question, or paste a 0x address / tx hash…"
              className="w-full bg-transparent py-4 text-[13.5px] text-[#e9e0d1] outline-none placeholder:text-[#635d5a]"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="clip-btn-sm flex h-10 w-10 shrink-0 items-center justify-center bg-[#fa6c34] text-[#1d1d1d] transition-colors hover:bg-[#ff7038] disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp size={16} />
            </button>
          </div>
          <div className="mt-2.5 flex items-center justify-center gap-4">
            {wallet && (
              <button
                type="button"
                onClick={() => setInput((v) => (v ? `${v} ${wallet.address}` : `Summarize my wallet: ${wallet.address}`))}
                className="font-mono-d text-[9.5px] tracking-wider text-[#fa6c34] hover:underline"
              >
                + INSERT MY WALLET {shortAddress(wallet.address)}
              </button>
            )}
            <p className="text-center font-mono-d text-[9.5px] tracking-wider text-[#635d5a]">
              READ-ONLY ANALYSIS · ANSWERS CITE SOURCES · AI CAN MAKE MISTAKES · NOT FINANCIAL ADVICE
            </p>
          </div>
        </form>
      </div>

      {/* entity panel */}
      <aside className="hidden border-l border-[#2e2e2e] bg-[#1c1c1c] xl:block">
        <EntityPanel summary={entity} />
      </aside>
    </div>
  );
}
