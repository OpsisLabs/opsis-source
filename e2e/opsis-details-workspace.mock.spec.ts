import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pons from "../apps/web/src/opsis/fixtures/research-pons-token.json";
import synthetic from "./fixtures/synthetic-detailed-research.json";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const address = `0x${"1".repeat(40)}`;
const other = `0x${"2".repeat(40)}`;
const burn = "0x000000000000000000000000000000000000dEaD";
const facts = {
  ...pons.entity.facts,
  holderCoverage: "top_holders",
  activityCoverage: "indexed_window",
  sourceCoverage: "explorer_metadata",
  explorerObservedAt: "2026-10-17T12:00:00Z",
  top10WalletShare: 21.2,
  burnedShare: 32.52,
  liquidityPoolShare: 2.2,
  topHolders: [
    { address: burn, share: 32.52, isBurn: true },
    { address, share: "21.2123456789" },
    { address: other, share: null, isPool: true },
  ],
  recentTransfers: [
    {
      from: address,
      to: other,
      tokenSymbol: "PONS",
      formattedValue: "3051.092649036413974024",
      rawValue: "3051092649036413974024",
      timestamp: "2026-10-17T12:00:00Z",
    },
  ],
};
const payload = {
  ...pons,
  entity: { ...pons.entity, facts },
  answer: { ...pons.answer, facts },
};

async function open(
  page: Page,
  width = 1440,
  theme: "light" | "dark" = "light",
  chinese = false,
) {
  await mockPublicOpsisAccess(page);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript(
    ({ theme, chinese }) => {
      document.cookie = `opsis_theme=${theme}; Path=/`;
      document.cookie = `opsis_locale_v1=${chinese ? "zh-CN" : "en"}; Path=/`;
    },
    { theme, chinese },
  );
  await page.setViewportSize({ width, height: width < 700 ? 812 : 900 });
  await page.goto(`/research/details?entity=${payload.entity.value}`);
  await expect(page.locator("#opsis-content h1")).toHaveText(
    chinese ? "详细研究" : "Detailed research",
  );
  await expect(page.locator(".opsis").first()).toHaveAttribute(
    "data-theme",
    theme,
  );
}
async function run(page: Page, chinese = false) {
  await page
    .getByRole("button", {
      name: chinese ? "私密解读" : "Explain privately",
      exact: true,
    })
    .click();
  await expect(page.locator(".details-ws-main-value output")).toHaveText(
    "21.2%",
  );
}
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Research sections", exact: true });
const dock = (page: Page) =>
  page.getByRole("complementary", { name: "Research evidence dock" });
const overflow = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

test.describe("opsis preview detailed research workspace", () => {
  test.skip(!enabled);

  test("explicit lookup, exact evidence and local inspection retain the existing request boundary", async ({
    page,
  }) => {
    const requests: unknown[] = [];
    await page.route("**/v1/private/analyze", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: payload });
    });
    await open(page);
    expect(requests).toEqual([]);
    await page
      .getByRole("textbox", { name: "Public chain identifier" })
      .fill(`  ${payload.entity.value}  `);
    await run(page);
    expect(requests).toHaveLength(1);
    const holderLink = page.locator(`.details-ws-holders a.opsis-explorer-link[href="https://robinhoodchain.blockscout.com/address/${address}"]`);
    await expect(holderLink).toHaveAttribute("target", "_blank");
    await expect(holderLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(holderLink).toHaveAccessibleName("View 0x1111…1111 on Blockscout");
    expect(requests[0]).toMatchObject({ entity: payload.entity.value });
    await expect(page).toHaveURL(
      new RegExp(`entity=${payload.entity.value}$`, "i"),
    );
    await expect(page.locator(".details-ws-support")).toContainText("32.52%");
    await expect(page.locator(".details-ws-table-wrap")).toContainText(
      "21.2123456789%",
    );
    await expect(page.locator(".details-ws-table-wrap")).toContainText(
      "Burn address",
    );
    await expect(
      page.locator(".details-ws-table-wrap tbody tr").last(),
    ).toContainText("Unknown");
    await expect(
      page.locator(".details-ws-holder-chart svg"),
    ).toHaveAccessibleName(/Exact values in the holder table/);
    await expect(
      page.getByRole("button", { name: "Line", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator(".details-ws-chart-inspection > summary").click();
    await page.getByLabel("Inspect holder", { exact: true }).selectOption("0");
    await expect(page.locator(".details-ws-selected-holder")).toContainText(
      address,
    );
    await page.getByRole("button", { name: "Bars", exact: true }).click();
    await expect(page.locator(".details-ws-cumulative-bar")).toHaveCount(1);
    await expect(
      page.locator(".details-ws-cumulative-bar title"),
    ).toContainText("21.2123456789%");
    await page.locator(".details-ws-evidence > summary").click();

    await page.locator(".details-ws-evidence-list button").first().click();
    await expect(
      page.getByRole("tab", { name: "Evidence", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.locator("#details-panel-evidence .details-ws-source-link").first(),
    ).toBeVisible();
    await page
      .locator("#details-panel-evidence .details-ws-source-link")
      .first()
      .click();
    await expect(
      page.getByRole("tab", { name: "Source", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(dock(page)).toContainText(
      payload.answer.citations[0].fetchedAt,
    );
    await expect(
      dock(page).getByText("Not specified by this source", { exact: true }),
    ).toBeVisible();

    await nav(page)
      .getByRole("button", { name: "Transfers", exact: true })
      .click();
    await expect(page.locator(".details-ws-transfers")).toContainText(
      "3,051.092649036413974024 PONS",
    );
    await expect(page.locator(".details-ws-transfers")).not.toContainText(
      "ETH",
    );
    await nav(page)
      .getByRole("button", { name: "Contract", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Contract and identity" }),
    ).toBeVisible();
    await expect(page.locator(".details-ws-center")).toContainText(
      "1,000,000,000",
    );
    await nav(page)
      .getByRole("button", { name: "Raw records", exact: true })
      .click();
    const raw = page.locator(".details-ws-center .details-ws-raw");
    await expect(raw).not.toHaveAttribute("open", "");
    await raw.locator("summary").click();
    await expect(raw.locator("pre")).toContainText(
      '"rawValue": "3051092649036413974024"',
    );
    expect(requests).toHaveLength(1);
    await overflow(page);
  });

  test("synthetic populated design starts with the cumulative chart and never invents history or balances", async ({
    page,
  }) => {
    await page.route("**/v1/private/analyze", (route) =>
      route.fulfill({ json: synthetic }),
    );
    await open(page);
    await page
      .getByRole("button", { name: "Explain privately", exact: true })
      .click();
    await expect(
      nav(page).getByRole("button", { name: "Findings", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".details-ws-main-value output")).toHaveText(
      "50.4%",
    );
    await expect(page.locator(".details-ws-chart-line")).not.toHaveAttribute(
      "d",
      "",
    );
    await expect(page.locator(".details-ws-top-ten")).toContainText("50.4%");
    const chart = await page.locator(".details-ws-distribution").boundingBox();
    const table = await page.locator(".details-ws-holders").boundingBox();
    expect(chart!.y + chart!.height).toBeLessThan(table!.y);
    await expect(page.locator(".details-ws-holders tbody tr")).toHaveCount(10);
    await expect(
      page.locator(".details-ws-holders tbody tr").first(),
    ).toContainText("Unknown");
    await expect(page.locator(".details-ws-support")).toContainText(
      "Not supplied",
    );
    await expect(page.locator(".details-ws-center")).not.toContainText(
      "Jan 2023",
    );
    await expect(page.locator(".details-ws-footer")).toHaveText(
      "Design preview · illustrative values",
    );
    await page.getByRole("button", { name: "Bars", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".details-ws-cumulative-bar")).toHaveCount(8);
    await expect(page.locator(".details-ws-top-ten")).toContainText("50.4%");
    await overflow(page);
  });

  for (const mode of ["success", "denied"] as const)
    test(`holder address copy ${mode} preserves exact identity and has a manual fallback`, async ({
      page,
    }) => {
      await page.addInitScript(
        (mode) =>
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (value: string) => {
                if (mode === "denied")
                  throw new DOMException("Denied", "NotAllowedError");
                (window as unknown as { copiedAddress: string }).copiedAddress =
                  value;
              },
            },
          }),
        mode,
      );
      await page.route("**/v1/private/analyze", (route) =>
        route.fulfill({ json: payload }),
      );
      await open(page, 375);
      await run(page);
      const row = page.locator(".details-ws-holders tbody tr").nth(1);
      await expect(row.locator("a.details-ws-address")).toHaveAttribute(
        "href",
        `/research/details?entity=${address}`,
      );
      await row
        .getByRole("button", { name: `Copy address ${address}`, exact: true })
        .click();
      if (mode === "success") {
        await expect(row.getByRole("status")).toHaveText("Copied");
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { copiedAddress: string }).copiedAddress,
          ),
        ).toBe(address);
      } else {
        await expect(row.getByRole("status")).toContainText("Copy unavailable");
        const fallback = row.getByRole("textbox", {
          name: "Address to copy manually",
        });
        await expect(fallback).toHaveValue(address);
        await fallback.focus();
        expect(
          await fallback.evaluate(
            (element: HTMLTextAreaElement) =>
              element.selectionEnd - element.selectionStart,
          ),
        ).toBe(address.length);
      }
      await overflow(page);
    });

  test("section buttons, source tabs and disclosures work from the keyboard", async ({
    page,
  }) => {
    await page.route("**/v1/private/analyze", (route) =>
      route.fulfill({ json: payload }),
    );
    await open(page);
    await run(page);
    const source = page.getByRole("tab", { name: "Source", exact: true });
    await source.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Evidence", exact: true }),
    ).toBeFocused();
    await expect(page.locator("#details-panel-source")).toBeHidden();
    await page.keyboard.press("Home");
    await expect(source).toBeFocused();
    const rawButton = nav(page).getByRole("button", {
      name: "Raw records",
      exact: true,
    });
    await rawButton.focus();
    await page.keyboard.press("Enter");
    await expect(rawButton).toHaveAttribute("aria-current", "page");
    const summary = page.locator(".details-ws-center .details-ws-raw summary");
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(
      page.locator(".details-ws-center .details-ws-raw pre"),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.locator(".details-ws-center .details-ws-raw pre"),
    ).toBeFocused();
  });

  test("missing holders and source links stay unknown and a failed request has no result", async ({
    page,
  }) => {
    let fail = false;
    await page.route("**/v1/private/analyze", (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: {
              error: {
                code: "PROVIDER_UNAVAILABLE",
                message: "Provider unavailable. Try again.",
              },
            },
          })
        : route.fulfill({
            json: {
              ...payload,
              entity: {
                ...payload.entity,
                facts: {
                  holderCoverage: "unavailable",
                  sourceCoverage: "rpc_sample_only",
                },
              },
              answer: {
                ...payload.answer,
                facts: { address: payload.entity.value },
                citations: [],
                confirmedFacts: [
                  {
                    fact: "Partial fixture record",
                    sourceIds: ["missing-source"],
                  },
                ],
              },
            },
          }),
    );
    await open(page);
    await page
      .getByRole("button", { name: "Explain privately", exact: true })
      .click();
    await expect(page.locator(".details-ws-main-value output")).toHaveText(
      "Unavailable",
    );
    await expect(page.locator(".details-ws-holder-chart svg")).toHaveCount(1);
    await expect(page.locator(".details-ws-chart-line")).toHaveAttribute(
      "d",
      "",
    );
    await expect(page.locator(".details-ws-chart-empty")).toContainText(
      "Holder shares are missing or inconsistent",
    );
    await page.locator(".details-ws-evidence > summary").click();
    await page.locator(".details-ws-evidence-list button").first().click();
    await expect(dock(page)).toContainText("Evidence is incomplete");
    fail = true;
    await page
      .getByRole("button", { name: "Explain privately", exact: true })
      .click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.locator(".details-ws-main-value output")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Evidence unavailable" }),
    ).toBeVisible();
  });

  test("pending reads show unknown values and editing cancels stale responses", async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/v1/private/analyze", async (route) => {
      await pending;
      await route.fulfill({ json: payload });
    });
    await open(page);
    await page
      .getByRole("button", { name: "Explain privately", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Reading public evidence" }),
    ).toBeVisible();
    await expect(page.locator(".details-ws-main-value output")).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Public chain identifier" })
      .fill(other);
    release();
    await expect(
      page.getByRole("heading", { name: "Start with a public identifier" }),
    ).toBeVisible();
    await expect(page.locator(".details-ws-main-value output")).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const)
    for (const width of [1440, 1180, 375, 320]) {
      test(`fits ${width}px ${theme}, including raw records, with accessible panels`, async ({
        page,
      }) => {
        await page.route("**/v1/private/analyze", (route) =>
          route.fulfill({ json: payload }),
        );
        await open(page, width, theme);
        await run(page);
        await page.evaluate(() => document.fonts.ready);
        await overflow(page);
        const audit = await new AxeBuilder({ page })
          .include(".details-ws-page")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          audit.violations.map(
            (item) => `${item.id}: ${item.nodes[0]?.target}`,
          ),
        ).toEqual([]);
        await nav(page)
          .getByRole("button", { name: "Raw records", exact: true })
          .click();
        await page
          .locator(".details-ws-center .details-ws-raw > summary")
          .click();
        await page
          .locator("#details-panel-source .details-ws-raw > summary")
          .click();
        await page.locator(".details-ws-history > summary").click();
        await overflow(page);
      });
    }

  for (const theme of ["light", "dark"] as const) {
    test(`Chinese interface keeps source text and precise token units, ${theme}`, async ({
      page,
    }) => {
      await page.route("**/v1/private/analyze", (route) =>
        route.fulfill({ json: payload }),
      );
      await open(page, 375, theme, true);
      await run(page, true);
      await expect(
        page.getByRole("heading", { name: "持有者集中度", exact: true }),
      ).toBeVisible();
      await page.locator(".details-ws-chart-inspection > summary").click();
      await expect(
        page.getByLabel("检查持有者", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".details-ws-support")).toContainText(
        "已销毁供应量",
      );
      await page
        .getByRole("navigation", { name: "研究分区" })
        .getByRole("button", { name: "转账", exact: true })
        .click();
      await expect(page.locator(".details-ws-transfers")).toContainText(
        "3,051.092649036413974024 PONS",
      );
      await expect(
        page.getByRole("tab", { name: "来源", exact: true }),
      ).toBeVisible();
      const audit = await new AxeBuilder({ page })
        .include(".details-ws-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(audit.violations.map((item) => item.id)).toEqual([]);
      await overflow(page);
    });
  }
});
