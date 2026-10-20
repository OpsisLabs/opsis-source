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
export function renderCardSvg(card: TokenCard): string {
  const lines = cardLines(card);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${lines.length * 32 + 32}" viewBox="0 0 960 ${lines.length * 32 + 32}" role="img"><title>${ADVICE}</title><rect width="100%" height="100%" fill="#eef0ff"/>${lines.map((line, index) => `<text x="16" y="${32 + index * 32}" font-family="monospace" font-size="13" fill="#181249">${escapeText(line)}</text>`).join("")}</svg>`;
  if (Buffer.byteLength(svg) >= 16 * 1024) throw new Error("SVG size exceeded");
  return svg;
}
