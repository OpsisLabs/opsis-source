import { expect, test, type Page } from "@playwright/test";
import { APP_ORIGIN } from "./support/origin";

const STOCK = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
const NOW = "2026-08-11T12:00:00.000Z";

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: "cs_access", value: "must-not-be-sent", domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Strict" }]);
  await page.setViewportSize({ width: 390, height: 844 });
});

test("confirms the exact public lookup, omits cookies, and explains a Stock Token claim ladder", async ({ page }) => {
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== APP_ORIGIN) unexpected.push(request.url());
    if (/\/v1\/(?:auth|chat|account|portfolio)/.test(url.pathname)) unexpected.push(request.url());
  });
  await page.route("**/v1/private/rwa/verify", async (route) => {
    const request = route.request();
    expect(request.headers().cookie).toBeUndefined();
    expect(request.headers()["x-chainscout-csrf"]).toBe("1");
    expect(request.postDataJSON()).toEqual({ address: STOCK });
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify(stockResult()) });
  });

  await page.goto("/rwa");
  await expect(page.getByRole("heading", { name: /Know what the token/ })).toBeVisible();
  await page.getByRole("button", { name: "AAPL STOCK TOKEN" }).click();
  await page.getByRole("button", { name: "VERIFY EVIDENCE" }).click();
  await expect(page.getByRole("dialog", { name: "EXACT NETWORK RECEIPT" })).toContainText(STOCK);
  await expect(page.getByRole("dialog")).toContainText("No account cookie");
  await expect(page.getByRole("dialog")).toContainText("Robinhood’s Stock Token API and the dRPC Robinhood Chain gateway");
  await expect(page.getByRole("dialog")).toContainText("dRPC is a paid gateway that may route each read to an independent node operator in its network.");
  await page.getByRole("button", { name: "CONFIRM PUBLIC LOOKUP" }).click();

  await expect(page.getByTestId("rwa-result")).toContainText("AAPL is a canonical Robinhood Stock Token");
  await expect(page.getByTestId("rwa-result")).toContainText("PRIMARY-SOURCE CLAIM");
  await expect(page.getByTestId("rwa-result")).toContainText("not ownership or shareholder rights");
  await expect(page.getByTestId("rwa-result")).toContainText("Raw equity bid / ask—not token value");
  await expect(page.getByTestId("rwa-result")).toContainText("$308.1");
  await expect(page.getByTestId("rwa-result")).toContainText("No official sequencer");
  expect(unexpected).toEqual([]);
});

test("cancelling consent makes no API request", async ({ page }) => {
  let calls = 0;
  await page.route("**/v1/private/rwa/verify", async (route) => { calls += 1; await route.abort(); });
  await page.goto("/rwa");
  await page.getByLabel("RWA contract address").fill(STOCK);
  await page.getByRole("button", { name: "VERIFY EVIDENCE" }).click();
  await page.getByRole("button", { name: "CANCEL", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls).toBe(0);
});

test("traps consent focus, closes on Escape, and restores the verify control", async ({ page }) => {
  await page.goto("/rwa");
  await page.getByLabel("RWA contract address").fill(STOCK);
  const verify = page.getByRole("button", { name: "VERIFY EVIDENCE" });
  await verify.click();
  const dialog = page.getByRole("dialog", { name: "EXACT NETWORK RECEIPT" });
  const confirm = page.getByRole("button", { name: "CONFIRM PUBLIC LOOKUP" });
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "CANCEL", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(verify).toBeFocused();
});

test("locks the requested identity during a delayed lookup and labels the returned contract", async ({ page }) => {
  await page.route("**/v1/private/rwa/verify", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stockResult()) });
  });
  await page.goto("/rwa");
  await page.getByRole("button", { name: "AAPL STOCK TOKEN" }).click();
  await page.getByRole("button", { name: "VERIFY EVIDENCE" }).click();
  await page.getByRole("button", { name: "CONFIRM PUBLIC LOOKUP" }).click();
  await expect(page.getByLabel("RWA contract address")).toBeDisabled();
  await expect(page.getByRole("button", { name: "STEAKHOUSE USDG" })).toBeDisabled();
  await expect(page.getByTestId("rwa-result")).toContainText(`LOOKED-UP ADDRESS · ${STOCK.toLowerCase()}`);
});

test("does not present a paused oracle's retained numeric answer as current", async ({ page }) => {
  const result = stockResult();
  result.stock.oracle = { ...result.stock.oracle, state: "paused" as const };
  await mockResult(page, result);
  await page.goto("/rwa");
  await page.getByRole("button", { name: "AAPL STOCK TOKEN" }).click();
  await page.getByRole("button", { name: "VERIFY EVIDENCE" }).click();
  await page.getByRole("button", { name: "CONFIRM PUBLIC LOOKUP" }).click();
  const oracleMetric = page.getByText("PER-TOKEN ORACLE").locator("../..");
  await expect(oracleMetric.locator("p").first()).toHaveText("PAUSED");
  await expect(oracleMetric).toContainText("Last returned $308.1");
});

test("renders unsupported physical authenticity without a fraud verdict", async ({ page }) => {
  await mockResult(page, {
    ...stockResult(),
    kind: "unsupported_contract",
    headline: "No supported RWA registry match",
    summary: "The contract has no supported exact-address registry match. A token or certificate cannot prove backing or physical authenticity.",
    stock: undefined,
    checks: [{ id: "physical", label: "Physical authenticity", status: "unsupported", detail: "Onchain ownership does not prove a physical object exists, is authentic, insured, held by a custodian, or redeemable.", sourceIds: [] }],
    limitations: ["Unsupported means ChainScout lacks a supported registry match; it is not an accusation of fraud."]
  });
  await page.goto("/rwa");
  await page.getByLabel("RWA contract address").fill(STOCK);
  await page.getByRole("button", { name: "VERIFY EVIDENCE" }).click();
  await page.getByRole("button", { name: "CONFIRM PUBLIC LOOKUP" }).click();
  await expect(page.getByTestId("rwa-result")).toContainText("NOT VERIFIED");
  await expect(page.getByTestId("rwa-result")).toContainText("LOOKED-UP ADDRESS");
  await expect(page.getByTestId("rwa-result")).not.toContainText("VERIFIED CONTRACT");
  await expect(page.getByTestId("rwa-result")).toContainText("not an accusation of fraud");
});

test("separates Morpho listing, indexed liquidity, and variable yield from endorsement", async ({ page }) => {
  const base = stockResult();
  await page.route("**/v1/private/rwa/verify", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    ...base,
    kind: "morpho_vault",
    headline: "Steakhouse USDG is a Morpho V2 vault",
    summary: "Direct contract identity agrees with Morpho's index. Morpho marks it listed.",
    stock: undefined,
    morpho: {
      name: "Steakhouse USDG", symbol: "steakUSDG", version: "2.0", listed: true,
      asset: { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", decimals: 6 },
      owner: "0x2222222222222222222222222222222222222222", curator: "0x3333333333333333333333333333333333333333",
      timelockSeconds: 604800, managementFeeWad: null, performanceFeeWad: null,
      gates: { sendShares: null, receiveShares: null, sendAssets: null, receiveAssets: null },
      totalAssetsRaw: "312464692595723", totalSupplyRaw: "311340318068268371403691700",
      withdrawableAssetsRaw: "35034061292463", allocatedAssetsRaw: "302471377591652", idleAssetsRaw: "9993315004071",
      indexedBlock: 33439990, configIndexedBlock: 33439988, apyIndexedBlock: 33439989, indexLagBlocks: 10, trailing24hApy: "0.0362605711219608"
    },
    checks: [
      { id: "listing", label: "Morpho listing", status: "confirmed", detail: "Listing is a provider classification, not a ChainScout endorsement.", sourceIds: [] },
      { id: "liquidity", label: "Indexed withdrawals", status: "warning", detail: "Eligibility and executable output remain unknown.", sourceIds: [] }
    ],
    limitations: ["APY is trailing indexed data and is not guaranteed.", "ERC-4626 maxWithdraw is not used as general liquidity evidence."]
  }) }));
  await page.goto("/rwa");
  await page.getByRole("button", { name: "STEAKHOUSE USDG" }).click();
  await page.getByRole("button", { name: "VERIFY EVIDENCE" }).click();
  await page.getByRole("button", { name: "CONFIRM PUBLIC LOOKUP" }).click();
  await expect(page.getByTestId("rwa-result")).toContainText("LISTED");
  await expect(page.getByTestId("rwa-result")).toContainText("Provider classification—not endorsement");
  await expect(page.getByTestId("rwa-result")).toContainText("3.63%");
  await expect(page.getByTestId("rwa-result")).toContainText("Variable history—not guaranteed");
  await expect(page.getByTestId("rwa-result")).toContainText("10 BLOCKS BEHIND");
});

async function mockResult(page: Page, result: unknown) {
  await page.route("**/v1/private/rwa/verify", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) }));
}

function stockResult() {
  return {
    kind: "stock_token" as const,
    address: STOCK.toLowerCase(),
    headline: "AAPL is a canonical Robinhood Stock Token",
    summary: "The contract address and UID match Robinhood's registry. Custody and redemption remain issuer claims.",
    anchor: { chainId: 4663, blockNumber: 33440000, blockHash: `0x${"ab".repeat(32)}`, capturedAt: NOW, finality: "current_non_final" },
    checks: [
      { id: "canonical", label: "Canonical address", status: "confirmed", detail: "Exact deployment and onchain UID agree.", sourceIds: ["registry", "rpc"] },
      { id: "rights", label: "What the token represents", status: "claim", detail: "Economic exposure—not ownership or shareholder rights.", sourceIds: ["terms"] },
      { id: "redemption", label: "Minting and redemption", status: "warning", detail: "Issuer redemption can require KYC/AML and jurisdiction eligibility.", sourceIds: ["terms"] }
    ],
    stock: {
      uid: `0x${"12".repeat(32)}`, symbol: "AAPL", name: "Apple • Robinhood Token", decimals: 18,
      registryStatus: "ACTIVE", currentMultiplier: "1", pendingMultiplier: null, pendingEffectiveAt: null, oraclePaused: false, tokenPaused: false,
      termsUrl: "https://robinhood.com/stocktoken/rhj",
      underlyingQuote: { bid: "308.89", ask: "308.97", currency: "USD", generatedAt: NOW, tradingHalted: false, state: "current", ageSeconds: 0 },
      oracle: { feed: "0x6b22a786baa607d76728168703a39ea9c99f2cd0", value: "308.1", updatedAt: NOW, heartbeatSeconds: 86400, state: "current" },
      corporateActions: []
    },
    limitations: ["No official sequencer-uptime feed was found, so oracle health is incomplete."],
    sources: [{ id: "registry", provider: "Robinhood", url: "https://api.robinhood.com/rhj/assets", fetchedAt: NOW, description: "Canonical registry" }],
    privacy: { serverStorage: "none", modelProvider: "none", providerDestinations: ["Robinhood Stock Token API", "Robinhood Public RPC", "Chainlink feed directory"], disclosure: "The public contract was sent only to the listed sources. Nothing was saved." }
  };
}
