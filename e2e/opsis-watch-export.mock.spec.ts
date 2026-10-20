import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import { watchFixture, WATCH_TEST_ADDRESS } from "../apps/web/src/watch/fixture";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true"
  && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

for (const width of [1280, 375]) {
  test(`Watch exports the displayed public snapshot locally in both languages at ${width}px`, async ({ page }) => {
    test.skip(!enabled);
    await page.setViewportSize({ width, height: 812 });
    await mockPublicOpsisAccess(page);
    const snapshot = watchFixture(101, Date.parse("2026-10-20T12:00:00.000Z"));
    snapshot.tokens[0].symbol = 'A,"quoted"\nnext';
    snapshot.approvals = [{
      transactionHash: snapshot.transactions[1].hash, contract: snapshot.tokens[0].contract,
      spender: `0x${"4".repeat(40)}`, kind: "erc20", symbol: snapshot.tokens[0].symbol,
      active: true, unlimited: true, currentAmount: "123456789012345678901234567890", sourceIds: ["rpc"],
    }];
    await page.route("**/v1/private/watch/snapshot", (route) => route.fulfill({ json: snapshot }));
    await page.goto("/watch");
    await expect(page.getByRole("region", { name: "Export snapshot", exact: true })).toHaveCount(0);
    const form = page.getByRole("region", { name: "One-off public wallet check" });
    await form.getByLabel("Public Robinhood wallet address").fill(WATCH_TEST_ADDRESS);
    await form.getByLabel("Allow this public-address lookup").check();
    await form.getByRole("button", { name: "Run a check", exact: true }).click();
    await expect(page.getByRole("region", { name: "Export snapshot", exact: true })).toBeVisible();

    const requests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await page.context().setOffline(true);
    for (const chinese of [false, true]) {
      if (chinese) await page.getByRole("button", { name: "中文", exact: true }).click();
      const region = page.getByRole("region", { name: chinese ? "导出快照" : "Export snapshot", exact: true });
      await expect(region).toContainText(chinese ? "在您的浏览器中导出。不会上传任何内容。" : "Exported in your browser. Nothing is uploaded.");
      for (const format of ["csv", "json"]) {
        const pending = page.waitForEvent("download");
        await region.getByRole("button", { name: chinese ? `导出 ${format.toUpperCase()}` : `Export ${format.toUpperCase()}`, exact: true }).click();
        const download = await pending;
        expect(download.suggestedFilename()).toBe(`opsis-watch-0x111111-111111-101.${format}`);
        const content = await readFile((await download.path())!, "utf8");
        if (format === "json") {
          const json = JSON.parse(content);
          expect(json).toMatchObject({
            wallet: snapshot.address, blockNumber: "101", blockHash: snapshot.anchor.blockHash,
            ethBalance: "0.900000000000000001",
            tokens: [{ symbol: snapshot.tokens[0].symbol, balance: "5", rawBalance: "5000000000000000000" }],
            approvals: [{ unlimited: true, spender: snapshot.approvals[0].spender }],
          });
          expect(json.transactions[0].summary).toBe(chinese ? "授权活动" : "Approval activity");
        } else {
          expect(content).toContain(chinese ? "非投资建议" : "Not investment advice");
          expect(content).toContain('"0.900000000000000001"');
          expect(content).toContain('"A,""quoted""\nnext"');
        }
      }
      expect(await page.locator("html").evaluate((element) => element.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    expect(requests).toEqual([]);
    await page.getByRole("region", { name: "单次公开钱包核查" }).getByRole("textbox").fill(`0x${"2".repeat(40)}`);
    await expect(page.getByRole("region", { name: "导出快照", exact: true })).toHaveCount(0);
  });
}

test("Watch offers no export after a failed snapshot", async ({ page }) => {
  test.skip(!enabled);
  await mockPublicOpsisAccess(page);
  await page.route("**/v1/private/watch/snapshot", (route) => route.fulfill({ status: 503, json: { error: { message: "Snapshot unavailable" } } }));
  await page.goto("/watch");
  const form = page.getByRole("region", { name: "One-off public wallet check" });
  await form.getByLabel("Public Robinhood wallet address").fill(WATCH_TEST_ADDRESS);
  await form.getByLabel("Allow this public-address lookup").check();
  await form.getByRole("button", { name: "Run a check", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: "Export snapshot", exact: true })).toHaveCount(0);
});
