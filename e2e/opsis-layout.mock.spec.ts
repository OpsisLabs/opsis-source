import { openOpsisMenu, closeOpsisMenu } from "./opsis-test-helpers";
import { expect, test, type Locator, type Page } from "@playwright/test";

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

const toolRoutes = [
  "/research",
  "/research/details",
  "/rwa",
  "/biggest-trades",
  "/research/events",
  "/check",
  "/check/perp-scenario",
  "/swap",
  "/simulate",
  "/stress-test",
  "/watch",
  "/saved",
  "/lab",
  "/guide",
];
async function fullyInViewport(
  locator: Locator,
  viewport: { width: number; height: number },
) {
  await locator.page().evaluate(() => document.fonts.ready);
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test.describe("Opsis compact layout", () => {
  test.skip(!enabled);
  test.use({ viewport: { width: 375, height: 812 } });
  test.beforeEach(async ({ page }) => {
    await mockAccess(page);
  });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    for (const locale of ["en", "zh-CN"]) {
      for (const theme of ["light", "dark"] as const) {
        test(`opsis preview layout inputs and actions fit ${viewport.width} ${locale} ${theme}`, async ({
          page,
        }) => {
          test.skip(process.env.VITE_EXIT_CHECK_ENABLED !== "true");
          await page.setViewportSize(viewport);
          // The theme is an explicit, saved choice (D15); it does not follow the system setting.
          await page
            .context()
            .addCookies([
              {
                name: "opsis_theme",
                value: theme,
                url: `http://localhost:${process.env.PW_APP_PORT ?? "5173"}`,
              },
            ]);
          await page.goto("/research");
          await expect(page.locator("#research-entity")).toBeVisible();
          if (locale === "zh-CN") {
            // The language switch sits in the top bar on every width.
            await page.getByRole("button", { name: "中文", exact: true }).click();
          }
          for (const [path, input, action] of [
            [
              "/research",
              "#research-entity",
              locale === "en" ? "Run research" : "运行研究",
            ],
            [
              "/check",
              "#check-token",
              locale === "en" ? "Run a check" : "运行核查",
            ],
          ]) {
            await page.goto(path);
            const field = page.locator(input);
            const button = page
              .locator("#opsis-content")
              .getByRole("button", { name: action, exact: true });
            await expect(field).toBeVisible();
            await expect(button).toBeVisible();
            await expect(page.locator(".opsis")).toHaveAttribute(
              "data-theme",
              theme,
            );
            expect(await page.evaluate(() => scrollY)).toBe(0);
            await fullyInViewport(field, viewport);
            await fullyInViewport(button, viewport);
            expect((await field.boundingBox())!.width).toBeGreaterThan(240);
          }
        });
      }
      test(`opsis preview layout header stays constant ${viewport.width} ${locale}`, async ({
        page,
      }) => {
        // Visits every tool route: allow for a busy machine.
        test.setTimeout(90_000);
        await page.setViewportSize(viewport);
        await page.goto("/research");
        await expect(page.locator("#research-entity")).toBeVisible();
        if (locale === "zh-CN") {
          // The language switch sits in the top bar on every width.
          await page.getByRole("button", { name: "中文", exact: true }).click();
        }
        const heights: number[] = [];
        const contentTops: number[] = [];
        for (const path of toolRoutes) {
          await page.goto(path);
          await expect(page.locator("#opsis-content h1").first()).toBeVisible();
          const header = page.locator(".opsis-header");
          await expect(header.locator(".opsis-logo")).toHaveText("Opsis");
          await expect(
            page.locator(".opsis-desktop-rail .opsis-tool-rail section"),
          ).toHaveCount(4);
          await page.evaluate(() => document.fonts.ready);
          const box = await header.boundingBox();
          expect(box).not.toBeNull();
          heights.push(box!.height);
          // Include the slim top bar in the first-screen budget.
          const top = await page
            .locator("#opsis-content")
            .evaluate((el) => el.getBoundingClientRect().top);
          contentTops.push(top);
          expect(top).toBeLessThanOrEqual(viewport.width === 1280 ? 150 : 200);
          expect(box!.height).toBeLessThanOrEqual(
            viewport.width === 1280 ? 150 : 200,
          );
        }
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(
          1,
        );
        expect(
          Math.max(...contentTops) - Math.min(...contentTops),
        ).toBeLessThanOrEqual(1);
      });
    }
  }
  for (const width of [320, 375, 1280]) {
    for (const locale of ["en", "zh-CN"]) {
      test(`opsis preview layout has no sideways scroll ${width} ${locale}`, async ({
        page,
      }) => {
        // Visits every tool route: allow for a busy machine.
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 812 });
        await page.goto("/research");
        await expect(page.locator("#research-entity")).toBeVisible();
        if (locale === "zh-CN") {
          // The language switch sits in the top bar on every width.
          await page.getByRole("button", { name: "中文", exact: true }).click();
        }
        for (const path of toolRoutes) {
          await page.goto(path);
          await expect(page.locator("#opsis-content h1").first()).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(0);
          await openOpsisMenu(page);
          // Stock-token check puts its own contract lookup where the top-bar search sits.
          const search =
            width <= 700
              ? page.locator("#menu-entity")
              : path === "/rwa"
                ? page.locator("#rwa-workspace-address")
                : page.locator("#nav-entity");
          await expect(search).toBeVisible();
          await fullyInViewport(search, { width, height: 812 });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(0);
          await closeOpsisMenu(page);
          if (width < 800) {
            for (const target of await page
              .locator(
                ".opsis-header :is(button, summary, .opsis-logo, .opsis-guide-link, nav a)",
              )
              .all()) {
              if (await target.isVisible()) {
                const box = (await target.boundingBox())!;
                expect(box.height).toBeGreaterThanOrEqual(44);
                expect(box.width).toBeGreaterThanOrEqual(44);
              }
            }
          }
        }
      });
    }
  }
  test("opsis preview layout Watch input fits the phone viewport", async ({
    page,
  }) => {
    test.skip(process.env.VITE_WATCH_ENABLED !== "true");
    await page.goto("/watch");
    const field = page.locator("#watch-address-input");
    await expect(field).toBeVisible();
    await fullyInViewport(field, { width: 375, height: 812 });
  });
  test("opsis preview layout data status wraps a full build identifier", async ({
    page,
  }) => {
    const flags = {
      research: true,
      tokenControls: false,
      exitCheck: true,
      watch: true,
      rwa: true,
      observedTrades: true,
    };
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
              id,
              enabled,
              scope: "bounded test scope",
              origin: "live on request",
              freshness: "per request",
              coverage: "partial",
              limits: "provider health unknown",
            })),
          },
        },
      }),
    );
    await page.goto("/status");
    await expect(
      page.getByText(`Build ${build}.`, { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("opsis preview layout privacy uses one main and one language switcher", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy", exact: true }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /中文/ })).toHaveCount(1);
    await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
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
    await page.getByText("Pick what describes you", { exact: true }).click();
    const tasks = page.getByRole("group", { name: "Choose your task" });
    await expect(tasks.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(tasks).not.toContainText("↗");
    await tasks.getByRole("button", { name: "I'm holding assets" }).click();
    await expect(tasks.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(
      tasks.getByRole("button", { name: "I'm holding assets" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/guide$/);
    // The language switch sits in the top bar on every width.
    await page.getByRole("button", { name: "中文", exact: true }).click();
    const chineseTasks = page.getByRole("group", { name: "选择任务" });
    await chineseTasks.getByRole("button", { name: "我交易代币" }).click();
    await expect(
      chineseTasks.getByRole("button", { pressed: true }),
    ).toHaveCount(1);
    expect(requests).toEqual([]);
  });
});
