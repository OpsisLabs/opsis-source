import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import { APP_ORIGIN } from "./support/origin";
import capture from "../apps/web/src/situation/eth-market-brief.json";
import news from "../apps/web/src/situation/news.json";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true" &&
  process.env.VITE_SITUATION_ROOM_ENABLED === "true";

async function open(
  page: Page,
  width = 1440,
  theme: "light" | "dark" = "light",
) {
  // These editions are bundled captures. Only the existing access bootstrap is mocked.
  await mockPublicOpsisAccess(page);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 700 ? 812 : 1000 });
  await page.goto("/research/events");
  await expect(page.locator("#opsis-content h1")).toHaveText("World & markets");
}
async function archive(page: Page) {
  await page.getByRole("tab", { name: "10 Sep world feed archive" }).click();
  await expect(page.locator(".world-ws-event")).toHaveCount(7);
}
const dock = (page: Page) => page.locator("#world-panel-details");

test.describe("Opsis World & markets captured workspace", () => {
  test.skip(!enabled);

  test("ETH preserves captured values, selects publisher context and never invents a publication time", async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.origin !== new URL(baseURL ?? APP_ORIGIN).origin &&
        !["data:", "blob:"].includes(url.protocol)
      )
        unexpected.push(url.origin);
    });
    await open(page);
    await expect(page.getByTestId("eth-market-price")).toHaveText("$2,606.31");
    await expect(page.getByTestId("eth-window-end")).toHaveText(
      "$2,629.32+8.00% in captured window",
    );
    await expect(page.locator(".world-ws-facts")).toContainText("$2,434.52");
    await expect(page.locator(".world-ws-facts")).toContainText("6,578.67");
    await expect(page.locator(".world-ws-facts")).toContainText("+8.00%");
    await expect(page.locator(".world-ws-facts")).toContainText("25");
    await expect(
      page.getByRole("button", { name: "Chart", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".world-ws-price")).toBeVisible();
    await expect(page.locator(".world-ws-area")).toHaveAttribute("d", /^M.+Z$/);
    await expect(page.locator(".world-ws-volume rect")).toHaveCount(25);
    await expect(page.getByTestId("latest-close-tag")).toHaveText("$2,629.32");
    await expect(page.locator(".world-ws-capture")).toContainText("2026");
    await expect(page.locator(".world-ws-status")).toContainText(/NOT LIVE/);
    await expect(page.locator(".world-ws-event")).toHaveCount(2);
    await expect(dock(page)).toContainText(
      "Timing does not establish causation",
    );
    await expect(dock(page)).toContainText(
      "Exact publication time unavailable",
    );
    await expect(page.getByTestId("publication-marker")).toHaveCount(0);
    await dock(page)
      .getByText("Why this matters for ETH", { exact: true })
      .click();
    await expect(dock(page)).toContainText(capture.newsContext[0].whyItMatters);
    await page.locator(".world-ws-event").nth(1).click();
    await expect(dock(page)).toContainText(capture.newsContext[1].summary);
    await expect(dock(page).getByRole("link").last()).toHaveAttribute(
      "href",
      capture.newsContext[1].url,
    );
    const slider = page.getByRole("slider", { name: "Inspect observation" });
    const previous = await slider.getAttribute("aria-valuetext");
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(slider).not.toHaveAttribute("aria-valuetext", previous!);
    await page.getByRole("checkbox", { name: "Hourly volume (ETH)" }).uncheck();
    await expect(page.locator(".world-ws-volume")).toHaveCount(0);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const table = page.getByRole("region", {
      name: "Exact market observations",
    });
    await expect(table.locator("tbody tr")).toHaveCount(25);
    await expect(table).toContainText("2629.32");
    await expect(table).toContainText("35524.54915358");
    await expect(table).not.toContainText("48053.4673317");
    expect(errors).toEqual([]);
    expect(unexpected).toEqual([]);
  });

  test("archive selection, filters, windows, assets and brief use the dated capture", async ({
    page,
  }) => {
    await open(page);
    await archive(page);
    await page.getByRole("button", { name: /ECB raises key rates/ }).click();
    await expect(dock(page)).toContainText("2026-09-10 12:15:00 UTC");
    await expect(dock(page)).toContainText("European Central Bank");
    await expect(page.getByTestId("publication-marker")).toHaveCount(1);
    await expect(
      page.getByTestId("publication-marker").locator("rect"),
    ).toBeVisible();
    await expect(page.locator(".world-ws-volume")).toContainText(
      "Volume unavailable in this capture",
    );
    await expect(page.locator(".world-ws-volume rect")).toHaveCount(0);
    await expect(page.locator(".world-ws-chart-context")).toContainText(
      "ECB raises key rates",
    );
    await page.getByRole("button", { name: "±60m", exact: true }).click();
    await expect(page.locator(".world-ws-facts")).toContainText("+60m");
    for (const symbol of ["WETH", "cbBTC", "PONS"])
      await page.getByRole("button", { name: symbol, exact: true }).click();
    await expect(page.locator(".world-ws-canvas")).toContainText(
      "Choose an asset",
    );
    await page.getByRole("button", { name: "WETH", exact: true }).click();
    await expect(page.locator(".world-ws-price")).toBeVisible();
    await page.getByRole("button", { name: "Macro", exact: true }).click();
    await expect(page.locator(".world-ws-event")).toHaveCount(1);
    await page
      .getByLabel("Search events", { exact: true })
      .fill("no matching report");
    await expect(
      page.locator(".world-ws-events").getByRole("status"),
    ).toContainText("No reports match");
    await expect(dock(page)).toContainText("ECB raises key rates");
    await page.getByLabel("Search events", { exact: true }).fill("");
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: /SEC proposal targets/ }).click();
    await expect(dock(page).locator("blockquote")).toHaveText(
      news.events.find((event) => event.id === "sec")!.sourceExcerpt!,
    );
    await page
      .getByRole("button", { name: "Add to brief", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Save situation brief/ }).click();
    expect((await download).suggestedFilename()).toMatch(
      /situation-brief-2026-09-10/,
    );
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Exact market observations" }),
    ).toContainText("Observed price (USDG)");
    await expect(
      page.locator(".world-ws-page img, .world-ws-page canvas"),
    ).toHaveCount(0);
  });

  test("edition and evidence tabs support arrows, Home/End and keep source limits visible", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("tab", { name: "Event details", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    const method = page.getByRole("tab", {
      name: "Sources & method",
      exact: true,
    });
    await expect(method).toBeFocused();
    await expect(method).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#world-panel-method")).toContainText(
      "Volume is per candle in ETH, not USD",
    );
    await expect(page.locator("#world-panel-method")).toContainText("+6.67%");
    await expect(
      page
        .locator("#world-panel-method")
        .getByRole("link", { name: "Coinbase endpoint" }),
    ).toHaveAttribute("href", capture.globalReference.source.url);
    await page.keyboard.press("Home");
    await expect(
      page.getByRole("tab", { name: "Event details", exact: true }),
    ).toBeFocused();
    await page.getByRole("tab", { name: "ETH edition · 11 Sep 2026" }).focus();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tab", { name: "10 Sep world feed archive" }),
    ).toBeFocused();
    await expect(page.locator(".world-ws-event")).toHaveCount(7);
    await method.click();
    await page.getByText("Instrument identities", { exact: true }).click();
    await expect(page.locator("#world-panel-method")).toContainText(
      "maximum swap age of 120 seconds",
    );
    await expect(page.locator("#world-panel-method")).toContainText(
      "not minute-level prices or executable quotes",
    );
  });

  for (const width of [1440, 1180, 375, 320])
    for (const theme of ["light", "dark"] as const) {
      test(`both editions fit ${width}px ${theme}, disclosures and tables included, and pass axe`, async ({
        page,
      }) => {
        await open(page, width, theme);
        for (const edition of ["eth", "archive"]) {
          if (edition === "archive") await archive(page);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(0);
          await page
            .getByRole("tab", { name: "Sources & method", exact: true })
            .click();
          if (edition === "archive")
            await page
              .getByText("Instrument identities", { exact: true })
              .click();
          await page
            .getByRole("button", { name: "Table", exact: true })
            .click();
          const table = page.getByRole("region", {
            name: "Exact market observations",
          });
          await table.focus();
          await expect(table).toBeFocused();
          await page.keyboard.press("ArrowRight");
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(0);
          const results = await new AxeBuilder({ page })
            .include(".world-ws-page")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(
            results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`),
          ).toEqual([]);
          await page
            .getByRole("button", { name: "Chart", exact: true })
            .click();
          await page
            .getByRole("tab", { name: "Event details", exact: true })
            .click();
          const chartResults = await new AxeBuilder({ page })
            .include(".world-ws-page")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(
            chartResults.violations.map(
              (v) => `${v.id}: ${v.nodes[0]?.target}`,
            ),
          ).toEqual([]);
        }
      });
    }

  test("Chinese translates the interface and authored context, keeping publisher evidence intact", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("#opsis-content h1")).toHaveText("世界与市场");
    await expect(
      page.getByRole("heading", { name: "市场事件", exact: true }),
    ).toBeVisible();
    await expect(dock(page)).toContainText("时间接近不代表因果关系");
    await dock(page).getByText("这为何与 ETH 有关", { exact: true }).click();
    await expect(dock(page)).toContainText(
      "此报道不能支持以 ETF 流入解释今日涨势",
    );
    await expect(dock(page)).toContainText(
      capture.newsContext[0].originalTitle,
    );
    await page.getByRole("tab", { name: "9 月 10 日世界资讯归档" }).click();
    await expect(page.locator(".world-ws-event")).toHaveCount(7);
    await page.getByRole("button", { name: /欧洲央行将关键利率/ }).click();
    await expect(dock(page)).toContainText("2026-09-10 12:15:00 UTC");
    await expect(dock(page)).toContainText("欧洲央行官方 RSS 发布时间");
    await page.getByRole("tab", { name: "来源与方法", exact: true }).click();
    await expect(page.locator("#world-panel-method")).toContainText(
      "Swap 距采样时刻最多 120 秒",
    );
  });
});
