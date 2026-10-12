import { expect, test } from "@playwright/test";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.skip(!enabled, "Opsis workspaces are disabled in this test environment");
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({ json: { expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663, research: true, exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false } }));
});

test("basis example, exact signed values, chart, table and imports stay local", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await page.locator("summary").filter({ hasText: "Mark / index basis dataset" }).click();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  await page.getByRole("button", { name: "Load synthetic example" }).click();
  await expect(page.getByText("SYNTHETIC EXAMPLE — not venue data")).toBeVisible();
  await expect(page.locator(".opsis-basis-chart")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Mark price" })).toBeVisible();
  await expect(page.locator(".opsis-basis-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".opsis-basis-table tbody tr").nth(0).locator("td").nth(5)).toHaveText("125");
  await expect(page.locator(".opsis-basis-table tbody tr").nth(1).locator("td").nth(5)).toHaveText("-50");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download synthetic JSON example" }).click()]);
  expect(download.suggestedFilename()).toBe("synthetic-basis-example.json");
  const imported = {
    schemaVersion: 1, venue: "Private venue", chainId: 999, market: "test:PRIVATE-MARKET", quoteUnit: "TEST",
    records: ["08", "09"].map((hour) => ({ timestamp: `2026-09-22T${hour}:00:00Z`, markPrice: "11", indexPrice: "10", markProvenance: { source: "PRIVATE_MARK_SOURCE", observedAt: `2026-09-22T${hour}:00:00Z` }, indexProvenance: { source: "PRIVATE_INDEX_SOURCE", observedAt: `2026-09-22T${hour}:00:00Z` } })),
  };
  await page.getByLabel(/Basis JSON/).setInputFiles({ name: "basis.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByText("PRIVATE_MARK_SOURCE · 2026-09-22T08:00:00Z")).toBeVisible();
  expect(requests.some((request) => request.includes("PRIVATE_MARK_SOURCE") || request.includes("PRIVATE-MARKET"))).toBe(false);
  await page.getByLabel(/Basis JSON/).setInputFiles({ name: "misaligned.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...imported, records: imported.records.map((row, index) => index ? { ...row, indexProvenance: { ...row.indexProvenance, observedAt: "2026-09-22T08:00:00Z" } } : row) })) });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".opsis-basis-chart")).toHaveCount(0);
  expect(requests.some((request) => request.includes("PRIVATE_MARK_SOURCE") || request.includes("PRIVATE-MARKET"))).toBe(false);
});

test("basis import race is guarded and Chinese mobile layout stays within viewport in dark theme", async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    Object.defineProperty(File.prototype, "text", { configurable: true, value: function(this: File) {
      if (this.name === "slow-first.json") return new Promise<string>((resolve) => { (window as Window & { releaseSlowBasis?: () => void }).releaseSlowBasis = () => { void originalText.call(this).then(resolve); }; });
      return originalText.call(this);
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await page.locator("summary").filter({ hasText: "Mark / index basis dataset" }).click();
  await page.getByRole("button", { name: "Theme: Light", exact: true }).click();
  await expect(page.locator(".opsis")).toHaveAttribute("data-theme", "dark");
  const darkBackground = await page.locator(".opsis-basis button").first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe("rgba(0, 0, 0, 0)");
  const data = (source: string) => ({ schemaVersion: 1, venue: "Local", chainId: 1, market: "chain:MARKET", quoteUnit: "UNIT", records: ["08", "09"].map((hour) => ({ timestamp: `2026-09-22T${hour}:00:00Z`, markPrice: "2", indexPrice: "1", markProvenance: { source, observedAt: `2026-09-22T${hour}:00:00Z` }, indexProvenance: { source, observedAt: `2026-09-22T${hour}:00:00Z` } })) });
  const input = page.getByLabel(/Basis JSON/);
  await input.setInputFiles({ name: "slow-first.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data("First"))) });
  await input.setInputFiles({ name: "fast-second.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data("Second"))) });
  await expect(page.getByRole("cell", { name: "Second · 2026-09-22T08:00:00Z" }).first()).toBeVisible();
  await page.evaluate(() => (window as Window & { releaseSlowBasis?: () => void }).releaseSlowBasis?.());
  await expect(page.getByRole("cell", { name: "Second · 2026-09-22T08:00:00Z" }).first()).toBeVisible();
  await expect(page.getByText("First · 2026-09-22T08:00:00Z")).toHaveCount(0);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "标记价 / 指数价基差数据集" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "标记价", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
