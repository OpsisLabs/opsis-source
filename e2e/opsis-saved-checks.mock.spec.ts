import { test, expect, type Page } from "@playwright/test";
import { fixture, research } from "../apps/web/src/opsis/test-fixtures";
const enabled = process.env.VITE_SAVED_CHECK_COMPARISONS_ENABLED === "true";
const token = fixture().input.contract;
const passphrase = "local-comparison-test-passphrase";
const note = "PRIVATE-COMPARISON-CONDITION-CANARY";
async function access(page: Page, state: { enabled: boolean }) {
  await page.route("**/v1/private/opsis/access", (route) =>
    route.fulfill({
      json: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        chainId: 4663,
        research: true,
        exitCheck: true,
        watch: false,
        rwa: false,
        observedTrades: false,
        perpExecution: false,
        savedCheckComparisons: state.enabled,
      },
    }),
  );
}
async function createVault(page: Page) {
  await page.goto("/saved");
  await page.getByLabel("VAULT PASSPHRASE", { exact: true }).fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
}
async function unlock(page: Page) {
  await page.getByLabel("History Vault passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(
    page.getByRole("button", { name: "Lock history" }),
  ).toBeVisible();
}
async function saveQuote(page: Page, amount = "1.5") {
  await page.goto(`/check?token=${token}`);
  await page.getByLabel("Amount to check").fill(amount);
  await page.getByRole("button", { name: "Run a check", exact: true }).click();
  await expect(page.getByTestId("opsis-quote")).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Save this check / revisit conditions" })
    .click();
  await unlock(page);
  await page.getByLabel("Notes or conditions to revisit (optional)").fill(note);
  await page
    .getByRole("button", { name: "Save observation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeDisabled();
}
async function openLatest(page: Page) {
  await page.goto("/saved?view=reports");
  await unlock(page);
  await page
    .getByRole("button", { name: /^Trade Check · Robinhood Chain/ })
    .first()
    .click();
}
function mockQuotes(page: Page) {
  const counter = { calls: 0 };
  const ready = page.route("**/v1/private/exit-check/quote", (route) => {
    counter.calls++;
    const q = fixture(),
      input = route.request().postDataJSON();
    q.input.amount = input.amount;
    q.input.rawAmount = input.amount === "2" ? "2000000" : "1500000";
    q.anchor.blockNumber += counter.calls;
    q.anchor.blockHash = `0x${counter.calls.toString(16).padStart(64, "0")}`;
    q.quote.amountOut = counter.calls === 1 ? "500000000000" : "600000000000";
    q.quote.amountOutDisplay = counter.calls === 1 ? "0.0000005" : "0.0000006";
    q.coverage.poolsQuoted[0].amountOut = q.quote.amountOut;
    q.coverage.poolsQuoted[0].amountOutDisplay = q.quote.amountOutDisplay;
    return route.fulfill({ json: q });
  });
  return { counter, ready };
}

test("saved-check comparisons client gate is closed by default", async ({
  page,
}) => {
  test.skip(enabled);
  test.setTimeout(45000);
  await access(page, { enabled: true });
  const { ready } = mockQuotes(page);
  await ready;
  await createVault(page);
  await saveQuote(page);
  await openLatest(page);
  await expect(
    page.getByRole("region", { name: "Saved-check comparison", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(note, { exact: false })).toBeVisible();
});

test.describe("saved-check comparisons", () => {
  test.skip(!enabled);
  test("compares encrypted quotes locally, handles incompatible sizes, supports mobile keyboard and both languages, and clears on lock", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const state = { enabled: true };
    await access(page, state);
    const { counter, ready } = mockQuotes(page);
    await ready;
    const requests: string[] = [];
    const dataRequests: string[] = [];
    page.on("request", (r) => {
      requests.push(r.url() + (r.postData() ?? ""));
      if (["fetch", "xhr"].includes(r.resourceType()))
        dataRequests.push(r.url());
    });
    await page.addInitScript(() => {
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: () => {
          throw new Error("Unexpected wallet request");
        },
      };
    });
    await createVault(page);
    await saveQuote(page);
    await saveQuote(page);
    await openLatest(page);
    const select = page.getByLabel("Compare with an earlier saved check");
    const requestCount = dataRequests.length;
    await select.selectOption({ index: 1 });
    const result = page.getByTestId("saved-check-comparison-result");
    await expect(result).toContainText("+0.0000001");
    await expect(result).toContainText("Original expiry");
    await expect(result).toContainText("Unchanged within this evidence");
    await expect(result).toContainText(
      "execution and saleability are not proven",
    );
    expect(dataRequests.length).toBe(requestCount);
    expect(counter.calls).toBe(2);
    await page.setViewportSize({ width: 320, height: 800 });
    const table = page.getByRole("region", { name: "Before and after values" });
    await table.focus();
    await expect(table).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => table.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    expect(
      await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: "output/saved-checks/mobile-en.png",
      fullPage: false,
    });
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(result).toContainText("观测输出");
    await expect(result).toContainText("+0.0000001");
    expect(
      await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: "output/saved-checks/mobile-zh.png",
      fullPage: false,
    });
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: "Lock history" }).click();
    await expect(result).toHaveCount(0);
    await expect(page.getByText(note, { exact: false })).toHaveCount(0);
    await page.reload();
    await unlock(page);
    await page
      .getByRole("button", { name: /^Trade Check · Robinhood Chain/ })
      .first()
      .click();
    await select.selectOption({ index: 1 });
    await expect(result).toContainText("+0.0000001");
    await saveQuote(page, "2");
    await openLatest(page);
    await select.selectOption({ index: 1 });
    await expect(result).toContainText("The entered amounts differ");
    await expect(result.locator("table")).toHaveCount(0);
    for (const value of [note, passphrase])
      expect(requests.join("\n")).not.toContain(value);
    // Turning off the server capability hides even previously saved comparison evidence.
    state.enabled = false;
    await openLatest(page);
    await expect(
      page.getByRole("region", { name: "Saved-check comparison", exact: true }),
    ).toHaveCount(0);
    expect(counter.calls).toBe(3);
  });

  test("preserves legacy reports and compares Research percentages without treating missing values as zero", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const state = { enabled: false };
    await access(page, state);
    let observations = 0;
    await page.route("**/v1/private/analyze", (route) => {
      observations++;
      const r = research();
      r.entity.facts = {
        ...r.entity.facts,
        ...{
          sourceCoverage: "explorer_metadata",
          holderCoverage: "top_holders",
          activityCoverage: "indexed_window",
          holders: observations === 2 ? 120 : 123,
          holdersAnalyzed: 50,
          top1WalletShare: observations === 2 ? 5.4 : 6.1,
          verified: observations === 2 ? false : true,
          proxy: null,
          explorerObservedAt: `2026-10-19T10:0${observations}:00.000Z`,
        },
      };
      return route.fulfill({ json: r });
    });
    async function saveResearch() {
      await page.goto(`/research?entity=${token}`);
      await page
        .getByRole("button", { name: "Run research", exact: true })
        .click();
      await expect(page.getByTestId("opsis-research-result")).toBeVisible();
      await page
        .locator("summary")
        .filter({ hasText: "Save research / open saved reports" })
        .click();
      await unlock(page);
      await page
        .getByRole("button", { name: "Save observation", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Saved on this device" }),
      ).toBeDisabled();
    }
    await createVault(page);
    await saveResearch();
    state.enabled = true;
    await saveResearch();
    await saveResearch();
    await page.goto("/saved?view=reports");
    await unlock(page);
    await page
      .getByRole("button", { name: /^Fixture Token/ })
      .first()
      .click();
    const select = page.getByLabel("Compare with an earlier saved check");
    await select.selectOption({ index: 1 });
    const result = page.getByTestId("saved-check-comparison-result");
    await expect(result).toContainText("+0.7 percentage points");
    await expect(result).toContainText("Unknown / not comparable");
    await expect(result).toContainText("Reported false");
    await select.selectOption({ index: 2 });
    await expect(result).toContainText("Older reports remain readable");
    await expect(result.locator("table")).toHaveCount(0);
    expect(observations).toBe(3);
  });
});
