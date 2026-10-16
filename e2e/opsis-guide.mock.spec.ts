import { openOpsisMenu, closeOpsisMenu } from "./opsis-test-helpers";
import { test, expect } from "@playwright/test";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.describe("Opsis tool finder", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await page.route("**/v1/private/opsis/access", (r) =>
      r.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: true,
          exitCheck: true,
          watch: true,
          rwa: true,
          observedTrades: true,
          perpExecution: false,
        },
      }),
    );
  });
  test("matches tasks to tools locally and explains the current perp limit", async ({
    page,
  }) => {
    const lookups: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/v1/") && !r.url().includes("/opsis/access"))
        lookups.push(r.url());
    });
    await page.goto("/guide");
    await expect(
      page.getByRole("heading", {
        name: "What do you want to find out?",
        level: 1,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: "output/opsis-guidance/finder-desktop.png",
      fullPage: true,
    });
    await page.getByText("Pick what describes you", { exact: true }).click();
    const suggestions = page.getByRole("region", {
      name: "Suggested starting points",
    });
    await expect(
      suggestions.getByRole("link", { name: "Open Research →", exact: true }),
    ).toHaveAttribute("href", "/research");
    await page.getByRole("button", { name: "I'm holding assets" }).click();
    await expect(
      suggestions.getByRole("link", {
        name: "Open Watch →",
        exact: true,
      }),
    ).toHaveAttribute("href", "/watch");
    await page
      .getByRole("button", { name: "I explore data & scenarios" })
      .click();
    await expect(
      suggestions.getByRole("link", { name: "Open Quant Lab →", exact: true }),
    ).toHaveAttribute("href", "/lab");
    await page.getByRole("button", { name: "I trade perpetuals" }).click();
    await expect(suggestions).toContainText("Opsis has no perp trading.");
    await expect(
      suggestions.getByRole("link", { name: "Open Perp cost scenario →" }),
    ).toHaveAttribute("href", "/check/perp-scenario");
    await expect(
      suggestions.getByRole("link", {
        name: "Open Quant Lab for funding records →",
      }),
    ).toHaveAttribute("href", "/lab");
    expect(lookups).toEqual([]);
    await page
      .getByRole("button", { name: "I explore data & scenarios" })
      .click();
    await suggestions
      .getByRole("link", { name: "Open Quant Lab →", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Who this tool is for" }),
    ).toContainText(
      "Choose captured pools or a shock surface; import daily prices, funding, or paired mark/index records for local experiments",
    );
  });
  test("does not offer disabled tools and remains usable in Chinese on mobile", async ({
    page,
  }) => {
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
    await page.goto("/guide");
    await page.getByText("Pick what describes you", { exact: true }).click();
    const suggestions = page.getByRole("region", {
      name: "Suggested starting points",
    });
    await expect(suggestions).toContainText("No tools enabled for this task");
    await expect(suggestions.getByRole("link")).toHaveCount(0);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByRole("button", { name: "我探索数据与情景" }).click();
    await expect(
      page
        .getByRole("region", { name: "建议起点" })
        .getByRole("link", { name: "打开 量化实验室 →", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: "output/opsis-guidance/finder-mobile.png",
      fullPage: true,
    });
  });
  test("landing task finder leads to the guide without adding a workspace", async ({
    page,
  }) => {
    await page.goto("/");
    const landing = page.frameLocator(
      'iframe[title="Opsis overview — interactive chain"]',
    );
    // The film has two "Find your tool" buttons: the hero call to action and
    // one in the side rail. Use the hero's.
    await landing
      .locator(".hero-actions")
      .getByRole("button", { name: "Find your tool", exact: false })
      .click();
    await expect(page).toHaveURL(/\/guide$/);
    await expect(
      page.getByRole("heading", {
        name: "What do you want to find out?",
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.locator(".opsis-tool-rail section")).toHaveCount(4);
  });
});
