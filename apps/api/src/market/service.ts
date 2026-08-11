import type {
  ApprovedMerchantDirectoryResponse,
  CryptoMarketResponse,
  DexMarketPair,
  MerchantInventoryResponse,
  MerchantInventoryState,
  MerchantOffer,
} from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import {
  createProviderHttp,
  ProviderRequestError,
  type ProviderHttp,
} from "../chain/provider-http.js";
import { AppError } from "../http/errors.js";
import type { MarketBudget } from "./budget.js";
import { createMarketBudget } from "./budget.js";
import {
  APPROVED_MARKET_MERCHANTS,
  type ApprovedMerchant,
} from "./merchants.js";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PAIR_ID = /^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
const DECIMAL = /^\d{1,78}(?:\.\d{1,78})?$/;
const SIGNED_DECIMAL = /^-?\d{1,78}(?:\.\d{1,78})?$/;
const DEX_API_ORIGIN = "https://api.dexscreener.com";
const DEX_SOURCE_ORIGIN = "https://dexscreener.com";
const DEX_MAX_RESULTS = 30;
const DEX_VISIBLE_RESULTS = 20;
const DEX_FRESH_MS = 60_000;
const MERCHANT_FRESH_MS = 5 * 60_000;

type Dependencies = {
  http: ProviderHttp;
  budget: MarketBudget;
  merchants: readonly ApprovedMerchant[];
  now: () => Date;
};

export interface MarketInventorySource {
  directory(): ApprovedMerchantDirectoryResponse;
  crypto(contract: string): Promise<CryptoMarketResponse>;
  merchant(
    merchantId: string,
    canonicalAssetId: string,
    expected: MerchantMappingExpectation,
  ): Promise<MerchantInventoryResponse>;
}

export type MerchantMappingExpectation = {
  sku: string;
  productId: string;
  reviewedAt: string;
};

export class MarketInventoryService implements MarketInventorySource {
  private readonly dependencies: Dependencies;

  constructor(
    private readonly env: Env,
    dependencies?: Partial<Dependencies>,
  ) {
    const oneAttemptEnv: Env = { ...env, PROVIDER_MAX_RETRIES: 0 };
    this.dependencies = {
      http:
        dependencies?.http ??
        createProviderHttp(oneAttemptEnv, "market-inventory", 1024 * 1024),
      budget: dependencies?.budget ?? createMarketBudget(env),
      merchants: dependencies?.merchants ?? APPROVED_MARKET_MERCHANTS,
      now: dependencies?.now ?? (() => new Date()),
    };
  }

  directory(): ApprovedMerchantDirectoryResponse {
    const now = this.dependencies.now();
    validateMerchantRegistry(this.dependencies.merchants, now);
    const merchants = this.dependencies.merchants.map((merchant) => {
      return {
        id: merchant.id,
        name: merchant.name,
        permissionReviewedAt: merchant.permissionReviewedAt,
        permissionEvidenceUrl: merchant.permissionEvidenceUrl,
        mappings: merchant.products.map((mapping) => ({
          canonicalAssetId: mapping.canonicalAssetId,
          sku: mapping.sku,
          productId: mapping.expectedProductId,
          variantLabel: mapping.variantLabel,
          condition: mapping.condition,
          reviewedAt: mapping.reviewedAt,
          evidenceUrl: mapping.evidenceUrl,
        })),
      };
    });
    return {
      schemaVersion: 1,
      merchants,
      loadedAt: now.toISOString(),
      source: "chainscout_reviewed_registry",
      limitations: [
        "Only merchants with affirmative permission and reviewed exact simple-product mappings appear here.",
        "Directory presence is not an endorsement, reputation score, or complete inventory claim.",
      ],
    };
  }

  async crypto(input: string): Promise<CryptoMarketResponse> {
    const contract = normalizeAddress(
      input,
      "Use a valid Robinhood Chain token contract",
    );
    const sourceUrl = `${DEX_SOURCE_ORIGIN}/robinhood/${contract}`;
    const endpoint = `${DEX_API_ORIGIN}/token-pairs/v1/robinhood/${contract}`;
    await this.dependencies.budget.consume(1);
    const body = await this.request(endpoint, "DEX Screener");
    if (!Array.isArray(body) || body.length > DEX_MAX_RESULTS) {
      throw malformed(
        "DEX Screener returned an invalid or unbounded pair collection",
      );
    }
    const matching = body
      .map((candidate) =>
        parseDexPair(candidate, contract, this.dependencies.now()),
      )
      .filter((candidate): candidate is DexMarketPair => candidate !== null)
      .sort(compareLiquidity);
    if (body.length > 0 && matching.length === 0) {
      throw malformed(
        "DEX Screener returned pairs that did not contain the exact requested Robinhood contract",
      );
    }
    const pairIds = new Set(matching.map((pair) => pair.pairAddress));
    if (pairIds.size !== matching.length)
      throw malformed("DEX Screener returned duplicate exact pair identifiers");
    const pairs = matching.slice(0, DEX_VISIBLE_RESULTS);
    const fetchedAt = this.dependencies.now().toISOString();
    return {
      schemaVersion: 1,
      chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
      contract,
      canonicalAssetId: `eip155:4663/erc20:${contract}`,
      identityConfidence: "exact_contract",
      pairs,
      pairsShown: pairs.length,
      truncated:
        body.length === DEX_MAX_RESULTS ||
        matching.length > DEX_VISIBLE_RESULTS,
      fetchedAt,
      freshForMs: DEX_FRESH_MS,
      source: { provider: "dexscreener", url: sourceUrl },
      limitations: [
        "Indexed market observations are not executable quotes and may lag or omit pools.",
        "Liquidity ordering is context only; it does not account for route, slippage, fees, gas, or simulation.",
        "Open the official venue and obtain a new quote before any action.",
      ],
      privacy: {
        accountRequired: false,
        walletConnectionRequired: false,
        serverStorage: "none",
        modelProvider: "none",
        providerDestinations: ["DEX Screener"],
        disclosure:
          "The requested public Robinhood Chain token contract was sent transiently to ChainScout and DEX Screener. Vault ownership, lots, costs, notes, photos, other assets, cookies, and AI were excluded.",
      },
    };
  }

  async merchant(
    merchantIdInput: string,
    canonicalAssetIdInput: string,
    expected: MerchantMappingExpectation,
  ): Promise<MerchantInventoryResponse> {
    const merchantId = boundedToken(
      merchantIdInput,
      64,
      "Use a valid approved merchant ID",
    );
    const canonicalAssetId = canonicalAssetIdInput.trim();
    if (
      canonicalAssetId.length < 3 ||
      canonicalAssetId.length > 200 ||
      /[\u0000-\u001f]/.test(canonicalAssetId)
    ) {
      throw new AppError(
        "INVALID_MARKET_ASSET",
        400,
        "Use a valid canonical asset ID",
      );
    }
    validateMerchantRegistry(
      this.dependencies.merchants,
      this.dependencies.now(),
    );
    const merchant = this.dependencies.merchants.find(
      (candidate) => candidate.id === merchantId,
    );
    if (!merchant)
      throw new AppError(
        "MARKET_MERCHANT_NOT_APPROVED",
        404,
        "That merchant is not enabled for live inventory; use its search handoff instead",
      );
    const mapping = merchant.products.find(
      (candidate) => candidate.canonicalAssetId === canonicalAssetId,
    );
    if (!mapping)
      throw new AppError(
        "MARKET_EXACT_MAPPING_UNAVAILABLE",
        404,
        "No reviewed exact SKU mapping exists for this merchant and asset; use the search handoff instead",
      );
    if (
      expected.sku !== mapping.sku ||
      expected.productId !== mapping.expectedProductId ||
      expected.reviewedAt !== mapping.reviewedAt
    ) {
      throw new AppError(
        "MARKET_EXACT_MAPPING_CHANGED",
        409,
        "The reviewed merchant mapping changed after consent; reload the approved directory and review it again",
      );
    }

    const url = new URL("/wp-json/wc/store/v1/products", merchant.baseUrl);
    url.searchParams.set("sku", mapping.sku);
    url.searchParams.set("include", mapping.expectedProductId);
    url.searchParams.set("catalog_visibility", "visible");
    await this.dependencies.budget.consume(1);
    const body = await this.request(url.toString(), merchant.name);
    if (!Array.isArray(body) || body.length > 100)
      throw malformed(
        "The merchant returned an invalid or unbounded product collection",
      );
    const exact = body.filter(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.sku === "string" &&
        candidate.sku.toLocaleLowerCase("en-US") ===
          mapping.sku.toLocaleLowerCase("en-US"),
    );
    if (exact.length > 1)
      throw malformed(
        "The merchant returned duplicate products for the reviewed exact SKU",
      );
    if (body.length > 0 && exact.length === 0)
      throw malformed(
        "The merchant response conflicted with the reviewed exact SKU mapping",
      );
    const fetchedAt = this.dependencies.now();
    const offer =
      exact.length === 1
        ? parseWooOffer(exact[0], merchant, mapping, fetchedAt)
        : null;
    return {
      schemaVersion: 1,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        provider: "woocommerce",
      },
      canonicalAssetId,
      mapping: {
        sku: mapping.sku,
        productId: mapping.expectedProductId,
        reviewedAt: mapping.reviewedAt,
        evidenceUrl: mapping.evidenceUrl,
      },
      offer,
      state: offer ? "exact_match" : "valid_empty",
      fetchedAt: fetchedAt.toISOString(),
      freshForMs: MERCHANT_FRESH_MS,
      source: { provider: "woocommerce", url: offer?.url ?? merchant.baseUrl },
      limitations: [
        "This is one opted-in merchant's published storefront state, not complete internet inventory.",
        "Exact quantity is not supplied. Availability can change before checkout.",
        "Product rating and count, when present, are merchant-reported product fields—not seller reputation or ChainScout verification.",
      ],
      privacy: {
        accountRequired: false,
        walletConnectionRequired: false,
        serverStorage: "none",
        modelProvider: "none",
        providerDestinations: [merchant.name],
        disclosure: `The public canonical asset ID, approved merchant ID, reviewed SKU, expected product ID, and mapping review date were sent transiently to ChainScout. Only the reviewed SKU and expected product ID were sent to ${merchant.name}. Vault ownership, lots, costs, labels, notes, photos, other assets, cookies, and AI were excluded.`,
      },
    };
  }

  private async request(url: string, provider: string): Promise<unknown> {
    try {
      return await this.dependencies.http.requestJson(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "ChainScout/market-inventory",
        },
        redirect: "error",
      });
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (error.code === "PROVIDER_HTTP_429")
          throw new AppError(
            "MARKET_PROVIDER_RATE_LIMITED",
            503,
            `${provider} is rate-limited; the prior encrypted observation remains unchanged`,
          );
        if (error.code === "PROVIDER_RESPONSE_TOO_LARGE")
          throw malformed(`${provider} returned an oversized response`);
        if (error.code === "PROVIDER_MALFORMED_RESPONSE")
          throw malformed(`${provider} returned malformed data`);
      }
      throw new AppError(
        "MARKET_PROVIDER_UNAVAILABLE",
        503,
        `${provider} is temporarily unavailable; the prior encrypted observation remains unchanged`,
      );
    }
  }
}

function parseDexPair(
  value: unknown,
  contract: string,
  now: Date,
): DexMarketPair | null {
  if (!isRecord(value) || value.chainId !== "robinhood") return null;
  const base = parseToken(value.baseToken);
  const quote = parseToken(value.quoteToken);
  if (
    !base ||
    !quote ||
    (base.address !== contract && quote.address !== contract)
  )
    return null;
  if (
    typeof value.pairAddress !== "string" ||
    !PAIR_ID.test(value.pairAddress) ||
    typeof value.dexId !== "string" ||
    value.dexId.length < 1 ||
    value.dexId.length > 60 ||
    typeof value.url !== "string" ||
    !isDexSourceUrl(value.url, value.pairAddress)
  ) {
    throw malformed("DEX Screener returned malformed exact-pair identity data");
  }
  const labels = value.labels === undefined ? [] : value.labels;
  if (
    !Array.isArray(labels) ||
    labels.length > 8 ||
    labels.some((label) => typeof label !== "string" || label.length > 40)
  ) {
    throw malformed("DEX Screener returned invalid pair labels");
  }
  const liquidity = isRecord(value.liquidity)
    ? unsignedNumeric(value.liquidity.usd)
    : null;
  const volume = isRecord(value.volume)
    ? unsignedNumeric(value.volume.h24)
    : null;
  const change = isRecord(value.priceChange)
    ? signedNumeric(value.priceChange.h24)
    : null;
  const created = parseCreatedAt(value.pairCreatedAt, now);
  return {
    pairAddress: value.pairAddress.toLowerCase(),
    dexId: value.dexId,
    url: value.url,
    labels,
    baseToken: base,
    quoteToken: quote,
    pricedTokenAddress: base.address,
    baseTokenPriceUsd: unsignedNumeric(value.priceUsd),
    baseTokenPriceInQuote: unsignedNumeric(value.priceNative),
    liquidityUsd: liquidity,
    volume24hUsd: volume,
    priceChange24hPercent: change,
    pairCreatedAt: created,
  };
}

function parseToken(
  value: unknown,
): { address: string; name: string; symbol: string } | null {
  if (
    !isRecord(value) ||
    typeof value.address !== "string" ||
    !ADDRESS.test(value.address) ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 120 ||
    typeof value.symbol !== "string" ||
    value.symbol.length < 1 ||
    value.symbol.length > 30
  )
    return null;
  return {
    address: value.address.toLowerCase(),
    name: value.name,
    symbol: value.symbol,
  };
}

function parseWooOffer(
  value: unknown,
  merchant: ApprovedMerchant,
  mapping: ApprovedMerchant["products"][number],
  now: Date,
): MerchantOffer {
  if (
    !isRecord(value) ||
    !(typeof value.id === "number" || typeof value.id === "string") ||
    String(value.id) !== mapping.expectedProductId ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 200 ||
    typeof value.permalink !== "string" ||
    !sameOriginUrl(value.permalink, merchant.baseUrl) ||
    typeof value.sku !== "string" ||
    value.sku.toLocaleLowerCase("en-US") !==
      mapping.sku.toLocaleLowerCase("en-US") ||
    !isRecord(value.prices) ||
    typeof value.prices.currency_code !== "string" ||
    !/^[A-Z]{3,12}$/.test(value.prices.currency_code) ||
    typeof value.prices.currency_minor_unit !== "number" ||
    !Number.isInteger(value.prices.currency_minor_unit) ||
    value.prices.currency_minor_unit < 0 ||
    value.prices.currency_minor_unit > 8 ||
    typeof value.prices.price !== "string" ||
    !/^\d{1,78}$/.test(value.prices.price) ||
    typeof value.is_in_stock !== "boolean" ||
    value.has_options !== false ||
    !(
      value.is_purchasable === undefined ||
      typeof value.is_purchasable === "boolean"
    )
  ) {
    throw malformed("The merchant returned malformed exact-product data");
  }
  const rating = parseProductRating(value.average_rating, value.review_count);
  const low = value.low_stock_remaining;
  if (!(
    low === undefined ||
    low === null ||
    (typeof low === "number" && Number.isSafeInteger(low) && low >= 0)
  )) {
    throw malformed("The merchant returned an invalid low-stock state");
  }
  return {
    provider: "woocommerce",
    merchantId: merchant.id,
    merchantName: merchant.name,
    canonicalAssetId: mapping.canonicalAssetId,
    identityConfidence: "reviewed_simple_product_mapping",
    productId: String(value.id),
    sku: mapping.sku,
    title: value.name,
    variantLabel: mapping.variantLabel,
    condition: mapping.condition,
    mappingReviewedAt: mapping.reviewedAt,
    mappingEvidenceUrl: mapping.evidenceUrl,
    url: value.permalink,
    currency: value.prices.currency_code,
    unitPrice: formatMinorUnits(
      value.prices.price,
      value.prices.currency_minor_unit,
    ),
    inventoryState: inventoryState(
      value.is_in_stock,
      value.is_purchasable,
      low,
    ),
    exactQuantity: null,
    productRating: rating,
    fetchedAt: now.toISOString(),
    freshForMs: MERCHANT_FRESH_MS,
  };
}

function inventoryState(
  inStock: boolean,
  purchasable: unknown,
  low: unknown,
): MerchantInventoryState {
  if (!inStock) return "provider_unavailable";
  if (purchasable === false) return "unknown";
  if (typeof low === "number") return "provider_low_stock";
  return "provider_available";
}

function parseProductRating(
  average: unknown,
  count: unknown,
): MerchantOffer["productRating"] {
  if (
    (average === undefined || average === "") &&
    (count === undefined || count === 0)
  )
    return null;
  const parsed = unsignedNumeric(average);
  if (
    !parsed ||
    !ratingAtMostFive(parsed) ||
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw malformed("The merchant returned invalid product-rating fields");
  }
  if (parsed === "0" && count === 0) return null;
  return {
    average: parsed,
    count,
    sourceLabel: "merchant_reported_product_rating",
  };
}

function ratingAtMostFive(value: string): boolean {
  return /^(?:[0-4](?:\.\d+)?|5(?:\.0+)?)$/.test(value);
}

function validateMerchant(merchant: ApprovedMerchant, now: Date): void {
  if (
    !/^[a-z0-9-]{2,64}$/.test(merchant.id) ||
    merchant.name.length < 2 ||
    merchant.name.length > 100 ||
    !isApprovedMerchantOrigin(merchant.baseUrl) ||
    !/^[a-z0-9][a-z0-9._:-]{2,120}$/i.test(merchant.permissionRecordId) ||
    !isReviewDate(merchant.permissionReviewedAt, now) ||
    !sameOriginUrl(merchant.permissionEvidenceUrl, merchant.baseUrl) ||
    merchant.products.length > 500
  ) {
    throw new AppError(
      "MARKET_MERCHANT_CONFIGURATION_INVALID",
      503,
      "The approved merchant registry is invalid",
    );
  }
  const ids = new Set<string>();
  const skus = new Set<string>();
  const productIds = new Set<string>();
  for (const mapping of merchant.products) {
    if (
      mapping.canonicalAssetId.length < 3 ||
      mapping.canonicalAssetId.length > 200 ||
      mapping.sku.length < 1 ||
      mapping.sku.length > 100 ||
      !/^\d{1,20}$/.test(mapping.expectedProductId) ||
      mapping.variantLabel.length < 1 ||
      mapping.variantLabel.length > 120 ||
      mapping.condition.length < 1 ||
      mapping.condition.length > 80 ||
      !isReviewDate(mapping.reviewedAt, now) ||
      !sameOriginUrl(mapping.evidenceUrl, merchant.baseUrl) ||
      ids.has(mapping.canonicalAssetId) ||
      skus.has(mapping.sku.toLocaleLowerCase("en-US")) ||
      productIds.has(mapping.expectedProductId)
    ) {
      throw new AppError(
        "MARKET_MERCHANT_CONFIGURATION_INVALID",
        503,
        "The approved merchant registry contains an ambiguous product mapping",
      );
    }
    ids.add(mapping.canonicalAssetId);
    skus.add(mapping.sku.toLocaleLowerCase("en-US"));
    productIds.add(mapping.expectedProductId);
  }
}

function validateMerchantRegistry(
  merchants: readonly ApprovedMerchant[],
  now: Date,
): void {
  if (merchants.length > 100) {
    throw new AppError(
      "MARKET_MERCHANT_CONFIGURATION_INVALID",
      503,
      "The approved merchant registry exceeds its supported bound",
    );
  }
  const ids = new Set<string>();
  const origins = new Set<string>();
  const permissionRecords = new Set<string>();
  for (const merchant of merchants) {
    validateMerchant(merchant, now);
    const origin = new URL(merchant.baseUrl).origin.toLowerCase();
    if (
      ids.has(merchant.id) ||
      origins.has(origin) ||
      permissionRecords.has(merchant.permissionRecordId)
    ) {
      throw new AppError(
        "MARKET_MERCHANT_CONFIGURATION_INVALID",
        503,
        "The approved merchant registry contains ambiguous merchant provenance",
      );
    }
    ids.add(merchant.id);
    origins.add(origin);
    permissionRecords.add(merchant.permissionRecordId);
  }
}

function isReviewDate(value: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    parsed.getTime() <= now.getTime()
  );
}

function isApprovedMerchantOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    const forbidden =
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
      url.hostname.includes(":");
    return (
      url.protocol === "https:" &&
      !forbidden &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.pathname === "" || url.pathname === "/") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function sameOriginUrl(value: string, base: string): boolean {
  try {
    const target = new URL(value);
    const approved = new URL(base);
    return (
      target.protocol === "https:" &&
      target.origin === approved.origin &&
      !target.username &&
      !target.password
    );
  } catch {
    return false;
  }
}

function isDexSourceUrl(value: string, pairId: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === DEX_SOURCE_ORIGIN &&
      !url.username &&
      !url.password &&
      url.pathname.toLocaleLowerCase("en-US") ===
        `/robinhood/${pairId.toLocaleLowerCase("en-US")}` &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function normalizeAddress(value: string, message: string): string {
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS.test(normalized))
    throw new AppError("INVALID_MARKET_CONTRACT", 400, message);
  return normalized;
}

function boundedToken(value: string, max: number, message: string): string {
  const normalized = value.trim();
  if (
    !/^[a-z0-9-]+$/.test(normalized) ||
    normalized.length < 2 ||
    normalized.length > max
  ) {
    throw new AppError("INVALID_MARKET_MERCHANT", 400, message);
  }
  return normalized;
}

function unsignedNumeric(value: unknown): string | null {
  if (typeof value === "string" && DECIMAL.test(value))
    return trimDecimal(value);
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return finiteNumberToDecimal(value);
  if (value === undefined || value === null) return null;
  throw malformed("A provider returned an invalid unsigned numeric field");
}

function signedNumeric(value: unknown): string | null {
  if (typeof value === "string" && SIGNED_DECIMAL.test(value))
    return trimDecimal(value);
  if (typeof value === "number" && Number.isFinite(value))
    return finiteNumberToDecimal(value);
  if (value === undefined || value === null) return null;
  throw malformed("A provider returned an invalid signed numeric field");
}

function finiteNumberToDecimal(value: number): string {
  const asString = String(value);
  if (!/[eE]/.test(asString)) return trimDecimal(asString);
  const fixed = value.toFixed(18);
  if (/^-?0(?:\.0+)?$/.test(fixed) && value !== 0)
    throw malformed(
      "A provider returned a numeric field outside supported precision",
    );
  const normalized = trimDecimal(fixed);
  if (!SIGNED_DECIMAL.test(normalized))
    throw malformed(
      "A provider returned a numeric field outside supported precision",
    );
  return normalized;
}

function trimDecimal(value: string): string {
  if (!value.includes(".")) return value.replace(/^(-?)0+(?=\d)/, "$1");
  const normalized = value.replace(/0+$/, "").replace(/\.$/, "");
  return normalized.replace(/^(-?)0+(?=\d)/, "$1");
}

function formatMinorUnits(raw: string, places: number): string {
  const digits = raw.replace(/^0+(?=\d)/, "");
  if (places === 0) return digits;
  const padded = digits.padStart(places + 1, "0");
  return trimDecimal(`${padded.slice(0, -places)}.${padded.slice(-places)}`);
}

function parseCreatedAt(value: unknown, now: Date): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > now.getTime() + 5 * 60_000
  ) {
    throw malformed("DEX Screener returned an invalid pair-created time");
  }
  return new Date(value).toISOString();
}

function compareLiquidity(left: DexMarketPair, right: DexMarketPair): number {
  const delta =
    Number(right.liquidityUsd ?? "-1") - Number(left.liquidityUsd ?? "-1");
  if (Number.isFinite(delta) && delta !== 0) return delta;
  return left.pairAddress.localeCompare(right.pairAddress);
}

function malformed(message: string): AppError {
  return new AppError("MARKET_PROVIDER_MALFORMED", 503, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
