import { fixture, research } from "../apps/web/src/opsis/test-fixtures";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
const TOKEN = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352";
const POOL = `0x${"a".repeat(40)}`;
const key = "a".repeat(64);

async function access(
  page: Page,
  options: { watch?: boolean; exitCheck?: boolean; expiry?: number } = {},
) {
  await page.route("**/v1/private/opsis/access", (route) => {
    expect(route.request().headers().authorization).toBe(`Preview ${key}`);
    expect(route.request().postDataJSON()).toEqual({});
    return route.fulfill({
      json: {
        expiresAt: new Date(
          Date.now() + (options.expiry ?? 60_000),
        ).toISOString(),
        chainId: 4663,
        research: true,
        exitCheck: options.exitCheck ?? true,
        watch: options.watch ?? true,
        rwa: false,
        observedTrades: false,
        perpExecution: false,
      },
    });
  });
}
async function unlock(page: Page, path = "/") {
  await page.goto(path);
  await page.getByLabel("Preview access key").fill(key);
  await page.getByRole("button", { name: "Open preview", exact: true }).click();
  await expect(
    path === "/"
      ? page.getByTitle("Opsis overview — interactive chain")
      : page.getByRole("navigation", { name: "Workspaces", exact: true }),
  ).toBeVisible();
}

test("opsis is closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/research");
  await expect(page.getByLabel("Preview access key")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run research", exact: true }),
  ).toHaveCount(0);
});
test.describe("opsis preview", () => {
  test.skip(!enabled);
  test("access fails closed and expiry unmounts private tools", async ({
    page,
  }) => {
    let lookups = 0;
    await page.route("**/v1/private/analyze", (route) => {
      lookups++;
      return route.abort();
    });
    await page.route("**/v1/private/opsis/access", (route) =>
      route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } }),
    );
    await page.goto("/research");
    await page.getByLabel("Preview access key").fill(key);
    await page
      .getByRole("button", { name: "Open preview", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Preview unavailable");
    expect(lookups).toBe(0);
    await page.unroute("**/v1/private/opsis/access");
    await access(page, { expiry: 2000 });
    await page.getByLabel("Preview access key").fill(key);
    await page
      .getByRole("button", { name: "Open preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Run research", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Preview access key")).toBeVisible({
      timeout: 5000,
    });
    expect(
      await page.evaluate(
        () =>
          JSON.stringify(localStorage) +
          JSON.stringify(sessionStorage) +
          document.cookie,
      ),
    ).not.toContain(key);
  });
  test("research hands only public identity to check; quotes retain expiry and omit size from URLs", async ({
    page,
  }) => {
    await access(page);
    let calls = 0;
    await page.route("**/v1/private/analyze", (route) => {
      calls++;
      expect(route.request().headers().authorization).toBe(`Preview ${key}`);
      expect(route.request().postDataJSON()).toEqual({
        entity: TOKEN,
        entityType: "unknown",
        locale: "en",
        task: "overview",
      });
      return route.fulfill({ json: research() });
    });
    await page.route("**/v1/private/exit-check/quote", (route) => {
      expect(route.request().postDataJSON()).toEqual({
        token: TOKEN,
        amount: "1.5",
        outputToken: "WETH",
        curve: false,
      });
      const data = fixture();
      data.quotedAt = new Date(Date.now() - 31_000).toISOString();
      data.expiresAt = new Date(Date.now() - 1000).toISOString();
      data.provider.cached = true;
      return route.fulfill({ json: data });
    });
    await unlock(page, `/research?entity=${TOKEN}`);
    expect(calls).toBe(0);
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    await expect(page.getByTestId("opsis-research-result")).toContainText(
      "Fixture observation",
    );
    await page.getByRole("link", { name: "Check an amount" }).click();
    await expect(
      page.getByLabel("Token contract · chain 4663", { exact: true }),
    ).toHaveValue(TOKEN);
    await expect(
      page.getByLabel("Amount to check", { exact: true }),
    ).toHaveValue("");
    await page.getByLabel("Amount to check", { exact: true }).fill("1.5");
    await page
      .getByRole("button", { name: "Run a check", exact: true })
      .click();
    await expect(page.getByTestId("opsis-quote")).toContainText("STALE QUOTE");
    await expect(page.getByTestId("opsis-quote")).toContainText("0.0000005");
    await page.screenshot({
      path: "test-results/opsis-check.png",
      fullPage: true,
    });
    await expect(page.getByRole("region", {name: "Observed pool comparison"})).toBeVisible();
    await page.getByRole("region", {name: "Observed pool comparison"}).getByRole("button").first().click();
    await expect(page.getByRole("region", {name: "Observed pool comparison"})).toContainText(POOL);
    const venue = await page
      .getByRole("link", { name: "Open Uniswap" })
      .getAttribute("href");
    expect(venue).not.toMatch(/amount|value=|1\.5/);
    expect(new URL(page.url()).search).toBe(`?entity=${TOKEN}`);
    await page
      .getByRole("button", { name: "Lock preview", exact: true })
      .click();
    await expect(page.getByTestId("opsis-quote")).toHaveCount(0);
  });
  test("quote errors, unsupported pools and changed input do not leave a misleading result", async ({
    page,
  }) => {
    await access(page);
    let mode = "unsupported";
    await page.route("**/v1/private/exit-check/quote", (route) => {
      if (mode === "error")
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE" } },
        });
      const data = {
        ...fixture(),
        supported: false,
        reason: "no_v3_pool",
        output: null,
        quote: null,
      };
      return route.fulfill({ json: data });
    });
    await unlock(page, `/check?entity=${TOKEN}&amount=99&note=private`);
    await expect(
      page.getByLabel("Amount to check", { exact: true }),
    ).toHaveValue("");
    await page.getByLabel("Amount to check", { exact: true }).fill("1.5");
    await page
      .getByRole("button", { name: "Run a check", exact: true })
      .click();
    await expect(page.getByTestId("opsis-quote")).toContainText(
      "No observed quote at this size",
    );
    await page.getByLabel("Amount to check", { exact: true }).fill("2");
    await expect(page.getByTestId("opsis-quote")).toHaveCount(0);
    mode = "error";
    await page
      .getByRole("button", { name: "Run a check", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Quote unavailable");
  });
  test("workspace navigation, Saved, disabled services, theme and language work at mobile widths", async ({
    page,
  }) => {
    await access(page, { exitCheck: false, watch: false });
    await unlock(page);
    const overview = page.frameLocator(
      'iframe[title="Opsis overview — interactive chain"]',
    );
    await expect(
      overview.getByRole("heading", { name: "See the bigger picture." }),
    ).toBeVisible();
    await overview
      .getByRole("navigation", { name: "Workspaces" })
      .getByRole("button", { name: "Research", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/opsis-home.png",
      fullPage: true,
    });
    await expect(
      page
        .getByRole("navigation", { name: "Workspaces", exact: true })
        .getByRole("link"),
    ).toHaveCount(4);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await page
      .getByRole("navigation", { name: "Workspaces", exact: true })
      .getByRole("link", { name: "Trade Check", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Not enabled in this preview" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Saved", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "CREATE ENCRYPTED VAULT", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Workspaces", exact: true })
      .getByRole("link", { name: "Quant Lab", exact: true })
      .click();
    await expect(page.getByRole("img", {name:/Interactive captured pool map/})).toBeVisible();
    await page
      .getByRole("button", { name: "Light theme", exact: true })
      .click();
    await expect(page.locator(".opsis")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(
      page
        .getByRole("navigation", { name: "工作区", exact: true })
        .getByRole("link", { name: "研究", exact: true }),
    ).toBeVisible();
  });
  test("original film preserves scroll, opens real tools and rejects untrusted navigation", async ({
    page,
  }) => {
    await access(page);
    let lookups = 0;
    await page.route("**/v1/private/analyze", (route) => {
      lookups++;
      return route.abort();
    });
    await unlock(page);
    const overview = page.frameLocator(
      'iframe[title="Opsis overview — interactive chain"]',
    );
    await expect(overview.locator("#scanner")).toBeAttached();
    await expect(
      overview.getByRole("heading", { name: "See the bigger picture." }),
    ).toBeVisible();
    await expect(overview.locator("#index-list button")).toHaveCount(6);
    await expect(overview.locator("#scanner")).toHaveAttribute(
      "data-state",
      "ready",
    );
    await expect(overview.locator("#poster")).toHaveCSS("opacity", "0");
    await page.screenshot({ path: "output/opsis-restored-desktop.png" });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 390)
        await page.screenshot({ path: "output/opsis-restored-mobile.png" });
      expect(
        await overview
          .locator("html")
          .evaluate((el) => el.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1);
    }
    // Parent/sibling windows cannot impersonate the landing frame.
    await page.evaluate(() =>
      window.postMessage(
        { type: "opsis:open-tool", tool: "saved" },
        location.origin,
      ),
    );
    await expect(page).toHaveURL(/\/$/);
    await overview
      .locator("body")
      .evaluate(() =>
        document.dispatchEvent(
          new CustomEvent("opsis:navigate", {
            detail: { type: "opsis:open-tool", tool: "https://example.com/" },
          }),
        ),
      );
    await expect(page).toHaveURL(/\/$/);
    await overview.locator("#public-entity").fill(TOKEN);
    await overview.locator("#public-search button").click();
    await expect(page).toHaveURL(new RegExp(`/research\\?entity=${TOKEN}$`));
    await expect(page.locator("#research-entity")).toHaveValue(TOKEN);
    expect(lookups).toBe(0);
    await page.getByRole("link", { name: "Back to overview" }).click();
    const scroll = await overview
      .locator("body")
      .evaluate(() => window.scrollY);
    expect(scroll).toBeGreaterThan(0);
    await overview
      .locator("#index-list button")
      .filter({ hasText: "Swap Lab" })
      .click();
    await expect(page).toHaveURL(/\/swap$/);
    await page.getByRole("link", { name: "Back to overview" }).click();
    await expect(overview.locator("#terminal")).not.toBeVisible();
    expect(
      await overview.locator("body").evaluate(() => window.scrollY),
    ).toBeGreaterThan(0);
    await overview.locator("#sidebar-toggle").focus();
    // WebKit opens the hover menu on keyboard focus; Chromium may wait for Enter.
    if (
      (await overview
        .locator("#sidebar-toggle")
        .getAttribute("aria-expanded")) === "false"
    )
      await overview.locator("#sidebar-toggle").press("Enter");
    await expect(overview.locator("#sidebar-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await overview.locator("#lock-preview").click();
    await expect(page.getByLabel("Preview access key")).toBeVisible();
    await expect(
      page.getByTitle("Opsis overview — interactive chain"),
    ).toHaveCount(0);
  });
  test("new screens have accessible keyboard controls and contrast in both themes", async ({
    page,
  }) => {
    await access(page);
    await unlock(page, "/research");
    for (const theme of ["dark", "light"]) {
      if (theme === "light")
        await page
          .getByRole("button", { name: "Light theme", exact: true })
          .click();
      const results = await new AxeBuilder({ page })
        .include(".opsis")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "BODY",
    );
  });
});
