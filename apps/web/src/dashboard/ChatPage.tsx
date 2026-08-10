import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { AlertTriangle, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Copy, ExternalLink, Info, Search, ShieldAlert, Sparkles } from "lucide-react";
import { classify, EXPLORER, listMessages, listSessions, SAMPLE_TX, SAMPLE_WALLET, sendMessage } from "./api";
import { useWallet } from "./walletStore";
import { shortAddress } from "./wallet";
import type { AiExplorerAnswer, AnswerCardMeta, AnswerStat, AnswerWidget, ChatMessage, ChatSession, EntitySummary, Severity } from "./types";

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


const KIND_LABEL: Record<string, string> = {
  wallet: "WALLET",
  token: "TOKEN",
  contract: "CONTRACT",
  transaction: "TRANSACTION",
  block: "BLOCK",
  unknown: "ENTITY",
};

const STAT_TONE: Record<NonNullable<AnswerStat["tone"]>, string> = {
  neutral: "text-[#e9e0d1]",
  good: "text-[#7fb069]",
  warn: "text-[#fa6c34]",
  bad: "text-[#e0738a]",
};

const BADGE_TONE: Record<NonNullable<AnswerStat["tone"]>, string> = {
  neutral: "border-[#383838] bg-[#1d1d1d] text-[#9a938a]",
  good: "border-[#7fb069]/50 bg-[#7fb069]/10 text-[#7fb069]",
  warn: "border-[#fa6c34]/50 bg-[#fa6c34]/10 text-[#fa6c34]",
  bad: "border-[#e0738a]/50 bg-[#e0738a]/10 text-[#e0738a]",
};

const DONUT_PALETTE = ["#fa6c34", "#e0738a", "#7cc4f8", "#d6ccba", "#7fb069"];

/** 0x addresses and tx hashes become buttons that pivot to that entity. */
function Linkified({ text, onPivot }: { text: string; onPivot: (v: string) => void }) {
  const parts = text.split(/(0x[a-fA-F0-9]{40,64})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^0x[a-fA-F0-9]{40,64}$/.test(part) ? (
          <button
            key={i}
            onClick={() => onPivot(part)}
            title={`Look up ${part}`}
            className="mx-0.5 inline-flex items-center gap-1 border-b border-dashed border-[#7cc4f8]/50 font-mono-d text-[12.5px] text-[#7cc4f8] transition-colors hover:border-[#7cc4f8] hover:text-[#a9d8fb]"
          >
            {part.length > 20 ? `${part.slice(0, 6)}…${part.slice(-4)}` : part}
            <Search size={10} />
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="flex items-center gap-1 font-mono-d text-[10px] text-[#635d5a] transition-colors hover:text-[#e9e0d1]"
      aria-label="Copy address"
    >
      <Copy size={11} />
      {done ? "COPIED" : "COPY"}
    </button>
  );
}


const CHIP_CLASS =
  "flex items-center gap-1.5 border border-[#2e2e2e] px-3 py-1.5 font-mono-d text-[10px] tracking-wider text-[#9a938a] transition-colors hover:border-[#fa6c34]/60 hover:bg-[#fa6c34]/10 hover:text-[#e9e0d1]";

/** Eased count-up for stat tiles; runs once per mount. */
function useCountUp(target: number, duration = 750): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Animates the numeric part of a stat and compacts huge values (1.00B). */
function StatValue({ text }: { text: string }) {
  const match = /^([\d,]+(?:\.\d+)?)(.*)$/.exec(text);
  const target = match ? Number(match[1].replace(/,/g, "")) : NaN;
  const animated = useCountUp(Number.isFinite(target) ? target : 0);
  if (!match || !Number.isFinite(target)) return <span>{text}</span>;
  const decimals = match[1].includes(".") ? match[1].split(".")[1]!.length : 0;
  const display =
    target >= 1e9
      ? `${(animated / 1e9).toFixed(2)}B`
      : target >= 1e6
        ? `${(animated / 1e6).toFixed(2)}M`
        : animated.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return <span title={text}>{display}{match[2]}</span>;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Reveals a newly returned answer a few words at a time without replaying saved chats. */
function useStreamedText(text: string, enabled: boolean): { visible: string; complete: boolean } {
  const reducedMotion = usePrefersReducedMotion();
  const tokens = text.match(/\S+\s*/g) ?? (text ? [text] : []);
  const shouldStream = enabled && !reducedMotion && tokens.length > 1;
  const [visibleCount, setVisibleCount] = useState(shouldStream ? 0 : tokens.length);

  useEffect(() => {
    if (!shouldStream) return;
    const tickMs = 32;
    const duration = Math.min(2_200, Math.max(420, tokens.length * 34));
    const perTick = Math.max(1, Math.ceil(tokens.length / (duration / tickMs)));
    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        const next = Math.min(tokens.length, current + perTick);
        if (next === tokens.length) window.clearInterval(timer);
        return next;
      });
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [shouldStream, text, tokens.length]);

  return {
    visible: tokens.slice(0, shouldStream ? visibleCount : tokens.length).join(""),
    complete: !shouldStream || visibleCount >= tokens.length,
  };
}

/** A CSS-driven odometer reel used while exact provider values are unknown. */
function DigitReel({ offset }: { offset: number }) {
  const digits = Array.from({ length: 11 }, (_, index) => (index + offset) % 10);
  return (
    <span className="decode-reel" aria-hidden="true">
      <span
        className="decode-reel-track"
        style={{ animationDelay: `${-offset * 73}ms`, animationDuration: `${620 + offset * 47}ms` }}
      >
        {digits.map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
      </span>
    </span>
  );
}

function DecodingNumber({ digits = 6 }: { digits?: number }) {
  return (
    <span className="inline-flex items-center" aria-hidden="true">
      {Array.from({ length: digits }, (_, index) => (
        <span className="contents" key={index}>
          {index === Math.max(1, digits - 3) && <span className="mx-px text-[#4c4844]">.</span>}
          <DigitReel offset={(index * 3 + digits) % 10} />
        </span>
      ))}
    </span>
  );
}

const BINARY_SEQUENCE = "01001101 10110010 00101101 11010010 01100101 00110110";

function BinaryTrace({ reverse = false }: { reverse?: boolean }) {
  return (
    <div className="binary-window" aria-hidden="true">
      <span className={`binary-track ${reverse ? "binary-track-reverse" : ""}`}>
        {BINARY_SEQUENCE}&nbsp;&nbsp;&nbsp;{BINARY_SEQUENCE}&nbsp;&nbsp;&nbsp;
      </span>
    </div>
  );
}

const RESOLVING_STATS: Record<string, string[]> = {
  wallet: ["NATIVE BALANCE", "TRANSACTIONS", "TOKEN BALANCES", "RISK SIGNALS"],
  token: ["TOTAL SUPPLY", "HOLDERS", "TRANSFERS", "TOP HOLDER"],
  contract: ["TRANSACTIONS", "METHODS", "AGE", "RISK SIGNALS"],
  transaction: ["STATUS", "GAS USED", "VALUE", "EVENTS"],
  block: ["TRANSACTIONS", "GAS USED", "TIMESTAMP", "STATUS"],
  unknown: ["ENTITY TYPE", "ACTIVITY", "SOURCES", "RISK SIGNALS"],
};

export function ResolvingAnswerCard({ entity }: { entity?: ChatSession["entity"] }) {
  const kind = entity?.type ?? "unknown";
  const labels = RESOLVING_STATS[kind] ?? RESOLVING_STATS.unknown!;
  return (
    <div
      data-testid="resolving-answer-card"
      role="status"
      aria-label="Retrieving and decoding live chain data"
      className="clip-panel scan-panel max-w-[92%] overflow-hidden border border-[#2e2e2e] bg-[#242424]"
    >
      <div className="flex items-center gap-2 border-b border-[#2e2e2e] px-6 py-3.5">
        <Sparkles size={13} className="pulse-dot text-[#fa6c34]" />
        <span className="font-mono-d text-[10.5px] tracking-wider text-[#9a938a]">CHAIN DATA · DECODING</span>
        <span className="ml-auto font-mono-d text-[9px] tracking-wider text-[#fa6c34]">LIVE</span>
      </div>

      <div className="relative border-b border-[#2e2e2e] px-6 py-6">
        <div className="flex items-start gap-4">
          <div className="clip-btn-sm flex h-14 w-14 shrink-0 items-center justify-center bg-[#2e2e2e] font-mono-d text-[14px] text-[#fa6c34]">
            01
          </div>
          <div className="min-w-0 flex-1">
            <span className="border border-[#fa6c34]/30 bg-[#fa6c34]/10 px-2 py-0.5 font-mono-d text-[9.5px] tracking-wider text-[#fa6c34]">
              {KIND_LABEL[kind] ?? "ENTITY"}
            </span>
            <p className="mt-2 truncate font-mono-d text-[11px] text-[#635d5a]">
              {entity?.id ?? "WAITING FOR ENTITY CONTEXT"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {labels.map((label, index) => (
            <div key={label} className="decode-tile border border-[#2e2e2e] bg-[#1d1d1d]/80 px-3.5 py-3">
              <p className="font-mono-d text-[9px] tracking-wider text-[#635d5a]">{label}</p>
              <p className="font-num mt-1.5 flex h-[21px] items-center text-[21px] leading-none text-[#9a938a]">
                <DecodingNumber digits={index === 0 ? 7 : 5} />
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 px-6 py-5">
        <BinaryTrace />
        <BinaryTrace reverse />
        <div className="max-w-[72%]"><BinaryTrace /></div>
      </div>
    </div>
  );
}

function CardActions({ card, answer }: { card: AnswerCardMeta; answer: string }) {
  const [flash, setFlash] = useState<"" | "copy" | "share">("");
  const blink = (kind: "copy" | "share") => {
    setFlash(kind);
    setTimeout(() => setFlash(""), 1200);
  };
  const explorer =
    card.kind === "transaction"
      ? `${EXPLORER}/tx/${card.id}`
      : card.kind === "token"
        ? `${EXPLORER}/token/${card.id}`
        : `${EXPLORER}/address/${card.id}`;
  const shareText = [
    `${card.title}${card.subtitle ? ` (${card.subtitle})` : ""} — Robinhood Chain`,
    card.stats.map((s) => `${s.label}: ${s.value}`).join(" · "),
    "",
    answer,
  ].join("\n");

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <button type="button" className={CHIP_CLASS} onClick={() => navigator.clipboard?.writeText(card.id).then(() => blink("copy"))}>
        <Copy size={10} />
        {flash === "copy" ? "COPIED" : card.kind === "transaction" ? "COPY HASH" : "COPY ADDRESS"}
      </button>
      <a className={CHIP_CLASS} href={explorer} target="_blank" rel="noreferrer">
        EXPLORER <ExternalLink size={10} />
      </a>
      {card.kind === "token" && (
        <>
          <a className={CHIP_CLASS} href={`${EXPLORER}/token/${card.id}?tab=holders`} target="_blank" rel="noreferrer">
            HOLDERS <ExternalLink size={10} />
          </a>
          <a className={CHIP_CLASS} href={`${EXPLORER}/token/${card.id}?tab=token_transfers`} target="_blank" rel="noreferrer">
            TRANSFERS <ExternalLink size={10} />
          </a>
        </>
      )}
      <button type="button" className={CHIP_CLASS} onClick={() => navigator.clipboard?.writeText(shareText).then(() => blink("share"))}>
        {flash === "share" ? "COPIED" : "SHARE"}
      </button>
    </div>
  );
}

/** Animated donut whose segments partition the whole; legend rows pivot. */
function Donut({ segments, onPivot }: { segments: NonNullable<AnswerWidget["segments"]>; onPivot: (v: string) => void }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 120);
    return () => clearTimeout(t);
  }, []);
  const total = segments.reduce((sum, seg) => sum + seg.pct, 0);
  const offsets = segments.map((_, index) => segments.slice(0, index).reduce((sum, segment) => sum + segment.pct, 0));
  const top = segments[0];
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[108px] w-[108px] shrink-0">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" stroke="#2e2e2e" strokeWidth="9" />
          {segments.map((seg, i) => {
            const dash = (seg.pct / 100) * C;
            const offset = -((offsets[i] ?? 0) / 100) * C;
            return (
              <circle
                key={seg.label}
                cx="42"
                cy="42"
                r={R}
                fill="none"
                stroke={DONUT_PALETTE[i % DONUT_PALETTE.length]}
                strokeWidth="9"
                strokeDasharray={`${drawn ? dash : 0} ${C}`}
                strokeDashoffset={offset}
                style={{ transition: `stroke-dasharray 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) ${i * 110}ms` }}
              />
            );
          })}
        </svg>
        {top && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-num text-[17px] leading-none text-[#f0e8da]">{Math.round(top.pct)}%</span>
            <span className="mt-1 font-mono-d text-[8px] tracking-wider text-[#635d5a]">TOP</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        {segments.map((seg, i) => (
          <button
            key={seg.label}
            type="button"
            disabled={!seg.pivot}
            onClick={() => seg.pivot && onPivot(seg.pivot)}
            title={seg.pivot ? `Look up ${seg.pivot}` : undefined}
            className="flex w-full items-center gap-2 px-1.5 py-1 text-left transition-colors enabled:hover:bg-[#242424]"
          >
            <span className="h-2 w-2 shrink-0" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate font-mono-d text-[10.5px] text-[#d6ccba]">{seg.label}</span>
            <span className="font-num text-[11px] text-[#9a938a]">{seg.pct < 1 ? "<1" : Math.round(seg.pct)}%</span>
          </button>
        ))}
        {total < 99 && (
          <div className="flex items-center gap-2 px-1.5 py-1">
            <span className="h-2 w-2 shrink-0 bg-[#2e2e2e]" />
            <span className="min-w-0 flex-1 truncate font-mono-d text-[10.5px] text-[#635d5a]">everyone else</span>
            <span className="font-num text-[11px] text-[#635d5a]">{Math.max(0, 100 - Math.round(total))}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetPanel({ w, onPivot, delay = 0 }: { w: AnswerWidget; onPivot: (v: string) => void; delay?: number }) {
  const max = Math.max(...(w.bars ?? []).map((b) => b.count), 1);
  return (
    <div className="deck-rise border border-[#2e2e2e] bg-[#1f1f1f] p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono-d text-[10px] tracking-wider text-[#635d5a]">{w.title.toUpperCase()}</p>
        {w.note && <p className="truncate font-mono-d text-[9px] text-[#4c4844]">{w.note.toUpperCase()}</p>}
      </div>

      {w.kind === "donut" && w.segments && (
        <div className="mt-3">
          <Donut segments={w.segments} onPivot={onPivot} />
        </div>
      )}

      {w.kind === "bars" && w.bars && (
        <div className="mt-3">
          <div className="flex h-[64px] items-end gap-[3px]">
            {w.bars.map((b) => (
              <div
                key={b.label}
                title={`${b.label}: ${b.count}`}
                className="flex-1 bg-gradient-to-t from-[#fa6c34]/80 to-[#fa6c34]/30 transition-colors hover:from-[#fa6c34] hover:to-[#fa6c34]/60"
                style={{ height: `${Math.max(8, (b.count / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono-d text-[9px] text-[#635d5a]">
            <span>{w.bars[0]?.label}</span>
            <span>{w.bars[w.bars.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {w.kind === "rows" && w.rows && (
        <div className="mt-2.5 space-y-1">
          {w.rows.map((r, i) => {
            const inner = (
              <>
                {r.barPct !== undefined && (
                  <span
                    className="absolute inset-y-0 left-0 bg-[#fa6c34]/10"
                    style={{ width: `${Math.max(2, r.barPct)}%` }}
                  />
                )}
                <span className="relative min-w-0 flex-1 truncate text-left">
                  <span className="font-mono-d text-[11.5px] text-[#d6ccba]">{r.label}</span>
                  {r.sub && <span className="ml-2 font-mono-d text-[10px] text-[#635d5a]">{r.sub}</span>}
                </span>
                {r.value && (
                  <span className={`relative shrink-0 font-num text-[11.5px] ${STAT_TONE[r.tone ?? "neutral"]}`}>{r.value}</span>
                )}
              </>
            );
            return r.pivot ? (
              <button
                key={`${r.label}${i}`}
                type="button"
                onClick={() => onPivot(r.pivot!)}
                className="relative flex w-full items-center gap-2 overflow-hidden border border-transparent px-2 py-1.5 transition-colors hover:border-[#2e2e2e] hover:bg-[#242424]"
                title={`Look up ${r.pivot}`}
              >
                {inner}
                <Search size={10} className="relative shrink-0 text-[#635d5a]" />
              </button>
            ) : (
              <div key={`${r.label}${i}`} className="relative flex items-center gap-2 overflow-hidden px-2 py-1.5">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AnswerCard({
  ai,
  onPivot,
  animateText = false,
  eyebrow = "AI ANSWER · CITED",
}: {
  ai: AiExplorerAnswer;
  onPivot: (v: string) => void;
  animateText?: boolean;
  eyebrow?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const streamedAnswer = useStreamedText(ai.answer, animateText);
  const monogram = (ai.card?.subtitle?.replace(/^\$/, "") ?? ai.card?.title ?? "?").slice(0, 2).toUpperCase();
  return (
    <div data-testid="answer-card" className={`clip-panel border border-[#2e2e2e] bg-[#242424] ${animateText ? "result-materialize" : ""}`}>
      <div className="flex items-center gap-2 border-b border-[#2e2e2e] px-6 py-3.5">
        <Sparkles size={13} className="text-[#fa6c34]" />
        <span className="font-mono-d text-[10.5px] tracking-wider text-[#9a938a]">{eyebrow}</span>
      </div>

      {ai.card && (
        <div className="deck-rise relative overflow-hidden border-b border-[#2e2e2e] px-6 py-6">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-[260px] w-[260px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(250,108,52,0.14) 0%, rgba(250,108,52,0) 70%)" }}
          />
          <div className="relative flex items-start gap-4">
            <div className="clip-btn-sm flex h-14 w-14 shrink-0 items-center justify-center bg-gradient-to-br from-[#fa6c34] to-[#b8481a] font-mono-d text-[19px] font-bold text-[#1d1d1d]">
              {monogram}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="border border-[#fa6c34]/40 bg-[#fa6c34]/10 px-2 py-0.5 font-mono-d text-[9.5px] tracking-wider text-[#fa6c34]">
                  {KIND_LABEL[ai.card.kind] ?? "ENTITY"}
                </span>
                <h3 className="text-[24px] font-medium tracking-[-0.02em] text-[#f0e8da]">{ai.card.title}</h3>
                {ai.card.subtitle && <span className="font-mono-d text-[12px] text-[#9a938a]">{ai.card.subtitle}</span>}
              </div>
              {ai.card.badges.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ai.card.badges.map((badge) => (
                    <span
                      key={badge.label}
                      className={`border px-2 py-0.5 font-mono-d text-[9.5px] tracking-wider ${BADGE_TONE[badge.tone ?? "neutral"]}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {ai.card.stats.length > 0 && (
            <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {ai.card.stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className="deck-rise border border-[#2e2e2e] bg-[#1d1d1d]/80 px-3.5 py-3 transition-colors hover:border-[#383838]"
                  style={{ animationDelay: `${90 + i * 70}ms` }}
                >
                  <p className="font-mono-d text-[9px] tracking-wider text-[#635d5a]">{stat.label.toUpperCase()}</p>
                  <p className={`font-num mt-1.5 truncate text-[21px] leading-none ${STAT_TONE[stat.tone ?? "neutral"]}`}>
                    <StatValue text={stat.value} />
                  </p>
                </div>
              ))}
            </div>
          )}
          <CardActions card={ai.card} answer={ai.answer} />
        </div>
      )}

      {ai.riskNotes.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`flex w-full items-center gap-2.5 border-b border-[#2e2e2e] px-6 py-3 text-left transition-colors hover:bg-[#2a2a2a] ${
            ai.riskNotes.some((r) => r.severity === "high")
              ? "bg-[#e0738a]/10"
              : ai.riskNotes.some((r) => r.severity === "medium")
                ? "bg-[#fa6c34]/10"
                : "bg-transparent"
          }`}
        >
          <span className={`pulse-dot ${SEV_STYLE[ai.riskNotes[0]!.severity].text}`}>
            <ShieldAlert size={13} />
          </span>
          <span className="flex-1 truncate text-[12.5px] text-[#d6ccba]">{ai.riskNotes[0]!.note}</span>
          <span className="shrink-0 font-mono-d text-[10px] text-[#635d5a]">
            {expanded ? "HIDE" : ai.riskNotes.length > 1 ? `+${ai.riskNotes.length - 1} MORE` : "DETAIL"}
          </span>
        </button>
      )}

      <div className="deck-rise px-6 py-5" style={{ animationDelay: "150ms" }}>
        <p
          data-testid="answer-prose"
          data-streaming={animateText && !streamedAnswer.complete ? "true" : "false"}
          aria-label={animateText ? ai.answer : undefined}
          className="text-[14.5px] leading-relaxed text-[#e9e0d1]"
        >
          <span aria-hidden={animateText ? "true" : undefined}>
            <Linkified text={streamedAnswer.visible} onPivot={onPivot} />
            {animateText && !streamedAnswer.complete && <span className="stream-cursor" aria-hidden="true" />}
          </span>
        </p>
        {streamedAnswer.complete && ai.summaryBullets.length > 0 && (
          <ul className="mt-4 space-y-2">
            {ai.summaryBullets.map((b, index) => (
              <li
                key={b}
                className="result-materialize flex items-start gap-2.5 text-[13px] text-[#9a938a]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#7fb069]" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ai.widgets && ai.widgets.length > 0 && (
        <div className="grid gap-3 border-t border-[#2e2e2e] px-6 py-5 sm:grid-cols-2">
          {ai.widgets.map((w, i) => (
            <WidgetPanel key={w.title} w={w} onPivot={onPivot} delay={200 + i * 90} />
          ))}
        </div>
      )}

      {/* risk detail: expanded from the banner rather than parked in a tab */}
      {expanded && ai.riskNotes.length > 0 && (
        <div className="border-t border-[#2e2e2e] bg-[#1f1f1f] px-6 py-4">
          <div className="space-y-3">
            {ai.riskNotes.map((r) => (
              <div key={r.note} className="flex items-start gap-3 text-[12.5px]">
                <span className={`mt-0.5 shrink-0 ${SEV_STYLE[r.severity].text}`}>{SEV_STYLE[r.severity].icon}</span>
                <div>
                  <span className={`mr-2 font-mono-d text-[10px] uppercase ${SEV_STYLE[r.severity].text}`}>{r.severity}</span>
                  <span className="text-[#9a938a]">{r.note}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-[#2e2e2e] pt-3 font-mono-d text-[10px] leading-relaxed text-[#635d5a]">
            RISK NOTES ARE EVIDENCE-BASED OBSERVATIONS, NOT VERDICTS OR ADVICE.
          </p>
        </div>
      )}

      {/* provenance stays available but out of the way */}
      {ai.citations.length > 0 && (
        <div className="border-t border-[#2e2e2e] px-6 py-3">
          <button
            onClick={() => setShowSources((v) => !v)}
            className="flex items-center gap-2 font-mono-d text-[10px] tracking-wider text-[#635d5a] transition-colors hover:text-[#9a938a]"
          >
            {showSources ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {ai.citations.length} SOURCES · {[...new Set(ai.citations.map((c) => c.provider))].join(", ").toUpperCase()}
          </button>
          {showSources && (
            <div className="mt-3 space-y-1.5">
              {ai.citations.map((c) => (
                <div key={c.id} className="flex items-center gap-3 text-[12px]">
                  <span className="w-10 shrink-0 font-mono-d text-[10px] text-[#635d5a]">{c.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[#9a938a]">{c.label}</span>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Verify ${c.id} on Blockscout`}
                      className="shrink-0 text-[#635d5a] transition-colors hover:text-[#fa6c34]"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntityPanel({
  summary,
  selected,
  resolving,
}: {
  summary: EntitySummary | null;
  selected?: ChatSession["entity"];
  resolving: boolean;
}) {
  if (!summary) {
    if (selected) {
      const explorerUrl = `${EXPLORER}/${selected.type === "transaction" ? "tx" : "address"}/${selected.id}`;
      return (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">
              {resolving ? "RESOLVING ENTITY" : "ENTITY SELECTED"}
            </span>
            <span className="border border-[#fa6c34]/40 bg-[#fa6c34]/10 px-2 py-0.5 font-mono-d text-[9.5px] uppercase tracking-wider text-[#fa6c34]">
              {selected.type}
            </span>
          </div>
          <p className="break-all font-mono-d text-[11px] leading-relaxed text-[#9a938a]">{selected.id}</p>
          <div className="mt-2 flex items-center gap-4">
            <a href={explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono-d text-[10.5px] text-[#7cc4f8] hover:underline">
              Open in Blockscout <ExternalLink size={10} />
            </a>
            <CopyButton value={selected.id} />
          </div>
          <div className="mt-5 space-y-3 border border-[#2e2e2e] bg-[#242424] p-4">
            <div className="flex h-7 items-center font-num text-[23px] text-[#9a938a]">
              <DecodingNumber digits={7} />
            </div>
            <BinaryTrace />
            <BinaryTrace reverse />
            <p className="pt-1 font-mono-d text-[9.5px] tracking-wider text-[#635d5a]">
              {resolving ? "FETCHING LIVE CHAIN DATA…" : "DETAILS LOAD WITH THE FIRST ANSWER"}
            </p>
          </div>
        </div>
      );
    }
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
    <div className="result-materialize p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono-d text-[10.5px] tracking-wider text-[#635d5a]">ENTITY SUMMARY</span>
        <span className="border border-[#fa6c34]/40 bg-[#fa6c34]/10 px-2 py-0.5 font-mono-d text-[9.5px] uppercase tracking-wider text-[#fa6c34]">
          {summary.kind}
        </span>
      </div>
      <p className="break-all font-mono-d text-[11px] leading-relaxed text-[#9a938a]">{summary.address}</p>
      <div className="mt-2 flex items-center gap-4">
        <a href={summary.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono-d text-[10.5px] text-[#7cc4f8] hover:underline">
          Open in Blockscout <ExternalLink size={10} />
        </a>
        <CopyButton value={summary.address} />
      </div>

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
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshSessions } = useOutletContext<{ refreshSessions: () => void }>();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [entity, setEntity] = useState<EntitySummary | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [pendingEntity, setPendingEntity] = useState<ChatSession["entity"]>();
  const activeResponseRef = useRef<HTMLDivElement>(null);
  const handledFirst = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const [animatedMessageIds, setAnimatedMessageIds] = useState(() => new Set<string>());
  const { wallet } = useWallet();
  const loading = loadedSessionId !== sessionId;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    Promise.all([listSessions(), listMessages(sessionId)])
      .then(([sessions, nextMessages]) => {
        if (cancelled) return;
        const nextSession = sessions.find((candidate) => candidate.id === sessionId) ?? null;
        setSession(nextSession);
        setMessages(nextMessages);
        setEntity([...nextMessages].reverse().find((message) => message.ai?.entitySummary)?.ai?.entitySummary ?? null);
        setLoadError(nextSession ? "" : "This session could not be found.");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("failed to load session", err);
        setLoadError(err instanceof Error ? err.message : "Could not load this session. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadedSessionId(sessionId);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      activeResponseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pending]);

  const ask = useCallback(async (text: string) => {
    if (!sessionId || !text.trim() || pendingRef.current) return;
    const ent = classify(text);
    const targetEntity = ent.type !== "unknown"
      ? { type: ent.type, chainId: ent.chainId, id: ent.id }
      : session?.entity;
    const temporaryId = `tmp_${Date.now()}`;
    pendingRef.current = true;
    setPending(true);
    setPendingEntity(targetEntity);
    setRequestError("");
    setMessages((current) => [...current, { id: temporaryId, role: "USER", content: text, createdAt: new Date().toISOString() }]);
    try {
      const ai = await sendMessage(sessionId, text, ent.type !== "unknown" ? ent.id : session?.entity?.id);
      if (ai.ai?.entitySummary) setEntity(ai.ai.entitySummary);
      if (!ai.id.startsWith("err_")) {
        setAnimatedMessageIds((current) => new Set(current).add(ai.id));
      }
      setMessages((current) => [
        ...current.filter((message) => message.id !== temporaryId),
        { id: `u_${ai.id}`, role: "USER", content: text, createdAt: new Date().toISOString() },
        ai,
      ]);
      // The answer may retitle the entity (e.g. wallet -> token) and consumes
      // quota; refresh the rail so both update without a reload.
      refreshSessions();
    } catch (error) {
      console.error("failed to send question", error);
      setMessages((current) => current.filter((message) => message.id !== temporaryId));
      setRequestError(error instanceof Error ? error.message : "Could not analyze that request. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
      setPendingEntity(undefined);
    }
  }, [refreshSessions, session, sessionId]);

  // handle firstMessage passed from search bar
  useEffect(() => {
    const fm = (location.state as { firstMessage?: unknown } | null)?.firstMessage;
    if (!loading && typeof fm === "string" && fm && sessionId && handledFirst.current !== sessionId) {
      handledFirst.current = sessionId;
      // History state survives a browser reload. Consume it before sending so
      // refreshing a saved chat never repeats a paid AI/chain request.
      navigate(location.pathname, { replace: true, state: null });
      void ask(fm);
    }
  }, [ask, loading, location.pathname, location.state, navigate, sessionId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
    setInput("");
  };

  const lastAi = [...messages].reverse().find((m) => m.ai)?.ai;

  return (
    <div className="grid flex-1 grid-cols-1 xl:grid-cols-[1fr_300px]">
      {/* chat column */}
      <div className="flex min-h-[calc(100vh-64px)] flex-col">
        <div className="flex items-center justify-between border-b border-[#2e2e2e] px-6 py-3.5">
          <div>
            <p className="text-[14px] text-[#e9e0d1]">{session?.title === "Untitled session" && lastAi?.card ? lastAi.card.title : (session?.title ?? "Session")}</p>
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

          {!loading && loadError && (
            <div role="alert" className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]">
              {loadError}
            </div>
          )}

          {requestError && (
            <div id="chat-request-error" role="alert" className="border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]">
              {requestError}
            </div>
          )}

          {!loading && !loadError && messages.length === 0 && (
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
                <div key={m.id} role={m.id.startsWith("err_") ? "alert" : undefined} className="max-w-[92%]">
                  <AnswerCard
                    ai={m.ai}
                    animateText={animatedMessageIds.has(m.id)}
                    onPivot={(v) => ask(`What can you tell me about ${v}?`)}
                  />
                </div>
              )
            )
          )}

          {pending && (
            <div ref={activeResponseRef} data-testid="active-response-anchor" className="scroll-mt-20">
              <ResolvingAnswerCard entity={pendingEntity ?? session?.entity} />
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
        </div>

        {/* composer */}
        <form onSubmit={submit} className="border-t border-[#2e2e2e] p-4">
          <div className="flex items-center gap-3 border border-[#383838] bg-[#242424] pl-5 pr-2 transition-colors focus-within:border-[#fa6c34]">
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (requestError) setRequestError("");
              }}
              aria-label="Question"
              aria-describedby={requestError ? "chat-request-error" : undefined}
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
        <EntityPanel summary={entity} selected={pendingEntity ?? session?.entity} resolving={pending} />
      </aside>
    </div>
  );
}
