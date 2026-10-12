import { expect, test, type Page } from "@playwright/test";
import {
  watchFixture,
  WATCH_TEST_ADDRESS,
} from "../apps/web/src/watch/fixture";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
async function access(page: Page, path: string) {
  await page.route("**/v1/private/opsis/access", (route) =>
    route.fulfill({
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
  await page.goto(path);
  if (process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED !== "true") {
    await page.getByLabel("Preview access key").fill("a".repeat(64));
    await page
      .getByRole("button", { name: "Open preview", exact: true })
      .click();
  }
}

test("opsis preview watch one-off", async ({ page }) => {
  test.skip(!enabled);
  let requests = 0;
  await page.route("**/v1/private/watch/snapshot", (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({
      address: WATCH_TEST_ADDRESS,
    });
    return route.fulfill({ json: watchFixture() });
  });
  await access(page, "/watch");
  const form = page.getByRole("region", {
    name: "One-off public wallet check",
  });
  await expect(form).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.evaluate(() => {
    const changes: string[] = [];
    Object.assign(window, { watchStorageChanges: changes });
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      changes.push(`storage:${key}`);
      return set.call(this, key, value);
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      changes.push("indexedDB.open");
      return open(...args);
    };
  });
  await form
    .getByLabel("Public Robinhood wallet address")
    .fill(WATCH_TEST_ADDRESS);
  await expect(
    form.getByRole("button", { name: "Run a check", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Allow this public-address lookup").check();
  await form.getByRole("button", { name: "Run a check", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Public wallet snapshot", exact: true }),
  ).toContainText("1.000000000000000001 ETH");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { watchStorageChanges: string[] })
          .watchStorageChanges,
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Save to encrypted watchlist" })
    .click();
  await expect(
    page.getByLabel("Vault passphrase", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Vault passphrase", { exact: true })
    .fill("demo-watch-passphrase");
  await page
    .getByLabel("Confirm passphrase", { exact: true })
    .fill("demo-watch-passphrase");
  await page
    .getByRole("button", { name: "Create encrypted watchlist" })
    .click();
  await page.getByRole("button", { name: "I saved my recovery key" }).click();
  await page
    .getByRole("button", { name: "Save checked snapshot", exact: true })
    .click();
  await expect(
    page.getByText("Baseline saved. Refresh later to compare a newer block.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Lock watchlist" }).click();
  await page.reload();
  if (process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED !== "true") {
    await page.getByLabel("Preview access key").fill("a".repeat(64));
    await page
      .getByRole("button", { name: "Open preview", exact: true })
      .click();
  }
  await expect(
    page.getByRole("region", { name: "Public wallet snapshot", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open encrypted watchlist" }).click();
  await page
    .getByLabel("Vault passphrase", { exact: true })
    .fill("demo-watch-passphrase");
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  await expect(page.getByText(/Not checked since/).first()).toBeVisible();
  expect(requests).toBe(1);
});

test("opsis preview watch one-off provider error and Chinese copy", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.route("**/v1/private/watch/snapshot", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "SCOUT_WATCH_DISABLED" } },
    }),
  );
  await access(page, "/watch");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  const form = page.getByRole("region", { name: "单次公开钱包核查" });
  await form.getByRole("textbox").fill(WATCH_TEST_ADDRESS);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "运行核查", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "保存到加密观察列表" }),
  ).toHaveCount(0);
});

test("opsis preview lab view url", async ({ page }) => {
  test.skip(!enabled);
  const assets: string[] = [];
  page.on("request", (request) => {
    if (/earth.*\.(jpg|webp)/.test(request.url())) assets.push(request.url());
  });
  await access(page, "/lab?view=surface");
  const surface = page.getByRole("button", { name: /Portfolio surface/ });
  const atlas = page.getByRole("button", { name: /Pool atlas/ });
  const research = page.getByRole("button", { name: /Quant research/ });
  await expect(surface).toHaveAttribute("aria-pressed", "true");
  await research.click();
  await expect(page).toHaveURL(/view=research/);
  await expect(research).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page).toHaveURL(/view=surface/);
  await expect(surface).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(research).toHaveAttribute("aria-pressed", "true");
  await atlas.click();
  await expect(page).toHaveURL(/view=atlas/);
  await page.goto("/lab?view=invalid");
  await expect(atlas).toHaveAttribute("aria-pressed", "true");
  expect(assets).toEqual([]);
});
