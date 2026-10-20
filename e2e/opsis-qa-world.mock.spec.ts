import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeOpsisMenu,
  mockPublicOpsisAccess,
  openOpsisMenu,
} from "./opsis-test-helpers";
import { readFile } from "node:fs/promises";
import archive from "../apps/web/src/situation/news.json";
import { trades } from "../apps/web/src/i18n/dictionaries/en/trades";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const worldEnabled =
  enabled && process.env.VITE_SITUATION_ROOM_ENABLED === "true";
const tradesEnabled =
  enabled && process.env.VITE_OBSERVED_TRADES_ENABLED === "true";

async function language(page: Page, chinese: boolean) {
  await page
    .locator(".opsis-topbar")
    .getByRole("button", { name: chinese ? "中文" : "English", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "lang",
    chinese ? "zh-CN" : "en",
  );
}
async function theme(page: Page, value: "light" | "dark") {
  if ((await page.locator(".opsis").getAttribute("data-theme")) !== value) {
    await openOpsisMenu(page);
    await page
      .getByRole("button", { name: /^(Theme: |主题：)/ })
      .filter({ visible: true })
      .click();
    await closeOpsisMenu(page);
  }
  await expect(page.locator(".opsis")).toHaveAttribute("data-theme", value);
}
async function contrast(locator: Locator) {
  return locator.evaluate((element) => {
    const rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const luminance = (channels: number[]) =>
      channels
        .slice(0, 3)
        .map((channel) => {
          const s = channel / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    let parent: Element | null = element;
    let background = "";
    while (parent) {
      background = getComputedStyle(parent).backgroundColor;
      if ((rgb(background)[3] ?? 1) === 1) break;
      parent = parent.parentElement;
    }
    const values = [
      luminance(rgb(getComputedStyle(element).color)),
      luminance(rgb(background)),
    ].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function openWorld(page: Page) {
  await mockPublicOpsisAccess(page);
  await page.goto("/research/events");
  await expect(page.locator("#edition-eth")).toBeVisible();
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
}

test("World editions translate stories on switch and reload, preserving original evidence", async ({
  page,
}) => {
  test.skip(!worldEnabled);
  await page.setViewportSize({ width: 1280, height: 600 });
  await openWorld(page);
  await language(page, true);
  await expect(page.getByTestId("eth-market-brief")).toContainText("非实时");
  await page.locator(".sr-eth-why summary").first().click();
  await expect(page.locator(".sr-eth-why").first()).toContainText(
    "此报道不能支持以 ETF 流入解释今日涨势",
  );
  await noOverflow(page);
  await language(page, false);
  await expect(page.locator(".sr-eth-why").first()).toContainText(
    "ETF-inflow explanation",
  );
  await language(page, true);
  await page.reload();
  await expect(page.locator("#edition-archive")).toHaveText(
    "9 月 10 日世界资讯归档",
  );
  await page.locator("#edition-archive").click();
  await expect(page.locator("#brief")).toHaveText("形势简报");
  await expect(page.locator(".sr-event").first()).toContainText(
    "参议院投票前公布修订版《Clarity 法案》草案",
  );
  for (const event of archive.events) {
    const card = page.locator(`#event-${event.id}`);
    await expect(card.locator("h2")).toContainText(/[\u3400-\u9fff]/);
    await expect(card.locator("p")).toContainText(/[\u3400-\u9fff]/);
  }
  await page.locator("#ai-insight").click();
  await expect(page.locator(".sr-insight")).toContainText(
    "修订草案不能证明立法一定通过",
  );
  await page.locator("#insight-price-action").click();
  await expect(page.locator(".sr-insight")).toContainText(
    "不能据此确立因果关系",
  );
  await page.locator("#insight-watch-next").click();
  await expect(page.locator(".sr-insight")).toContainText("核查流动性");
  await page.keyboard.press("Escape");
  await page.locator("#investigate").click();
  await expect(page.getByRole("dialog")).toContainText("未经独立核实");
  await expect(page.getByRole("dialog")).toContainText(
    "参议院仍需 60 票才能推进审议",
  );
  await page.getByText("查看归档英文原文", { exact: true }).click();
  await expect(page.locator(".sr-original-report")).toContainText(
    archive.events[0].title,
  );
  await expect(page.locator(".sr-original-report")).toContainText(
    archive.events[0].detail,
  );
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "阅读原始来源" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#brief").click();
  await expect(page.getByRole("dialog")).toContainText("全部 7 篇报道");
  await expect(page.locator(".sr-brief-item").first()).toContainText(
    "参议院仍需 60 票",
  );
  const download = page.waitForEvent("download");
  await page.locator("#download-brief").click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const brief = await readFile(file!, "utf8");
  expect(brief).toContain("中文译文；原始报道为英文");
  expect(brief).toContain("参议院仍需 60 票");
  expect(brief).toContain(archive.events[0].url);
  expect(brief).toContain(archive.capturedAt);
  await page.keyboard.press("Escape");
  await page.locator("#method").click();
  await expect(page.getByRole("dialog")).toContainText("缺失样本保留为空缺");
  await page.keyboard.press("Escape");
  await language(page, false);
  await expect(page.locator(".sr-event").first()).toContainText(
    archive.events[0].title,
  );
  await expect(page.locator(".sr-event").first()).toContainText(
    archive.events[0].summary,
  );
  await page.locator("#method").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Missing samples remain gaps",
  );
  await page.keyboard.press("Escape");
  await language(page, true);
  await page.locator("#method").click();
  await expect(page.getByRole("dialog")).toContainText("不会持续刷新");
});

for (const width of [320, 375, 390, 768, 900, 1280]) {
  test(`World archive footer, feed cards and controls fit at ${width}px in both themes and languages`, async ({
    page,
  }) => {
    test.skip(!worldEnabled);
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 1280 ? 600 : 844 });
    await openWorld(page);
    await page.locator("#edition-archive").click();
    for (const chinese of [false, true]) {
      if (chinese) await language(page, true);
      for (const mode of ["dark", "light"] as const) {
        await theme(page, mode);
        for (const selector of [
          "#brief",
          "#ai-insight",
          ".sr-metrics b",
          ".sr-metrics span",
          ".sr-metrics small",
          ".sr-world-label > span",
          ".sr-globe-tools > span",
        ]) {
          expect(
            await contrast(page.locator(selector).first()),
            `${selector} ${mode}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        const method = page.locator("#method");
        await method.scrollIntoViewIfNeeded();
        await expect(method).toBeInViewport();
        expect(
          await page.locator(".sr-market").evaluate((panel) => {
            const footer = panel
              .querySelector(".sr-chart-foot")!
              .getBoundingClientRect();
            const rect = panel.getBoundingClientRect();
            return (
              footer.bottom <= rect.bottom &&
              panel.scrollHeight <= panel.clientHeight + 1
            );
          }),
        ).toBe(true);
        expect(
          await page.locator(".sr-event").evaluateAll((cards) =>
            cards.every((card) => {
              const footer = card
                .querySelector("footer")!
                .getBoundingClientRect();
              const description = card
                .querySelector("p")!
                .getBoundingClientRect();
              return (
                footer.bottom < card.getBoundingClientRect().bottom &&
                footer.top >= description.bottom
              );
            }),
          ),
        ).toBe(true);
        await method.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await page.locator("#investigate").click();
        expect(
          await contrast(page.getByRole("dialog").locator(".sr-primary")),
        ).toBeGreaterThanOrEqual(4.5);
        await page.keyboard.press("Escape");
        await noOverflow(page);
      }
    }
    await page.locator("#edition-eth").click();
    await page.locator(".sr-eth-why summary").first().click();
    await noOverflow(page);
    await page.locator("#edition-archive").click();
    await page.locator("#method").click();
    await expect(page.getByRole("dialog")).toContainText("缺失样本保留为空缺");
  });
}

test("World fallback stays readable in Chinese when WebGL fails", async ({
  page,
}) => {
  test.skip(!worldEnabled);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: string,
      ...args: unknown[]
    ) {
      return kind.includes("webgl")
        ? null
        : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await openWorld(page);
  await page.locator("#edition-archive").click();
  await expect(page.locator(".sr-error")).toContainText("globe is unavailable");
  await language(page, true);
  await expect(page.locator(".sr-error")).toContainText("地球视图不可用");
  await page.locator("#method").click();
  await expect(page.getByRole("dialog")).toContainText("缺失样本保留为空缺");
});

test("Stock-token verification and consent actions have AA contrast for both examples", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockPublicOpsisAccess(page, [], { rwa: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/rwa");
  await page.addStyleTag({ content: "* { transition: none !important; }" });
  const submit = page.locator("#opsis-content form button[type=submit]");
  await expect(submit).toBeDisabled();
  for (const chinese of [false, true]) {
    if (chinese) await language(page, true);
    for (const mode of ["dark", "light"] as const) {
      await theme(page, mode);
      for (const sample of ["AAPL", "STEAKHOUSE"]) {
        await page
          .getByRole("button", { name: new RegExp(sample, "i") })
          .click();
        await expect(submit).toBeEnabled();
        expect(await contrast(submit)).toBeGreaterThanOrEqual(4.5);
        await submit.click();
        const confirm = page.locator("[data-confirm]");
        await expect(confirm).toBeEnabled();
        expect(await contrast(confirm)).toBeGreaterThanOrEqual(4.5);
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await expect(submit).toBeFocused();
      }
    }
  }
});

function tradeFixture() {
  const address = `0x${"11".repeat(20)}`;
  const token = { address, symbol: "WETH", decimals: 18, reviewed: true };
  return {
    schemaVersion: 1,
    state: "observed",
    chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
    pair: {
      base: token,
      quote: { ...token, symbol: "USDG", decimals: 6 },
      pool: address,
      fee: 100,
      factory: address,
      factoryVerified: true,
    },
    window: {
      fromBlock: 1000,
      toBlock: 2000,
      fromTime: "2026-09-11T11:45:00Z",
      toTime: "2026-09-11T11:50:00Z",
      requestedBlocks: 1000,
      blockCount: 1000,
      capped: true,
      narrowed: true,
      notes: [trades["trades.result.narrowedNote"]],
    },
    coverage: {
      poolsRequested: 1,
      poolVerified: true,
      logsScanned: 2,
      matchedLogs: 2,
      topRows: 2,
      logCap: 1000,
      blockCap: 1000,
      logCapReached: false,
      rpcUnits: 14,
    },
    classification: {
      method: "uniswap_v3_swap_signed_amounts",
      transfersUsed: false,
    },
    observations: ["buy", "sell"].map((side, index) => ({
      id: side,
      side,
      pool: address,
      fee: 100,
      txHash: `0x${"01".repeat(32)}`,
      blockNumber: 1500,
      blockHash: `0x${"02".repeat(32)}`,
      blockTime: "2026-09-11T11:47:00Z",
      logIndex: index,
      baseToken: token,
      quoteToken: { ...token, symbol: "USDG" },
      baseAmount: "1",
      quoteAmount: "2600",
      notionalQuote: "2600",
      eventSender: address,
      eventRecipient: address,
      transactionSender: null,
      transactionSenderType: "unknown",
      followable: false,
    })),
    limitations: [1, 2, 3, 4, 5, 6].map(
      (n) => trades[`trades.limitations.${n}`],
    ),
    fetchedAt: "2026-09-11T11:50:01Z",
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["dRPC Robinhood Chain gateway"],
      disclosure:
        trades["trades.privacy.disclosure"].replace(
          "{destination}",
          "dRPC Robinhood Chain gateway",
        ) + trades["trades.privacy.routing"],
    },
  };
}

test("Big trades translates limitations, narrowed windows and privacy, and keeps both directions legible", async ({
  page,
}) => {
  test.skip(!tradesEnabled);
  await mockPublicOpsisAccess(page, [], { observedTrades: true });
  await page.route("**/v1/private/market/observed-trades", (route) =>
    route.fulfill({ json: tradeFixture() }),
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/biggest-trades");
  await page.locator("#opsis-content form button[type=submit]").click();
  const rows = page.locator("ol[aria-label] > li");
  await expect(rows).toHaveCount(2);
  await page.addStyleTag({ content: "* { transition: none !important; }" });
  for (const mode of ["light", "dark"] as const) {
    await theme(page, mode);
    for (const row of await rows.all())
      expect(
        await contrast(row.locator("span").first()),
      ).toBeGreaterThanOrEqual(4.5);
  }
  await language(page, true);
  await expect(page.locator("#opsis-content")).toContainText(
    "缺失日志绝不视为零",
  );
  await expect(page.locator("#opsis-content")).toContainText(
    "较小但完整的窗口",
  );
  await expect(page.locator("#opsis-content")).toContainText(
    "不保留未使用的交易数据",
  );
  await expect(page.locator("#opsis-content")).toContainText("独立节点运营方");
  await noOverflow(page);
  await language(page, false);
  await expect(page.locator("#opsis-content")).toContainText(
    "Missing logs are never zero",
  );
  await language(page, true);
  await expect(page.locator("#opsis-content")).toContainText(
    "此处不提供安全结论",
  );
});
