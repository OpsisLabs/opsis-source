import { expect, test, type Page } from "@playwright/test";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

test("trade simulator compares quantities, keeps balances private and invalidates edits", async ({ page }) => {
  test.skip(process.env.VITE_TRADE_SIMULATOR_ENABLED !== "true", "preview flag required");
  await page.route("**/v1/private/trade-simulator/quote", async route => {
    expect(route.request().postDataJSON()).toEqual({ direction: "WETH_TO_USDG", amount: "0.01" });
    await route.fulfill({ json: quoteFixture() });
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill("trade preview test passphrase");
  await page.getByLabel("CONFIRM PASSPHRASE").fill("trade preview test passphrase");
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.goto("/simulate");
  await page.getByLabel("History Vault passphrase").fill("trade preview test passphrase");
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(page.getByRole("button", { name: "Lock history" })).toBeVisible();
  await page.getByLabel("Your WETH balance", { exact: true }).fill("1");
  await page.getByLabel("Your USDG balance", { exact: true }).fill("100");
  await page.getByLabel("WETH reference price in USDG").fill("3645");
  await page.getByRole("button", { name: "Request quote & compare" }).click();
  await expect(page.getByRole("cell", { name: "136.45", exact: true })).toBeVisible();
  if (process.env.CHAINSCOUT_PREVIEW_SHOT) await page.screenshot({ path: process.env.CHAINSCOUT_PREVIEW_SHOT, fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `preview must reflow at ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Save encrypted scenario report" }).click();
  await expect(page.getByText("Saved encrypted on this device.", { exact: true })).toBeVisible();
  await page.getByLabel("Trade amount").fill("0.02");
  await expect(page.getByRole("heading", { name: "Before and after" })).toHaveCount(0);
  await page.reload();
  await page.getByLabel("History Vault passphrase").fill("trade preview test passphrase");
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(page.getByRole("button", { name: /^Trade scenario: 0.01 WETH/ })).toBeVisible();
  await page.getByRole("button", { name: /^Trade scenario: 0.01 WETH/ }).click();
  await expect(page.getByText(/Historical what-if report, not a live quote/)).toBeVisible();
});

function quoteFixture(stale = false, warning = false) {
  const now = Date.now();
  const quotedAt = stale ? now - 65_000 : now;
  const expiresAt = stale ? now - 35_000 : now + 30_000;
  return {
    pair: "WETH/USDG",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: { symbol: "WETH", address: WETH, amount: "0.01" },
    output: {
      symbol: "USDG",
      address: USDG,
      amount: "36.45",
      minimumReceived: "36.26775",
      minimumSource: "provider"
    },
    route: { routing: "CLASSIC", label: "[v3] 100.00% = [0.01%] 0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca", protocols: ["V4"] },
    priceImpactPercent: 0.04,
    slippageTolerancePercent: 0.5,
    estimatedGas: { nativeAmount: "0.000012", usdAmount: "0.004958764702551881", paidBy: "user" },
    simulation: warning
      ? { status: "warning", reasons: ["SIMULATION_UNAVAILABLE"] }
      : { status: "passed", reasons: [] },
    approvalMayBeRequired: true,
    transactionPreview: {
      explanationOnly: true,
      unsigned: true,
      chainId: 4663,
      sender: null,
      target: "0x8876789976decbfcbbbe364623c63652db8c0904",
      action: "Execute an exact-input swap for 0.01 WETH → at least 36.26775 USDG",
      canSign: false,
      canBroadcast: false,
    },
    quotedAt: new Date(quotedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    freshForMs: stale ? 0 : 30_000,
    provider: { name: "Uniswap", requestId: "mock-quote", cached: false },
    handoffUrl: `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=${WETH}&outputCurrency=${USDG}&field=input&value=0.01&theme=dark`,
    disclosures: [
      "Uniswap fetches a new quote before execution; this preview is not a guaranteed price.",
      "You may pay network gas, liquidity-provider or protocol fees, price impact, slippage, and token-specific fees.",
      "Your wallet address is not sent for this preview; Uniswap receives the pair, amount, and a fixed non-user preview address.",
      "ChainScout cannot sign, approve, submit, or broadcast this transaction.",
    ],
  };
}

async function mockQuote(page: Page, options: { stale?: boolean; warning?: boolean; fail?: boolean; delayMs?: number } = {}) {
  let calls = 0;
  await page.route("**/v1/swaps/quote", async (route) => {
    calls += 1;
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.fail) {
      await route.fulfill({
        status: 503,
        json: { error: { code: "SWAP_RATE_LIMITED", message: "Live quotes are cooling down" } },
      });
      return;
    }
    await route.fulfill({ json: quoteFixture(options.stale, options.warning) });
  });
  return () => calls;
}

test("Scout Swap explains a fresh quote and hands off only to official Uniswap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const calls = await mockQuote(page, { delayMs: 300 });
  await page.goto("/swap");

  await expect(page).toHaveTitle("Scout Swap Preview | ChainScout");
  await expect(page.getByRole("heading", { name: /See the trade/i })).toBeVisible();
  await expect(page.getByText("Scout Swap · read-only preview", { exact: true })).toBeVisible();
  await expect(page.getByText(/official Uniswap app requotes and handles every approval, signature and transaction/)).toBeVisible();
  await expect(page.getByText("NO WALLET DATA")).toBeVisible();
  await page.getByLabel("Wrapped Ether").fill("0.01");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

  await expect(page.getByTestId("swap-loading")).toBeVisible();
  await expect(page.getByTestId("swap-quote")).toBeVisible();
  await expect(page.getByText("36.45 USDG")).toBeVisible();
  await expect(page.getByText("36.26775 USDG", { exact: true })).toBeVisible();
  await expect(page.getByText("Uniswap minimum · 0.5% tolerance")).toBeVisible();
  await expect(page.getByText("0.04%")).toBeVisible();
  await expect(page.getByText("$0.004959", { exact: true })).toBeVisible();
  await expect(page.getByText("$0.004958764702551881", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Provider route check passed")).toBeVisible();
  await expect(page.getByText("CANNOT SIGN / SEND")).toBeVisible();
  await expect(page.getByText(/network gas, liquidity-provider or protocol fees/i)).toBeVisible();
  const handoff = page.getByRole("link", { name: /CONTINUE IN OFFICIAL UNISWAP/i });
  await expect(handoff).toHaveAttribute("href", /^https:\/\/app\.uniswap\.org\/swap\?chain=robinhood&/);
  await expect(handoff).toHaveAttribute("href", new RegExp(`inputCurrency=${WETH}`, "i"));
  await expect(handoff).toHaveAttribute("href", /value=0\.01/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.waitForTimeout(700);
    await page.screenshot({ path: "output/qa/scout-swap-desktop.png", fullPage: true });
  }
  expect(calls()).toBe(1);
});

for (const width of [1024, 1100, 1279, 1280]) {
  test(`Scout Swap form and results remain separate while scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockQuote(page);
    await page.goto("/swap");
    const form = page.locator("main form");
    const result = page.locator("main form + div");

    const expectSeparatePanels = async () => {
      await page.evaluate(() => window.scrollTo({ top: 750, behavior: "instant" }));
      await expect.poll(async () => {
        const formBox = await form.boundingBox();
        const resultBox = await result.boundingBox();
        if (!formBox || !resultBox) return false;
        return width < 1280
          ? formBox.y + formBox.height <= resultBox.y
          : formBox.x + formBox.width <= resultBox.x;
      }, { message: "The form must not overlap the result panel after scrolling" }).toBe(true);
      await expect(form).toHaveCSS("position", width < 1280 ? "static" : "sticky");
    };

    // Cover the empty panel as well as the taller, populated quote.
    await expectSeparatePanels();
    await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
    await expect(page.getByTestId("swap-quote")).toBeVisible();
    await expectSeparatePanels();
  });
}

test("expired data is never presented as a current quote", async ({ page }) => {
  await mockQuote(page, { stale: true });
  await page.goto("/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

  await expect(page.getByText("PREVIEW EXPIRED — NOT A CURRENT QUOTE")).toBeVisible();
  await expect(page.getByRole("link", { name: /OPEN UNISWAP FOR A NEW QUOTE/i })).toBeVisible();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toHaveCount(0);
});

test("provider failure degrades to a clear official-app path on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockQuote(page, { fail: true });
  await page.goto("/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

  await expect(page.getByTestId("swap-error")).toContainText("cooling down for a minute");
  const fallback = page.getByRole("link", { name: /OPEN OFFICIAL UNISWAP FOR A NEW QUOTE/i });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("href", /^https:\/\/app\.uniswap\.org\/swap\?chain=robinhood&/);
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.screenshot({ path: "output/qa/scout-swap-mobile-fallback.png", fullPage: true });
  }
});

test("freshness is anchored to receipt time, not the user's wall clock", async ({ page }) => {
  await page.addInitScript(() => {
    Date.now = () => Date.parse("2099-12-31T23:59:59.000Z");
  });
  await mockQuote(page);
  await page.goto("/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toBeVisible();
  await expect(page.getByText("PREVIEW EXPIRED — NOT A CURRENT QUOTE")).toHaveCount(0);
});

test("a limited generic preview is never described as a passed wallet simulation", async ({ page }) => {
  await mockQuote(page, { warning: true });
  await page.goto("/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
  await expect(page.getByText("Preview simulation limited — Uniswap rechecks")).toBeVisible();
  await expect(page.getByText("Provider route check passed")).toHaveCount(0);
});
