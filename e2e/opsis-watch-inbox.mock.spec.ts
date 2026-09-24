import { expect, test } from "@playwright/test";
import {
  watchFixture,
  WATCH_TEST_ADDRESS,
  WATCH_TEST_TOKEN,
} from "../apps/web/src/watch/fixture";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const passphrase = "test-only-watch-inbox-passphrase",
  label = "PRIVATE-INBOX-CANARY";
test("Opsis Watch conditions and review state persist encrypted across refresh and reload", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(60000);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url() + (r.postData() ?? "")));
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
  let block = 100;
  await page.route("**/v1/private/watch/snapshot", (r) => {
    expect(r.request().postDataJSON()).toEqual({ address: WATCH_TEST_ADDRESS });
    return r.fulfill({ json: watchFixture(block++) });
  });
  await page.goto("/watch");
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm passphrase", { exact: true }).fill(passphrase);
  await page
    .getByRole("button", { name: "Create encrypted watchlist" })
    .click();
  await page.getByRole("button", { name: "I saved my recovery key" }).click();
  const form = page.getByRole("region", { name: "Add a wallet to watch" });
  await form
    .getByLabel("Public Robinhood wallet address")
    .fill(WATCH_TEST_ADDRESS);
  await form.getByLabel("Private label (optional)").fill(label);
  await form.getByLabel("Allow this public-address lookup").check();
  await form.getByRole("button", { name: "Save wallet & check" }).click();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page
    .getByLabel("Observed asset", { exact: true })
    .selectOption(WATCH_TEST_TOKEN);
  await page.getByLabel("Exact threshold", { exact: true }).fill("0.125");
  await page
    .getByRole("button", { name: "Save condition", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wallet details", exact: true })
    .click();
  const detail = page.getByRole("region", { name: "Latest saved check" });
  await detail.getByLabel("Allow this public-address lookup").check();
  await detail.getByRole("button", { name: "Refresh public data" }).click();
  await expect(page.getByRole("status")).toContainText("New check saved");
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  const conditionRow = page
    .getByRole("row")
    .filter({ hasText: "Saved condition met" });
  await expect(conditionRow).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  const conditionCard = page
    .locator("article")
    .filter({ hasText: "Saved condition met" });
  await expect(conditionCard).toBeVisible();
  await expect(conditionCard).toContainText("Changed");
  await expect(conditionCard).toContainText("Saved Watch snapshots");
  await expect(conditionCard).toContainText("Anchor");
  await expect(
    conditionCard.getByRole("link", { name: "Fresh trade check →" }),
  ).toHaveAttribute("href", `/check?entity=${WATCH_TEST_TOKEN}`);
  expect(
    await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await conditionCard
    .getByRole("button", { name: "Acknowledge", exact: true })
    .click();
  await expect(conditionCard).toHaveCount(0);
  await page.getByRole("button", { name: "Lock watchlist" }).click();
  await page.reload();
  await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  await page.getByRole("button", { name: /Show reviewed \/ snoozed/ }).click();
  await page
    .getByRole("button", { name: "Restore", exact: true })
    .first()
    .click();
  await expect(conditionCard).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove", exact: true }),
  ).toBeVisible();
  await conditionCard.getByRole("button", { name: "Snooze 1 day" }).click();
  await expect(conditionCard).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore", exact: true })
    .last()
    .click();
  await expect(conditionCard).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.locator("article").filter({ hasText: "已达到保存条件" }),
  ).toBeVisible();
  expect(block).toBe(102);
  expect(requests.join("\n")).not.toContain(label);
  expect(requests.join("\n")).not.toContain(passphrase);
  expect(requests.join("\n")).not.toContain("0.125");
});
