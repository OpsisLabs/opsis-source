import { expect, test, type Page } from "@playwright/test";
import { APP_ORIGIN } from "./support/origin";

const TOKEN = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const POOL = `0x${"a".repeat(40)}`;
const enabled = process.env.VITE_EXIT_CHECK_ENABLED === "true";

function fixture() {
  const now = Date.now();
  return {
    schemaVersion: 1,
    supported: true,
    reason: "ok",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: { contract: TOKEN, symbol: null, decimals: 6, amount: "1.5", rawAmount: "1500000" },
    output: { symbol: "WETH", address: WETH, decimals: 18 },
    quote: {
      pool: { fee: 3000, pool: POOL },
      amountOut: "500000000000",
      amountOutDisplay: "0.0000005",
      spotAmountOut: "500000000000",
      spotAmountOutDisplay: "0.0000005",
      priceImpactBps: "0",
      priceImpactPercent: "0",
      feeTier: 3000,
      feePercent: "0.3",
      feeAmount: "4500",
      feeAmountDisplay: "0.0045",
      activeLiquidity: "12345678901234567890",
      fullExecutionProven: false,
    },
    coverage: {
      feeTiersTested: [100, 500, 3000, 10000],
      poolsFound: [{ fee: 3000, pool: POOL }],
      poolsQuoted: [{ fee: 3000, pool: POOL, amountOut: "500000000000", amountOutDisplay: "0.0000005" }],
      poolsFailed: [],
      poolsMissing: [100, 500, 10000],
      poolsDiscoveryFailed: [],
    },
    anchor: { tag: "latest", blockNumber: 60401526, blockHash: `0x${"b".repeat(64)}`, timestamp: new Date(now).toISOString(), fetchedAt: new Date(now).toISOString() },
    quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    freshForMs: 30_000,
    quoteIsNotSellabilityProof: true,
    limitations: [
      "This is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold.",
      "Only standard Uniswap V3 fee-tier pools created by the official factory are tested. Uniswap v4 and other venues are not included.",
      "Active V3 liquidity (L) is a raw pool parameter, not the dollar amount you can sell without moving the price.",
    ],
    provider: { name: "robinhood-public-rpc", cached: false },
  };
}

async function fillForm(page: Page) {
  await page.getByLabel("Token contract address").fill(TOKEN);
  await page.getByLabel("Amount to estimate").fill("1.5");
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "opsis_product_tour_seen_v1", value: "1", url: APP_ORIGIN, sameSite: "Strict" }]);
});

test("exit check quotes factory pools with exact coverage and no sellability claim", async ({ page }) => {
  test.skip(!enabled, "enabled-build check");
  let calls = 0;
  await page.route("**/v1/private/exit-check/quote", async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ token: TOKEN, amount: "1.5", outputToken: "WETH" });
    await route.fulfill({ json: fixture() });
  });
  await page.goto("/exit-check");
  await expect(page).toHaveTitle("Trade Check Estimate | Opsis");
  await expect(page.getByText("Opsis only reads public pool state from the dRPC Robinhood Chain gateway. dRPC is a paid gateway that may route each read to an independent node operator in its network.")).toBeVisible();
  await fillForm(page);
  await page.getByRole("button", { name: "CHECK EXIT ESTIMATE" }).click();
  const quote = page.getByTestId("exit-check-quote");
  await expect(quote).toBeVisible();
  await expect(quote.getByText("0.0000005 WETH", { exact: true }).first()).toBeVisible();
  await expect(quote.getByText("ACTIVE V3 LIQUIDITY (L)", { exact: true })).toBeVisible();
  await expect(quote.getByText("Raw pool parameter, not the cash amount you can sell")).toBeVisible();
  await expect(quote.getByText(/not a guaranteed fill/)).toBeVisible();
  await expect(quote.getByText(/Uniswap v4 and other venues are not included/)).toBeVisible();
  await expect(page.getByTestId("exit-check-unsupported")).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  expect(calls).toBe(1);
});

test("exit check explains unsupported v4-only tokens and provider failures", async ({ page }) => {
  test.skip(!enabled, "enabled-build check");
  let mode: "v4" | "fail" = "v4";
  await page.route("**/v1/private/exit-check/quote", async (route) => {
    if (mode === "fail") {
      await route.fulfill({ status: 503, json: { error: { code: "EXIT_CHECK_RATE_LIMITED", message: "cooling down" } } });
      return;
    }
    const data = fixture();
    data.supported = false;
    data.reason = "no_v3_pool";
    // @ts-expect-error test fixture intentionally mirrors the unsupported shape
    data.output = null;
    // @ts-expect-error test fixture intentionally mirrors the unsupported shape
    data.quote = null;
    data.coverage.poolsFound = [];
    data.coverage.poolsQuoted = [];
    data.coverage.poolsMissing = [100, 500, 3000, 10000];
    await route.fulfill({ json: data });
  });
  await page.goto("/exit-check");
  await fillForm(page);
  await page.getByRole("button", { name: "CHECK EXIT ESTIMATE" }).click();
  const unsupported = page.getByTestId("exit-check-unsupported");
  await expect(unsupported).toBeVisible();
  await expect(unsupported.getByText(/Uniswap v4 or another venue/)).toBeVisible();
  mode = "fail";
  await page.getByRole("button", { name: "CHECK EXIT ESTIMATE" }).click();
  await expect(page.getByTestId("exit-check-error")).toContainText("The Robinhood Chain RPC provider is cooling down. Try again in a minute.");
  await expect(page.getByTestId("exit-check-quote")).toHaveCount(0);
});

test("exit check ignores a stale response after the output choice changes", async ({ page }) => {
  test.skip(!enabled, "enabled-build check");
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/v1/private/exit-check/quote", async (route) => {
    const body = route.request().postDataJSON() as { outputToken: string };
    if (body.outputToken === "WETH") {
      await gate;
      try {
        await route.fulfill({ json: fixture() });
      } catch {
        // The page aborted the fetch; nothing should render.
      }
      return;
    }
    await route.fulfill({ json: fixture() });
  });
  await page.goto("/exit-check");
  await fillForm(page);
  await page.getByRole("button", { name: "CHECK EXIT ESTIMATE" }).click();
  await expect(page.getByTestId("exit-check-loading")).toBeVisible();
  await page.getByRole("button", { name: "USDG", exact: true }).click();
  release?.();
  await expect(page.getByTestId("exit-check-loading")).toHaveCount(0);
  await expect(page.getByTestId("exit-check-quote")).toHaveCount(0);
});

test("exit check is closed by default, including direct links", async ({ page }) => {
  test.skip(enabled, "closed-build check");
  let calls = 0;
  await page.route("**/v1/private/exit-check/quote", (route) => { calls++; return route.abort(); });
  await page.goto("/exit-check");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("button", { name: "CHECK EXIT ESTIMATE" })).toHaveCount(0);
  expect(calls).toBe(0);
});
