import { expect, test, type Page } from "@playwright/test";

const passphrase = "navigation audit passphrase";

async function createDisposableVault(page: Page) {
  await page.getByRole("textbox", { name: "VAULT PASSPHRASE" }).fill(passphrase);
  await page.getByRole("textbox", { name: "CONFIRM PASSPHRASE" }).fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await expect(page.getByText(/Vault created/i)).toBeVisible();
  await page.getByRole("button", { name: "I SAVED IT · HIDE CODE" }).click();
}

test("desktop product rail explains and switches between every live workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/app");

  const rail = page.getByRole("complementary", {
    name: "ChainScout features",
  });
  await expect(rail).toBeVisible();
  await expect(
    rail.getByRole("link", { name: /Private Explorer/i }),
  ).toHaveAttribute("aria-current", "page");
  await expect(rail.locator('[data-feature="private-explorer"]')).toHaveCSS(
    "background-color",
    "rgb(250, 108, 52)",
  );
  await expect(rail.locator('[data-feature="scout-swap"]')).toHaveCSS(
    "border-top-color",
    "rgb(55, 51, 48)",
  );
  await expect(
    rail.locator('[data-feature="scout-swap"] a > span').first(),
  ).toHaveCSS("color", "rgb(250, 108, 52)");
  await expect(
    rail.getByRole("button", { name: "About live swap previews" }),
  ).toHaveCSS("color", "rgb(143, 131, 123)");
  await expect(page.locator("[data-route-content]")).toBeVisible();

  await rail.getByRole("button", { name: "About live swap previews" }).click();
  await expect(
    rail.getByRole("region", { name: "Scout Swap summary" }),
  ).toContainText("Preview a current WETH/USDG route");
  await rail.getByRole("link", { name: /Scout Swap/i }).click();
  await expect(page).toHaveURL(/\/swap$/);
  await expect(
    page.getByRole("heading", { name: /See the trade before the trade/i }),
  ).toBeVisible();

  await rail.getByRole("link", { name: /RWA Verify/i }).click();
  await expect(page).toHaveURL(/\/rwa$/);
  await expect(
    page.getByRole("heading", { name: /Know what the token/i }),
  ).toBeVisible();

  await rail.getByRole("link", { name: /Portfolio Intelligence/i }).click();
  await expect(page).toHaveURL(/\/vault\?view=portfolio$/);
  await createDisposableVault(page);
  await expect(
    page.getByRole("heading", { name: "One local view of what you own." }),
  ).toBeVisible();

  await rail.getByRole("link", { name: /Collectible Catalog/i }).click();
  await expect(page).toHaveURL(/view=collectibles/);
  await expect(
    page.getByRole("heading", { name: "Match the card. Keep ownership private." }),
  ).toBeVisible();

  await rail.getByRole("link", { name: /Market & Inventory/i }).click();
  await expect(page).toHaveURL(/view=market/);
  await expect(
    page.getByRole("heading", { name: "Compare what is actually comparable." }),
  ).toBeVisible();

  await rail.getByRole("link", { name: /Replay Actions/i }).click();
  await expect(page).toHaveURL(/view=replay/);
  await expect(
    page.getByRole("heading", { name: /Repeat the idea/i }),
  ).toBeVisible();

  await rail.getByRole("link", { name: /Manual Asset Records/i }).click();
  await expect(page).toHaveURL(/view=assets/);
  await expect(page.getByText("NO ENCRYPTED ASSETS YET")).toBeVisible();

  const tourButton = rail.getByRole("button", { name: /60-second tour/i });
  await expect(tourButton).toHaveCSS("background-color", "rgb(250, 108, 52)");
  await expect(tourButton.getByText(/A clear 60-second overview/i)).toHaveCSS("color", "rgb(72, 33, 22)");
  await tourButton.click();
  const tour = page.getByRole("dialog", { name: "ChainScout product tour" });
  await expect(tour).toBeVisible();
  await expect(tour.getByText(/One clear workspace/i)).toBeVisible();
  await tour.getByRole("button", { name: "SHOW ME AROUND" }).click();
  await expect(tour.getByRole("heading", { name: /Use ChainScout in two ways/i })).toBeVisible();
  await tour.getByRole("button", { name: "CHOOSE A START" }).click();
  await tour.getByRole("link", { name: /OPEN START PAGE/i }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { name: /What do you want/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /START A PRIVATE LOOKUP/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /OPEN LOCAL CHATS/i })).toHaveAttribute("href", "/app#local-history");
  await expect(page.getByText("Saved research is separate.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /OPEN PORTFOLIO/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /ADD AN ASSET/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Private Explorer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Market & Inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep your research on this device." })).toBeVisible();
  const scrollbarTheme = await page.locator("html").evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      thumb: styles.getPropertyValue("--scrollbar-thumb").trim(),
      track: styles.getPropertyValue("--scrollbar-track").trim(),
    };
  });
  expect(scrollbarTheme).toEqual({ thumb: "#b64f29", track: "#202020" });
});

test("first production-style visit introduces the product and remembers dismissal", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/app?tour=1");

  const tour = page.getByRole("dialog", { name: "ChainScout product tour" });
  await expect(tour).toBeVisible();
  await expect(tour.getByText("NO WALLET REQUIRED")).toBeVisible();
  await expect(tour.getByText("READ-ONLY BY DESIGN")).toBeVisible();
  await expect(tour.getByText("LOCAL ENCRYPTED VAULT")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "chainscout_product_tour_seen_v1")?.value).toBe("1");

  await page.goto("/app");
  await expect(tour).toBeHidden();
  await page.getByRole("button", { name: /Open the ChainScout 60-second tour/i }).click();
  await expect(tour).toBeVisible();
  await expect(page.getByRole("button", { name: /Skip and close ChainScout tour/i })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Open the ChainScout 60-second tour/i })).toBeFocused();
});

test("context help opens the matching optional guide detail", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "About live swap previews" }).click();
  await page.getByRole("link", { name: "OPEN GUIDE →" }).click();
  await expect(page).toHaveURL(/\/guide#scout-swap$/);
  const detail = page.locator("details#scout-swap");
  await expect(detail).toHaveAttribute("open", "");
  await expect(detail.getByText(/minimum received, price impact/i)).toBeVisible();
});

test("technical docs and FAQ expose the implementation without presenting token ideas as live", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/docs");

  await expect(
    page.getByRole("heading", { name: /How ChainScout actually works/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "TECH DOCS" }).last(),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("EPHEMERAL LOOKUP")).toBeVisible();
  await expect(page.getByText("LOCAL VAULT")).toBeVisible();
  await expect(page.getByText("PBKDF2-HMAC-SHA-256")).toBeVisible();
  await expect(
    page.getByText("PROPOSAL, NOT SHIPPED TOKENOMICS"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Optional partner perks" })).toBeVisible();
  await expect(page.getByText(/contributor bounties/i)).toHaveCount(0);
  await expect(page.getByText("DO NOT BUILD")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /VIEW SOURCE/i }),
  ).toHaveAttribute("href", "https://github.com/ChainScoutAi/chainscout-source");

  const rail = page.getByRole("complementary", {
    name: "ChainScout features",
  });
  await rail.getByRole("link", { name: "FAQ" }).click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect(
    page.getByRole("heading", { name: /Questions people ask/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "FAQ" }).last(),
  ).toHaveAttribute("aria-current", "page");

  await page.getByText("How is the Vault encrypted?", { exact: true }).click();
  await expect(page.getByText(/random AES-256-GCM data key/i)).toBeVisible();
  await page.getByText("What would the token actually do?", { exact: true }).click();
  await expect(page.getByText(/No product utility is approved as live today/i)).toBeVisible();
  await expect(page.getByText(/optional partner-funded perks/i)).toBeVisible();
  await page.getByText("What happens during a pons v2 launch?", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "official pons v2 documentation" }),
  ).toHaveAttribute("href", "https://docs.ponsfamily.com/v2");

  await page.getByRole("link", { name: "START GUIDE" }).click();
  await expect(page).toHaveURL(/\/guide$/);
});

test("reduced motion keeps route changes immediate and readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app");

  const content = page.locator("[data-route-content]");
  await expect(content).toBeVisible();
  await page.getByRole("link", { name: /Scout Swap/i }).first().click();
  await expect(page).toHaveURL(/\/swap$/);
  await expect(content).toBeVisible();
  await expect(content).not.toHaveAttribute("style", /opacity|transform|visibility/);
});

test("mobile feature drawer traps focus, explains tools, and preserves navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/swap");

  const trigger = page.getByRole("button", { name: "FEATURES" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawer = page.getByRole("dialog", {
    name: "ChainScout feature menu",
  });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: /Scout Swap/i }),
  ).toHaveAttribute("aria-current", "page");
  await drawer
    .getByRole("button", { name: "About local portfolio snapshots" })
    .click();
  await expect(
    drawer.getByRole("region", { name: "Portfolio Intelligence summary" }),
  ).toContainText("Capture one address");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await drawer.getByRole("link", { name: /Private Explorer/i }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole("heading", { name: /Understand the chain/i }),
  ).toBeVisible();

  await trigger.click();
  await expect(drawer.getByRole("link", { name: "Docs" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "FAQ" })).toBeVisible();
  await drawer.getByRole("button", { name: /Open the ChainScout 60-second tour/i }).click();
  const tour = page.getByRole("dialog", { name: "ChainScout product tour" });
  await expect(tour).toBeVisible();
  await expect(drawer).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("saved research uses current ChainScout branding", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: /ChainScout.*saved research/i }),
  ).toBeVisible();
  await expect(page.getByText(/RH CHAIN AI EXPLORER/i)).toHaveCount(0);
});
