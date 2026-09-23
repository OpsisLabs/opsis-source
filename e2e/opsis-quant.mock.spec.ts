import { test, expect } from "@playwright/test";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.skip(!enabled, "Opsis workspaces are disabled in this test environment");
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({ json: { expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663, research: true, exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false } }));
});

test("local quant workflow validates, runs, and requires export consent", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await expect(page.getByText("1. Define the dataset")).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  const rows = Array.from({ length: 190 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return { date, price: 100 + index };
  });
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "local.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ PRIVATE_CANARY: "PRIVATE_CANARY", schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "TEST" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "synthetic fixture", observedAt: "2026-09-01T00:00:00Z" }, synthetic: true, observations: rows })),
  });
  await expect(page.getByText(/observations loaded/)).toBeVisible();
  await page.getByRole("button", { name: "Run local experiment" }).click();
  await expect(page.getByText("4. Results")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Resampling model").selectOption("historical_moving_block_bootstrap");
  await page.getByLabel("Block length (2–30 days; at most half the sample)").fill("7");
  await page.getByRole("button", { name: "Run local experiment" }).click();
  await expect(page.getByText(/historical_moving_block_bootstrap \(7d\)/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("At most two local runs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export manifest" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /consent to download/i }).check();
  await expect(page.getByRole("button", { name: "Export manifest" })).toBeEnabled();
  expect(requests.some((url) => url.includes("PRIVATE_CANARY"))).toBe(false);
  expect(requests.some((url) => url.includes("/v1/private/analyze"))).toBe(false);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    { timeout: 3_000, message: "Quant settles without horizontal overflow after a viewport resize" },
  ).toBeLessThanOrEqual(1);
});
