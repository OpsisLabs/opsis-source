import { expect, test, type Page } from "@playwright/test";
import { researchTransaction } from "../apps/web/src/opsis/test-fixtures";
import weth from "../apps/web/src/opsis/fixtures/research-weth-token.json";
import pons from "../apps/web/src/opsis/fixtures/research-pons-token.json";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const WETH = weth.entity.value;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const result = (page: Page) => page.getByTestId("opsis-research-result");
const run = (page: Page) => page.getByRole("button", { name: /^(Run research|运行研究)$/ });

async function preferences(page: Page, theme: string, chinese: boolean) {
  await page.context().addCookies([{ name: "opsis_theme", value: theme, url: `http://localhost:${process.env.PW_APP_PORT ?? "5173"}` }]);
  await page.goto("/research");
  if (chinese) await page.getByRole("button", { name: "中文", exact: true }).click();
}
async function fits(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

test.describe("opsis preview QA Research", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => { await mockPublicOpsisAccess(page); });

  for (const input of [`  ${pons.entity.value}  `, "  0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73  "]) {
    test(`opsis preview padded lookup completes once: ${input.trim()}`, async ({ page }) => {
      let requests = 0;
      let respond: (() => Promise<void>) | undefined;
      await page.route("**/v1/private/analyze", (route) => {
        requests++;
        expect(route.request().postDataJSON().entity).toBe(input.trim());
        respond = () => route.fulfill({ json: input.trim().toLowerCase() === WETH ? weth : pons });
      });
      await page.goto("/research");
      await page.locator("#research-entity").fill(input);
      // Submit without blurring, preserving the original padding and case until run().
      await page.locator("#research-entity").press("Enter");
      await expect.poll(() => Boolean(respond)).toBe(true);
      await expect(page).toHaveURL(/\/research\?entity=0x[\da-fA-F]{40}$/);
      await expect(page.getByText("Checking public evidence…", { exact: false })).toBeVisible();
      await expect(page.locator("#research-entity")).toHaveValue(input.trim());
      await respond!();
      await expect(result(page).getByRole("heading", { name: input.trim().toLowerCase() === WETH ? "WETH" : "PONS", exact: true })).toBeVisible();
      expect(requests).toBe(1);
    });
  }

  test("opsis preview Research Back and Forward restore completed results without fetching", async ({ page }) => {
    let requests = 0;
    await page.route("**/v1/private/analyze", (route) => {
      requests++;
      const entity = route.request().postDataJSON().entity;
      const payload = structuredClone(weth);
      payload.entity.value = entity;
      payload.entity.facts.symbol = entity.toLowerCase() === WETH ? "WETH" : "USDG";
      return route.fulfill({ json: payload });
    });
    await page.goto("/guide");
    await page.locator('.opsis-desktop-rail a[href="/research"]').click();
    await page.getByRole("button", { name: "WETH", exact: true }).click();
    await expect(result(page).getByRole("heading", { name: "WETH", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "USDG", exact: true }).click();
    await expect(result(page).getByRole("heading", { name: "USDG", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.locator("#research-entity")).toHaveValue(new RegExp(WETH, "i"));
    await expect(result(page).getByRole("heading", { name: "WETH", exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.locator("#research-entity")).toHaveValue(USDG);
    await expect(result(page).getByRole("heading", { name: "USDG", exact: true })).toBeVisible();
    expect(requests).toBe(2);
    // Re-running the current identity refreshes it but does not add a duplicate entry.
    await run(page).click();
    await expect(result(page)).toBeVisible();
    await page.goBack();
    await expect(result(page).getByRole("heading", { name: "WETH", exact: true })).toBeVisible();
    expect(requests).toBe(3);
  });

  test("opsis preview missing history result stays empty and aborts an in-flight lookup", async ({ page }) => {
    let respond: (() => Promise<void>) | undefined;
    await page.route("**/v1/private/analyze", (route) => {
      respond = () => route.fulfill({ json: weth });
    });
    await page.goto("/research");
    await page.getByRole("button", { name: "WETH", exact: true }).click();
    await expect.poll(() => Boolean(respond)).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(/\/research$/);
    await expect(page.locator("#research-entity")).toHaveValue("");
    await respond!().catch(() => {}); // The browser may already have canceled the route.
    await expect(result(page)).toHaveCount(0);
    await expect(run(page)).toBeDisabled();
    await page.goForward();
    await expect(page.locator("#research-entity")).toHaveValue(new RegExp(WETH, "i"));
    await expect(result(page)).toHaveCount(0);
    await expect(run(page)).toBeEnabled();
  });

  for (const theme of ["light", "dark"]) for (const chinese of [false, true]) {
    test(`opsis preview Research reflow, findings and counts ${theme} ${chinese ? "zh-CN" : "en"}`, async ({ page }) => {
      test.setTimeout(90_000);
      const payload = structuredClone(weth);
      payload.entity.facts.lifetimeTransfers = "486561081";
      await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: payload }));
      await preferences(page, theme, chinese);
      await page.getByRole("button", { name: "WETH", exact: true }).click();
      await expect(result(page)).toBeVisible();
      const disclosure = page.locator(".research-limitations");
      for (const width of [320, 375, 640, 700, 701, 720, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator("#research-task").selectOption("risk");
        // Changing the question clears results; the next lookup keeps the same URL.
        await run(page).click();
        await expect(result(page)).toBeVisible();
        await disclosure.locator("summary").click();
        await fits(page);
        const form = await page.locator(".research-input-band").boundingBox();
        for (const control of await page.locator(".research-input-band").locator("input, select, button.opsis-action, .opsis-receipt").all()) {
          const box = (await control.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(form!.x);
          expect(box.x + box.width).toBeLessThanOrEqual(form!.x + form!.width);
        }
        const question = await page.locator("#research-task").evaluate((node) => {
          const select = node as HTMLSelectElement;
          const style = getComputedStyle(select);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          context.font = style.font;
          return { text: select.selectedOptions[0].text, textWidth: context.measureText(select.selectedOptions[0].text).width, available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24 };
        });
        expect(question.text).toBe(chinese ? "控制与限制" : "Controls & limits");
        expect(question.textWidth).toBeLessThanOrEqual(question.available);
        const count = page.locator(".research-number").filter({ hasText: "486,561,081" });
        await expect(count).toHaveCount(1);
        const lines = await count.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return { lines: range.getClientRects().length, width: range.getBoundingClientRect().width, available: node.parentElement!.clientWidth };
        });
        expect(lines.lines).toBe(1);
        expect(lines.width).toBeLessThanOrEqual(lines.available);
        if (chinese) {
          await expect(disclosure).toContainText("部署者：");
          await expect(disclosure).toContainText("当前的实现合约");
          await expect(disclosure).toContainText("付费网关");
          await expect(disclosure).not.toContainText("Proxy contract detected");
          await expect(disclosure).not.toContainText("Only the public chain identifier");
          await expect(disclosure).not.toContainText("Lifetime transfers:");
        }
        await disclosure.locator("summary").click();
        await fits(page);
      }
      await page.setViewportSize({ width: 320, height: 812 });
      await result(page).evaluate((node) => node.querySelectorAll("details").forEach((details) => { details.open = true; }));
      await fits(page);
      // The same cached response must follow a language switch without another lookup.
      if (chinese) {
        await page.getByRole("button", { name: "English", exact: true }).click();
        await expect(disclosure).toContainText("Deployer:");
        await page.getByRole("button", { name: "中文", exact: true }).click();
        await expect(disclosure).toContainText("部署者：");
      }
    });

    test(`opsis preview transaction findings wrap ${theme} ${chinese ? "zh-CN" : "en"}`, async ({ page }) => {
      const transaction = researchTransaction();
      // The first three facts are represented in the transaction identity; the rest
      // include unbroken hashes, the cause of the phone disclosure overflow.
      const payload = { ...transaction, answer: { ...transaction.answer, confirmedFacts: ["From: sample", "To: sample", "Transaction outcome: success", `Block hash: 0x${"a".repeat(64)}`].map((fact) => ({ fact, sourceIds: ["s1"] })) } };
      await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: payload }));
      await preferences(page, theme, chinese);
      await page.locator("#research-entity").fill(payload.entity.value);
      await run(page).click();
      await expect(result(page)).toBeVisible();
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 812 });
        for (let cycle = 0; cycle < 2; cycle++) {
          await page.locator(".research-limitations > summary").click();
          await fits(page);
          await expect(page.locator(".research-limitations")).toContainText(`0x${"a".repeat(64)}`);
          await page.locator(".research-limitations > summary").click();
        }
      }
    });

    test(`opsis preview anchors and focused fields clear the header ${theme} ${chinese ? "zh-CN" : "en"}`, async ({ page }) => {
      await preferences(page, theme, chinese);
      await page.goto("/check/perp-scenario");
      for (const [en, zh, value] of [
        ["Base-asset quantity", "基础资产数量", "2"],
        ["Entry price", "入场价格", "100"],
        ["Scenario closing price", "情景平仓价格", "110"],
        ["Entry fee (basis points)", "入场费用（基点）", "10"],
        ["Exit fee (basis points)", "退出费用（基点）", "20"],
        ["Total funding: positive paid, negative received", "资金费总额：支付为正，收取为负", "3"],
        ["Other costs in quote currency", "报价货币计价的其他成本", "4"],
      ]) await page.getByLabel(chinese ? zh : en, { exact: true }).fill(value);
      for (const width of [1280, 1024, 375]) {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 600 });
        const jump = page.locator('a[href="#perp-result-title"]');
        await jump.focus();
        await jump.press("Enter");
        await expect.poll(async () => (await page.locator("#perp-result-title").boundingBox())!.y).toBeCloseTo(width <= 700 ? 60 : 64, 0);
        const heading = await page.locator("#perp-result-title").boundingBox();
        expect(heading!.y + heading!.height).toBeLessThanOrEqual(width === 375 ? 812 : 600);
        const field = page.getByLabel(chinese ? "基础资产数量" : "Base-asset quantity", { exact: true });
        await field.focus();
        await expect.poll(async () => (await field.boundingBox())!.y).toBeGreaterThanOrEqual(width <= 700 ? 48 : 52);
      }
    });
  }
});
