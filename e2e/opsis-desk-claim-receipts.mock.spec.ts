import { expect, test, type Page } from "@playwright/test";
import type { ClaimResponse, Receipt, StockDeskResult } from "@rh-chain/shared";
import { receiptFixture } from "../apps/web/src/opsis/receipt-test-fixtures";
import { RWA_TEST_CONTRACT, rwaWorkspaceFixture } from "../apps/web/src/rwa/test-fixtures";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const unknown = { state: "unknown" as const, reason: "FIXTURE_UNAVAILABLE" };

async function openResult(page: Page, tool: "stock-desk" | "claimCheck", receipt: Receipt | undefined, chinese: boolean) {
  if (tool === "stock-desk") {
    const desk: StockDeskResult = {
      schemaVersion: 1, address: RWA_TEST_CONTRACT, symbol: "SAMPLE-STOCK",
      observedAt: "2026-10-19T15:00:00.000Z", canonical: "not_on_official_list",
      reference: unknown, pool: unknown, gapBps: unknown, multiplier: unknown,
      corporateActions: unknown, feed: unknown, concentration: unknown, depth: [],
      history: { state: "unavailable", reason: "FIXTURE_UNAVAILABLE" },
      limitations: [], disclaimer: "Synthetic desk fixture", receipt,
    };
    await page.route("**/v1/private/rwa/verify", route => route.fulfill({ json: rwaWorkspaceFixture() }));
    await page.route("**/v1/private/stock-desk/token", route => route.fulfill({ json: desk }));
    await page.goto("/rwa");
    await page.getByRole("textbox", { name: chinese ? "代币或金库合约" : "Token or vault contract", exact: true }).fill(RWA_TEST_CONTRACT);
    await page.getByRole("button", { name: chinese ? "运行核查" : "Run check", exact: true }).click();
    await page.getByRole("button", { name: chinese ? "确认公开查询" : "Confirm public lookup", exact: true }).click();
    await page.getByRole("button", { name: chinese ? "加载数据台事实" : "Load desk facts", exact: true }).click();
  } else {
    const result: ClaimResponse = {
      chainId: 4663, address: RWA_TEST_CONTRACT,
      current: { block: null, results: [{ claim: { type: "ownership", expected: true }, definition: "ownership-v1", status: "can't check", wording: "Fixture observation unavailable", evidence: {}, reason: "FIXTURE_UNAVAILABLE" }] },
      receipt,
    };
    await page.route("**/v1/private/opsis/claims", route => route.fulfill({ json: result }));
    await page.goto("/research/claims");
    await page.getByRole("button", { name: chinese ? "添加声明" : "Add claim", exact: true }).click();
    await page.locator("#claim-address").fill(RWA_TEST_CONTRACT);
    await page.getByRole("checkbox", { name: chinese ? "确认此合约地址" : "Confirm this contract address", exact: true }).check();
    await page.getByRole("button", { name: chinese ? "运行声明核查" : "Run claim check", exact: true }).click();
  }
  await expect(page.locator("#opsis-content")).toContainText("FIXTURE_UNAVAILABLE");
}

test.describe("desk and claim receipt downloads", () => {
  test.skip(!enabled);

  for (const tool of ["stock-desk", "claimCheck"] as const) {
    for (const chinese of [false, true]) {
      test(`${tool} downloads canonical JSON and verifies locally, Chinese=${chinese}`, async ({ page, context }) => {
        const { receipt, text, keys } = await receiptFixture(tool);
        await context.addCookies([{ name: "opsis_locale_v1", value: chinese ? "zh-CN" : "en", domain: "localhost", path: "/" }]);
        await mockPublicOpsisAccess(page, [], { rwa: true, stockDesk: true, claimCheck: true, receipts: true });
        const keyRequests: string[] = [];
        await page.route("**/v1/private/opsis/receipts/keys", route => {
          keyRequests.push(route.request().method());
          expect(route.request().postData()).toBeNull();
          return route.fulfill({ json: keys });
        });
        await openResult(page, tool, receipt, chinese);
        await expect(page.locator(".opsis-receipt-actions")).toContainText(chinese ? "它证明计算过程，而不证明结论正确。" : "It proves the computation, not that a conclusion is right.");
        const downloadEvent = page.waitForEvent("download");
        await page.getByRole("button", { name: chinese ? "下载凭据" : "Download receipt", exact: true }).click();
        const download = await downloadEvent;
        expect(download.suggestedFilename()).toBe("opsis-receipt.json");
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const downloaded = Buffer.concat(chunks).toString("utf8");
        expect(downloaded).toBe(text);
        expect(JSON.parse(downloaded).tool).toBe(tool);
        const link = page.getByRole("link", { name: chinese ? "验证收据 →" : "Verify a receipt →", exact: true });
        await expect(link).toHaveAttribute("href", "/verify");
        await link.click();
        await page.locator("#receipt-json").fill(downloaded);
        await page.getByRole("button", { name: chinese ? "本地验证" : "Verify locally", exact: true }).click();
        await expect(page.getByRole("heading", { name: chinese ? "凭据完整性检查通过" : "Receipt integrity checks passed", exact: true })).toBeVisible();
        await expect(page.locator(".opsis-receipts")).toContainText(tool);
        expect(keyRequests).toEqual(["GET"]);
      });
    }

    for (const state of ["missing", "invalid", "disabled", "missing capability"] as const) {
      test(`${tool} hides receipt actions when ${state} and retains the result`, async ({ page }) => {
        const { receipt } = await receiptFixture(tool);
        const value = state === "missing" ? undefined : state === "invalid"
          ? { ...receipt, signature: { ...receipt.signature, value: "0x1234" } } as Receipt : receipt;
        await mockPublicOpsisAccess(page, [], {
          rwa: true, stockDesk: true, claimCheck: true,
          ...(state === "missing capability" ? {} : { receipts: state !== "disabled" }),
        });
        await openResult(page, tool, value, false);
        await expect(page.getByRole("button", { name: "Download receipt", exact: true })).toHaveCount(0);
        await expect(page.locator('a[href="/verify"]')).toHaveCount(0);
        await expect(page.locator(".opsis-receipt-actions")).toHaveCount(0);
        await expect(page.getByRole("alert")).toHaveCount(0);
      });
    }
  }
});
