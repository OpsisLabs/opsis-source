import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_ORIGIN } from "./support/origin";
const enabled = process.env.VITE_SITUATION_ROOM_ENABLED === "true";
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "chainscout_product_tour_seen_v1", value: "1", url: APP_ORIGIN },
  ]);
});
test("situation room closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/situation-room");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator(".situation-surface")).toHaveCount(0);
});
test("situation room selects reports, compares windows, opens insight and exports sources", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90000);
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(APP_ORIGIN) && !r.url().startsWith("data:"))
      external.push(r.url());
  });
  await page.goto("/situation-room");
  await expect(page.locator(".situation-surface h1")).toHaveText(
    "Situation Room.",
  );
  await expect(page.locator(".sr-edition")).toContainText("captured data");
  expect(await page.locator(".sr-event").count()).toBe(7);
  await page.locator("#sequence-ecb").click();
  await expect(page.locator("#event-ecb")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#window-60").click();
  await expect(page.locator(".sr-reactions")).toContainText("−60m");
  for (const id of ["weth", "cbbtc", "pons"])
    await page.locator("#asset-" + id).click();
  await expect(page.locator(".sr-empty")).toContainText("Choose an asset");
  await page.locator("#asset-weth").click();
  await page.locator("#ai-insight").click();
  await expect(page.locator(".sr-ai-note")).toContainText("prepared");
  await page.locator("#insight-price-action").click();
  await expect(page.locator(".sr-ai-price")).toHaveCount(3);
  await expect(page.locator(".sr-insight")).toContainText(
    "No causal effect is established",
  );
  await page.locator("#insight-watch-next").click();
  await expect(page.locator(".sr-insight h3")).toHaveText("What to check next");
  await page.keyboard.press("Escape");
  await page.locator("#investigate").click();
  await expect(page.getByRole("dialog")).toContainText("European Central Bank");
  await expect(page.locator(".situation-surface > main")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(page.locator(".sr-illustration-note")).toContainText("Weiss");
  await page.locator("#save-event").click();
  await page.locator("#close-modal").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#save-event")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#investigate")).toBeFocused();
  await page.locator("#brief").click();
  const download = page.waitForEvent("download");
  await page.locator("#download-brief").click();
  expect((await download).suggestedFilename()).toMatch(/situation-brief/);
  await page.keyboard.press("Escape");
  await page.locator("#filter-macro").click();
  await expect(page.locator(".sr-event")).toHaveCount(1);
  await page.locator("#filter-all").click();
  const photos = await page
    .locator(".sr-event-photo img")
    .evaluateAll((imgs) =>
      imgs.every(
        (img) =>
          (img as HTMLImageElement).complete &&
          (img as HTMLImageElement).naturalWidth > 0,
      ),
    );
  expect(photos).toBe(true);
  await page.locator("#method").click();
  await expect(page.getByRole("dialog")).toContainText(
    "does not continuously refresh",
  );
  await page.keyboard.press("Escape");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("situation room eth market brief shows captured single-venue data, dated sources and stress-test handoff", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/situation-room");
  const brief = page.getByTestId("eth-market-brief");
  await expect(brief).toBeVisible();
  await expect(brief).toContainText("Captured");
  await expect(brief).toContainText("not live");
  await expect(brief).toContainText("Coinbase ETH/USD capture only");
  await expect(page.getByTestId("eth-market-price")).toContainText("Last $2,606.31");
  await expect(page.getByTestId("eth-market-price")).toContainText("24h +6.67%");
  const context = page.getByTestId("eth-market-context");
  await expect(context).toContainText("Calendar context · 11 Sep");
  await expect(context).toContainText("Earlier policy context · 3 Sep");
  await expect(
    context.getByRole("link", { name: "Source (2026-09-11)" }),
  ).toHaveAttribute(
    "href",
    "https://fred.stlouisfed.org/releases/calendar?rid=10&y=2026",
  );
  const cta = brief.getByRole("link", { name: "Test your ETH exposure" });
  await expect(cta).toHaveAttribute("href", "/stress-test");
  await expect(cta).not.toHaveAttribute("target", "_blank");

  const canvas = brief.locator("canvas");
  const desktopBox = await canvas.boundingBox();
  expect(desktopBox?.height).toBeGreaterThanOrEqual(139);
  expect(desktopBox?.height).toBeLessThanOrEqual(151);

  await page.setViewportSize({ width: 390, height: 900 });
  const columns = await brief
    .locator(".sr-eth-panels")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
  expect(columns).toBe(1);
  const mobileBox = await canvas.boundingBox();
  expect(mobileBox?.height).toBeGreaterThanOrEqual(119);
  expect(mobileBox?.height).toBeLessThanOrEqual(151);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("situation room preserves shared navigation, mobile layout and accessible controls", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90000);
  await page.goto("/situation-room");
  await expect(page.locator(".situation-surface")).toBeVisible();
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const results = await new AxeBuilder({ page })
    .include(".situation-surface")
    .analyze();
  expect(
    results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
  await page.locator("#sweep").click();
  await expect(page.locator("#sweep")).toContainText("Pause");
  await page.locator("#sweep").click();
  await page.locator("#focus").click();
  await expect(page.locator(".sr-events")).not.toBeVisible();
  await page.locator("#focus").click();
  await page.locator('a[href="/app"]').first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator(".situation-surface")).toHaveCount(0);
});
test("situation room retains reports when WebGL is unavailable", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: string,
      ...args: unknown[]
    ) {
      if (kind.includes("webgl")) return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto("/situation-room");
  await expect(page.locator(".sr-error")).toContainText("globe is unavailable");
  await page.locator("#sequence-ecb").click();
  await page.locator("#rotate").click();
  await page.locator("#reset").click();
  await page.locator("#sweep").click();
  await page.locator("#ai-insight").click();
  await expect(page.locator(".sr-insight h2")).toContainText("ECB");
});
