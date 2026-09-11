import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { APP_ORIGIN } from "./support/origin";
const enabled = process.env.VITE_KOL_TRACKER_ENABLED === "true";
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    { name: "chainscout_product_tour_seen_v1", value: "1", url: APP_ORIGIN },
  ]);
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test("kol tracker closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/kol-tracker");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator(".kol-surface")).toHaveCount(0);
});
test("kol tracker distinguishes tracked posts from scoreable calls and drills into exclusions", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/kol-tracker");
  const summary = page.getByRole("region", {
    name: "Scoring coverage",
    exact: true,
  });
  await expect(summary.locator('[data-status="all"] strong')).toHaveText("204");
  await expect(summary.locator('[data-status="eligible"] strong')).toHaveText(
    "34",
  );
  await expect(summary.locator('[data-status="pending"] strong')).toHaveText(
    "15",
  );
  await expect(summary.locator('[data-status="scored"] strong')).toHaveText(
    "19",
  );
  await summary.locator('[data-status="eligible"]').click();
  await expect(
    page.getByLabel("Filter feed status", { exact: true }),
  ).toHaveValue("eligible");
  await expect(page.locator(".kol-feed-filters [role=status]")).toContainText(
    "34 matching sources",
  );
  await summary
    .getByText("Why aren't all posts scored?", { exact: true })
    .click();
  await expect(summary).toContainText("170 posts are outside");
  await summary.getByRole("button", { name: "Inspect unscored posts" }).click();
  await expect(page.locator(".kol-feed-filters [role=status]")).toContainText(
    "170 matching sources",
  );
  await page
    .getByLabel("Filter feed author", { exact: true })
    .selectOption("adam");
  await expect(summary.locator('[data-status="scored"] strong')).toHaveText(
    "0",
  );
  await summary.locator('[data-status="scored"]').click();
  await expect(page.locator(".kol-history-item")).toHaveCount(0);
  await expect(page.locator(".kol-feed-filters [role=status]")).toContainText(
    "0 matching sources",
  );
  await page.getByLabel("Filter feed author", { exact: true }).selectOption("");
  await page
    .getByLabel("Filter feed status", { exact: true })
    .selectOption("unavailable");
  await expect(page.locator(".kol-history-item")).toHaveCount(0);
  await page.locator("#kol-tab-all").click();
  await page.getByRole("button", { name: "View KALEO", exact: true }).click();
  await expect(summary.locator('[data-status="pending"] strong')).toHaveText(
    "9",
  );
  await summary.locator('[data-status="pending"]').click();
  await expect(
    page.getByLabel("Filter call status", { exact: true }),
  ).toHaveValue("pending");
  await expect(page.locator(".kol-history-item")).toHaveCount(9);
});
test("kol tracker coherent leaderboard to profile to source, paper P&L and receipts", async ({
  page,
}) => {
  test.skip(!enabled);
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(APP_ORIGIN) && !r.url().startsWith("data:"))
      external.push(r.url());
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/kol-tracker");
  await expect(page.locator(".kol-surface h1")).toHaveText("KOL Tracker.");
  await expect(page.locator(".kol-leader-row")).toHaveCount(15);
  await expect(page.locator(".kol-call-detail")).toHaveCount(0);
  await expect(page.locator(".kol-performance-chart")).toHaveCount(0);
  await expect(
    page.locator('[data-kol="ansem"] .kol-leader-pnl'),
  ).toContainText("+$120.51");
  await expect(
    page.locator('[data-kol="pentoshi"] .kol-leader-pnl'),
  ).toContainText("+10.16%");
  await expect(
    page.locator('[data-kol="kaleo"] .kol-leader-pnl'),
  ).toContainText("−$14.85");
  expect(
    await page
      .locator(".kol-avatar")
      .evaluateAll((images) =>
        images.every(
          (i) =>
            i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await page.getByLabel("Sort KOLs").selectOption("recent");
  await expect(page.locator(".kol-leader-row").first()).toHaveAttribute(
    "data-kol",
    "dan",
  );
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search KOL or token")).toBeFocused();
  await page.getByLabel("Search KOL or token").fill("not-covered");
  await expect(page.locator(".kol-empty")).toContainText("No matching KOLs");
  await page
    .getByRole("button", { name: "Show all KOLs", exact: true })
    .click();
  await page.getByLabel("Filter token", { exact: true }).selectOption("PUMP");
  await expect(page.locator(".kol-leader-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Watch Ansem", exact: true }).click();
  await page.getByLabel("Sort KOLs").selectOption("return");
  await page.getByRole("button", { name: "View Ansem", exact: true }).click();
  await expect(page.locator(".kol-profile-header h2")).toBeFocused();
  await expect(page.locator(".kol-profile-metrics")).toContainText("+12.05%");
  await expect(page.locator(".kol-history-item")).toHaveCount(18);
  await expect(page.locator(".kol-profile-header a")).toHaveAttribute(
    "href",
    "https://x.com/blknoiz06",
  );
  await expect(page.locator(".kol-performance-chart canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Compare KOLs", exact: true }).click();
  await page
    .getByRole("button", { name: "Compare KALEO", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare Pentoshi", exact: true })
    .click();
  await expect(page.locator(".kol-performance-chart")).toHaveAttribute(
    "aria-label",
    /Ansem.*KALEO.*Pentoshi/,
  );
  await page.getByLabel("Paper stake per call").selectOption("100");
  await expect(page.locator(".kol-profile-metrics")).toContainText("+$12.05");
  await page.getByRole("button", { name: "Scout brief", exact: true }).click();
  await page
    .getByRole("button", { name: "What can I measure?", exact: true })
    .click();
  await expect(page.locator(".kol-profile-insight")).toContainText("too small");
  await page.getByLabel("Filter call status").selectOption("scored");
  await expect(page.locator(".kol-history-item")).toHaveCount(5);
  await page
    .getByRole("button", {
      name: "Inspect call 2090108668930830569",
      exact: true,
    })
    .click();
  await expect(page.locator(".kol-call-detail")).toHaveCount(1);
  await expect(page.locator(".kol-call-detail a").first()).toHaveAttribute(
    "href",
    "https://x.com/blknoiz06/status/2090108668930830569",
  );
  await page.getByText("See prices & calculation", { exact: true }).click();
  await expect(page.locator(".kol-price-pair")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Explain this call", exact: true })
    .click();
  await expect(page.locator(".kol-insight")).toContainText(
    "market capitalization",
  );
  await expect(page.locator(".kol-insight")).toContainText(
    "Prepared AI context",
  );
  await page.getByRole("button", { name: "Save receipt", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(
    "chainscout-call-2090108668930830569.json",
  );
  const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(exported.actualWalletPnl).toBeNull();
  expect(exported.accuracy).toBeNull();
  expect(exported.paperPerformance.pnl).toBeCloseTo(20.025075, 5);
  expect(exported.paperPerformance.observation.assets).toHaveLength(3);
  await page.getByRole("button", { name: "All KOLs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Ansem", exact: true }),
  ).toBeFocused();
  await page.locator("#kol-tab-saved").click();
  await expect(page.locator(".kol-history-item")).toHaveCount(1);
  await page.locator("#kol-tab-watchlist").click();
  await expect(page.locator(".kol-leader-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Watch Ansem", exact: true }).click();
  await expect(page.locator(".kol-empty")).toContainText(
    "Your shortlist starts here",
  );
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("kol tracker pending and unscored states do not invent P&L", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/kol-tracker");
  await page.getByRole("button", { name: "View KALEO", exact: true }).click();
  await expect(page.locator(".kol-profile-metrics")).toContainText("9 pending");
  await page.getByLabel("Filter call status").selectOption("pending");
  await expect(page.locator(".kol-history-item")).toHaveCount(9);
  await page
    .getByRole("button", {
      name: "Inspect call 2097697759365116405",
      exact: true,
    })
    .click();
  await expect(page.locator(".kol-call-detail")).toContainText(
    "Seven-day window still open",
  );
  await expect(page.locator(".kol-call-detail .kol-call-result")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "All KOLs", exact: true }).click();
  await page.getByRole("button", { name: "View Ansem", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Inspect call 2093361315876102605",
      exact: true,
    })
    .click();
  await expect(page.locator(".kol-call-detail")).toContainText(
    "ANSEM has no verified token identifier",
  );
  await expect(page.locator(".kol-call-detail .kol-call-result")).toHaveCount(
    0,
  );
  await page
    .getByRole("button", {
      name: "Inspect call 2090175223530209549",
      exact: true,
    })
    .click();
  await expect(page.locator(".kol-call-detail")).toHaveCount(1);
  await expect(page.locator(".kol-call-detail")).toContainText(
    "weekly-close entry condition",
  );
});
test("kol tracker mobile, Chinese, methodology focus and accessible disclosure", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/kol-tracker");
  await expect(page.locator(".kol-leader-row")).toHaveCount(15);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const scan = async () =>
    expect(
      (
        await new AxeBuilder({ page })
          .include(".kol-surface")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  await scan();
  await page
    .getByRole("button", { name: "How we measure", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "not the KOL’s wallet P&L",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "How we measure", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "View Pentoshi", exact: true })
    .click();
  await expect(page.locator(".kol-profile-metrics")).toContainText("+$101.58");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("Filter call status").selectOption("scored");
  await page
    .getByRole("button", {
      name: "Inspect call 2077005971411575286",
      exact: true,
    })
    .click();
  await expect(page.locator(".kol-call-result")).toContainText("+4.56%");
  await scan();
  await page
    .getByRole("button", { name: "Switch language to 简体中文" })
    .first()
    .click();
  await expect(page.locator(".kol-surface h1")).toHaveText("KOL 追踪器.");
  await expect(page.locator(".kol-profile-metrics")).toContainText(
    "每条观点模拟盈亏",
  );
  await page.getByRole("button", { name: "全部 KOL", exact: true }).click();
  await expect(page.locator(".kol-board h2")).toHaveText("研究排行榜");
});

test("kol tracker Robinhood priority, month filtering, empty profile and encrypted restore", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.goto("/kol-tracker");
  await expect(page.locator(".kol-leader-row").first()).toHaveAttribute(
    "data-kol",
    "ajc",
  );
  await expect(page.locator(".kol-coverage-bar")).toContainText(
    "204 source posts",
  );
  await page.getByLabel("History window", { exact: true }).selectOption("31");
  await page
    .getByRole("button", { name: "Robinhood Chain only", exact: true })
    .click();
  await expect(page.locator('[data-kol="pentoshi"]')).toHaveCount(0);
  await page.getByRole("button", { name: "View Adam", exact: true }).click();
  await expect(page.locator(".kol-profile-coverage")).toContainText(
    "59 day span",
  );
  await expect(page.locator(".kol-history-item")).toHaveCount(6);
  await expect(page.locator(".kol-profile-metrics")).toContainText(
    "Posts tracked",
  );
  await expect(page.locator(".kol-no-score")).toContainText("No complete");
  await page.getByRole("button", { name: "Watch KOL", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Inspect call 2096096407861998027",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save receipt", exact: true }).click();
  await page.locator(".kol-backup summary").click();
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("a private test passphrase");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const file = await download;
  const path = (await file.path())!;
  expect(await readFile(path, "utf8")).not.toContain("2096096407861998027");
  await page.reload();
  await page.locator(".kol-backup summary").click();
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("incorrect test passphrase");
  await page
    .getByLabel("Restore encrypted backup", { exact: true })
    .setInputFiles(path);
  await expect(page.locator(".kol-backup [role=status]")).toContainText(
    "Could not restore",
  );
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("a private test passphrase");
  await page
    .getByLabel("Restore encrypted backup", { exact: true })
    .setInputFiles(path);
  await expect(page.locator(".kol-backup [role=status]")).toContainText(
    "restored and merged",
  );
  await page.locator("#kol-tab-watchlist").click();
  await expect(page.locator(".kol-leader-row")).toHaveCount(1);
  await expect(page.locator(".kol-leader-row")).toHaveAttribute(
    "data-kol",
    "adam",
  );
  await page.locator("#kol-tab-saved").click();
  await expect(page.locator(".kol-history-item")).toHaveCount(1);
  await page.locator("#kol-tab-all").click();
  await page
    .getByRole("button", { name: "View Pentoshi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Robinhood Chain only", exact: true })
    .click();
  await expect(page.locator(".kol-empty")).toContainText(
    "No calls in this view",
  );
  await expect(page.locator(".kol-profile-metrics")).not.toContainText("NaN");
  await page
    .getByRole("button", { name: "Show all posts", exact: true })
    .click();
  await expect(page.locator(".kol-history-item")).toHaveCount(11);
});

test("kol tracker premium call feed, chosen comparisons and activity drilldown are complete", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/kol-tracker");
  await page.locator("#kol-tab-feed").click();
  await expect(page.locator(".kol-history-item")).toHaveCount(12);
  await expect(page.locator(".kol-feed-filters [role=status]")).toContainText(
    "204 matching sources",
  );
  const initial = await page
    .locator(".kol-history-row")
    .first()
    .getAttribute("aria-label");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".kol-pagination")).toContainText("13–24");
  expect(
    await page.locator(".kol-history-row").first().getAttribute("aria-label"),
  ).not.toBe(initial);
  await page
    .getByLabel("Filter feed author", { exact: true })
    .selectOption("nick");
  await page.getByLabel("Filter token", { exact: true }).selectOption("ZEC");
  await page
    .getByLabel("Filter feed status", { exact: true })
    .selectOption("pending");
  await expect(page.locator(".kol-history-item")).toHaveCount(3);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export sources", exact: true })
    .click();
  const file = await download;
  const payload = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(payload.sources).toHaveLength(3);
  expect(
    payload.sources.every((s: { handle: string }) => s.handle === "chooserich"),
  ).toBe(true);
  await page.locator("#kol-tab-compare").click();
  await page.getByRole("button", { name: "Compare Adam", exact: true }).click();
  await page
    .getByRole("button", { name: "Compare Ansem", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare Pentoshi", exact: true })
    .click();
  await expect(page.locator(".kol-comparison-cards article")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Compare KALEO", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".kol-performance-chart")).toHaveAttribute(
    "aria-label",
    /Ansem.*Pentoshi/,
  );
  await page
    .getByRole("button", { name: "Remove Pentoshi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare KALEO", exact: true })
    .click();
  await expect(page.locator(".kol-performance-chart")).toHaveAttribute(
    "aria-label",
    /Ansem.*KALEO/,
  );
  await page.locator("#kol-tab-all").click();
  await page.getByRole("button", { name: "View Adam", exact: true }).click();
  await page.locator(".kol-activity-bars button:not(:disabled)").last().click();
  await expect(page.locator(".kol-date-filter")).toBeVisible();
  const day = (await page.locator(".kol-date-filter").textContent())!.match(
    /2026-\d{2}-\d{2}/,
  )![0];
  await expect(page.locator(".kol-history-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear date", exact: true }).click();
  await expect(page.locator(".kol-history-item")).toHaveCount(11);
  await page.getByRole("button", { name: "Scout brief", exact: true }).click();
  await page
    .getByRole("button", { name: "What is missing?", exact: true })
    .click();
  await expect(page.locator(".kol-brief")).toContainText(
    "none is a zero return",
  );
  expect(day).toBe("2026-09-07");
  await page
    .getByLabel("Filter profile coins", { exact: true })
    .selectOption("LONG");
  await expect(
    page.locator(".kol-activity-bars button:not(:disabled)"),
  ).toHaveCount(1);
  await page
    .getByLabel("Filter profile coins", { exact: true })
    .selectOption("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".kol-surface")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("kol tracker premium encrypted device save survives reload and rejects wrong passwords and stale tabs", async ({
  page,
  context,
}) => {
  test.skip(!enabled);
  await page.goto("/kol-tracker");
  await page.getByRole("button", { name: "Watch Adam", exact: true }).click();
  await page.locator(".kol-backup summary").click();
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("private research passphrase");
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await expect(page.locator(".kol-backup [role=status]")).toContainText(
    "Saved encrypted",
  );
  const encrypted = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("chainscout-kol-research", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("workspace", "readonly");
          const record = tx.objectStore("workspace").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(record.result);
          };
          tx.onabort = () => reject(new Error("read failed"));
        };
        request.onerror = () => reject(new Error("open failed"));
      }),
  );
  expect(encrypted).not.toContain("adam");
  expect(encrypted).toContain("chainscout-kol-v1");
  await page.reload();
  await page.locator("#kol-tab-watchlist").click();
  await expect(page.locator(".kol-leader-row")).toHaveCount(0);
  await page.locator(".kol-backup summary").click();
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("incorrect research passphrase");
  await page
    .getByRole("button", { name: "Unlock saved workspace", exact: true })
    .click();
  await expect(page.locator(".kol-backup [role=status]")).toContainText(
    "Could not unlock",
  );
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("private research passphrase");
  await page
    .getByRole("button", { name: "Unlock saved workspace", exact: true })
    .click();
  await expect(page.locator(".kol-leader-row")).toHaveCount(1);
  const other = await context.newPage();
  await other.goto("/kol-tracker");
  await other.locator(".kol-backup summary").click();
  await other
    .getByLabel("Backup passphrase", { exact: true })
    .fill("private research passphrase");
  await other
    .getByRole("button", { name: "Unlock saved workspace", exact: true })
    .click();
  await expect(other.locator(".kol-backup [role=status]")).toContainText(
    "Workspace unlocked",
  );
  await page.getByRole("button", { name: "Watch Adam", exact: true }).click();
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("private research passphrase");
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "Unlock saved workspace", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Save on this device", exact: true }),
  ).toHaveCount(0);
  await other.close();
  await page
    .getByRole("button", { name: "Lock workspace", exact: true })
    .click();
  await expect(page.locator(".kol-backup [role=status]")).toContainText(
    "Locked",
  );
});

test("kol tracker premium storage failure preserves file backup and makes no persistence claim", async ({
  page,
}) => {
  test.skip(!enabled);
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Unavailable", "QuotaExceededError");
    };
  });
  await page.goto("/kol-tracker");
  await page.getByRole("button", { name: "Watch Adam", exact: true }).click();
  await page.locator(".kol-backup summary").click();
  await page
    .getByLabel("Backup passphrase", { exact: true })
    .fill("private research passphrase");
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await expect(page.locator(".kol-backup [role=status]")).toContainText(
    "Could not save",
  );
  await expect(page.locator(".kol-backup [role=status]")).not.toContainText(
    "Saved encrypted",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "chainscout-kol-workspace.encrypted.json",
  );
});
