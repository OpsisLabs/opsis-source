import { test, expect } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("preserved quant lab loads its dated snapshot and supports token comparison and source context", async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/quant/index.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page).toHaveTitle("Crypto Quant Lab · Opsis");
  await expect(page.locator("#captureStamp")).toContainText("Prices are captured observations");
  await expect(page.locator("#poolCount")).not.toHaveText("—");
  await page.locator("#compareNav").click();
  await expect(page.locator("#compareDialog")).toBeVisible();
  for (const symbol of ["WETH", "PONS", "CASHCAT"]) await expect(page.locator("#comparison")).toContainText(symbol);
  await page.getByRole("button", { name: "Close token comparison" }).click();
  await page.getByRole("button", { name: "Data and methodology", exact: true }).click();
  await expect(page.locator("#methodDialog")).toContainText("not a continuously refreshed feed");
  await expect(page.locator("#methodDialog")).toContainText("no live AI model is called");
  await page.getByRole("button", { name: "Close methodology" }).click();
  await page.getByRole("button", { name: "Show all 10", exact: false }).click();
  await expect(page.locator("#assetRows tr")).toHaveCount(10);
  const origin = new URL(page.url()).origin;
  expect(requests.every(url => new URL(url).origin === origin)).toBe(true);
  expect(requests.some(url => new URL(url).pathname.startsWith("/v1/"))).toBe(false);
  expect(errors).toEqual([]);
});

test("preserved quant lab updates hypothetical portfolio arithmetic and mobile controls", async ({ page }) => {
  await page.goto("/quant/index.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.locator("#openScenario").click();
  await expect(page.locator("#scenarioTab")).toHaveAttribute("aria-selected", "true");
  for (const [id, value] of [["weightSlider", "50"], ["inlineCore", "-20"], ["inlineOther", "-30"], ["feeSlider", "0.5"]]) {
    await page.locator(`#${id}`).evaluate((input, next) => { (input as HTMLInputElement).value = next; input.dispatchEvent(new Event("input", { bubbles: true })); }, value);
  }
  // $10,000 × (1 - 0.65 × 0.20 - 0.30 × 0.30) × (1 - 0.005).
  await expect(page.locator("#scenarioNet")).toHaveText("$7,761.00");
  await expect(page.locator("#scenarioPL")).toHaveText("−$2,239.00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.locator("#atlasTab").click();
  await page.locator("#minLiquidity").selectOption("100000");
  await expect(page.locator("#atlasTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#visibleCount")).toContainText("pools plotted");
});

test("preserved quant lab fails closed on unavailable data and can retry", async ({ page }) => {
  await page.route("**/quant/crypto-data.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/quant/index.html");
  await expect(page.locator("#loadError")).toBeVisible();
  await expect(page.locator(".workspace")).toHaveAttribute("inert", "");
  await expect(page.locator("#poolCount")).toHaveText("—");
  await page.unroute("**/quant/crypto-data.json");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#loadError")).toBeHidden();
});
