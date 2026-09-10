import type { ScoutSwapQuote } from "../swap/api";
import { scenario } from "./model";

export type TradeCard = {
  input: string;
  expected: string;
  minimum: string;
  quotedAt: string;
  gas: string;
  warning: boolean;
  balances: string[];
};

// Deliberate allowlist: never serialize a quote, Vault record, wallet or label.
export function tradeCard(quote: ScoutSwapQuote, weth: string, usdg: string, reference: string, includeBalances = false, now = Date.now()): TradeCard {
  const result = scenario(quote, weth, usdg, reference, now);
  return {
    input: `${quote.input.amount} ${quote.input.symbol}`,
    expected: `${quote.output.amount} ${quote.output.symbol}`,
    minimum: `${quote.output.minimumReceived} ${quote.output.symbol}`,
    quotedAt: new Date(quote.quotedAt).toISOString(),
    gas: `${quote.estimatedGas.nativeAmount ?? "unknown"} ETH`,
    warning: quote.simulation.status === "warning",
    balances: includeBalances ? Object.entries(result).map(([name, value]) => `${name === "before" ? "Before" : name === "after" ? "Expected after" : "Minimum after"}: ${value.WETH} WETH + ${value.USDG} USDG`) : [],
  };
}

export async function renderTradeCard(card: TradeCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser. You can still compare the quote.");
  const text = (value: string, x: number, y: number, size: number, color = "#e9e0d1", maxWidth = 1072, weight = 500) => {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    const width = ctx.measureText(value).width;
    if (width > maxWidth) ctx.font = `${weight} ${size * maxWidth / width}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  ctx.fillStyle = "#1d1d1d"; ctx.fillRect(0, 0, 1200, 1200);
  ctx.fillStyle = "#fa6c34"; ctx.fillRect(0, 0, 1200, 118);
  text("CHAINSCOUT", 64, 77, 40, "#1d1d1d", 510, 700);
  text("TRADE CARD / ROBINHOOD CHAIN", 634, 72, 24, "#1d1d1d", 502, 700);
  text("WHAT IF I SWAPPED…", 64, 199, 25, "#fa6c34", 1072, 700);
  text(card.input, 64, 302, 86, "#e9e0d1", 1072, 700);
  ctx.fillStyle = "#292929"; ctx.fillRect(64, 350, 1072, 260);
  text("EXPECTED OUTPUT", 96, 397, 24, "#b5ada2");
  text(card.expected, 96, 477, 65, "#e9e0d1", 1008, 700);
  text("MINIMUM OUTPUT AT QUOTED TOLERANCE", 96, 532, 22, "#b5ada2");
  text(card.minimum, 96, 580, 36, "#fa6c34", 1008, 700);
  if (card.balances.length) {
    text("ENTERED BALANCES · NOT WALLET-VERIFIED · FEES EXCLUDED", 64, 665, 22, "#fa6c34", 1072, 700);
    card.balances.forEach((line, index) => text(line, 64, 718 + index * 48, 30));
  } else {
    text("A scenario. Not a prediction.", 64, 710, 47, "#e9e0d1", 1072, 700);
    text("No wallet required. No trade executed by ChainScout.", 64, 766, 29, "#b5ada2");
    text("Personal balances excluded from this card.", 64, 812, 27, "#b5ada2");
  }
  ctx.fillStyle = "#555"; ctx.fillRect(64, 850, 1072, 1);
  text(`Historical quote: ${card.quotedAt} · Uniswap`, 64, 895, 24, "#b5ada2");
  text(`Gas estimate: ${card.gas}. Approval and other fees may apply.`, 64, 935, 24, "#b5ada2");
  text("Not a live offer or profit claim. Minimum output is not a total-cost guarantee.", 64, 975, 24, "#b5ada2");
  if (card.warning) text("Provider check returned a warning. Review the full quote before proceeding.", 64, 1015, 24, "#fa6c34");
  text("Try a what-if of your own.", 64, 1101, 40, "#e9e0d1", 1072, 700);
  text("www.chainscout.net/simulate", 64, 1151, 32, "#fa6c34", 1072, 700);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image export failed. Please try again.")), "image/png"));
}
