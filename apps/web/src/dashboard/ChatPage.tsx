import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useOutletContext, useParams } from "react-router";
import { ArrowUp, ArrowUpRight, Check, Copy, Crosshair, Radio, Wallet } from "lucide-react";
import { classify, getEntitySummary, listMessages, listSessions, SAMPLE_TX, SAMPLE_WALLET, sendMessage } from "./api";
import { AnswerConsole, KIND_LABEL } from "./AnswerConsole";
import { useWallet } from "./walletStore";
import { shortAddress } from "./wallet";
import type { ChatMessage, ChatSession, EntitySummary, Severity } from "./types";

const SEV_DOT: Record<Severity, string> = {
  info: "#3fd0ff",
  low: "#6d8ba3",
  medium: "#ffc24d",
  high: "#ff5c7c",
};

const PROBES = [
  "What did this wallet do today?",
  "Explain this transaction like I am new.",
  "Show me the risky approvals for this address.",
  "Is this token contract verified?",
];

/* ---------------- telemetry sidebar ---------------- */

function TelemetryPanel({ summary }: { summary: EntitySummary | null }) {
  const [copied, setCopied] = useState(false);

  if (!summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#3fd0ff" strokeOpacity="0.14" strokeWidth="1" />
            <g className="hud-spin">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#3fd0ff" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="10 14" />
            </g>
            <circle cx="50" cy="50" r="4" fill="#3fd0ff" fillOpacity="0.4" />
          </svg>
        </div>
        <p className="hud-label leading-relaxed">
          NO TARGET ACQUIRED
          <br />
          PASTE AN ADDRESS TO SCAN
        </p>
      </div>
    );
  }

  return (
    <div className="hud-scroll h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <span className="hud-key text-[#3fd0ff]">TELEMETRY</span>
        <span className="hud-pill hud-pill-neutral">{KIND_LABEL[summary.kind] ?? "ENTITY"}</span>
      </div>

      <p className="mt-3 break-all font-num text-[10.5px] leading-relaxed text-[#6d8ba3]">{summary.address}</p>
      <div className="mt-2 flex items-center gap-3">
        <a href={summary.explorerUrl} target="_blank" rel="noreferrer" className="hud-label flex items-center gap-1 text-[#3fd0ff] hover:underline">
          EXPLORER <ArrowUpRight size={9} />
        </a>
        <button
          className="hud-label flex items-center gap-1 transition-colors hover:text-[#3fd0ff]"
          onClick={() =>
            navigator.clipboard?.writeText(summary.address).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            })
          }
        >
          {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? "COPIED" : "COPY"}
        </button>
      </div>

      <div className="hud-module-flat mt-4 p-4">
        <p className="hud-label">NATIVE BALANCE</p>
        <p className="font-num mt-1.5 text-[24px] font-light leading-none text-[#eaf7ff]">{summary.nativeBalanceEth}</p>
        <p className="hud-label mt-1">ETH</p>
        {summary.tokenBalances.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-[#3fd0ff]/12 pt-3">
            {summary.tokenBalances.map((t) => (
              <div key={t.symbol} className="flex justify-between gap-2 text-[11.5px]">
                <span className="truncate text-[#6d8ba3]">{t.symbol}</span>
                <span className="font-num shrink-0 text-[#a8c4da]">{t.balance}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hud-module-flat mt-3 p-4">
        <p className="hud-label">ACTIVE APPROVALS</p>
        {summary.approvals.length === 0 && <p className="mt-2 text-[11.5px] text-[#405a70]">None detected</p>}
        {summary.approvals.map((a) => (
          <div key={a.token + a.spender} className="mt-2 flex items-center justify-between gap-2 text-[11.5px]">
            <span className="truncate text-[#a8c4da]">{a.token}</span>
            <span className="font-num shrink-0 text-[#405a70]">{a.spender}</span>
            <span className={`font-num shrink-0 ${a.amount === "Unlimited" ? "text-[#ffc24d]" : "text-[#6d8ba3]"}`}>{a.amount}</span>
          </div>
        ))}
      </div>

      <div className="hud-module-flat mt-3 p-4">
        <p className="hud-label">RISK SIGNALS</p>
        {summary.riskSignals.length === 0 && <p className="mt-2 text-[11.5px] text-[#3ff5c0]">Nothing flagged</p>}
        {summary.riskSignals.map((r) => (
          <div key={r.code} className="mt-2 flex items-center gap-2.5 text-[11.5px]">
            <span className="h-1.5 w-1.5 shrink-0 rotate-45" style={{ background: SEV_DOT[r.severity] }} />
            <span className="text-[#8fabc2]">{r.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function ChatPage() {
  const { sessionId } = useParams();
  const location = useLocation() as { state?: { firstMessage?: string } };
  const { refreshSessions } = useOutletContext<{ refreshSessions: () => void }>();
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
    setMessages((m) => [
      ...m.filter((x) => !x.id.startsWith("tmp_")),
      { id: `u_${ai.id}`, role: "USER", content: text, createdAt: new Date().toISOString() },
      ai,
    ]);
    // The answer may retitle the entity (e.g. wallet -> token) and consumes
    // quota; refresh the rail so both update without a reload.
    refreshSessions();
    setPending(false);
  };

  // handle firstMessage passed from the command bar
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
  const heading = session?.title === "Untitled session" && lastAi?.card ? lastAi.card.title : (session?.title ?? "SESSION");

  return (
    <div className="grid flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-[calc(100vh-64px)] min-w-0 flex-col">
        {/* session readout */}
        <div className="flex items-center justify-between gap-4 border-b border-[#3fd0ff]/12 px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] text-[#cfe3f5]">{heading}</p>
            <p className="hud-label mt-1">
              {session?.entity ? `${KIND_LABEL[session.entity.type]} · ${session.entity.id.slice(0, 10)}…` : "NO TARGET"} · CHAIN 4663
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hud-blink h-1.5 w-1.5 rounded-full bg-[#3ff5c0]" />
            <span className="hud-label">{messages.length} LOGGED</span>
          </div>
        </div>

        <div className="hud-scroll flex-1 space-y-6 overflow-y-auto px-6 py-8">
          {loading && (
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="hud-module-flat h-24 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="mx-auto max-w-[620px] pt-10 text-center">
              <div className="relative mx-auto mb-7 h-24 w-24">
                <svg viewBox="0 0 100 100" className="h-full w-full">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#3fd0ff" strokeOpacity="0.14" strokeWidth="1" />
                  <g className="hud-spin">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#3fd0ff" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="16 12" strokeLinecap="round" />
                  </g>
                  <g className="hud-spin-rev">
                    <circle cx="50" cy="50" r="34" fill="none" stroke="#ffc24d" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 10" />
                  </g>
                  <circle cx="50" cy="50" r="5" fill="#3fd0ff" />
                </svg>
              </div>
              <p className="hud-key text-[#3fd0ff]">TERMINAL READY</p>
              <h2 className="mt-3 text-[26px] font-light tracking-[-0.02em] text-[#eaf7ff]">
                Interrogate anything on Robinhood Chain
              </h2>
              <p className="mx-auto mt-3 max-w-[440px] text-[13.5px] leading-relaxed text-[#6d8ba3]">
                Paste a wallet, transaction, token, or contract — or run a standard probe.
              </p>
              <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROBES.map((p) => (
                  <button
                    key={p}
                    onClick={() => ask(p)}
                    className="hud-module hud-brackets px-4 py-3.5 text-left text-[12.5px] text-[#8fabc2] transition-colors hover:text-[#eaf7ff]"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button onClick={() => ask(`Summarize this wallet: ${SAMPLE_WALLET}`)} className="hud-chip">
                  SAMPLE WALLET
                </button>
                <button onClick={() => ask(`Explain this transaction: ${SAMPLE_TX}`)} className="hud-chip">
                  SAMPLE TX
                </button>
                {wallet && (
                  <button onClick={() => ask(`What did my wallet do today? ${wallet.address}`)} className="hud-chip">
                    <Wallet size={11} /> MY WALLET
                  </button>
                )}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "USER" ? (
              <div key={m.id} className="flex justify-end">
                <div className="hud-module max-w-[75%] px-5 py-3">
                  <p className="hud-label mb-1.5">QUERY</p>
                  <p className="break-all text-[13.5px] leading-relaxed text-[#cfe3f5]">{m.content}</p>
                </div>
              </div>
            ) : (
              m.ai && (
                <div key={m.id} className="max-w-[94%]">
                  <AnswerConsole ai={m.ai} onPivot={(v) => ask(`What can you tell me about ${v}?`)} />
                </div>
              )
            ),
          )}

          {pending && (
            <div className="hud-module hud-sweep relative flex max-w-[94%] items-center gap-3 overflow-hidden px-6 py-4">
              <Radio size={13} className="hud-blink relative text-[#3fd0ff]" />
              <span className="hud-key relative text-[#3fd0ff]">SCANNING</span>
              <span className="hud-label relative">RETRIEVING SOURCES · NORMALIZING · ANALYZING</span>
            </div>
          )}

          {lastAi && lastAi.suggestedFollowUps.length > 0 && !pending && (
            <div className="flex flex-wrap gap-2">
              {lastAi.suggestedFollowUps.map((f) => (
                <button key={f} onClick={() => ask(f)} className="hud-chip normal-case tracking-normal">
                  <Crosshair size={10} /> {f}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* command input */}
        <form onSubmit={submit} className="border-t border-[#3fd0ff]/12 p-4">
          <div className="hud-module flex items-center gap-3 pl-5 pr-2 transition-colors focus-within:border-[#3fd0ff]/40">
            <span className="hud-key shrink-0 text-[#3fd0ff]">›</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query the chain, or paste a 0x address / tx hash…"
              className="w-full bg-transparent py-4 text-[13.5px] text-[#eaf7ff] outline-none placeholder:text-[#405a70]"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#3fd0ff] text-[#04070c] transition-colors hover:bg-[#6fdfff] disabled:opacity-30"
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
                className="hud-label text-[#3fd0ff] hover:underline"
              >
                + INSERT MY WALLET {shortAddress(wallet.address)}
              </button>
            )}
            <p className="hud-label">READ-ONLY · CITED · AI CAN ERR · NOT FINANCIAL ADVICE</p>
          </div>
        </form>
      </div>

      <aside className="hud-deep hidden border-l border-[#3fd0ff]/12 xl:block">
        <TelemetryPanel summary={entity} />
      </aside>
    </div>
  );
}
