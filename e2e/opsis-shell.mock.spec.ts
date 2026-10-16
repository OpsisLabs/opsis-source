import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixture, research } from "../apps/web/src/opsis/test-fixtures";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
const publicAccess = process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const token = fixture().input.contract;
const key = "a".repeat(64);

// Same access/analysis/quote fixtures and request assertions as opsis.mock.spec.
async function access(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) => {
    expect(route.request().headers().authorization).toBe(publicAccess ? undefined : `Preview ${key}`);
    expect(route.request().postDataJSON()).toEqual({});
    return route.fulfill({ json: {
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663,
      research: true, exitCheck: true, watch: true, rwa: false,
      observedTrades: false, swapPreview: false, perpExecution: false,
    } });
  });
}
async function enter(page: Page, path?: string) {
  if (path) await page.goto(path);
  if (!publicAccess) {
    await page.getByLabel("Preview access key").fill(key);
    await page.getByRole("button", { name: "Open preview", exact: true }).click();
  }
  await expect(page.getByRole("navigation", { name: "Workspaces", exact: true })).toBeVisible();
}
function workspace(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Workspaces", exact: true }).getByRole("link", { name, exact: true });
}
async function contentTop(page: Page) {
  return page.locator("#opsis-content").evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
}

test("opsis preview shell navigation", async ({ page }) => {
  test.skip(!enabled || process.env.VITE_EXIT_CHECK_ENABLED !== "true" || process.env.VITE_WATCH_ENABLED !== "true");
  await page.emulateMedia({ colorScheme: "light" });
  await access(page);
  let analyses = 0;
  await page.route("**/v1/private/analyze", (route) => {
    analyses++;
    expect(route.request().postDataJSON().entity).toBe(token);
    return route.fulfill({ json: research() });
  });
  await page.route("**/v1/private/exit-check/quote", (route) => {
    expect(route.request().postDataJSON().amount).toBe("1.5");
    return route.fulfill({ json: fixture() });
  });
  let releaseChunk!: () => void;
  const blockedChunk = new Promise<void>((resolve) => { releaseChunk = resolve; });
  const tradeChunk = /\/(?:src\/opsis\/TradeCheck\.tsx|assets\/TradeCheck-[^/]+\.js)(?:\?.*)?$/;
  await page.route(tradeChunk, async (route) => { await blockedChunk; await route.continue(); });
  await enter(page, "/research");
  await expect(page.locator("#research-entity")).toBeVisible();
  await page.locator("#research-entity").fill(token);
  await page.getByRole("button", { name: "Run research", exact: true }).click();
  await expect(page.getByTestId("opsis-research-result")).toContainText("Fixture observation");
  await expect(page).toHaveURL(new RegExp(`/research\\?entity=${token}$`));
  await expect(page).toHaveTitle("Opsis · Research");
  const researchTop = await contentTop(page);
  const researchHeaderHeight = (await page.locator(".opsis-header").boundingBox())!.height;
  await expect(page.locator(".opsis-desktop-rail .opsis-tool-rail section")).toHaveCount(4);

  await workspace(page, "Trade Check").click();
  await expect(page.getByTestId("opsis-navigation-progress")).toHaveAttribute("data-pending", "true");
  await expect(page.getByTestId("opsis-navigation-progress").locator("[aria-live=polite]")).toHaveText("Loading Trade Check…");
  await expect(page.getByTestId("opsis-research-result")).toBeVisible();
  await expect(page.getByText("Loading page", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Loading workspace…", { exact: true })).toHaveCount(0);
  releaseChunk();
  await expect(page.locator("#check-token")).toBeVisible();
  await expect(page.getByTestId("opsis-navigation-progress")).toHaveAttribute("data-pending", "false");
  await expect(page).toHaveTitle("Opsis · Trade Check");
  await expect(page.locator("#opsis-content h1").first()).toBeFocused();
  await page.locator("#check-token").fill(token);
  await page.getByLabel("Amount to check", { exact: true }).fill("1.5");
  await page.getByRole("button", { name: "Run a check", exact: true }).click();
  await expect(page.getByTestId("opsis-quote")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/check\\?token=${token}$`));
  await page.getByText("More trade tools", { exact: true }).click();
  await expect(page.locator('a[href="/swap"], a[href="/simulate"]')).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/research\\?entity=${token}$`));
  await expect(page.getByTestId("opsis-research-result")).toBeVisible();
  expect(analyses).toBe(1);
  await workspace(page, "Watch").click();
  await expect(page).toHaveURL(/\/watch$/);
  await expect(page.locator(".opsis-tool-workspace")).toBeVisible();
  expect(await contentTop(page)).toBe(researchTop);
  expect((await page.locator(".opsis-header").boundingBox())!.height).toBe(researchHeaderHeight);
  await expect(workspace(page, "Watch")).toHaveAttribute("aria-current", "page");
  await workspace(page, "Trade Check").click();
  await expect(page.getByTestId("opsis-quote")).toBeVisible();
  await expect(page.getByLabel("Amount to check", { exact: true })).toHaveValue("1.5");
  await workspace(page, "Research").click();
  await expect(page).toHaveURL(new RegExp(`/research\\?entity=${token}$`));
  await expect(page.getByTestId("opsis-research-result")).toBeVisible();

  const lightBackground = await page.locator("#opsis-content").evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "Theme: Light", exact: true }).click();
  await expect(page.getByRole("button", { name: "Theme: Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#opsis-content").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
  await page.reload();
  await enter(page);
  await expect(page).toHaveURL(new RegExp(`/research\\?entity=${token}$`));
  await expect(page.locator("#research-entity")).toHaveValue(token);
  await expect(page.locator(".opsis-receipt").first()).toBeVisible();
  await expect(page.getByTestId("opsis-research-result")).toHaveCount(0);
  expect(analyses).toBe(1);
  await expect(page.locator(".opsis")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Theme: Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Research", "Trade Check", "Watch", "Quant Lab"]) {
    await workspace(page, name).click();
    await expect(page.locator('a[href="/swap"], a[href="/simulate"]')).toHaveCount(0);
  }
  await workspace(page, "Research").click();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page).toHaveTitle("Opsis · 研究");
  await expect(page.getByRole("button", { name: "主题：深色", exact: true })).toBeVisible();
  await page.locator(".opsis-topbar .opsis-logo").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("iframe.opsis-original-film")).toBeFocused();
});

test("opsis preview shell theme contrast and unavailable-route recovery", async ({ page }) => {
  test.skip(!enabled);
  await access(page);
  await page.emulateMedia({ colorScheme: "light" });
  await enter(page, "/research");
  for (const theme of ["light", "dark"]) {
    await expect(page.locator(".opsis")).toHaveAttribute("data-theme", theme);
    const results = await new AxeBuilder({ page }).include(".opsis").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations).toEqual([]);
    if (theme === "light") await page.getByRole("button", { name: "Theme: Light", exact: true }).click();
  }
  await enter(page, "/missing-tool");
  await expect(page).toHaveTitle("Opsis · Not found");
  await expect(page.getByRole("link", { name: "Open Research", exact: true })).toBeVisible();
  await expect(page.locator("#opsis-content").getByRole("link", { name: "Find your tool", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open Research", exact: true }).click();
  await expect(page.locator("#research-entity")).toBeVisible();
});
