import { test, expect } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const researchModule = "**/src/opsis/Research.tsx*";

test.describe("opsis preview code download recovery", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => { await mockPublicOpsisAccess(page); });

  test("opsis preview interrupted route download retries and renders without reloading", async ({ page }) => {
    let requests = 0;
    let documents = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
    });
    await page.route(researchModule, (route) => {
      requests++;
      return requests <= 2 ? route.abort("failed") : route.continue();
    });
    await page.goto("/research");
    await expect(page.getByRole("heading", { name: "What does the evidence show?", exact: true })).toBeVisible();
    expect(requests).toBe(3);
    expect(documents).toBe(1);
    await expect(page.getByRole("heading", { name: "This page did not finish loading", exact: true })).toHaveCount(0);
  });

  test("opsis preview persistent route failure reloads once and keeps the shell usable", async ({ page }) => {
    let documents = 0;
    let aborting = true;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
    });
    await page.route(researchModule, (route) => aborting ? route.abort("failed") : route.continue());
    await page.goto("/research");
    await expect.poll(() => documents).toBe(2);
    const heading = page.getByRole("heading", { name: "This page did not finish loading", exact: true });
    await expect(heading).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("alert")).toContainText("Nothing saved on this device was changed.");
    await expect(page.locator(".opsis-header")).toBeVisible();
    const reload = page.getByRole("button", { name: "Reload page", exact: true });
    await expect(reload).toBeVisible();
    expect(documents).toBe(2);
    // Observe longer than the entire retry schedule to detect an automatic loop.
    await page.waitForTimeout(2500);
    expect(documents).toBe(2);
    aborting = false;
    await reload.click();
    await expect(page.getByRole("heading", { name: "What does the evidence show?", exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(documents).toBe(3);
  });

  test("opsis preview preload errors prevent Vite throwing and use the guarded shell recovery", async ({ page }) => {
    let documents = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
    });
    await page.goto("/research");
    await expect(page.getByRole("button", { name: "Run research", exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    });
    await expect.poll(() => documents).toBe(2);
    await expect(page.getByRole("button", { name: "Run research", exact: true })).toBeVisible();
    const prevented = await page.evaluate(() => {
      const event = new Event("vite:preloadError", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(page.getByRole("heading", { name: "This page did not finish loading", exact: true })).toBeVisible();
    await expect(page.locator(".opsis-header")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(documents).toBe(2);
  });
});
