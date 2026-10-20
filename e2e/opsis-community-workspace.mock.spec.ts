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
  await page.goto("/community");
  await expect(page.locator(".opsis.opsis-terminal")).toHaveAttribute(
    "data-theme",
    theme,
  );
  await expect(page.locator("#opsis-content h1")).toHaveText("Community");
}
test.describe("opsis preview community workspace", () => {
  test.skip(!enabled);
  test("preview, keyboard save and exports remain local and clear on reload", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("/v1/") &&
        !request.url().endsWith("/v1/private/opsis/access")
      )
        requests.push(request.url());
    });
    await open(page);
    const exportButton = page.getByRole("button", {
      name: "Export draft",
      exact: true,
    });
    await expect(exportButton).toBeDisabled();
    await page.getByLabel("Topic", { exact: true }).selectOption("feature");
    await page.getByLabel("Summary").fill("Compare two saved checks");
    await page
      .getByLabel("Details (optional)")
      .fill("The missing coverage was hard to understand");
    await expect(page.locator(".community-ws-preview-paper")).toContainText(
      "Compare two saved checks",
    );
    await page.getByRole("button", { name: "Save local draft" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText(
      "Saved for this session",
    );
    await expect(exportButton).toBeEnabled();
    await page.getByLabel("Export format").selectOption("json");
    const download = page.waitForEvent("download");
    await exportButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("opsis-suggestion.json");
    const stream = await file.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const content = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    expect(content.topic).toBe("feature");
    expect(content.whatWereYouTrying).toBe("Compare two saved checks");
    expect(content.whatStoppedYou).toBe(
      "The missing coverage was hard to understand",
    );
    await page
      .getByLabel("Details (optional)")
      .fill("Edited feedback must be saved again");
    await expect(exportButton).toBeDisabled();
    await page.getByRole("button", { name: "Save local draft" }).click();
    await page.getByLabel("Export format").selectOption("markdown");
    const markdown = page.waitForEvent("download");
    await exportButton.click();
    expect((await markdown).suggestedFilename()).toBe("opsis-suggestion.md");
    expect(
      await page.evaluate(
        () =>
          JSON.stringify(localStorage) +
          JSON.stringify(sessionStorage) +
          document.cookie,
      ),
    ).not.toContain("Compare two saved checks");
    expect(requests).toEqual([]);
    await page.reload();
    await expect(page.getByLabel("Summary")).toHaveValue("");
    await expect(exportButton).toBeDisabled();
  });
  test("changelog filters real reviewed entries and exposes their original evidence", async ({
    page,
  }) => {
    await open(page);
    await expect(
      page
        .locator(".opsis-desktop-rail")
        .getByRole("link", { name: "Keep watch", exact: true }),
    ).toHaveAttribute("href", "/watch");
    await expect(
      page.locator('.opsis-desktop-rail a[href="/saved"]'),
    ).toHaveCount(1);
    await expect(page.locator(".community-ws-timeline > li")).toHaveCount(5);
    await expect(
      page.locator(".community-ws-timeline time").first(),
    ).toHaveAttribute("datetime", "2026-10-14");
    const form = await page.locator(".community-ws-form").boundingBox();
    const timeline = await page
      .locator(".community-ws-changelog")
      .boundingBox();
    expect(form!.y).toBe(timeline!.y);
    expect(form!.x + form!.width).toBeLessThan(timeline!.x);
    await page.getByLabel("Changelog topic").selectOption("lab");
    await expect(page.locator(".community-ws-timeline > li")).toHaveCount(1);
    await page.getByText("View details", { exact: true }).click();
    await expect(page.locator(".community-ws-timeline")).toContainText(
      "rc/26-opsis-workspaces/1",
    );
    await page
      .getByLabel("Search changelog")
      .fill("not in the reviewed entries");
    await expect(page.getByRole("status")).toContainText(
      "No reviewed updates match these filters",
    );
    await page.getByLabel("Search changelog").fill("");
    await page.getByLabel("Changelog topic").selectOption("all");
    await page.getByRole("button", { name: "Show all 9 updates" }).click();
    await expect(page.locator(".community-ws-timeline > li")).toHaveCount(9);
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
          .locator(".community-ws .utility-ws-panel")
          .all())
          expect(
            await panel.evaluate((el) => el.scrollWidth - el.clientWidth),
          ).toBeLessThanOrEqual(1);
        const result = await new AxeBuilder({ page })
          .include(".community-ws")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(result.violations.map((violation) => violation.id)).toEqual([]);
      });
    }
  test("Chinese translates draft, preview, filters and changelog", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("社区");
    await expect(
      page.getByRole("heading", { name: "预览", exact: true }),
    ).toBeVisible();
    await page.getByLabel("搜索更新日志").fill("持有人");
    await expect(page.locator(".community-ws-timeline > li")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "导出草稿" })).toBeDisabled();
  });
});
