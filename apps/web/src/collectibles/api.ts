import type {
  CollectibleDetailResponse,
  CollectibleLanguage,
  CollectibleSearchResponse
} from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";

export type CatalogSearch = {
  language: CollectibleLanguage;
  name: string;
  number?: string;
  setId?: string;
};

export async function searchCollectibles(input: CatalogSearch, signal?: AbortSignal): Promise<CollectibleSearchResponse> {
  if (input.language !== "en") throw new Error("Collectible Catalog currently supports English metadata only");
  const response = await privateApi<CollectibleSearchResponse>("/v1/private/collectibles/search", input, signal);
  if (!response
    || !response.query
    || response.query.language !== input.language
    || response.query.name !== input.name.trim().replace(/\s+/g, " ")
    || response.query.number !== (input.number?.trim() || null)
    || response.query.setId !== (input.setId?.trim() || null)
    || !Array.isArray(response.results)
    || response.results.length > 8
    || response.matchesShown !== response.results.length
    || typeof response.truncated !== "boolean"
    || !validTimestamp(response.fetchedAt)
    || response.source?.provider !== "tcgdex"
    || response.source.url !== "https://tcgdex.dev"
    || response.source.licenseUrl !== "https://github.com/tcgdex/cards-database/blob/master/LICENSE"
    || response.privacy?.serverStorage !== "none"
    || response.privacy?.modelProvider !== "none"
    || response.privacy?.providerDestinations?.[0] !== "TCGdex"
    || response.results.some((card) => !card
      || typeof card.catalogId !== "string"
      || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(card.catalogId)
      || typeof card.name !== "string"
      || card.name.length < 1
      || card.name.length > 120
      || typeof card.number !== "string"
      || card.number.length < 1
      || card.number.length > 24
      || !card.catalogId.endsWith(`-${card.number}`)
      || (input.setId && !card.catalogId.toLowerCase().startsWith(`${input.setId.trim().toLowerCase()}-`)))) {
    throw new Error("ChainScout returned an invalid collectible search response");
  }
  return {
    query: {
      language: response.query.language,
      name: response.query.name,
      number: response.query.number,
      setId: response.query.setId
    },
    results: response.results.map((card) => ({ catalogId: card.catalogId, name: card.name, number: card.number })),
    matchesShown: response.matchesShown,
    truncated: response.truncated,
    fetchedAt: response.fetchedAt,
    source: { provider: "tcgdex", url: response.source.url, licenseUrl: response.source.licenseUrl },
    privacy: collectiblePrivacy(response.privacy.disclosure)
  };
}

export async function collectibleDetail(language: CollectibleLanguage, cardId: string, signal?: AbortSignal): Promise<CollectibleDetailResponse> {
  if (language !== "en") throw new Error("Collectible Catalog currently supports English metadata only");
  const response = await privateApi<CollectibleDetailResponse>("/v1/private/collectibles/detail", { language, cardId }, signal);
  const card = response?.card;
  if (!card
    || card.provider !== "tcgdex"
    || typeof card.catalogId !== "string"
    || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(card.catalogId)
    || card.catalogId.toLowerCase() !== cardId.toLowerCase()
    || card.language !== language
    || !validText(card.name, 120)
    || !validText(card.number, 24)
    || !validText(card.category, 40)
    || !(card.rarity === null || validText(card.rarity, 80))
    || !(card.illustrator === null || validText(card.illustrator, 120))
    || !card.set
    || !validText(card.set.id, 80)
    || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(card.set.id)
    || !validText(card.set.name, 120)
    || !validCount(card.set.officialCount)
    || !validCount(card.set.totalCount)
    || card.set.totalCount < card.set.officialCount
    || card.catalogId !== `${card.set.id}-${card.number}`
    || !(card.catalogUpdatedAt === null || validTimestamp(card.catalogUpdatedAt))
    || !validTimestamp(card.fetchedAt)
    || typeof card.sourceUrl !== "string"
    || card.sourceUrl !== "https://api.tcgdex.net/v2/graphql"
    || card.licenseUrl !== "https://github.com/tcgdex/cards-database/blob/master/LICENSE"
    || response.privacy?.serverStorage !== "none"
    || response.privacy?.modelProvider !== "none"
    || response.privacy?.providerDestinations?.[0] !== "TCGdex") {
    throw new Error("ChainScout returned an invalid collectible detail response");
  }
  return {
    card: {
      provider: "tcgdex",
      catalogId: card.catalogId,
      language: card.language,
      name: card.name,
      number: card.number,
      category: card.category,
      set: {
        id: card.set.id,
        name: card.set.name,
        officialCount: card.set.officialCount,
        totalCount: card.set.totalCount
      },
      rarity: card.rarity,
      illustrator: card.illustrator,
      catalogUpdatedAt: card.catalogUpdatedAt,
      fetchedAt: card.fetchedAt,
      sourceUrl: card.sourceUrl,
      licenseUrl: card.licenseUrl
    },
    privacy: collectiblePrivacy(response.privacy.disclosure)
  };
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function collectiblePrivacy(disclosure: string): CollectibleDetailResponse["privacy"] {
  if (typeof disclosure !== "string" || disclosure.length < 1 || disclosure.length > 1_000) {
    throw new Error("ChainScout returned an invalid collectible privacy receipt");
  }
  return {
    accountRequired: false,
    walletConnectionRequired: false,
    serverStorage: "none",
    modelProvider: "none",
    providerDestinations: ["TCGdex"],
    disclosure
  };
}
