import { expect, test } from "@playwright/test";
import { EOA, TX_B, mockObservedTrades } from "./fixtures/observed-trades";

const enabled = process.env.VITE_OBSERVED_TRADES_ENABLED === "true";
const followEnabled = process.env.VITE_WATCH_ENABLED === "true";

test("biggest observed trades closed by default", async ({ page }) => {
  test.skip(enabled);
  await page.goto("/biggest-trades");
  await expect(page).toHaveURL(/\/guide$/);
});

test("biggest observed trades fetches only after the explicit consent click", async ({
  page,
}) => {
  test.skip(!enabled);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/private/market/observed-trades")) {
      calls.push(request.url());
    }
  });
  await mockObservedTrades(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/biggest-trades");
  await expect(
    page.getByRole("heading", { name: "Big trades", exact: true, level: 1 }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);

  const consent = page.getByRole("region", { name: /Public-address disclosure/i });
  await expect(consent).toContainText("dRPC Robinhood Chain gateway");
  await expect(consent).toContainText("dRPC is a paid gateway that may route each read to an independent node operator in its network.");
  await expect(consent).not.toContainText("Robinhood Public RPC");
  await consent.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();

  await expect(page.getByText("5100").first()).toBeVisible();
  expect(calls).toHaveLength(1);
  const follow = page.getByRole("link", { name: /FOLLOW THIS WALLET/i });
  if (followEnabled) {
    await expect(follow).toHaveAttribute("href", `/watch?address=${EOA}`);
  } else {
    await expect(follow).toHaveCount(0);
  }
  const explorer = page.getByRole("link", { name: /View transaction/i }).first();
  await expect(explorer).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/tx/${TX_B}`,
  );
});

test("biggest observed trades stays usable on mobile in English and Chinese", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockObservedTrades(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole("button", { name: "Switch language to 简体中文", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "大额交易", exact: true, level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("biggest observed trades surfaces a bounded error with a retry", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockObservedTrades(page, 503);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: /TRY AGAIN/i })).toBeVisible();
});

test("biggest observed trades hides the shared follow action when Watch is disabled", async ({
  page,
}) => {
  test.skip(!enabled || followEnabled);
  await mockObservedTrades(page);
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /FOLLOW THIS WALLET/i }),
  ).toHaveCount(0);
});

test("biggest observed trades clears stale results on input change and unmount", async ({
  page,
}) => {
  test.skip(!enabled);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/private/market/observed-trades")) {
      calls.push(request.url());
    }
  });
  await mockObservedTrades(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/biggest-trades");
  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  expect(calls).toHaveLength(1);

  await page.getByLabel(/Token contract/i).fill(`0x${"12".repeat(20)}`);
  await expect(page.getByText("5100")).toHaveCount(0);
  expect(calls).toHaveLength(1);

  await page.getByRole("button", { name: /OBSERVE RECENT SWAPS/i }).click();
  await expect(page.getByText("5100").first()).toBeVisible();
  expect(calls).toHaveLength(2);

  await page.getByRole("link", { name: "Find your tool", exact: true }).first().click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { name: "Big trades", exact: true, level: 1 }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: /Big trades/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/biggest-trades$/);
  await expect(page.getByText("5100")).toHaveCount(0);
});
