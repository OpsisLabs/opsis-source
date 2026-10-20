import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
async function open(
  page: Page,
  width: number,
  theme: "light" | "dark" = "light",
) {
  await mockPublicOpsisAccess(page);
  await page.addInitScript((selectedTheme) => {
    document.cookie = `opsis_theme=${selectedTheme}; Path=/; SameSite=Strict`;
  }, theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 700 ? 812 : 900 });
  await page.goto("/privacy");
  await expect(page.locator(".opsis.opsis-terminal")).toHaveAttribute(
    "data-theme",
    theme,
  );
  await expect(page.locator("#opsis-content h1")).toHaveText("Privacy");
}

test.describe("opsis privacy reading workspace", () => {
  test.skip(!enabled);

  test("keeps the local Vault inside the browser and all original legal sections readable", async ({
    page,
  }) => {
    await open(page, 1440);
    await expect(page.locator("#opsis-content h1")).toHaveCount(1);
    await expect(page.locator(".legal-ws-local")).toContainText(
      "Encrypted local Vault",
    );
    await expect(page.locator(".legal-ws-providers")).toContainText(
      "Public data sources",
    );
    await expect(page.locator(".legal-ws-sections > section")).toHaveCount(9);
    const index = await page.locator(".legal-ws-index").boundingBox();
    const reading = await page.locator(".legal-ws-reading").boundingBox();
    const dock = await page.locator(".legal-ws-dock").boundingBox();
    expect(index!.y).toBe(reading!.y);
    expect(reading!.y).toBe(dock!.y);
    expect(index!.x + index!.width).toBeLessThanOrEqual(reading!.x);
    expect(reading!.x + reading!.width).toBeLessThan(dock!.x);
    await expect(
      page.locator(".legal-ws-flow [role=img]"),
    ).toHaveAccessibleName(/Vault stays on this device/);
    await expect(page.locator("#legal-section-02")).toContainText(
      "We do not save your question, result, or an account link on our servers.",
    );
    await expect(page.locator(".legal-ws-dock")).toContainText("OCTOBER 2026");
    await expect(page.locator(".legal-ws-dock")).not.toContainText(
      "Apr 28, 2024",
    );
  });

  test("the section index is keyboard accessible and transfers focus to the selected section", async ({
    page,
  }) => {
    await open(page, 1440);
    const link = page
      .getByRole("navigation", { name: "Document sections" })
      .getByRole("link", { name: "06 Security" });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#legal-section-06")).toBeFocused();
    await expect(link).toHaveAttribute("aria-current", "location");
    await expect(page).toHaveURL(/#legal-section-06$/);
    expect(
      await page
        .locator("#legal-section-06")
        .evaluate((element) => element.getBoundingClientRect().top),
    ).toBeGreaterThanOrEqual(64);
  });

  for (const [width, theme] of [
    [1440, "light"],
    [1440, "dark"],
    [1180, "light"],
    [1180, "dark"],
    [375, "light"],
    [375, "dark"],
    [320, "light"],
    [320, "dark"],
  ] as const) {
    test(`fits ${width}px ${theme} and passes WCAG checks`, async ({
      page,
    }) => {
      await open(page, width, theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(0);
      for (const panel of await page
        .locator(".legal-ws-index, .legal-ws-reading, .legal-ws-dock-panel")
        .all()) {
        expect(
          await panel.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
      }
      const result = await new AxeBuilder({ page })
        .include(".legal-ws-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations.map(
          (violation) => `${violation.id}: ${violation.nodes[0]?.target}`,
        ),
      ).toEqual([]);
    });
  }

  test("Chinese translates the reading controls and retains the original policy", async ({
    page,
  }) => {
    await open(page, 1440);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("隐私");
    await expect(
      page.getByRole("navigation", { name: "文档章节" }),
    ).toContainText("我们绝不收集的数据");
    await expect(page.locator(".legal-ws-flow")).toContainText(
      "加密的本地保险库",
    );
    await expect(page.locator("#legal-section-02")).toContainText(
      "我们不会在服务器上保存你的问题、结果或账户关联。",
    );
    await expect(page.locator(".legal-ws-dock")).toContainText("2026 年 10 月");
  });
});
