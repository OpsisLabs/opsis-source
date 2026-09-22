import { test, expect } from "@playwright/test";
const contract = `0x${"1".repeat(40)}`;
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.describe("Opsis standard controls", () => {
  test.skip(!enabled);
  test("explicit public-only check, unknown scope, stale and provider failure", async ({
    page,
  }) => {
    let calls = 0;
    const bodies: string[] = [];
    page.on("request", (r) => bodies.push(r.url() + (r.postData() ?? "")));
    await page.route("**/v1/private/opsis/access", (r) =>
      r.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: true,
          tokenControls: true,
          exitCheck: false,
          watch: false,
          rwa: false,
          observedTrades: false,
          perpExecution: false,
        },
      }),
    );
    await page.route("**/v1/private/opsis/controls", (r) => {
      calls++;
      expect(r.request().postDataJSON()).toEqual({ contract });
      if (calls > 1)
        return r.fulfill({
          status: 503,
          json: {
            error: { code: "CONTROLS_UNAVAILABLE", message: "Unavailable" },
          },
        });
      const unknown = { state: "unknown", reason: "reverted" };
      return r.fulfill({
        json: {
          kind: "observed",
          chainId: 4663,
          contract,
          hasCode: true,
          methodVersion: "controls-v1",
          source: "robinhood-public-rpc",
          observedAt: new Date(Date.now() - 31000).toISOString(),
          expiresAt: new Date(Date.now() - 1000).toISOString(),
          anchor: {
            blockNumber: 32,
            blockHash: `0x${"a".repeat(64)}`,
            timestamp: new Date().toISOString(),
            finality: "current_not_final",
          },
          readings: {
            owner: { state: "observed", value: `0x${"0".repeat(40)}` },
            paused: unknown,
            implementation: unknown,
            admin: unknown,
            beacon: unknown,
          },
          coverage: {
            state: "partial",
            rpcCalls: 9,
            unknown: [
              "mint_permissions",
              "transfer_fees",
              "custom_roles",
              "other_proxy_patterns",
              "holder_concentration",
            ],
          },
        },
      });
    });
    await page.goto(`/research?entity=${contract}`);
    await page.getByText("Inspect contract controls", { exact: true }).click();
    expect(calls).toBe(0);
    await page
      .getByRole("button", { name: "Check standard controls", exact: true })
      .click();
    const result = page.getByTestId("opsis-controls-result");
    await expect(result).toContainText("STALE");
    await expect(result).toContainText("Unknown — no valid response");
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("button", { name: "Check standard controls", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Controls unavailable");
    await expect(result).toHaveCount(0);
    expect(bodies.some((b) => b.includes("/v1/private/analyze"))).toBe(false);
  });
  test("capability absent keeps controls closed", async ({ page }) => {
    await page.route("**/v1/private/opsis/access", (r) =>
      r.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: true,
          exitCheck: false,
          watch: false,
          rwa: false,
          observedTrades: false,
          perpExecution: false,
        },
      }),
    );
    await page.goto(`/research?entity=${contract}`);
    await expect(
      page.locator("#research-entity"),
    ).toHaveValue(contract);
    await expect(
      page.getByText("Inspect contract controls", { exact: true }),
    ).toHaveCount(0);
  });
});
