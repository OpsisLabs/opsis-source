import {
  watchFixture,
  WATCH_TEST_ADDRESS,
} from "../apps/web/src/watch/fixture";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.describe("Opsis visual workspaces", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await page.route("**/v1/private/opsis/access", (route) =>
      route.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: true,
          exitCheck: true,
          watch: true,
          rwa: true,
          observedTrades: true,
          perpExecution: false,
        },
      }),
    );
  });
  test("every tool and utility shares the shell and reflows on mobile", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/research",
      "/research/details",
      "/check",
      "/watch",
      "/saved",
      "/lab",
      "/swap",
      "/simulate",
      "/stress-test",
      "/rwa",
      "/biggest-trades",
      "/research/events",
      "/guide",
      "/privacy",
      "/terms",
      "/status",
    ]) {
      await page.goto(route);
      await expect(page.locator(".opsis-terminal")).toBeVisible();
      await expect(page.locator("#opsis-content h1").first()).toBeVisible();
      await expect(page.locator(".opsis-terminal")).toHaveCSS(
        "background-color",
        "rgb(16, 0, 255)",
      );
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
          `${route} at ${width}`,
        ).toBeLessThanOrEqual(1);
      }
      await page
        .getByRole("button", { name: "Light theme", exact: true })
        .click();
      await expect(page.locator(".opsis-terminal")).toHaveCSS(
        "background-color",
        "rgb(244, 243, 255)",
      );
    }
    expect(errors).toEqual([]);
  });
  test("Research, Watch, Saved and guide keep accessible contrast in both themes", async ({
    page,
  }) => {
    test.setTimeout(120000);
    for (const route of [
      "/research",
      "/check",
      "/watch",
      "/saved",
      "/guide",
      "/status",
      "/stress-test",
      "/swap",
      "/simulate",
      "/rwa",
      "/biggest-trades",
    ]) {
      await page.goto(route);
      await expect(page.locator("#opsis-content h1").first()).toBeVisible();
      for (const theme of ["dark", "light"]) {
        if (theme === "light")
          await page
            .getByRole("button", { name: "Light theme", exact: true })
            .click();
        const result = await new AxeBuilder({ page })
          .include(".opsis")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        expect(result.violations, `${route} ${theme}`).toEqual([]);
      }
    }
  });
  test("interactive Lab opens the captured 3D map and responds to scenario controls", async ({
    page,
  }) => {
    await page.goto("/lab");
    const lab = page.frameLocator(
      'iframe[title="Opsis interactive Quant Lab"]',
    );
    await expect(lab.locator("#visibleCount")).toContainText("pools plotted");
    await expect(lab.locator("#space")).toBeVisible();
    await lab.locator("#scenarioTab").click();
    await expect(lab.locator("#visibleCount")).toContainText(
      "61 × 41 shock pairs",
    );
    const before = await lab.locator("#coreValue").innerText();
    await lab.locator("#inlineCore").focus();
    await lab.locator("#inlineCore").press("ArrowRight");
    await expect(lab.locator("#coreValue")).not.toHaveText(before);
    await lab.getByRole("button", { name: "Reset 3D view" }).click();
    await page
      .getByRole("button", { name: "Light theme", exact: true })
      .click();
    await expect(lab.locator("html")).toHaveAttribute("data-theme", "light");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await lab.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await expect(
      page.getByText("Dated observations and user-set scenarios.", {
        exact: false,
      }),
    ).toBeVisible();
  });
  test("research question controls and linked evidence inspect real response sources", async ({
    page,
  }) => {
    const id = "0x" + "a".repeat(40);
    const sources = [
      {
        id: "s1",
        provider: "source one",
        label: "First public observation",
        url: "https://example.com/one",
        fetchedAt: "2026-09-21T00:00:00Z",
      },
      {
        id: "s2",
        provider: "source two",
        label: "Second public observation",
        url: "https://example.com/two",
        fetchedAt: "2026-09-21T00:00:00Z",
      },
    ];
    let calls = 0;
    await page.route("**/v1/private/analyze", (route) => {
      calls++;
      return route.fulfill({
        json: {
          mode: "private",
          privacy: {
            accountRequired: false,
            walletConnectionRequired: false,
            serverStorage: "none",
            browserStorage: "memory_only",
            clearsOnReload: true,
            modelProvider: "none",
            providerDestinations: ["source one", "source two"],
            disclosure: "Public test observations only.",
          },
          entity: {
            chainId: 4663,
            type: "token",
            value: id,
            facts: {},
            citations: sources,
          },
          answer: {
            answer: "Observed test evidence.",
            citations: sources,
            riskNotes: [],
            confirmedFacts: [
              { fact: "First finding", sourceIds: ["s1"] },
              { fact: "Second finding", sourceIds: ["s2"] },
            ],
          },
        },
      });
    });
    await page.goto("/research");
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await expect(page.locator("#research-task")).toHaveValue("evidence");
    expect(calls).toBe(0);
    await page.locator("#research-entity").fill(id);
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    const map = page.getByRole("region", { name: "Evidence map" });
    await expect(
      map.getByRole("link", { name: "Inspect source" }),
    ).toHaveAttribute("href", "https://example.com/one");
    await map.getByRole("button", { name: /Second finding/ }).click();
    await expect(
      map.getByRole("link", { name: "Inspect source" }),
    ).toHaveAttribute("href", "https://example.com/two");
    expect(calls).toBe(1);
  });
  test("Watch chart inspects encrypted snapshots without sending labels or extra lookups", async ({
    page,
  }) => {
    let block = 100;
    const bodies: unknown[] = [];
    await page.route("**/v1/private/watch/snapshot", (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ json: watchFixture(block++) });
    });
    await page.goto("/watch");
    await page
      .getByLabel("Vault passphrase", { exact: true })
      .fill("opsis-test-only-passphrase");
    await page
      .getByLabel("Confirm passphrase", { exact: true })
      .fill("opsis-test-only-passphrase");
    await page
      .getByRole("button", { name: "Create encrypted watchlist" })
      .click();
    await page.getByRole("button", { name: "I saved my recovery key" }).click();
    const form = page.getByRole("region", { name: "Add a wallet to watch" });
    if (!(await form.getByLabel("Public Robinhood wallet address").isVisible()))
      await form.locator("summary").click();
    await form
      .getByLabel("Public Robinhood wallet address")
      .fill(WATCH_TEST_ADDRESS);
    await form.getByLabel("Private label (optional)").fill("LOCAL CHART LABEL");
    await form.getByLabel("Allow this public-address lookup").check();
    await form.getByRole("button", { name: "Save wallet & check" }).click();
    await expect(
      page.getByRole("heading", { name: "Baseline saved" }),
    ).toBeVisible();
    const detail = page.getByRole("region", { name: "Latest saved check" });
    await detail.getByLabel("Allow this public-address lookup").check();
    await detail.getByRole("button", { name: "Refresh public data" }).click();
    const chart = detail.locator(".opsis-quantity-visual");
    await expect(chart.getByRole("button")).toHaveCount(2);
    await expect(chart.locator(".opsis-chart-readout")).toContainText(
      "0.900000000000000001",
    );
    await chart.getByRole("button").first().click();
    await expect(chart.locator(".opsis-chart-readout")).toContainText(
      "1.000000000000000001",
    );
    expect(bodies).toEqual([
      { address: WATCH_TEST_ADDRESS },
      { address: WATCH_TEST_ADDRESS },
    ]);
    await page
      .getByRole("button", { name: "Lock watchlist", exact: true })
      .click();
    await expect(chart).toHaveCount(0);
  });
});
