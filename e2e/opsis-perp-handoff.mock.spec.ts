import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
// Same credentialless access mock used by opsis-layout.mock.spec.ts and
// opsis-design.mock.spec.ts; no venue routes or live data are needed.
async function mockAccess(page: Page, perpHandoff?: boolean) {
  await page.route("**/v1/private/opsis/access", (route) => {
    expect(route.request().postDataJSON()).toEqual({});
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({ json: {
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663,
      research: true, exitCheck: false, watch: false, rwa: false,
      observedTrades: false, swapPreview: false, perpExecution: false,
      ...(perpHandoff === undefined ? {} : { perpHandoff }),
    } });
  });
}
const handoff = (page: Page) => page.getByRole("region", { name: "Take this to a venue", exact: true });

test.describe("opsis preview perp hand-off", () => {
  test.skip(!enabled);
  for (const flag of [false, undefined]) {
    test(`opsis preview hides the directory when capability is ${String(flag)}`, async ({ page }) => {
      await mockAccess(page, flag);
      await page.goto("/check/perp-scenario");
      await expect(page.locator("#opsis-content h1").first()).toBeVisible();
      await expect(handoff(page)).toHaveCount(0);
    });
  }
  test("opsis preview shows reviewed regions alphabetically without sending or retaining the choice", async ({ page }) => {
    await mockAccess(page, true);
    const requests: string[] = [];
    const interactionRequests: string[] = [];
    let interacting = false;
    page.on("request", (request) => {
      // Idle route prefetching and late font loads fetch first-party static files
      // and carry no data. Anything else, or anything cross-origin, is a leak.
      const sameOrigin = new URL(request.url()).origin === new URL(page.url()).origin;
      const staticFile = request.method() === "GET" && ["script", "stylesheet", "font", "image"].includes(request.resourceType());
      if (interacting && (!sameOrigin || !staticFile)) interactionRequests.push(request.url());
      const url = new URL(request.url());
      if (["fetch", "xhr", "ping"].includes(request.resourceType()) || url.hostname !== "localhost") requests.push(request.url());
    });
    await page.goto("/check/perp-scenario");
    const section = handoff(page);
    await expect(section).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The development build can run the access check twice; nothing else may leave the page.
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((url) => url.endsWith("/v1/private/opsis/access"))).toBe(true);
    requests.length = 0;
    interacting = true;
    const localState = () => page.evaluate(() => ({
      url: location.href, cookie: document.cookie,
      local: { ...localStorage }, session: { ...sessionStorage },
    }));
    const before = await localState();
    await expect(section.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(section.locator("article")).toHaveCount(0);
    await expect(section).toContainText("Complete the scenario above");
    await section.getByRole("radio", { name: "United States", exact: true }).check();
    await expect(section.locator("article h3")).toHaveText(["Coinbase", "Kalshi", "Kraken"]);
    await expect(section).toContainText("Availability can differ by state");
    await expect(section).toContainText("Each venue decides eligibility in its own onboarding");
    await expect(section.getByRole("link", { name: /^Open / })).toHaveCount(3);
    for (const link of await section.getByRole("link").all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(await link.innerText()).toMatch(/↗$/);
      const url = new URL((await link.getAttribute("href"))!);
      expect(url.protocol).toBe("https:");
      expect(url.search + url.hash).toBe("");
      expect(url.href.toLowerCase()).not.toMatch(/ref|utm|affiliate/);
    }
    await section.getByRole("radio", { name: "Canada", exact: true }).check();
    await expect(section).toContainText("No venue in this directory offers perpetual futures to retail customers in Canada.");
    await expect(section.locator("article h3")).toHaveText(["Coinbase"]);
    await expect(section.locator("article")).toContainText("Eligible customers only");
    await expect(section.locator("article")).toContainText("at least $5 million excluding real estate");
    await expect(section.locator(".opsis-perp-exclusions > li > h4")).toHaveText(["Kalshi", "Kraken"]);
    await expect(section.getByRole("link", { name: "Open Kalshi ↗", exact: true })).toHaveCount(0);
    await expect(section.getByRole("link", { name: "Open Kraken ↗", exact: true })).toHaveCount(0);
    await section.getByRole("radio", { name: "Somewhere else", exact: true }).check();
    await expect(section.locator("article")).toHaveCount(0);
    await expect(section.getByRole("link")).toHaveCount(0);
    await expect(section).toContainText("Opsis has reviewed venues for the United States and Canada only.");
    expect(await localState()).toEqual(before);
    expect(requests).toEqual([]);
    expect(interactionRequests).toEqual([]);
    interacting = false;
    await page.reload();
    await expect(handoff(page).getByRole("radio", { checked: true })).toHaveCount(0);
  });
  test("opsis preview hand-off reflows in English at 320px and Chinese at 375px with no serious accessibility violations", async ({ page }) => {
    await mockAccess(page, true);
    await page.goto("/check/perp-scenario");
    await expect(handoff(page)).toBeVisible();
    for (const locale of ["en", "zh-CN"]) {
      await page.setViewportSize({ width: locale === "en" ? 320 : 375, height: 900 });
      if (locale === "zh-CN") await page.getByRole("button", { name: "中文", exact: true }).click();
      const section = page.locator(".opsis-perp-handoff");
      await expect(section.getByRole("heading", { level: 2 })).toHaveText(locale === "en" ? "Take this to a venue" : "带着情景前往交易场所");
      for (const region of locale === "en" ? ["United States", "Canada", "Somewhere else"] : ["美国", "加拿大", "其他地区"]) {
        await section.getByRole("radio", { name: region, exact: true }).check();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        const result = await new AxeBuilder({ page }).include(".opsis").withTags(["wcag2a", "wcag2aa"]).analyze();
        expect(result.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
      }
    }
  });
});
