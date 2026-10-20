import syntheticSeries from "./fixtures/rwa-synthetic-30-sessions.json";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import {
  RWA_TEST_CONTRACT,
  RWA_TEST_TIME,
  rwaHistoryFixture,
  rwaWorkspaceFixture,
} from "../apps/web/src/rwa/test-fixtures";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

async function open(
  page: Page,
  width = 1440,
  theme: "light" | "dark" = "light",
) {
  await mockPublicOpsisAccess(page, [], { rwa: true });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 700 ? 812 : 900 });
  await page.goto("/rwa");
  await expect(page.locator("#opsis-content h1")).toHaveText(
    "Stock-token check",
  );
}
async function lookup(page: Page) {
  await page
    .getByRole("textbox", { name: "Token or vault contract", exact: true })
    .fill(`  ${RWA_TEST_CONTRACT}  `);
  await page.getByRole("button", { name: "Run check", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(RWA_TEST_CONTRACT);
  await page
    .getByRole("button", { name: "Confirm public lookup", exact: true })
    .click();
  await expect(page.getByTestId("rwa-result")).toBeVisible();
}
async function history(
  page: Page,
  payload: unknown = rwaHistoryFixture(),
  label = "Import paired prices · Paired stock-token gap JSON",
) {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name: "paired.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  for (const panel of await page.locator(".rwa-ws-panel").all()) {
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
}

test.describe("opsis preview stock-token analytical workspace", () => {
  test.skip(!enabled);

  test("requires consent, keeps the exact public request and places evidence beside unavailable history", async ({
    page,
    context,
  }) => {
    let calls = 0;
    await context.addCookies([
      {
        name: "cs_access",
        value: "must-not-be-sent",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
        secure: false,
      },
    ]);
    await page.route("**/v1/private/rwa/verify", async (route) => {
      calls++;
      expect(route.request().postDataJSON()).toEqual({
        address: RWA_TEST_CONTRACT,
      });
      expect(route.request().headers().cookie).toBeUndefined();
      expect(route.request().headers()["x-opsis-csrf"]).toBe("1");
      await route.fulfill({
        json: rwaWorkspaceFixture(),
        headers: { "cache-control": "private, no-store" },
      });
    });
    await open(page);
    expect(calls).toBe(0);
    await expect(
      page.getByRole("button", { name: "Run check", exact: true }),
    ).toBeDisabled();
    await lookup(page);
    expect(calls).toBe(1);
    const dock = page.getByTestId("rwa-result");
    await expect(dock).toContainText("Redemption unverified");
    await expect(dock).toContainText("100.01 / 100.05 USD");
    await expect(dock).toContainText("Document retrieval unavailable");
    await expect(
      page.getByText("History unavailable", { exact: true }),
    ).toBeVisible();
    await dock
      .locator("summary")
      .filter({ hasText: "Sources and read times" })
      .click();
    await expect(dock.locator("time").first()).toHaveText(RWA_TEST_TIME);
    await dock
      .locator("summary")
      .filter({ hasText: "All evidence checks" })
      .click();
    await expect(dock).toContainText(
      "Synthetic partial corporate-action coverage",
    );
    await dock
      .locator("summary")
      .filter({ hasText: "Limits and privacy receipt" })
      .click();
    await expect(dock).toContainText("Nothing was saved");
    await expect(dock).toContainText("oracle health remains incomplete");
    await expect(
      dock.getByRole("link", { name: "Issuer terms ↗" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("keyboard consent is trapped, Escape cancels without a request, and invalid identifiers refuse", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/v1/private/rwa/verify", async (route) => {
      calls++;
      await route.abort();
    });
    await open(page, 375);
    const input = page.getByRole("textbox", {
      name: "Token or vault contract",
      exact: true,
    });
    const run = page.getByRole("button", { name: "Run check", exact: true });
    await input.fill("SAMPLE-STOCK");
    await run.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await input.fill(RWA_TEST_CONTRACT);
    await input.press("Enter");
    const confirm = page.getByRole("button", {
      name: "Confirm public lookup",
      exact: true,
    });
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(run).toBeFocused();
    expect(calls).toBe(0);
  });

  test("imports stay local; exact values, session gaps, action markers and age selection share one engine", async ({
    page,
  }) => {
    const requests: string[] = [];
    await open(page);
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/v1/"))
        requests.push(request.url());
    });
    await history(page);
    await expect(page.getByTestId("rwa-gap-latest")).toHaveText("4.0000%");
    await expect(page.locator(".rwa-chart-point")).toHaveCount(3);
    await expect(page.locator(".rwa-chart-action")).toHaveCount(1);
    await expect(page.locator(".rwa-chart-age")).toHaveCount(3);
    await expect(page.locator(".rwa-chart-line")).toHaveCount(1); // Adjacent observations only; no generated points.
    await page.locator("#rwa-observations > summary").click();
    await expect(page.locator("#rwa-observations tbody tr")).toHaveCount(3);
    await expect(page.locator("#rwa-observations")).toContainText("101.123456");
    await expect(page.locator("#rwa-observations")).toContainText("1.1234");
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "120 minutes",
    );
    const slider = page.getByRole("slider", { name: "Selected observation" });
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "90 minutes",
    );
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "2.0000%",
    );
    await page.keyboard.press("Home");
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "1.1234%",
    );
    await page
      .locator("#rwa-observations tbody tr")
      .last()
      .getByRole("button")
      .click();
    await expect(slider).toHaveValue("2");
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "Synthetic split example",
    );
    expect(requests).toEqual([]);
  });

  test("thirty synthetic sessions render both charts by default, with real derived bins, breaks and median", async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByRole("img", { name: /Empty .*chart/ })).toHaveCount(
      2,
    );
    await history(page, syntheticSeries);
    await expect(page.locator(".rwa-chart-line")).toHaveCount(4);
    await expect(page.locator(".rwa-chart-action")).toHaveCount(3);
    await expect(page.locator(".rwa-chart-bin")).toHaveCount(30);
    await expect(page.locator(".rwa-ws-histogram svg")).toBeVisible();
    await expect(page.locator(".rwa-chart-median-label")).toBeVisible();
    expect(
      await page.locator(".rwa-chart-median").evaluate((line) => {
        const bounds = (line as SVGGraphicsElement).getBBox();
        return (
          bounds.height > 0 &&
          line.getAttribute("x1") === line.getAttribute("x2") &&
          getComputedStyle(line).stroke !== "none"
        );
      }),
    ).toBe(true);
    await expect(page.locator(".rwa-chart-callout")).toBeVisible();
    await expect(
      page
        .locator(".rwa-ws-local-state, .rwa-ws-title-copy p")
        .filter({ hasText: "unverified source · not live" }),
    ).toBeVisible();
    await expect(page.locator(".rwa-ws-facts")).toContainText("Unknown");
    await expect(page.locator(".rwa-ws-facts")).toContainText("451 observed");
    await expect(page.locator("#rwa-observations")).not.toHaveAttribute(
      "open",
      "",
    );
    const chart = page.locator(".rwa-ws-plot svg");
    const before = await page
      .getByRole("slider", { name: "Selected observation" })
      .inputValue();
    await chart.hover({ position: { x: 180, y: 140 } });
    await expect(
      page.getByRole("slider", { name: "Selected observation" }),
    ).not.toHaveValue(before);
    await page
      .getByRole("button", { name: "Price & gap", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Paired observations", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Corporate actions", exact: true })
      .click();
    await expect(page.locator(".rwa-ws-history")).toContainText(
      "Synthetic split adjustment",
    );
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await expect(page.locator(".rwa-ws-history")).toContainText(
      syntheticSeries.sourceName,
    );
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await expect(page.locator(".rwa-ws-history")).toContainText(
      "Document retrieval unavailable",
    );
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(page.locator(".rwa-chart-line").first()).toBeVisible();
  });

  test("mismatched identities, malformed imports, underlying age and paused oracle values remain explicit", async ({
    page,
  }) => {
    const result = rwaWorkspaceFixture();
    result.stock!.oracle!.state = "paused";
    await page.route("**/v1/private/rwa/verify", (route) =>
      route.fulfill({ json: result }),
    );
    await open(page);
    await lookup(page);
    await expect(page.getByTestId("rwa-result")).toContainText(
      "Last returned; not current",
    );
    await history(page, {
      ...rwaHistoryFixture(),
      instrument: {
        chainId: 4663,
        address: `0x${"33".repeat(20)}`,
        symbol: "SAMPLE-STOCK",
      },
    });
    await expect(page.getByRole("alert")).toContainText("History hidden");
    await expect(page.getByTestId("rwa-gap-latest")).toHaveCount(0);
    await history(page, {
      ...rwaHistoryFixture(),
      referenceQuoteCurrency: "USDG",
    });
    await expect(page.getByRole("alert")).toContainText("Import unavailable");
    const underlying = rwaHistoryFixture();
    await history(page, {
      ...underlying,
      referenceType: "underlying",
      observations: underlying.observations.map(
        ({ oracleObservedAt, ...row }) => {
          void oracleObservedAt;
          return { ...row, multiplier: "1" };
        },
      ),
    });
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "Unavailable for underlying references",
    );
    await expect(page.locator(".rwa-chart-age")).toHaveCount(0);
    await expect(page.locator(".rwa-chart-age-unknown")).toHaveCount(3);
  });

  test("failed requests and unsupported identities never become a stock match", async ({
    page,
  }) => {
    await page.route("**/v1/private/rwa/verify", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: "rwa_unavailable",
            message: "Fixture sources unavailable",
          },
        },
      }),
    );
    await open(page);
    await page
      .getByRole("textbox", { name: "Token or vault contract", exact: true })
      .fill(RWA_TEST_CONTRACT);
    await page.getByRole("button", { name: "Run check", exact: true }).click();
    await page.locator("[data-confirm]").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("rwa-result")).toHaveCount(0);
    const unsupported = rwaWorkspaceFixture();
    unsupported.kind = "unsupported_contract";
    unsupported.stock = undefined;
    unsupported.headline = "No supported registry match";
    await page.route("**/v1/private/rwa/verify", (route) =>
      route.fulfill({ json: unsupported }),
    );
    await lookup(page);
    await expect(page.getByTestId("rwa-result")).toContainText(
      "Unsupported contract",
    );
    await expect(page.getByTestId("rwa-result")).not.toContainText(
      "100.03 USD",
    );
  });

  test("locks the lookup identity while loading and preserves the existing vault calculations", async ({
    page,
  }) => {
    const result = rwaWorkspaceFixture();
    result.kind = "morpho_vault";
    result.stock = undefined;
    result.headline = "Synthetic vault response";
    result.morpho = {
      name: "Synthetic vault",
      symbol: "SAMPLE-VAULT",
      version: "2.0",
      listed: true,
      asset: { address: `0x${"22".repeat(20)}`, symbol: "USDG", decimals: 6 },
      owner: `0x${"33".repeat(20)}`,
      curator: `0x${"44".repeat(20)}`,
      timelockSeconds: 604800,
      managementFeeWad: null,
      performanceFeeWad: null,
      gates: {
        sendShares: null,
        receiveShares: null,
        sendAssets: null,
        receiveAssets: null,
      },
      totalAssetsRaw: "312464692595723",
      totalSupplyRaw: "311340318068268371403691700",
      withdrawableAssetsRaw: "35034061292463",
      allocatedAssetsRaw: "302471377591652",
      idleAssetsRaw: "9993315004071",
      indexedBlock: 33439990,
      configIndexedBlock: 33439988,
      apyIndexedBlock: 33439989,
      indexLagBlocks: 10,
      trailing24hApy: "0.0362605711219608",
    };
    let finish = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await page.route("**/v1/private/rwa/verify", async (route) => {
      await pending;
      await route.fulfill({ json: result });
    });
    await open(page);
    const input = page.getByRole("textbox", {
      name: "Token or vault contract",
      exact: true,
    });
    await input.fill(RWA_TEST_CONTRACT);
    await page.getByRole("button", { name: "Run check", exact: true }).click();
    await page.locator("[data-confirm]").click();
    await expect(input).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Checking…", exact: true }),
    ).toBeDisabled();
    finish();
    await expect(page.getByTestId("rwa-result")).toContainText("Morpho vault");
    await page.locator(".rwa-ws-morpho > summary").click();
    await expect(page.locator(".rwa-ws-morpho")).toContainText(
      "312464692.595723",
    );
    await expect(page.locator(".rwa-ws-morpho")).toContainText("3.63%");
    await expect(page.locator(".rwa-ws-morpho")).toContainText(
      "10 BLOCKS BEHIND",
    );
    await expect(input).toBeEnabled();
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
    test(`fits ${width}px ${theme} with open evidence and passes WCAG checks`, async ({
      page,
    }) => {
      await page.route("**/v1/private/rwa/verify", (route) =>
        route.fulfill({ json: rwaWorkspaceFixture() }),
      );
      await open(page, width, theme);
      await noOverflow(page);
      await lookup(page);
      await history(page, syntheticSeries);
      await expect(
        page.locator(
          ".rwa-chart-point.rwa-session-open, .rwa-chart-point.rwa-session-closed, .rwa-chart-point.rwa-session-unknown",
        ),
      ).toHaveCount(syntheticSeries.observations.length);
      await page.locator("#rwa-observations > summary").click();
      const closedEvidence = page.locator(
        ".rwa-ws-dock details:not([open]) > summary",
      );
      while (await closedEvidence.count()) await closedEvidence.first().click();
      await noOverflow(page);
      const table = page.getByRole("region", {
        name: "Paired observations",
        exact: true,
      });
      await table.focus();
      await expect(table).toBeFocused();
      await expect(table).toHaveCSS("outline-style", "solid");
      const results = await new AxeBuilder({ page })
        .include(".rwa-ws-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map(
          (violation) => `${violation.id}: ${violation.nodes[0]?.target}`,
        ),
      ).toEqual([]);
    });
  }

  test("Chinese translates the tools and consent while retaining source text and exact values", async ({
    page,
  }) => {
    await page.route("**/v1/private/rwa/verify", (route) =>
      route.fulfill({ json: rwaWorkspaceFixture() }),
    );
    await open(page, 375, "dark");
    await page
      .getByRole("button", { name: "中文", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.locator("#opsis-content h1")).toHaveText("股票代币核查");
    await page
      .getByRole("textbox", { name: "代币或金库合约", exact: true })
      .fill(RWA_TEST_CONTRACT);
    await page.getByRole("button", { name: "运行核查", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("确切网络回执");
    await page
      .getByRole("button", { name: "确认公开查询", exact: true })
      .click();
    await expect(page.getByTestId("rwa-result")).toContainText("赎回未经验证");
    await expect(page.getByTestId("rwa-result")).toContainText(
      "来源文本保留原文",
    );
    await history(
      page,
      rwaHistoryFixture(),
      "导入配对价格 · 股票代币配对价差 JSON",
    );
    await expect(page.getByTestId("rwa-gap-latest")).toHaveText("4.0000%");
    await expect(
      page.getByRole("slider", { name: "选定观察值" }),
    ).toBeVisible();
    await expect(page.getByTestId("rwa-gap-selection")).toContainText(
      "120 分钟",
    );
    await noOverflow(page);
  });

  test("a missing capability hides the entire tool without a lookup request", async ({
    page,
  }) => {
    let calls = 0;
    await mockPublicOpsisAccess(page, [], { rwa: false });
    await page.route("**/v1/private/rwa/verify", async (route) => {
      calls++;
      await route.abort();
    });
    await page.goto("/rwa");
    await expect(
      page.getByRole("heading", { name: "Not enabled on this deployment" }),
    ).toBeVisible();
    await expect(page.locator(".rwa-ws-page")).toHaveCount(0);
    expect(calls).toBe(0);
  });
});
