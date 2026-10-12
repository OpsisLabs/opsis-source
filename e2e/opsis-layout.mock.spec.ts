import { expect, test, type Page } from "@playwright/test";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
async function mockAccess(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) =>
    route.fulfill({
      json: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        chainId: 4663,
        research: true,
        exitCheck: true,
        watch: true,
        rwa: true,
        observedTrades: true,
        swapPreview: false,
        perpExecution: false,
      },
    }),
  );
}

test.describe("Opsis compact layout", () => {
  test.skip(!enabled);
  test.use({ viewport: { width: 375, height: 812 } });
  test.beforeEach(async ({ page }) => {
    await mockAccess(page);
  });
  for (const [path, input] of [
    ["/research", "#research-entity"],
    ["/check", "#check-token"],
    ["/watch", "#watch-address-input"],
  ]) {
    test(`opsis preview layout ${path} input fits the first viewport`, async ({
      page,
    }) => {
      await page.goto(path);
      const field = page.locator(input);
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(812);
      expect(box!.width).toBeGreaterThan(240);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(375);
    });
  }
  test("opsis preview layout data status wraps a full build identifier", async ({
    page,
  }) => {
    const flags = { research: true, tokenControls: false, exitCheck: true, watch: true, rwa: true, observedTrades: true };
    const build = "0123456789abcdef0123456789abcdef01234567";
    await page.route("**/v1/private/opsis/access", (route) =>
      route.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          ...flags,
          swapPreview: false,
          perpExecution: false,
          manifest: {
            version: 1,
            chain: { id: 4663, name: "Robinhood Chain" },
            build,
            capabilities: Object.entries(flags).map(([id, enabled]) => ({
              id, enabled,
              scope: "bounded test scope", origin: "live on request",
              freshness: "per request", coverage: "partial", limits: "provider health unknown",
            })),
          },
        },
      }),
    );
    await page.goto("/status");
    await expect(page.getByText(`Build ${build}.`, { exact: false })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
  });

  test("opsis preview layout privacy uses one main and one language switcher", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /中文/ }),
    ).toHaveCount(1);
    await expect(page.locator('a[href*="opsis-source"]')).toHaveCount(0);
    await expect(
      page.locator("article header, article main, article img"),
    ).toHaveCount(0);
  });
  test("opsis preview layout guide filters have exactly one pressed task", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/v1/") &&
        !request.url().includes("/opsis/access")
      )
        requests.push(request.url());
    });
    await page.goto("/guide");
    const tasks = page.getByRole("group", { name: "Choose your task" });
    await expect(tasks.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(tasks).not.toContainText("↗");
    await tasks.getByRole("button", { name: "I'm holding assets" }).click();
    await expect(tasks.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(
      tasks.getByRole("button", { name: "I'm holding assets" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/guide$/);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    const chineseTasks = page.getByRole("group", { name: "选择任务" });
    await chineseTasks.getByRole("button", { name: "我交易代币" }).click();
    await expect(
      chineseTasks.getByRole("button", { pressed: true }),
    ).toHaveCount(1);
    expect(requests).toEqual([]);
  });
});
