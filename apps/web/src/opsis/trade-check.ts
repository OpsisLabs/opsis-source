import { EXIT_CHECK_TOKENS, getExitCheckQuote, type ExitCheckOutputSymbol } from "../exit-check/api";
import { resolveKnownAsset } from "./known-assets";

export function differentOutput(token: string, preferred: ExitCheckOutputSymbol): ExitCheckOutputSymbol {
  const address = resolveKnownAsset(token)?.address ?? token.trim();
  return address.toLowerCase() === EXIT_CHECK_TOKENS[preferred].address.toLowerCase()
    ? preferred === "WETH" ? "USDG" : "WETH" : preferred;
}

export async function observeTradeQuote(request: Parameters<typeof getExitCheckQuote>[0], signal: AbortSignal) {
  const quote = await getExitCheckQuote(request, signal);
  return { quote, receivedAt: Date.now() };
}
