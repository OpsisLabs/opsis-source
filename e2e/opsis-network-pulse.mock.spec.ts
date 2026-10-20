import { expect, test, type Page } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const known = <T,>(value: T) => ({ value, reason: null });
function pulse() {
  const observedAt = new Date().toISOString();
  return {
    chainId: 4663, observedAt,
    source: { rpc: "drpc", feed: `0x${"ab".repeat(20)}` },
    latestBlock: known({ number: "9007199254740993", hash: `0x${"ab".repeat(32)}`, timestamp: observedAt }),
    latestAgeSeconds: known(2), safeBlock: { value: null, reason: "unavailable" },
    safeLagBlocks: { value: null, reason: "unavailable" }, safeLagSeconds: { value: null, reason: "unavailable" },
    gasPriceGwei: known("1.000000001"), ethUsd: known("2000.12345678"),
    ethUsdUpdatedAt: known(observedAt), rpcLatencyMs: known(250),
  };
}
async function visibility(page: Page, state: "visible" | "hidden") {
  await page.evaluate(value => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}
test.describe("network pulse on Data status", () => {
  test.skip(!enabled);
  test("default-off makes no network-pulse request", async ({ page }) => {
    await mockPublicOpsisAccess(page);
    const requests: string[] = [];
    page.on("request", request => { if (request.url().includes("/network-pulse")) requests.push(request.url()); });
    await page.goto("/status");
    await expect(page.getByRole("region", { name: "Network now" })).toContainText("Not enabled · server flag off");
    expect(requests).toEqual([]);
  });

  for (const width of [1440, 375]) {
    test(`shows exact observations and partial failure in both languages at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockPublicOpsisAccess(page, [], { networkPulse: true });
      await page.route("**/v1/private/opsis/network-pulse", route => route.fulfill({ json: pulse() }));
      await page.goto("/status");
      const panel = page.getByRole("region", { name: "Network now" });
      await expect(panel).toContainText("9007199254740993");
      await expect(panel).toContainText("1.000000001 gwei");
      await expect(panel).toContainText("2000.12345678 USD");
      await expect(panel).toContainText("Unknown · RPC read unavailable");
      await expect(panel).toContainText("250 ms");
      await panel.getByText("Sources and limits", { exact: true }).click();
      await expect(panel).toContainText("dRPC Robinhood Chain gateway");
      await page.getByRole("button", { name: "中文", exact: true }).click();
      const chinese = page.getByRole("region", { name: "网络现况" });
      await expect(chinese).toContainText("未知 · RPC 读取不可用");
      await expect(chinese).toContainText("250 毫秒");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test("polls every 30 seconds while visible, pauses when hidden, retains failed observations and honors Retry-After", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockPublicOpsisAccess(page, [], { networkPulse: true });
    let requests = 0;
    await page.route("**/v1/private/opsis/network-pulse", route => {
      requests++;
      return requests === 1 ? route.fulfill({ json: pulse() }) : route.fulfill({ status: 429, headers: { "retry-after": "90" }, json: {} });
    });
    await page.goto("/status");
    const panel = page.getByRole("region", { name: "Network now" });
    await expect(panel).toContainText("2000.12345678 USD");
    const observed = await panel.locator("time").getAttribute("datetime");
    await page.clock.install();
    await visibility(page, "hidden");
    await page.clock.runFor(60_000);
    expect(requests).toBe(1);
    await visibility(page, "visible");
    await expect.poll(() => requests).toBe(2);
    await expect(panel).toContainText("Refresh unavailable");
    await expect(panel.locator("time")).toHaveAttribute("datetime", observed!);
    await expect(panel).toContainText("2000.12345678 USD");
    await page.clock.runFor(89_000);
    expect(requests).toBe(2);
    await page.clock.runFor(1_001);
    await expect.poll(() => requests).toBe(3);
  });
});
