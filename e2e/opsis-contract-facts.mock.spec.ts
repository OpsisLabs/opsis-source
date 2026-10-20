import { expect, test } from "@playwright/test";
import { researchToken } from "../apps/web/src/opsis/test-fixtures";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const address = `0x${"1".repeat(40)}`;
const implementation = `0x${"2".repeat(40)}`;
const fetchedAt = "2026-10-20T12:00:00.000Z";
const source = { provider: "blockscout", url: `https://robinhoodchain.blockscout.com/api/v2/smart-contracts/${address}`, fetchedAt, fieldsUsed: ["is_verified"] };
const fact = (value: unknown) => ({ value, reason: null, source });

test.describe("opsis preview contract facts", () => {
  test.skip(!enabled);
  for (const state of ["verified", "unverified", "unavailable", "disabled"] as const) {
    test(`opsis preview ${state} contract facts in both languages`, async ({ page }) => {
      await mockPublicOpsisAccess(page, [], { contractFacts: state !== "disabled" });
      const missing = { value: null, reason: "explorer_unavailable", source: null };
      const contractFacts = state === "unavailable"
        ? { sourceVerified: missing, name: missing, compilerVersion: missing, optimizationEnabled: missing, proxy: missing, implementations: missing, verifiedAt: missing }
        : { sourceVerified: fact(state !== "unverified"), name: state === "unverified" ? { value: null, reason: "not_reported", source } : fact("SampleToken"),
          compilerVersion: fact("v0.8.30"), optimizationEnabled: fact(false), proxy: fact(true), implementations: fact([implementation]), verifiedAt: fact("2026-07-13T23:55:17.954502Z") };
      const payload = researchToken();
      await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: { ...payload, entity: { ...payload.entity, value: address }, contractFacts } }));
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(`/research?entity=${address}`);
      await page.getByRole("button", { name: "Run research", exact: true }).click();
      await expect(page.getByTestId("opsis-research-result")).toBeVisible();
      const block = page.getByTestId("contract-facts");
      if (state === "disabled") {
        await expect(block).toHaveCount(0);
        return;
      }
      await expect(block).toBeVisible();
      await expect(block).toContainText(state === "unavailable" ? "Can't check (explorer unavailable)" : state === "unverified" ? "Source not verified on Blockscout" : "Source verified on Blockscout");
      if (state !== "unavailable") {
        await expect(block.locator("time")).toHaveCount(7);
        await expect(block).toContainText(fetchedAt);
        await expect(block).toContainText(implementation);
      } else await expect(block).not.toContainText("Source not verified");
      await expect(block.getByRole("link", { name: "View source on Blockscout ↗" })).toHaveAttribute("href", `https://robinhoodchain.blockscout.com/address/${address}?tab=contract`);
      await expect(block).toContainText("Verified source does not mean the contract is safe.");
      await page.getByRole("button", { name: "中文", exact: true }).click();
      await expect(block).toContainText("合约事实");
      await expect(block).toContainText(state === "unavailable" ? "无法核查（区块浏览器不可用）" : state === "unverified" ? "源代码未在 Blockscout 验证" : "源代码已在 Blockscout 验证");
      await expect(block).toContainText("源代码已验证不代表合约安全。");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
  }
});
