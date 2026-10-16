import { expect, test } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import { watchFixture, WATCH_TEST_ADDRESS } from "../apps/web/src/watch/fixture";
// The reviewed USDG contract, inlined: the app's asset list module cannot load in the test runner.
const REVIEWED = { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG" };

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true"
  && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

test("opsis preview Watch shows reviewed and flagged tokens at 375 px in both languages", async ({ page }) => {
  test.skip(!enabled);
  test.setTimeout(60000);
  await page.setViewportSize({ width: 375, height: 812 });
  await mockPublicOpsisAccess(page);
  await page.route("**/v1/private/watch/snapshot", (route) => {
    expect(route.request().postDataJSON()).toEqual({ address: WATCH_TEST_ADDRESS });
    const snapshot = watchFixture();
    const base = snapshot.tokens[0];
    snapshot.tokens = [
      { ...base, name: "Ordinary token", symbol: "OTHER" },
      { ...base, contract: `0x${"4".repeat(40)}`, name: "NVIDIA Robinhood Coin", symbol: "NVDA" },
      { ...base, contract: `0x${"5".repeat(40)}`, name: "Reported\u202ename", symbol: "PO\u200bNS", reputation: "scam" },
      { ...base, contract: REVIEWED.address.toLowerCase(), name: "Reviewed token", symbol: REVIEWED.symbol },
    ];
    snapshot.reconciliation.tokenCandidates = 4;
    snapshot.reconciliation.tokenConfirmed = 4;
    return route.fulfill({ json: snapshot });
  });
  await page.goto("/watch");
  const form = page.getByRole("region", { name: "One-off public wallet check" });
  await form.getByLabel("Public Robinhood wallet address").fill(WATCH_TEST_ADDRESS);
  await form.getByLabel("Allow this public-address lookup").check();
  await form.getByRole("button", { name: "Run a check", exact: true }).click();
  const table = page.getByTestId("watch-token-table");
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr.watch-holding-row");
  const warnings = table.locator("tbody tr.watch-warning-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1)).toContainText("Reviewed token");
  await expect(rows.nth(1)).toContainText("Reviewed asset");
  await expect(warnings.nth(0)).toContainText("Uses the symbol NVDA, but this is not the reviewed NVDA contract.");
  await expect(rows.nth(3)).toContainText("Reported[U+202E]name · PO[U+200B]NS");
  await expect(warnings.nth(1)).toContainText("The name or symbol contains hidden characters, shown in brackets above.");
  await expect(warnings.nth(1)).toContainText("Blockscout marks this token as a scam.");
  await expect(rows.nth(4)).toContainText("Ordinary token");
  await expect(form).toContainText("Names and symbols are what each contract reports about itself.");
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(rows.nth(1)).toContainText("已审核资产");
  await expect(warnings.nth(0)).toContainText("使用符号 NVDA，但这不是已审核的 NVDA 合约。");
  await expect(warnings.nth(1)).toContainText("名称或符号含有隐藏字符，已在上方用方括号显示。");
  await expect(warnings.nth(1)).toContainText("Blockscout 将此代币标记为骗局。");
  await expect(page.getByRole("region", { name: "单次公开钱包核查" })).toContainText("名称和符号由各合约自行报告。");
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Save to encrypted watchlist" }).click();
  await page.getByLabel("Vault passphrase", { exact: true }).fill("demo-watch-passphrase");
  await page.getByLabel("Confirm passphrase", { exact: true }).fill("demo-watch-passphrase");
  await page.getByRole("button", { name: "Create encrypted watchlist" }).click();
  await page.getByRole("button", { name: "I saved my recovery key" }).click();
  await page.getByRole("button", { name: "Save checked snapshot", exact: true }).click();
  await page.getByRole("button", { name: "Wallet details", exact: true }).click();
  const saved = page.getByRole("region", { name: "Latest saved check" });
  await expect(saved).toContainText("NVIDIA Robinhood Coin · NVDA · Lookalike");
  await expect(saved).toContainText("Reported[U+202E]name · PO[U+200B]NS");
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  const assets = page.getByLabel("Observed asset", { exact: true });
  await expect(assets).toContainText("NVIDIA Robinhood Coin · NVDA · Lookalike");
  await expect(assets).toContainText("Reported[U+202E]name · PO[U+200B]NS");
  await assets.selectOption(`0x${"4".repeat(40)}`);
  await page.getByLabel("Exact threshold", { exact: true }).fill("0.125");
  await page.getByRole("button", { name: "Save condition", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByLabel("已观察资产", { exact: true })).toContainText("NVIDIA Robinhood Coin · NVDA · 同符号不同合约");
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const width of [1280, 375]) {
  test(`opsis preview Watch and Saved layout at ${width} px`, async ({ page }) => {
    test.skip(!enabled);
    await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
    await mockPublicOpsisAccess(page);
    await page.route("**/v1/private/watch/snapshot", (route) => {
      const snapshot = watchFixture(101);
      snapshot.transactions.push({ ...snapshot.transactions[0], hash: `0x${"d".repeat(64)}`, blockNumber: 102, status: "failed" });
      snapshot.reconciliation.activityCandidates = snapshot.transactions.length;
      snapshot.reconciliation.activityConfirmed = snapshot.transactions.length;
      snapshot.anchor.blockNumber = 102;
      snapshot.anchor.blockHash = `0x${(102).toString(16).padStart(64, "0")}`;
      return route.fulfill({ json: snapshot });
    });
    await page.goto("/watch");
    const form = page.getByRole("region", { name: "One-off public wallet check" });
    const input = form.getByLabel("Public Robinhood wallet address");
    const run = form.getByRole("button", { name: "Run a check", exact: true });
    await expect(input).toBeVisible();
    await expect(run).toBeVisible();
    for (const control of [input, run]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(width === 375 ? 812 : 800);
    }
    await input.fill(WATCH_TEST_ADDRESS);
    await form.getByRole("checkbox").check();
    await run.click();
    const timeline = page.getByRole("region", { name: "Recent changes", exact: true });
    await expect(timeline.locator(".watch-timeline > li").first()).toContainText("Failed transaction");
    await expect(timeline).toContainText("Sent 0.1 ETH");
    await expect(page.getByTestId("watch-token-table")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("region", { name: "最近变化", exact: true })).toContainText("交易失败");
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.goto("/saved?view=reports");
    await expect(page.getByRole("complementary", { name: "Saved research & checks" })).toBeVisible();
    await expect(page.getByText("Nothing is uploaded. Saved items stay encrypted on this device.", { exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "已保存研究与核查" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
