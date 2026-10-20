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
  await page.goto("/terms");
  await expect(page.locator(".opsis.opsis-terminal")).toHaveAttribute(
    "data-theme",
    theme,
  );
  await expect(page.locator("#opsis-content h1")).toHaveText("Terms");
}

test.describe("opsis terms reading workspace", () => {
  test.skip(!enabled);

  test("keeps the read-only boundary and existing terms instead of illustrative legal copy", async ({
    page,
  }) => {
    await open(page, 1440);
    await expect(page.locator("#opsis-content h1")).toHaveCount(1);
    await expect(page.locator(".legal-ws-boundary")).toContainText(
      "Opsis does not sign or broadcast transactions",
    );
    await expect(page.locator(".legal-ws-sections > section")).toHaveCount(9);
    const reading = await page.locator(".legal-ws-reading").boundingBox();
    const dock = await page.locator(".legal-ws-dock").boundingBox();
    expect(reading!.y).toBe(dock!.y);
    expect(reading!.x + reading!.width).toBeLessThan(dock!.x);
    await expect(page.locator("#legal-section-03")).toContainText(
      "Opsis does not execute, sign, submit, or broadcast blockchain transactions.",
    );
    await expect(page.locator(".legal-ws-dock")).toContainText("AUGUST 2026");
    await expect(page.locator(".legal-ws-dock")).not.toContainText(
      "1.0 (review copy)",
    );
    await expect(
      page.getByRole("link", { name: "Privacy and contact details" }),
    ).toHaveAttribute("href", "/privacy#legal-section-08");
  });

  test("contact details open the preserved Privacy contact section", async ({
    page,
  }) => {
    await open(page, 1440);
    await page
      .getByRole("link", { name: "Privacy and contact details" })
      .click();
    await expect(page.locator("#opsis-content h1")).toHaveText("Privacy");
    await expect(page.locator("#legal-section-08")).toBeFocused();
    await expect(
      page
        .getByRole("navigation", { name: "Document sections" })
        .getByRole("link", { name: "08 Contact" }),
    ).toHaveAttribute("aria-current", "location");
  });

  test("the boundary and section index transfer focus from keyboard navigation", async ({
    page,
  }) => {
    await open(page, 1440);
    await page
      .getByRole("link", { name: "Read the read-only boundary" })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#legal-section-03")).toBeFocused();
    await expect(page).toHaveURL(/#legal-section-03$/);
    const link = page
      .getByRole("navigation", { name: "Document sections" })
      .getByRole("link", { name: "09 Liability" });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#legal-section-09")).toBeFocused();
    await expect(link).toHaveAttribute("aria-current", "location");
    expect(
      await page
        .locator("#legal-section-09")
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

  test("Chinese translates the document controls while retaining the original terms", async ({
    page,
  }) => {
    await open(page, 1440);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("条款");
    await expect(
      page.getByRole("navigation", { name: "文档章节" }),
    ).toContainText("只读边界");
    await expect(page.locator(".legal-ws-boundary")).toContainText(
      "Opsis 不会签署或广播交易",
    );
    await expect(page.locator("#legal-section-03")).toContainText(
      "Opsis 不会执行、签署、提交或广播区块链交易。",
    );
    await expect(page.locator(".legal-ws-dock")).toContainText("2026 年 8 月");
  });
});
