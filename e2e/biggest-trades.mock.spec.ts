import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.VITE_OBSERVED_TRADES_ENABLED === "true";
const followEnabled = process.env.VITE_SCOUT_WATCH_ENABLED === "true";
const EOA = `0x${"aa".repeat(20)}`;
const CONTRACT = `0x${"bb".repeat(20)}`;
const POOL = `0x${"5a".repeat(20)}`;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const TX_A = `0x${"01".repeat(32)}`;
const TX_B = `0x${"02".repeat(32)}`;

function observedTradesFixture() {
  return {
    schemaVersion: 1,
    state: "observed",
    chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
    pair: {
      base: { address: WETH, symbol: "WETH", decimals: 18, reviewed: true },
      quote: { address: USDG, symbol: "USDG", decimals: 6, reviewed: true },
      pool: POOL,
      fee: 100,
      factory: `0x${"1f".repeat(20)}`,
      factoryVerified: true,
    },
    window: {
      fromBlock: 60_401_000,
      toBlock: 60_402_000,
      fromTime: "2026-09-11T11:45:00.000Z",
      toTime: "2026-09-11T11:50:00.000Z",
      requestedBlocks: 1000,
      blockCount: 1000,
      capped: false,
      narrowed: false,
      notes: [],
    },
    coverage: {
      poolsRequested: 4,
      poolVerified: true,
      logsScanned: 12,
      matchedLogs: 2,
      topRows: 2,
      logCap: 1000,
      blockCap: 1000,
      logCapReached: false,
      rpcUnits: 14,
    },
    classification: {
      method: "uniswap_v3_swap_signed_amounts",
      transfersUsed: false,
    },
    observations: [
      {
        id: `${TX_B}:7`,
        side: "sell",
        pool: POOL,
        fee: 100,
        txHash: TX_B,
        blockNumber: 60_401_900,
        blockHash: `0x${"22".repeat(32)}`,
        blockTime: "2026-09-11T11:49:00.000Z",
        logIndex: 7,
        baseToken: { address: WETH, symbol: "WETH", decimals: 18, reviewed: true },
        quoteToken: { address: USDG, symbol: "USDG", decimals: 6, reviewed: true },
        baseAmount: "2",
        quoteAmount: "5100",
        notionalQuote: "5100",
        eventSender: EOA,
        eventRecipient: CONTRACT,
        transactionSender: EOA,
        transactionSenderType: "eoa",
        followable: true,
      },
      {
        id: `${TX_A}:1`,
        side: "buy",
        pool: POOL,
        fee: 100,
        txHash: TX_A,
        blockNumber: 60_401_500,
        blockHash: `0x${"11".repeat(32)}`,
        blockTime: "2026-09-11T11:47:00.000Z",
        logIndex: 1,
        baseToken: { address: WETH, symbol: "WETH", decimals: 18, reviewed: true },
        quoteToken: { address: USDG, symbol: "USDG", decimals: 6, reviewed: true },
        baseAmount: "1.234567890123456789",
        quoteAmount: "3141.592653",
        notionalQuote: "3141.592653",
        eventSender: EOA,
        eventRecipient: EOA,
        transactionSender: CONTRACT,
        transactionSenderType: "contract",
        followable: false,
      },
    ],
    limitations: [
      "Observed from one factory-verified Uniswap V3 pool; this is not a chain-wide or all-venue ranking.",
      "Each row is one signed V3 Swap event for this pool, classified from amount0/amount1 only, never from token transfers.",
    ],
    fetchedAt: "2026-09-11T11:50:01.000Z",
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["Robinhood Public RPC"],
      disclosure: "Your clicked request sent the public token contract only.",
    },
  };
}

async function mockObservedTrades(page: Page, status = 200, body?: unknown) {
  await page.route("**/v1/private/market/observed-trades", async (route) => {
    if (status !== 200) {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          body ?? {
            error: {
              code: "OBSERVED_TRADES_RANGE_TOO_WIDE",
              message: "The requested block range matched more logs than the public RPC returns",
            },
          },
        ),
      });
      return;
    }
    await route.fulfill({ status: 200, json: body ?? observedTradesFixture() });
  });
}

test("biggest observed trades closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/biggest-trades");
  await expect(page).toHaveURL(/\/guide$/);
});

test("biggest observed trades fetches only after the explicit consent click", async ({
  page,
}) => {
  test.skip(!enabled);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/private/market/observed-trades")) {
      calls.push(request.url());
    }
  });
  await mockObservedTrades(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/biggest-trades");
  await expect(
    page.getByRole("heading", { name: /largest swaps ChainScout actually observed/i }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);

  const consent = page.getByRole("region", { name: /Public-address disclosure/i });
  await expect(consent).toContainText("Robinhood Public RPC");
  await consent.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();

  await expect(page.getByText("5100").first()).toBeVisible();
  expect(calls).toHaveLength(1);
  const follow = page.getByRole("link", { name: /FOLLOW THIS WALLET/i });
  if (followEnabled) {
    await expect(follow).toHaveAttribute("href", `/watch?address=${EOA}`);
  } else {
    await expect(follow).toHaveCount(0);
  }
  const explorer = page.getByRole("link", { name: /View transaction/i }).first();
  await expect(explorer).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/tx/${TX_B}`,
  );
});

test("biggest observed trades stays usable on mobile in English and Chinese", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockObservedTrades(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole("button", { name: "Switch language to 简体中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /ChainScout 实际观察到的最大交易/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("biggest observed trades surfaces a bounded error with a retry", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockObservedTrades(page, 503);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: /TRY AGAIN/i })).toBeVisible();
});

test("biggest observed trades hides the shared follow action when Scout Watch is disabled", async ({
  page,
}) => {
  test.skip(!enabled || followEnabled);
  await mockObservedTrades(page);
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /FOLLOW THIS WALLET/i }),
  ).toHaveCount(0);
});

test("biggest observed trades clears stale results on input change and unmount", async ({
  page,
}) => {
  test.skip(!enabled);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/private/market/observed-trades")) {
      calls.push(request.url());
    }
  });
  await mockObservedTrades(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  expect(calls).toHaveLength(1);

  await page.getByLabel(/Token contract/i).fill(`0x${"12".repeat(20)}`);
  await expect(page.getByText("5100")).toHaveCount(0);
  expect(calls).toHaveLength(1);

  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  expect(calls).toHaveLength(2);

  await page.getByRole("link", { name: "Guide" }).first().click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { name: /largest swaps ChainScout actually observed/i }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: /Biggest Observed Trades/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/biggest-trades$/);
  await expect(page.getByText("5100")).toHaveCount(0);
});
