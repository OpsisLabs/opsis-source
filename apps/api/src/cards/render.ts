import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { ADVICE, type TokenCard } from "./service.js";
import type { DeskFact } from "@rh-chain/shared";
import type { StockCard } from "./stock.js";
export function escapeText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function cardLines(card: TokenCard): string[] {
  const identity =
    card.identity.state === "available" ? card.identity.value : null;
  const control =
    card.controls.state === "available" ? card.controls.value : null;
  const quote =
    card.exitQuote.state === "available" ? card.exitQuote.value : null;
  return [
    `${identity?.name ?? "Unknown token name"}${identity ? ` (${identity.basis})` : ""}`,
    card.address,
    ...(control
      ? Object.entries(control.readings).map(
          ([name, value]) =>
            `${name}: ${value.state === "observed" ? value.value : `unknown (${value.reason})`}`,
        )
      : [
          `Controls: ${card.controls.state} (${card.controls.state !== "available" ? card.controls.reason : ""})`,
        ]),
    quote
      ? `$1,000 target: ${quote.input.amount} tokens; output: ${quote.quote!.amountOutDisplay} ${quote.output!.symbol}`
      : `$1,000 exit quote: ${card.exitQuote.state} (${card.exitQuote.state !== "available" ? card.exitQuote.reason : ""})`,
    ...(quote ? [`USD/token reported: ${quote.conversion.priceUsd}; amount rounded down; upstream price time unknown`] : []),
    quote
      ? `Quote block: ${quote.anchor.blockNumber}; expires ${quote.expiresAt}; gas excluded, pool fee included`
      : "USD conversion and quote require current evidence",
    card.concentration.state === "available"
      ? `Largest-holder sample, top 10 excluding labelled pools/burns: ${card.concentration.value.top10Percent}%`
      : `Holder concentration: ${card.concentration.state} (${card.concentration.reason})`,
    `Controls block: ${card.anchor?.blockNumber ?? "unknown"}; current, not final`,
    `Observed: ${card.observedAt}; samples have independent times/anchors`,
    `Sources: ${card.sources.map((source) => source.id).join(", ") || "unavailable"}`,
    "Partial standard controls; sampled holders exclude labelled pools and burns.",
    ADVICE,
  ];
}
export type CardRow = { label: string; value: string };
export type CardSummary = {
  symbol: string;
  name: string;
  chainLine: string;
  rows: CardRow[];
  footer: string;
};

const ZERO = /^0x0{40}$/i;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const grouped = (value: number | string) => Number(value).toLocaleString("en-US");
function twoDecimals(display: string): string {
  const [whole, fraction = ""] = display.split(".");
  return fraction ? `${whole}.${fraction.slice(0, 2).padEnd(2, "0")}` : display;
}

/** The same four facts the video card shows, worded so unknown stays unknown. */
export function cardSummary(card: TokenCard): CardSummary {
  const identity = card.identity.state === "available" ? card.identity.value : null;
  const control = card.controls.state === "available" ? card.controls.value : null;
  const quote = card.exitQuote.state === "available" ? card.exitQuote.value : null;
  const reading = (key: "owner" | "paused" | "implementation") => control?.readings[key];
  const owner = reading("owner");
  const paused = reading("paused");
  const implementation = reading("implementation");
  const unknown = (value?: { state: string; reason?: string }) =>
    value?.state === "unknown" ? `unknown (${value.reason === "reverted" ? "read reverted" : "malformed"})` : "unknown";
  const rows: CardRow[] = [
    {
      label: "Owner",
      value:
        owner?.state === "observed"
          ? ZERO.test(owner.value) ? "zero address" : `set · ${short(owner.value)}`
          : unknown(owner),
    },
    {
      label: "Pause",
      value:
        paused?.state === "observed"
          ? paused.value === "true" ? "paused" : "not paused"
          : unknown(paused),
    },
    {
      label: "Proxy",
      value:
        implementation?.state === "observed"
          ? ZERO.test(implementation.value) ? "no ERC-1967 slot set" : `ERC-1967 · ${short(implementation.value)}`
          : unknown(implementation),
    },
    {
      label: "$1,000 exit",
      value: quote
        ? `${twoDecimals(quote.quote!.amountOutDisplay)} ${quote.output!.symbol} at block ${grouped(quote.anchor.blockNumber)}`
        : "unavailable",
    },
    {
      label: "Top-10 holders",
      value:
        card.concentration.state === "available"
          ? `${card.concentration.value.top10Percent}% of sample`
          : "unknown",
    },
  ];
  const observed = card.observedAt.replace("T", " ").slice(0, 16);
  return {
    symbol: identity?.symbol ?? "Unknown token",
    name: identity?.name ?? "",
    chainLine: `Robinhood Chain · ${short(card.address)}${identity ? ` · ${identity.basis === "reviewed" ? "reviewed" : "self-reported"}` : ""}`,
    rows,
    footer: `Observed ${observed} UTC · current, not final · ${ADVICE}`,
  };
}

const FONT = "Space Grotesk, sans-serif";
const MONO = "IBM Plex Mono, monospace";

export function renderCardSvg(card: TokenCard): string {
  return renderSummarySvg(cardSummary(card));
}

export function renderStockCardSvg(card: StockCard, locale = "en"): string {
  const c = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  const { desk } = card;
  const unknown = c("unknown", "未知");
  const fact = <T,>(value: DeskFact<T>, format: (value: T) => string) =>
    value.state === "available" ? format(value.value) : unknown;
  const depth = desk.depth.find((entry) => entry.notionalUsd === "1000")?.quote;
  const block = (value: DeskFact<unknown>) => value.state === "available"
    ? value.evidence.find((entry) => entry.block !== null)?.block ?? unknown
    : unknown;
  const rows: CardRow[] = [
    { label: c("Chainlink reference (USD)", "Chainlink 参考价（USD）"), value: fact(desk.reference, (v) => twoDecimals(v.priceUsd)) },
    { label: c("Pool price (USDG)", "池价格（USDG）"), value: fact(desk.pool, (v) => twoDecimals(v.priceUsdG)) },
    { label: c("Gap (bps)", "价差（基点）"), value: fact(desk.gapBps, (v) => `${v.startsWith("-") || v.startsWith("+") ? "" : "+"}${v}`) },
    { label: c("Feed status", "喂价状态"), value: fact(desk.feed, (v) => [
      c(v.stale ? "stale" : "within heartbeat", v.stale ? "已过期" : "心跳期限内"),
      ...(v.paused ? [c("paused", "已暂停")] : []),
      ...(v.expectedOffHours ? [c("expected off-hours", "预期非交易时段")] : []),
    ].join(" · ")) },
    { label: c("Depth at $1k", "1,000 美元等值深度"), value: depth ? fact(depth, (v) => `${twoDecimals(v.outputAmount)} USDG`) : unknown },
    { label: c("Block", "区块"), value: `${c("reference", "参考价")} ${block(desk.reference)} · ${c("pool", "池")} ${block(desk.pool)}` },
  ];
  const facts = [desk.reference, desk.pool, desk.gapBps, desk.feed, ...(depth ? [depth] : [])];
  const description = [
    c("USDG units are not dollars. Depth includes pool fees and impact; network costs are additional. Independent current, non-final anchors. Quotes retain their original expiry.", "USDG 单位不等于美元。深度含池费用及冲击；网络费用另计。各锚点独立且非最终。报价保留原到期时间。"),
    ...facts.map((value, index) => `${rows[index]!.label}: ${value.state === "available" ? JSON.stringify(value) : `${unknown} (${value.reason})`}`),
  ].join("\n");
  return renderSummarySvg({
    symbol: card.ticker,
    name: card.name,
    chainLine: `Robinhood Chain · 4663 · ${short(desk.address)}`,
    rows,
    footer: c("A Stock Token tracks a stock; it is not a share · Not investment advice", "股票代币追踪股票；它不是股票股份 · 非投资建议"),
  }, {
    header: c("STOCK TOKEN", "股票代币"),
    title: c(`${card.ticker} Stock Token card. Not investment advice`, `${card.ticker} 股票代币卡片。非投资建议`),
    description,
    observed: `${c("Observed", "观测时间")} ${card.observedAt.replace("T", " ").slice(0, 19)} UTC · ${c("current, not final", "当前，非最终")}`,
  });
}

function renderSummarySvg(summary: CardSummary, options?: {
  header: string;
  title: string;
  description: string;
  observed: string;
}): string {
  const width = 640;
  const rowTop = options ? 198 : 176;
  const rowHeight = 40;
  const height = rowTop + summary.rows.length * rowHeight + 56;
  const text = (x: number, y: number, value: string, attrs: string) =>
    `<text x="${x}" y="${y}" ${attrs}>${escapeText(value)}</text>`;
  const rows = summary.rows
    .map((row, index) => {
      const y = rowTop + index * rowHeight;
      const size = options ? Math.min(15, 300 / Math.max(1, row.value.length) / 0.6) : 15;
      return `<line x1="28" x2="${width - 28}" y1="${y - 26}" y2="${y - 26}" stroke="#e3e7f5"/>${text(28, y, row.label, `font-family="${FONT}" font-size="15" fill="#5b6785"`)}${text(width - 28, y, row.value, `font-family="${MONO}" font-size="${size}" fill="#172342" text-anchor="end"`)}`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeText(options?.title ?? `${summary.symbol} token card. ${ADVICE}`)}</title>${options ? `<desc>${escapeText(options.description)}</desc>` : ""}<rect width="${width}" height="${height}" rx="14" fill="#ffffff"/><path d="M0 14a14 14 0 0 1 14-14h${width - 28}a14 14 0 0 1 14 14v42H0z" fill="#064af2"/>${text(28, 37, "Opsis", `font-family="${FONT}" font-size="22" font-weight="700" fill="#ffffff"`)}${text(104, 36, options?.header ?? "TOKEN CARD", `font-family="${MONO}" font-size="11" letter-spacing="1.5" fill="#d5e2ff"`)}${text(28, 102, summary.symbol, `font-family="${FONT}" font-size="30" font-weight="700" fill="#172342"`)}${text(28 + Math.min(summary.symbol.length, 16) * 19 + 12, 102, summary.name, `font-family="${FONT}" font-size="16" fill="#5b6785"`)}${text(28, 128, summary.chainLine, `font-family="${MONO}" font-size="13" fill="#5b6785"`)}${options ? text(28, 151, options.observed, `font-family="${MONO}" font-size="11.5" fill="#5b6785"`) : ""}${rows}<line x1="28" x2="${width - 28}" y1="${height - 50}" y2="${height - 50}" stroke="#e3e7f5"/>${text(28, height - 24, summary.footer, `font-family="${MONO}" font-size="11.5" fill="#5b6785"`)}</svg>`;
  if (Buffer.byteLength(svg) >= 16 * 1024) throw new Error("SVG size exceeded");
  return svg;
}

const fontDir = fileURLToPath(new URL("../../assets/card-fonts/", import.meta.url));
/** A PNG of the same card for chat apps that do not display SVG. */
export function renderCardPng(card: TokenCard): Buffer {
  const resvg = new Resvg(renderCardSvg(card), {
    fitTo: { mode: "width", value: 1280 },
    font: {
      fontFiles: ["space-medium.ttf", "space-bold.ttf", "plex-regular.ttf"].map((file) => fontDir + file),
      loadSystemFonts: false,
      defaultFontFamily: "Space Grotesk",
    },
  });
  return resvg.render().asPng();
}

/** Text fallback when the image cannot be sent: the same rows, readable in any client. */
export function cardTelegramHtml(card: TokenCard, researchUrl: string): string {
  const summary = cardSummary(card);
  return [
    `<b>${escapeText(summary.symbol)}</b>${summary.name ? ` · ${escapeText(summary.name)}` : ""}`,
    `<code>${escapeText(summary.chainLine)}</code>`,
    "",
    ...summary.rows.map((row) => `${escapeText(row.label)}: <b>${escapeText(row.value)}</b>`),
    "",
    `<i>${escapeText(summary.footer)}</i>`,
    `<a href="${escapeText(researchUrl)}">Research in Opsis ↗</a>`,
  ].join("\n");
}
