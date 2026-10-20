import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import {
  canonicalize,
  verifyReceipt,
  REVIEWED_ASSETS,
  type TokenControls,
} from "@rh-chain/shared";
import { getAddress, keccak256, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TokenCardService,
  thousandDollarAmount,
  ADVICE,
  type CardSources,
} from "../src/cards/service.js";
import { JsonCache } from "../src/cache/service.js";
import { EngineCardSources } from "../src/cards/sources.js";
import { renderCardSvg } from "../src/cards/render.js";
import {
  CardProofOfWork,
  cardClientAddress,
} from "../src/open-data/card-guard.js";
import {
  TelegramBuckets,
  telegramSecretMatches,
  TelegramBotApi,
} from "../src/telegram/service.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ReceiptService } from "../src/receipts/service.js";
import { publicMcpRoutes } from "../src/routes/public-mcp.js";
import {
  publicCardRoutes,
  reachResponseHeaders,
} from "../src/routes/public-cards.js";
import { installErrorHandler, AppError } from "../src/http/errors.js";

const address = `0x${"1".repeat(40)}`;
const now = Date.parse("2026-10-19T12:00:00.000Z");
const anchor = {
  blockNumber: 32,
  blockHash: `0x${"a".repeat(64)}`,
  timestamp: new Date(now).toISOString(),
  finality: "current_not_final" as const,
};
const controls: TokenControls = {
  kind: "observed",
  chainId: 4663,
  contract: address,
  hasCode: true,
  anchor,
  observedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 30000).toISOString(),
  source: "fixture-rpc",
  methodVersion: "controls-v1",
  readings: {
    owner: { state: "unknown", reason: "reverted" },
    paused: { state: "observed", value: "false" },
    implementation: { state: "unknown", reason: "malformed" },
    admin: { state: "unknown", reason: "malformed" },
    beacon: { state: "unknown", reason: "malformed" },
  },
  coverage: { state: "partial", rpcCalls: 1, unknown: ["mint_permissions"] },
};
const sources: CardSources = {
  identity: vi.fn(async () => ({
    name: "Sample token",
    symbol: "SAMPLE",
    decimals: 2,
    basis: "self_reported_rpc" as const,
    source: "fixture-rpc",
    observedAt: new Date(now).toISOString(),
    anchor,
  })),
  market: vi.fn(async () => ({
    priceUsd: "2",
    source: "fixture-explorer",
    observedAt: new Date(now).toISOString(),
    concentration: { state: "unknown" as const, reason: "NO_SAMPLE" },
  })),
};
const quote = {
  supported: true,
  reason: "ok",
  input: {
    contract: address,
    symbol: null,
    decimals: 2,
    amount: "500.00",
    rawAmount: "50000",
  },
  output: { symbol: "WETH", address: `0x${"2".repeat(40)}`, decimals: 18 },
  quote: {
    amountOutDisplay: "0.2",
    amountOut: "200000000000000000",
    feePercent: "0.3",
  },
  anchor: {
    ...anchor,
    blockNumber: 33,
    fetchedAt: new Date(now).toISOString(),
  },
  quotedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 30000).toISOString(),
};
const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function service(
  options: {
    controls?: unknown;
    sources?: CardSources;
    exit?: unknown;
    receipts?: ReceiptService;
    cache?: JsonCache;
    cacheSeconds?: number;
    now?: () => number;
  } = {},
) {
  const exit = { quote: vi.fn(async () => quote) };
  const check = vi.fn(async (_address, evidence) => {
    if (evidence) {
      evidence.rpcCalls.push({
        method: "eth_getCode",
        paramsSha256: `0x${"b".repeat(64)}`,
      });
    }
    return controls;
  });
  return {
    exit,
    check,
    cards: new TokenCardService(
      (options.controls ?? { check }) as never,
      (options.exit ?? exit) as never,
      options.sources ?? sources,
      options.cache ?? new JsonCache(),
      options.cacheSeconds ?? 60,
      options.receipts,
      options.now ?? (() => now),
    ),
  };
}
const secret = "s".repeat(32);
const base = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  OPEN_DATA_API_ENABLED: "true",
  PUBLIC_CARDS_ENABLED: "true",
  PUBLIC_CARDS_HMAC_SECRET: secret,
  PUBLIC_MCP_ENABLED: "true",
  TELEGRAM_BOT_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: `123456:${"x".repeat(35)}`,
  TELEGRAM_WEBHOOK_SECRET: secret,
};
const cap = () => ({
  consume: vi.fn(async () => ({ limit: 60, remaining: 59, resetSeconds: 100 })),
});
async function appFixture(overrides: Record<string, string> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden in fixtures");
    }),
  );
  const card = await service().cards.card(address);
  const cards = { card: vi.fn(async () => card) };
  const bot = { sendMessage: vi.fn(async () => {}) };
  const limiter = cap();
  const app = await buildApp(loadEnv({ ...base, ...overrides }), undefined, {
    tokenCards: cards,
    telegramBot: bot,
    openDataLimiter: limiter,
  });
  apps.push(app);
  return { app, cards, bot, limiter, card };
}
function solve(token: string) {
  for (let value = 0; ; value++) {
    const solution = String(value);
    const digest = createHash("sha256").update(`${token}:${solution}`).digest();
    if (digest[0] === 0 && digest[1] === 0 && (digest[2]! & 0xc0) === 0)
      return solution;
  }
}

function solvedHeaders() {
  const proof = new CardProofOfWork(secret).issue();
  return {
    "x-opsis-pow-challenge": proof.token,
    "x-opsis-pow-solution": solve(proof.token),
  };
}

describe("shared token card", () => {
  it("shares checksummed cached cards across services without repeating any source work", async () => {
    const cache = new JsonCache();
    const get = vi.spyOn(cache, "get");
    const first = service({ cache });
    const second = service({ cache });
    const input = `0x${"ab".repeat(20)}`;
    const fresh = await first.cards.card(input);
    const cached = await second.cards.card(getAddress(input));
    expect(fresh.servedFrom).toBe("fresh");
    expect(cached).toEqual({ ...fresh, servedFrom: "cache" });
    expect(get).toHaveBeenCalledWith(`token-card:v1:${getAddress(input)}`);
    expect(first.check).toHaveBeenCalledTimes(1);
    expect(second.check).not.toHaveBeenCalled();
    expect(second.exit.quote).not.toHaveBeenCalled();
  });
  it("coalesces concurrent cache misses and clears failed computations for retry", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const check = vi.fn(async () => {
      await wait;
      return controls;
    });
    const cache = new JsonCache();
    const set = vi.spyOn(cache, "set");
    const market = vi.fn((input: string) => sources.market(input));
    const identity = vi.fn((input: string, block: typeof anchor) =>
      sources.identity(input, block),
    );
    const { cards, exit } = service({
      controls: { check },
      cache,
      sources: { market, identity },
    });
    const requests = [
      cards.card(address),
      cards.card(address),
      cards.card(address),
    ];
    release();
    const results = await Promise.all(requests);
    expect(check).toHaveBeenCalledTimes(1);
    expect(market).toHaveBeenCalledTimes(1);
    expect(identity).toHaveBeenCalledTimes(1);
    expect(exit.quote).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(results.map((card) => card.servedFrom)).toEqual([
      "fresh",
      "cache",
      "cache",
    ]);
    const broken = service({ receipts: {} as ReceiptService });
    await expect(broken.cards.card(address)).rejects.toThrow(
      "Receipt unavailable",
    );
    await expect(broken.cards.card(address)).rejects.toThrow(
      "Receipt unavailable",
    );
    expect(broken.check).toHaveBeenCalledTimes(2);
  });
  it("expires complete cards at the configured TTL", async () => {
    let clock = now;
    const cache = new JsonCache();
    const set = vi.spyOn(cache, "set");
    const { cards, check } = service({
      cache,
      cacheSeconds: 90,
      now: () => clock,
      sources: {
        ...sources,
        market: async () => ({
          ...(await sources.market(address)),
          concentration: {
            state: "available",
            value: {
              top10Percent: 12,
              holdersAnalyzed: 20,
              source: "fixture-explorer",
              observedAt: new Date(now).toISOString(),
            },
          },
        }),
      },
    });
    const fresh = await cards.card(address);
    expect(set.mock.calls[0]?.[2]).toBe(90);
    clock += 89_999;
    expect((await cards.card(address)).servedFrom).toBe("cache");
    clock += 1;
    const refreshed = await cards.card(address);
    expect(refreshed.servedFrom).toBe("fresh");
    expect(refreshed.observedAt).not.toBe(fresh.observedAt);
    expect(check).toHaveBeenCalledTimes(2);
  });
  it.each(["partial", "failed"])(
    "limits %s cards to 15 seconds",
    async (mode) => {
      let clock = now;
      const cache = new JsonCache();
      const set = vi.spyOn(cache, "set");
      const check = vi.fn(async () => {
        if (mode === "failed") throw new Error("source unavailable");
        return controls;
      });
      const { cards } = service({
        cache,
        now: () => clock,
        controls: { check },
      });
      await cards.card(address);
      expect(set.mock.calls[0]?.[2]).toBe(15);
      clock += 14_999;
      expect((await cards.card(address)).servedFrom).toBe("cache");
      clock += 1;
      expect((await cards.card(address)).servedFrom).toBe("fresh");
      expect(check).toHaveBeenCalledTimes(2);
    },
  );
  it("uses exact dollar sizing and the single-size engine, retaining independent anchors", async () => {
    const { cards, exit } = service();
    const card = await cards.card(address);
    expect(exit.quote).toHaveBeenCalledWith({
      token: address,
      amount: "500.00",
      outputToken: "WETH",
      curve: false,
    });
    expect(card.anchor?.blockNumber).toBe(32);
    expect(card.exitQuote).toMatchObject({
      state: "available",
      value: { anchor: { blockNumber: 33 }, notionalUsd: "1000" },
    });
    expect(card.disclaimer).toBe(ADVICE);
    expect(card.concentration).toEqual({
      state: "unknown",
      reason: "NO_SAMPLE",
    });
    expect(thousandDollarAmount("3", 2)).toBe("333.33");
    for (const invalid of [
      "0",
      "-2",
      "NaN",
      "1e3",
      "0.0000000000000000000000000000001",
    ])
      expect(thousandDollarAmount(invalid, 2)).toBeNull();
    for (const amount of ["0", "999999999999999999999999999999"])
      expect(thousandDollarAmount(amount, 37)).toBeNull();
    expect(thousandDollarAmount("2000", 0)).toBeNull();
    expect(thousandDollarAmount("700", 0)).toBeNull();
    await expect(cards.card("invalid")).rejects.toThrow("nonzero");
  });
  it("uses the other output token for reviewed WETH without assuming a USDG peg", async () => {
    const { cards, exit } = service();
    const result = await cards.card(REVIEWED_ASSETS.WETH.address);
    expect(result.identity).toMatchObject({
      state: "available",
      value: { basis: "reviewed" },
    });
    expect(exit.quote.mock.calls[0][0].outputToken).toBe("USDG");
  });
  it("uses the existing explorer sample and leaves malformed holder evidence unknown", async () => {
    const env = loadEnv({ NODE_ENV: "test" });
    const budget = { consume: vi.fn(async () => {}) };
    const doc = (path: string, responseJson: unknown) => ({
      id: "fixture",
      provider: "blockscout",
      chainId: 4663,
      entityType: "token" as const,
      entityValue: address,
      requestUrl: `https://explorer.example/api/v2${path}`,
      fetchedAt: new Date(now).toISOString(),
      responseJson,
    });
    const explorer = {
      getToken: vi.fn(async () => [
        doc(`/tokens/${address}`, { total_supply: "1000", exchange_rate: "2" }),
        doc(`/tokens/${address}/holders`, {
          items: [{ value: "250", address: { hash: `0x${"3".repeat(40)}` } }],
        }),
      ]),
    };
    const source = new EngineCardSources(
      env,
      budget,
      undefined,
      { requestJson: vi.fn() },
      explorer,
    );
    expect(await source.market(address)).toMatchObject({
      priceUsd: "2",
      concentration: {
        state: "available",
        value: {
          top10Percent: 25,
          holdersAnalyzed: 1,
          observedAt: new Date(now).toISOString(),
        },
      },
    });
    expect(budget.consume).toHaveBeenCalledWith(6);
    explorer.getToken.mockResolvedValueOnce([
      doc(`/tokens/${address}`, { total_supply: "1000" }),
      doc(`/tokens/${address}/holders`, {
        items: [{ value: "malformed", address: { hash: address } }],
      }),
    ]);
    expect((await source.market(address)).concentration.state).toBe("unknown");
  });
  it("keeps failed parts unavailable and refuses missing, stale, or mismatched quotes", async () => {
    const exit = { quote: vi.fn(async () => quote) };
    for (const priceUsd of [null, "0", "bogus"]) {
      const { cards } = service({
        exit,
        sources: {
          ...sources,
          market: async () => ({
            ...(await sources.market(address)),
            priceUsd,
          }),
        },
      });
      expect((await cards.card(address)).exitQuote.state).toBe("unknown");
    }
    expect(exit.quote).not.toHaveBeenCalled();
    const stale = service({
      exit,
      sources: {
        ...sources,
        market: async () => ({
          ...(await sources.market(address)),
          observedAt: new Date(now - 60000).toISOString(),
        }),
      },
    });
    expect((await stale.cards.card(address)).exitQuote).toMatchObject({
      state: "unknown",
      reason: "USD_CONVERSION_STALE_OR_INVALID",
    });
    expect(exit.quote).not.toHaveBeenCalled();
    const broken = service({
      controls: {
        check: async () => {
          throw new AppError("PORTFOLIO_DAILY_BUDGET_EXCEEDED", 503, "budget");
        },
      },
      sources: {
        ...sources,
        market: async () => {
          throw new Error("private upstream detail");
        },
      },
    });
    const card = await broken.cards.card(address);
    expect(card.controls).toEqual({
      state: "unavailable",
      reason: "PORTFOLIO_DAILY_BUDGET_EXCEEDED",
    });
    expect(card.identity.state).toBe("unknown");
    expect(card.concentration.state).toBe("unavailable");
    expect(JSON.stringify(card)).not.toContain("private upstream");
    expect(
      (
        await service({
          exit: {
            quote: async () => ({
              ...quote,
              input: { ...quote.input, rawAmount: "100000" },
            }),
          },
        }).cards.card(address)
      ).exitQuote.state,
    ).toBe("unknown");
  });
  it("signs assembled outputs and refuses receipt issuance without chain evidence", async () => {
    const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
    const keys = [
      {
        address: account.address,
        validFrom: new Date(now - 1000).toISOString(),
        validTo: null,
      },
    ];
    const receipts = new ReceiptService(
      {
        address: account.address,
        signDigest: (hash) => account.sign({ hash }),
      },
      keys,
      "a".repeat(40),
      () => now,
    );
    const issue = vi.spyOn(receipts, "issue");
    let clock = now;
    const signedCards = service({ receipts, now: () => clock }).cards;
    const card = await signedCards.card(address);
    clock += 1000;
    const cached = await signedCards.card(address);
    expect(cached.servedFrom).toBe("cache");
    expect(cached.observedAt).toBe(card.observedAt);
    expect(canonicalize(cached.receipt)).toBe(canonicalize(card.receipt));
    expect(issue).toHaveBeenCalledTimes(1);
    const { receipt, servedFrom, ...observation } = card;
    expect(servedFrom).toBe("fresh");
    expect(receipt?.outputs).toEqual(observation);
    expect(
      (
        await verifyReceipt(canonicalize(card.receipt), keys, {
          keccak256,
          recoverAddress,
        })
      ).valid,
    ).toBe(true);
    await expect(
      service({
        receipts,
        controls: { check: async () => controls },
      }).cards.card(address),
    ).rejects.toThrow("evidence unavailable");
  });
  it("reserves metadata budget before dispatch and pins metadata to the controls block", async () => {
    const env = loadEnv({ NODE_ENV: "test" });
    const budget = { consume: vi.fn(async () => {}) };
    const rpc = {
      requestJson: vi.fn(async (_url, input) => {
        const call = JSON.parse(input.body);
        return {
          id: call.id,
          result:
            call.method === "eth_getBlockByNumber"
              ? { hash: anchor.blockHash }
              : call.params[0].data === "0x313ce567"
                ? `0x${"0".repeat(62)}02`
                : `0x${Buffer.from("Sample").toString("hex").padEnd(64, "0")}`,
        };
      }),
    };
    const source = new EngineCardSources(env, budget, undefined, rpc);
    expect(await source.identity(address, anchor)).toMatchObject({
      decimals: 2,
      name: "Sample",
      anchor,
    });
    expect(budget.consume).toHaveBeenCalledWith(4);
    expect(
      rpc.requestJson.mock.calls.every(
        ([, init]) =>
          JSON.parse(init.body).params.at(-1) === "0x20" ||
          JSON.parse(init.body).params[0] === "0x20",
      ),
    ).toBe(true);
    const refusal = {
      consume: vi.fn(async () => {
        throw new Error("budget refused");
      }),
    };
    await expect(
      new EngineCardSources(env, refusal, undefined, rpc).identity(
        address,
        anchor,
      ),
    ).rejects.toThrow("budget refused");
    expect(rpc.requestJson).toHaveBeenCalledTimes(4);
  });
  it("escapes every SVG text node and stays below 16 KB without scripts or links", async () => {
    const card = await service().cards.card(address);
    if (card.identity.state === "available")
      card.identity.value.name = "<script>&\"' Sample";
    const svg = renderCardSvg(card);
    expect(svg).toContain("&lt;script&gt;&amp;&quot;&#39;");
    expect(svg).not.toMatch(/<script|href=|foreignObject/);
    expect(Buffer.byteLength(svg)).toBeLessThan(16384);
    expect(svg).toContain(ADVICE);
  });
});

describe("public reach guards", () => {
  it("validates flags and secrets without echoing values", () => {
    const defaults = loadEnv({ NODE_ENV: "test" });
    expect([
      defaults.PUBLIC_CARDS_ENABLED,
      defaults.PUBLIC_MCP_ENABLED,
      defaults.TELEGRAM_BOT_ENABLED,
    ]).toEqual([false, false, false]);
    expect(defaults.PUBLIC_CARDS_CACHE_SECONDS).toBe(60);
    for (const invalid of ["14", "301", "15.5", "invalid"])
      expect(() =>
        loadEnv({ NODE_ENV: "test", PUBLIC_CARDS_CACHE_SECONDS: invalid }),
      ).toThrow();
    for (const value of ["15", "300"])
      expect(
        loadEnv({ NODE_ENV: "test", PUBLIC_CARDS_CACHE_SECONDS: value })
          .PUBLIC_CARDS_CACHE_SECONDS,
      ).toBe(Number(value));
    for (const change of [
      { PUBLIC_CARDS_HMAC_SECRET: "short" },
      { TELEGRAM_BOT_TOKEN: "invalid" },
      { TELEGRAM_WEBHOOK_SECRET: "bad secret" },
    ])
      expect(() => loadEnv({ ...base, ...change })).toThrow();
    for (const flag of ["PUBLIC_CARDS_ENABLED", "PUBLIC_MCP_ENABLED"])
      expect(() => loadEnv({ NODE_ENV: "test", [flag]: "true" })).toThrow(
        "HMAC secret",
      );
  });
  it("groups equivalent IPv6 /64 addresses while keeping IPv4 identities", () => {
    expect(cardClientAddress("2001:db8:abcd:12::1")).toBe(
      cardClientAddress("2001:0db8:abcd:0012:ffff::2"),
    );
    expect(cardClientAddress("2001:db8:abcd:13::1")).not.toBe(
      cardClientAddress("2001:db8:abcd:12::1"),
    );
    expect(cardClientAddress("192.0.2.1")).toBe("192.0.2.1");
    expect(cardClientAddress("::ffff:192.0.2.1")).toBe("192.0.2.1");
  });
  it("verifies HMAC, work and expiry statelessly", () => {
    let clock = now;
    const pow = new CardProofOfWork(secret, () => clock);
    const challenge = pow.issue();
    const solution = solve(challenge.token);
    expect(pow.verify(challenge.token, solution)).toBe(true);
    expect(pow.verify(challenge.token, solution)).toBe(true);
    expect(
      new CardProofOfWork("t".repeat(32), () => clock).verify(
        challenge.token,
        solution,
      ),
    ).toBe(false);
    expect(pow.verify(`${challenge.token}0`, solution)).toBe(false);
    expect(pow.verify(challenge.token, "-1")).toBe(false);
    clock += 120000;
    expect(pow.verify(challenge.token, solution)).toBe(false);
  });
  it("keeps every surface off before card work and limiter consumption", async () => {
    const { app, cards, limiter } = await appFixture({
      PUBLIC_CARDS_ENABLED: "false",
      PUBLIC_MCP_ENABLED: "false",
      TELEGRAM_BOT_ENABLED: "false",
    });
    for (const [method, url] of [
      ["GET", `/v1/public/open-data/v1/cards/token/${address}`],
      ["POST", "/v1/public/open-data/v1/mcp"],
      ["POST", "/v1/telegram/webhook"],
    ] as const)
      expect(
        (
          await app.inject({
            method,
            url,
            payload: method === "POST" ? {} : undefined,
          })
        ).statusCode,
      ).toBe(404);
    expect(cards.card).not.toHaveBeenCalled();
    expect(limiter.consume).not.toHaveBeenCalled();
  });
  it("requires the parent Open Data switch for public routes but not Telegram", async () => {
    const { app, limiter } = await appFixture({
      OPEN_DATA_API_ENABLED: "false",
    });
    for (const url of [
      "/v1/public/open-data/v1/cards/challenge",
      "/v1/public/open-data/v1/mcp/keys",
    ])
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    expect(limiter.consume).not.toHaveBeenCalled();
  });
  it("serves proof-free SVG misses through the shared cache with the remaining short failure TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { cards, check, exit } = service();
    const limiter = cap();
    const app = Fastify();
    apps.push(app);
    installErrorHandler(app);
    reachResponseHeaders(app);
    await publicCardRoutes(app, loadEnv(base), limiter, cards);
    const url = `/v1/public/open-data/v1/cards/token/${address}.svg`;
    const [first, joined] = await Promise.all([
      app.inject({ method: "GET", url, remoteAddress: "2001:db8:12:34::1" }),
      app.inject({ method: "GET", url, remoteAddress: "2001:db8:12:34::2" }),
    ]);
    expect([first.statusCode, joined.statusCode]).toEqual([200, 200]);
    expect(first.headers["cache-control"]).toBe("public, max-age=15");
    vi.setSystemTime(now + 5000);
    const cached = await app.inject({ method: "GET", url });
    expect(cached.headers["cache-control"]).toBe("public, max-age=10");
    expect(cached.body).toBe(first.body);
    expect(check).toHaveBeenCalledTimes(1);
    expect(exit.quote).toHaveBeenCalledTimes(1);
    expect(limiter.consume).toHaveBeenCalledTimes(3);
    expect(limiter.consume.mock.calls.slice(0, 2)).toEqual([
      ["2001:db8:12:34::/64"],
      ["2001:db8:12:34::/64"],
    ]);
    limiter.consume.mockRejectedValueOnce(
      new AppError("OPEN_DATA_RATE_LIMIT_EXCEEDED", 429, "cap"),
    );
    const capped = await app.inject({ method: "GET", url });
    expect(capped.statusCode).toBe(429);
    expect(capped.headers["cache-control"]).toBe("private, no-store");
    expect(check).toHaveBeenCalledTimes(1);
  });
  it("advertises the configured SVG TTL for complete fresh cards", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { app, cards, card } = await appFixture({
      PUBLIC_CARDS_CACHE_SECONDS: "90",
    });
    card.concentration = {
      state: "available",
      value: {
        top10Percent: 12,
        holdersAnalyzed: 20,
        source: "fixture-explorer",
        observedAt: new Date(now).toISOString(),
      },
    };
    cards.card.mockResolvedValue(card);
    const response = await app.inject({
      method: "GET",
      url: `/v1/public/open-data/v1/cards/token/${address}.svg`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=90");
  });
  it("requires work, counts challenge and rejected requests, and serves JSON and image embeds", async () => {
    const { app, cards, limiter } = await appFixture();
    const prefix = "/v1/public/open-data/v1/cards";
    const refused = await app.inject({
      method: "GET",
      url: `${prefix}/token/${address}`,
    });
    expect(refused.statusCode).toBe(428);
    expect(cards.card).not.toHaveBeenCalled();
    const challenge = (
      await app.inject({ method: "GET", url: `${prefix}/challenge` })
    ).json();
    const solution = solve(challenge.token);
    const headers = {
      "x-opsis-pow-challenge": challenge.token,
      "x-opsis-pow-solution": solution,
    };
    const json = await app.inject({
      method: "GET",
      url: `${prefix}/token/${address}`,
      headers,
    });
    expect(json.statusCode).toBe(200);
    expect(json.json().disclaimer).toBe(ADVICE);
    const svg = await app.inject({
      method: "GET",
      url: `${prefix}/token/${address}.svg`,
    });
    expect(svg.statusCode).toBe(200);
    expect(svg.headers["content-type"]).toBe("image/svg+xml; charset=utf-8");
    expect(svg.headers["cache-control"]).toMatch(/^public, max-age=\d+$/);
    expect(json.headers["cache-control"]).toBe("private, no-store");
    expect(svg.headers["content-security-policy"]).toBe(
      "default-src 'none'; sandbox",
    );
    expect(limiter.consume).toHaveBeenCalledTimes(4);
    const credentialed = await app.inject({
      method: "GET",
      url: `${prefix}/challenge`,
      headers: { cookie: "session=sample" },
    });
    expect(credentialed.statusCode).toBe(400);
    expect(credentialed.json().disclaimer).toBe(ADVICE);
    limiter.consume.mockRejectedValueOnce(
      new AppError("OPEN_DATA_RATE_LIMIT_EXCEEDED", 429, "cap", {
        retryAfterSeconds: 100,
      }),
    );
    const capped = await app.inject({
      method: "GET",
      url: `${prefix}/challenge`,
    });
    expect(capped.statusCode).toBe(429);
    expect(capped.headers["retry-after"]).toBe("100");
    expect(capped.json().disclaimer).toBe(ADVICE);
  });
});

describe("read-only stateless MCP", () => {
  it("requires proof for token_card even on cache hits, while other tools need no proof", async () => {
    const { app, cards } = await appFixture();
    const call = (name: string, args: unknown, headers = {}) =>
      app.inject({
        method: "POST",
        url: "/v1/public/open-data/v1/mcp",
        headers,
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
      });
    const refused = await call("token_card", { address });
    expect(refused.statusCode).toBe(428);
    expect(cards.card).not.toHaveBeenCalled();
    const challenge = refused.json().challenge;
    const headers = {
      "x-opsis-pow-challenge": challenge.token,
      "x-opsis-pow-solution": solve(challenge.token),
    };
    expect(
      (await call("token_card", { address }, headers)).json().result.isError,
    ).toBe(false);
    expect((await call("token_card", { address })).statusCode).toBe(428);
    for (const [name, args] of [
      ["verify_receipt", { receipt: "{}" }],
      ["open_data_assets", {}],
    ] as const) {
      const output = JSON.parse(
        (await call(name, args)).json().result.content[0].text,
      );
      expect(output.receipt).toBeUndefined();
    }
    expect(cards.card).toHaveBeenCalledTimes(1);
  });
  it("initializes, accepts notification, lists tools, and executes only validated tools", async () => {
    const { app, cards } = await appFixture();
    const url = "/v1/public/open-data/v1/mcp";
    const proofHeaders = solvedHeaders();
    const send = (method: string, params?: unknown) =>
      app.inject({
        method: "POST",
        url,
        headers: proofHeaders,
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method,
          ...(params ? { params } : {}),
        },
      });
    const initialized = await send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sample-client", version: "1" },
    });
    expect(initialized.json().result.protocolVersion).toBe("2025-06-18");
    expect(initialized.headers["mcp-session-id"]).toBeUndefined();
    const notice = await app.inject({
      method: "POST",
      url,
      payload: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(notice.statusCode).toBe(202);
    expect(notice.body).toBe("");
    expect(
      (await send("tools/list")).json().result.tools.map((tool) => tool.name),
    ).toEqual(["token_card", "verify_receipt", "open_data_assets"]);
    for (const [name, args] of [
      ["token_card", { address }],
      ["verify_receipt", { receipt: "{}" }],
      ["open_data_assets", {}],
    ] as const) {
      const response = (
        await send("tools/call", { name, arguments: args })
      ).json();
      expect(response.result.isError).toBe(false);
      expect(JSON.parse(response.result.content[0].text).disclaimer).toBe(
        ADVICE,
      );
    }
    expect(
      (
        await send("tools/call", {
          name: "token_card",
          arguments: { address, calldata: "0x" },
        })
      ).json().error.code,
    ).toBe(-32602);
    expect((await send("eth_sendTransaction")).json().error.code).toBe(-32601);
    expect(cards.card).toHaveBeenCalledTimes(1);
    const crossOrigin = await app.inject({
      method: "POST",
      url,
      headers: { origin: "https://unrelated.example" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(crossOrigin.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { origin: "http://localhost:5173" },
          payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "POST", url, payload: [] })).json().error
        .code,
    ).toBe(-32600);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { "content-type": "application/json" },
          payload: "{",
        })
      ).json().error.code,
    ).toBe(-32700);
    const get = await app.inject({ method: "GET", url });
    expect(get.statusCode).toBe(405);
    expect(get.headers.allow).toBe("POST");
    const supplied = await service().cards.card(address);
    const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
    const receiptService = new ReceiptService(
      {
        address: account.address,
        signDigest: (hash) => account.sign({ hash }),
      },
      [
        {
          address: account.address,
          validFrom: new Date(now - 1000).toISOString(),
          validTo: null,
        },
      ],
      "a".repeat(40),
      () => now,
    );
    const signed = await service({ receipts: receiptService }).cards.card(
      address,
    );
    const input = canonicalize({
      ...signed.receipt,
      outputs: { calldata: "0x12345678" },
    });
    const verified = await send("tools/call", {
      name: "verify_receipt",
      arguments: { receipt: input },
    });
    expect(verified.body).not.toContain("calldata");
    expect(verified.body).not.toContain("0x12345678");
    expect(supplied.disclaimer).toBe(ADVICE);
  });
  it("only returns the card observation receipt and never reads cards for non-card tools", async () => {
    const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
    const keys = [
      {
        address: account.address,
        validFrom: new Date(now - 1000).toISOString(),
        validTo: null,
      },
    ];
    const receipts = new ReceiptService(
      {
        address: account.address,
        signDigest: (hash) => account.sign({ hash }),
      },
      keys,
      "a".repeat(40),
      () => now,
    );
    const app = Fastify();
    apps.push(app);
    installErrorHandler(app);
    reachResponseHeaders(app);
    const cards = service({ receipts });
    const cardRead = vi.spyOn(cards.cards, "card");
    const issue = vi.spyOn(receipts, "issue");
    await publicMcpRoutes(
      app,
      { ...loadEnv(base), RECEIPTS_ENABLED: true },
      cap(),
      cards.cards,
      receipts,
    );
    for (const [name, args] of [
      ["token_card", { address }],
      ["verify_receipt", { receipt: "{}" }],
      ["open_data_assets", {}],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/public/open-data/v1/mcp",
        headers: solvedHeaders(),
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
      });
      const output = JSON.parse(response.json().result.content[0].text);
      if (name === "token_card") {
        expect(output.receipt).toEqual(
          (await cards.cards.card(address)).receipt,
        );
        expect(
          (
            await verifyReceipt(canonicalize(output.receipt), keys, {
              keccak256,
              recoverAddress,
            })
          ).valid,
        ).toBe(true);
      } else {
        expect(output.receipt).toBeUndefined();
      }
    }
    expect(cardRead).toHaveBeenCalledTimes(2);
    expect(cards.check).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledTimes(1);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/public/open-data/v1/mcp/keys",
        })
      ).json().keys,
    ).toEqual(keys);
  });
});

describe("prompted Telegram cards", () => {
  it("constructs the production client and POSTs JSON with a bounded timeout and no redirects", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const app = await buildApp(loadEnv(base), undefined, {
      tokenCards: service().cards,
      openDataLimiter: cap(),
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: {
        message: {
          text: `/opsis ${address}`,
          chat: { id: 300, type: "private" },
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const url = new URL(target);
    expect(url.origin).toBe("https://api.telegram.org");
    // The production client sends the card as a PNG photo with an HTML caption.
    expect(url.pathname).toMatch(/^\/bot\d+:[A-Za-z0-9_-]+\/sendPhoto$/);
    expect(url.search).toBe("");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(15_000);
    const form = init.body as FormData;
    expect(form.get("chat_id")).toBe("300");
    expect(form.get("parse_mode")).toBe("HTML");
    expect(String(form.get("caption"))).toContain(ADVICE);
    expect(String(form.get("caption")).match(/href=/g)).toHaveLength(1);
    const photo = form.get("photo") as Blob;
    expect(photo.type).toBe("image/png");
    expect([...new Uint8Array(await photo.slice(0, 4).arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(response.body).not.toContain(base.TELEGRAM_BOT_TOKEN);
  });
  it.each(["http", "network", "timeout", "redirect"])(
    "sanitizes %s transport failures and never logs the token",
    async (mode) => {
      const logs = [
        vi.spyOn(console, "log"),
        vi.spyOn(console, "warn"),
        vi.spyOn(console, "error"),
      ];
      for (const log of logs) log.mockImplementation(() => {});
      const fetchMock = vi.fn(async (url: string) => {
        if (mode === "http")
          return new Response(base.TELEGRAM_BOT_TOKEN, { status: 503 });
        if (mode === "timeout") throw new DOMException(url, "TimeoutError");
        throw new Error(`${mode}: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);
      const message = {
        chat_id: 1,
        text: "Sample",
        parse_mode: "HTML" as const,
        link_preview_options: { is_disabled: true as const },
      };
      let caught: unknown;
      try {
        await new TelegramBotApi(base.TELEGRAM_BOT_TOKEN).sendMessage(message);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(String(caught)).toBe("Error: TELEGRAM_SEND_UNAVAILABLE");
      expect((caught as Error).stack).not.toContain(base.TELEGRAM_BOT_TOKEN);
      expect((caught as Error).cause).toBeUndefined();
      const app = await buildApp(loadEnv(base), undefined, {
        tokenCards: service().cards,
        openDataLimiter: cap(),
      });
      apps.push(app);
      logs.push(
        vi.spyOn(app.log, "error"),
        vi.spyOn(app.log, "warn"),
        vi.spyOn(app.log, "info"),
      );
      const response = await app.inject({
        method: "POST",
        url: "/v1/telegram/webhook",
        headers: { "x-telegram-bot-api-secret-token": secret },
        payload: {
          message: {
            text: `/opsis ${address}`,
            chat: { id: 400, type: "private" },
          },
        },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("TELEGRAM_REPLY_UNAVAILABLE");
      expect(response.body).not.toContain(base.TELEGRAM_BOT_TOKEN);
      for (const log of logs)
        expect(JSON.stringify(log.mock.calls)).not.toContain(
          base.TELEGRAM_BOT_TOKEN,
        );
    },
  );
  it("authenticates before parsing and ignores non-command updates", async () => {
    const { app, bot, cards } = await appFixture();
    const url = "/v1/telegram/webhook";
    expect(telegramSecretMatches(secret, secret)).toBe(true);
    expect(telegramSecretMatches(secret, "x")).toBe(false);
    expect(
      (await app.inject({ method: "POST", url, payload: {} })).statusCode,
    ).toBe(404);
    const headers = { "x-telegram-bot-api-secret-token": secret };
    for (const text of [
      "hello",
      "/opsis",
      `/opsis ${address} extra`,
      `/other ${address}`,
      `/opsis@bad ${address}`,
      "/desk@bad AAPL",
      "/desk AAPL extra",
      "/launches@bad",
      "/launches extra",
      "/help@bad",
      "/help extra",
      "/desk AAPL",
      "/launches",
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { message: { text, chat: { id: 100, type: "private" } } },
          })
        ).statusCode,
      ).toBe(200);
    for (const payload of [
      { edited_message: { text: `/opsis ${address}` } },
      { channel_post: {} },
      { callback_query: {} },
    ])
      expect(
        (await app.inject({ method: "POST", url, headers, payload }))
          .statusCode,
      ).toBe(200);
    expect(cards.card).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const payload = {
      message: {
        text: `/opsis@opsis_sample_bot ${address}`,
        chat: { id: 100, type: "group" },
      },
    };
    expect(
      (await app.inject({ method: "POST", url, headers, payload })).statusCode,
    ).toBe(200);
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage.mock.calls[0][0]).toMatchObject({
      parse_mode: "HTML",
      chat_id: 100,
    });
    const text = bot.sendMessage.mock.calls[0][0].text;
    expect(text).toContain(ADVICE);
    expect(text.match(/href=/g)).toHaveLength(1);
    expect(text).toContain("/research?entity=");
    await app.inject({ method: "POST", url, headers, payload });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("enforces per-chat, per-group and global token buckets with bounded ephemeral keys", () => {
    let clock = 0;
    const buckets = new TelegramBuckets(secret, () => clock);
    expect(buckets.take(1, false)).toBe(true);
    expect(buckets.take(1, false)).toBe(false);
    clock = 1000;
    expect(buckets.take(1, false)).toBe(true);
    expect(buckets.take(2, true)).toBe(true);
    clock += 1000;
    expect(buckets.take(2, true)).toBe(false);
    clock += 2000;
    expect(buckets.take(2, true)).toBe(true);
    const global = new TelegramBuckets(secret, () => 0);
    expect(
      Array.from({ length: 31 }, (_, id) => global.take(id, false)).filter(
        Boolean,
      ),
    ).toHaveLength(30);
    expect(JSON.stringify(buckets)).not.toContain('"chat_id"');
  });
  it("fully escapes HTML and sanitizes transport errors", async () => {
    const { app, cards, bot, card } = await appFixture();
    if (card.identity.state === "available")
      card.identity.value.name = '<a href="https://unrelated.example">&';
    cards.card.mockResolvedValue(card);
    await app.inject({
      method: "POST",
      url: "/v1/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: {
        message: {
          text: `/opsis ${address}`,
          chat: { id: 200, type: "private" },
        },
      },
    });
    expect(bot.sendMessage.mock.calls[0][0].text).toContain(
      "&lt;a href=&quot;https://unrelated.example&quot;&gt;&amp;",
    );
    const client = new TelegramBotApi("fixture-token", async () => {
      throw new Error("fixture-token");
    });
    await expect(
      client.sendMessage({
        chat_id: 1,
        text: "Sample",
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    ).rejects.toThrow(/^TELEGRAM_SEND_UNAVAILABLE$/);
  });
});
