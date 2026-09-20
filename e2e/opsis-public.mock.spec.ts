import { expect, test } from "@playwright/test";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.describe("public Opsis", () => {
  test.skip(!enabled);
  test("opens without credentials and preserves local Vault encryption", async ({
    page,
  }) => {
    let lookups = 0;
    await page.route("**/v1/private/analyze", (route) => {
      lookups++;
      return route.abort();
    });
    await page.route("**/v1/private/opsis/access", (route) => {
      expect(route.request().headers().authorization).toBeUndefined();
      return route.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          chainId: 4663,
          research: true,
          exitCheck: false,
          watch: true,
          rwa: false,
          observedTrades: false,
          perpExecution: false,
        },
      });
    });
    await page.goto("/");
    const film = page.frameLocator(
      'iframe[title="Opsis overview — interactive chain"]',
    );
    await expect(
      film.getByRole("heading", { name: "See the bigger picture." }),
    ).toBeVisible();
    await expect(page.getByLabel("Preview access key")).toHaveCount(0);
    await expect(film.locator("#lock-preview")).toBeHidden();
    await film
      .getByRole("navigation", { name: "Workspaces" })
      .getByRole("button", { name: "Research", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Run research", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lock preview", exact: true }),
    ).toHaveCount(0);
    expect(lookups).toBe(0);
    await page.getByRole("link", { name: "Trade Check", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Not enabled in this preview" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Saved", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "CREATE ENCRYPTED VAULT", exact: true }),
    ).toBeVisible();
  });
  test("capability failure offers retry without a password prompt", async ({
    page,
  }) => {
    let failed = true;
    await page.route("**/v1/private/opsis/access", (route) =>
      failed
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({
            json: {
              expiresAt: new Date(Date.now() + 60000).toISOString(),
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
    await page.goto("/research");
    await expect(page.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await expect(page.getByLabel("Preview access key")).toHaveCount(0);
    failed = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Run research", exact: true }),
    ).toBeVisible();
  });
});
