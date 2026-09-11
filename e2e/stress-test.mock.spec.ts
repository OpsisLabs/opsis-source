import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true";
test("portfolio stress test closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/stress-test");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator(".stress-page")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Stress Test/ })).toHaveCount(0);
});

test("portfolio stress test instantly compares allocation and price moves without a wallet or provider", async ({
  page,
}) => {
  test.skip(!enabled);
  const requests: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (/\/v1\//.test(r.url())) requests.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/stress-test");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await expect(page.getByTestId("stress-impact")).toHaveText("-28%");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Illustrative portfolio · not live holdings"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "40 / 30 / 30 split", exact: true })
    .click();
  await expect(page.getByTestId("stress-after")).toHaveText("$8,400.00");
  await expect(page.getByTestId("stress-impact")).toHaveText("-16%");
  await page
    .getByRole("button", { name: "Every position", exact: true })
    .click();
  await expect(page.getByTestId("stress-after")).toHaveText("$6,000.00");
  await expect(
    page.getByText(/Changing the allocation alone cannot soften/),
  ).toBeVisible();
  await page.getByRole("slider", { name: "Hypothetical price change" }).focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("stress-after")).toHaveText("$0.00");
  await page.keyboard.press("End");
  await expect(page.getByTestId("stress-after")).toHaveText("$20,000.00");
  await page.getByRole("button", { name: "No change", exact: true }).click();
  await expect(page.getByTestId("stress-impact")).toHaveText("0%");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("portfolio stress test validates manual values and clears them without persisting or uploading", async ({
  page,
}) => {
  test.skip(!enabled);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/v1\//.test(r.url())) requests.push(r.url());
  });
  await page.goto("/stress-test");
  await page
    .getByRole("button", { name: "Use my own values", exact: true })
    .click();
  await page
    .getByLabel("Position 1 name", { exact: true })
    .fill("PRIVATE-PORTFOLIO-NAME");
  await page.getByLabel("Position 1 value in USD", { exact: true }).fill("1e5");
  await expect(page.getByTestId("stress-after")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Do not use commas");
  await expect(
    page.getByRole("button", { name: "Preview share card" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Position 1 value in USD", { exact: true })
    .fill("0.01");
  await expect(page.getByTestId("stress-after")).toHaveText("$3,000.01");
  await page.getByLabel("Position 1 name", { exact: true }).fill(" ");
  await expect(page.getByRole("alert")).toContainText(
    "name of 1–40 characters",
  );
  await page
    .getByLabel("Position 1 name", { exact: true })
    .fill("PRIVATE-PORTFOLIO-NAME");
  await page.getByRole("button", { name: "Clear my values" }).click();
  await expect(page.getByTestId("stress-after")).toHaveCount(0);
  await expect(page.getByText("PRIVATE-PORTFOLIO-NAME")).toHaveCount(0);
  await page.getByRole("button", { name: "Add a position" }).click();
  await page.getByLabel("Position 1 value in USD", { exact: true }).fill("100");
  await expect(page.getByTestId("stress-after")).toHaveText("$60.00");
  await page.reload();
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("portfolio stress test exports a CSP-compatible image and invalidates old previews", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  await page.evaluate(() => {
    const meta = document.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = "img-src 'self' data:";
    document.head.append(meta);
  });
  const create = page.getByRole("button", { name: "Preview share card" });
  await create.click();
  const preview = page.getByRole("img", {
    name: "Portfolio stress-test share card preview",
  });
  await expect(preview).toBeVisible();
  expect(
    await preview.evaluate(
      (img: HTMLImageElement) =>
        img.complete && img.naturalWidth === 1200 && img.naturalHeight === 1200,
    ),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download image" }).click();
  expect((await download).suggestedFilename()).toBe(
    "chainscout-stress-test.png",
  );
  await page.getByLabel("Include total portfolio values in the image").check();
  await expect(preview).toHaveCount(0);
  await create.click();
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "-30%", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null);
    };
  });
  await create.click();
  await expect(page.getByRole("alert")).toContainText("could not be created");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,900.00");
});

test("portfolio stress test is bilingual, responsive and accessible", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  await page
    .getByRole("button", { name: "Use my own values", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch language to 简体中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator(".stress-heading h1")).not.toHaveText(
    "What happens if the market moves?",
  );
  await expect(page.getByTestId("stress-impact")).toHaveText("-28%");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 850 });
  const mobileAxe = await new AxeBuilder({ page }).analyze();
  expect(
    mobileAxe.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.locator(".stress-table-wrap").focus();
  await expect(page.locator(".stress-table-wrap")).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".stress-bar i")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});
