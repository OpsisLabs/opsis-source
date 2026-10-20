import { createHash } from "node:crypto";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REVIEWED_ROBINHOOD_ASSET_SAMPLE,
  STOCK_DESK_LINE,
  type DeskFact,
  type StockDeskResult,
} from "@rh-chain/shared";
import { JsonCache } from "../src/cache/service.js";
import { StockCardService } from "../src/cards/stock.js";
import { renderStockCardSvg } from "../src/cards/render.js";
import { loadEnv } from "../src/config/env.js";
import { AppError, installErrorHandler } from "../src/http/errors.js";
import {
  publicCardRoutes,
  reachResponseHeaders,
} from "../src/routes/public-cards.js";

const now = Date.parse("2026-10-20T15:00:00.000Z");
const unknown = { state: "unknown" as const, reason: "FIXTURE_UNAVAILABLE" };
const available = <T>(value: T, block = 32): DeskFact<T> => ({
  state: "available",
  value,
  evidence: [
    {
      block,
      blockHash: `0x${"a".repeat(64)}`,
      time: new Date(now).toISOString(),
      source: "fixture-rpc",
    },
  ],
});
function deskFixture(): StockDeskResult {
  const quote = {
    notionalUsd: "1000",
    inputAmount: "4",
    outputAmount: "1001.1234",
    outputUnit: "USDG" as const,
    priceUsdG: "250.28085",
    impactBps: "10",
    expiresAt: new Date(now + 30_000).toISOString(),
  };
  return {
    schemaVersion: 1,
    address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9",
    symbol: "AAPL",
    observedAt: new Date(now).toISOString(),
    canonical: "official_list_match",
    reference: available({ priceUsd: "250", multiplierEmbedded: true }),
    pool: available({ ...quote, notionalUsd: "100" }, 33),
    gapBps: available("11.234"),
    feed: available({
      updatedAt: new Date(now).toISOString(),
      ageSeconds: 0,
      heartbeatSeconds: 60,
      stale: false,
      paused: false,
      expectedOffHours: false,
      offHoursBasis: "fixture",
    }),
    depth: [{ notionalUsd: "1000", quote: available(quote, 34) }],
    multiplier: unknown,
    corporateActions: unknown,
    concentration: unknown,
    history: { state: "unavailable", reason: "FIXTURE_UNAVAILABLE" },
    limitations: ["USDG units are not dollars"],
    disclaimer: STOCK_DESK_LINE,
  };
}
const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const base = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  PUBLIC_CARDS_ENABLED: "true",
  OPEN_DATA_API_ENABLED: "true",
  STOCK_DESK_ENABLED: "true",
  RWA_VERIFY_ENABLED: "true",
  EXIT_CHECK_ENABLED: "true",
  PUBLIC_CARDS_HMAC_SECRET: "s".repeat(32),
};
async function fixture(overrides: Record<string, string> = {}) {
  const source = { desk: vi.fn(async () => deskFixture()) };
  const env = loadEnv({ ...base, ...overrides });
  const cards = new StockCardService(
    source,
    new JsonCache(),
    env.PUBLIC_CARDS_CACHE_SECONDS,
  );
  const limiter = {
    consume: vi.fn(async () => ({
      limit: 60,
      remaining: 59,
      resetSeconds: 100,
    })),
  };
  const app = Fastify();
  apps.push(app);
  installErrorHandler(app);
  reachResponseHeaders(app);
  await publicCardRoutes(app, env, limiter, { card: vi.fn() }, cards);
  return { app, cards, source, limiter };
}
const prefix = "/v1/public/open-data/v1/cards";
const svgUrl = `${prefix}/stock/AAPL.svg`;
function solve(token: string): string {
  for (let nonce = 0; ; nonce++) {
    const digest = createHash("sha256").update(`${token}:${nonce}`).digest();
    if (digest[0] === 0 && digest[1] === 0 && (digest[2]! & 0xc0) === 0)
      return String(nonce);
  }
}

describe("Stock Token card rendering", () => {
  it("uses the token-card style, exact desk gap, units, evidence and bilingual copy", async () => {
    const { cards } = await fixture();
    const card = await cards.card("AAPL");
    const svg = renderStockCardSvg(card);
    for (const text of [
      "#064af2",
      "STOCK TOKEN",
      "AAPL",
      "Apple",
      "Chainlink reference (USD)",
      "Pool price (USDG)",
      "+11.234",
      "1001.12 USDG",
      "reference 32 · pool 33",
      "current, not final",
      "2026-10-20 15:00:00",
      "USDG units are not dollars",
      "A Stock Token tracks a stock; it is not a share · Not investment advice",
    ])
      expect(svg).toContain(text);
    expect(Buffer.byteLength(svg)).toBeLessThan(16 * 1024);
    const zh = renderStockCardSvg(card, "zh-CN");
    expect(zh).toContain("股票代币");
    expect(zh).toContain("非投资建议");
    expect(zh).toContain("Chainlink 参考价");
    card.desk.gapBps = available("-12.5");
    expect(renderStockCardSvg(card)).toContain("-12.5");
    expect(renderStockCardSvg(card)).not.toContain("+-12.5");
  });
  it("escapes text and unknown reasons, and rejects oversized SVGs", async () => {
    const { cards } = await fixture();
    const card = await cards.card("AAPL");
    card.name = `<script>"&'</script>`;
    card.desk.reference = { state: "unknown", reason: "<image onload='x'>&" };
    card.desk.pool = unknown;
    card.desk.gapBps = unknown;
    card.desk.feed = unknown;
    card.desk.depth = [];
    const svg = renderStockCardSvg(card);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<image");
    expect(svg).toContain("&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
    expect(svg).toContain("unknown (&lt;image onload=&#39;x&#39;&gt;&amp;)");
    expect(svg).toContain(">unknown</text>");
    expect(renderStockCardSvg(card, "zh-CN")).toContain(">未知</text>");
    card.name = "&".repeat(4000);
    expect(() => renderStockCardSvg(card)).toThrow("SVG size exceeded");
  });
  it("does not let off-hours hide a stale or paused feed", async () => {
    const { cards } = await fixture();
    const card = await cards.card("AAPL");
    card.desk.feed = available({
      updatedAt: new Date(now).toISOString(),
      ageSeconds: 120,
      heartbeatSeconds: 60,
      stale: true,
      paused: true,
      expectedOffHours: true,
      offHoursBasis: "fixture",
    });
    expect(renderStockCardSvg(card)).toContain(
      "stale · paused · expected off-hours",
    );
  });
});

describe("public Stock Token cards", () => {
  it.each([
    "PUBLIC_CARDS_ENABLED",
    "OPEN_DATA_API_ENABLED",
    "STOCK_DESK_ENABLED",
    "RWA_VERIFY_ENABLED",
    "EXIT_CHECK_ENABLED",
  ])(
    "fails closed before limits or desk reads when %s is off",
    async (flag) => {
      const { app, source, limiter } = await fixture({ [flag]: "false" });
      for (const url of [svgUrl, `${prefix}/stock/AAPL`]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(404);
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
      expect(source.desk).not.toHaveBeenCalled();
      expect(limiter.consume).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown and non-stock tickers with a reason before desk work", async () => {
    const { app, source } = await fixture();
    for (const ticker of ["UNKNOWN", "USDG", "WETH", "AAPLx"]) {
      for (const extension of ["", ".svg"]) {
        const response = await app.inject({
          url: `${prefix}/stock/${ticker}${extension}`,
        });
        expect(response.statusCode).toBe(404);
        expect(response.json().error).toMatchObject({
          code: "STOCK_CARD_NOT_FOUND",
          details: { reason: "UNREVIEWED_STOCK_TICKER" },
        });
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    }
    expect(source.desk).not.toHaveBeenCalled();
  });
  it("shares proof-free SVG work per ticker, counts every caller, and decreases cache max-age", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { app, source, limiter } = await fixture({
      PUBLIC_CARDS_CACHE_SECONDS: "90",
    });
    const [first, joined] = await Promise.all([
      app.inject({ url: svgUrl }),
      app.inject({ url: `${prefix}/stock/aapl.svg` }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(joined.body).toBe(first.body);
    expect(source.desk).toHaveBeenCalledTimes(1);
    expect(source.desk).toHaveBeenCalledWith(
      REVIEWED_ROBINHOOD_ASSET_SAMPLE.find((asset) => asset.symbol === "AAPL")!
        .address,
    );
    expect(first.headers).toMatchObject({
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=90",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
      "x-opsis-disclaimer": "Not investment advice",
    });
    vi.setSystemTime(now + 5000);
    const cached = await app.inject({ url: svgUrl });
    expect(cached.body).toBe(first.body);
    expect(cached.headers["cache-control"]).toBe("public, max-age=85");
    const zh = await app.inject({ url: `${svgUrl}?lang=zh-CN` });
    expect(zh.body).toContain("非投资建议");
    expect(source.desk).toHaveBeenCalledTimes(1);
    expect(limiter.consume).toHaveBeenCalledTimes(4);
    vi.setSystemTime(now + 90_000);
    await app.inject({ url: svgUrl });
    expect(source.desk).toHaveBeenCalledTimes(2);
  });
  it("requires valid token-card proof headers even for cached JSON", async () => {
    const { app, source } = await fixture();
    const url = `${prefix}/stock/AAPL`;
    const refused = await app.inject({ url });
    expect(refused.statusCode).toBe(428);
    expect(source.desk).not.toHaveBeenCalled();
    await app.inject({ url: svgUrl });
    const challenge = (await app.inject({ url: `${prefix}/challenge` })).json();
    const headers = {
      "x-opsis-pow-challenge": challenge.token,
      "x-opsis-pow-solution": solve(challenge.token),
    };
    const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      chainId: 4663,
      ticker: "AAPL",
      name: "Apple",
      servedFrom: "cache",
      desk: deskFixture(),
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(source.desk).toHaveBeenCalledTimes(1);
    expect((await app.inject({ url })).statusCode).toBe(428);
    expect(
      (
        await app.inject({
          url,
          headers: { ...headers, "x-opsis-pow-solution": "invalid" },
        })
      ).statusCode,
    ).toBe(428);
  });
  it("keeps credential, limiter and budget refusals private and does not cache errors", async () => {
    const { app, source, limiter } = await fixture();
    expect(
      (await app.inject({ url: svgUrl, headers: { cookie: "session=sample" } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          url: svgUrl,
          headers: { authorization: "Bearer sample" },
        })
      ).statusCode,
    ).toBe(400);
    expect(source.desk).not.toHaveBeenCalled();
    limiter.consume.mockRejectedValueOnce(
      new AppError("OPEN_DATA_RATE_LIMIT_EXCEEDED", 429, "cap", {
        retryAfterSeconds: 30,
      }),
    );
    const limited = await app.inject({ url: svgUrl });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("30");
    expect(source.desk).not.toHaveBeenCalled();
    source.desk.mockRejectedValueOnce(
      new AppError("RWA_DAILY_BUDGET_EXCEEDED", 503, "budget"),
    );
    const failed = await app.inject({ url: svgUrl });
    expect(failed.statusCode).toBe(503);
    expect(failed.headers["cache-control"]).toBe("private, no-store");
    expect((await app.inject({ url: svgUrl })).statusCode).toBe(200);
    expect(source.desk).toHaveBeenCalledTimes(2);
  });
});
