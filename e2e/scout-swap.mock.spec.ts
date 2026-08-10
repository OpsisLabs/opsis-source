import { expect, test, type Page } from "@playwright/test";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

function quoteFixture(stale = false, warning = false) {
  const now = Date.now();
  const quotedAt = stale ? now - 65_000 : now;
  const expiresAt = stale ? now - 35_000 : now + 30_000;
  return {
    pair: "WETH/USDG",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: { symbol: "WETH", address: WETH, amount: "0.01" },
    output: { symbol: "USDG", address: USDG, amount: "36.45", minimumReceived: "36.26775" },
    route: { routing: "CLASSIC", label: "100% · WETH → USDG · v4 0.05%", protocols: ["V4"] },
    priceImpactPercent: 0.04,
    slippageTolerancePercent: 0.5,
    estimatedGas: { nativeAmount: "0.000012", usdAmount: "0.04", paidBy: "user" },
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
  const calls = await mockQuote(page, { delayMs: 300 });
  await page.goto("/swap");

  await expect(page.getByRole("heading", { name: /See the trade/i })).toBeVisible();
  await expect(page.getByText("NO SIGNING")).toBeVisible();
  await expect(page.getByText("NO WALLET DATA")).toBeVisible();
  await page.getByLabel("Wrapped Ether").fill("0.01");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

  await expect(page.getByTestId("swap-loading")).toBeVisible();
  await expect(page.getByTestId("swap-quote")).toBeVisible();
  await expect(page.getByText("36.45 USDG")).toBeVisible();
  await expect(page.getByText("36.26775 USDG", { exact: true })).toBeVisible();
  await expect(page.getByText("0.04%")).toBeVisible();
  await expect(page.getByText("$0.04")).toBeVisible();
  await expect(page.getByText("Provider route check passed")).toBeVisible();
  await expect(page.getByText("CANNOT SIGN / SEND")).toBeVisible();
  await expect(page.getByText(/network gas, liquidity-provider or protocol fees/i)).toBeVisible();
  const handoff = page.getByRole("link", { name: /CONTINUE IN OFFICIAL UNISWAP/i });
  await expect(handoff).toHaveAttribute("href", /^https:\/\/app\.uniswap\.org\/swap\?chain=robinhood&/);
  await expect(handoff).toHaveAttribute("href", new RegExp(`inputCurrency=${WETH}`, "i"));
  await expect(handoff).toHaveAttribute("href", /value=0\.01/);
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.waitForTimeout(700);
    await page.screenshot({ path: "output/qa/scout-swap-desktop.png", fullPage: true });
  }
  expect(calls()).toBe(1);
});

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
