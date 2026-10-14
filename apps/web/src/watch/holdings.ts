import type { PortfolioTokenHolding } from "@rh-chain/shared";
import {
  hasHiddenCharacters, lookalikeAsset, reviewedAsset,
  visibleTokenText, wellKnownUnreviewedSymbol,
} from "../opsis/explorer-facts";

export function tokenFlags(token: PortfolioTokenHolding) {
  return {
    reviewed: reviewedAsset(token.contract),
    lookalike: lookalikeAsset(token.symbol, token.contract),
    wellKnown: wellKnownUnreviewedSymbol(token.symbol, token.contract),
    hidden: hasHiddenCharacters(token.name) || hasHiddenCharacters(token.symbol),
    scam: token.reputation === "scam",
  };
}

export function orderTokens(tokens: PortfolioTokenHolding[]) {
  const rank = (token: PortfolioTokenHolding) => {
    const flags = tokenFlags(token);
    return flags.reviewed ? 0 : flags.lookalike || flags.wellKnown || flags.hidden || flags.scam ? 1 : 2;
  };
  return [...tokens].sort((left, right) => rank(left) - rank(right));
}

export function tokenLabel(token: PortfolioTokenHolding, c: (en: string, zh: string) => string) {
  const label = `${visibleTokenText(token.name)} · ${visibleTokenText(token.symbol)}`;
  return lookalikeAsset(token.symbol, token.contract) ? `${label} · ${c("Lookalike", "同符号不同合约")}` : label;
}
