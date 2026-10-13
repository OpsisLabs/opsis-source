import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
// The feature-preview script runs this file twice: with the defaults, and with
// search indexing and the example contact addresses switched on.
const configured = process.env.VITE_OPSIS_INDEXABLE === "true";
const SUPPORT = "support@opsis.example";
const SECURITY = "security@opsis.example";
const PLACEHOLDER = "A support and security contact is to be published on this page.";

async function mockAccess(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({ json: {
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663,
    research: true, exitCheck: false, watch: false, rwa: false,
    observedTrades: false, swapPreview: false, perpExecution: false,
  } }));
}
const robots = (page: Page) => page.locator('meta[name="robots"]');

test.describe("opsis preview launch settings", () => {
  test.skip(!enabled);

  test("opsis preview keeps every page out of search results and the contact unpublished by default", async ({ page }) => {
    test.skip(configured);
    await mockAccess(page);
    for (const path of ["/research", "/saved"]) {
      await page.goto(path);
      await expect(page.locator("#opsis-content h1").first()).toBeVisible();
      await expect(robots(page)).toHaveCount(1);
      await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
    }
    await page.goto("/privacy");
    await expect(page.getByText(PLACEHOLDER)).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
  });

  test("opsis preview lets only the listed public pages be indexed once indexing is switched on", async ({ page }) => {
    test.skip(!configured);
    await mockAccess(page);
    await page.goto("/research");
    await expect(page.locator("#opsis-content h1").first()).toBeVisible();
    await expect(robots(page)).toHaveCount(1);
    await expect(robots(page)).toHaveAttribute("content", "index, follow");
    await page.goto("/saved");
    await expect(page.locator("#opsis-content h1").first()).toBeVisible();
    await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
    // The directive follows in-app navigation, not only a fresh page load.
    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(robots(page)).toHaveAttribute("content", "index, follow");
    await page.goto("/no-such-page");
    await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
  });

  test("opsis preview shows the configured contact on Privacy in English and Chinese", async ({ page }) => {
    test.skip(!configured);
    await mockAccess(page);
    await page.goto("/privacy");
    await expect(page.getByRole("link", { name: SUPPORT, exact: true })).toHaveAttribute("href", `mailto:${SUPPORT}`);
    await expect(page.getByRole("link", { name: SECURITY, exact: true })).toHaveAttribute("href", `mailto:${SECURITY}`);
    await expect(page.getByText(PLACEHOLDER)).toHaveCount(0);
    await expect(page.getByText("Report security issues privately to")).toBeVisible();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByText("支持问题请联系")).toBeVisible();
    await expect(page.getByRole("link", { name: SUPPORT, exact: true })).toHaveAttribute("href", `mailto:${SUPPORT}`);
    await expect(page.getByRole("link", { name: SECURITY, exact: true })).toHaveAttribute("href", `mailto:${SECURITY}`);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(2);
  });
});
