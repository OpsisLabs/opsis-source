import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import {
  ProviderRequestError,
  type ProviderHttp,
} from "../src/chain/provider-http.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import type { MarketBudget } from "../src/market/budget.js";
import type { ApprovedMerchant } from "../src/market/merchants.js";
import { MarketInventoryService } from "../src/market/service.js";
import { marketRoutes } from "../src/routes/market.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const PAIR = "0x3333333333333333333333333333333333333333";
const V4_PAIR = `0x${"44".repeat(32)}`;
const NOW = new Date("2026-08-11T12:00:00.000Z");
const apps: Array<ReturnType<typeof Fastify>> = [];
const testEnv = (enabled = true) =>
  loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    MARKET_INVENTORY_ENABLED: String(enabled),
  });

const merchant: ApprovedMerchant = {
  id: "sample-store",
  name: "Sample Opt-In Store",
  provider: "woocommerce",
  baseUrl: "https://merchant.example",
  permissionRecordId: "merchant-consent-2026-08-11",
  permissionReviewedAt: "2026-08-11",
  permissionEvidenceUrl: "https://merchant.example/chainscout-permission/",
  products: [
    {
      canonicalAssetId: "tcgdex:en:base1-4",
      sku: "CHAR-BASE-4-NM",
      expectedProductId: "42",
      variantLabel: "Unlimited holo",
      condition: "Near mint",
      reviewedAt: "2026-08-11",
      evidenceUrl: "https://merchant.example/product/charizard-base-4-nm/",
    },
  ],
};
const EXPECTED_MAPPING = {
  sku: "CHAR-BASE-4-NM",
  productId: "42",
  reviewedAt: "2026-08-11",
};

afterEach(async () => {
  while (apps.length) await apps.pop()?.close();
});

describe("market and inventory", () => {
  it("lists only the reviewed public merchant directory without permission records or provider calls", () => {
    const requestJson = vi.fn();
    const result = service({ requestJson }, [merchant]).directory();
    expect(result).toMatchObject({
      source: "chainscout_reviewed_registry",
      merchants: [
        {
          id: "sample-store",
          name: "Sample Opt-In Store",
          permissionReviewedAt: "2026-08-11",
          permissionEvidenceUrl:
            "https://merchant.example/chainscout-permission/",
          mappings: [
            {
              canonicalAssetId: "tcgdex:en:base1-4",
              sku: "CHAR-BASE-4-NM",
              productId: "42",
              variantLabel: "Unlimited holo",
              condition: "Near mint",
              reviewedAt: "2026-08-11",
              evidenceUrl:
                "https://merchant.example/product/charizard-base-4-nm/",
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/permissionRecordId/i);
    expect(requestJson).not.toHaveBeenCalled();
  });
  it("returns only exact-chain pairs and labels the pair base token as the priced asset", async () => {
    const body = [
      pair({
        pairAddress: V4_PAIR,
        baseAddress: OTHER,
        quoteAddress: CONTRACT,
        priceUsd: "0.0007234",
        liquidityUsd: 2000,
      }),
      pair({
        pairAddress: PAIR,
        baseAddress: CONTRACT,
        quoteAddress: OTHER,
        priceUsd: "3.25",
        liquidityUsd: 5000,
      }),
      {
        ...pair({
          pairAddress: PAIR,
          baseAddress: CONTRACT,
          quoteAddress: OTHER,
        }),
        chainId: "ethereum",
      },
    ];
    const http: ProviderHttp = { requestJson: vi.fn(async () => body) };
    const result = await service(http).crypto(
      CONTRACT.toUpperCase().replace("0X", "0x"),
    );

    expect(result).toMatchObject({
      contract: CONTRACT,
      canonicalAssetId: `eip155:4663/erc20:${CONTRACT}`,
      identityConfidence: "exact_contract",
      pairsShown: 2,
      truncated: false,
      freshForMs: 60_000,
    });
    expect(result.pairs.map((item) => item.pairAddress)).toEqual([
      PAIR,
      V4_PAIR,
    ]);
    expect(result.pairs[1]).toMatchObject({
      pricedTokenAddress: OTHER,
      baseTokenPriceUsd: "0.0007234",
      baseTokenPriceInQuote: "0.5",
    });
    expect(result.limitations.join(" ")).toMatch(/not executable quotes/i);
    expect(result.privacy).toMatchObject({
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["DEX Screener"],
    });
    expect(http.requestJson).toHaveBeenCalledWith(
      `https://api.dexscreener.com/token-pairs/v1/robinhood/${CONTRACT}`,
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it("marks the observed 30-result boundary truncated and never accepts an oversized collection", async () => {
    const thirty = Array.from({ length: 30 }, (_, index) =>
      pair({
        pairAddress: `0x${index.toString(16).padStart(40, "0")}`,
        baseAddress: CONTRACT,
        quoteAddress: OTHER,
        liquidityUsd: index,
      }),
    );
    expect(
      (
        await service({ requestJson: vi.fn(async () => thirty) }).crypto(
          CONTRACT,
        )
      ).truncated,
    ).toBe(true);
    await expect(
      service({
        requestJson: vi.fn(async () => [...thirty, thirty[0]]),
      }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
  });

  it("distinguishes a valid empty exact-contract result from malformed pair identity", async () => {
    const empty = await service({ requestJson: vi.fn(async () => []) }).crypto(
      CONTRACT,
    );
    expect(empty).toMatchObject({ pairs: [], pairsShown: 0, truncated: false });
    await expect(
      service({
        requestJson: vi.fn(async () => [
          pair({ baseAddress: OTHER, quoteAddress: OTHER }),
        ]),
      }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    const invalid = pair({ baseAddress: CONTRACT, quoteAddress: OTHER });
    invalid.url = "https://evil.example/pair";
    await expect(
      service({ requestJson: vi.fn(async () => [invalid]) }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    const wrongPath = pair({ pairAddress: PAIR });
    wrongPath.url = `https://dexscreener.com/robinhood/${V4_PAIR}`;
    await expect(
      service({ requestJson: vi.fn(async () => [wrongPath]) }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    await expect(
      service({ requestJson: vi.fn(async () => [pair(), pair()]) }).crypto(
        CONTRACT,
      ),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
  });

  it("rejects provider numerics that cannot be represented as bounded exact decimals", async () => {
    const tiny = pair();
    tiny.priceUsd = 1e-30;
    await expect(
      service({ requestJson: vi.fn(async () => [tiny]) }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    const huge = pair();
    huge.liquidity.usd = 1e30;
    await expect(
      service({ requestJson: vi.fn(async () => [huge]) }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
  });

  it("normalizes an opted-in exact Woo SKU and keeps stock and product rating semantics honest", async () => {
    const http: ProviderHttp = {
      requestJson: vi.fn(async () => [wooProduct()]),
    };
    const result = await service(http, [merchant]).merchant(
      "sample-store",
      "tcgdex:en:base1-4",
      EXPECTED_MAPPING,
    );

    expect(result).toMatchObject({
      state: "exact_match",
      merchant: { id: "sample-store", provider: "woocommerce" },
      mapping: {
        sku: "CHAR-BASE-4-NM",
        productId: "42",
        reviewedAt: "2026-08-11",
      },
      offer: {
        identityConfidence: "reviewed_simple_product_mapping",
        sku: "CHAR-BASE-4-NM",
        unitPrice: "129.99",
        currency: "USD",
        inventoryState: "provider_low_stock",
        exactQuantity: null,
        variantLabel: "Unlimited holo",
        condition: "Near mint",
        mappingReviewedAt: "2026-08-11",
        mappingEvidenceUrl:
          "https://merchant.example/product/charizard-base-4-nm/",
        productRating: {
          average: "4.8",
          count: 17,
          sourceLabel: "merchant_reported_product_rating",
        },
      },
    });
    expect(result.limitations.join(" ")).toMatch(/not seller reputation/i);
    expect(result.privacy.disclosure).toContain(
      "reviewed SKU, expected product ID, and mapping review date",
    );
    expect(result.privacy.disclosure).toContain(
      "Only the reviewed SKU and expected product ID were sent to Sample Opt-In Store",
    );
    expect(JSON.stringify(result)).not.toMatch(/image\.jpg/i);
    expect(http.requestJson).toHaveBeenCalledWith(
      "https://merchant.example/wp-json/wc/store/v1/products?sku=CHAR-BASE-4-NM&include=42&catalog_visibility=visible",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("separates valid empty inventory from out-of-stock and unresolved-option states", async () => {
    const empty = await service({ requestJson: vi.fn(async () => []) }, [
      merchant,
    ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING);
    expect(empty).toMatchObject({
      state: "valid_empty",
      offer: null,
      fetchedAt: NOW.toISOString(),
      freshForMs: 300_000,
      mapping: EXPECTED_MAPPING,
    });
    const unavailable = wooProduct();
    unavailable.is_in_stock = false;
    unavailable.low_stock_remaining = null;
    expect(
      (
        await service({ requestJson: vi.fn(async () => [unavailable]) }, [
          merchant,
        ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING)
      ).offer,
    ).toMatchObject({ inventoryState: "provider_unavailable" });
    const variable = wooProduct();
    variable.has_options = true;
    await expect(
      service({ requestJson: vi.fn(async () => [variable]) }, [
        merchant,
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    const unrated = wooProduct();
    unrated.average_rating = "0";
    unrated.review_count = 0;
    expect(
      (
        await service({ requestJson: vi.fn(async () => [unrated]) }, [
          merchant,
        ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING)
      ).offer?.productRating,
    ).toBeNull();
    const exactLimit = wooProduct();
    exactLimit.average_rating = "5.0000000000000000001";
    await expect(
      service({ requestJson: vi.fn(async () => [exactLimit]) }, [
        merchant,
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    const zeroRemaining = wooProduct();
    zeroRemaining.low_stock_remaining = 0;
    expect(
      (
        await service({ requestJson: vi.fn(async () => [zeroRemaining]) }, [
          merchant,
        ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING)
      ).offer,
    ).toMatchObject({ inventoryState: "provider_low_stock" });
    const conflicting = wooProduct();
    conflicting.id = 99;
    await expect(
      service({ requestJson: vi.fn(async () => [conflicting]) }, [
        merchant,
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    const wrongSku = wooProduct();
    wrongSku.sku = "DIFFERENT";
    await expect(
      service({ requestJson: vi.fn(async () => [wrongSku]) }, [
        merchant,
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
  });

  it("rejects unapproved merchants, missing mappings, unsafe registry origins, and duplicate exact SKUs before fetch", async () => {
    const requestJson = vi.fn();
    await expect(
      service({ requestJson }, [merchant]).merchant(
        "missing-store",
        "tcgdex:en:base1-4",
        EXPECTED_MAPPING,
      ),
    ).rejects.toMatchObject({ code: "MARKET_MERCHANT_NOT_APPROVED" });
    await expect(
      service({ requestJson }, [merchant]).merchant(
        "sample-store",
        "tcgdex:en:other",
        EXPECTED_MAPPING,
      ),
    ).rejects.toMatchObject({ code: "MARKET_EXACT_MAPPING_UNAVAILABLE" });
    await expect(
      service({ requestJson }, [merchant]).merchant(
        "sample-store",
        "tcgdex:en:base1-4",
        { ...EXPECTED_MAPPING, productId: "99" },
      ),
    ).rejects.toMatchObject({ code: "MARKET_EXACT_MAPPING_CHANGED" });
    await expect(
      service({ requestJson }, [
        { ...merchant, baseUrl: "https://127.0.0.1" },
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_MERCHANT_CONFIGURATION_INVALID" });
    await expect(
      service({ requestJson }, [
        merchant,
        { ...merchant, name: "Duplicate identity" },
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_MERCHANT_CONFIGURATION_INVALID" });
    await expect(
      service({ requestJson }, [
        {
          ...merchant,
          products: [
            ...merchant.products,
            {
              ...merchant.products[0],
              canonicalAssetId: "other",
              sku: "OTHER-SKU",
            },
          ],
        },
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_MERCHANT_CONFIGURATION_INVALID" });
    await expect(
      service({ requestJson }, [
        {
          ...merchant,
          permissionEvidenceUrl: "https://unrelated.example/permission",
        },
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_MERCHANT_CONFIGURATION_INVALID" });
    await expect(
      service({ requestJson }, [
        {
          ...merchant,
          products: [
            ...merchant.products,
            { ...merchant.products[0], canonicalAssetId: "other" },
          ],
        },
      ]).merchant("sample-store", "tcgdex:en:base1-4", EXPECTED_MAPPING),
    ).rejects.toMatchObject({ code: "MARKET_MERCHANT_CONFIGURATION_INVALID" });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("maps rate limits, oversized data, and outages while consuming exactly one budget unit", async () => {
    const consume = vi.fn(async () => undefined);
    const limited = new MarketInventoryService(testEnv(), {
      budget: { consume },
      now: () => NOW,
      http: {
        requestJson: vi.fn(async () => {
          throw new ProviderRequestError("PROVIDER_HTTP_429", true);
        }),
      },
    });
    await expect(limited.crypto(CONTRACT)).rejects.toMatchObject({
      code: "MARKET_PROVIDER_RATE_LIMITED",
    });
    expect(consume).toHaveBeenCalledTimes(1);
    await expect(
      service({
        requestJson: vi.fn(async () => {
          throw new ProviderRequestError("PROVIDER_RESPONSE_TOO_LARGE", false);
        }),
      }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_MALFORMED" });
    await expect(
      service({
        requestJson: vi.fn(async () => {
          throw new ProviderRequestError("PROVIDER_TIMEOUT", true);
        }),
      }).crypto(CONTRACT),
    ).rejects.toMatchObject({ code: "MARKET_PROVIDER_UNAVAILABLE" });
  });

  it("keeps both routes strict, anonymous, no-store, and disabled by default", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    installErrorHandler(app);
    const source = {
      directory: vi.fn(() => ({ merchants: [] })),
      crypto: vi.fn(async () => ({ pairs: [] })),
      merchant: vi.fn(async () => ({ offer: null })),
    };
    await marketRoutes(app, testEnv(), source as never);
    const response = await app.inject({
      method: "POST",
      url: "/v1/private/market/crypto",
      payload: { chainId: 4663, contract: CONTRACT },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(source.crypto).toHaveBeenCalledWith(CONTRACT);
    const directory = await app.inject({
      method: "POST",
      url: "/v1/private/market/merchants",
      payload: {},
    });
    expect(directory.statusCode).toBe(200);
    expect(directory.headers["cache-control"]).toContain("no-store");
    expect(source.directory).toHaveBeenCalledTimes(1);
    const merchantResponse = await app.inject({
      method: "POST",
      url: "/v1/private/market/merchant",
      payload: {
        merchantId: "sample-store",
        canonicalAssetId: "tcgdex:en:base1-4",
        expectedSku: EXPECTED_MAPPING.sku,
        expectedProductId: EXPECTED_MAPPING.productId,
        expectedMappingReviewedAt: EXPECTED_MAPPING.reviewedAt,
      },
    });
    expect(merchantResponse.statusCode).toBe(200);
    expect(merchantResponse.headers["cache-control"]).toContain("no-store");
    expect(source.merchant).toHaveBeenCalledWith(
      "sample-store",
      "tcgdex:en:base1-4",
      EXPECTED_MAPPING,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/market/crypto",
          payload: { chainId: 1, contract: CONTRACT },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/market/crypto",
          payload: { chainId: 4663, contract: CONTRACT, label: "private" },
        })
      ).statusCode,
    ).toBe(400);

    const disabled = Fastify({ logger: false });
    apps.push(disabled);
    installErrorHandler(disabled);
    await marketRoutes(disabled, testEnv(false), source as never);
    expect(
      (
        await disabled.inject({
          method: "POST",
          url: "/v1/private/market/crypto",
          payload: { chainId: 4663, contract: CONTRACT },
        })
      ).statusCode,
    ).toBe(503);
  });

  it("enforces the dedicated hourly rate limit independently on each route", async () => {
    const source = {
      directory: vi.fn(() => ({ merchants: [] })),
      crypto: vi.fn(async () => ({ pairs: [] })),
      merchant: vi.fn(async () => ({ offer: null })),
    };
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        MARKET_INVENTORY_ENABLED: "true",
        RATE_LIMIT_MARKET_PER_HOUR: "2",
      }),
      undefined,
      { marketInventory: source as never },
    );
    apps.push(app);
    for (const status of [200, 200, 429]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/private/market/crypto",
            payload: { chainId: 4663, contract: CONTRACT },
          })
        ).statusCode,
      ).toBe(status);
    }
    for (const status of [200, 200, 429]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/private/market/merchant",
            payload: {
              merchantId: "sample-store",
              canonicalAssetId: "asset:1",
              expectedSku: "SKU-1",
              expectedProductId: "42",
              expectedMappingReviewedAt: "2026-08-11",
            },
          })
        ).statusCode,
      ).toBe(status);
    }
  });

  it("keeps market input canaries out of request logs and aggregate metrics", async () => {
    const marker = "market-canary-never-log";
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation(((
      chunk: unknown,
    ) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      const source = {
        directory: vi.fn(() => ({ merchants: [] })),
        crypto: vi.fn(async () => ({ contract: marker, pairs: [] })),
        merchant: vi.fn(),
      };
      const app = await buildApp(
        loadEnv({
          NODE_ENV: "test",
          LOG_LEVEL: "info",
          ENABLE_METRICS: "true",
          MARKET_INVENTORY_ENABLED: "true",
        }),
        undefined,
        { marketInventory: source as never },
      );
      apps.push(app);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/private/market/crypto",
            payload: { chainId: 4663, contract: CONTRACT },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: "GET", url: "/metrics" })).body,
      ).not.toContain(marker);
      expect(written.join("\n")).not.toContain(marker);
    } finally {
      write.mockRestore();
    }
  });
});

function service(
  http: ProviderHttp,
  merchants: readonly ApprovedMerchant[] = [],
): MarketInventoryService {
  const budget: MarketBudget = { consume: vi.fn(async () => undefined) };
  return new MarketInventoryService(testEnv(), {
    http,
    merchants,
    budget,
    now: () => NOW,
  });
}

function pair(
  overrides: {
    pairAddress?: string;
    baseAddress?: string;
    quoteAddress?: string;
    priceUsd?: string;
    liquidityUsd?: number;
  } = {},
): Record<string, any> {
  return {
    chainId: "robinhood",
    dexId: "uniswap",
    url: `https://dexscreener.com/robinhood/${overrides.pairAddress ?? PAIR}`,
    pairAddress: overrides.pairAddress ?? PAIR,
    labels: ["v4"],
    baseToken: {
      address: overrides.baseAddress ?? CONTRACT,
      name: "Base token",
      symbol: "BASE",
    },
    quoteToken: {
      address: overrides.quoteAddress ?? OTHER,
      name: "Quote token",
      symbol: "QUOTE",
    },
    priceUsd: overrides.priceUsd ?? "1.25",
    priceNative: "0.5",
    liquidity: { usd: overrides.liquidityUsd ?? 1000 },
    volume: { h24: 250 },
    priceChange: { h24: -1.5 },
    pairCreatedAt: NOW.getTime() - 86_400_000,
  };
}

function wooProduct(): Record<string, any> {
  return {
    id: 42,
    name: "Charizard Base Set #4 · Unlimited holo · Near mint",
    sku: "CHAR-BASE-4-NM",
    permalink: "https://merchant.example/product/charizard-base-4-nm/",
    has_options: false,
    is_in_stock: true,
    is_purchasable: true,
    low_stock_remaining: 2,
    average_rating: "4.80",
    review_count: 17,
    images: [{ src: "https://merchant.example/image.jpg" }],
    prices: { currency_code: "USD", currency_minor_unit: 2, price: "12999" },
  };
}
