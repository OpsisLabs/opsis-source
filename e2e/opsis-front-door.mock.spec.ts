import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
const publicAccess = process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const key = "a".repeat(64);
const frameSelector = 'iframe[src="/opsis-site/index.html"]';
const names = ["Research", "Trade Check", "Watch", "Stock-token check", "Quant Lab", "World & markets"];

// Match the existing Opsis public/private mock access flows; no provider calls.
async function openOverview(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({
    json: {
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      chainId: 4663, research: true, exitCheck: true, watch: true, rwa: true,
      observedTrades: true, swapPreview: false, perpExecution: false,
    },
  }));
  await page.goto("/");
  if (!publicAccess) {
    await page.getByLabel("Preview access key").fill(key);
    await page.getByRole("button", { name: "Open preview", exact: true }).click();
  }
  await expect(page.locator(frameSelector)).toBeVisible();
}

test("opsis preview front door", async ({ page }) => {
  test.skip(!enabled);
  await openOverview(page);
  const film = page.frameLocator(frameSelector);
  await expect(film.locator("#index-list strong")).toHaveText(names);
  await expect(film.locator(".module-label strong")).toHaveText(names);
  await expect(film.locator('[data-tool="swap"], [data-workspace="swap"]')).toHaveCount(0);
  await expect(film.getByRole("button", { name: /Swap preview/ })).toHaveCount(0);
  await expect(page.locator(frameSelector)).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator(frameSelector)).toHaveAttribute("tabindex", "0");
  // Observe both documents so even a transient blocking film dialog is caught.
  await film.locator("body").evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { frontDoorBlockingStates: seen });
    const sample = () => {
      if (document.querySelector('dialog[open], .particle-opening, .particle-closing')) seen.push("film dialog");
    };
    new MutationObserver(sample).observe(document.body, { attributes: true, childList: true, subtree: true });
    sample();
  });
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { frontDoorBlockingStates: seen });
    const sample = () => {
      for (const candidate of document.querySelectorAll('[role="status"], .loading-screen, .full-screen-loader')) {
        const rect = candidate.getBoundingClientRect();
        if (/loading/i.test(candidate.textContent ?? "") && rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.8)
          seen.push("full-screen loader");
      }
    };
    new MutationObserver(sample).observe(document.body, { attributes: true, childList: true, subtree: true });
    sample();
  });
  const research = film.locator('.topbar [data-workspace="research"]');
  await research.click();
  await expect(page.getByRole("button", { name: "Run research", exact: true })).toBeVisible({ timeout: 1000 });
  await expect(page).toHaveURL(/\/research$/);
  expect(await page.evaluate(() => Reflect.get(window, "frontDoorBlockingStates"))).toEqual([]);
  expect(await film.locator("body").evaluate(() => Reflect.get(window, "frontDoorBlockingStates"))).toEqual([]);
  await expect(page.locator(frameSelector)).toHaveAttribute("inert", "");
  await expect(page.locator(frameSelector)).toHaveAttribute("aria-hidden", "true");
  await page.locator(".opsis-topbar .opsis-logo").click();
  await expect(research).toBeFocused();
});

test("opsis preview front door Chinese shortcuts and reduced-motion poster", async ({ page }) => {
  test.skip(!enabled);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/opsis-site/assets/chain-points.bin", (route) => route.abort());
  await openOverview(page);
  const film = page.frameLocator(frameSelector);
  await expect(film.locator("body")).toHaveClass(/no-webgl/);
  await expect(film.locator("#poster")).toBeVisible();
  await film.locator('.topbar [data-workspace="research"]').click();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  // The wordmark returns to the front page (the old back bar is gone).
  await page.locator('.opsis-topbar a.opsis-logo').click();
  await expect(film.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(film.locator("#index-list strong")).toHaveText(["研究", "交易核查", "观察", "股票代币核查", "量化实验室", "世界与市场"]);
  const rail = film.locator("#sidebar-toggle");
  await rail.click();
  await film.locator('#rail-tools [data-tool="watch"]').focus();
  await film.locator('#rail-tools [data-tool="watch"]').press("Enter");
  await expect(page).toHaveURL(/\/watch$/);
  // The wordmark returns to the front page (the old back bar is gone).
  await page.locator('.opsis-topbar a.opsis-logo').click();
  await expect(film.locator('#rail-tools [data-tool="watch"]')).toBeFocused();
});
