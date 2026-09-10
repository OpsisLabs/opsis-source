import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { APP_ORIGIN } from "./support/origin";
const enabled = process.env.VITE_CARD_PRICE_CHECK_ENABLED === "true";
const input = { provider: "tcgdex", cardId: "base1-4" };
const privacy = { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", modelProvider: "none", providerDestinations: ["TCGdex"], disclosure: "Only public card identifiers are sent." };
function fixture() { return { ...input, name: "Charizard", fetchedAt: new Date().toISOString(), sourceUrl: "https://api.tcgdex.net/v2/en/cards/base1-4", rows: [
  { market: "TCGplayer", variant: "holofoil", metric: "lowPrice", amount: 12, currency: "USD", updatedAt: null },
  { market: "TCGplayer", variant: "holofoil", metric: "marketPrice", amount: 55.5, currency: "USD", updatedAt: null },
  { market: "Cardmarket", variant: "unspecified printing", metric: "trend", amount: 42, currency: "EUR", updatedAt: "2026-09-01T12:00:00Z" },
] }; }

test("card price check preserves exact data and inputs when switching English and Chinese", async ({ page }) => {
  test.skip(!enabled, "enabled-build check"); let calls = 0;
  await page.route("**/v1/private/cards/prices", async route => {
    calls++; expect(route.request().postDataJSON()).toEqual(input);
    await route.fulfill({ json: fixture() });
  });
  await page.goto("/card-prices");
  await page.getByRole("button", { name: "Check Charizard", exact: true }).click();
  await expect(page.getByText("USD 55.50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch language to 简体中文" }).filter({ visible: true }).first().click();
  await expect(page).toHaveTitle("卡牌价格查询 | ChainScout");
  const snapshot = page.getByRole("region", { name: "卡牌价格快照" });
  await expect(snapshot.getByText("USD 55.50", { exact: true })).toBeVisible();
  await expect(snapshot.getByText("市场参考价", { exact: true })).toBeVisible();
  await expect(snapshot.getByRole("heading", { name: "Charizard", exact: true })).toBeVisible();
  await snapshot.getByRole("button", { name: "EUR", exact: true }).click();
  await expect(snapshot.getByText("EUR 42.00", { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "切换语言为English" }).filter({ visible: true }).first().click();
  await expect(page.getByText("EUR 42.00", { exact: true })).toBeVisible();
  await page.getByLabel("Card name", { exact: true }).fill("Pikachu");
  await page.getByRole("button", { name: "Switch language to 简体中文" }).filter({ visible: true }).first().click();
  await expect(page.getByLabel("卡牌名称", { exact: true })).toHaveValue("Pikachu");
  expect(calls).toBe(1);
});
test.beforeEach(async ({ page }) => { await page.context().addCookies([{ name: "chainscout_product_tour_seen_v1", value: "1", url: APP_ORIGIN, sameSite: "Strict" }]); });

test("card price check is closed by default, including direct links", async ({ page }) => {
  test.skip(enabled, "closed-build check"); let calls = 0;
  await page.route("**/v1/private/cards/prices", route => { calls++; return route.abort(); });
  await page.goto("/card-prices"); await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("button", { name: "Check Charizard", exact: true })).toHaveCount(0); expect(calls).toBe(0);
});

test("card price check examples separate currencies, keep all metrics and need no Vault", async ({ page }) => {
  test.skip(!enabled, "enabled-build check"); const calls: unknown[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/v1/private/cards/prices", async route => { calls.push(route.request().postDataJSON()); await route.fulfill({ json: fixture() }); });
  await page.goto("/");
  await expect(page.getByRole("link", { name: /NEW Card Price Check/ })).toHaveAttribute("href", "/card-prices");
  await page.goto("/card-prices?cardId=base1-4"); await expect(page).toHaveTitle("Card Price Check | ChainScout"); expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Check Charizard", exact: true }).click();
  const snapshot = page.getByRole("region", { name: "Card price snapshot", exact: true });
  await expect(snapshot.getByText("USD 55.50", { exact: true })).toBeVisible();
  await expect(snapshot.getByText("USD 12.00", { exact: true })).toHaveCount(0);
  await expect(snapshot.getByText(/Source price time unknown/)).toBeVisible();
  await snapshot.getByText("All USD reference metrics (2)", { exact: true }).click();
  await expect(snapshot.getByText("USD 12.00 · Low-price reference", { exact: true })).toBeVisible();
  await snapshot.getByRole("button", { name: "EUR", exact: true }).click();
  await expect(snapshot.getByText("EUR 42.00", { exact: true })).toBeVisible();
  expect(calls).toEqual([input]);
  await expect(snapshot.getByRole("link", { name: "Inspect original source" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(snapshot.getByRole("link", { name: "Inspect original source" })).toHaveAttribute("referrerpolicy", "no-referrer");
  for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); }
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter(v => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
  if (process.env.CHAINSCOUT_PRICE_SHOT) await page.screenshot({ path: process.env.CHAINSCOUT_PRICE_SHOT, fullPage: true });
  await page.getByLabel("Card name", { exact: true }).fill("Pikachu"); await expect(snapshot).toHaveCount(0);
  await page.reload(); await expect(snapshot).toHaveCount(0); expect(calls).toEqual([input]); expect(errors).toEqual([]);
});

test("card price check rejects mismatches, clears failed results and preserves empty prices", async ({ page }) => {
  test.skip(!enabled, "enabled-build check"); let mode = "okay", calls = 0;
  await page.route("**/v1/private/cards/prices", async route => {
    calls++; const request = route.request().postDataJSON();
    expect(Object.keys(request).sort()).toEqual(["cardId", "provider"]);
    if (mode === "fail") { await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Provider unavailable" } } }); return; }
    const data = fixture(); if (mode === "mismatch") data.cardId = "base1-58"; if (mode === "empty") data.rows = [];
    await route.fulfill({ json: data });
  });
  await page.goto("/card-prices"); const action = page.getByRole("button", { name: "Check Charizard", exact: true });
  await action.click(); await expect(page.getByRole("region", { name: "Card price snapshot" })).toBeVisible();
  mode = "fail"; await action.click(); await expect(page.getByRole("alert")).toContainText("The service is unavailable right now"); await expect(page.getByRole("region", { name: "Card price snapshot" })).toHaveCount(0);
  mode = "mismatch"; await action.click(); await expect(page.getByRole("alert")).toContainText("could not be verified");
  mode = "empty"; await action.click(); await expect(page.getByRole("status")).toContainText("Missing prices do not mean zero value");
  await page.getByText("Already know the public card ID?", { exact: true }).click();
  await page.getByLabel("Public catalog card ID", { exact: true }).fill("https://evil.test");
  await expect(page.getByRole("button", { name: "Check prices", exact: true })).toBeDisabled(); expect(calls).toBe(4);
});

test("card price check search and optional photo are click-only and clear on change", async ({ page }) => {
  test.skip(!enabled, "enabled-build check"); let searches = 0, prices = 0, photos = 0, details = 0;
  await page.route("**/v1/private/cards/prices", async route => { prices++; expect(route.request().postDataJSON()).toEqual(input); await route.fulfill({ json: fixture() }); });
  await page.route("**/v1/private/collectibles/search", async route => {
    searches++; expect(route.request().postDataJSON()).toEqual({ language: "en", name: "Charizard" });
    await route.fulfill({ json: { query: { language: "en", name: "Charizard", number: null, setId: null }, results: [{ catalogId: "base1-4", name: "Charizard", number: "4" }], matchesShown: 1, truncated: false, fetchedAt: new Date().toISOString(), source: { provider: "tcgdex", url: "https://tcgdex.dev", licenseUrl: "https://github.com/tcgdex/cards-database/blob/master/LICENSE" }, privacy } });
  });
  const imageUrl = "https://assets.tcgdex.net/en/base/base1/4/low.png";
  await page.route("**/v1/private/collectibles/detail", async route => {
    details++; expect(route.request().postDataJSON()).toEqual({ language: "en", cardId: "base1-4" });
    await route.fulfill({ json: { card: { provider: "tcgdex", catalogId: "base1-4", language: "en", name: "Charizard", number: "4", category: "Pokemon", set: { id: "base1", name: "Base Set", officialCount: 102, totalCount: 102 }, rarity: "Rare", illustrator: "Mitsuhiro Arita", catalogUpdatedAt: null, fetchedAt: new Date().toISOString(), imageUrl, sourceUrl: "https://api.tcgdex.net/v2/graphql", licenseUrl: "https://github.com/tcgdex/cards-database/blob/master/LICENSE" }, privacy } });
  });
  await page.route(imageUrl, async route => { photos++; expect(route.request().headers().referer).toBeUndefined(); await route.fulfill({ contentType: "image/png", body: await readFile("apps/web/public/og.png") }); });
  await page.goto("/card-prices"); await page.getByLabel("Card name", { exact: true }).fill("Charizard"); expect(searches).toBe(0);
  await page.getByRole("button", { name: "Search Pokémon cards", exact: true }).click();
  await page.getByRole("button", { name: /Charizard base1-4/ }).click();
  await expect(page.getByRole("region", { name: "Card price snapshot" })).toBeVisible(); expect(photos).toBe(0); expect(details).toBe(0);
  await page.getByRole("button", { name: "Load Pokémon card photo", exact: true }).click();
  await expect(page.getByRole("img", { name: /Charizard catalog card/ })).toHaveAttribute("src", /^data:image\//);
  expect({ searches, prices, photos, details }).toEqual({ searches: 1, prices: 1, photos: 1, details: 1 });
  await page.getByLabel("Card name", { exact: true }).fill("Pikachu"); await expect(page.getByRole("img", { name: /catalog card/ })).toHaveCount(0);
});
