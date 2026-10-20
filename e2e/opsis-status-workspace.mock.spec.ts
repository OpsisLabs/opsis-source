import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
async function open(
  page: Page,
  width = 1440,
  theme: "light" | "dark" = "light",
) {
  await mockPublicOpsisAccess(page);
  await page.addInitScript((selectedTheme) => {
    document.cookie = `opsis_theme=${selectedTheme}; Path=/; SameSite=Strict`;
  }, theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 700 ? 812 : 1000 });
  await page.goto("/status");
  await expect(page.locator(".opsis.opsis-terminal")).toHaveAttribute(
    "data-theme",
    theme,
  );
  await expect(page.locator("#opsis-content h1")).toHaveText("Data status");
}
test.describe("opsis preview data status workspace", () => {
  test.skip(!enabled);
  test("configuration is not a provider-health check; rows select evidence by keyboard", async ({
    page,
  }) => {
    const providerRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/v1/") &&
        !request.url().endsWith("/v1/private/opsis/access")
      )
        providerRequests.push(request.url());
    });
    await open(page);
    const registry = page.getByRole("region", { name: "Capability registry" });
    await expect(registry.getByRole("rowheader").first()).toContainText(
      "Research",
    );
    await expect(page.locator("#status-ws-evidence")).toContainText(
      "No dated provider check recorded",
    );
    await expect(
      registry.getByRole("row").filter({ hasText: "Research" }).first(),
    ).toContainText("Unknown");
    const row = registry.getByRole("button", {
      name: "Stock-token check",
      exact: true,
    });
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(row).toBeFocused();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    const dock = page.locator("#status-ws-evidence");
    await expect(
      dock.getByRole("heading", { name: "Stock-token check" }),
    ).toBeVisible();
    await expect(dock).toContainText("Not enabled · server flag off");
    await expect(dock.getByRole("link", { name: "Retry in tool" })).toHaveCount(
      0,
    );
    await registry
      .getByRole("button", { name: "Research", exact: true })
      .click();
    await expect(
      dock.getByRole("link", { name: "Retry in tool" }),
    ).toHaveAttribute("href", "/research");
    await expect(dock).toContainText("does not probe providers");
    expect(providerRequests).toEqual([]);
  });
  test("search and availability filters keep unknown and disabled states distinct", async ({
    page,
  }) => {
    await open(page);
    await page.getByLabel("Filter availability").selectOption("not-enabled");
    await expect(
      page
        .locator(".status-ws-table tbody .utility-ws-state")
        .filter({ hasText: "Unknown" }),
    ).toHaveCount(0);
    await expect(page.locator(".status-ws-table tbody")).toContainText(
      "Not enabled",
    );
    await page.getByLabel("Search sources or tools").fill("no matching source");
    await expect(page.getByRole("status")).toHaveText(
      "No sources match these filters.",
    );
    await page.getByLabel("Search sources or tools").fill("");
    await page.getByLabel("Filter availability").selectOption("all");
    await page
      .getByRole("button", { name: "Perp venue directory", exact: true })
      .click();
    await expect(page.locator(".status-ws-timeline time")).toHaveText(
      "2026-10-12",
    );
    await expect(page.locator("#status-ws-evidence")).toContainText("not live");
    await page.getByText("What do these states mean?", { exact: true }).click();
    await expect(page.locator(".utility-ws-legend")).toContainText("Available");
    await expect(page.locator(".utility-ws-legend")).toContainText(
      "Unavailable",
    );
    await expect(page.locator(".utility-ws-legend")).toContainText("Stale");
  });
  for (const width of [1440, 1180, 375, 320])
    for (const theme of ["light", "dark"] as const) {
      test(`fits ${width}px ${theme} with WCAG checks`, async ({ page }) => {
        await open(page, width, theme);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(0);
        for (const panel of await page
          .locator(".status-ws .utility-ws-panel")
          .all())
          expect(
            await panel.evaluate((el) => el.scrollWidth - el.clientWidth),
          ).toBeLessThanOrEqual(1);
        const result = await new AxeBuilder({ page })
          .include(".status-ws")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(result.violations.map((violation) => violation.id)).toEqual([]);
      });
    }
  test("Chinese labels registry controls and evidence", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("数据状态");
    await page.getByLabel("搜索来源或工具").fill("研究");
    await page.getByRole("button", { name: "研究", exact: true }).click();
    await expect(page.locator("#status-ws-evidence")).toContainText(
      "运行状况及完整覆盖情况尚未验证",
    );
    await expect(
      page.getByRole("link", { name: "在工具中重试" }),
    ).toBeVisible();
  });
});
