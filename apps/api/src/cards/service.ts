import {
  REVIEWED_ASSETS,
  type Json,
  type Receipt,
  type TokenControls,
} from "@rh-chain/shared";
import { getAddress, isAddress } from "viem";
import type { ControlsEvidence, ControlsSource } from "../controls/service.js";
import type {
  ExitCheckSource,
  ExitCheckResponse,
} from "../exit-check/service.js";
import type { ReceiptService } from "../receipts/service.js";
import { findOpenDataAsset } from "../open-data/registry.js";
import { AppError } from "../http/errors.js";
import type { JsonCache } from "../cache/service.js";

export const ADVICE = "Not investment advice";
export type Anchor = TokenControls["anchor"];
export type Part<T> =
  | { state: "available"; value: T }
  | { state: "unknown" | "unavailable"; reason: string };
export type Identity = {
  name: string | null;
  symbol: string | null;
  decimals: number;
  basis: "reviewed" | "self_reported_rpc";
  source: string;
  observedAt: string;
  anchor: Anchor | null;
};
export type MarketSample = {
  source: string;
  observedAt: string;
  priceUsd: string | null;
  concentration: Part<{
    top10Percent: number;
    holdersAnalyzed: number;
    poolPercent?: number;
    burnPercent?: number;
    source: string;
    observedAt: string;
  }>;
};
export interface CardSources {
  identity(address: string, anchor: Anchor): Promise<Identity>;
  market(address: string): Promise<MarketSample>;
}
export type CardQuote = Pick<
  ExitCheckResponse,
  "input" | "output" | "quote" | "anchor" | "quotedAt" | "expiresAt"
> & {
  notionalUsd: "1000";
  conversion: { priceUsd: string; source: string; observedAt: string };
  limitations: string[];
};
export type TokenCard = {
  schemaVersion: 1;
  chainId: 4663;
  address: string;
  observedAt: string;
  servedFrom: "fresh" | "cache";
  identity: Part<Identity>;
  controls: Part<TokenControls>;
  exitQuote: Part<CardQuote>;
  concentration: MarketSample["concentration"];
  anchor: Anchor | null;
  sources: Array<{ id: string; observedAt: string }>;
  limitations: string[];
  disclaimer: typeof ADVICE;
  receipt?: Receipt;
};
export interface TokenCardSource {
  card(address: string): Promise<TokenCard>;
}
const unknown = (reason: string): Part<never> => ({ state: "unknown", reason });
const failure = (error: unknown): Part<never> => ({
  state: "unavailable",
  reason: error instanceof AppError ? error.code : "SOURCE_UNAVAILABLE",
});

/** Exact floor division; a USDG unit is never assumed to be a dollar. */
export function thousandDollarAmount(
  price: string,
  decimals: number,
  notionalUsd = 1000,
): string | null {
  if (
    !/^\d{1,30}(?:\.\d{1,30})?$/.test(price) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    return null;
  const [whole, fraction = ""] = price.split(".");
  const denominator = BigInt(`${whole}${fraction}`);
  if (denominator <= 0n) return null;
  const scale = 10n ** BigInt(decimals + fraction.length);
  if (![100, 1000, 10000].includes(notionalUsd)) return null;
  const numerator = BigInt(notionalUsd) * scale;
  const raw = numerator / denominator;
  // Refuse a token precision that misses the requested notional by over one cent.
  if ((numerator - raw * denominator) * 100n > scale) return null;
  if (raw <= 0n || raw >= 2n ** 256n) return null;
  const padded = raw.toString().padStart(decimals + 1, "0");
  return decimals
    ? `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`
    : padded;
}

/** Unavailable top-level parts shorten retention; partial standard-controls coverage is expected. */
export function cardCacheTtl(
  card: Omit<TokenCard, "servedFrom">,
  ttl: number,
): number {
  return [
    card.identity,
    card.controls,
    card.exitQuote,
    card.concentration,
  ].some((part) => part.state !== "available")
    ? Math.min(ttl, 15)
    : ttl;
}
export function cardCacheRemaining(card: TokenCard, ttl: number): number {
  return Math.max(
    0,
    Math.floor(
      (Date.parse(card.observedAt) +
        cardCacheTtl(card, ttl) * 1000 -
        Date.now()) /
        1000,
    ),
  );
}
export class TokenCardService implements TokenCardSource {
  private readonly inFlight = new Map<string, Promise<TokenCard>>();
  constructor(
    private readonly controls: ControlsSource,
    private readonly exit: ExitCheckSource,
    private readonly sources: CardSources,
    private readonly cache: JsonCache,
    private readonly cacheSeconds: number,
    private readonly receipts?: ReceiptService,
    private readonly now: () => number = Date.now,
  ) {}
  async card(input: string): Promise<TokenCard> {
    if (!isAddress(input, { strict: false }) || /^0x0{40}$/i.test(input))
      throw new AppError("INVALID_TOKEN", 400, "Enter a nonzero token address");
    const address = getAddress(input);
    const pending = this.inFlight.get(address);
    if (pending) return { ...(await pending), servedFrom: "cache" };
    const computation = this.cachedOrCompute(address);
    this.inFlight.set(address, computation);
    try {
      return await computation;
    } finally {
      this.inFlight.delete(address);
    }
  }
  private async cachedOrCompute(address: string): Promise<TokenCard> {
    const key = `token-card:v1:${address}`;
    const cached = await this.cache.get<{ card: TokenCard; expiresAt: number }>(
      key,
    );
    if (cached && cached.expiresAt > this.now())
      return { ...cached.card, servedFrom: "cache" };
    const observation = await this.compute(address);
    const card: TokenCard = {
      ...observation,
      servedFrom: "fresh",
    };
    const ttl = cardCacheTtl(card, this.cacheSeconds);
    await this.cache.set(
      key,
      { card, expiresAt: Date.parse(card.observedAt) + ttl * 1000 },
      ttl,
    );
    return card;
  }
  private async compute(
    address: string,
  ): Promise<Omit<TokenCard, "servedFrom">> {
    const evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
    let controls: Part<TokenControls>;
    try {
      controls = {
        state: "available",
        value: await this.controls.check(
          address,
          this.receipts ? evidence : undefined,
        ),
      };
    } catch (error) {
      controls = failure(error);
    }
    const anchor =
      controls.state === "available" ? controls.value.anchor : null;
    const reviewed = findOpenDataAsset(address);
    let identity: Part<Identity>;
    if (reviewed)
      identity = {
        state: "available",
        value: {
          name: reviewed.name,
          symbol: reviewed.symbol,
          decimals: reviewed.decimals,
          basis: "reviewed",
          source: "opsis-reviewed-registry",
          observedAt: reviewed.provenance.reviewedAt,
          anchor: null,
        },
      };
    else if (
      anchor &&
      controls.state === "available" &&
      controls.value.hasCode
    ) {
      try {
        identity = {
          state: "available",
          value: await this.sources.identity(address, anchor),
        };
      } catch (error) {
        identity = failure(error);
      }
    } else identity = unknown("RPC_TOKEN_IDENTITY_UNAVAILABLE");
    let market: MarketSample | undefined;
    let concentration: TokenCard["concentration"];
    try {
      market = await this.sources.market(address);
      concentration = market.concentration;
    } catch (error) {
      concentration = failure(error);
    }
    let exitQuote: Part<CardQuote> = unknown("USD_CONVERSION_UNAVAILABLE");
    if (identity.state === "available" && market?.priceUsd) {
      const age = this.now() - Date.parse(market.observedAt);
      const amount = thousandDollarAmount(
        market.priceUsd,
        identity.value.decimals,
      );
      if (amount && age >= 0 && age < 60_000) {
        try {
          const result = await this.exit.quote({
            token: address,
            amount,
            outputToken:
              address.toLowerCase() ===
              REVIEWED_ASSETS.WETH.address.toLowerCase()
                ? "USDG"
                : "WETH",
            curve: false,
          });
          if (!result.supported || !result.quote)
            exitQuote = { state: "unavailable", reason: result.reason };
          else if (
            Date.parse(result.expiresAt) <= this.now() ||
            result.input.contract.toLowerCase() !== address.toLowerCase() ||
            result.input.decimals !== identity.value.decimals ||
            result.input.rawAmount !==
              decimalRaw(amount, identity.value.decimals)
          )
            exitQuote = unknown("QUOTE_CONTEXT_MISMATCH_OR_EXPIRED");
          else
            exitQuote = {
              state: "available",
              value: {
                input: result.input,
                output: result.output,
                quote: result.quote,
                anchor: result.anchor,
                quotedAt: result.quotedAt,
                expiresAt: result.expiresAt,
                notionalUsd: "1000",
                conversion: {
                  priceUsd: market.priceUsd,
                  source: market.source,
                  observedAt: market.observedAt,
                },
                limitations: [
                  "Token amount rounded down from the reported USD price; conversion and quote are independent observations.",
                  "One selected Uniswap V3 pool; gas excluded, pool fee included. Execution is not established.",
                ],
              },
            };
        } catch (error) {
          exitQuote = failure(error);
        }
      } else exitQuote = unknown("USD_CONVERSION_STALE_OR_INVALID");
    }
    const card: Omit<TokenCard, "servedFrom"> = {
      schemaVersion: 1,
      chainId: 4663,
      address,
      observedAt: new Date(this.now()).toISOString(),
      identity,
      controls,
      exitQuote,
      concentration,
      anchor,
      sources: [
        ...(identity.state === "available"
          ? [
              {
                id: identity.value.source,
                observedAt: identity.value.observedAt,
              },
            ]
          : []),
        ...(controls.state === "available"
          ? [
              {
                id: controls.value.source,
                observedAt: controls.value.observedAt,
              },
            ]
          : []),
        ...(market
          ? [{ id: market.source, observedAt: market.observedAt }]
          : []),
        ...(exitQuote.state === "available"
          ? [{ id: "exit-check-rpc", observedAt: exitQuote.value.quotedAt }]
          : []),
      ],
      limitations: [
        "Partial standard controls only; getter responses do not establish arbitrary privileges or transfer behavior.",
        "Controls and quote retain independent current, non-final anchors. Explorer samples are not block-pinned.",
        "Receipt RPC hashes cover controls only; other upstream payload hashes are unavailable.",
        "Explorer price observation time is its fetch time; upstream price calculation time and coverage are unknown.",
        "Concentration covers the returned largest-holder sample, excluding explorer-labelled pools and burn addresses; addresses do not establish ownership.",
      ],
      disclaimer: ADVICE,
    };
    if (this.receipts) {
      // Receipt v1 requires a real chain anchor. Never invent one for a failed read.
      if (
        !anchor ||
        controls.state !== "available" ||
        !evidence.rpcCalls.length ||
        evidence.rpcCalls.length !== controls.value.coverage.rpcCalls
      )
        throw new AppError(
          "RECEIPTS_UNAVAILABLE",
          503,
          "Receipt evidence unavailable",
        );
      card.receipt = await issueSurfaceReceipt(
        this.receipts,
        "token_card",
        { address },
        card,
        anchor,
        evidence,
      );
    }
    return card;
  }
}
function decimalRaw(amount: string, decimals: number): string {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`).toString();
}
export async function issueSurfaceReceipt(
  service: ReceiptService,
  tool: string,
  inputs: Json,
  outputs: unknown,
  anchor: Anchor,
  evidence: ControlsEvidence = { rpcCalls: [], sources: [] },
): Promise<Receipt> {
  try {
    return await service.issue({
      tool,
      inputs,
      chainId: 4663,
      block: {
        number: String(anchor.blockNumber),
        hash: anchor.blockHash as `0x${string}`,
        timestamp: anchor.timestamp,
      },
      rpcCalls: evidence.rpcCalls,
      sources: evidence.sources,
      outputs: JSON.parse(JSON.stringify(outputs)) as Json,
      labelsetVersion: "token-card-v1",
    });
  } catch {
    throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable");
  }
}
