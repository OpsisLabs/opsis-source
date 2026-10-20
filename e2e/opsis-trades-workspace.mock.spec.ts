import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import { syntheticObservedTradesFixture } from "./fixtures/synthetic-observed-trades";
import {
  EOA,
  TX_A,
  TX_B,
  mockObservedTrades,
  observedTradesFixture,
} from "./fixtures/observed-trades";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true" &&
  process.env.VITE_OBSERVED_TRADES_ENABLED === "true";

async function open(
  page: Page,
  width = 1440,
  theme: "light" | "dark" = "light",
  body = observedTradesFixture(),
) {
  await mockPublicOpsisAccess(page, [], { observedTrades: true });
  await mockObservedTrades(page, 200, body);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 700 ? 812 : 1000 });
  await page.goto("/biggest-trades");
  await expect(page.locator("#opsis-content h1")).toHaveText("Big trades");
}
const observe = (page: Page) =>
  page.getByRole("button", { name: "Observe recent swaps", exact: true });
const point = (page: Page, index: number) =>
  page.locator(".trades-ws-point").nth(index);
const event = (page: Page) => page.locator("#trades-panel-event");
const table = (page: Page) => page.locator(".trades-ws-table");

test.describe("Opsis observed swaps workspace", () => {
  test.skip(!enabled);

  test("explicit consent only; point, exact table and inspector share selection", async ({
    page,
  }) => {
    const calls: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/market/observed-trades"))
        calls.push(request.postDataJSON());
    });
    await open(page);
    expect(calls).toHaveLength(0);
    await expect(page.locator(".trades-ws-chart-box > svg")).toBeVisible();
    await expect(page.locator(".trades-ws-axis")).toHaveCount(1);
    await expect(page.locator(".trades-ws-point")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Public-address disclosure" }),
    ).toContainText("dRPC Robinhood Chain gateway");
    await expect(
      page.getByRole("region", { name: "Public-address disclosure" }),
    ).toContainText("independent node operator");
    await observe(page).click();
    await expect(point(page, 0)).toHaveAttribute("aria-pressed", "true");
    expect(calls).toEqual([{ chainId: 4663, windowBlocks: 1000 }]);
    await expect(event(page)).toContainText("5100");
    await expect(table(page)).toContainText("1.234567890123456789 WETH");
    await expect(page.locator(".trades-ws-plot")).toContainText(
      "USDG units, not USD",
    );
    await expect(page.locator(".trades-ws-plot")).toContainText(
      "2026-09-11T11:50:01.000Z",
    );

    await page
      .getByRole("button", { name: "Select swap 2", exact: true })
      .click();
    await expect(point(page, 1)).toHaveAttribute("aria-pressed", "true");
    await expect(event(page)).toContainText("3141.592653 USDG");
    await expect(event(page)).toContainText("USDG → WETH");
    await expect(page.locator(".trades-ws-research")).toHaveAttribute(
      "href",
      `/research?entity=${TX_A}`,
    );
    await expect(table(page).locator("tbody tr").nth(1)).toHaveAttribute(
      "data-selected",
      "true",
    );
    await point(page, 0).click();
    await expect(
      page.getByRole("button", { name: "Select swap 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".trades-ws-research")).toHaveAttribute(
      "href",
      `/research?entity=${TX_B}`,
    );
    await expect(
      table(page)
        .getByRole("link", { name: /View transaction/ })
        .first(),
    ).toHaveAttribute(
      "href",
      `https://robinhoodchain.blockscout.com/tx/${TX_B}`,
    );
    expect(calls).toHaveLength(1);
    await page
      .getByLabel("Verified pool fee", { exact: true })
      .selectOption("500");
    await expect(page.locator(".trades-ws-point")).toHaveCount(0);
    await expect(page.locator(".trades-ws-chart-box > svg")).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    expect(calls).toHaveLength(1);
    await observe(page).click();
    await expect(point(page, 0)).toBeVisible();
    expect(calls[1]).toEqual({ chainId: 4663, fee: 500, windowBlocks: 1000 });
  });

  test("synthetic six-event capture keeps chart/table selection linked across compact pages", async ({
    page,
  }) => {
    const data = syntheticObservedTradesFixture();
    await open(page, 1440, "light", data);
    await observe(page).click();
    await expect(page.locator(".trades-ws-point")).toHaveCount(6);
    await expect(table(page).locator("tbody tr")).toHaveCount(5);
    await expect(page.locator(".trades-ws-callout")).toContainText("QUOTE");
    await point(page, 5).focus();
    await expect(table(page).locator("tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Select swap 6", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(event(page)).toContainText(data.observations[5].notionalQuote);
    await page
      .getByRole("button", { name: "Previous page", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Select swap 2", exact: true })
      .click();
    await expect(point(page, 1)).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Rows per page", { exact: true }).selectOption("10");
    await expect(table(page).locator("tbody tr")).toHaveCount(6);
    await expect(
      page.getByRole("button", { name: "Next page", exact: true }),
    ).toBeDisabled();
    await page.getByRole("tab", { name: "Context", exact: true }).click();
    await expect(page.locator("#trades-panel-context")).toContainText(
      "Synthetic UI-review capture",
    );
  });

  test("keyboard points, scale and dock tabs; full capture and privacy evidence", async ({
    page,
  }) => {
    await open(page);
    await observe(page).focus();
    await page.keyboard.press("Enter");
    await point(page, 0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(point(page, 1)).toBeFocused();
    await expect(point(page, 1)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Home");
    await expect(point(page, 0)).toBeFocused();
    await page
      .getByLabel("Value scale", { exact: true })
      .selectOption("linear");
    await expect(page.locator(".trades-ws-chart-box > svg")).toHaveAttribute(
      "aria-label",
      /USDG/,
    );
    const firstTab = page.getByRole("tab", { name: "Event", exact: true });
    await firstTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Context", exact: true }),
    ).toBeFocused();
    await expect(event(page)).toBeHidden();
    const context = page.locator("#trades-panel-context");
    await expect(context).toContainText("60401000 → 60402000");
    await expect(context).toContainText("12 scanned · 2 matched · cap 1000");
    await expect(context).toContainText("Robinhood Public RPC"); // Preserve the existing captured fixture's source.
    await expect(context).toContainText("Privacy receipt");
    await expect(context).toContainText(
      "not a chain-wide or all-venue ranking",
    );
    await page.keyboard.press("Home");
    await expect(firstTab).toBeFocused();
    await page
      .getByText("Token and sender identities", { exact: true })
      .click();
    await expect(event(page)).toContainText(EOA);
    await expect(event(page)).toContainText(
      observedTradesFixture().observations[0].blockHash,
    );
    const follow = page.getByRole("link", { name: /FOLLOW THIS WALLET/i });
    if (process.env.VITE_WATCH_ENABLED === "true")
      await expect(follow).toHaveAttribute("href", `/watch?address=${EOA}`);
    else await expect(follow).toHaveCount(0);
    await point(page, 1).click();
    await expect(follow).toHaveCount(0); // Contract sender must never become a wallet.
  });

  test("empty, missing-time and narrowed captures stay honest", async ({
    page,
  }) => {
    const empty = observedTradesFixture();
    empty.observations = [];
    empty.state = "empty";
    empty.coverage.matchedLogs = 0;
    empty.coverage.topRows = 0;
    await open(page, 1440, "light", empty);
    await observe(page).click();
    await expect(
      page.getByRole("heading", { name: "No swaps matched in this window" }),
    ).toBeVisible();
    await expect(page.locator(".trades-ws-point")).toHaveCount(0);
    await expect(page.locator(".trades-ws-chart-box > svg")).toBeVisible();
    await expect(page.locator(".trades-ws-chart-box")).toContainText(
      "11:45:00",
    );
    await page.getByRole("tab", { name: "Context", exact: true }).click();
    await expect(page.locator("#trades-panel-context")).toContainText(
      "60401000 → 60402000",
    );

    const partial = observedTradesFixture();
    const missingTime = { ...partial.observations[0], blockTime: null };
    partial.observations = [missingTime, partial.observations[1]];
    partial.window.narrowed = true;
    await mockObservedTrades(page, 200, partial);
    await page.getByLabel("Recent window", { exact: true }).selectOption("500");
    await observe(page).click();
    await expect(page.locator(".trades-ws-point")).toHaveCount(1);
    await expect(table(page).locator("tbody tr")).toHaveCount(2);
    await expect(table(page)).toContainText("Time unknown");
    await expect(page.locator(".trades-ws-plot")).toContainText(
      "1 observations have an unavailable time",
    );
    await expect(page.locator(".trades-ws-plot")).toContainText(
      "Limited capture",
    );
    await expect(event(page)).toContainText("Unknown");
  });

  test("provider refusal retries explicitly and a late response cannot restore changed inputs", async ({
    page,
  }) => {
    await open(page);
    await mockObservedTrades(page, 503);
    await observe(page).click();
    await expect(page.getByRole("alert")).toContainText(
      "The observation did not complete",
    );
    await expect(page.locator(".trades-ws-point")).toHaveCount(0);
    await mockObservedTrades(page);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(point(page, 0)).toBeVisible();
    await page
      .getByLabel("Token contract (optional)", { exact: true })
      .fill(`0x${"12".repeat(20)}`);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const started = page.waitForRequest("**/v1/private/market/observed-trades");
    await page.route("**/v1/private/market/observed-trades", async (route) => {
      await held;
      await route.fulfill({ json: observedTradesFixture() });
      finish();
    });
    await observe(page).click();
    await started;
    await expect(page.locator(".trades-ws-status")).toContainText(
      "Reading a bounded Swap window",
    );
    await page.getByLabel("Recent window", { exact: true }).selectOption("500");
    release();
    await finished;
    await expect(page.locator(".trades-ws-point")).toHaveCount(0);
    await expect(table(page)).toHaveCount(0);
    await expect(observe(page)).toBeEnabled();
  });

  for (const [width, theme] of [
    [1440, "light"],
    [1440, "dark"],
    [1180, "light"],
    [1180, "dark"],
    [375, "light"],
    [375, "dark"],
    [320, "light"],
  ] as const) {
    test(`${width}px ${theme}: keyboard scroll, no page overflow and axe`, async ({
      page,
    }) => {
      await open(page, width, theme);
      const action = await observe(page).boundingBox();
      expect(action && action.y + action.height).toBeLessThanOrEqual(
        width < 700 ? 812 : 1000,
      );
      await observe(page).click();
      await expect(point(page, 0)).toBeVisible();
      await page
        .getByText("Token and sender identities", { exact: true })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(0);
      const scroll = page.getByRole("region", {
        name: "Observed swaps table; scroll for all columns",
      });
      await scroll.focus();
      await expect(scroll).toBeFocused();
      const before = await scroll.evaluate((element) => element.scrollLeft);
      await page.keyboard.press("ArrowRight");
      if (width < 1300)
        await expect
          .poll(() => scroll.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(before);
      for (const tabName of ["Event", "Context"]) {
        await page.getByRole("tab", { name: tabName, exact: true }).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page })
          .include(".trades-ws-page")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          results.violations.map(
            (violation) => `${violation.id}: ${violation.nodes[0]?.target}`,
          ),
        ).toEqual([]);
      }
    });
  }

  test("Chinese labels all controls, chart and inspector while retaining exact amounts", async ({
    page,
  }) => {
    await open(page, 375);
    await observe(page).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("大额交易");
    await expect(
      page.getByRole("button", { name: "观察近期交易", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("金额刻度", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "选择兑换 2", exact: true }).click();
    await expect(event(page)).toContainText("输入数量");
    await expect(event(page)).toContainText("1.234567890123456789 WETH");
    await expect(page.locator(".trades-ws-chart-box > svg")).toHaveAttribute(
      "aria-label",
      /精确金额见下方表格/,
    );
    await page.getByRole("tab", { name: "背景", exact: true }).click();
    await expect(page.locator("#trades-panel-context")).toContainText(
      "隐私回执",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
