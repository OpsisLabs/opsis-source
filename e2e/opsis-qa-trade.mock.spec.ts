import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  mockPublicOpsisAccess,
  openOpsisMenu,
  closeOpsisMenu,
} from "./opsis-test-helpers";
import { fixture } from "../apps/web/src/opsis/test-fixtures";
import { REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "../packages/shared/src/reviewed-asset-sample";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const fields = [
  ["Base-asset quantity", "基础资产数量", "2"],
  ["Entry price", "入场价格", "100"],
  ["Scenario closing price", "情景平仓价格", "110"],
  ["Entry fee (basis points)", "入场费用（基点）", "10"],
  ["Exit fee (basis points)", "退出费用（基点）", "20"],
  [
    "Total funding: positive paid, negative received",
    "资金费总额：支付为正，收取为负",
    "3",
  ],
  ["Other costs in quote currency", "报价货币计价的其他成本", "4"],
  [
    "User-entered collateral (quote units)",
    "用户输入的抵押品（报价单位）",
    "50",
  ],
  [
    "User-entered maintenance requirement (bps)",
    "用户输入的维持保证金要求（基点）",
    "500",
  ],
] as const;
async function scenario(page: Page, chinese: boolean) {
  for (const [en, zh, value] of fields)
    await page.getByLabel(chinese ? zh : en, { exact: true }).fill(value);
  await page.getByTestId("opsis-perp-custom-shock-input").fill("10");
}
async function theme(page: Page, value: string) {
  // Use the shell's theme state while keeping this spec independent of translated button names.
  if (
    (await page.locator(".opsis[data-theme]").getAttribute("data-theme")) !==
    value
  ) {
    await openOpsisMenu(page);
    await page.getByRole("button", { name: /^Theme:/ }).click();
    await closeOpsisMenu(page);
  }
  await expect(page.locator(".opsis[data-theme]")).toHaveAttribute(
    "data-theme",
    value,
  );
}
async function noPageOverflow(page: Page) {
  expect(
    await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}
async function intactNumbers(region: Locator) {
  expect(
    await region.locator("td").evaluateAll((cells) =>
      cells.every((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const rects = Array.from(range.getClientRects());
        return (
          rects.length < 2 ||
          rects.every((rect) => Math.abs(rect.top - rects[0].top) < 1)
        );
      }),
    ),
  ).toBe(true);
}

// Exact raw-unit fixture: half / entered / double, same selected 0.05% pool.
function appleQuote() {
  const base = fixture();
  const pool = { ...base.quote.pool, fee: 500 };
  const points = [
    [
      "0.5",
      "500000000000000000",
      "171481673",
      "171.481673",
      "250000000000000",
      "0.00025",
    ],
    [
      "1",
      "1000000000000000000",
      "342963346",
      "342.963346",
      "500000000000000",
      "0.0005",
    ],
    [
      "2",
      "2000000000000000000",
      "685926692",
      "685.926692",
      "1000000000000000",
      "0.001",
    ],
  ].map(
    ([
      amount,
      rawAmount,
      amountOut,
      amountOutDisplay,
      feeAmount,
      feeAmountDisplay,
    ]) => ({
      ...base.quote,
      pool,
      feeTier: 500,
      feePercent: "0.05",
      amount,
      rawAmount,
      amountOut,
      amountOutDisplay,
      spotAmountOut: amountOut,
      spotAmountOutDisplay: amountOutDisplay,
      feeAmount,
      feeAmountDisplay,
      status: "ok",
    }),
  );
  return {
    ...base,
    input: {
      ...base.input,
      contract: REVIEWED_ROBINHOOD_ASSET_SAMPLE.find(
        (asset) => asset.symbol === "AAPL",
      )!.address,
      decimals: 18,
      amount: "1",
      rawAmount: points[1].rawAmount,
    },
    output: {
      symbol: "USDG",
      address: REVIEWED_ROBINHOOD_ASSET_SAMPLE.find(
        (asset) => asset.symbol === "USDG",
      )!.address,
      decimals: 6,
    },
    quote: points[1],
    curve: {
      requestedAmount: "1",
      scope: { strategy: "selected_pool", pool },
      points,
    },
    coverage: {
      ...base.coverage,
      poolsFound: [pool],
      poolsQuoted: [
        {
          ...pool,
          amountOut: points[1].amountOut,
          amountOutDisplay: points[1].amountOutDisplay,
        },
      ],
      poolsMissing: [100, 3000, 10000],
    },
    limitations: [
      "It is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold. Token transfer restrictions, paused contracts, allowlists, taxes, and hooks are not checked.",
      "The fee amount shown is a floor estimate of the input-side pool fee and can differ from the exact charge because V3 rounding and the actual tick path are not reproduced.",
      "Only a QuoterV2 result that did not end at a price-boundary is shown. A boundary result can indicate a partial fill, so full execution is never proven.",
      "Pleiades and other non-admitted venues are excluded from this estimate.",
    ],
  };
}

test.describe("Opsis Trade Check QA regressions", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await mockPublicOpsisAccess(page);
  });

  for (const width of [1280, 640])
    for (const appearance of ["light", "dark"]) {
      test(`perp tables are keyboard reachable and scrollable at ${width}px ${appearance}`, async ({
        page,
        browserName,
      }) => {
        await page.setViewportSize({ width, height: 600 });
        await page.goto("/check/perp-scenario");
        await theme(page, appearance);
        await scenario(page, false);
        const regions = page.locator(".opsis-perp-scenario [role=region]");
        await expect(regions).toHaveCount(3);
        const seen = new Set<string>();
        await page.getByTestId("opsis-perp-custom-shock-input").focus();
        for (let step = 0; step < 30 && seen.size < 3; step++) {
          await page.keyboard.press(
            browserName === "webkit" ? "Alt+Tab" : "Tab",
          );
          const name = await page.evaluate(() =>
            document.activeElement?.getAttribute("role") === "region"
              ? document.activeElement.getAttribute("aria-label")
              : null,
          );
          if (name) seen.add(name);
        }
        expect([...seen].sort()).toEqual(
          [
            "Exact price-shock results",
            "Hypothetical collateral buffer",
            "Hypothetical cost comparison",
          ].sort(),
        );
        for (const region of await regions.all()) {
          await region.focus();
          await expect(region).toBeFocused();
          await expect(region).toHaveCSS("outline-style", "solid");
          await expect(region).toHaveCSS("outline-width", "2px");
          if (await region.evaluate((el) => el.scrollWidth > el.clientWidth)) {
            await page.keyboard.press("ArrowRight");
            await expect
              .poll(() => region.evaluate((el) => el.scrollLeft))
              .toBeGreaterThan(0);
            await page.keyboard.press("End");
          }
        }
        await noPageOverflow(page);
      });
    }

  for (const width of [320, 375])
    for (const appearance of ["light", "dark"])
      for (const chinese of [false, true]) {
        test(`perp exact amounts and disclosures fit ${width}px ${appearance} Chinese=${chinese}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 812 });
          await page.goto("/check/perp-scenario");
          await theme(page, appearance);
          if (chinese)
            await page
              .getByRole("button", { name: "中文", exact: true })
              .click();
          const disclosure = page.locator(".opsis-perp-disclosures");
          const blankPrevious = await disclosure.evaluate((el) => ({
            top: el.getBoundingClientRect().top,
            previous: el.previousElementSibling!.getBoundingClientRect().bottom,
          }));
          expect(
            blankPrevious.top - blankPrevious.previous,
          ).toBeGreaterThanOrEqual(20);
          await page
            .getByLabel(chinese ? "仓位方向" : "Position direction")
            .selectOption("short");
          await scenario(page, chinese);
          await intactNumbers(page.getByTestId("opsis-perp-shocks"));
          await expect(page.getByTestId("opsis-perp-shocks")).toContainText(
            "-27.64000000",
          );
          const spacing = await disclosure.evaluate((el) => ({
            top: el.getBoundingClientRect().top,
            previous: el.previousElementSibling!.getBoundingClientRect().bottom,
            padding: parseFloat(getComputedStyle(el).paddingLeft),
          }));
          expect(spacing.top - spacing.previous).toBeGreaterThanOrEqual(20);
          expect(spacing.padding).toBeGreaterThanOrEqual(16);
          const fee = page.getByLabel(chinese ? fields[3][1] : fields[3][0], {
            exact: true,
          });
          for (const bad of ["-1", "letters", "10001"]) {
            await fee.fill(bad);
            await expect(fee).toHaveAttribute("aria-invalid", "true");
            await expect(fee).toHaveAccessibleDescription(
              chinese ? /0 至 10000 基点/ : /fee from 0 to 10000 bps/,
            );
            await expect(page.getByTestId("opsis-perp-result")).toContainText(
              chinese ? "请更正标记的输入" : "Correct the highlighted inputs",
            );
          }
          await fee.fill("0");
          await expect(fee).not.toHaveAttribute("aria-invalid", "true");
          await noPageOverflow(page);
        });

        test(`Trade Check receipt and curve fit ${width}px ${appearance} Chinese=${chinese}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 812 });
          await page.route("**/v1/private/exit-check/quote", (route) =>
            route.fulfill({ json: appleQuote() }),
          );
          await page.goto("/check");
          await theme(page, appearance);
          if (chinese)
            await page
              .getByRole("button", { name: "中文", exact: true })
              .click();
          await page.getByRole("button", { name: "AAPL", exact: true }).click();
          await page
            .getByLabel(chinese ? "输出资产" : "Output asset", { exact: true })
            .selectOption("USDG");
          await page
            .getByLabel(
              chinese ? /同时核查数量曲线/ : /Also quote a size curve/,
            )
            .check();
          await page
            .getByRole("button", {
              name: chinese ? "运行核查" : "Run a check",
              exact: true,
            })
            .click();
          await expect(page.getByTestId("opsis-quote")).toContainText("1 AAPL");
          await expect(page.getByTestId("opsis-quote")).toContainText(
            "0.0005 AAPL",
          );
          await page.getByRole("button", { name: chinese ? "表格" : "Table", exact: true }).click();
          const region = page.getByRole("region", {
            name: chinese
              ? "按输入数量显示观察到的输出"
              : "Observed output by entered size",
            exact: true,
          });
          await expect(region).toContainText("171.481673 USDG");
          await expect(region.getByRole("columnheader").last()).toHaveText(
            chinese ? "费率档位" : "Fee tier",
          );
          await expect(region.locator("tbody tr td:last-child")).toHaveText([
            "0.05%",
            "0.05%",
            "0.05%",
          ]);
          await intactNumbers(region);
          await page.keyboard.press("Tab");
          await region.focus();
          await expect(region).toHaveCSS("outline-style", "solid");
          await page
            .getByText(
              chinese ? "来源、时间和限制" : "Sources, time and limits",
              { exact: true },
            )
            .click();
          if (chinese) {
            await expect(page.getByTestId("opsis-quote")).toContainText(
              "未检查代币转账限制",
            );
            await expect(page.getByTestId("opsis-quote")).toContainText(
              "向下取整估算",
            );
            await expect(page.getByTestId("opsis-quote")).toContainText(
              "部分成交",
            );
            await expect(page.getByTestId("opsis-quote")).not.toContainText(
              "It is not a guaranteed fill",
            );
          }
          await noPageOverflow(page);
        });
      }

  for (const chinese of [false, true])
    test(`API amount refusal stays beside the amount, Chinese=${chinese}`, async ({
      page,
    }) => {
      await page.route("**/v1/private/exit-check/quote", (route) =>
        route.fulfill({
          status: 400,
          json: {
            error: {
              code: "EXIT_CHECK_INVALID_AMOUNT",
              message:
                "Enter a positive amount with no more than 18 decimal places",
            },
          },
        }),
      );
      await page.goto("/check");
      if (chinese)
        await page.getByRole("button", { name: "中文", exact: true }).click();
      await page.getByRole("button", { name: "WETH", exact: true }).click();
      const amount = page.getByLabel(chinese ? "核查数量" : "Amount to check", {
        exact: true,
      });
      await amount.fill("1.123456789012345678901234");
      await page
        .getByRole("button", {
          name: chinese ? "运行核查" : "Run a check",
          exact: true,
        })
        .click();
      await expect(amount).toHaveAttribute("aria-invalid", "true");
      await expect(amount).toHaveAccessibleDescription(
        chinese
          ? /EXIT_CHECK_INVALID_AMOUNT: 请输入正数数量，小数最多 18 位/
          : /EXIT_CHECK_INVALID_AMOUNT: Enter a positive amount with no more than 18 decimal places/,
      );
      await expect(page.getByTestId("opsis-quote")).toHaveCount(0);
      await expect(page.locator("#check-amount-error")).not.toContainText(
        /retry|重试/,
      );
      await amount.fill("1");
      await expect(amount).not.toHaveAttribute("aria-invalid", "true");
      await expect(page.locator("#check-amount-error")).toHaveCount(0);
      await page.unroute("**/v1/private/exit-check/quote");
      await page.route("**/v1/private/exit-check/quote", (route) =>
        route.fulfill({
          status: 429,
          json: {
            error: { code: "EXIT_CHECK_RATE_LIMITED", message: "Limited" },
          },
        }),
      );
      await page
        .getByRole("button", {
          name: chinese ? "运行核查" : "Run a check",
          exact: true,
        })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        chinese ? "现已达到上限" : "that limit has been reached",
      );
      await expect(amount).not.toHaveAttribute("aria-invalid", "true");
    });
});
