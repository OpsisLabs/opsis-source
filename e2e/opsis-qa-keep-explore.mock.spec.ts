import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import { WATCH_TEST_ADDRESS, watchFixture } from "../apps/web/src/watch/fixture";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true"
  && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.skip(!enabled, "Opsis workspaces are disabled");

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function readable(locator: Locator) {
  const ratio = await locator.evaluate((element) => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const luminance = (values: number[]) => values.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    let background = element;
    while (background.parentElement && rgb(getComputedStyle(background).backgroundColor)[3] === 0) background = background.parentElement;
    const foreground = luminance(rgb(getComputedStyle(element).color));
    const ground = luminance(rgb(getComputedStyle(background).backgroundColor));
    return (Math.max(foreground, ground) + 0.05) / (Math.min(foreground, ground) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

async function downloaded(page: Page, button: Locator) {
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  return readFile((await download.path())!, "utf8");
}

for (const width of [320, 375, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    for (const chinese of [false, true]) {
      test.describe(`${width}px ${theme} ${chinese ? "Chinese" : "English"}`, () => {
        const c = (en: string, zh: string) => chinese ? zh : en;
        test.beforeEach(async ({ page }) => {
          await page.setViewportSize({ width, height: 812 });
          await mockPublicOpsisAccess(page);
          await page.addInitScript((theme) => { document.cookie = `opsis_theme=${theme}; Path=/`; }, theme);
        });
        async function open(page: Page, route: string) {
          await page.goto(route);
          if (chinese) await page.getByRole("button", { name: "中文", exact: true }).click();
          await expect(page.locator(".opsis[data-theme]")).toHaveAttribute("data-theme", theme);
        }

        test("Saved restore disclosures stay contained and storage advice is readable (a4-1, a4-2)", async ({ page }) => {
          await page.addInitScript(() => {
            if (navigator.storage) Object.defineProperty(navigator.storage, "persisted", { value: async () => false });
          });
          await open(page, "/saved?view=assets");
          for (const view of ["assets", "portfolio"]) {
            if (view === "portfolio") await page.goto("/saved?view=portfolio");
            const privacy = page.locator("summary").filter({ hasText: c("Privacy & storage details", "隐私与存储详情") });
            await privacy.click();
            await readable(page.getByText(c("BACKUP ADVISED", "建议备份"), { exact: true }));
            const summaries = [
              c("Have a backup? Restore your Vault", "已有备份？还原你的保险库"),
              c("Restore a backup with a recovery code", "使用恢复码还原备份"),
            ];
            for (const title of summaries) {
              const summary = page.locator("summary").filter({ hasText: title });
              await summary.click();
              await fits(page);
              const file = summary.locator("..").locator('input[type="file"]');
              await expect(file).toHaveCount(1);
              const box = await file.boundingBox();
              expect(box!.width).toBeLessThanOrEqual(1);
              expect(box!.height).toBeLessThanOrEqual(1);
            }
            await fits(page);
            for (const title of summaries) await page.locator("summary").filter({ hasText: title }).click();
            await page.locator("summary").filter({ hasText: summaries[0] }).click();
            await fits(page);
          }
        });

        test("Watch errors follow language changes and contract controls remain readable (a4-3, a4-4)", async ({ page }) => {
          let lookups = 0;
          await page.route("**/v1/private/watch/snapshot", (route) => {
            lookups++;
            return route.fulfill({ json: watchFixture() });
          });
          await open(page, "/watch");
          const form = page.locator(".watch-check-form");
          await form.locator('input:not([type="checkbox"])').fill("0x123");
          await form.getByRole("checkbox").check();
          await form.getByRole("button").click();
          const alert = page.locator(".watch-check [role=alert]");
          await expect(alert).toContainText(chinese ? "有效" : "valid 0x wallet address");
          await page.getByRole("button", { name: chinese ? "English" : "中文", exact: true }).click();
          await expect(alert).toContainText(chinese ? "valid 0x wallet address" : "有效");
          await form.getByRole("button").click();
          await page.getByRole("button", { name: chinese ? "中文" : "English", exact: true }).click();
          await expect(alert).toContainText(chinese ? "有效" : "valid 0x wallet address");
          expect(lookups).toBe(0);
          await form.locator('input:not([type="checkbox"])').fill(WATCH_TEST_ADDRESS);
          await form.getByRole("checkbox").check();
          await form.getByRole("button").click();
          const table = page.getByTestId("watch-token-table");
          await expect(table).toBeVisible();
          const copy = table.locator(".watch-copy button").first();
          expect(await copy.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
          await readable(copy);
          await expect(copy).toHaveAttribute("title", /^0x[\da-fA-F]{40}$/);
          // Quantities stay inside their own column (long balances use the short form with the exact value kept).
          for (const cell of await table.locator("tbody tr.watch-holding-row td:nth-child(2)").all()) {
            expect(await cell.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
          }
          await table.locator("..").focus();
          await expect(table.locator("..")).toBeFocused();
          await fits(page);
          await page.getByRole("button", { name: c("Open encrypted watchlist", "打开加密观察列表"), exact: true }).click();
          const access = page.locator('section[aria-labelledby="watch-access-title"]');
          const passwords = access.locator('input[type="password"]');
          await passwords.nth(0).fill("demo-watch-passphrase");
          await passwords.nth(1).fill("different-demo-passphrase");
          await access.getByRole("button").click();
          const validation = access.getByRole("alert");
          await expect(validation).toBeVisible();
          const previous = await validation.textContent();
          await page.getByRole("button", { name: chinese ? "English" : "中文", exact: true }).click();
          await expect(validation).not.toHaveText(previous!);
        });

        test("Lab validates and exports the edited CSV metadata (a5-1)", async ({ page }) => {
          test.setTimeout(60_000);
          await open(page, "/lab?view=research");
          const workbench = page.locator(".opsis-quant-workbench");
          const rows = Array.from({ length: 190 }, (_, index) => `${new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10)},${100 + index}`).join("\n");
          await workbench.getByLabel(c("CSV or JSON file", "CSV 或 JSON 文件")).setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(`date,price\n${rows}`) });
          await expect(workbench.getByRole("alert")).toBeVisible();
          const address = workbench.getByLabel(c("Contract / address", "合约 / 地址"), { exact: true });
          const symbol = workbench.getByLabel(c("Symbol", "符号"), { exact: true });
          await address.fill(`0x${"1".repeat(40)}`);
          await symbol.fill("FIRST");
          await workbench.getByLabel(c("Source", "来源"), { exact: true }).fill("Synthetic local observations");
          const run = workbench.getByRole("button", { name: c("Run local experiment", "运行本地实验"), exact: true });
          await expect(run).toBeEnabled();
          await expect(workbench.getByRole("alert")).toHaveCount(0);
          await address.fill(`0x${"2".repeat(40)}`);
          await symbol.fill("SECOND");
          await expect(workbench.locator(".opsis-quant-dataset-card")).toContainText("SECOND");
          await expect(workbench.locator(".opsis-quant-dataset-card")).not.toContainText("FIRST");
          await run.click();
          const exportButton = workbench.getByRole("button", { name: c("Export manifest", "导出清单"), exact: true });
          await expect(exportButton).toBeDisabled();
          await workbench.getByRole("checkbox", { name: c("I consent to download this manifest and local dataset.", "我同意下载此清单和本地数据集。"), exact: true }).check();
          const result = JSON.parse(await downloaded(page, exportButton));
          expect(result.dataset.instrument).toEqual({ chainId: 4663, address: `0x${"2".repeat(40)}`, symbol: "SECOND" });
          expect(result.dataset.provenance.source).toBe("Synthetic local observations");
          await symbol.fill("THIRD");
          await expect(exportButton).toHaveCount(0);
          await address.fill("0x123");
          await expect(run).toBeDisabled();
          await expect(workbench.getByRole("alert")).toBeVisible();
          await fits(page);
        });

        test("Lab workflow and schema errors are readable and localized (a5-2, a5-5)", async ({ page }) => {
          await open(page, "/lab?view=research");
          const steps = page.locator(".opsis-quant-steps span");
          await expect(steps).toHaveCount(5);
          for (const step of await steps.all()) await readable(step);
          const workbench = page.locator(".opsis-quant-workbench");
          await workbench.getByLabel(c("CSV or JSON file", "CSV 或 JSON 文件")).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
          const error = workbench.getByRole("alert");
          await expect(error).toContainText(chinese ? "必须提供 schemaVersion 1" : "schemaVersion 1 and instrument identity are required.");
          if (chinese) await expect(error).not.toContainText("are required");
          await readable(error);
          await expect(workbench.getByRole("button", { name: c("Run local experiment", "运行本地实验"), exact: true })).toBeDisabled();
          await fits(page);
        });

        test("Lab comparison preserves address and numeric columns inside its scroller (a5-3)", async ({ page }) => {
          await open(page, "/lab?view=atlas");
          for (const view of ["atlas", "surface"]) {
            if (view === "surface") await page.goto("/lab?view=surface");
            const table = page.locator(".opsis-token-comparison table");
            await expect(table.locator("tbody tr")).toHaveCount(3);
            expect(await table.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(760);
            const identity = table.locator("tbody th").first();
            expect(await identity.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(240);
            await expect(identity.locator("small")).toHaveText(/^0x[\da-fA-F]{40}$/);
            await expect(table.locator("tbody td").first()).toHaveCSS("white-space", "nowrap");
            await fits(page);
          }
        });

        test("Community Markdown carries the same ask-first choice as JSON (a5-4)", async ({ page }) => {
          await open(page, "/community");
          await page.locator("#community-attempt").fill("Compare two saved wallet checks");
          await page.locator("#community-blocker").fill("The missing activity state needs clearer wording");
          await page.getByText(c("Contact & credit (optional)", "联系方式与署名（可选）"), { exact: true }).click();
          await page.locator("#community-credit").fill("demo-account");
          for (const checked of [true, false]) {
            await page.locator(".community-ws-check input").setChecked(checked);
            await page.getByRole("button", { name: c("Save local draft", "保存本地草稿"), exact: true }).click();
            await page.getByLabel(c("Export format", "导出格式"), { exact: true }).selectOption("json");
            const json = JSON.parse(await downloaded(page, page.getByRole("button", { name: c("Export draft", "导出草稿"), exact: true })));
            await page.getByLabel(c("Export format", "导出格式"), { exact: true }).selectOption("markdown");
            const markdown = await downloaded(page, page.getByRole("button", { name: c("Export draft", "导出草稿"), exact: true }));
            expect(json.creditOptIn).toBe(checked);
            expect(markdown).toContain(c(`Ask before using this name in a changelog: ${checked ? "Yes" : "No"}`, `在更新日志中使用此名称前请先征得我的同意: ${checked ? "是" : "否"}`));
            expect(markdown.includes("demo-account")).toBe(checked);
          }
          await fits(page);
        });
      });
    }
  }
}
