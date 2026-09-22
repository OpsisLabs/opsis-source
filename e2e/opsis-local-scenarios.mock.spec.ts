import { test, expect } from "@playwright/test";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.describe("Opsis local price and perp scenarios", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await page.route("**/v1/private/opsis/access", (r) =>
      r.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: false,
          exitCheck: false,
          watch: false,
          rwa: false,
          observedTrades: false,
          perpExecution: false,
        },
      }),
    );
  });
  test("perp costs stay local, unknown inputs refuse, short direction and bilingual mobile", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/v1/") && !r.url().includes("/opsis/access"))
        requests.push(r.url() + (r.postData() ?? ""));
    });
    await page.goto("/check/perp-scenario");
    await expect(
      page.getByRole("complementary", { name: "Scenario disclosure" }),
    ).toContainText("Informational hypothetical tool only");
    await expect(
      page.getByRole("button", { name: /connect wallet|submit order/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "Complete the assumptions",
    );
    for (const [name, value] of [
      ["Base-asset quantity", "2"],
      ["Entry price", "100"],
      ["Scenario closing price", "110"],
      ["Entry fee (basis points)", "5"],
      ["Exit fee (basis points)", "10"],
      ["Total funding: positive paid, negative received", "1"],
      ["Other costs in quote currency", "0.5"],
    ])
      await page.getByLabel(name, { exact: true }).fill(value);
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "18.18000000 quote units net",
    );
    await page.getByLabel("Position direction").selectOption("short");
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "-21.82000000 quote units net",
    );
    await page.getByLabel("Exit fee (basis points)", { exact: true }).fill("");
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "Complete the assumptions",
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "平仓成本后还剩多少？" }),
    ).toBeVisible();
    expect(
      await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    expect(requests).toEqual([]);
  });
  test("stock oracle uses its existing multiplier and refuses different currencies", async ({
    page,
  }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/v1/") && !r.url().includes("/opsis/access"))
        sent.push(r.url() + (r.postData() ?? ""));
    });
    await page.goto("/lab");
    await page.getByRole("button", { name: /Quant research/ }).click();
    await page
      .locator("summary")
      .filter({ hasText: "Stock-token reference gap" })
      .click();
    await page.getByLabel("DEX price per token", { exact: true }).fill("55");
    await page.getByLabel("Reference price", { exact: true }).fill("100");
    await page
      .getByLabel("Underlying units per token (multiplier)", { exact: true })
      .fill("0.5");
    await page.getByRole("checkbox", { name: /same instrument, time/ }).check();
    await expect(
      page.getByRole("heading", { name: "10.0000%", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Reference type", { exact: true })
      .selectOption("oracle");
    await page.getByLabel("Reference price", { exact: true }).fill("50");
    await expect(
      page.getByRole("heading", { name: "10.0000%", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("DEX quote currency", { exact: true })
      .selectOption("USDG");
    await expect(
      page.getByRole("heading", { name: "Gap unavailable", exact: true }),
    ).toBeVisible();
    expect(sent).toEqual([]);
  });
});
