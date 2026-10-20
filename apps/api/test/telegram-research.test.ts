import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  REVIEWED_ROBINHOOD_ASSET_SAMPLE,
  STOCK_DESK_LINE,
  type StockDeskResult,
} from "@rh-chain/shared";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import {
  TelegramBuckets,
  telegramRoutes,
  type BotApiClient,
} from "../src/telegram/service.js";
import { deskTelegramHtml } from "../src/telegram/research.js";

const asset = REVIEWED_ROBINHOOD_ASSET_SAMPLE.find(
  (row) => row.symbol === "AAPL",
)!;
const secret = "s".repeat(32);
const now = Date.parse("2026-10-20T12:00:00.000Z");
const time = new Date(now).toISOString();
const base = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  APP_ORIGIN: "https://app.example",
  OPSIS_WORKSPACES_ENABLED: "true",
  OPSIS_PUBLIC_ACCESS_ENABLED: "true",
  TELEGRAM_BOT_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: `123456:${"x".repeat(35)}`,
  TELEGRAM_WEBHOOK_SECRET: secret,
  STOCK_DESK_ENABLED: "true",
  RWA_VERIFY_ENABLED: "true",
  EXIT_CHECK_ENABLED: "true",
  LAUNCH_CARDS_ENABLED: "true",
};
const unknown = { state: "unknown", reason: "SOURCE_UNAVAILABLE" } as const;
function deskResult(): StockDeskResult {
  return {
    schemaVersion: 1,
    address: asset.address.toLowerCase(),
    symbol: asset.symbol,
    canonical: "official_list_match",
    observedAt: time,
    reference: {
      state: "available",
      value: { priceUsd: "250.123456789", multiplierEmbedded: true },
      evidence: [
        { block: 100, blockHash: null, time, source: "chainlink:sample-feed" },
      ],
    },
    feed: {
      state: "available",
      value: {
        updatedAt: time,
        ageSeconds: 0,
        heartbeatSeconds: 3600,
        stale: false,
        paused: false,
        expectedOffHours: false,
        offHoursBasis: "fixture",
      },
      evidence: [],
    },
    multiplier: {
      state: "available",
      value: { current: "2", scheduled: null, effectiveAt: null },
      evidence: [],
    },
    corporateActions: unknown,
    gapBps: { state: "available", value: "-12.345678", evidence: [] },
    pool: unknown,
    depth: [
      {
        notionalUsd: "1000",
        quote: {
          state: "available",
          value: {
            notionalUsd: "1000",
            inputAmount: "4",
            outputAmount: "987.654321",
            outputUnit: "USDG",
            priceUsdG: "246.91358025",
            impactBps: "10",
            expiresAt: new Date(now + 30_000).toISOString(),
          },
          evidence: [
            {
              block: 101,
              blockHash: null,
              time,
              source: "exit-check:sample-pool",
            },
            {
              block: 100,
              blockHash: null,
              time,
              source: "chainlink:sample-feed",
            },
          ],
        },
      },
    ],
    concentration: unknown,
    history: { state: "unavailable", reason: "HISTORY_UNAVAILABLE" },
    limitations: [],
    disclaimer: STOCK_DESK_LINE,
  };
}
function entry(block: number, logIndex = 0) {
  return {
    token: `0x${block.toString(16).padStart(40, "0")}`,
    launchpad: `Sample pad ${block}`,
    created: {
      blockNumber: block,
      logIndex,
      timestamp: new Date(now - (120 - block) * 1000).toISOString() as
        string | null,
    },
    partial: false,
  };
}
function launchFeed() {
  return {
    chainId: 4663,
    minutes: 10,
    anchor: { blockNumber: 200, timestamp: time },
    observedAt: time,
    coverage: { state: "available" },
    entries: [entry(10), entry(60), entry(30), entry(50), entry(20), entry(40)],
  };
}
const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture(overrides: Record<string, string> = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden in fixtures");
    }),
  );
  const result = deskResult();
  const feed = launchFeed();
  const stockDesk = { desk: vi.fn(async () => result), index: vi.fn() };
  const launchCards = { feed: vi.fn(async () => feed), card: vi.fn() };
  const bot = {
    sendMessage: vi.fn(
      async (_input: Parameters<BotApiClient["sendMessage"]>[0]) => {},
    ),
    sendPhoto: vi.fn(),
  };
  const cards = { card: vi.fn() };
  const app = await buildApp(loadEnv({ ...base, ...overrides }), undefined, {
    stockDesk,
    launchCards,
    tokenCards: cards,
    telegramBot: bot,
  });
  apps.push(app);
  let nextChat = 100;
  const send = (
    text: string,
    chat = nextChat++,
    type = "private",
    headers = { "x-telegram-bot-api-secret-token": secret },
  ) =>
    app.inject({
      method: "POST",
      url: "/v1/telegram/webhook",
      headers,
      payload: { message: { text, chat: { id: chat, type } } },
    });
  const lastText = () => bot.sendMessage.mock.calls.at(-1)![0].text;
  return {
    app,
    bot,
    cards,
    stockDesk,
    launchCards,
    result,
    feed,
    send,
    lastText,
  };
}

describe("Telegram research commands", () => {
  it.each(["AAPL", "aapl", asset.address, asset.address.toLowerCase()])(
    "resolves reviewed input %s without recalculating the desk",
    async (query) => {
      const { send, lastText, bot, cards, stockDesk } = await fixture();
      expect((await send(`/desk@sample_bot ${query}`)).statusCode).toBe(200);
      expect(stockDesk.desk).toHaveBeenCalledExactlyOnceWith(asset.address);
      const text = lastText();
      for (const value of [
        asset.address.toLowerCase(),
        "250.123456789 USD",
        "multiplier embedded in feed",
        "-12.345678",
        "fresh",
        "987.654321 USDG",
        "Reference block / 参考价区块: 100",
        "Depth block / 深度区块: 101",
        time,
        "A Stock Token tracks a stock; it is not a share. Not investment advice.",
        "不构成投资建议",
        "USDG units are not dollars",
        "network costs additional",
        'href="https://app.example/rwa"',
      ])
        expect(text).toContain(value);
      expect(text).not.toContain("500.246913578");
      expect(text.length).toBeLessThanOrEqual(4096);
      expect(bot.sendMessage.mock.calls[0][0]).toMatchObject({
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      expect(bot.sendPhoto).not.toHaveBeenCalled();
      expect(cards.card).not.toHaveBeenCalled();
    },
  );
  it("retains the service-adjusted reference when the multiplier is not embedded", async () => {
    const { send, lastText, result } = await fixture();
    if (result.reference.state === "available")
      result.reference.value.multiplierEmbedded = false;
    await send("/desk AAPL");
    expect(lastText()).toContain(
      "250.123456789 USD (multiplier applied by desk",
    );
    expect(lastText()).toContain("研究台已应用乘数");
  });
  it.each([
    {
      stale: true,
      paused: false,
      expectedOffHours: false,
      label: "stale / 陈旧",
    },
    {
      stale: false,
      paused: false,
      expectedOffHours: true,
      label: "off-hours expected",
    },
    {
      stale: true,
      paused: true,
      expectedOffHours: true,
      label: "paused / 已暂停",
    },
  ])("reports feed state $label", async ({ label, ...state }) => {
    const { send, lastText, result } = await fixture();
    if (result.feed.state === "available")
      Object.assign(result.feed.value, state);
    await send("/desk AAPL");
    expect(lastText()).toContain(label);
    if (state.expectedOffHours)
      expect(lastText()).toContain("holidays unknown");
  });
  it("keeps unavailable facts and block evidence unknown with their reasons", async () => {
    const { send, lastText, result } = await fixture();
    result.reference = {
      state: "unknown",
      reason: "CHAINLINK_REFERENCE_UNAVAILABLE",
    };
    result.feed = { state: "unknown", reason: "CHAINLINK_FEED_UNAVAILABLE" };
    result.gapBps = {
      state: "unknown",
      reason: "COMPARABLE_PRICES_UNAVAILABLE",
    };
    result.depth[0]!.quote = {
      state: "unknown",
      reason: "POOL_QUOTE_UNAVAILABLE_OR_INCOMPLETE",
    };
    await send("/desk AAPL");
    for (const reason of [
      "CHAINLINK_REFERENCE_UNAVAILABLE",
      "CHAINLINK_FEED_UNAVAILABLE",
      "COMPARABLE_PRICES_UNAVAILABLE",
      "POOL_QUOTE_UNAVAILABLE_OR_INCOMPLETE",
      "Unknown: block evidence unavailable",
      "未知",
    ])
      expect(lastText()).toContain(reason);
    expect(lastText()).not.toContain("987.654321");
  });
  it("does not present expired or missing depth as expected output", async () => {
    const { send, lastText, result } = await fixture();
    if (result.depth[0]!.quote.state === "available")
      result.depth[0]!.quote.value.expiresAt = time;
    await send("/desk AAPL");
    expect(lastText()).toContain("Unknown: quote expired");
    expect(lastText()).not.toContain("987.654321 USDG");
    result.depth = [];
    await send("/desk AAPL");
    expect(lastText()).toContain("Unknown: no quote at this size");
  });
  it.each(["UNKNOWN", "USDG", "WETH", `0x${"1".repeat(40)}`, "<bad>"])(
    "refuses unreviewed Stock Token %s without service work",
    async (query) => {
      const { send, lastText, stockDesk } = await fixture();
      await send(`/desk ${query}`);
      expect(lastText()).toContain("Unknown reviewed Stock Token");
      expect(lastText()).toContain("未知的已审阅股票代币");
      expect(stockDesk.desk).not.toHaveBeenCalled();
    },
  );
  it("explains desk syntax when the argument is missing", async () => {
    const { send, lastText, stockDesk } = await fixture();
    await send("/desk@sample_bot");
    expect(lastText()).toContain("/desk &lt;ticker or token address&gt;");
    expect(stockDesk.desk).not.toHaveBeenCalled();
  });
  it("shows only the five newest launches as escaped HTML text with research links and ages", async () => {
    const { send, lastText, feed, launchCards, stockDesk, bot } =
      await fixture();
    feed.entries[1]!.launchpad = '<a href="https://unrelated.example">&';
    await send("/launches@sample_bot");
    const text = lastText();
    expect(launchCards.feed).toHaveBeenCalledExactlyOnceWith();
    expect(launchCards.card).not.toHaveBeenCalled();
    expect(stockDesk.desk).not.toHaveBeenCalled();
    expect(bot.sendPhoto).not.toHaveBeenCalled();
    const links = [...text.matchAll(/href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(links).toEqual(
      [60, 50, 40, 30, 20].map(
        (block) => `https://app.example/research?entity=${entry(block).token}`,
      ),
    );
    expect(text).toContain(
      "&lt;a href=&quot;https://unrelated.example&quot;&gt;&amp;",
    );
    expect(text).toContain("0x0000…003c");
    expect(text).toContain("1m ago / 1 分钟前");
    expect(text).toContain("No ranking. Not investment advice.");
    expect(text).toContain("无排名。不构成投资建议。");
    expect(text).toContain(time);
    expect(text.length).toBeLessThanOrEqual(4096);
  });
  it("uses log order for same-block launches and marks missing timestamps and partial coverage", async () => {
    const { send, lastText, feed } = await fixture();
    const latest = { ...entry(60, 2), token: `0x${"a".repeat(40)}` };
    latest.created.timestamp = null;
    latest.partial = true;
    feed.entries.push(latest);
    feed.coverage.state = "partial";
    await send("/launches");
    expect(lastText().indexOf(latest.token)).toBeLessThan(
      lastText().indexOf(entry(60).token),
    );
    expect(lastText()).toContain(
      "Age unknown: launch timestamp unavailable or invalid",
    );
    expect(lastText()).toContain(
      "Partial coverage; newer launches may be missing",
    );
  });
  it("distinguishes an empty feed window from partial coverage", async () => {
    const { send, lastText, feed } = await fixture();
    feed.entries = [];
    await send("/launches");
    expect(lastText()).toContain("No launches found in this feed window");
    expect(lastText()).not.toContain("Partial coverage");
    feed.coverage.state = "partial";
    await send("/launches");
    expect(lastText()).toContain("Partial coverage");
    expect(lastText()).toContain("No ranking. Not investment advice.");
  });
  it.each(["/desk AAPL", "/launches"])(
    "returns an honest reply for unavailable service: %s",
    async (command) => {
      const { send, lastText, stockDesk, launchCards } = await fixture();
      stockDesk.desk.mockRejectedValue(new Error("private upstream detail"));
      launchCards.feed.mockRejectedValue(new Error("private upstream detail"));
      expect((await send(command)).statusCode).toBe(200);
      expect(lastText()).toContain("unavailable. Try again later.");
      expect(lastText()).toContain("暂不可用");
      expect(lastText()).not.toContain("private upstream detail");
      if (command.startsWith("/desk"))
        expect(stockDesk.desk).toHaveBeenCalledOnce();
      else expect(launchCards.feed).toHaveBeenCalledOnce();
    },
  );
  it("returns a short unavailable reply when escaped content exceeds Telegram's limit", async () => {
    const { send, lastText, feed } = await fixture();
    for (const row of feed.entries) row.launchpad = "&".repeat(160);
    await send("/launches");
    expect(lastText()).toContain("Launch Radar unavailable");
    expect(lastText().length).toBeLessThanOrEqual(4096);
  });
  it("refuses malformed feed data instead of claiming an empty feed", async () => {
    const { send, lastText, feed } = await fixture();
    feed.entries[0]!.token = '" onclick="sample';
    await send("/launches");
    expect(lastText()).toContain("Launch Radar unavailable");
    expect(lastText()).not.toContain("No launches found");
  });
  it("escapes desk metadata, prices and source reasons", () => {
    const result = deskResult();
    result.symbol = "<b>&";
    result.gapBps = { state: "unknown", reason: '<script>&"' };
    if (result.reference.state === "available")
      result.reference.value.priceUsd = "<b>250</b>";
    const text = deskTelegramHtml(result, base.APP_ORIGIN, now);
    expect(text).toContain("&lt;b&gt;&amp;");
    expect(text).toContain("&lt;b&gt;250&lt;/b&gt;");
    expect(text).toContain("&lt;script&gt;&amp;&quot;");
    expect(text).not.toContain("<script>");
  });
  it("lists available commands in both languages without running a lookup", async () => {
    const { send, lastText, cards, stockDesk, launchCards } = await fixture();
    await send("/help@sample_bot");
    for (const command of [
      "/opsis",
      "/desk",
      "/launches",
      "/help",
      "/privacy",
      "可用命令",
    ])
      expect(lastText()).toContain(command);
    expect(lastText()).not.toContain("/alert");
    expect(cards.card).not.toHaveBeenCalled();
    expect(stockDesk.desk).not.toHaveBeenCalled();
    expect(launchCards.feed).not.toHaveBeenCalled();
  });
  it.each([
    ["STOCK_DESK_ENABLED", "/desk AAPL", "/desk"],
    ["RWA_VERIFY_ENABLED", "/desk AAPL", "/desk"],
    ["EXIT_CHECK_ENABLED", "/desk AAPL", "/desk"],
    ["LAUNCH_CARDS_ENABLED", "/launches", "/launches"],
    ["PRIVATE_MODE_ENABLED", "/launches", "/launches"],
    ["OPSIS_WORKSPACES_ENABLED", "/launches", "/launches"],
  ])("fails closed when %s is off", async (flag, command, helpEntry) => {
    const { send, lastText, bot, stockDesk, launchCards } = await fixture({
      [flag!]: "false",
    });
    await send(command!);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    await send("/help");
    expect(lastText()).not.toContain(helpEntry!);
    expect(stockDesk.desk).not.toHaveBeenCalled();
    expect(launchCards.feed).not.toHaveBeenCalled();
  });
  it("keeps the webhook absent when the bot is disabled", async () => {
    const { send, bot, stockDesk, launchCards } = await fixture({
      TELEGRAM_BOT_ENABLED: "false",
    });
    for (const text of ["/desk AAPL", "/launches", "/help"])
      expect((await send(text)).statusCode).toBe(404);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(stockDesk.desk).not.toHaveBeenCalled();
    expect(launchCards.feed).not.toHaveBeenCalled();
  });
  it("authenticates new commands and ignores malformed command syntax", async () => {
    const { send, bot, stockDesk, launchCards } = await fixture();
    expect(
      (
        await send("/desk AAPL", 1, "private", {
          "x-telegram-bot-api-secret-token": "wrong",
        })
      ).statusCode,
    ).toBe(404);
    for (const text of [
      "/desk@bad AAPL",
      "/desk AAPL extra",
      "/launches extra",
      "/launches@bad",
      "/help extra",
      "/help@bad",
      "/desks AAPL",
      "text /launches",
    ])
      expect((await send(text)).statusCode).toBe(200);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(stockDesk.desk).not.toHaveBeenCalled();
    expect(launchCards.feed).not.toHaveBeenCalled();
  });
  it("shares admission buckets across commands before service work", async () => {
    const { send, bot, cards, stockDesk, launchCards } = await fixture();
    await send("/desk AAPL", 1);
    await send("/launches", 1);
    await send("/help", 1);
    expect(stockDesk.desk).toHaveBeenCalledTimes(1);
    expect(launchCards.feed).not.toHaveBeenCalled();
    vi.setSystemTime(now + 1000);
    await send("/launches", 1);
    await send(`/opsis ${asset.address}`, 1);
    expect(launchCards.feed).toHaveBeenCalledTimes(1);
    expect(cards.card).not.toHaveBeenCalled();
    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
    await send("/help", 2, "group");
    vi.setSystemTime(now + 2000);
    await send("/launches", 2, "group");
    expect(launchCards.feed).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 4000);
    await send("/launches", 2, "group");
    expect(launchCards.feed).toHaveBeenCalledTimes(2);
  });
  it("uses shared dispatch buckets again after a slow lookup", async () => {
    const env = loadEnv(base);
    let clock = now;
    const dispatch = new TelegramBuckets(secret, () => clock);
    let resolve!: (result: StockDeskResult) => void;
    let started!: () => void;
    const ready = new Promise<void>((done) => {
      started = done;
    });
    const pending = new Promise<StockDeskResult>((done) => {
      resolve = done;
    });
    const stockDesk = {
      desk: vi.fn(() => {
        started();
        return pending;
      }),
    };
    const bot = { sendMessage: vi.fn(async () => {}) };
    const app = Fastify();
    apps.push(app);
    await telegramRoutes(
      app,
      env,
      { card: vi.fn() },
      bot,
      undefined,
      dispatch,
      { stockDesk },
    );
    const request = app
      .inject({
        method: "POST",
        url: "/v1/telegram/webhook",
        headers: { "x-telegram-bot-api-secret-token": secret },
        payload: {
          message: { text: "/desk AAPL", chat: { id: 1, type: "private" } },
        },
      })
      .then((response) => response);
    await ready;
    clock += 1000;
    expect(dispatch.take(1, false)).toBe(true);
    resolve(deskResult());
    expect((await request).statusCode).toBe(200);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
  it("uses the same injected services for Telegram and existing HTTP routes", async () => {
    const { app, send, stockDesk, launchCards } = await fixture();
    await send("/desk AAPL");
    await send("/launches");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/private/stock-desk/token",
          payload: { address: asset.address },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/v1/private/opsis/launches" }))
        .statusCode,
    ).toBe(200);
    expect(stockDesk.desk).toHaveBeenCalledTimes(2);
    expect(launchCards.feed).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
