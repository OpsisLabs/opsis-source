import { expect, test } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
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
    await expect(page.getByRole("navigation", { name: "Workspaces", exact: true }).getByRole("link", { name: "Trade Check", exact: true })).toHaveCount(0);
    await page.goto("/check");
    await expect(
      page.getByRole("heading", { name: "Not enabled on this deployment" }),
    ).toBeVisible();
    await page.locator(".opsis-footer").getByRole("link", { name: "Saved", exact: true }).click();
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

  // These run in real time: a paused clock also stops the app's own start-up timers.
  for (const locale of ["en", "zh-CN"] as const) {
    test(`opsis preview access refusal explains the shared connection and recovers ${locale}`, async ({ page }) => {
      const access = await mockPublicOpsisAccess(page, [{ status: 429, retryAfter: "6" }, {}]);
      await page.goto("/research");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("A moment before opening Opsis");
      await expect(page.locator("h1")).toHaveCount(1);
      if (locale === "zh-CN") await page.getByRole("button", { name: "中文", exact: true }).click();
      const screen = page.locator(".opsis-access-unavailable");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "A moment before opening Opsis" : "打开 Opsis 前请稍候");
      await expect(screen).toContainText(locale === "en"
        ? "Too many requests came from this network connection in a short time. A shared connection counts as one. Nothing is wrong with your device."
        : "此网络连接在短时间内发送了过多请求。共享连接按一个连接计算。您的设备没有问题。");
      await expect(screen.locator('[aria-hidden="true"]')).toHaveText(locale === "en" ? /^Opsis is retrying in [1-6] seconds?…$/ : /^Opsis 正在等待重试，还剩 [1-6] 秒…$/);
      await expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
      await expect(screen.getByRole("status")).toContainText(locale === "en" ? "Next attempt in 6 seconds." : "6 秒后再次尝试。");
      await expect(screen).not.toContainText(/429|server-only detail/);
      expect(access.requests).toBe(1);
      await expect(page.getByRole("button", { name: locale === "en" ? "Run research" : "运行研究", exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("h1")).toHaveCount(1);
      expect(access.requests).toBe(2);
      await page.waitForTimeout(3000);
      expect(access.requests).toBe(2);
    });
  }

  test("opsis preview access stops after three automatic refusals and keeps manual Retry", async ({ page }) => {
    const refusal = { status: 429, retryAfter: "2" };
    const access = await mockPublicOpsisAccess(page, [refusal, refusal, refusal, refusal, {}]);
    await page.goto("/research");
    const screen = page.locator(".opsis-access-unavailable");
    await expect(screen).toContainText("Opsis is retrying in");
    await expect(screen).toContainText("Opsis stopped retrying.", { timeout: 20_000 });
    expect(access.requests).toBe(4);
    await expect(page.locator("h1")).toHaveCount(1);
    await page.waitForTimeout(4000);
    expect(access.requests).toBe(4);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(screen).toContainText("Opsis 已停止重试。");
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByRole("button", { name: "运行研究", exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(access.requests).toBe(5);
  });

  test("opsis preview access manual Retry cancels the pending automatic attempt", async ({ page }) => {
    const access = await mockPublicOpsisAccess(page, [{ status: 429, retryAfter: "5" }, {}]);
    await page.goto("/research");
    await expect(page.locator(".opsis-access-unavailable")).toContainText("Opsis is retrying in");
    await expect(page.locator("h1")).toHaveCount(1);
    expect(access.requests).toBe(1);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("button", { name: "Run research", exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await page.waitForTimeout(7000);
    expect(access.requests).toBe(2);
  });

  test("opsis preview access server failure has a heading and only retries manually", async ({ page }) => {
    const access = await mockPublicOpsisAccess(page, [{ status: 503, retryAfter: "2" }, {}]);
    await page.goto("/research");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A moment before opening Opsis");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveText("Opsis is temporarily unavailable.");
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(page.getByLabel("Preview access key")).toHaveCount(0);
    await expect(page.locator(".opsis-access-unavailable")).not.toContainText(/503|server-only detail/);
    expect(access.requests).toBe(1);
    await page.waitForTimeout(5000);
    expect(access.requests).toBe(1);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("button", { name: "Run research", exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(access.requests).toBe(2);
  });
});
