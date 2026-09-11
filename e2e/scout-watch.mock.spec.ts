import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_ORIGIN } from "./support/origin";
import {
  watchFixture,
  WATCH_TEST_ADDRESS,
} from "../apps/web/src/watch/fixture";

const passphrase = "test-only-watch-passphrase";
const label = "PRIVATE-WATCH-LABEL-私密";
const enabled = process.env.VITE_SCOUT_WATCH_ENABLED === "true";

test("scout watch combined feed filters locally, deduplicates and clears on lock", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const bodies: unknown[] = [];
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const value = watchFixture(101);
    value.address = body.address;
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page, WATCH_TEST_ADDRESS, "Wallet Alpha");
  await add(page, `0x${"2".repeat(40)}`, "Wallet Beta");
  await page
    .getByRole("button", { name: "Activity feed", exact: true })
    .click();
  const feed = page.getByRole("region", {
    name: "All your wallets. One view.",
  });
  await expect(
    feed.getByRole("link", { name: /Open transaction evidence/ }),
  ).toHaveCount(2);
  await expect(feed.getByText("2 wallet view(s)").first()).toBeVisible();
  await feed.getByLabel("Filter by asset type").selectOption("native");
  await expect(
    feed.getByRole("link", { name: /Open transaction evidence/ }),
  ).toHaveCount(1);
  await feed
    .getByLabel("Filter by wallet")
    .selectOption({ label: "Wallet Alpha" });
  await expect(feed.getByText("1 wallet view(s)")).toBeVisible();
  await feed.getByLabel("Search token, contract or transaction").fill("absent");
  await expect(
    feed.getByText("Nothing to show in this view yet."),
  ).toBeVisible();
  await feed.getByRole("button", { name: "Clear filters" }).click();
  await feed
    .getByRole("button", { name: /Wallet Beta/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Wallet Beta", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Activity feed", exact: true })
    .click();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(
    a11y.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Switch language to 简体中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "所有钱包，一目了然。" }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page
    .getByRole("button", { name: "切换语言为English", exact: true })
    .filter({ visible: true })
    .click();
  expect(bodies).toEqual([
    { address: WATCH_TEST_ADDRESS },
    { address: `0x${"2".repeat(40)}` },
  ]);
  await page.getByRole("button", { name: "Lock watchlist" }).click();
  await expect(page.getByText("Wallet Alpha", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "All your wallets. One view." }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  await page
    .getByRole("button", { name: "Activity feed", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "All your wallets. One view." })
      .getByRole("link", { name: /Open transaction evidence/ }),
  ).toHaveCount(2);
  expect(bodies).toHaveLength(2);
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "chainscout_product_tour_seen_v1", value: "1", url: APP_ORIGIN },
  ]);
});
async function create(page: Page) {
  await page.goto("/watch");
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm passphrase", { exact: true }).fill(passphrase);
  await page
    .getByRole("button", { name: "Create encrypted watchlist" })
    .click();
  await page.getByRole("button", { name: "I saved my recovery key" }).click();
}
async function add(page: Page, address = WATCH_TEST_ADDRESS, name = label) {
  const form = page.getByRole("region", { name: "Add a wallet to watch" });
  if (!(await form.getByLabel("Public Robinhood wallet address").isVisible()))
    await form.locator("summary").click();
  await form.getByLabel("Public Robinhood wallet address").fill(address);
  await form.getByLabel("Private label (optional)").fill(name);
  await form.getByLabel("Allow this public-address lookup").check();
  await form.getByRole("button", { name: "Save wallet & check" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}
async function refresh(page: Page) {
  const detail = page.getByRole("region", { name: "Latest saved check" });
  await detail.getByLabel("Allow this public-address lookup").check();
  await detail.getByRole("button", { name: "Refresh public data" }).click();
}
test("scout watch closed by default does not mount a Vault or call data providers", async ({
  page,
}) => {
  test.skip(enabled);
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/v1/private/watch")) requests.push(req.url());
  });
  await page.goto("/watch");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("button", { name: "Create encrypted watchlist" }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
});
test("scout watch saves, compares, persists, exports and removes without private-data uploads", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const bodies: unknown[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let block = 100;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    bodies.push(route.request().postDataJSON());
    expect(route.request().headers().cookie).toBeUndefined();
    await route.fulfill({ json: watchFixture(block++) });
  });
  await create(page);
  expect(bodies).toEqual([]);
  await add(page);
  await expect(
    page.getByRole("heading", { name: "Baseline saved" }),
  ).toBeVisible();
  await refresh(page);
  await expect(
    page.getByRole("heading", { name: "What changed?" }),
  ).toBeVisible();
  const comparison = page.getByRole("region", { name: "Balance comparison" });
  await expect(comparison.getByText("+3", { exact: true })).toBeVisible();
  await expect(comparison.getByText("-0.1", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Newly observed activity" })
      .getByText("Outgoing", { exact: false })
      .first(),
  ).toBeVisible();
  expect(bodies).toEqual([
    { address: WATCH_TEST_ADDRESS },
    { address: WATCH_TEST_ADDRESS },
  ]);
  // The serialized local store must not contain labels, addresses, or snapshots.
  const stored = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const records: unknown[] = [];
    for (const entry of dbs) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(entry.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const name of Array.from(db.objectStoreNames))
        records.push(
          await new Promise((resolve, reject) => {
            const request = db.transaction(name).objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
        );
      db.close();
    }
    return JSON.stringify(records);
  });
  expect(stored).not.toContain(label);
  expect(stored).not.toContain(WATCH_TEST_ADDRESS);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export encrypted backup" }).click();
  expect((await download).suggestedFilename()).toContain("encrypted-vault");
  await page.getByRole("button", { name: "Lock watchlist" }).click();
  await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  await expect(
    page.getByRole("heading", { name: "What changed?" }),
  ).toBeVisible();
  expect(bodies).toHaveLength(2);
  await page
    .getByText("Rename locally / Remove wallet", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Yes, remove wallet" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Start with one wallet you want to keep an eye on.",
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("scout watch preserves its last good check on provider failure, wrong-address response and same block", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let mode = "good";
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    if (mode === "failure")
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "PROVIDER_ERROR",
            message: "Provider temporarily unavailable",
          },
        },
      });
    const value = watchFixture();
    if (mode === "wrong") value.address = `0x${"2".repeat(40)}`;
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page);
  for (const value of ["failure", "wrong", "same"]) {
    mode = value;
    await refresh(page);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Baseline saved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What changed?" }),
    ).toHaveCount(0);
  }
});
test("scout watch distinguishes missing holdings and supports Chinese/mobile/keyboard accessibility", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let count = 0;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const value = watchFixture(count++ ? 101 : 100);
    if (count > 1) {
      value.tokens = [];
      value.reconciliation.degradedSources = ["Token provider unavailable"];
    }
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page);
  await refresh(page);
  await expect(
    page.getByText("Not returned—not a confirmed exit"),
  ).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(
    a11y.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Switch language to 简体中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "有什么变化？" }),
  ).toBeVisible();
  await expect(page.getByText("未返回，不代表已确认卖出")).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `overflow ${width}`,
    ).toBeLessThanOrEqual(1);
  }
  if (process.env.CHAINSCOUT_WATCH_SHOT)
    await page.screenshot({
      path: process.env.CHAINSCOUT_WATCH_SHOT,
      fullPage: true,
    });
  expect(count).toBe(2);
});
test("scout watch cancels delayed refreshes on lock and locks on another tab's update", async ({
  page,
  context,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let count = 0,
    finish: (() => void) | undefined;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    if (count++)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    await route
      .fulfill({ json: watchFixture(count === 1 ? 100 : 101) })
      .catch(() => undefined);
  });
  await create(page);
  await add(page);
  await refresh(page);
  await expect.poll(() => count).toBe(2);
  await page.getByRole("button", { name: "Lock watchlist" }).click();
  finish?.();
  await expect(page.getByRole("heading", { name: label })).toHaveCount(0);
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  await expect(
    page.getByRole("heading", { name: "Baseline saved" }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto("/guide");
  await other.evaluate(() => {
    const bus = new BroadcastChannel("chainscout-vault-control-v1");
    bus.postMessage({ event: "changed" });
    bus.close();
  });
  await expect(
    page.getByRole("button", { name: "Unlock watchlist" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: label })).toHaveCount(0);
});

test("scout watch rejects transaction hashes, supports multiple wallets and retains only three checks", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let block = 100;
  const bodies: unknown[] = [];
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    await route.fulfill({
      json: { ...watchFixture(block++), address: body.address },
    });
  });
  await create(page);
  const form = page.getByRole("region", { name: "Add a wallet to watch" });
  await form
    .getByLabel("Public Robinhood wallet address")
    .fill(`0x${"a".repeat(64)}`);
  await form.getByLabel("Allow this public-address lookup").check();
  await form.getByRole("button", { name: "Save wallet & check" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a valid 0x wallet address",
  );
  expect(bodies).toEqual([]);
  await add(page);
  for (let i = 0; i < 3; i++) {
    await refresh(page);
    await expect(page.getByRole("status")).toContainText("New check saved");
  }
  const choices = page.getByLabel("Compare latest with");
  await expect(choices.locator("option")).toHaveCount(2);
  await expect(choices.locator("option").first()).toContainText("Block 101");
  await choices.selectOption("0");
  await expect(
    page.getByRole("region", { name: "Balance comparison" }),
  ).toBeVisible();
  const otherAddress = `0x${"2".repeat(40)}`;
  await add(page, otherAddress, "Second public wallet");
  await expect(
    page
      .getByRole("navigation", { name: "Your watchlist" })
      .getByRole("button"),
  ).toHaveCount(2);
  await page
    .getByRole("navigation", { name: "Your watchlist" })
    .getByRole("button", { name: new RegExp(label) })
    .click();
  await page
    .getByText("Rename locally / Remove wallet", { exact: true })
    .click();
  await page
    .getByLabel("Private wallet label", { exact: true })
    .fill("Renamed privately");
  const beforeRename = bodies.length;
  await page
    .getByRole("button", { name: "Rename locally", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Renamed privately" }),
  ).toBeVisible();
  expect(bodies).toHaveLength(beforeRename);
  await page
    .getByRole("button", { name: "Remove wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Yes, remove wallet" }).click();
  await expect(
    page.getByRole("heading", { name: "Second public wallet" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Your watchlist" })
      .getByRole("button"),
  ).toHaveCount(1);
});
