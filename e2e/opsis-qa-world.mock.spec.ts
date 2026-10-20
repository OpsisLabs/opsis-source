import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeOpsisMenu,
  mockPublicOpsisAccess,
  openOpsisMenu,
} from "./opsis-test-helpers";
import { readFile } from "node:fs/promises";
import archive from "../apps/web/src/situation/news.json";
import ethCapture from "../apps/web/src/situation/eth-market-brief.json";
import { trades } from "../apps/web/src/i18n/dictionaries/en/trades";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const worldEnabled =
  enabled && process.env.VITE_SITUATION_ROOM_ENABLED === "true";
const tradesEnabled =
  enabled && process.env.VITE_OBSERVED_TRADES_ENABLED === "true";

async function language(page: Page, chinese: boolean) {
  if (
    (await page.locator("html").getAttribute("lang")) !==
    (chinese ? "zh-CN" : "en")
  ) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: chinese ? "中文" : "English", exact: true })
      .filter({ visible: true })
      .click();
  }
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
    // Computed color-mix backgrounds can use color(srgb ...), not rgb(...).
    // Let the browser resolve all CSS color formats before measuring contrast.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const composite = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    };
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
    const ancestors: Element[] = [];
    while (parent) {
      ancestors.push(parent);
      parent = parent.parentElement;
    }
    composite("white");
    for (const ancestor of ancestors.reverse())
      composite(getComputedStyle(ancestor).backgroundColor);
    const background = [...context.getImageData(0, 0, 1, 1).data];
    composite(getComputedStyle(element).color);
    const values = [
      luminance([...context.getImageData(0, 0, 1, 1).data]),
      luminance(background),
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
  await expect(editionTab(page, "eth")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "World & markets", exact: true }),
  ).toBeVisible();
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
}

const editionTab = (page: Page, edition: "eth" | "archive") =>
  page.getByRole("tab", {
    name:
      edition === "eth"
        ? /^(ETH edition · 11 Sep 2026|ETH 版 · 2026 年 9 月 11 日)$/
        : /^(10 Sep world feed archive|9 月 10 日世界资讯归档)$/,
  });
const eventList = (page: Page) =>
  page.getByRole("region", { name: /^(Market events|市场事件)$/ });
const evidence = (page: Page, view: "details" | "method" = "details") =>
  page.getByRole("tabpanel", {
    name:
      view === "details"
        ? /^(Event details|事件详情)$/
        : /^(Sources & method|来源与方法)$/,
  });
async function evidenceView(page: Page, view: "details" | "method") {
  await page
    .getByRole("tab", {
      name:
        view === "details"
          ? /^(Event details|事件详情)$/
          : /^(Sources & method|来源与方法)$/,
    })
    .click();
  await expect(evidence(page, view)).toBeVisible();
}
async function originalEvidence(
  page: Page,
  event: (typeof archive.events)[number],
  chinese: boolean,
) {
  await expect(
    evidence(page).getByRole("link", { name: event.source, exact: true }),
  ).toHaveAttribute("href", event.url);
  if (event.sourceExcerpt) {
    await expect(evidence(page).getByRole("blockquote")).toHaveText(
      event.sourceExcerpt,
    );
    await expect(evidence(page).getByRole("blockquote")).toHaveAttribute(
      "lang",
      "en",
    );
  } else {
    await expect(evidence(page).getByRole("blockquote")).toHaveCount(0);
    await expect(evidence(page)).toContainText(
      chinese
        ? "此次采集没有原文摘录。请打开出版方报道。"
        : "Original excerpt unavailable in this capture. Open the publisher's report.",
    );
  }
}
async function expand(panel: Locator, name: string) {
  const summary = panel.getByText(name, { exact: true });
  const details = summary.locator("..");
  if ((await details.getAttribute("open")) === null) await summary.click();
  await expect(details).toHaveAttribute("open", "");
}

test("World editions translate stories on switch and reload, preserving original evidence", async ({
  page,
}) => {
  test.skip(!worldEnabled);
  await page.setViewportSize({ width: 1280, height: 600 });
  await openWorld(page);
  await language(page, true);
  await expect(page.getByTestId("eth-market-brief")).toContainText("非实时");
  await evidence(page).getByText("这为何与 ETH 有关", { exact: true }).click();
  await expect(evidence(page)).toContainText(
    "此报道不能支持以 ETF 流入解释今日涨势",
  );
  const original = evidence(page).getByRole("link", {
    name: ethCapture.newsContext[0].originalTitle,
    exact: true,
  });
  await expect(original).toHaveAttribute("href", ethCapture.newsContext[0].url);
  await expect(original).toHaveAttribute("lang", "en");
  await noOverflow(page);
  await language(page, false);
  await expect(evidence(page)).toContainText("ETF-inflow explanation");
  await expect(original).toHaveAttribute("href", ethCapture.newsContext[0].url);
  await language(page, true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(editionTab(page, "eth")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(eventList(page).getByRole("heading")).toHaveText("市场事件");
  await evidence(page).getByText("这为何与 ETH 有关", { exact: true }).click();
  await expect(evidence(page)).toContainText(
    "此报道不能支持以 ETF 流入解释今日涨势",
  );
  await expect(original).toHaveAttribute("href", ethCapture.newsContext[0].url);
  await editionTab(page, "archive").click();
  await expect(editionTab(page, "archive")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const cards = eventList(page).locator(".world-ws-event");
  await expect(cards).toHaveCount(archive.events.length);
  await expect(cards.first()).toContainText(
    "参议院投票前公布修订版《Clarity 法案》草案",
  );
  for (const [index, event] of archive.events.entries()) {
    const card = cards.nth(index);
    await expect(card.locator("strong")).toContainText(/[\u3400-\u9fff]/);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(
      evidence(page).getByRole("heading", { level: 2 }),
    ).toContainText(/[\u3400-\u9fff]/);
    await expect(evidence(page).locator(":scope > p").first()).toContainText(
      /[\u3400-\u9fff]/,
    );
    // Publisher excerpts are evidence, and must stay verbatim in either locale.
    await originalEvidence(page, event, true);
  }
  await cards.first().click();
  await evidence(page).getByText("来源背景", { exact: true }).click();
  await expect(evidence(page)).toContainText("修订草案不能证明立法一定通过");
  await expect(evidence(page)).toContainText("时间接近不代表因果关系");
  await evidence(page).getByText("接下来查看什么", { exact: true }).click();
  await expect(evidence(page)).toContainText("核查流动性");
  await expect(evidence(page)).toContainText("未经独立核实");
  await expect(evidence(page)).toContainText("参议院仍需 60 票才能推进审议");

  const saveBrief = page.getByRole("button", {
    name: "保存形势简报 7",
    exact: true,
  });
  await expect(saveBrief).toBeVisible();
  const download = page.waitForEvent("download");
  await saveBrief.click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const brief = await readFile(file!, "utf8");
  expect(brief).toContain("中文译文；原始报道为英文");
  expect(brief).toContain("参议院仍需 60 票");
  expect(brief).toContain(archive.capturedAt);
  for (const event of archive.events) expect(brief).toContain(event.url);
  expect(brief.match(/^## /gm)).toHaveLength(archive.events.length);

  await evidenceView(page, "method");
  await expect(evidence(page, "method")).toContainText("缺失样本保留为空缺");
  await expect(evidence(page, "method")).toContainText("不会持续刷新");
  await language(page, false);
  await expect(evidence(page, "method")).toContainText(
    "Missing samples remain gaps",
  );
  await evidenceView(page, "details");
  for (const [index, event] of archive.events.entries()) {
    await expect(cards.nth(index)).toContainText(event.title);
    await cards.nth(index).click();
    await expect(evidence(page).getByRole("heading", { level: 2 })).toHaveText(
      event.title,
    );
    await expect(evidence(page).locator(":scope > p").first()).toHaveText(
      event.summary,
    );
    await originalEvidence(page, event, false);
  }
  await language(page, true);
  await evidenceView(page, "method");
  await expect(evidence(page, "method")).toContainText("不会持续刷新");
});

// Geometry uses presentation classes because these checks inspect the actual
// card/panel boundaries, rather than selecting controls to interact with them.
async function worldFits(page: Page) {
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  for (const link of await footer.getByRole("link").all()) {
    await expect(link).toBeInViewport();
    expect(await contrast(link)).toBeGreaterThanOrEqual(4.5);
  }
  expect(
    await footer.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [...element.children].every((child) => {
        const rect = child.getBoundingClientRect();
        return (
          rect.left >= bounds.left &&
          rect.right <= bounds.right &&
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom
        );
      });
    }),
  ).toBe(true);
  expect(
    await page.locator(".world-ws-canvas").evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      const note = panel
        .querySelector(".world-ws-chart-note")!
        .getBoundingClientRect();
      const facts = panel
        .querySelector(".world-ws-facts")!
        .getBoundingClientRect();
      return (
        note.top >=
          panel.querySelector(".world-ws-chart")!.getBoundingClientRect()
            .bottom &&
        facts.top >= note.bottom &&
        facts.bottom <= bounds.bottom &&
        panel.scrollHeight <= panel.clientHeight + 1
      );
    }),
  ).toBe(true);
  const cards = eventList(page).locator(".world-ws-event");
  expect(
    await cards.evaluateAll((elements) =>
      elements.every((card) => {
        const bounds = card.getBoundingClientRect();
        const title = card.querySelector("strong")!.getBoundingClientRect();
        const category = card
          .querySelector(".world-ws-category")!
          .getBoundingClientRect();
        return (
          title.left >= bounds.left &&
          title.right <= bounds.right &&
          title.top >= bounds.top &&
          category.top >= title.bottom &&
          category.left >= bounds.left &&
          category.right <= bounds.right &&
          category.bottom < bounds.bottom &&
          card.scrollWidth <= card.clientWidth + 1
        );
      }),
    ),
  ).toBe(true);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport();
    expect(await contrast(card.locator("strong"))).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrast(card.locator(".world-ws-category")),
    ).toBeGreaterThanOrEqual(4.5);
  }
  // Include every current control; hidden table/evidence content is excluded.
  const world = page.locator(".world-ws-page");
  const controls = world
    .getByRole("button")
    .or(world.getByRole("tab"))
    .or(world.getByRole("searchbox"))
    .or(world.getByRole("slider"))
    .or(world.getByRole("checkbox"));
  for (const control of await controls.all()) {
    expect(
      await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
    ).toBe(true);
  }
  await noOverflow(page);
}

for (const width of [320, 375, 390, 768, 900, 1280]) {
  test(`World archive footer, feed cards and controls fit at ${width}px in both themes and languages`, async ({
    page,
  }) => {
    test.skip(!worldEnabled);
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 1280 ? 600 : 844 });
    await openWorld(page);
    for (const chinese of [false, true]) {
      await language(page, chinese);
      for (const mode of ["dark", "light"] as const) {
        await theme(page, mode);
        for (const edition of ["archive", "eth"] as const) {
          await editionTab(page, edition).click();
          await expect(eventList(page).locator(".world-ws-event")).toHaveCount(
            edition === "archive"
              ? archive.events.length
              : ethCapture.newsContext.length,
          );
          const chart = page.getByRole("img", {
            name:
              edition === "eth"
                ? /^(Captured ETH hourly close in USD and hourly volume in ETH|采集的 ETH 每小时美元收盘价及以 ETH 计价的每小时成交量)$/
                : /^(Observed price changes before and after the selected news publication|所选新闻发布前后观测到的价格变化)$/,
          });
          await expect(chart).toBeVisible();
          if (edition === "eth")
            await expect(chart.getByTestId("volume-bar")).toHaveCount(25);
          else
            await expect(chart).toContainText(
              chinese
                ? "此次采集无成交量数据"
                : "Volume unavailable in this capture",
            );
          for (const selector of [
            ".world-ws-toolbar [role=tab][aria-selected=true]",
            ".world-ws-status",
            ".world-ws-facts dt",
            ".world-ws-facts dd",
            ".world-ws-facts small",
            ".world-ws-list-limit",
            ".world-ws-chart-note",
          ]) {
            expect(
              await contrast(page.locator(selector).first()),
              `${selector} ${mode}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
          if (edition === "archive") {
            expect(
              await contrast(
                page.getByRole("button", {
                  name: chinese ? "保存形势简报 7" : "Save situation brief 7",
                  exact: true,
                }),
              ),
            ).toBeGreaterThanOrEqual(4.5);
          }
          await worldFits(page);
          await evidenceView(page, "method");
          await expect(evidence(page, "method")).toContainText(
            edition === "archive"
              ? chinese
                ? "缺失样本保留为空缺"
                : "Missing samples remain gaps"
              : chinese
                ? "成交量按每根 K 线以 ETH 计价，而非美元"
                : "Volume is per candle in ETH, not USD",
          );
          await evidenceView(page, "details");
          await expand(
            evidence(page),
            edition === "eth"
              ? chinese
                ? "这为何与 ETH 有关"
                : "Why this matters for ETH"
              : chinese
                ? "来源背景"
                : "Source context",
          );
          expect(
            await contrast(evidence(page).getByRole("link").first()),
          ).toBeGreaterThanOrEqual(4.5);
          await noOverflow(page);
        }
      }
    }
  });
}

test("World fallback stays readable in Chinese when WebGL fails", async ({
  page,
}) => {
  test.skip(!worldEnabled);
  await page.setViewportSize({ width: 375, height: 812 });
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
  // The redesigned workspace uses SVG, so blocked WebGL must leave both editions
  // usable instead of requiring the legacy globe error banner.
  expect(
    await page.evaluate(() =>
      ["webgl", "webgl2", "experimental-webgl"].map((kind) =>
        document.createElement("canvas").getContext(kind),
      ),
    ),
  ).toEqual([null, null, null]);
  await language(page, true);
  for (const mode of ["dark", "light"] as const) {
    await theme(page, mode);
    for (const edition of ["eth", "archive"] as const) {
      await editionTab(page, edition).click();
      await expect(eventList(page).getByRole("heading")).toHaveText("市场事件");
      await expect(eventList(page).locator(".world-ws-event")).toHaveCount(
        edition === "eth"
          ? ethCapture.newsContext.length
          : archive.events.length,
      );
      await expect(
        page.getByRole("img", {
          name:
            edition === "eth"
              ? "采集的 ETH 每小时美元收盘价及以 ETH 计价的每小时成交量"
              : "所选新闻发布前后观测到的价格变化",
          exact: true,
        }),
      ).toBeVisible();
      await eventList(page).locator(".world-ws-event").first().click();
      await expect(
        evidence(page).getByRole("heading", { level: 2 }),
      ).toContainText(/[\u3400-\u9fff]/);
      expect(
        await contrast(evidence(page).locator(":scope > p").first()),
      ).toBeGreaterThanOrEqual(4.5);
      await evidenceView(page, "method");
      await expect(evidence(page, "method")).toContainText(
        edition === "archive"
          ? "缺失样本保留为空缺"
          : "成交量按每根 K 线以 ETH 计价，而非美元",
      );
      expect(
        await contrast(evidence(page, "method").locator("p").first()),
      ).toBeGreaterThanOrEqual(4.5);
      await evidenceView(page, "details");
      await noOverflow(page);
    }
  }
});

test("Stock-token verification and consent actions have AA contrast for entered contracts", async ({
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
      for (const contract of [`0x${"11".repeat(20)}`, `0x${"22".repeat(20)}`]) {
        await page.locator(".rwa-ws-lookup input").fill(contract);
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
  const quote = {
    ...token,
    address: `0x${"22".repeat(20)}`,
    symbol: "USDG",
    decimals: 6,
  };
  return {
    schemaVersion: 1,
    state: "observed",
    chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
    pair: {
      base: token,
      quote,
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
      quoteToken: quote,
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
  let reads = 0;
  await page.route("**/v1/private/market/observed-trades", (route) => {
    reads++;
    return route.fulfill({ json: tradeFixture() });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/biggest-trades");
  await page
    .getByRole("button", { name: "Observe recent swaps", exact: true })
    .click();
  const table = page.getByRole("region", {
    name: /^(Observed swaps table; scroll for all columns|已观察兑换表格；滚动查看所有列)$/,
  });
  const rows = table.locator("tbody").getByRole("row");
  await expect(rows).toHaveCount(2);
  await page.addStyleTag({ content: "* { transition: none !important; }" });
  for (const chinese of [false, true]) {
    await language(page, chinese);
    for (const mode of ["light", "dark"] as const) {
      await theme(page, mode);
      await page
        .getByRole("tab", { name: chinese ? "事件" : "Event", exact: true })
        .click();
      const event = page.getByRole("tabpanel", {
        name: chinese ? "事件" : "Event",
        exact: true,
      });
      for (const [index, direction] of [
        "USDG → WETH",
        "WETH → USDG",
      ].entries()) {
        const row = rows.nth(index);
        const cells = row.getByRole("cell");
        const input = index === 0 ? "2600 USDG" : "1 WETH";
        const output = index === 0 ? "1 WETH" : "2600 USDG";
        await expect(cells.nth(2)).toHaveText(input);
        await expect(cells.nth(3)).toHaveText(output);
        expect(await contrast(cells.nth(2))).toBeGreaterThanOrEqual(4.5);
        expect(await contrast(cells.nth(3))).toBeGreaterThanOrEqual(4.5);
        await row
          .getByRole("button", {
            name: chinese
              ? `选择兑换 ${index + 1}`
              : `Select swap ${index + 1}`,
            exact: true,
          })
          .click();
        const pairDirection = event
          .getByRole("definition")
          .filter({ hasText: direction });
        await expect(pairDirection).toHaveText(direction);
        await pairDirection.scrollIntoViewIfNeeded();
        await expect(pairDirection).toBeInViewport();
        expect(await contrast(pairDirection)).toBeGreaterThanOrEqual(4.5);
        await expect(
          event.getByRole("definition").filter({ hasText: input }),
        ).toBeVisible();
        await expect(
          event.getByRole("definition").filter({ hasText: output }),
        ).toBeVisible();
      }
      // These disclosures are now in the Context tab, not the default Event tab.
      await page
        .getByRole("tab", { name: chinese ? "背景" : "Context", exact: true })
        .click();
      const context = page.getByRole("tabpanel", {
        name: chinese ? "背景" : "Context",
        exact: true,
      });
      await expect(context).toBeVisible();
      await expect(context).toContainText("1000 → 2000");
      await expect(context).toContainText(chinese ? "是 / 是" : "Yes / Yes");
      const limitations = context.getByRole("list").getByRole("listitem");
      await expect(limitations).toHaveCount(6);
      for (const limitation of await limitations.all()) {
        if (chinese) await expect(limitation).toContainText(/[\u3400-\u9fff]/);
        expect(await contrast(limitation)).toBeGreaterThanOrEqual(4.5);
      }
      for (const text of chinese
        ? [
            "缺失日志绝不视为零",
            "较小但完整的窗口",
            "不保留未使用的交易数据",
            "独立节点运营方",
            "此处不提供安全结论",
          ]
        : [
            "Missing logs are never zero",
            "smaller complete window",
            "unused transaction data is not retained",
            "independent node operator",
            "Nothing here is a safety verdict",
          ]) {
        const disclosure = context.getByText(text, { exact: false });
        await expect(disclosure).toBeVisible();
        expect(await contrast(disclosure)).toBeGreaterThanOrEqual(4.5);
      }
      await noOverflow(page);
    }
  }
  // Switching back must retranslate the existing response, without another read.
  await language(page, false);
  await expect(
    page.getByRole("tabpanel", { name: "Context", exact: true }),
  ).toContainText("Missing logs are never zero");
  await language(page, true);
  await expect(
    page.getByRole("tabpanel", { name: "背景", exact: true }),
  ).toContainText("此处不提供安全结论");
  expect(reads).toBe(1);
});
