import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_ORIGIN } from "./support/origin";
import {
  watchFixture,
  WATCH_TEST_ADDRESS,
  WATCH_TEST_TOKEN,
} from "../apps/web/src/watch/fixture";

const passphrase = "test-only-watch-passphrase";
const label = "PRIVATE-WATCH-LABEL-私密";
const enabled = process.env.VITE_SCOUT_WATCH_ENABLED === "true";

test("scout watch overlap selects exact saved holdings, filters locally and persists securely", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const bodies: unknown[] = [];
  const counts = new Map<string, number>();
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const block = 100 + (counts.get(body.address) ?? 0);
    counts.set(body.address, block - 99);
    const value = watchFixture(block);
    value.address = body.address;
    await route.fulfill({ json: value });
  });
  await create(page);
  await page
    .getByRole("button", { name: "Wallet overlap", exact: true })
    .click();
  await expect(
    page.getByText("Choose at least two saved wallets."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wallet details", exact: true })
    .click();
  await add(page, WATCH_TEST_ADDRESS, "Wallet Alpha");
  await refresh(page);
  await expect(page.getByRole("status")).toContainText("New check saved");
  await add(page, `0x${"2".repeat(40)}`, "Wallet Beta");
  await page
    .getByRole("button", { name: "Wallet overlap", exact: true })
    .click();
  const area = page.getByRole("region", {
    name: "What do your wallets have in common?",
  });
  await expect(area.getByText("2 of 2 selected wallets")).toBeVisible();
  await expect(area.getByText("+3", { exact: true })).toBeVisible();
  const choices = area.getByRole("group", {
    name: "Choose wallets to compare",
  });
  await choices.getByLabel(/Wallet Beta/).uncheck();
  await expect(
    area.getByText("Choose at least two saved wallets."),
  ).toBeVisible();
  await area.getByRole("button", { name: "Select all wallets" }).click();
  await area
    .getByLabel("Search shared token or exact contract")
    .fill("not-an-asset");
  await expect(
    area.getByText("No shared tokens found in these checks."),
  ).toBeVisible();
  await area.getByLabel("Search shared token or exact contract").fill("0x3333");
  await expect(area.getByText("2 of 2 selected wallets")).toBeVisible();
  expect(bodies).toHaveLength(3);
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
    page.getByRole("heading", { name: "关注的钱包持有哪些相同代币？" }),
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
  await area.getByRole("button", { name: /Wallet Alpha/ }).click();
  await expect(
    page.getByRole("heading", { name: "Wallet Alpha", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock watchlist" }).click();
  await page.reload();
  await expect(page.getByText("Wallet Alpha", { exact: true })).toHaveCount(0);
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  await page
    .getByRole("button", { name: "Wallet overlap", exact: true })
    .click();
  await expect(area.getByText("2 of 2 selected wallets")).toBeVisible();
  expect(bodies).toHaveLength(3);
});

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
  // Axe reads colours in separate passes. Let the real tab colour transitions
  // finish first so it measures the settled state, not mismatched animation frames.
  await page
    .getByRole("group", { name: "Watch views" })
    .evaluate(async (tabs) => {
      await Promise.all(
        tabs
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
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
test("scout watch prefills a handed-off public address without auto lookup or consent", async ({
  page,
}) => {
  test.skip(!enabled);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/private/watch")) requests.push(request.url());
  });
  await page.route("**/v1/private/watch/snapshot", (route) =>
    route.fulfill({ json: watchFixture(100) }),
  );
  await create(page);
  await add(page, WATCH_TEST_ADDRESS, "Existing wallet");
  const afterExisting = requests.length;
  // An existing watchlist keeps the add form collapsed by default; a valid
  // handoff must still open it and show the prefill after unlock.
  await page.goto(`/watch?address=${`0x${"2".repeat(40)}`}`);
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock watchlist" }).click();
  const form = page.getByRole("region", { name: "Add a wallet to watch" });
  await expect(form.getByLabel("Public Robinhood wallet address")).toHaveValue(
    `0x${"2".repeat(40)}`,
  );
  await expect(
    form.getByLabel("Allow this public-address lookup"),
  ).not.toBeChecked();
  expect(requests).toHaveLength(afterExisting);
});
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

test("scout watch briefing summarizes saved changes, filters locally and drills into wallet detail", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const bodies: unknown[] = [];
  const counts = new Map<string, number>();
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const block = 100 + (counts.get(body.address) ?? 0);
    counts.set(body.address, block - 99);
    const value = watchFixture(block);
    value.address = body.address;
    value.tokens.push({
      kind: "erc20",
      contract: `0x${"4".repeat(40)}`,
      name: "Second token",
      symbol: "SEC",
      decimals: 6,
      quantity: block === 100 ? "1" : "2",
      rawBalance: block === 100 ? "1000000" : "2000000",
      sourceIds: ["rpc"],
    });
    await route.fulfill({ json: value });
  });
  await create(page);
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  await expect(
    briefing.getByRole("button", { name: "Add a wallet above" }),
  ).toBeVisible();
  await add(page, WATCH_TEST_ADDRESS, "Wallet Alpha");
  await expect(
    briefing.getByRole("heading", { name: "Not enough saved data to compare" }),
  ).toBeVisible();
  await refresh(page);
  await expect(
    briefing.getByText("ETH balance decreased by 0.1 between the two checks"),
  ).toBeVisible();
  await expect(
    briefing.getByText("TEST balance increased by 3 between the two checks"),
  ).toBeVisible();
  await briefing
    .getByRole("button", { name: "View all changes (4)" })
    .click();
  await expect(
    briefing.getByText(
      "A successful transaction was newly observed after the previous saved check",
    ),
  ).toBeVisible();
  const requests = bodies.length;
  await briefing
    .getByLabel("Briefing wallet filter")
    .selectOption({ label: "Wallet Alpha" });
  await expect(
    briefing.getByText("TEST balance increased by 3 between the two checks"),
  ).toBeVisible();
  await briefing
    .getByText("Evidence detail", { exact: true })
    .first()
    .click();
  await expect(briefing.getByText("Why this row exists").first()).toBeVisible();
  await briefing
    .getByRole("button", { name: "Open wallet detail" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Wallet Alpha", exact: true }),
  ).toBeVisible();
  expect(bodies).toHaveLength(requests);
});

test("scout watch briefing keeps gaps, failed and older evidence explicit", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let count = 0;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    const value = watchFixture(count++ ? 101 : 100);
    value.address = body.address;
    if (count > 1) {
      value.reconciliation.degradedSources = ["Token discovery unavailable"];
      value.transactions.push({
        hash: `0x${"d".repeat(64)}`,
        blockNumber: 101,
        timestamp: value.anchor.timestamp,
        status: "failed",
        method: "transfer",
        direction: "out",
        counterparty: WATCH_TEST_TOKEN,
        nativeValueEth: "0",
        movementCount: 0,
        movementCoverage: "partial",
        sourceIds: ["rpc"],
      });
      value.transactions.push({
        hash: `0x${"e".repeat(64)}`,
        blockNumber: 98,
        timestamp: value.anchor.timestamp,
        status: "success",
        method: "transfer",
        direction: "in",
        counterparty: WATCH_TEST_TOKEN,
        nativeValueEth: "0",
        movementCount: 0,
        movementCoverage: "complete",
        sourceIds: ["rpc"],
      });
    }
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page);
  await refresh(page);
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  await expect(
    briefing.getByText("Token discovery unavailable"),
  ).toBeVisible();
  await briefing.getByRole("button", { name: /View all changes/ }).click();
  await expect(
    briefing.getByText("Failed transaction observed"),
  ).toBeVisible();
  await expect(
    briefing.getByText("Older transaction newly discovered"),
  ).toBeVisible();
  await expect(
    briefing.getByText(
      "A transaction failed in this window. No asset movement is implied",
    ),
  ).toBeVisible();
  await expect(
    briefing.getByText(
      "An older transaction was newly discovered. It is not recent activity",
    ),
  ).toBeVisible();
});

test("scout watch briefing clears on lock and supports Chinese and mobile", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let count = 0;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    const value = watchFixture(count++ ? 101 : 100);
    value.address = body.address;
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page);
  await refresh(page);
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  await expect(briefing).toBeVisible();
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
    page
      .locator('section[aria-labelledby="watch-briefing-title"]')
      .getByRole("heading", { name: "关注列表概览" }),
  ).toBeVisible();
  await expect(
    page
      .locator('section[aria-labelledby="watch-briefing-title"]')
      .getByText("ETH 余额在两次查询之间减少 0.1"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "锁定关注列表" }).click();
  await expect(
    page.locator('section[aria-labelledby="watch-briefing-title"]'),
  ).toHaveCount(0);
});

test("scout watch briefing keeps the filter reachable across comparable, baseline and deleted wallets", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const counts = new Map<string, number>();
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    const block = 100 + (counts.get(body.address) ?? 0);
    counts.set(body.address, block - 99);
    const value = watchFixture(block);
    value.address = body.address;
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page, WATCH_TEST_ADDRESS, "Wallet Alpha");
  await refresh(page);
  await add(page, `0x${"2".repeat(40)}`, "Wallet Beta");
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  const filter = briefing.getByLabel("Briefing wallet filter");
  await expect(filter).toBeVisible();
  await filter.selectOption({ label: "Wallet Beta" });
  await expect(
    briefing.getByRole("heading", {
      name: "Not enough saved data to compare",
    }),
  ).toBeVisible();
  await expect(filter).toBeVisible();
  await filter.selectOption("");
  await expect(
    briefing.getByText("TEST balance increased by 3 between the two checks"),
  ).toBeVisible();
  await filter.selectOption({ label: "Wallet Alpha" });
  await page
    .getByRole("navigation", { name: "Your watchlist" })
    .getByRole("button", { name: /Wallet Alpha/ })
    .click();
  await page.getByText("Rename locally / Remove wallet", { exact: true }).click();
  await page.getByRole("button", { name: "Remove wallet", exact: true }).click();
  await page.getByRole("button", { name: "Yes, remove wallet" }).click();
  await expect(filter).toHaveValue("");
  await expect(briefing.getByLabel("Briefing wallet filter")).toBeVisible();
});

test("scout watch briefing refocuses the selected wallet on repeated drill-down and stays compact in other tabs", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let count = 0;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    const value = watchFixture(count++ ? 101 : 100);
    value.address = body.address;
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page, WATCH_TEST_ADDRESS, "Wallet Alpha");
  await refresh(page);
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  const detail = page.locator('[id^="watch-detail-"]').first();
  const detailId = await detail.getAttribute("id");
  expect(detailId).toBeTruthy();
  await briefing.getByText("Evidence detail", { exact: true }).first().click();
  const openWallet = briefing.getByRole("button", {
    name: "Open wallet detail",
  });
  await openWallet.first().click();
  await expect(page.locator(`#${detailId}`)).toBeFocused();
  await openWallet.first().click();
  await expect(page.locator(`#${detailId}`)).toBeFocused();

  await page.getByRole("button", { name: "Activity feed", exact: true }).click();
  await expect(
    briefing.getByRole("button", { name: "Show briefing" }),
  ).toBeVisible();
  await expect(
    briefing.getByText("TEST balance increased by 3 between the two checks"),
  ).toHaveCount(0);
  await briefing.getByRole("button", { name: "Show briefing" }).first().click();
  await expect(
    briefing.getByText("TEST balance increased by 3 between the two checks"),
  ).toBeVisible();
  await briefing.getByRole("button", { name: "Hide briefing" }).click();
  await expect(
    briefing.getByRole("button", { name: "Show briefing" }),
  ).toBeVisible();
});

test("scout watch briefing empty action focuses the add form", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  await create(page);
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  await briefing
    .getByRole("button", { name: "Add a wallet above" })
    .click();
  await expect(page.locator("#watch-address-input")).toBeFocused();
});

test("scout watch briefing keeps two missing NFT ids from one contract distinct", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  let count = 0;
  await page.route("**/v1/private/watch/snapshot", async (route) => {
    const body = route.request().postDataJSON();
    const value = watchFixture(count++ ? 101 : 100);
    value.address = body.address;
    value.nfts =
      count > 1
        ? []
        : [
            {
              kind: "erc1155",
              contract: WATCH_TEST_TOKEN,
              tokenId: "7",
              quantity: "1",
              name: "Edition",
              symbol: "NFT",
              sourceIds: ["rpc"],
            },
            {
              kind: "erc1155",
              contract: WATCH_TEST_TOKEN,
              tokenId: "8",
              quantity: "1",
              name: "Edition",
              symbol: "NFT",
              sourceIds: ["rpc"],
            },
          ];
    await route.fulfill({ json: value });
  });
  await create(page);
  await add(page);
  await refresh(page);
  const briefing = page.locator(
    'section[aria-labelledby="watch-briefing-title"]',
  );
  const unknownPanel = briefing
    .getByRole("heading", { name: "Not comparable in these checks" })
    .locator("..");
  await expect(unknownPanel.locator("ul li")).toHaveCount(2);
  await expect(unknownPanel.getByText("#7").first()).toBeVisible();
  await expect(unknownPanel.getByText("#8").first()).toBeVisible();
});

test("private explorer follows a public wallet and transaction participants without auto lookup", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const watchRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/private/watch")) watchRequests.push(request.url());
  });
  const zero = `0x${"0".repeat(40)}`;
  const contract = `0x${"c".repeat(40)}`;
  const txHash = `0x${"b".repeat(64)}`;
  // Ten distinct participants exercise the panel bound (first eight shown).
  const many = Array.from(
    { length: 10 },
    (_, index) => `0x${(index + 1).toString(16).padStart(2, "0").repeat(20)}`,
  );
  const privacy = {
    accountRequired: false,
    walletConnectionRequired: false,
    serverStorage: "none",
    browserStorage: "memory_only",
    clearsOnReload: true,
    modelProvider: "none",
    providerDestinations: ["blockscout"],
    disclosure: "Only the public chain identifier was sent to Blockscout.",
  };
  await page.route("**/v1/private/analyze", async (route) => {
    const body = route.request().postDataJSON() as { entity: string };
    if (body.entity.toLowerCase() === txHash) {
      const facts = {
        hash: txHash,
        status: "0x1",
        valueEth: "1.25",
        // Mirrors the normalized API shape: top-level and token transfers are
        // address strings; internal calls keep the Blockscout { hash, is_contract }.
        from: WATCH_TEST_ADDRESS,
        to: many[0],
        tokenTransfers: many
          .slice(1)
          .map((address) => ({ from: address, to: zero })),
        internalTransactions: [
          {
            from: { hash: many[1], is_contract: false },
            to: { hash: contract, is_contract: true },
          },
        ],
      };
      await route.fulfill({
        json: {
          mode: "private",
          entity: { chainId: 4663, type: "transaction", value: txHash, facts, citations: [], riskNotes: [] },
          answer: {
            answer: "This transaction succeeded.",
            facts,
            summaryBullets: [],
            confirmedFacts: [],
            inferences: [],
            riskNotes: [],
            citations: [],
            suggestedQuestions: [],
          },
          privacy,
        },
      });
      return;
    }
    const facts = {
      address: WATCH_TEST_ADDRESS,
      nativeBalanceEth: "0.25",
      tokenBalances: [],
    };
    await route.fulfill({
      json: {
        mode: "private",
        entity: { chainId: 4663, type: "wallet", value: WATCH_TEST_ADDRESS, facts, citations: [], riskNotes: [] },
        answer: {
          answer: "A bounded direct check found 0.25 ETH native.",
          facts,
          summaryBullets: [],
          confirmedFacts: [],
          inferences: [],
          riskNotes: [],
          citations: [],
          suggestedQuestions: [],
        },
        privacy,
      },
    });
  });
  await page.goto("/app");
  await page.getByLabel("Public chain identifier").fill(WATCH_TEST_ADDRESS);
  await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /FOLLOW THIS WALLET/ }),
  ).toBeVisible();
  // A transaction result shows its distinct non-zero participants only, bounded
  // to eight with a visible remainder count and a source reference.
  await page.getByLabel("Public chain identifier").fill(txHash);
  await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
  const panel = page.getByRole("region", { name: "Follow on Scout Watch" });
  const participantLinks = panel.getByRole("link", {
    name: /FOLLOW THIS PUBLIC ADDRESS/,
  });
  await expect(participantLinks).toHaveCount(8);
  await expect(panel.getByText("0x1111…1111")).toBeVisible();
  await expect(panel.getByText("from", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("to", { exact: true }).first()).toBeVisible();
  await expect(
    panel.getByText("Showing the first 8 of 11 public addresses."),
  ).toBeVisible();
  await expect(panel.getByText(/0xcccc/)).toHaveCount(0);
  await expect(
    panel.getByRole("link", { name: "Open the full transaction evidence" }),
  ).toBeVisible();
  await participantLinks.first().click();
  await expect(page).toHaveURL(/\/watch\?address=/);
  // The locked/create guide keeps the handed-off address and performs nothing.
  await expect(
    page.getByText(/is waiting to follow/),
  ).toBeVisible();
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Create encrypted watchlist" }).click();
  await page.getByRole("button", { name: "I saved my recovery key" }).click();
  const form = page.getByRole("region", { name: "Add a wallet to watch" });
  await expect(form.getByLabel("Public Robinhood wallet address")).toHaveValue(
    WATCH_TEST_ADDRESS,
  );
  await expect(
    form.getByLabel("Allow this public-address lookup"),
  ).not.toBeChecked();
  expect(watchRequests).toEqual([]);
});
