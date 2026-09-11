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
  const primary = page.getByRole("button", {
    name: "Use my own values",
    exact: true,
  });
  await primary.hover();
  await expect(primary).toHaveCSS("background-color", "rgb(255, 141, 95)");
  await expect(primary).toHaveCSS("color", "rgb(32, 27, 24)");
  const selected = page.getByRole("button", {
    name: "One position",
    exact: true,
  });
  await selected.hover();
  await expect(selected).toHaveCSS("background-color", "rgb(255, 141, 95)");
  await expect(selected).toHaveCSS("color", "rgb(32, 27, 24)");
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
  await page.locator(".stress-breakdown summary").click();
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

test("portfolio stress test explains changes and keeps dial, typed values and charts in sync", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  const explanation = page.getByTestId("stress-explanation");
  await expect(page.locator(".stress-heading h1")).toHaveCSS(
    "font-weight",
    "500",
  );
  await expect(page.getByTestId("stress-after")).toHaveCSS(
    "font-weight",
    "400",
  );
  await expect(page.locator(".stress-dial-fill")).toHaveCSS(
    "stroke-width",
    "3px",
  );
  const number = page.getByLabel("Price change (%)", { exact: true });
  const slider = page.getByRole("slider", {
    name: "Hypothetical price change",
  });
  await expect(explanation).toContainText("Why your total drops 28%");
  await expect(explanation).toContainText("Asset A makes up 70%");
  await expect(explanation).toContainText(
    "$7,000.00 affected × 40% move ≈ $2,800.00 change",
  );
  const proportions = await page
    .locator(".stress-stack")
    .evaluate((el) =>
      Array.from(el.children).map(
        (child) =>
          child.getBoundingClientRect().width /
          el.getBoundingClientRect().width,
      ),
    );
  expect(proportions[0]).toBeCloseTo(0.7, 2);
  expect(proportions[1]).toBeCloseTo(0.2, 2);
  expect(proportions[2]).toBeCloseTo(0.1, 2);
  await number.fill("30");
  await expect(slider).toHaveAttribute("aria-valuenow", "30");
  await expect(page.getByTestId("stress-after")).toHaveText("$12,100.00");
  await expect(explanation).toContainText("Why your total rises 21%");
  await expect(page.getByTestId("stress-change-amount")).toContainText(
    "Up $2,100.00",
  );
  for (const invalid of ["", "-", "101", "1.5", "1e2"]) {
    await number.fill(invalid);
    await expect(number).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("stress-after")).toHaveCount(0);
    await expect(explanation).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText("whole-number move");
  }
  await page
    .getByRole("button", { name: "Price change (%)", exact: true })
    .click();
  await expect(number).toBeFocused();
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(number).toHaveValue("-100");
  await expect(page.getByTestId("stress-after")).toHaveText("$3,000.00");
  await page.keyboard.press("PageUp");
  await expect(number).toHaveValue("-90");
  await page.keyboard.press("ArrowRight");
  await expect(number).toHaveValue("-89");
  const bounds = await slider.boundingBox();
  if (!bounds) throw new Error("Dial not visible");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + (bounds.height * 33) / 185,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + (bounds.width * 275) / 300,
    bounds.y + (bounds.height * 158) / 185,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(number).toHaveValue("100");
  await number.fill("0");
  await expect(explanation).toContainText("Why your total stays the same");
  await expect(explanation).toContainText("You chose no price change");
  await page
    .getByRole("button", { name: "Every position", exact: true })
    .click();
  await number.fill("-40");
  await expect(explanation).toContainText("Every position moves -40%");
  await expect(page.getByTestId("stress-after")).toHaveText("$6,000.00");
});

test("portfolio stress test supports the touch dial on a narrow screen", async ({
  browser,
  baseURL,
}) => {
  test.skip(!enabled);
  if (!baseURL) throw new Error("Stress test requires a configured base URL");
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("/stress-test");
    const slider = page.getByRole("slider", {
      name: "Hypothetical price change",
    });
    await slider.scrollIntoViewIfNeeded();
    const bounds = await slider.boundingBox();
    if (!bounds) throw new Error("Touch dial not visible");
    await page.touchscreen.tap(
      bounds.x + bounds.width / 2,
      bounds.y + (bounds.height * 33) / 185,
    );
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await expect(
      page.getByLabel("Price change (%)", { exact: true }),
    ).toHaveValue("0");
    await expect(page.getByTestId("stress-after")).toHaveText("$10,000.00");
    await expect(page.getByTestId("stress-explanation")).toContainText(
      "You chose no price change",
    );
  } finally {
    await context.close();
  }
});

test("portfolio stress test explains zero holdings and rounded tiny positions without inventing a loss", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  await page
    .getByRole("button", { name: "Use my own values", exact: true })
    .click();
  await page.getByLabel("Position 1 value in USD", { exact: true }).fill("0");
  await expect(page.getByTestId("stress-explanation")).toContainText(
    "Asset A makes up 0%",
  );
  await expect(page.getByTestId("stress-explanation")).toContainText(
    "Why your total stays the same",
  );
  await page
    .getByLabel("Position 1 value in USD", { exact: true })
    .fill("0.01");
  await expect(page.getByTestId("stress-explanation")).toContainText(
    "$0.01 affected × 40% move ≈ $0.00 change",
  );
  await expect(page.getByTestId("stress-explanation")).toContainText(
    "round to cents",
  );
  await page
    .getByLabel("Position 1 value in USD", { exact: true })
    .fill("0.02");
  await expect(page.getByTestId("stress-explanation")).toContainText(
    "Why your total falls slightly",
  );
  await expect(page.getByTestId("stress-change-amount")).toContainText(
    "Down $0.01",
  );
  await page
    .getByRole("button", { name: "Done — see my scenario", exact: true })
    .click();
  await expect(page.locator(".stress-editor")).toHaveCount(0);
  await expect(page.locator(".stress-heading")).toBeFocused();
});
