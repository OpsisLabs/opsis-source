import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const address = "0x0000000000000000000000000000000000000042";
const passphrase = "launch hardening vault passphrase";

async function dismissTour(page: Page) {
  await page.context().addCookies([{ name: "chainscout_product_tour_seen_v1", value: "1", domain: "localhost", path: "/", sameSite: "Strict" }]);
}

async function assertNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Color is certified by a separate focused gate after the launch palette
    // floor. Structural scans stay actionable instead of collapsing hundreds
    // of repeated design-token occurrences into one finding.
    .disableRules(["color-contrast"])
    .analyze();
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`).join("\n")).toEqual([]);
}

test("key launch surfaces pass automated serious/critical accessibility checks", async ({ page }) => {
  await dismissTour(page);
  for (const path of ["/", "/app", "/vault", "/rwa", "/swap", "/guide", "/docs", "/faq", "/privacy", "/terms"]) {
    await page.goto(path);
    await page.locator("main").first().waitFor({ state: "visible" });
    await assertNoSeriousAxeViolations(page);
  }
});

test("keyboard tour makes the background inert, supports reflow, and restores focus", async ({ page, browserName }) => {
  await dismissTour(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  const trigger = page.getByRole("button", { name: /Open the ChainScout 60-second tour/i });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const tour = page.getByRole("dialog", { name: "ChainScout product tour" });
  await expect(tour).toBeVisible();
  await expect(page.locator("[data-route-content]")).toHaveAttribute("inert", "");
  await expect(page.locator("[data-desktop-rail]")).toHaveAttribute("inert", "");
  await expect(tour).toHaveCSS("overflow-y", "auto");
  await assertNoSeriousAxeViolations(page);
  for (let step = 0; step < 3; step += 1) {
    const contrast = await new AxeBuilder({ page }).include("[role=dialog]").withRules(["color-contrast"]).analyze();
    expect(contrast.violations, `tour step ${step + 1}: ${contrast.violations.map((violation) => `${violation.help} (${violation.nodes.length})`).join(", ")}`).toEqual([]);
    if (step < 2) await page.getByRole("button", { name: step === 0 ? "SHOW ME AROUND" : "CHOOSE A START" }).click();
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.reload();
  const skipLink = page.locator("a[href='#product-main']");
  // macOS WebKit follows the host's Full Keyboard Access preference and may
  // skip links during Tab traversal. Chromium proves traversal; WebKit still
  // proves the focus target, focus treatment, and keyboard activation.
  if (browserName === "webkit") await skipLink.focus();
  else await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#product-main$/);
  await expect(page.locator("#product-main")).toBeFocused();
});

test("persistent sign-in and workspace quick start make the active flow obvious", async ({ page }) => {
  await dismissTour(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");

  await expect(page.getByRole("link", { name: /Connect wallet \/ sign in/i })).toHaveAttribute("href", "/login");
  const trigger = page.getByRole("button", { name: "Open how-to instructions for this page" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const quickstart = page.getByRole("dialog", { name: "Private Explorer" });
  await expect(quickstart).toBeVisible();
  await expect(page.locator("[data-route-content]")).toHaveAttribute("inert", "");
  await expect(page.locator("[data-desktop-rail]")).toHaveAttribute("inert", "");
  await expect(quickstart.getByText("01")).toBeVisible();
  await expect(quickstart.getByText("02")).toBeVisible();
  await expect(quickstart.getByText("03")).toBeVisible();
  await expect(quickstart.getByText("Paste one public address or transaction hash.")).toBeVisible();
  await expect(quickstart.getByRole("link", { name: /FULL GUIDE/i })).toHaveAttribute("href", "/guide#private-explorer");
  const contrast = await new AxeBuilder({ page }).include("[role=dialog]").withRules(["color-contrast"]).analyze();
  expect(contrast.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("Vault demo set is local-only, encrypted, persistent, and removable as a group", async ({ page }) => {
  test.setTimeout(45_000);
  await dismissTour(page);
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/v1/")) apiRequests.push(request.url());
  });
  await page.goto("/vault?view=assets");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  await page.getByRole("button", { name: "LOAD 4 DEMO ASSETS" }).click();
  for (const name of [
    "[DEMO] Wrapped Ether",
    "[DEMO] Charizard · Base Set",
    "[DEMO] Apple Stock Token",
    "[DEMO] Robinhood Chain Collectible #42",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByTestId("collectible-value-history")).toBeVisible();
  await expect(page.getByText(/4 clearly labeled demo records were encrypted/i)).toBeVisible();
  expect(apiRequests).toEqual([]);

  const rawVault = JSON.stringify(await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("chainscout-private-vault", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["meta", "records"], "readonly");
      const meta = transaction.objectStore("meta").getAll();
      const records = transaction.objectStore("records").getAll();
      transaction.oncomplete = () => {
        db.close();
        resolve({ meta: meta.result, records: records.result });
      };
      transaction.onerror = () => reject(transaction.error);
    };
  })));
  expect(rawVault).not.toContain("[DEMO] Charizard");
  expect(rawVault).not.toContain("CHAINSCOUT DEMO DATA");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("heading", { name: "[DEMO] Charizard · Base Set" })).toBeVisible();

  await page.getByRole("button", { name: "REMOVE DEMO RECORDS" }).click();
  await page.getByRole("button", { name: "CONFIRM REMOVE 4" }).click();
  await expect(page.getByText("NO ENCRYPTED ASSETS YET")).toBeVisible();
  await expect(page.getByText(/4 demo records were removed/i)).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("mobile new-user journey moves from a private lookup into one encrypted workspace", async ({ page }) => {
  test.setTimeout(45_000);
  await dismissTour(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: privateResult() }));

  await page.goto("/guide");
  const featureTriggerBox = await page.getByRole("button", { name: "FEATURES" }).boundingBox();
  expect(featureTriggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(featureTriggerBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByRole("link", { name: /START A PRIVATE LOOKUP/i }).click();
  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByText("This public wallet has a small recent activity sample.")).toBeVisible();

  await page.getByRole("button", { name: "FEATURES" }).click();
  await page.getByRole("dialog", { name: "ChainScout feature menu" }).getByRole("link", { name: /Manual Asset Records/i }).click();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Launch journey asset");
  await page.getByLabel("LOT 1 QUANTITY").fill("1");
  await page.getByLabel("PRICE PER UNIT").fill("10");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByRole("heading", { name: "Launch journey asset" })).toBeVisible();

  for (const feature of [/Portfolio Intelligence/i, /Collectible Catalog/i, /Market & Inventory/i, /Replay Actions/i]) {
    await page.getByRole("button", { name: "FEATURES" }).click();
    await page.getByRole("dialog", { name: "ChainScout feature menu" }).getByRole("link", { name: feature }).click();
    await expect(page).toHaveURL(/\/vault\?view=/);
  }
  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  await expect(page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "DELETE LOCAL VAULT" })).toBeVisible();
});

test("optional cloud-account deletion completes in the browser and clears the session", async ({ page, context }) => {
  await context.addCookies([{ name: "cs_access", value: "test-session", domain: "localhost", path: "/", httpOnly: true, sameSite: "Strict" }]);
  const requests: Array<{ method: string; body: unknown }> = [];
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: "user-1", username: "launch-user", walletAddress: address } } });
    if (path === "/v1/chat/sessions") return route.fulfill({ json: { sessions: [] } });
    if (path === "/v1/usage/me") return route.fulfill({ json: { aiMessages: 0, chainLookups: 0, quota: { aiMessages: 500, chainLookups: 5000 }, usage: { aiMessages: 0, chainLookups: 0, quota: { aiMessages: 500, chainLookups: 5000 } } } });
    if (path === "/v1/account/export" && request.method() === "GET") {
      requests.push({ method: request.method(), body: null });
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "content-disposition": "attachment; filename=chainscout-account-export.json", "cache-control": "no-store" },
        body: JSON.stringify({ schemaVersion: 1, account: { id: "user-1" }, sessions: [] }),
      });
    }
    if (path === "/v1/account" && request.method() === "DELETE") {
      requests.push({ method: request.method(), body: request.postDataJSON() });
      return route.fulfill({ status: 204, headers: { "set-cookie": "cs_access=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict" }, body: "" });
    }
    if (path === "/v1/auth/logout") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "not found" } } });
  });

  await page.goto("/cloud/privacy?tour=0");
  await expect(page.getByRole("heading", { name: /Your data stays under your control/i })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT JSON" }).click();
  await expect((await download).suggestedFilename()).toMatch(/^chainscout-account-export-/);
  await page.getByPlaceholder("DELETE MY CHAINSCOUT ACCOUNT").fill("DELETE MY CHAINSCOUT ACCOUNT");
  await page.getByRole("button", { name: "DELETE MY ACCOUNT" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(requests).toEqual([
    { method: "GET", body: null },
    { method: "DELETE", body: { confirmation: "DELETE MY CHAINSCOUT ACCOUNT" } },
  ]);
});

function privateResult() {
  const citation = { id: "launch-source", provider: "blockscout", url: `https://robinhoodchain.blockscout.com/address/${address}`, description: "Public wallet activity", fetchedAt: "2026-08-12T12:00:00.000Z", fieldsUsed: ["transactionsFetched"] };
  return {
    mode: "private",
    entity: { chainId: 4663, type: "wallet", value: address, facts: { address, transactionsFetched: 1 }, citations: [citation], riskNotes: [] },
    answer: { answer: "This public wallet has a small recent activity sample.", facts: { address, transactionsFetched: 1 }, summaryBullets: ["One indexed transaction."], confirmedFacts: [], inferences: [], uncertainty: ["Provider indexing can lag."], riskNotes: [], citations: [citation], suggestedQuestions: [] },
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "memory_only", clearsOnReload: true, modelProvider: "none", providerDestinations: ["blockscout"], disclosure: "Only the public identifier was sent." },
  };
}

test("essential muted copy meets the audited charcoal contrast floor", async ({ page }) => {
  await dismissTour(page);
  await page.goto("/app");
  const foreground = await page.getByText("THIS VIEW IS EPHEMERAL").evaluate((element) => getComputedStyle(element).color);
  expect(foreground).toBe("rgb(154, 147, 138)");
  const result = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(result.violations).toEqual([]);
});

test("launch pages have no automated color-contrast violations", async ({ page }) => {
  await dismissTour(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/app", "/vault", "/rwa", "/swap", "/guide", "/docs", "/faq", "/privacy", "/terms"]) {
    await page.goto(path);
    await page.locator("main").first().waitFor({ state: "visible" });
    const result = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(result.violations, `${path}: ${result.violations.map((violation) => `${violation.help} (${violation.nodes.length})`).join(", ")}`).toEqual([]);
  }
});

test("marketing home makes the multi-asset Vault apparent and honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Know what you own/i })).toBeVisible();
  await expect(page.getByText("POKÉMON / TCG", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pokémon, TCG & collectibles" })).toBeVisible();
  await expect(page.getByText(/Assisted TCGdex English card\/set matching.*work in this build/i)).toBeVisible();
  await expect(page.getByText("TCGdex-assisted collectible identity", { exact: true })).toBeVisible();
  await expect(page.getByText(/Assisted TCGdex card\/set matching is coming soon/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ADD A COLLECTIBLE" })).toHaveAttribute("href", "/vault?view=assets");
  await expect(page.getByText("COMING SOON", { exact: true }).first()).toBeVisible();
  const transform = await page.locator("[data-home-reveal]").first().evaluate((element) => getComputedStyle(element).transform);
  expect(transform).toBe("none");

  await page.goto("/docs");
  await expect(page.getByText(/RWA Verify, and Collectible Catalog are enabled/i)).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "COLLECTIBLES" }).getByText("COMING SOON")).toHaveCount(0);
});
