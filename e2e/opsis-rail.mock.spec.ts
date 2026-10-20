import { expect, test } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

test("opsis preview rail reaches enabled tools and marks the active tool", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockPublicOpsisAccess(page, [], { rwa: true, observedTrades: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/guide");
  const rail = page
    .locator(".opsis-desktop-rail")
    .getByRole("navigation", { name: "Workspaces", exact: true });
  await expect(rail).toBeVisible();
  const groups = [
    [
      "Look up",
      [
        "/research",
        "/rwa",
        ...(process.env.VITE_OBSERVED_TRADES_ENABLED === "true"
          ? ["/biggest-trades"]
          : []),
        ...(process.env.VITE_SITUATION_ROOM_ENABLED === "true"
          ? ["/research/events"]
          : []),
      ],
    ],
    [
      "Before you trade",
      [
        ...(process.env.VITE_EXIT_CHECK_ENABLED === "true" ? ["/check"] : []),
        "/check/perp-scenario",
        ...(process.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true"
          ? ["/stress-test"]
          : []),
      ],
    ],
    [
      "Keep watch",
      [
        ...(process.env.VITE_WATCH_ENABLED === "true" ? ["/watch"] : []),
        "/saved",
      ],
    ],
    ["Explore data", ["/lab"]],
  ] as const;
  for (const [group, paths] of groups) {
    await expect(
      rail.getByRole("heading", { name: group, exact: true }),
    ).toBeVisible();
    for (const path of paths) {
      const link = rail.locator(`a[href="${path}"]`);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("#opsis-content h1")).toHaveCount(1);
      await expect(link).toHaveAttribute("aria-current", "page");
    }
  }
  await rail.getByRole("link", { name: "Find your tool", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "What do you want to find out?",
  );
  const field = page.locator("#guide-entity");
  await field.fill("WETH");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/research\?entity=0x[\da-fA-F]{40}$/);
});

test("opsis preview phone menu supports keyboard, restores focus and fits 375 pixels", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockPublicOpsisAccess(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/guide");
  await expect(page.locator("#opsis-content h1")).toHaveCount(1);
  await expect(page.locator("#guide-entity")).toBeInViewport();
  await expect(page.locator(".opsis-overview-search button")).toBeInViewport();
  const trigger = page.getByRole("button", { name: "Open menu", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const menu = page.getByRole("dialog", { name: "Tool menu", exact: true });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    menu.getByRole("button", { name: "Close menu ×", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await menu.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("Enter");
  await menu.getByRole("button", { name: "Close menu ×", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
  await trigger.press("Enter");
  await menu.getByRole("link", { name: "Research", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.locator("#opsis-content h1")).toHaveCount(1);
});

test("opsis preview rail colour runs the full page length, also in a full-page capture", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockPublicOpsisAccess(page);
  const sample = async (theme: "light" | "dark") => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/check/perp-scenario");
    await expect(page.locator("#opsis-content h1")).toHaveCount(1);
    // A page several screens long, whatever the tool's own content height.
    await page.addStyleTag({
      content: ".opsis-content { min-height: 3200px !important; }",
    });
    const railWidth = await page
      .locator(".opsis-desktop-rail")
      .evaluate((element) => element.getBoundingClientRect().width);
    const capture = await page.screenshot({ fullPage: true });
    return page.evaluate(
      async ({ png, railWidth }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const at = (x: number, y: number) =>
          Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
        const bottom = image.height - 4;
        return {
          height: image.height,
          viewport: innerHeight,
          railBottom: at(12, bottom),
          railMiddle: at(12, Math.round(image.height / 2)),
          edgeBottom: at(Math.round(railWidth) - 1, bottom),
          contentBottom: at(Math.round(railWidth) + 12, bottom),
        };
      },
      { png: capture.toString("base64"), railWidth },
    );
  };
  for (const width of [1280, 900]) {
    for (const theme of ["light", "dark"] as const) {
      const label = `${width} ${theme}`;
      await page.setViewportSize({ width, height: 800 });
      const result = await sample(theme);
      expect(result.height).toBeGreaterThan(result.viewport * 3);
      expect(result.railMiddle, label).toEqual([6, 74, 242]);
      expect(result.railBottom, label).toEqual([6, 74, 242]);
      expect(result.edgeBottom, label).toEqual([213, 226, 255]);
      expect(result.contentBottom, label).not.toEqual([6, 74, 242]);
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  const phone = await sample("light");
  expect(phone.railBottom).not.toEqual([6, 74, 242]);
});
