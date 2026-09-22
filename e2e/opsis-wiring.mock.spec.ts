import { test, expect, type Page } from "@playwright/test";
import { fixture, research } from "../apps/web/src/opsis/test-fixtures";
import {
  watchFixture,
  WATCH_TEST_ADDRESS,
  WATCH_TEST_TOKEN,
} from "../apps/web/src/watch/fixture";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const TOKEN = fixture().input.contract;
const passphrase = "test-only-opsis-reports-passphrase";
const note = "PRIVATE-OPSIS-CONDITION-CANARY";
async function unlockReports(page: Page) {
  await page.getByLabel("History Vault passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(
    page.getByRole("button", { name: "Lock history" }),
  ).toBeVisible();
}
test.describe("Opsis connected workflows", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await page.route("**/v1/private/opsis/access", (r) =>
      r.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: true,
          exitCheck: true,
          watch: true,
          rwa: false,
          observedTrades: false,
          perpExecution: false,
        },
      }),
    );
  });
  test("saves research and checks encrypted, reopens only identity, and clears on lock", async ({
    page,
  }) => {
    test.setTimeout(45000);
    const bodies: string[] = [];
    page.on("request", (r) => bodies.push(r.url() + (r.postData() ?? "")));
    let analyses = 0,
      quotes = 0;
    await page.route("**/v1/private/analyze", (r) => {
      analyses++;
      return r.fulfill({ json: research() });
    });
    await page.route("**/v1/private/exit-check/quote", (r) => {
      quotes++;
      return r.fulfill({ json: fixture() });
    });
    await page.goto("/saved");
    await page.getByLabel("VAULT PASSPHRASE", { exact: true }).fill(passphrase);
    await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
    await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
    await page.getByRole("button", { name: /I SAVED IT/i }).click();
    await page.getByRole("link", { name: "Research", exact: true }).click();
    await page.locator("#research-entity").fill(TOKEN);
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    await expect(page.getByTestId("opsis-research-result")).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Save research / open saved reports" })
      .click();
    await unlockReports(page);
    await page
      .getByLabel("Notes or conditions to revisit (optional)")
      .fill(note);
    await page
      .getByRole("button", { name: "Save observation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saved on this device" }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Open saved reports" }).click();
    await expect(page.getByText(note, { exact: false })).toHaveCount(0);
    await unlockReports(page);
    await page.getByRole("button", { name: /^Fixture Token/ }).click();
    await expect(
      page.getByText(`My notes / conditions: ${note}`, { exact: true }),
    ).toBeVisible();
    const fresh = page.getByRole("link", { name: "Run a new trade check" });
    await expect(fresh).toHaveAttribute("href", `/check?entity=${TOKEN}`);
    await fresh.click();
    await expect(page.getByLabel("Amount to check")).toHaveValue("");
    expect(quotes).toBe(0);
    await page.getByLabel("Amount to check").fill("1.5");
    await page
      .getByRole("button", { name: "Run a check", exact: true })
      .click();
    await expect(page.getByTestId("opsis-quote")).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Save this check / revisit conditions" })
      .click();
    await unlockReports(page);
    await page
      .getByRole("button", { name: "Save observation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saved on this device" }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Open saved reports" }).click();
    await page.reload();
    await unlockReports(page);
    await page
      .getByRole("button", { name: /^Trade Check · Robinhood Chain/ })
      .click();
    await expect(page.getByText(/Original expiry:/)).toContainText(
      "request a new quote",
    );
    await expect(page.getByText(/1.5 tokens →/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "output/opsis-wiring/saved-mobile.png",
      fullPage: true,
    });
    expect(
      await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    const encrypted = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const req = indexedDB.open("chainscout-private-vault");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const r = db.transaction("records").objectStore("records").getAll();
            r.onsuccess = () => {
              resolve(JSON.stringify(r.result));
              db.close();
            };
            r.onerror = () => reject(r.error);
          };
        }),
    );
    for (const value of [note, passphrase, "1.5 tokens", "Fixture observation"])
      expect(encrypted).not.toContain(value);
    expect(bodies.join("\n")).not.toContain(note);
    expect(bodies.join("\n")).not.toContain(passphrase);
    expect(analyses).toBe(1);
    expect(quotes).toBe(1);
    await page.getByRole("button", { name: "Lock history" }).click();
    await expect(page.getByText(/1.5 tokens →/)).toHaveCount(0);
    await page.getByLabel("History Vault passphrase").fill("wrong-password");
    await page.getByRole("button", { name: "Unlock report history" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/1.5 tokens →/)).toHaveCount(0);
  });
  test("Watch changes reopen a token check without sending balances or labels", async ({
    page,
  }) => {
    let count = 0,
      quotes = 0;
    await page.route("**/v1/private/watch/snapshot", (r) => {
      count++;
      return r.fulfill({ json: watchFixture(99 + count) });
    });
    await page.route("**/v1/private/exit-check/quote", (r) => {
      quotes++;
      return r.abort();
    });
    await page.goto("/watch");
    await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
    await page
      .getByLabel("Confirm passphrase", { exact: true })
      .fill(passphrase);
    await page
      .getByRole("button", { name: "Create encrypted watchlist" })
      .click();
    await page.getByRole("button", { name: "I saved my recovery key" }).click();
    const add = page.getByRole("region", { name: "Add a wallet to watch" });
    if (!(await add.getByLabel("Public Robinhood wallet address").isVisible()))
      await add.locator("summary").click();
    await add
      .getByLabel("Public Robinhood wallet address")
      .fill(WATCH_TEST_ADDRESS);
    await add.getByLabel("Private label (optional)").fill(note);
    await add.getByLabel("Allow this public-address lookup").check();
    await add.getByRole("button", { name: "Save wallet & check" }).click();
    const detail = page.getByRole("region", { name: "Latest saved check" });
    await expect(page.getByRole("heading", { name: note })).toBeVisible();
    await detail.getByLabel("Allow this public-address lookup").check();
    await detail.getByRole("button", { name: "Refresh public data" }).click();
    const link = page.getByRole("link", { name: "Check a new amount" }).first();
    await expect(link).toHaveAttribute(
      "href",
      `/check?entity=${WATCH_TEST_TOKEN}`,
    );
    await link.click();
    await expect(page.getByLabel("Token contract · chain 4663")).toHaveValue(
      WATCH_TEST_TOKEN,
    );
    await expect(page.getByLabel("Amount to check")).toHaveValue("");
    expect(quotes).toBe(0);
  });
  test("legacy routing, no-vault setup, and provider failures remain explicit", async ({
    page,
  }) => {
    await page.goto("/vault?view=portfolio&note=private&amount=99");
    await expect(page).toHaveURL(/\/saved\?view=portfolio$/);
    await page.goto(`/research?entity=${TOKEN}`);
    await page
      .locator("summary")
      .filter({ hasText: "Save research / open saved reports" })
      .click();
    await expect(
      page.getByRole("link", {
        name: "Create encrypted Vault to save reports",
      }),
    ).toBeVisible();
    await page.route("**/v1/private/analyze", (r) =>
      r.fulfill({
        status: 503,
        json: { error: { code: "PROVIDER_UNAVAILABLE" } },
      }),
    );
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Research unavailable");
    await expect(
      page.getByRole("button", { name: "Save observation", exact: true }),
    ).toHaveCount(0);
    await page
      .locator("summary")
      .filter({ hasText: "More research tools" })
      .click();
    await page
      .getByRole("link", { name: "Detailed Explorer", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/research/details\\?entity=${TOKEN}$`),
    );
  });
});
