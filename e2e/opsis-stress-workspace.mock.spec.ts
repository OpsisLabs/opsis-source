import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true" &&
  process.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true";

async function open(page: Page, width: number, theme: "light" | "dark" = "light") {
  await mockPublicOpsisAccess(page);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 700 ? 812 : 900 });
  await page.goto("/stress-test");
  await expect(page.locator("#opsis-content h1")).toHaveText("Portfolio shocks");
}
const after = (page: Page) => page.getByTestId("stress-after");
const impact = (page: Page) => page.getByTestId("stress-impact");

test.describe("opsis preview portfolio shocks workspace", () => {
  test.skip(!enabled);

  test("holdings, shock target and scope drive the dock, chart and table from the same engine", async ({ page }) => {
    await open(page, 1440);
    await expect(after(page)).toHaveText("$7,200.00");
    await expect(impact(page)).toHaveText("-28%");
    await expect(page.getByTestId("stress-change-amount")).toHaveText("-$2,800.00");
    const chart = page.locator(".stress-ws-chart svg[role='img']");
    await expect(chart).toHaveAttribute("aria-label", /Starting value \$10,000\.00; after this scenario \$7,200\.00/);
    await expect(page.locator(".stress-ws-table tfoot")).toContainText("$7,200.00");

    // Target another holding with its radio; only that row moves.
    await page.getByRole("radio", { name: "Shock Asset B" }).check();
    await expect(after(page)).toHaveText("$9,200.00");
    await expect(page.locator(".stress-ws-dock")).toContainText("Only Asset B moves -40%");

    // The slider and the typed percentage stay in step.
    const slider = page.getByRole("slider", { name: "Hypothetical price change" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Price change (%)", { exact: true })).toHaveValue("-38");
    await expect(after(page)).toHaveText("$9,240.00");

    await page.getByRole("button", { name: "Every position", exact: true }).click();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(after(page)).toHaveText("$6,200.00");

    // Editing a value in place recalculates; an invalid value says what to fix.
    await page.getByLabel("Position 1 value in USD", { exact: true }).fill("17000");
    await expect(page.locator(".stress-ws-table tbody tr").first()).toContainText("$17,000.00");
    await page.getByLabel("Position 1 value in USD", { exact: true }).fill("abc");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(after(page)).toHaveCount(0);
  });

  test("per-position moves are typed in the Shock column and the chart switches views", async ({ page }) => {
    await open(page, 1440);
    await page.getByLabel("Different move per position").check();
    await expect(page.getByRole("slider")).toHaveCount(0);
    await page.getByLabel("Asset B move (%)").fill("+10");
    await expect(after(page)).toHaveText("$7,400.00");
    await expect(page.locator(".stress-ws-dock")).toContainText("Each position moves by the percentage you entered.");
    await expect(page.locator(".stress-ws-dock")).toContainText("Image export is unavailable");
    await page.getByRole("button", { name: "By position", exact: true }).click();
    await expect(page.locator(".stress-chart-pair")).toHaveCount(3);
    await expect(page.locator(".stress-chart-legend")).toContainText("Before");
  });

  test("dock tabs work from the keyboard and evidence keeps the method and privacy notes", async ({ page }) => {
    await open(page, 1440);
    const impactTab = page.getByRole("tab", { name: "Impact" });
    await impactTab.focus();
    await page.keyboard.press("ArrowRight");
    const evidenceTab = page.getByRole("tab", { name: "Evidence" });
    await expect(evidenceTab).toBeFocused();
    await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("stress-explanation")).toBeVisible();
    await expect(page.locator("#stress-panel-evidence")).toContainText("Local calculations · No account · No provider requests");
    await expect(page.locator("#stress-panel-impact")).toBeHidden();
  });

  for (const [width, theme] of [[1440, "light"], [1180, "dark"], [375, "light"], [375, "dark"]] as const) {
    test(`fits ${width}px ${theme} without sideways scroll and passes WCAG checks`, async ({ page }) => {
      await open(page, width, theme);
      await expect(after(page)).toHaveText("$7,200.00");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const panel of await page.locator(".stress-ws-panel").all()) {
        expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      }
      const results = await new AxeBuilder({ page })
        .include(".stress-ws-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);
    });
  }

  test("Chinese labels the workspace and keeps the numbers", async ({ page }) => {
    await open(page, 1440);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("投资组合冲击");
    await expect(page.locator(".stress-ws-portfolio h2")).toHaveText("投资组合");
    await expect(page.getByRole("tab", { name: "影响" })).toBeVisible();
    await expect(after(page)).toHaveText("US$7,200.00");
  });
});
