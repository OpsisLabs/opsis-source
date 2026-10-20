import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { ADVICE, type TokenCard } from "./service.js";
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
  const summary = cardSummary(card);
  const width = 640;
  const rowTop = 176;
  const rowHeight = 40;
  const height = rowTop + summary.rows.length * rowHeight + 56;
  const text = (x: number, y: number, value: string, attrs: string) =>
    `<text x="${x}" y="${y}" ${attrs}>${escapeText(value)}</text>`;
  const rows = summary.rows
    .map((row, index) => {
      const y = rowTop + index * rowHeight;
      return `<line x1="28" x2="${width - 28}" y1="${y - 26}" y2="${y - 26}" stroke="#e3e7f5"/>${text(28, y, row.label, `font-family="${FONT}" font-size="15" fill="#5b6785"`)}${text(width - 28, y, row.value, `font-family="${MONO}" font-size="15" fill="#172342" text-anchor="end"`)}`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeText(`${summary.symbol} token card. ${ADVICE}`)}</title><rect width="${width}" height="${height}" rx="14" fill="#ffffff"/><path d="M0 14a14 14 0 0 1 14-14h${width - 28}a14 14 0 0 1 14 14v42H0z" fill="#064af2"/>${text(28, 37, "Opsis", `font-family="${FONT}" font-size="22" font-weight="700" fill="#ffffff"`)}${text(104, 36, "TOKEN CARD", `font-family="${MONO}" font-size="11" letter-spacing="1.5" fill="#d5e2ff"`)}${text(28, 102, summary.symbol, `font-family="${FONT}" font-size="30" font-weight="700" fill="#172342"`)}${text(28 + Math.min(summary.symbol.length, 16) * 19 + 12, 102, summary.name, `font-family="${FONT}" font-size="16" fill="#5b6785"`)}${text(28, 128, summary.chainLine, `font-family="${MONO}" font-size="13" fill="#5b6785"`)}${rows}<line x1="28" x2="${width - 28}" y1="${height - 50}" y2="${height - 50}" stroke="#e3e7f5"/>${text(28, height - 24, summary.footer, `font-family="${MONO}" font-size="11.5" fill="#5b6785"`)}</svg>`;
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
