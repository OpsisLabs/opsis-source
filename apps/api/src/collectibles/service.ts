import type {
  CollectibleCardBrief,
  CollectibleCardDetail,
  CollectibleDetailResponse,
  CollectibleLanguage,
  CollectiblePrivacyReceipt,
  CollectibleSearchResponse
} from "@rh-chain/shared";
import { createProviderHttp, ProviderRequestError, type ProviderHttp } from "../chain/provider-http.js";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { createCollectibleBudget, type CollectibleBudget } from "./budget.js";

const LICENSE_URL = "https://github.com/tcgdex/cards-database/blob/master/LICENSE";
const SOURCE_URL = "https://tcgdex.dev";
const MAX_PROVIDER_RESULTS = 25;
const MAX_RESULTS = 8;
const CARD_ID = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/;
const SEARCH_QUERY = `query ChainScoutCatalogSearch($name: String!, $localId: String) {
  cards(filters: { name: $name, localId: $localId }, pagination: { page: 1, itemsPerPage: 25 }) {
    id
    localId
    name
  }
}`;
const DETAIL_QUERY = `query ChainScoutCatalogDetail($id: ID!) {
  card(id: $id) {
    id
    localId
    name
    category
    illustrator
    rarity
    set { id name cardCount { official total } }
  }
}`;

type Dependencies = { http: ProviderHttp; budget: CollectibleBudget; now: () => Date };
export type CollectibleSearchInput = { language: CollectibleLanguage; name: string; number?: string; setId?: string };
export type CollectibleDetailInput = { language: CollectibleLanguage; cardId: string };

export interface CollectibleCatalogSource {
  search(input: CollectibleSearchInput): Promise<CollectibleSearchResponse>;
  detail(input: CollectibleDetailInput): Promise<CollectibleDetailResponse>;
}

export class CollectibleCatalogService implements CollectibleCatalogSource {
  private readonly dependencies: Dependencies;

  constructor(private readonly env: Env, dependencies?: Partial<Dependencies>) {
    const oneAttemptEnv: Env = { ...env, PROVIDER_MAX_RETRIES: 0 };
    this.dependencies = {
      http: dependencies?.http ?? createProviderHttp(oneAttemptEnv, "tcgdex", 512 * 1024),
      budget: dependencies?.budget ?? createCollectibleBudget(env),
      now: dependencies?.now ?? (() => new Date())
    };
  }

  async search(input: CollectibleSearchInput): Promise<CollectibleSearchResponse> {
    const query = normalizeSearch(input);
    const body = graphqlField(await this.request(SEARCH_QUERY, {
      name: query.name,
      ...(query.number ? { localId: query.number } : {})
    }), "cards");
    if (!Array.isArray(body) || body.length > MAX_PROVIDER_RESULTS) {
      throw malformed("TCGdex returned an invalid or unbounded search document");
    }
    const parsed = body.map(parseBrief);
    const exactNumber = query.number
      ? parsed.filter((card) => card.number.toLocaleLowerCase("en-US") === query.number?.toLocaleLowerCase("en-US"))
      : parsed;
    const exactSet = query.setId
      ? exactNumber.filter((card) => card.catalogId.toLocaleLowerCase("en-US").startsWith(`${query.setId?.toLocaleLowerCase("en-US")}-`))
      : exactNumber;
    const results = exactSet.slice(0, MAX_RESULTS);
    return {
      query: { ...query, number: query.number ?? null, setId: query.setId ?? null },
      results,
      matchesShown: results.length,
      truncated: exactSet.length > MAX_RESULTS || body.length === MAX_PROVIDER_RESULTS,
      fetchedAt: this.dependencies.now().toISOString(),
      source: { provider: "tcgdex", url: SOURCE_URL, licenseUrl: LICENSE_URL },
      privacy: privacyReceipt("The confirmed English card name, optional collector number, and optional set ID were sent transiently to ChainScout. ChainScout requested only id, localId, and name from TCGdex GraphQL; no artwork, pricing, ownership fields, or AI model was requested.")
    };
  }

  async detail(input: CollectibleDetailInput): Promise<CollectibleDetailResponse> {
    const language = input.language;
    const cardId = input.cardId.trim();
    if (!CARD_ID.test(cardId)) throw new AppError("INVALID_COLLECTIBLE_ID", 400, "Use a valid TCGdex card ID");
    if (language !== "en") throw new AppError("COLLECTIBLE_LANGUAGE_UNAVAILABLE", 400, "Catalog matching currently supports English metadata only");
    const sourceUrl = `${this.env.TCGDEX_API_BASE_URL.replace(/\/$/, "")}/graphql`;
    const body = graphqlField(await this.request(DETAIL_QUERY, { id: cardId }), "card");
    if (body === null) throw new AppError("COLLECTIBLE_NOT_FOUND", 404, "No matching catalog card was found");
    const card = parseDetail(body, language, cardId, sourceUrl, this.dependencies.now());
    return {
      card,
      privacy: privacyReceipt("The selected public card ID was sent transiently to ChainScout. ChainScout requested only allowlisted card and set identity metadata from TCGdex GraphQL; no artwork, pricing, printing claim, ownership field, or AI model was requested.")
    };
  }

  private async request(query: string, variables: Record<string, unknown>): Promise<unknown> {
    await this.dependencies.budget.consume(1);
    try {
      return await this.dependencies.http.requestJson(`${this.env.TCGDEX_API_BASE_URL.replace(/\/$/, "")}/graphql`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "user-agent": "ChainScout/collectible-catalog" },
        body: JSON.stringify({ query, variables }),
        redirect: "error"
      });
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (error.code === "PROVIDER_HTTP_404") throw new AppError("COLLECTIBLE_NOT_FOUND", 404, "No matching catalog card was found");
        if (error.code === "PROVIDER_HTTP_429") throw new AppError("COLLECTIBLE_PROVIDER_RATE_LIMITED", 503, "The free catalog provider is rate-limited; the manual Vault path remains available");
      }
      throw new AppError("COLLECTIBLE_PROVIDER_UNAVAILABLE", 503, "The collectible catalog is temporarily unavailable; the manual Vault path remains available");
    }
  }
}

function normalizeSearch(input: CollectibleSearchInput): Required<Pick<CollectibleSearchInput, "language" | "name">> & { number?: string; setId?: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  const number = input.number?.trim();
  const setId = input.setId?.trim();
  if (input.language !== "en") throw new AppError("COLLECTIBLE_LANGUAGE_UNAVAILABLE", 400, "Catalog matching currently supports English metadata only");
  if (name.length < 2 || name.length > 80) throw new AppError("INVALID_COLLECTIBLE_QUERY", 400, "Card name must be 2 to 80 characters");
  if (!/^[\p{L}\p{N} .:'’&()\-]+$/u.test(name)) throw new AppError("INVALID_COLLECTIBLE_QUERY", 400, "Card name contains unsupported search characters");
  if (number && (number.length > 24 || !/^[a-zA-Z0-9./-]+$/.test(number))) throw new AppError("INVALID_COLLECTIBLE_QUERY", 400, "Collector number contains unsupported characters");
  if (setId && (setId.length > 32 || !/^[a-zA-Z0-9.-]+$/.test(setId))) throw new AppError("INVALID_COLLECTIBLE_QUERY", 400, "Set ID contains unsupported characters");
  return { language: input.language, name, ...(number ? { number } : {}), ...(setId ? { setId } : {}) };
}

function parseBrief(value: unknown): CollectibleCardBrief {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !CARD_ID.test(value.id)
    || typeof value.name !== "string"
    || value.name.trim().length < 1
    || value.name.length > 120
    || !["string", "number"].includes(typeof value.localId)) {
    throw malformed("TCGdex returned a malformed card result");
  }
  const number = String(value.localId);
  if (number.length < 1 || number.length > 24) throw malformed("TCGdex returned an invalid collector number");
  if (!value.id.endsWith(`-${number}`)) throw malformed("TCGdex returned an internally inconsistent card result");
  return { catalogId: value.id, name: value.name.trim(), number };
}

function parseDetail(value: unknown, language: CollectibleLanguage, requestedId: string, sourceUrl: string, fetchedAt: Date): CollectibleCardDetail {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || value.id.toLocaleLowerCase("en-US") !== requestedId.toLocaleLowerCase("en-US")
    || !CARD_ID.test(value.id)
    || typeof value.name !== "string"
    || value.name.trim().length < 1
    || value.name.length > 120
    || !["string", "number"].includes(typeof value.localId)
    || typeof value.category !== "string"
    || value.category.length < 1
    || value.category.length > 40
    || !isRecord(value.set)
    || typeof value.set.id !== "string"
    || !CARD_ID.test(value.set.id)
    || typeof value.set.name !== "string"
    || value.set.name.length < 1
    || value.set.name.length > 120
    || !isRecord(value.set.cardCount)
    || !validCount(value.set.cardCount.official)
    || !validCount(value.set.cardCount.total)) {
    throw malformed("TCGdex returned a malformed card detail document");
  }
  const number = String(value.localId);
  if (number.length < 1 || number.length > 24) throw malformed("TCGdex returned an invalid collector number");
  if (value.id !== `${value.set.id}-${number}` || Number(value.set.cardCount.total) < Number(value.set.cardCount.official)) {
    throw malformed("TCGdex returned an internally inconsistent card identity");
  }
  const rarity = optionalText(value.rarity, 80);
  const illustrator = optionalText(value.illustrator, 120);
  return {
    provider: "tcgdex",
    catalogId: value.id,
    language,
    name: value.name.trim(),
    number,
    category: value.category,
    set: {
      id: value.set.id,
      name: value.set.name,
      officialCount: Number(value.set.cardCount.official),
      totalCount: Number(value.set.cardCount.total)
    },
    rarity,
    illustrator,
    catalogUpdatedAt: null,
    fetchedAt: fetchedAt.toISOString(),
    sourceUrl,
    licenseUrl: LICENSE_URL
  };
}

function privacyReceipt(disclosure: string): CollectiblePrivacyReceipt {
  return {
    accountRequired: false,
    walletConnectionRequired: false,
    serverStorage: "none",
    modelProvider: "none",
    providerDestinations: ["TCGdex"],
    disclosure
  };
}

function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw malformed("TCGdex returned invalid optional card metadata");
  return value;
}

function validCount(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
}

function graphqlField(body: unknown, field: string): unknown {
  if (!isRecord(body)
    || body.errors !== undefined
    || !isRecord(body.data)
    || !(field in body.data)) {
    throw malformed("TCGdex returned a malformed GraphQL response");
  }
  return body.data[field];
}

function malformed(message: string): AppError {
  return new AppError("COLLECTIBLE_PROVIDER_MALFORMED", 503, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
