import type { StockDeskResult } from "@rh-chain/shared";
import type { JsonCache } from "../cache/service.js";
import { AppError } from "../http/errors.js";
import {
  STOCK_DESK_ASSETS,
  type StockDeskSource,
} from "../stock-desk/service.js";

export type StockCard = {
  schemaVersion: 1;
  chainId: 4663;
  ticker: string;
  name: string;
  observedAt: string;
  expiresAt: string;
  servedFrom: "fresh" | "cache";
  desk: StockDeskResult;
};
export interface StockCardSource {
  card(ticker: string): Promise<StockCard>;
}

export function reviewedStock(ticker: string) {
  return STOCK_DESK_ASSETS.find(
    (asset) => asset.symbol === ticker.toUpperCase(),
  );
}

/** Public cards share the desk's engines and budgets; only reviewed tickers enter the cache. */
export class StockCardService implements StockCardSource {
  private readonly inFlight = new Map<string, Promise<StockCard>>();
  constructor(
    private readonly desk: Pick<StockDeskSource, "desk">,
    private readonly cache: JsonCache,
    private readonly cacheSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  async card(ticker: string): Promise<StockCard> {
    const asset = reviewedStock(ticker);
    if (!asset)
      throw new AppError(
        "STOCK_CARD_NOT_FOUND",
        404,
        "Ticker is not in the reviewed Stock Token sample",
        {
          reason: "UNREVIEWED_STOCK_TICKER",
        },
      );
    const pending = this.inFlight.get(asset.symbol);
    if (pending) return { ...(await pending), servedFrom: "cache" };
    const computation = this.cachedOrCompute(asset);
    this.inFlight.set(asset.symbol, computation);
    try {
      return await computation;
    } finally {
      this.inFlight.delete(asset.symbol);
    }
  }

  private async cachedOrCompute(
    asset: NonNullable<ReturnType<typeof reviewedStock>>,
  ): Promise<StockCard> {
    const key = `stock-card:v1:${asset.symbol}`;
    const cached = await this.cache.get<StockCard>(key);
    if (cached && Date.parse(cached.expiresAt) > this.now())
      return { ...cached, servedFrom: "cache" };
    const desk = await this.desk.desk(asset.address);
    const card: StockCard = {
      schemaVersion: 1,
      chainId: 4663,
      ticker: asset.symbol,
      name: asset.name,
      observedAt: desk.observedAt,
      expiresAt: new Date(this.now() + this.cacheSeconds * 1000).toISOString(),
      servedFrom: "fresh",
      desk,
    };
    await this.cache.set(key, card, this.cacheSeconds);
    return card;
  }
}

export function stockCardCacheRemaining(card: StockCard): number {
  return Math.max(
    0,
    Math.floor((Date.parse(card.expiresAt) - Date.now()) / 1000),
  );
}
