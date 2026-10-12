import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true";
test("portfolio stress test closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/stress-test");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator(".stress-page")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Portfolio shocks/ })).toHaveCount(0);
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
  // WebKit may still be completing its smooth scroll after hover() returns.
  // Reposition the pointer before each sample; keep the exact contrast assertion.
  await expect
    .poll(async () => {
      await primary.hover();
      return primary.evaluate((el) => getComputedStyle(el).backgroundColor);
    })
    .toBe("rgb(255, 141, 95)");
  await expect(primary).toHaveCSS("color", "rgb(32, 27, 24)");
  const selected = page.getByRole("button", {
    name: "One position",
    exact: true,
  });
  await expect
    .poll(async () => {
      await selected.hover();
      return selected.evaluate((el) => getComputedStyle(el).backgroundColor);
    })
    .toBe("rgb(255, 141, 95)");
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
    "opsis-stress-test.png",
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

const passphrase = "test-only-stress-passphrase";
const importedAsset = "Stress Import Card";
const manualAsset = "Stress Manual Card";

async function addVaultAsset(
  page: Page,
  name: string,
  quantity: string,
  value: string,
) {
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill(name);
  await page.getByLabel("IDENTIFIER / CONTRACT / SKU").fill(`stress-${name}`);
  await page.getByLabel("LOT 1 QUANTITY").fill(quantity);
  await page.getByLabel("PRICE PER UNIT").fill("200");
  await page.getByLabel("ACQUIRED DATE").fill("2026-01-01");
  await page.getByLabel("PRIVATE NOTES").fill("Test-only import value");
  await page.getByLabel("OWNER PRINTING / VARIANT").fill("Test printing");
  await page.getByLabel("OWNER CONDITION").selectOption("near-mint");
  await page
    .getByRole("button", { name: "ADD FIRST DATED REFERENCE" })
    .click();
  await page.getByLabel("REFERENCE 1 VALUE").fill(value);
  await page.getByLabel("REFERENCE 1 CURRENCY").fill("USD");
  await page.getByLabel("REFERENCE 1 OBSERVED DATE").fill("2026-05-01");
  await page
    .getByLabel("REFERENCE 1 HTTPS SOURCE URL")
    .fill("https://example.com/stress-reference");
  await page.getByLabel("REFERENCE 1 SOURCE LABEL").fill("Test reference");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function createVaultWithReference(page: Page) {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await addVaultAsset(page, importedAsset, "1", "250.00");
  await addVaultAsset(page, manualAsset, "2", "200.00");
}

async function openImporter(page: Page) {
  const importer = page
    .locator("details.stress-advanced")
    .filter({ hasText: "Import selected values from local Vault" });
  const open = await importer.evaluate(
    (element) => (element as HTMLDetailsElement).open,
  );
  if (!open) await importer.locator("summary").click();
  return importer;
}

async function unlockImporter(page: Page, value = passphrase) {
  const importer = await openImporter(page);
  await importer.getByLabel("Vault passphrase").fill(value);
  await importer
    .getByRole("button", { name: "Unlock and choose" })
    .click();
  return importer;
}

test("portfolio stress test compares current and proposed allocations with the same total", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  await page
    .getByRole("button", { name: "Compare allocations", exact: true })
    .click();
  const panel = page.getByTestId("stress-compare");
  await expect(panel).toBeVisible();
  const weightA = panel.getByLabel("Asset A proposed weight (%)");
  // Default proposed mix mirrors the current one, but Asset A still moves -40%,
  // so the reason must not claim that no position moves.
  await expect(page.getByTestId("stress-compare-difference")).toHaveText(
    "$0.00",
  );
  await expect(page.getByTestId("stress-compare-reason")).toContainText(
    "Both mixes are identical",
  );
  await expect(page.getByTestId("stress-compare-reason")).not.toContainText(
    "No position moves",
  );
  await expect(panel).toContainText("Starting total held constant");
  await weightA.fill("50");
  await panel.getByLabel("Asset B proposed weight (%)").fill("30");
  await panel.getByLabel("Asset C proposed weight (%)").fill("10");
  await expect(panel.getByRole("alert").first()).toContainText(
    "exactly 100%",
  );
  await expect(page.getByTestId("stress-compare-difference")).toHaveCount(0);

  await weightA.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("40");
  await panel.getByLabel("Asset B proposed weight (%)").fill("30");
  await panel.getByLabel("Asset C proposed weight (%)").fill("30");
  await expect(page.getByTestId("stress-compare-difference")).toHaveText(
    "+$1,200.00",
  );
  await expect(page.getByTestId("stress-compare-reason")).toContainText(
    "Asset A changes the scenario outcome the most",
  );

  // The dense allocation table sits behind a labelled disclosure with a named
  // scrollable region.
  await panel
    .getByText("Position-by-position allocation details", { exact: true })
    .click();
  await expect(
    panel.getByRole("region", {
      name: "Position-by-position allocation details",
    }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Even split", exact: true }).click();
  await expect(weightA).toHaveValue("33.34");
  await panel
    .getByRole("button", { name: "Match current", exact: true })
    .click();
  await expect(weightA).toHaveValue("70");
  await expect(page.getByTestId("stress-compare-difference")).toHaveText(
    "$0.00",
  );

  // Different allocations with no price move: neutral, truthful all-flat copy.
  await weightA.fill("40");
  await panel.getByLabel("Asset B proposed weight (%)").fill("30");
  await panel.getByLabel("Asset C proposed weight (%)").fill("30");
  await page.getByRole("button", { name: "No change", exact: true }).click();
  await expect(page.getByTestId("stress-compare-difference")).toHaveText(
    "$0.00",
  );
  await expect(page.getByTestId("stress-compare-reason")).toContainText(
    "No position moves",
  );

  await expect(
    page.getByRole("button", { name: "Preview share card" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Image export is unavailable while/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch language to 简体中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "比较配置", exact: true }),
  ).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("portfolio stress test hides simple comparison outcomes while the simple input is invalid", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  await page
    .getByRole("button", { name: "Compare allocations", exact: true })
    .click();
  const panel = page.getByTestId("stress-compare");
  const weightA = panel.getByLabel("Asset A proposed weight (%)");
  await weightA.fill("40");
  await panel.getByLabel("Asset B proposed weight (%)").fill("30");
  await panel.getByLabel("Asset C proposed weight (%)").fill("30");
  await expect(page.getByTestId("stress-compare-difference")).toHaveText(
    "+$1,200.00",
  );

  const number = page.getByLabel("Price change (%)", { exact: true });
  await number.fill("1e2");
  // Both the main result and the comparison outcome disappear while invalid.
  await expect(page.getByTestId("stress-after")).toHaveCount(0);
  await expect(page.getByTestId("stress-compare-difference")).toHaveCount(0);
  await expect(page.getByTestId("stress-compare-reason")).toHaveCount(0);
  // The editable proposal is preserved.
  await expect(weightA).toHaveValue("40");

  await number.fill("-40");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await expect(page.getByTestId("stress-compare-difference")).toHaveText(
    "+$1,200.00",
  );

  // Per-position mode stays independently usable with the simple field invalid.
  await number.fill("1e2");
  const advanced = page
    .locator("details.stress-advanced")
    .filter({ hasText: "Advanced: per-position moves" });
  await advanced.locator("summary").click();
  await advanced
    .getByLabel("Use a different move for each position")
    .check();
  await expect(advanced.getByLabel("Asset A move (%)")).toHaveValue("-40");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
});

test("portfolio stress test supports per-position moves and aggregate contributions", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  const advanced = page
    .locator("details.stress-advanced")
    .filter({ hasText: "Advanced: per-position moves" });
  await advanced.locator("summary").click();
  await advanced
    .getByLabel("Use a different move for each position")
    .check();
  const moveA = advanced.getByLabel("Asset A move (%)");
  await expect(moveA).toHaveValue("-40");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await moveA.fill("-50");
  await expect(page.getByTestId("stress-after")).toHaveText("$6,500.00");
  await expect(page.getByTestId("stress-impact")).toHaveText("-35%");
  await expect(advanced).toContainText(
    "Contribution to the total change",
  );
  await moveA.fill("1.5");
  await expect(page.getByRole("alert").first()).toContainText(
    "whole-number move",
  );
  await expect(page.getByTestId("stress-after")).toHaveCount(0);
  await moveA.fill("-50");
  await advanced
    .getByLabel("Use a different move for each position")
    .uncheck();
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
});

test("portfolio stress test keeps per-position moves usable after invalid simple input", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/stress-test");
  const number = page.getByLabel("Price change (%)", { exact: true });
  await number.fill("1e2");
  await expect(number).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("stress-after")).toHaveCount(0);
  const advanced = page
    .locator("details.stress-advanced")
    .filter({ hasText: "Advanced: per-position moves" });
  await advanced.locator("summary").click();
  await advanced
    .getByLabel("Use a different move for each position")
    .check();
  const moveA = advanced.getByLabel("Asset A move (%)");
  await expect(moveA).toHaveValue("-40");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await moveA.fill("-20");
  await expect(page.getByTestId("stress-after")).toHaveText("$8,600.00");
  await advanced
    .getByLabel("Use a different move for each position")
    .uncheck();
});

test("portfolio stress test imports selected local Vault values read-only without any upload", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/\/v1\//.test(request.url())) requests.push(request.url());
  });
  await createVaultWithReference(page);
  await page.goto("/stress-test");
  // A non-default prior simple input must not survive into, or after, an import.
  const number = page.getByLabel("Price change (%)", { exact: true });
  await number.fill("-30");
  await expect(number).toHaveValue("-30");
  await expect(page.getByTestId("stress-after")).toHaveText("$7,900.00");
  const importer = await openImporter(page);
  await importer
    .getByLabel("Vault passphrase")
    .fill("wrong passphrase but long enough");
  await importer
    .getByRole("button", { name: "Unlock and choose" })
    .click();
  await expect(importer.getByRole("alert")).toContainText(
    "could not unlock",
  );
  await expect(importer.getByLabel("Vault passphrase")).toHaveValue("");
  await importer.getByLabel("Vault passphrase").fill(passphrase);
  await importer
    .getByRole("button", { name: "Unlock and choose" })
    .click();
  const choice = importer.getByLabel(`Include ${importedAsset}`);
  await expect(choice).toBeEnabled();
  await expect(importer).toContainText("Saved USD reference: 250.00 USD");
  await expect(
    importer.getByRole("button", { name: "Use selected values", exact: true }),
  ).toBeDisabled();
  await expect(importer).toContainText(
    "Select at least one position total to include.",
  );
  await choice.check();
  await importer
    .getByRole("button", { name: "Use selected values", exact: true })
    .click();
  await expect(
    page.getByText("Selected Vault values · not complete live portfolio"),
  ).toBeVisible();
  await expect(page.getByTestId("stress-after")).toHaveText("$150.00");
  await expect(number).toHaveValue("-40");
  await expect(page.getByText(importedAsset).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Clear imported private data", exact: true })
    .click();
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await expect(number).toHaveValue("-40");
  await expect(page.getByText(importedAsset)).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("portfolio stress test keeps manual Vault totals editable and confirms them", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  await createVaultWithReference(page);
  await page.goto("/stress-test");
  const importer = await unlockImporter(page);
  const manualChoice = importer.getByLabel(`Include ${manualAsset}`);
  await expect(manualChoice).toBeDisabled();
  await expect(importer).toContainText("per-unit value");
  const valueInput = importer.getByLabel(
    `${manualAsset} confirmed total value in USD`,
  );
  const dateInput = importer.getByLabel(`${manualAsset} observation date`);
  await valueInput.fill("400");
  await dateInput.fill("2026-06-01");
  await expect(importer).toContainText("Confirmed total: 400 USD");
  // Controls stay available for correction after the value resolves.
  await expect(valueInput).toBeVisible();
  await valueInput.fill("500");
  await expect(importer).toContainText("Confirmed total: 500 USD");
  await expect(manualChoice).toBeEnabled();
  await manualChoice.check();
  await importer
    .getByRole("button", { name: "Use selected values", exact: true })
    .click();
  await expect(page.getByTestId("stress-after")).toHaveText("$300.00");
});

test("portfolio stress test clears an unsubmitted Vault passphrase when the tab hides", async ({
  page,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  await createVaultWithReference(page);
  await page.goto("/stress-test");
  const importer = await openImporter(page);
  const passInput = importer.getByLabel("Vault passphrase");
  await passInput.fill("typed-but-not-submitted");
  await expect(passInput).toHaveValue("typed-but-not-submitted");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(passInput).toHaveValue("");
});

test("portfolio stress test clears imported values when the Vault locks in another tab", async ({
  page,
  context,
}) => {
  test.skip(!enabled);
  test.setTimeout(90_000);
  await createVaultWithReference(page);
  await page.goto("/stress-test");
  const importer = await unlockImporter(page);
  await importer.getByLabel(`Include ${importedAsset}`).check();
  await importer
    .getByRole("button", { name: "Use selected values", exact: true })
    .click();
  await expect(page.getByTestId("stress-after")).toHaveText("$150.00");

  const other = await context.newPage();
  await other.goto("/guide");
  await other.evaluate(() => {
    const bus = new BroadcastChannel("opsis-vault-control-v1");
    bus.postMessage({ event: "changed" });
    bus.close();
  });
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await expect(
    page.getByText("Selected Vault values · not complete live portfolio"),
  ).toHaveCount(0);
  await expect(page.getByText(importedAsset)).toHaveCount(0);

  // Close the extra tab before the simulated-hidden subsection: WebKit can
  // abort natively during context teardown if the second tab is still open.
  await other.close();

  // A hidden tab must also drop imported values after a fresh selection.
  const importerAgain = await unlockImporter(page);
  await importerAgain.getByLabel(`Include ${importedAsset}`).check();
  await importerAgain
    .getByRole("button", { name: "Use selected values", exact: true })
    .click();
  await expect(page.getByTestId("stress-after")).toHaveText("$150.00");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("stress-after")).toHaveText("$7,200.00");
  await expect(page.getByText(importedAsset)).toHaveCount(0);
});
