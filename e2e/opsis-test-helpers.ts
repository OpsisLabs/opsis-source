import type { Page } from "@playwright/test";

export async function mockPublicOpsisAccess(
  page: Page,
  responses: Array<{ status?: number; retryAfter?: string }> = [],
  capabilities: { rwa?: boolean; observedTrades?: boolean; stockDesk?: boolean; claimCheck?: boolean; receipts?: boolean } = {},
) {
  const access = { requests: 0 };
  let last = 0;
  await page.route("**/v1/private/opsis/access", (route) => {
    // The development build mounts twice and sends the first check twice at once;
    // both get the same answer and count as one attempt.
    const duplicate = Date.now() - last < 400;
    last = Date.now();
    if (!duplicate) access.requests++;
    const response =
      responses[Math.min(access.requests - 1, responses.length - 1)];
    return route.fulfill({
      status: response?.status ?? 200,
      headers: {
        date: new Date().toUTCString(),
        ...(response?.retryAfter === undefined
          ? {}
          : { "Retry-After": response.retryAfter }),
      },
      json:
        (response?.status ?? 200) >= 400
          ? { error: { message: "server-only detail" } }
          : {
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              chainId: 4663,
              research: true,
              exitCheck: true,
              watch: true,
              rwa: false,
              observedTrades: false,
              perpExecution: false,
              ...capabilities,
            },
    });
  });
  return access;
}

export async function openOpsisMenu(page: Page) {
  const trigger = page.locator(".opsis-menu-trigger");
  if (
    (await trigger.isVisible()) &&
    (await trigger.getAttribute("aria-expanded")) !== "true"
  )
    await trigger.click();
}
export async function closeOpsisMenu(page: Page) {
  if (await page.locator("#opsis-tool-menu").isVisible())
    await page.keyboard.press("Escape");
}
