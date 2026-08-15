import { expect, test } from "@playwright/test";

test("flag-off build redirects the direct developer route without an Open Data request", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/v1/public/open-data/**", async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/developers");
  await expect(page).toHaveURL(/\/guide#open-data-api$/);
  await expect(page.locator("#open-data-api")).toBeVisible();
  await expect(page.locator("#open-data-api").getByText("COMING SOON")).toBeVisible();
  expect(requests).toEqual([]);
});

test("production-default build keeps dormant Vault workspaces unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = "chainscout_onboarding_seen=1; path=/; SameSite=Lax";
  });
  await page.goto("/guide");
  for (const id of ["collectible-catalog", "market-inventory", "replay-actions", "open-data-api"]) {
    await expect(page.locator(`#${id}`).getByText("COMING SOON")).toHaveCount(1);
  }

  await page.goto("/vault?view=catalog");
  await expect(page).toHaveURL(/\/vault\?view=catalog$/);
  await expect(page.getByRole("heading", { name: /Your assets/i })).toBeVisible();
  await expect(page.getByLabel("Collectible Catalog is coming soon")).toBeVisible();
});
