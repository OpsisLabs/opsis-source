import { expect, test } from "@playwright/test";
test("private preview needs access, never persists its key and closes cleanly", async ({ page }) => {
  const key = "a".repeat(64);
  await page.route("**/v1/private/deals/access", async route => {
    expect(route.request().headers().authorization).toBe("Preview " + key);
    expect(route.request().headers().cookie).toBeUndefined();
    await route.fulfill({ json: { expiresAt: new Date(Date.now() + 60000).toISOString() } });
  });
  await page.goto("/_preview/deals");
  await expect(page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" })).toHaveCount(0);
  await page.getByLabel("Preview access key").fill(key);
  await page.getByRole("button", { name: "Open private preview" }).click();
  await page.getByLabel("VAULT PASSPHRASE", { exact: true }).fill("synthetic preview vault only");
  await page.getByLabel("CONFIRM PASSPHRASE").fill("synthetic preview vault only");
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await expect(page.getByRole("region", { name: "Free card price references" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))).not.toContain(key);
  await page.getByRole("button", { name: "Close private preview" }).click();
  await expect(page.getByRole("region", { name: "Free card price references" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Preview access key")).toHaveValue("");
});
test("invalid preview access never mounts a Vault", async ({ page }) => {
  await page.route("**/v1/private/deals/access", route => route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Preview unavailable" } } }));
  await page.goto("/_preview/deals");
  await page.getByLabel("Preview access key").fill("b".repeat(64));
  await page.getByRole("button", { name: "Open private preview" }).click();
  await expect(page.getByRole("alert")).toHaveText("Preview unavailable or access key invalid.");
  await expect(page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" })).toHaveCount(0);
});
