import { test, expect, type Page } from "@playwright/test";
import weth from "../apps/web/src/opsis/fixtures/research-weth-token.json";
import wallet from "../apps/web/src/opsis/fixtures/research-wallet.json";
import { researchToken } from "../apps/web/src/opsis/test-fixtures";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const implementation = `0x${"1".repeat(40)}`;
const reviewedDollar = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

async function analyze(page: Page, payload: { entity: { value: string } }) {
  // Every request gets the same facts, including duplicate development mounts.
  await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: payload }));
  await page.goto(`/research?entity=${payload.entity.value}`);
  await page.getByRole("button", { name: "Run research", exact: true }).click();
  const result = page.getByTestId("opsis-research-result");
  await expect(result).toBeVisible();
  return result;
}

async function compact(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test.describe("opsis preview explorer data", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await mockPublicOpsisAccess(page);
    await page.setViewportSize({ width: 375, height: 900 });
  });

  test("opsis preview explorer token shows source, holders, transfers and read time in both languages", async ({ page }) => {
    const payload = { ...weth, entity: { ...weth.entity, facts: { ...weth.entity.facts,
      decimals: 18, holders: 584668, lifetimeTransfers: 486615089,
      holderCoverage: "top_holders", activityCoverage: "indexed_window", sourceCoverage: "explorer_metadata",
      proxyType: "eip1967", implementations: [{ address: implementation }], burnedShare: 0,
      explorerObservedAt: "2026-10-14T15:00:00Z", explorerCached: true,
    } } };
    const result = await analyze(page, payload);
    const facts = result.getByTestId("token-facts");
    await expect(facts).toContainText("Decimals18");
    await expect(facts).toContainText("39,756.656303302136451718");
    await expect(facts).toContainText("584,668");
    await expect(facts).toContainText("486,615,089");
    await expect(facts).toContainText("Verified");
    await expect(facts).toContainText("eip1967");
    await expect(facts.getByRole("button", { name: `Copy address ${implementation}`, exact: true })).toBeVisible();
    await expect(facts.getByTestId("token-holders")).toContainText("Trading pool");
    await expect(facts.getByTestId("token-holders").locator("li")).toHaveCount(10);
    await expect(facts.getByTestId("token-transfers").locator("li")).toHaveCount(5);
    await expect(facts.getByTestId("token-transfers")).toContainText("0.041933053287515482 WETH");
    await expect(facts.getByTestId("explorer-read-time")).toContainText("Reused from that read");
    await expect(facts.getByTestId("explorer-read-time").locator("time")).toHaveAttribute("title", "2026-10-14T15:00:00.000Z");
    await facts.getByTestId("explorer-read-time").getByRole("button").click();
    await expect(facts.getByTestId("explorer-read-time").locator("code")).toHaveText("2026-10-14T15:00:00.000Z");
    await compact(page);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(facts).toContainText("已验证");
    await expect(facts.getByTestId("token-holders")).toContainText("交易池");
    await expect(facts.getByTestId("token-transfers")).toContainText("近期转移");
    await expect(facts.getByTestId("explorer-read-time")).toContainText("复用了该次读取的数据");
    await compact(page);
  });

  test("opsis preview chain-read fallback explains the daily explorer allowance without empty history", async ({ page }) => {
    const fallback = researchToken();
    const payload = { ...fallback, entity: { ...fallback.entity, facts: { ...fallback.entity.facts,
      holderCoverage: "unavailable", activityCoverage: "unavailable", sourceCoverage: "rpc_sample_only",
      explorerUnavailableReason: "daily_limit",
    } } };
    const result = await analyze(page, payload);
    await expect(result.getByTestId("research-token-rpc-coverage")).toContainText("Opsis has used today's Blockscout allowance");
    await expect(result.getByTestId("research-token-rpc-coverage")).toContainText("00:00 UTC");
    await expect(result.getByTestId("token-holders")).toContainText("Holder data could not be read from Blockscout");
    await expect(result.getByTestId("token-transfers")).toContainText("Recent transfers could not be read from Blockscout");
    await expect(result.getByTestId("token-holders").locator("li")).toHaveCount(0);
    await expect(result.getByTestId("token-transfers").locator("li")).toHaveCount(0);
    await expect(result).not.toContainText("0 holders");
    await compact(page);
  });

  test("opsis preview a slow explorer read says it can take a few seconds", async ({ page }) => {
    await page.route("**/v1/private/analyze", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await route.fulfill({ json: weth });
    });
    await page.goto(`/research?entity=${weth.entity.value}`);
    await page.getByRole("button", { name: "Run research", exact: true }).click();
    const status = page.getByRole("status").filter({ hasText: "Checking public evidence" });
    await expect(status).toBeVisible();
    await expect(status).toContainText("Holder and transfer data from Blockscout can take a few seconds.");
    await expect(page.getByTestId("opsis-research-result")).toBeVisible();
  });

  test("opsis preview wallet separates reviewed assets, reveals other tokens and shows failed history", async ({ page }) => {
    const payload = { ...wallet, entity: { ...wallet.entity, facts: { ...wallet.entity.facts,
      activityCoverage: "indexed_window", tokenBalanceCoverage: "indexed_window",
      tokenBalances: [...wallet.entity.facts.tokenBalances,
        { tokenAddress: reviewedDollar, tokenName: "Global Dollar", tokenSymbol: "USDG", formattedValue: "1", decimals: 6 },
      ],
    } } };
    const result = await analyze(page, payload);
    const balances = result.getByTestId("wallet-balances");
    await expect(balances.getByTestId("reviewed-balances")).toContainText("Reviewed asset");
    await expect(balances.locator("li").first()).toContainText("Global Dollar");
    await expect(balances.getByTestId("other-balances").locator("li")).toHaveCount(10);
    await expect(balances).toContainText("Uses the symbol USDC; this contract is not on the Opsis reviewed asset list");
    await expect(balances).toContainText("Uses the symbol NVDA, but this is not the reviewed NVDA contract");
    await balances.getByRole("button", { name: "Show all other tokens", exact: true }).click();
    await expect(balances.getByTestId("other-balances").locator("li")).toHaveCount(wallet.entity.facts.tokenBalances.length);
    await expect(balances).toContainText("PO[U+200B]NS");
    await expect(balances).toContainText("contains hidden characters");
    await compact(page);
    await balances.getByRole("button", { name: "Show fewer tokens", exact: true }).click();
    await expect(balances.getByTestId("other-balances").locator("li")).toHaveCount(10);
    const history = result.getByTestId("wallet-transactions");
    await expect(history).toContainText("1 failed transaction in this window");
    await expect(history).toContainText("Sent");
    await expect(history).toContainText("Contract call");
    await expect(history).toContainText("Failed");
    await expect(history.locator("li")).toHaveCount(10);
    await expect(history.locator("time").first()).toHaveAttribute("title", "2026-10-14T15:24:43.000Z");
    await compact(page);
  });
});
