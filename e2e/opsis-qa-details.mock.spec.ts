import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pons from "../apps/web/src/opsis/fixtures/research-pons-token.json";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const address = `0x${"1".repeat(40)}`;
const other = `0x${"2".repeat(40)}`;
const burn = "0x000000000000000000000000000000000000dEaD";
const hash = `0x${"a".repeat(64)}`;
const facts = {
  ...pons.entity.facts,
  burnedShare: 32.52, top10WalletShare: 21.2, liquidityPoolShare: 2.2,
  topHolders: [{ address: burn, share: 32.52, isBurn: true }, { address, share: 21.2 }, { address: other, share: 2.2, isPool: true }],
  recentTransfers: [
    { from: address, to: other, tokenSymbol: "PONS", formattedValue: "3051.092649036413974024", rawValue: "3051092649036413974024", timestamp: "2026-10-17T12:00:00Z" },
    { from: other, to: address, tokenSymbol: "PONS", formattedValue: "12", timestamp: "2026-10-16T12:00:00Z" },
    { from: address, to: burn, tokenSymbol: "PONS", formattedValue: "1", timestamp: "2026-10-16T11:00:00Z" },
  ],
};
const tokenPayload = { ...pons, entity: { ...pons.entity, facts }, answer: { ...pons.answer, facts } };
const txFacts = { hash, from: address, to: other, status: "0x1", valueEth: "1", gasUsed: "21000" };
const transactionPayload = {
  ...pons,
  entity: { ...pons.entity, type: "transaction", value: hash, facts: txFacts },
  answer: { ...pons.answer, answer: "A sampled transaction.", facts: txFacts, summaryBullets: [] },
};

async function openDetails(page: Page, chinese: boolean, theme: "light" | "dark", transaction = false) {
  await mockPublicOpsisAccess(page);
  await page.addInitScript(({ chinese, theme }) => {
    document.cookie = `opsis_locale_v1=${chinese ? "zh-CN" : "en"}; Path=/`;
    document.cookie = `opsis_theme=${theme}; Path=/`;
  }, { chinese, theme });
  const payload = transaction ? transactionPayload : tokenPayload;
  await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: payload }));
  await page.goto(`/research/details?entity=${payload.entity.value}`);
  await page.getByRole("button", { name: chinese ? "私密解读" : "Explain privately", exact: true }).click();
  await page.locator(".details-ws-full-answer > summary").click();
  const result = page.getByTestId("answer-card");
  await expect(result).toBeVisible();
  await expect(page.locator(".opsis").first()).toHaveAttribute("data-theme", theme);
  // Work on the settled page: fonts loaded, colour transitions done, the typed answer complete.
  // Opening the evidence before the answer finishes typing can be undone by its final render.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((animation) => !(animation instanceof CSSTransition) || animation.playState !== "running"));
  const settled = async () => {
    const before = await result.innerText();
    await page.waitForTimeout(250);
    return before === (await result.innerText());
  };
  await expect.poll(settled).toBe(true);
  const evidence = result.locator("details").filter({ has: page.locator("summary", { hasText: chinese ? "支持事实与证据" : "Supporting facts & evidence" }) });
  await evidence.locator("summary").first().click();
  await expect(evidence.first()).toHaveAttribute("open", "");
  await expect.poll(settled).toBe(true);
  return result;
}

test.describe("opsis preview detailed research QA fixes", () => {
  test.skip(!enabled);
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 375, 1280, 1440]) {
      test(`charts separate text from fills, keep token units and show burns at ${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
        const result = await openDetails(page, false, theme);
        const holders = result.locator(".detail-widget").filter({ hasText: "Largest holders" });
        await expect(holders).toContainText("Burn address");
        const supply = result.locator(".detail-widget").filter({ hasText: "Who controls the supply" });
        await expect(supply).toContainText("Burned supply");
        // Everyone else excludes the burned 32.52%, pool 2.2%, and top wallets 21.2%.
        await expect(supply).toContainText("44%");
        const transfers = result.locator(".detail-widget").filter({ hasText: "Largest recent transfers" });
        await expect(transfers).toContainText(/token amounts; exact values on hover/i);
        await expect(transfers).not.toContainText("ETH");
        await expect(transfers.locator(".detail-widget-value").first()).toHaveText("3,051.09… PONS");
        await expect(transfers.locator(".detail-widget-value").first()).toHaveAttribute("title", "3,051.092649036413974024 PONS");
        const rows = result.locator(".detail-widget-row");
        for (const row of await rows.all()) {
          const fill = await row.locator(".detail-widget-fill").boundingBox();
          expect(fill).not.toBeNull();
          for (const text of await row.locator(":scope > span:not(.detail-widget-fill)").all()) {
            const box = await text.boundingBox();
            expect(box!.y + box!.height).toBeLessThanOrEqual(fill!.y + 1);
          }
        }
        const violations = await new AxeBuilder({ page }).include(".detail-widget").withRules(["color-contrast"]).analyze();
        expect(violations.violations).toEqual([]);
        await result.getByRole("button", { name: /sources/i }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      });
    }
    test(`Chinese burn and transfer interface ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      const result = await openDetails(page, true, theme);
      await expect(result).toContainText("销毁地址");
      await expect(result).toContainText("已销毁供应量");
      await expect(result).toContainText("代币数量；悬停查看精确值");
      await expect(result.locator(".detail-widget-value").last()).toContainText("PONS");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
    for (const chinese of [false, true]) {
      for (const transaction of [false, true]) {
        for (const mode of ["denied", "missing", "success"] as const) {
          test(`copy and share ${mode}, ${transaction ? "hash" : "address"}, ${chinese ? "zh" : "en"}, ${theme}`, async ({ page }) => {
            await page.setViewportSize({ width: 320, height: 812 });
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.addInitScript((mode) => {
              Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : {
                writeText: async (value: string) => {
                  if (mode === "denied") throw new DOMException("Clipboard denied", "NotAllowedError");
                  (window as unknown as { copiedText: string }).copiedText = value;
                },
              } });
            }, mode);
            const result = await openDetails(page, chinese, theme, transaction);
            const id = transaction ? hash : tokenPayload.entity.value;
            const copy = result.getByTestId("copy-control").nth(0);
            const share = result.getByTestId("copy-control").nth(1);
            await expect(copy.getByRole("button")).toHaveText(chinese ? transaction ? "复制哈希" : "复制地址" : transaction ? "COPY HASH" : "COPY ADDRESS");
            await expect(share.getByRole("button")).toHaveText(chinese ? "分享" : "SHARE");
            for (const [control, expected] of [[copy, id], [share, transaction ? "A sampled transaction." : "Robinhood Chain"]] as const) {
              await control.getByRole("button").click();
              if (mode === "success") {
                await expect(control.getByRole("status")).toContainText(chinese ? "已复制" : "COPIED");
                expect(await page.evaluate(() => (window as unknown as { copiedText: string }).copiedText)).toContain(expected);
              } else {
                await expect(control.getByRole("status")).toContainText(chinese ? "无法复制" : "Copy unavailable");
                const fallback = control.getByRole("textbox");
                await expect(fallback).toHaveValue(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
                await fallback.focus();
                expect(await fallback.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBeGreaterThan(0);
              }
            }
            expect(errors).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
          });
        }
      }
    }
  }

  test("a new lookup moves the address to the identifier it read", async ({ page }) => {
    const weth = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
    await mockPublicOpsisAccess(page);
    await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: tokenPayload }));
    await page.goto(`/research/details?entity=${weth}`);
    await page.getByRole("textbox", { name: "Public chain identifier" }).fill(tokenPayload.entity.value);
    await page.getByRole("button", { name: "Explain privately", exact: true }).click();
    await expect(page.locator(".details-ws-main-value output")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/research/details\\?entity=${tokenPayload.entity.value}$`, "i"));
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Public chain identifier" })).toHaveValue(new RegExp(tokenPayload.entity.value, "i"));
  });
});
