import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_ORIGIN } from "./support/origin";
const enabled = process.env.VITE_KOL_TRACKER_ENABLED === "true";
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "chainscout_product_tour_seen_v1", value: "1", url: APP_ORIGIN },
  ]);
});
test("kol tracker closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/kol-tracker");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator(".kol-surface")).toHaveCount(0);
});
test("kol tracker sources, filters, saved receipts, comparison, timeline and export", async ({
  page,
}) => {
  test.skip(!enabled);
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(APP_ORIGIN) && !r.url().startsWith("data:"))
      external.push(r.url());
  });
  await page.goto("/kol-tracker");
  await expect(page.locator(".kol-surface h1")).toHaveText("KOL Tracker.");
  await expect(page.locator(".kol-call")).toHaveCount(13);
  await expect(page.locator(".kol-inspector")).toContainText("$100K+");
  expect(
    await page
      .locator(".kol-avatar")
      .evaluateAll((images) =>
        images.every(
          (i) =>
            i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await expect(page.locator(".kol-inspector a").first()).toHaveAttribute(
    "href",
    "https://x.com/CryptoKaleo",
  );
  await page.locator("#kol-profile-ansem").click();
  await expect(page.locator(".kol-call")).toHaveCount(5);
  await page
    .getByLabel("Call type", { exact: true })
    .selectOption("Self-reported holdings");
  await expect(page.locator(".kol-call")).toHaveCount(1);
  await page
    .getByLabel("Inspect call 2093110596522697054", { exact: true })
    .click();
  await page.locator("#kol-explain").click();
  await expect(page.locator("#kol-insight")).toContainText(
    "not evidence of wallet ownership",
  );
  await expect(page.locator("#kol-insight")).toContainText(
    "Prepared AI context",
  );
  await page.getByLabel("Save selected receipt", { exact: true }).click();
  await page.locator("#kol-tab-saved").click();
  await expect(page.locator(".kol-call")).toHaveCount(1);
  await page.locator("#kol-tab-coins").click();
  await expect(page.locator(".kol-coin-card")).toHaveCount(7);
  await page.locator("#kol-tab-compare").click();
  await expect(page.locator(".kol-compare-card")).toHaveCount(2);
  await page
    .locator(".kol-compare-card")
    .last()
    .getByRole("button", { name: "Inspect conditions" })
    .click();
  await expect(page.locator(".kol-inspector")).toContainText("Conditional");
  await page.locator("#kol-tab-timeline").click();
  await expect(page.locator(".kol-timeline-chart canvas")).toHaveCount(1);
  await expect(page.locator(".kol-timeline-list button")).toHaveCount(13);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download source receipt" }).click();
  expect((await download).suggestedFilename()).toContain(
    "chainscout-call-2090175223530209549",
  );
  await page.locator("#kol-tab-feed").click();
  await page.getByLabel("Search KOL or token").fill("uncoveredasset");
  await expect(page.locator(".kol-empty")).toContainText(
    "No matching source posts",
  );
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Watch KOL", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("Find reviewed KOL")
    .fill("not-covered");
  await expect(page.getByRole("dialog")).toContainText(
    "No reviewed profile found",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("kol tracker mobile, Chinese and accessible controls", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/kol-tracker");
  await expect(page.locator(".kol-surface h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.locator("#kol-profile-pentoshi").click();
  await expect(page.locator(".kol-call")).toHaveCount(4);
  const axe = await new AxeBuilder({ page })
    .include(".kol-surface")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Switch language to 简体中文" })
    .first()
    .click();
  await expect(page.locator(".kol-surface h1")).toHaveText("KOL 追踪器.");
  await page.locator("#kol-tab-coins").click();
  await expect(page.locator(".kol-center h2")).toHaveText("谁在讨论什么");
});
