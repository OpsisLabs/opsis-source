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
  await expect(page.getByText("BUILT · NOT ENABLED IN THIS BUILD")).toBeVisible();
  expect(requests).toEqual([]);
});
