import { expect, test, type Page } from "@playwright/test";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const time = "2026-10-20T00:00:00.000Z";
const entry = (adapter: string, digit: string) => ({
  adapter,
  token: `0x${digit.repeat(40)}`,
  launchpad:
    adapter === "pons"
      ? "Pons"
      : adapter === "long"
        ? "Long"
        : "Uniswap Liquidity Launcher (includes pools.trade)",
  deployer: null,
  created: { timestamp: time, blockNumber: 100, logIndex: 0 },
  t0: null,
  unknownReasons: { t0: "Fixture trading start unknown" },
});
const entries = [
  entry("pons", "1"),
  entry("long", "2"),
  entry("launcher", "3"),
  entry("instant", "4"),
];
async function access(page: Page, launchCards = true) {
  await page.route("**/v1/private/opsis/access", (route) =>
    route.fulfill({
      json: {
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        chainId: 4663,
        research: true,
        exitCheck: false,
        watch: false,
        rwa: false,
        observedTrades: false,
        launchCards,
        perpExecution: false,
      },
    }),
  );
}
async function visibility(page: Page, value: "visible" | "hidden") {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
}

test.describe("Launch Radar filters and live refresh", () => {
  test.skip(!enabled);

  for (const chinese of [false, true]) {
    test(`adapter filters and time windows in ${chinese ? "Chinese" : "English"}`, async ({
      page,
    }) => {
      await access(page);
      const windows: number[] = [];
      await page.route("**/v1/private/opsis/launches?**", (route) => {
        const minutes = Number(
          new URL(route.request().url()).searchParams.get("minutes"),
        );
        windows.push(minutes);
        return route.fulfill({
          json: {
            minutes,
            entries,
            observedAt: time,
            expiresAt: time,
            anchor: { blockNumber: 100, timestamp: time },
            coverage: { state: "partial" },
          },
        });
      });
      await page.goto("/research/launches");
      if (chinese)
        await page.getByRole("button", { name: "中文", exact: true }).click();
      const radar = page.locator("section.launch-card");
      const rows = radar.locator("tbody tr");
      await expect(rows).toHaveCount(4);
      await expect(
        radar.getByText(chinese ? "不作排名" : "No ranking", { exact: false }),
      ).toBeVisible();
      await expect(
        radar.getByText(chinese ? "非投资建议" : "Not investment advice", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        radar.getByRole("checkbox", {
          name: chinese ? "实时刷新" : "Live",
          exact: true,
        }),
      ).not.toBeChecked();
      const reads = windows.length;
      for (const [label, expected, adapter] of [
        ["Pons", 1, "pons"],
        ["Long", 1, "long"],
        [
          chinese ? "Uniswap 流动性发行器" : "Uniswap Liquidity Launcher",
          2,
          "launcher",
        ],
      ] as const) {
        await radar.getByRole("button", { name: label, exact: true }).click();
        await expect(rows).toHaveCount(expected);
        await expect(rows.first()).toContainText(
          entries.find((row) => row.adapter === adapter)!.token,
        );
      }
      expect(windows).toHaveLength(reads);
      await radar
        .getByRole("button", { name: chinese ? "全部" : "All", exact: true })
        .click();
      await expect(rows).toHaveCount(4);
      const window = radar.getByLabel(chinese ? "时间范围" : "Time window", {
        exact: true,
      });
      for (const minutes of [60, 360, 10]) {
        const response = page.waitForResponse((r) =>
          r.url().endsWith(`/launches?minutes=${minutes}`),
        );
        await window.selectOption(String(minutes));
        await response;
        await expect(rows).toHaveCount(4);
        await expect(radar.locator(".launch-new")).toHaveCount(0);
      }
      expect(windows).toEqual(expect.arrayContaining([10, 60, 360]));
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page
          .locator("html")
          .evaluate((el) => el.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
    });
  }

  test("visible-only live polling, one-refresh markers, and a failed refresh", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(time) });
    await page.clock.pauseAt(new Date(Date.parse(time) + 1000));
    await access(page);
    let reads = 0,
      added = false,
      failed = false;
    await page.route("**/v1/private/opsis/launches?**", (route) => {
      reads++;
      if (failed)
        return route.fulfill({
          status: 429,
          json: { error: { message: "Read limit" } },
        });
      return route.fulfill({
        json: {
          minutes: 10,
          entries: added ? [...entries, entry("pons", "5")] : entries,
          observedAt: time,
          expiresAt: time,
          anchor: { blockNumber: 100, timestamp: time },
          coverage: { state: "partial" },
        },
      });
    });
    await page.goto("/research/launches");
    const radar = page.locator("section.launch-card");
    await expect(radar.locator("tbody tr")).toHaveCount(4);
    const initial = reads;
    await page.clock.runFor(60_000);
    expect(reads).toBe(initial);
    await expect(radar.getByRole("timer")).toHaveText("Updated 60s ago");
    await radar.getByRole("checkbox", { name: "Live", exact: true }).check();
    added = true;
    await page.clock.runFor(60_000);
    await expect(radar.locator("tbody tr")).toHaveCount(5);
    await expect(radar.locator(".launch-new")).toHaveText("New");
    await page.clock.runFor(60_000);
    await expect(radar.locator(".launch-new")).toHaveCount(0);
    await visibility(page, "hidden");
    const beforeHidden = reads;
    await page.clock.runFor(180_000);
    expect(reads).toBe(beforeHidden);
    await visibility(page, "visible");
    await expect.poll(() => reads).toBe(beforeHidden + 1);
    failed = true;
    await page.clock.runFor(60_000);
    await expect(radar.getByRole("status")).toContainText("Refresh failed");
    await expect(
      radar.getByRole("checkbox", { name: "Live", exact: true }),
    ).not.toBeChecked();
    await expect(radar.locator("tbody tr")).toHaveCount(5);
    const afterFailure = reads;
    await page.clock.runFor(120_000);
    expect(reads).toBe(afterFailure);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(radar.getByRole("status")).toContainText("刷新失败");
    await expect(radar.getByRole("timer")).toContainText("秒前更新");
    failed = false;
    await radar.getByRole("button", { name: "重试", exact: true }).click();
    await expect(radar.getByRole("status")).toHaveCount(0);
    await expect(radar.getByText("不作排名", { exact: false })).toBeVisible();
    await expect(radar.getByText("非投资建议", { exact: false })).toBeVisible();
  });

  test("the disabled capability makes no launch-feed requests", async ({
    page,
  }) => {
    await access(page, false);
    let reads = 0;
    await page.route("**/v1/private/opsis/launches?**", (route) => {
      reads++;
      return route.abort();
    });
    await page.goto("/research/launches");
    await expect(page.locator("section.launch-card")).toHaveCount(0);
    expect(reads).toBe(0);
  });
});
