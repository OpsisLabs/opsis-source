import type { TranslateParams, TranslationKey } from "../i18n";

type Translate = (key: TranslationKey, params?: TranslateParams) => string;
const messages: Record<string, TranslationKey> = {
  "Observed from one factory-verified Uniswap V3 pool; this is not a chain-wide or all-venue ranking.":
    "trades.limitations.1",
  "The window is a bounded recent block range, not a UTC day and not complete coverage. Missing logs are never zero.":
    "trades.limitations.2",
  "Each row is one signed V3 Swap event for this pool, classified from amount0/amount1 only, never from token transfers.":
    "trades.limitations.3",
  "A single transaction can contain multiple Swaps, flash loans, or multi-hop routes; a row is not a trader's net position, profit, identity, or coordination.":
    "trades.limitations.4",
  "Event sender and recipient are pool-event addresses. The transaction sender is the paying account for one transaction, not necessarily a real person or the beneficial owner.":
    "trades.limitations.5",
  "Nothing here is a safety verdict, price, recommendation, or smart-money signal.":
    "trades.limitations.6",
  "The requested range matched more logs than the RPC provider returns, so Opsis observed a smaller complete window instead of an incomplete larger one.":
    "trades.result.narrowedNote",
};
const privacyTemplate =
  "Your clicked request sent the public token contract, the factory-derived pool address, and a bounded block range to the {destination}, which returned public Swap logs and transaction data for displayed rows. Dense displayed blocks may be returned with all their public transactions; their hashes are checked for consistency, only displayed transactions are used to label rows, and unused transaction data is not retained. Public sender addresses and account code may be read for displayed rows. These are public chain identifiers, not your wallet. No private wallet, Vault, label, note, ownership, or AI data was sent.";
const routingDisclosure =
  " dRPC is a paid gateway that may route each read to an independent node operator in its network.";

export function tradeText(text: string, t: Translate): string {
  if (Object.prototype.hasOwnProperty.call(messages, text))
    return t(messages[text]);
  const [before, after] = privacyTemplate.split("{destination}");
  const routed = text.endsWith(routingDisclosure);
  const receipt = routed ? text.slice(0, -routingDisclosure.length) : text;
  if (!receipt.startsWith(before) || !receipt.endsWith(after)) return text;
  const destination = receipt.slice(before.length, -after.length);
  if (!destination) return text;
  return (
    t("trades.privacy.disclosure", { destination }) +
    (routed ? t("trades.privacy.routing") : "")
  );
}
