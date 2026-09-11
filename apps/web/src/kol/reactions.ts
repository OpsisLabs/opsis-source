import edition from "./reactions.json";
import type { Call } from "./model";
import {
  assetIds,
  maxPriceDeviationSeconds,
  type PriceAsset,
} from "./performance";

export const reactionEdition = edition;
export type Reaction = {
  callId: string;
  status: string;
  reason: string;
  assets: PriceAsset[];
  unresolvedTokens: string[];
  unavailableTokens?: string[];
  entryAt: number;
  endAt: number;
  url: string | null;
  sha256: string | null;
};
const records = new Map<string, Reaction>(
  edition.records.map((record) => [record.callId, record]),
);

export function validReactionAsset(
  asset: PriceAsset,
  call: Call,
  entryAt: number,
) {
  const published = Date.parse(call.publishedAt) / 1000;
  const cutoff = Date.parse(edition.asOf) / 1000;
  return (
    call.tokens.includes(asset.symbol) &&
    asset.id === assetIds[asset.symbol] &&
    Number.isFinite(asset.confidence) &&
    asset.confidence >= 0.9 &&
    entryAt === (Math.floor(published / 3600) + 1) * 3600 &&
    entryAt + 604800 <= cutoff &&
    asset.prices.length === 8 &&
    asset.prices.every(
      (point, i, all) =>
        Number.isFinite(point.price) &&
        point.price > 0 &&
        Number.isFinite(point.timestamp) &&
        point.timestamp >= published &&
        point.timestamp <= cutoff &&
        Math.abs(point.timestamp - entryAt - i * 86400) <=
          maxPriceDeviationSeconds &&
        (i === 0 || point.timestamp > all[i - 1].timestamp),
    )
  );
}

export function priceContext(
  call: Call,
  record: Reaction | undefined = records.get(call.id),
) {
  if (!record)
    return {
      status: "unavailable",
      assets: [],
      missing: [...call.tokens],
      url: null,
      reason: "Price context has not been captured for this post.",
    };
  const assets =
    record.status === "complete"
      ? record.assets.filter(
          (asset) =>
            record.callId === call.id &&
            record.endAt === record.entryAt + 604800 &&
            record.assets.filter(
              (other) => other.id === asset.id || other.symbol === asset.symbol,
            ).length === 1 &&
            validReactionAsset(asset, call, record.entryAt),
        )
      : [];
  const status =
    record.status === "complete" && !assets.length
      ? "unavailable"
      : record.status;
  const missing = call.tokens.filter(
    (token) => !assets.some((asset) => asset.symbol === token),
  );
  return { status, assets, missing, url: record.url, reason: record.reason };
}

export function contextReturn(asset: PriceAsset) {
  return (asset.prices[7].price / asset.prices[0].price - 1) * 100;
}
