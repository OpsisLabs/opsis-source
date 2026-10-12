import { expect, test } from "@playwright/test";

const LOCALE_COOKIE = "opsis_locale_v1";

test.describe("Simplified Chinese localization", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("switches language, updates metadata, and persists on device", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Know what you own.",
    );
    await expect(page).toHaveTitle(/Private Multi-Asset Command Center/);

    await page
      .getByRole("button", { name: "Switch language to 简体中文" })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("html")).toHaveAttribute("data-locale", "zh-CN");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "看清你的资产。",
    );
    await expect(page).toHaveTitle(/私密多资产工作台/);
    await expect
      .poll(
        async () =>
          (await context.cookies()).find(
            (cookie) => cookie.name === LOCALE_COOKIE,
          )?.value,
      )
      .toBe("zh-CN");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "私密记录，由你掌控。",
    );

    await page
      .getByRole("button", { name: "切换语言为English" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Know what you own.",
    );
    await expect
      .poll(
        async () =>
          (await context.cookies()).find(
            (cookie) => cookie.name === LOCALE_COOKIE,
          )?.value,
      )
      .toBe("en");
  });

  test("private core flows render Chinese across routes", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Switch language to 简体中文" })
      .filter({ visible: true })
      .first()
      .click();

    await page.goto("/app");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "读懂这条链。",
    );
    await expect(page.getByText("私密查询", { exact: true })).toBeVisible();
    await expect(page).toHaveTitle(/研究/);

    await page.goto("/vault");
    await expect(page.getByText("创建你的私密保险库").first()).toBeVisible();

    await page.goto("/guide");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("");

    await page.goto("/privacy");
    await expect(page).toHaveTitle(/隐私政策/);
  });

  test("mobile switcher is visible without opening a menu and preserves the public input", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    const address = "0x6aa5b565155420b7d192a9a5577dfa5a77a22352";
    await page.getByLabel("Public chain identifier", { exact: true }).fill(address);
    const switcher = page.getByRole("button", { name: "Switch language to 简体中文" }).filter({ visible: true });
    await expect(switcher).toHaveCount(1);
    await expect(switcher).toBeInViewport();
    await switcher.click();
    await expect(page.getByLabel("公开链标识符", { exact: true })).toHaveValue(address);
    await page.getByRole("button", { name: "切换语言为English" }).filter({ visible: true }).click();
    await expect(page.getByLabel("Public chain identifier", { exact: true })).toHaveValue(address);
  });

  test("first-visit tour can change language without dismissing the guide", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/app?tour=1");
    const tour = page.getByRole("dialog");
    await tour.getByRole("button", { name: "Switch language to 简体中文" }).click();
    await expect(tour).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(tour).toHaveCount(0);
  });

  test("Chinese records remain intact across language changes, lock and reload", async ({ page }) => {
    const passphrase = "localization-test-only-2026";
    const name = "中文测试卡牌 · Not a real holding";
    const requests: string[] = [];
    page.on("request", request => requests.push(request.postData() ?? ""));
    await page.goto("/vault");
    await page.getByLabel("VAULT PASSPHRASE", { exact: true }).fill(passphrase);
    await page.getByLabel("CONFIRM PASSPHRASE", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Switch language to 简体中文" }).filter({ visible: true }).first().click();
    await expect(page.getByLabel("保险库口令", { exact: true })).toHaveValue(passphrase);
    await page.getByRole("button", { name: "创建加密保险库", exact: true }).click();
    // Recovery acknowledgement uses the original English path after switching back.
    await page.getByRole("button", { name: "切换语言为English" }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: /I SAVED IT/i }).click();
    await page.getByRole("button", { name: "ADD ASSET", exact: true }).click();
    await page.getByLabel("ASSET NAME", { exact: true }).fill(name);
    await page.getByLabel("LOT 1 QUANTITY").fill("1.000000000000000001");
    await page.getByRole("button", { name: "ENCRYPT & SAVE", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Switch language to 简体中文" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "锁定", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByLabel("保险库口令", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "本地解锁", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    for (const body of requests) { expect(body).not.toContain(name); expect(body).not.toContain(passphrase); }
  });

  test("Chinese switching works inside the mobile product drawer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");

    await page.getByRole("button", { name: "FEATURES" }).click();
    const drawer = page.getByRole("dialog", {
      name: "Opsis feature menu",
    });
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole("button", { name: "Switch language to 简体中文" })
      .click();

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: "切换语言为English" })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "功能", exact: true }),
    ).toBeVisible();
  });

  test("switching language is reachable from the dashboard rail on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto("/vault");
    const rail = page.locator("[data-desktop-rail]");
    await expect(rail).toBeVisible();
    await rail
      .getByRole("button", { name: "Switch language to 简体中文" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(rail).toContainText("探索");
    await expect(page.locator("html")).toHaveAttribute("data-locale", "zh-CN");
  });

  test("no horizontal overflow on Chinese mobile layouts", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Switch language to 简体中文" })
      .filter({ visible: true })
      .first()
      .click();

    for (const path of ["/", "/app", "/guide", "/faq", "/docs"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `horizontal overflow on ${path}`,
      ).toBe(true);
    }
  });
});
