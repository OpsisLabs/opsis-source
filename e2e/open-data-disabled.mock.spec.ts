import { expect, test } from "@playwright/test";

test("cloud-off build offers private tools without requesting a wallet signature", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/v1/auth/wallet/**", async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page.getByRole("status")).toContainText("Cloud research is coming in a future update");
    await expect(page.getByRole("button", { name: "CONNECT WALLET" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open local Vault" })).toBeVisible();
  }
  await page.getByRole("link", { name: "Open Research" }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(requests).toEqual([]);
});

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
    document.cookie = "opsis_onboarding_seen=1; path=/; SameSite=Lax";
  });
  await page.goto("/guide");
  for (const id of ["collectible-catalog", "market-inventory", "replay-actions", "open-data-api"]) {
    await expect(page.locator(`#${id}`).getByText("COMING SOON")).toHaveCount(1);
  }

  await page.goto("/vault?view=catalog");
  await expect(page).toHaveURL(/\/vault\?view=catalog$/);
  await expect(page.getByRole("heading", { name: /Your assets/i })).toBeVisible();
  await expect(page.getByLabel("Collectible Catalog is coming soon")).toBeHidden();
  await page.locator("[data-desktop-rail] summary").filter({ hasText: "Coming soon" }).click();
  await expect(page.getByLabel("Collectible Catalog is coming soon")).toBeVisible();
  await expect(page.getByRole("link", { name: /Collectible Catalog/ })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByText(/Assisted TCGdex card\/set matching is coming soon/i)).toBeVisible();
  await expect(page.getByText("TCGdex-assisted collectible identity", { exact: true })).toBeVisible();
});
