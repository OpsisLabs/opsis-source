import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
const publicAccess = process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const key = "a".repeat(64);

async function unlock(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) =>
    route.fulfill({
      json: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        chainId: 4663,
        research: true,
        exitCheck: false,
        watch: false,
        rwa: false,
        observedTrades: false,
        perpExecution: false,
      },
    }),
  );
  await page.goto("/community");
  if (!publicAccess) {
    await page.getByLabel("Preview access key").fill(key);
    await page.getByRole("button", { name: "Open preview", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Help shape what ships." })).toBeVisible();
}

test.describe("Opsis Community local intake", () => {
  test.skip(!enabled);

  test("saves and exports without posting, and clears on reload", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let postCount = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && !request.url().includes("/v1/private/opsis/access")) postCount++;
    });
    await unlock(page);
    await page.getByLabel("The task or question").fill("Compare two saved wallet checks");
    await page.getByLabel("What stopped you?").fill("The missing activity state was hard to understand");
    await page.getByLabel("Contact (optional)").fill("reader@example.com");
    await page.getByRole("button", { name: "Save local draft" }).click();
    await expect(page.getByRole("status")).toContainText("Saved for this session");
    expect(postCount).toBe(0);
    expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + document.cookie)).not.toContain("reader@example.com");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    expect((await download).suggestedFilename()).toBe("opsis-suggestion.json");
    expect(postCount).toBe(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Help shape what ships." })).toBeVisible();
    await expect(page.getByLabel("The task or question")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("switches the local Community surface to Chinese", async ({ page }) => {
    await unlock(page);
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByRole("heading", { name: "一起决定接下来做什么。" })).toBeVisible();
    await expect(page.getByText("基于证据的更新日志。", { exact: true })).toBeVisible();
  });
});
