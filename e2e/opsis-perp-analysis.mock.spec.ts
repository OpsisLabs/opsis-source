import { expect, test, type Page } from "@playwright/test";
import { mockLocalScenarioAccess } from "./opsis-local-scenarios.helpers";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

const fields = {
  quantity: ["Base-asset quantity", "基础资产数量"],
  entry: ["Entry price", "入场价格"],
  exit: ["Scenario closing price", "情景平仓价格"],
  entryFeeBps: ["Entry fee (basis points)", "入场费用（基点）"],
  exitFeeBps: ["Exit fee (basis points)", "退出费用（基点）"],
  funding: [
    "Total funding: positive paid, negative received",
    "资金费总额：支付为正，收取为负",
  ],
  otherCosts: ["Other costs in quote currency", "报价货币计价的其他成本"],
  collateral: [
    "User-entered collateral (quote units)",
    "用户输入的抵押品（报价单位）",
  ],
  maintenanceBps: [
    "User-entered maintenance requirement (bps)",
    "用户输入的维持保证金要求（基点）",
  ],
  rateBps: ["Funding rate per interval (bps)", "每个间隔的资金费率（基点）"],
  intervalHours: ["Funding interval (hours)", "资金费间隔（小时）"],
  holdingHours: ["Holding period (hours)", "持有期（小时）"],
} as const;
async function fillScenario(page: Page, language = 0) {
  for (const [key, value] of Object.entries({
    quantity: "2",
    entry: "100",
    exit: "110",
    entryFeeBps: "5",
    exitFeeBps: "10",
    funding: "1",
    otherCosts: "0.5",
  })) {
    await page
      .getByLabel(fields[key as keyof typeof fields][language], { exact: true })
      .fill(value);
  }
}
async function fillFunding(page: Page, language = 0) {
  for (const [key, value] of Object.entries({
    rateBps: "10",
    intervalHours: "8",
    holdingHours: "25",
  })) {
    await page
      .getByLabel(fields[key as keyof typeof fields][language], { exact: true })
      .fill(value);
  }
}
async function fillCollateral(page: Page, language = 0) {
  await page
    .getByLabel(fields.collateral[language], { exact: true })
    .fill("50");
  await page
    .getByLabel(fields.maintenanceBps[language], { exact: true })
    .fill("500");
}
async function addComparisons(page: Page, language = 0) {
  const names = ["My lower costs", "My higher costs"];
  for (let index = 0; index < 2; index++) {
    await page
      .getByRole("button", {
        name: language ? "添加假设组" : "Add assumption set",
        exact: true,
      })
      .click();
    const group = page.getByTestId(`opsis-perp-assumption-${index + 1}`);
    await group
      .getByLabel(language ? "您的标签" : "Your label", { exact: true })
      .fill(names[index]);
    for (const [key, value] of Object.entries({
      entryFeeBps: index ? "100" : "0",
      exitFeeBps: index ? "100" : "0",
      funding: index ? "0" : "-2",
    })) {
      await group
        .getByLabel(fields[key as keyof typeof fields][language], {
          exact: true,
        })
        .fill(value);
    }
  }
}

test.describe("Opsis local perp analysis", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await mockLocalScenarioAccess(page);
  });

  test("opsis preview funding counts full intervals and requires explicit adoption", async ({
    page,
  }) => {
    await page.goto("/check/perp-scenario");
    await fillScenario(page);
    await fillFunding(page);
    const estimate = page.getByTestId("opsis-perp-funding-estimate");
    await expect(estimate).toContainText("Completed intervals: 3");
    await expect(estimate).toContainText("Estimated total funding: 0.60000000");
    await expect(estimate).toContainText("entry notional for every interval");
    await expect(
      page.getByLabel(fields.funding[0], { exact: true }),
    ).toHaveValue("1");
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "18.18000000",
    );
    await page
      .getByRole("button", { name: "Use as total funding", exact: true })
      .click();
    await expect(
      page.getByLabel(fields.funding[0], { exact: true }),
    ).toHaveValue("0.60000000");
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "18.58000000",
    );
    await page
      .getByLabel("Position direction")
      .selectOption("short");
    await expect(estimate).toContainText(
      "Estimated total funding: -0.60000000",
    );
    await expect(
      page.getByLabel(fields.funding[0], { exact: true }),
    ).toHaveValue("0.60000000");
    await page.getByLabel(fields.rateBps[0], { exact: true }).fill("-10");
    await expect(estimate).toContainText("Estimated total funding: 0.60000000");
    await page.getByLabel(fields.holdingHours[0], { exact: true }).fill("0");
    await expect(estimate).toContainText("Completed intervals: 0");
    await expect(estimate).toContainText("Estimated total funding: 0.00000000");
    for (const value of ["", "1.5", "87601"]) {
      await page
        .getByLabel(fields.holdingHours[0], { exact: true })
        .fill(value);
      await expect(estimate).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Use as total funding", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel(fields.funding[0], { exact: true }),
      ).toHaveValue("0.60000000");
    }
  });

  test("opsis preview liquidation shows long and short estimates and both none states", async ({
    page,
  }) => {
    await page.goto("/check/perp-scenario");
    await fillScenario(page);
    await fillCollateral(page);
    const estimate = page.getByTestId("opsis-perp-liquidation");
    await expect(estimate).toHaveText("78.94736843 · -21.05% from entry");
    await expect(page.getByTestId("opsis-perp-collateral")).toContainText(
      "Your venue's own liquidation price governs.",
    );
    await page
      .getByLabel("Position direction")
      .selectOption("short");
    await expect(estimate).toHaveText("119.04761904 · +19.04% from entry");
    await page.getByLabel(fields.collateral[0], { exact: true }).fill("9");
    await expect(estimate).toContainText(
      "below the maintenance requirement at entry",
    );
    await page
      .getByLabel("Position direction")
      .selectOption("long");
    await expect(estimate).toContainText(
      "below the maintenance requirement at entry",
    );
    await page.getByLabel(fields.collateral[0], { exact: true }).fill("200");
    await expect(estimate).toContainText("covers the entire price fall");
    await page
      .getByLabel(fields.maintenanceBps[0], { exact: true })
      .fill("10000");
    await expect(estimate).toHaveCount(0);
    await expect(
      page.getByTestId("opsis-perp-liquidation-error"),
    ).toContainText("0–9999");
    await page.getByLabel(fields.maintenanceBps[0], { exact: true }).fill("");
    await expect(estimate).toHaveCount(0);
    await expect(page.getByTestId("opsis-perp-liquidation-error")).toHaveCount(
      0,
    );
    await page
      .getByLabel(fields.maintenanceBps[0], { exact: true })
      .fill("500");
    await page
      .getByLabel(fields.collateral[0], { exact: true })
      .fill("invalid");
    await expect(estimate).toHaveCount(0);
    await expect(
      page.getByTestId("opsis-perp-liquidation-error"),
    ).toBeVisible();
  });

  test("opsis preview compares three local user-labeled assumption sets and refuses unknown costs", async ({
    page,
  }) => {
    await page.goto("/check/perp-scenario");
    await fillScenario(page);
    await addComparisons(page);
    const table = page.getByTestId("opsis-perp-assumptions").getByRole("table");
    await expect(table.locator("caption")).toContainText(
      "same side, quantity and entry/closing prices",
    );
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByRole("row").nth(1)).toContainText("18.18000000");
    await expect(table.getByRole("row").nth(2)).toContainText("My lower costs");
    await expect(table.getByRole("row").nth(2)).toContainText("21.50000000");
    await expect(table.getByRole("row").nth(3)).toContainText("15.30000000");
    await expect(
      page.getByRole("button", { name: "Add assumption set", exact: true }),
    ).toBeDisabled();
    const second = page.getByTestId("opsis-perp-assumption-1");
    for (const value of ["", "-1", "10001"]) {
      await second
        .getByLabel(fields.entryFeeBps[0], { exact: true })
        .fill(value);
      await expect(table.getByRole("row").nth(2).getByRole("cell")).toHaveText(
        Array(5).fill("Unknown"),
      );
      await expect(table.getByRole("row").nth(1)).toContainText("18.18000000");
    }
    await second
      .getByRole("button", { name: "Remove set", exact: true })
      .click();
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "Add assumption set", exact: true }),
    ).toBeEnabled();
  });

  for (const width of [320, 375])
    for (const language of [0, 1]) {
      test(`opsis preview perp analysis fits ${width}px in ${language ? "Chinese" : "English"}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 812 });
        await page.goto("/check/perp-scenario");
        if (language)
          await page.getByRole("button", { name: "中文", exact: true }).click();
        await fillScenario(page, language);
        await fillFunding(page, language);
        await fillCollateral(page, language);
        await addComparisons(page, language);
        await expect(
          page.getByRole("heading", {
            name: language ? "比较假设" : "Compare assumptions",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: language ? "用作资金费总额" : "Use as total funding",
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByTestId("opsis-perp-liquidation")).toContainText(
          "78.94736843",
        );
        await expect
          .poll(() =>
            page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
          )
          .toBeLessThanOrEqual(1);
        expect(
          await page
            .locator(".opsis-perp-cost-table")
            .evaluate((el) => el.scrollWidth > el.clientWidth),
        ).toBe(true);
      });
    }

  test("opsis preview perp interactions make no network requests and do not persist assumptions", async ({
    page,
  }) => {
    const dataRequests: string[] = [];
    page.on("request", (request) => {
      if (
        ["fetch", "xhr", "eventsource"].includes(request.resourceType()) &&
        !request.url().includes("/v1/private/opsis/access")
      )
        dataRequests.push(request.url());
    });
    await page.goto("/check/perp-scenario");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The Vite development transport starts during initial loading. Track any
    // new socket created by scenario interactions after that baseline.
    page.on("websocket", (socket) => dataRequests.push(socket.url()));
    const subsequentRequests: string[] = [];
    // Idle route prefetching and late font loads fetch first-party static files
    // and carry no data. Anything else, or anything cross-origin, is a leak.
    page.on("request", (request) => {
      const sameOrigin = new URL(request.url()).origin === new URL(page.url()).origin;
      const staticFile = request.method() === "GET" && ["script", "stylesheet", "font", "image"].includes(request.resourceType());
      if (!sameOrigin || !staticFile) subsequentRequests.push(request.url());
    });
    const before = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
      url: location.href,
    }));
    await fillScenario(page);
    await fillFunding(page);
    await fillCollateral(page);
    await page
      .getByRole("button", { name: "Use as total funding", exact: true })
      .click();
    await addComparisons(page);
    await page
      .getByLabel("Position direction")
      .selectOption("short");
    await page.getByTestId("opsis-perp-custom-shock-input").fill("-2.5");
    await expect(page.getByTestId("opsis-perp-liquidation")).toContainText(
      "119.04761904",
    );
    await expect(
      page.getByRole("button", { name: /connect wallet|submit order/i }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
        url: location.href,
      })),
    ).toEqual(before);
    expect(dataRequests).toEqual([]);
    expect(subsequentRequests).toEqual([]);
    await page.reload();
    await expect(page.getByTestId("opsis-perp-result")).toContainText(
      "Complete the assumptions",
    );
    await expect(page.getByTestId("opsis-perp-funding-estimate")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("opsis-perp-liquidation")).toHaveCount(0);
    await expect(page.getByTestId("opsis-perp-assumption-1")).toHaveCount(0);
  });
});
