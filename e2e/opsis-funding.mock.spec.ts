import { expect, test } from "@playwright/test";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.skip(!enabled, "Opsis workspaces are disabled in this test environment");
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({ json: { expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663, research: true, exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false } }));
});

test("funding records stay local, distinguish realized from prediction, and remain accessible in English and Chinese", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await page.getByText("Funding record analysis").click();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  await page.getByRole("button", { name: "Load synthetic example" }).click();
  await expect(page.getByText("SYNTHETIC EXAMPLE — not venue data")).toBeVisible();
  await expect(page.getByText("-0.85 USDC")).toBeVisible();
  await expect(page.getByRole("img", { name: /Cumulative realized net funding/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Quoted interval (s)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Cumulative realized net" })).toBeVisible();
  await expect(page.locator(".opsis-funding-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".opsis-funding-table tbody tr").nth(2).locator("td").nth(7)).toHaveText("Excluded");
  await expect(page.getByText(/Chain ID:/)).toBeVisible();
  await page.getByText("Required JSON fields and format").click();
  await expect(page.locator(".opsis-funding-schema")).toContainText("quotedIntervalSeconds");
  const [template] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download synthetic JSON example" }).click()]);
  expect(template.suggestedFilename()).toBe("synthetic-funding-example.json");
  const upload = {
    schemaVersion: 1,
    records: [{ venue: "Private venue", instrument: { chainId: 1, market: "ethereum:PRIVATE-PERP" }, timestamp: "2026-09-22T08:00:00Z", status: "realized", quotedIntervalSeconds: 14400, paidIntervalSeconds: 14400, direction: "received", notionalConvention: "linear quote notional", notional: "200", quoteUnit: "TEST", amount: "0.25", provenance: { source: "PRIVATE_FUNDING_SOURCE", observedAt: "2026-09-22T08:01:00Z" } }],
  };
  await page.getByLabel(/Funding records JSON/).setInputFiles({ name: "funding.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(upload)) });
  await expect(page.getByText("0.25 TEST")).toBeVisible();
  expect(requests.some((request) => request.includes("PRIVATE_FUNDING_SOURCE") || request.includes("PRIVATE-PERP"))).toBe(false);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "资金费率记录" })).toBeVisible();
  await expect(page.getByText(/导入内容仅保存在此视图的浏览器内存中/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "支付间隔（秒）" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载合成 JSON 示例" })).toBeVisible();
  await page.getByLabel(/资金费率 JSON/).setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, records: [upload.records[0], upload.records[0]] })) });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(requests.some((request) => request.includes("PRIVATE_FUNDING_SOURCE") || request.includes("PRIVATE-PERP"))).toBe(false);
});

test("a slower earlier import cannot overwrite a later selected file", async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    Object.defineProperty(File.prototype, "text", { configurable: true, value: function(this: File) {
      if (this.name === "slow-first.json") return new Promise<string>((resolve) => {
        (window as Window & { releaseSlowFunding?: () => void }).releaseSlowFunding = () => { void originalText.call(this).then(resolve); };
      });
      return originalText.call(this);
    } });
  });
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await page.getByText("Funding record analysis").click();
  const record = (amount: string, source: string) => ({
    schemaVersion: 1,
    records: [{ venue: "Local", instrument: { chainId: 1, market: "chain:MARKET" }, timestamp: "2026-09-22T08:00:00Z", status: "realized", quotedIntervalSeconds: 3600, paidIntervalSeconds: 3600, direction: "received", notionalConvention: "quote notional", notional: "10", quoteUnit: "UNIT", amount, provenance: { source, observedAt: "2026-09-22T08:01:00Z" } }],
  });
  const input = page.getByLabel(/Funding records JSON/);
  await input.setInputFiles({ name: "slow-first.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(record("1", "First"))) });
  await input.setInputFiles({ name: "fast-second.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(record("2", "Second"))) });
  await expect(page.getByText("2 UNIT")).toBeVisible();
  await page.evaluate(() => (window as Window & { releaseSlowFunding?: () => void }).releaseSlowFunding?.());
  await expect(page.getByText("2 UNIT")).toBeVisible();
  await expect(page.getByText("First · 2026-09-22T08:01:00Z")).toHaveCount(0);
});
