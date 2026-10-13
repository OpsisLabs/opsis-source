import type { Page } from "@playwright/test";

export async function mockPublicOpsisAccess(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({
    json: {
      expiresAt: new Date(Date.now() + 3600000).toISOString(), chainId: 4663,
      research: true, exitCheck: true, watch: true, rwa: false,
      observedTrades: false, perpExecution: false,
    },
  }));
}
