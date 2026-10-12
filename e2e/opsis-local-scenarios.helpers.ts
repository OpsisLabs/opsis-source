import type { Page } from "@playwright/test";

// Shared access mock from the existing local-scenarios spec: no venue or data access.
export async function mockLocalScenarioAccess(page: Page) {
  await page.route("**/v1/private/opsis/access", (route) =>
    route.fulfill({
      json: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        chainId: 4663,
        research: false,
        exitCheck: false,
        watch: false,
        rwa: false,
        observedTrades: false,
        perpHandoff: false,
        perpExecution: false,
      },
    }),
  );
}
