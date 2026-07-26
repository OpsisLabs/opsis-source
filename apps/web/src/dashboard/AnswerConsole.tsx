import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Copy, Radar, Share2, Terminal } from "lucide-react";
import { EXPLORER } from "./api";
import type { AiExplorerAnswer, AnswerCardMeta, AnswerStat, AnswerWidget, Severity } from "./types";

/* ---------------- shared tone maps ---------------- */

const TONE_TEXT: Record<NonNullable<AnswerStat["tone"]>, string> = {
  neutral: "text-[#cfe3f5]",
  good: "text-[#3ff5c0]",
  warn: "text-[#ffc24d]",
  bad: "text-[#ff5c7c]",
};

const TONE_STROKE: Record<NonNullable<AnswerStat["tone"]>, string> = {
  neutral: "#3fd0ff",
  good: "#3ff5c0",
  warn: "#ffc24d",
  bad: "#ff5c7c",
};

const SEV_TONE: Record<Severity, NonNullable<AnswerStat["tone"]>> = {
  info: "neutral",
  low: "neutral",
  medium: "warn",
  high: "bad",
};

const SEGMENT_COLORS = ["#3fd0ff", "#ffc24d", "#3ff5c0", "#ff5c7c", "#8b9dff"];

const KIND_LABEL: Record<string, string> = {
  wallet: "WALLET",
  token: "TOKEN",
  contract: "CONTRACT",
  transaction: "TRANSACTION",
  block: "BLOCK",
  unknown: "ENTITY",
};

/* ---------------- primitives ---------------- */

/** Eased count-up; large values compact to 1.00B so tiles never wrap. */
function Readout({ text }: { text: string }) {
  const match = /^([\d,]+(?:\.\d+)?)(.*)$/.exec(text);
  const target = match ? Number(match[1].replace(/,/g, "")) : NaN;
  const animate = Boolean(match) && Number.isFinite(target);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, target]);

  if (!animate) return <span>{text}</span>;
  const decimals = match![1].includes(".") ? match![1].split(".")[1]!.length : 0;
  const shown =
    target >= 1e9
      ? `${(value / 1e9).toFixed(2)}B`
      : target >= 1e6
        ? `${(value / 1e6).toFixed(2)}M`
        : value.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return <span title={text}>{shown}{match![2]}</span>;
}

/** Rotating reticle with the entity monogram at its centre. */
function Reticle({ monogram }: { monogram: string }) {
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="46" fill="none" stroke="#3fd0ff" strokeOpacity="0.16" strokeWidth="1" />
        <g className="hud-spin">
          <circle
            cx="50" cy="50" r="46" fill="none" stroke="#3fd0ff" strokeOpacity="0.65"
            strokeWidth="1" strokeDasharray="14 10" strokeLinecap="round"
          />
        </g>
        <g className="hud-spin-rev">
          <circle
            cx="50" cy="50" r="37" fill="none" stroke="#ffc24d" strokeOpacity="0.4"
            strokeWidth="1" strokeDasharray="3 12" strokeLinecap="round"
          />
        </g>
        <circle cx="50" cy="50" r="30" fill="rgba(63,208,255,0.07)" stroke="#3fd0ff" strokeOpacity="0.3" strokeWidth="1" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-num text-[19px] font-medium tracking-tight text-[#eaf7ff]">{monogram}</span>
      </div>
    </div>
  );
}

/** Addresses become HUD chips that pivot the conversation to that entity. */
function Linked({ text, onPivot }: { text: string; onPivot: (v: string) => void }) {
  return (
    <>
      {text.split(/(0x[a-fA-F0-9]{40,64})/g).map((part, i) =>
        /^0x[a-fA-F0-9]{40,64}$/.test(part) ? (
          <button
            key={i}
            onClick={() => onPivot(part)}
            title={`Trace ${part}`}
            className="mx-0.5 inline-flex items-center gap-1 border border-[#3fd0ff]/25 bg-[#3fd0ff]/10 px-1.5 py-0.5 font-num text-[12px] text-[#3fd0ff] transition-colors hover:border-[#3fd0ff]/60 hover:bg-[#3fd0ff]/20"
          >
            {part.length > 20 ? `${part.slice(0, 6)}…${part.slice(-4)}` : part}
            <ArrowUpRight size={10} />
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/* ---------------- widgets ---------------- */

function Donut({ segments, onPivot }: { segments: NonNullable<AnswerWidget["segments"]>; onPivot: (v: string) => void }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 160);
    return () => clearTimeout(t);
  }, []);

  const total = segments.reduce((sum, s) => sum + s.pct, 0);
  let acc = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[112px] w-[112px] shrink-0">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(63,208,255,0.1)" strokeWidth="8" />
          {segments.map((seg, i) => {
            const dash = (seg.pct / 100) * C;
            const offset = -(acc / 100) * C;
            acc += seg.pct;
            return (
              <circle
                key={seg.label}
                cx="42" cy="42" r={R} fill="none"
                stroke={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
                strokeWidth="8"
                strokeDasharray={`${drawn ? dash : 0} ${C}`}
                strokeDashoffset={offset}
                style={{ transition: `stroke-dasharray 1s cubic-bezier(0.16,0.8,0.24,1) ${i * 120}ms` }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-num text-[18px] leading-none text-[#eaf7ff]">{Math.round(segments[0]?.pct ?? 0)}%</span>
          <span className="hud-label mt-1">TOP</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        {segments.map((seg, i) => (
          <button
            key={seg.label}
            type="button"
            disabled={!seg.pivot}
            onClick={() => seg.pivot && onPivot(seg.pivot)}
            title={seg.pivot ? `Trace ${seg.pivot}` : undefined}
            className="flex w-full items-center gap-2.5 px-1.5 py-1 text-left transition-colors enabled:hover:bg-[#3fd0ff]/8"
          >
            <span className="h-[7px] w-[7px] shrink-0" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate font-num text-[11px] text-[#a8c4da]">{seg.label}</span>
            <span className="font-num text-[11px] text-[#6d8ba3]">{seg.pct < 1 ? "<1" : Math.round(seg.pct)}%</span>
          </button>
        ))}
        {total < 99 && (
          <div className="flex items-center gap-2.5 px-1.5 py-1">
            <span className="h-[7px] w-[7px] shrink-0 bg-[#25384a]" />
            <span className="min-w-0 flex-1 truncate font-num text-[11px] text-[#405a70]">all others</span>
            <span className="font-num text-[11px] text-[#405a70]">{Math.max(0, 100 - Math.round(total))}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Widget({ w, onPivot, delay }: { w: AnswerWidget; onPivot: (v: string) => void; delay: number }) {
  const peak = Math.max(...(w.bars ?? []).map((b) => b.count), 1);
  return (
    <div className="hud-module hud-brackets hud-boot p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="hud-key">{w.title}</p>
        {w.note && <p className="hud-label truncate">{w.note}</p>}
      </div>

      {w.kind === "donut" && w.segments && (
        <div className="mt-4">
          <Donut segments={w.segments} onPivot={onPivot} />
        </div>
      )}

      {w.kind === "bars" && w.bars && (
        <div className="mt-4">
          <div className="flex h-[66px] items-end gap-[3px]">
            {w.bars.map((b) => (
              <div
                key={b.label}
                title={`${b.label} · ${b.count}`}
                className="flex-1 bg-gradient-to-t from-[#3fd0ff]/70 to-[#3fd0ff]/20 transition-all hover:from-[#3fd0ff] hover:to-[#3fd0ff]/50"
                style={{ height: `${Math.max(6, (b.count / peak) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between">
            <span className="hud-label">{w.bars[0]?.label}</span>
            <span className="hud-label">{w.bars[w.bars.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {w.kind === "rows" && w.rows && (
        <div className="mt-3 space-y-0.5">
          {w.rows.map((r, i) => {
            const body = (
              <>
                {r.barPct !== undefined && (
                  <span
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#3fd0ff]/16 to-transparent"
                    style={{ width: `${Math.max(3, r.barPct)}%` }}
                  />
                )}
                <span className="relative min-w-0 flex-1 truncate text-left">
                  <span className="font-num text-[11.5px] text-[#a8c4da]">{r.label}</span>
                  {r.sub && <span className="hud-label ml-2">{r.sub}</span>}
                </span>
                {r.value && (
                  <span className={`relative shrink-0 font-num text-[11.5px] ${TONE_TEXT[r.tone ?? "neutral"]}`}>{r.value}</span>
                )}
              </>
            );
            return r.pivot ? (
              <button
                key={`${r.label}${i}`}
                type="button"
                onClick={() => onPivot(r.pivot!)}
                title={`Trace ${r.pivot}`}
                className="relative flex w-full items-center gap-2 overflow-hidden border border-transparent px-2 py-1.5 transition-colors hover:border-[#3fd0ff]/20 hover:bg-[#3fd0ff]/6"
              >
                {body}
                <ArrowUpRight size={10} className="relative shrink-0 text-[#405a70]" />
              </button>
            ) : (
              <div key={`${r.label}${i}`} className="relative flex items-center gap-2 overflow-hidden px-2 py-1.5">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- console ---------------- */

function Actions({ card, answer }: { card: AnswerCardMeta; answer: string }) {
  const [flash, setFlash] = useState<"" | "id" | "share">("");
  const blink = (k: "id" | "share") => {
    setFlash(k);
    setTimeout(() => setFlash(""), 1200);
  };
  const explorer =
    card.kind === "transaction"
      ? `${EXPLORER}/tx/${card.id}`
      : card.kind === "token"
        ? `${EXPLORER}/token/${card.id}`
        : `${EXPLORER}/address/${card.id}`;
  const summary = [
    `${card.title}${card.subtitle ? ` (${card.subtitle})` : ""} — Robinhood Chain`,
    card.stats.map((s) => `${s.label}: ${s.value}`).join(" · "),
    "",
    answer,
  ].join("\n");

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <button className="hud-chip" onClick={() => navigator.clipboard?.writeText(card.id).then(() => blink("id"))}>
        {flash === "id" ? <Check size={11} /> : <Copy size={11} />}
        {flash === "id" ? "COPIED" : card.kind === "transaction" ? "HASH" : "ADDRESS"}
      </button>
      <a className="hud-chip" href={explorer} target="_blank" rel="noreferrer">
        EXPLORER <ArrowUpRight size={11} />
      </a>
      {card.kind === "token" && (
        <>
          <a className="hud-chip" href={`${EXPLORER}/token/${card.id}?tab=holders`} target="_blank" rel="noreferrer">
            HOLDERS <ArrowUpRight size={11} />
          </a>
          <a className="hud-chip" href={`${EXPLORER}/token/${card.id}?tab=token_transfers`} target="_blank" rel="noreferrer">
            TRANSFERS <ArrowUpRight size={11} />
          </a>
        </>
      )}
      <button className="hud-chip" onClick={() => navigator.clipboard?.writeText(summary).then(() => blink("share"))}>
        {flash === "share" ? <Check size={11} /> : <Share2 size={11} />}
        {flash === "share" ? "COPIED" : "SHARE"}
      </button>
    </div>
  );
}

export function AnswerConsole({ ai, onPivot }: { ai: AiExplorerAnswer; onPivot: (v: string) => void }) {
  const [tab, setTab] = useState<"facts" | "risk" | "sources">("facts");
  const card = ai.card;
  const monogram = (card?.subtitle?.replace(/^\$/, "") ?? card?.title ?? "?").slice(0, 2).toUpperCase();
  const worst = ai.riskNotes.reduce<Severity>(
    (acc, n) => (n.severity === "high" ? "high" : acc === "high" ? acc : n.severity === "medium" ? "medium" : acc),
    "info",
  );

  return (
    <div className="hud-module hud-glow hud-boot overflow-hidden">
      {/* status strip */}
      <div className="flex items-center gap-2 border-b border-[#3fd0ff]/12 bg-[#3fd0ff]/4 px-5 py-2.5">
        <Terminal size={12} className="text-[#3fd0ff]" />
        <span className="hud-key text-[#3fd0ff]">ANALYSIS</span>
        <span className="hud-label">· SOURCE-CITED</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="hud-blink h-1.5 w-1.5 rounded-full bg-[#3ff5c0]" />
          <span className="hud-label">COMPLETE</span>
        </span>
      </div>

      {card && (
        <div className="relative overflow-hidden px-6 py-6">
          <div
            className="pointer-events-none absolute -right-24 -top-32 h-[320px] w-[320px]"
            style={{ background: "radial-gradient(circle, rgba(63,208,255,0.16) 0%, rgba(63,208,255,0) 68%)" }}
          />

          <div className="relative flex items-start gap-5">
            <Reticle monogram={monogram} />
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2">
                <Radar size={11} className="text-[#3fd0ff]" />
                <span className="hud-key text-[#3fd0ff]">{KIND_LABEL[card.kind] ?? "ENTITY"}</span>
                {card.subtitle && <span className="hud-label">· {card.subtitle}</span>}
              </div>
              <h3 className="mt-1.5 truncate text-[27px] font-light leading-tight tracking-[-0.02em] text-[#eaf7ff]">
                {card.title}
              </h3>
              {card.badges.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {card.badges.map((b) => (
                    <span key={b.label} className={`hud-pill hud-pill-${b.tone ?? "neutral"}`}>
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {card.stats.length > 0 && (
            <div className="relative mt-6 grid grid-cols-2 gap-px border border-[#3fd0ff]/12 bg-[#3fd0ff]/8 sm:grid-cols-4">
              {card.stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className="hud-boot bg-[#070c14] px-4 py-3.5"
                  style={{ animationDelay: `${120 + i * 80}ms` }}
                >
                  <p className="hud-label">{stat.label}</p>
                  <p className={`font-num mt-2 truncate text-[22px] font-light leading-none ${TONE_TEXT[stat.tone ?? "neutral"]}`}>
                    <Readout text={stat.value} />
                  </p>
                  <div className="mt-2.5 h-px w-full bg-gradient-to-r from-[#3fd0ff]/40 to-transparent" />
                </div>
              ))}
            </div>
          )}

          <Actions card={card} answer={ai.answer} />
        </div>
      )}

      {ai.riskNotes.length > 0 && (
        <button
          onClick={() => setTab("risk")}
          className={`hud-sweep relative flex w-full items-center gap-3 overflow-hidden border-y px-6 py-3 text-left transition-colors ${
            worst === "high"
              ? "border-[#ff5c7c]/30 bg-[#ff5c7c]/10 hover:bg-[#ff5c7c]/16"
              : worst === "medium"
                ? "border-[#ffc24d]/30 bg-[#ffc24d]/10 hover:bg-[#ffc24d]/16"
                : "border-[#3fd0ff]/16 bg-[#3fd0ff]/6 hover:bg-[#3fd0ff]/10"
          }`}
        >
          <AlertTriangle size={13} className={`relative shrink-0 ${TONE_TEXT[SEV_TONE[worst]]}`} />
          <span className={`hud-key relative shrink-0 ${TONE_TEXT[SEV_TONE[worst]]}`}>
            {ai.riskNotes.length} SIGNAL{ai.riskNotes.length === 1 ? "" : "S"}
          </span>
          <span className="relative min-w-0 flex-1 truncate text-[12.5px] text-[#a8c4da]">{ai.riskNotes[0]!.note}</span>
          <span className="hud-label relative shrink-0">REVIEW →</span>
        </button>
      )}

      <div className="hud-boot px-6 py-5" style={{ animationDelay: "180ms" }}>
        <p className="text-[14.5px] leading-[1.75] text-[#b9d2e6]">
          <Linked text={ai.answer} onPivot={onPivot} />
        </p>
        {ai.summaryBullets.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {ai.summaryBullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[13px] text-[#8fabc2]">
                <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rotate-45 bg-[#3fd0ff]" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {ai.widgets && ai.widgets.length > 0 && (
        <div className="grid gap-3 border-t border-[#3fd0ff]/12 px-6 py-5 sm:grid-cols-2">
          {ai.widgets.map((w, i) => (
            <Widget key={w.title} w={w} onPivot={onPivot} delay={230 + i * 90} />
          ))}
        </div>
      )}

      {/* evidence tabs */}
      <div className="grid grid-cols-3 border-t border-[#3fd0ff]/12">
        {(
          [
            ["facts", `FACTS ${ai.confirmedFacts.length}`],
            ["risk", `SIGNALS ${ai.riskNotes.length}`],
            ["sources", `SOURCES ${ai.citations.length}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`hud-key border-r border-[#3fd0ff]/12 py-3 transition-colors last:border-r-0 ${
              tab === key ? "bg-[#3fd0ff]/10 text-[#3fd0ff]" : "text-[#405a70] hover:text-[#6d8ba3]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="hud-deep border-t border-[#3fd0ff]/12 px-6 py-4">
        {tab === "facts" && (
          <div className="space-y-2.5">
            {ai.confirmedFacts.length === 0 && <p className="hud-label">NO CONFIRMED FACTS EXTRACTED</p>}
            {ai.confirmedFacts.map((f) => (
              <div key={f.fact} className="flex items-start justify-between gap-4 text-[12.5px]">
                <span className="text-[#8fabc2]">{f.fact}</span>
                <span className="hud-label shrink-0">{f.sourceIds.length} SRC</span>
              </div>
            ))}
            {ai.inferences.map((inf) => (
              <div key={inf.inference} className="flex items-start justify-between gap-4 border-t border-[#3fd0ff]/10 pt-2.5 text-[12.5px]">
                <span className="text-[#6d8ba3]">
                  <span className="hud-pill hud-pill-neutral mr-2 text-[#8b9dff]">INFER · {inf.confidence}</span>
                  {inf.inference}
                </span>
                <span className="hud-label shrink-0">{inf.sourceIds.length} SRC</span>
              </div>
            ))}
          </div>
        )}

        {tab === "risk" && (
          <div className="space-y-3">
            {ai.riskNotes.length === 0 && <p className="text-[12.5px] text-[#3ff5c0]">No risk signals in the retrieved data.</p>}
            {ai.riskNotes.map((r) => (
              <div key={r.note} className="flex items-start gap-3 text-[12.5px]">
                <span className={`hud-pill hud-pill-${SEV_TONE[r.severity]} shrink-0`}>{r.severity}</span>
                <span className="text-[#8fabc2]">{r.note}</span>
              </div>
            ))}
            <p className="hud-label border-t border-[#3fd0ff]/10 pt-3">
              SIGNALS ARE EVIDENCE-BASED OBSERVATIONS, NOT VERDICTS OR ADVICE
            </p>
          </div>
        )}

        {tab === "sources" && (
          <div className="space-y-1.5">
            {ai.citations.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-[12.5px]">
                <span className="hud-label w-12 shrink-0">{c.id}</span>
                <span className="min-w-0 flex-1 truncate text-[#8fabc2]">{c.label}</span>
                <span className="hud-label shrink-0 text-[#3fd0ff]">{c.provider}</span>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 text-[#405a70] transition-colors hover:text-[#3fd0ff]">
                    <ArrowUpRight size={12} />
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

export { TONE_TEXT, TONE_STROKE, KIND_LABEL };
