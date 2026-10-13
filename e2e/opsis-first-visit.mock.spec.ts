import { test, expect, type Page } from "@playwright/test";
import { researchToken, researchTransaction, researchWallet } from "../apps/web/src/opsis/test-fixtures";

import { mockPublicOpsisAccess } from "./opsis-test-helpers";

// The reviewed contracts the examples resolve to (mirrors the shared reviewed asset list).
const EXIT_CHECK_TOKENS = {
  WETH: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
  USDG: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" },
} as const;

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";

async function analyze(page: Page, payload: ReturnType<typeof researchTransaction> | ReturnType<typeof researchToken> | ReturnType<typeof researchWallet>) {
  await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: payload }));
  await page.goto(`/research?entity=${payload.entity.value}`);
  await page.getByRole("button", { name: "Run research", exact: true }).click();
  return page.getByTestId("opsis-research-result");
}

test.describe("opsis preview first visit", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => { await mockPublicOpsisAccess(page); });

  for (const [code, status, retryAfter, sentence] of [
    ["RATE_LIMITED", 429, "60", "This connection has reached its hourly limit for lookups. Try again in about 60 seconds."],
    ["PROVIDER_UNAVAILABLE", 503, undefined, "Opsis has reached its chain-data rate for the moment. Nothing is wrong with the identifier. Try again in a minute."],
    ["VALIDATION_ERROR", 400, undefined, "The identifier was not accepted. Check that it is a full 0x address or transaction hash."],
    ["UNEXPECTED", 500, undefined, "The lookup failed or reached a provider limit. Check the identifier and retry."],
  ] as const) {
    test(`opsis preview Research refusal ${code} explains the condition`, async ({ page }) => {
      await page.route("**/v1/private/analyze", (route) => route.fulfill({
        status, headers: retryAfter ? { "Retry-After": retryAfter } : {},
        json: { error: { code, message: "server-only detail" } },
      }));
      await page.goto(`/research?entity=${EXIT_CHECK_TOKENS.WETH.address}`);
      await page.getByRole("button", { name: "Run research", exact: true }).click();
      const alert = page.getByRole("alert");
      await expect(alert.getByRole("heading", { name: "Research unavailable", exact: true })).toBeVisible();
      await expect(alert).toContainText(sentence);
      await expect(alert).toContainText("No findings are implied by this failure.");
      await expect(alert).not.toContainText("server-only detail");
      await expect(alert).not.toContainText(code);
      await expect(alert).not.toContainText(String(status));
    });
  }

  test("opsis preview token identity, exact supply and compact unknown coverage", async ({ page }) => {
    const payload = researchToken();
    const result = await analyze(page, payload);
    await expect(result.getByRole("heading", { name: "WETH", exact: true })).toBeVisible();
    await expect(result).toContainText(payload.entity.value);
    await expect(result).toContainText("Chain 4663 · Token");
    await expect(result).toContainText("Checked at");
    await expect(result.getByTestId("token-facts")).toContainText("1,234,567.890123456789012345");
    await result.getByText("Exact supply", { exact: true }).click();
    await expect(result).toContainText("1234567.890123456789012345");
    await expect(result.getByTestId("research-token-rpc-coverage")).toContainText("could not see holders, indexed activity or contract verification");
  });

  test("opsis preview decoded swap leads with amounts and retains closed raw logs", async ({ page }) => {
    const result = await analyze(page, researchTransaction());
    const actions = result.getByTestId("decoded-actions");
    await expect(actions.getByRole("heading", { name: "What happened" })).toBeVisible();
    await expect(actions).toContainText("Swapped 1.5 WETH for 3,456.789123 USDG");
    await expect(actions).toContainText("Fee tier: 0.3%");
    await expect(actions).toContainText("Some receipt logs were not decoded");
    const timeline = result.getByTestId("transaction-timeline");
    await expect(timeline).not.toHaveAttribute("open", "");
    await timeline.locator("summary").first().click();
    const logs = result.getByTestId("receipt-transfer-observations");
    await expect(logs).not.toHaveAttribute("open", "");
    await logs.getByText("Receipt log observations", { exact: true }).click();
    await expect(logs).toContainText("1500000000000000000");
    await actions.getByText("Exact amounts and contracts", { exact: true }).click();
    await expect(actions).toContainText("3456789123");
  });

  test("opsis preview older transaction responses retain the observation view", async ({ page }) => {
    const result = await analyze(page, researchTransaction(false));
    await expect(result.getByTestId("decoded-actions")).toHaveCount(0);
    await expect(result).toContainText("A transaction was observed.");
    await expect(result.getByRole("heading", { name: "Receipt log observations" })).toBeVisible();
    await expect(result.getByTestId("receipt-transfer-observations")).toContainText("1500000000000000000");
  });

  test("opsis preview wallet shows the sampled balances and exact contracts", async ({ page }) => {
    const result = await analyze(page, researchWallet());
    const balances = result.getByTestId("wallet-balances");
    await expect(balances).toContainText("0.123456789012345678 ETH");
    await expect(balances).toContainText("Global Dollar · USDG");
    await expect(balances).toContainText("1,234.56789");
    await expect(balances).toContainText(EXIT_CHECK_TOKENS.USDG.address.toLowerCase());
    await expect(balances).toContainText("other tokens may be held");
  });

  test("opsis preview WETH output is USDG and changes cannot select the input", async ({ page }) => {
    await page.goto(`/check?token=${EXIT_CHECK_TOKENS.WETH.address}`);
    await expect(page.locator("#check-output")).toHaveValue("USDG");
    await expect(page.locator("#check-output option")).toHaveText(["USDG"]);
    await page.locator("#check-token").fill(EXIT_CHECK_TOKENS.USDG.address);
    await expect(page.locator("#check-output")).toHaveValue("WETH");
    await expect(page.locator("#check-output option")).toHaveText(["WETH"]);
  });

  for (const [code, status, sentence] of [
    ["EXIT_CHECK_INVALID_TOKEN", 400, "The token contract was refused."],
    ["RATE_LIMITED", 429, "that limit has been reached. Wait a little before trying again."],
    ["EXIT_CHECK_RATE_LIMITED", 503, "that limit has been reached. Wait a little before trying again."],
    ["EXIT_CHECK_DAILY_BUDGET_EXCEEDED", 503, "Today's shared chain-data budget has been reached."],
    ["EXIT_CHECK_BUDGET_UNAVAILABLE", 503, "The chain-data budget guard is unavailable."],
    ["EXIT_CHECK_PROVIDER_UNAVAILABLE", 503, "The chain-data provider is temporarily unavailable."],
    ["UNEXPECTED", 503, "The request failed, was limited, or returned inconsistent evidence."],
  ] as const) {
    test(`opsis preview refusal ${code} explains the condition`, async ({ page }) => {
      await page.route("**/v1/private/exit-check/quote", (route) => route.fulfill({ status, json: { error: { code, message: "Fixture refusal" } } }));
      await page.goto("/check");
      await page.getByRole("button", { name: "WETH", exact: true }).click();
      await page.getByRole("button", { name: "Run a check", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(sentence);
    });
  }

  test("opsis preview rate limit displays the server retry interval", async ({ page }) => {
    await page.route("**/v1/private/exit-check/quote", (route) => route.fulfill({
      status: 429, headers: { "Retry-After": "60" }, json: { error: { code: "RATE_LIMITED", message: "Fixture refusal" } },
    }));
    await page.goto("/check");
    await page.getByRole("button", { name: "WETH", exact: true }).click();
    await page.getByRole("button", { name: "Run a check", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Try again in about 60 seconds.");
  });

  test("opsis preview Research example runs once with a reviewed contract", async ({ page }) => {
    const requests: unknown[] = [];
    await page.route("**/v1/private/analyze", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: researchToken() });
    });
    await page.goto("/research");
    await page.getByRole("button", { name: "WETH", exact: true }).click();
    await expect(page.getByTestId("token-facts")).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ entity: EXIT_CHECK_TOKENS.WETH.address, entityType: "unknown" });
  });

  test("opsis preview reviewed symbols resolve visibly in both forms", async ({ page }) => {
    await page.route("**/v1/private/analyze", (route) => {
      expect(route.request().postDataJSON().entity).toBe(EXIT_CHECK_TOKENS.WETH.address);
      return route.fulfill({ json: researchToken() });
    });
    await page.goto("/research");
    await page.locator("#research-entity").fill("weth");
    await page.getByRole("button", { name: "Run research", exact: true }).click();
    await expect(page.locator("#research-entity")).toHaveValue(EXIT_CHECK_TOKENS.WETH.address);
    await expect(page.locator(".opsis-resolved-asset")).toContainText(EXIT_CHECK_TOKENS.WETH.address);
    await expect(page.getByTestId("token-facts")).toBeVisible();
    await page.goto("/check");
    await page.locator("#check-token").fill("weth");
    await page.locator("#check-amount").focus();
    await expect(page.locator("#check-token")).toHaveValue(EXIT_CHECK_TOKENS.WETH.address);
    await expect(page.locator(".opsis-resolved-asset")).toContainText(EXIT_CHECK_TOKENS.WETH.address);
    await expect(page.locator("#check-output option")).toHaveText(["USDG"]);
  });

  test("opsis preview unknown symbols send no request and Trade Check examples wait", async ({ page }) => {
    let requests = 0;
    await page.route("**/v1/private/analyze", (route) => { requests++; return route.abort(); });
    await page.route("**/v1/private/exit-check/quote", (route) => { requests++; return route.abort(); });
    await page.goto("/research");
    await page.locator("#research-entity").fill("unreviewed");
    await expect(page.getByRole("alert")).toContainText("Only reviewed symbols are recognised");
    await expect(page.getByRole("button", { name: "Run research", exact: true })).toBeDisabled();
    await page.locator("#research-entity").press("Enter");
    await page.goto("/check");
    await page.getByRole("button", { name: "WETH", exact: true }).click();
    await expect(page.locator("#check-amount")).toHaveValue("0.1");
    await page.locator("#check-token").fill("unreviewed");
    await expect(page.getByRole("alert")).toContainText("Only reviewed symbols are recognised");
    await expect(page.getByRole("button", { name: "Run a check", exact: true })).toBeDisabled();
    await page.locator("#check-token").press("Enter");
    expect(requests).toBe(0);
  });
});
