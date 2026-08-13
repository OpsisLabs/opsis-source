import { expect, test, type Page } from "@playwright/test";

const passphrase = "replay action test passphrase";
const address = "0x1111111111111111111111111111111111111111";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const transactionHash = `0x${"ab".repeat(32)}`;

test("rebuilds a fresh trade without transmitting history, cookies, or the old amount", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cookieCanary = "REPLAY-HTTPONLY-COOKIE-CANARY";
  await page.context().addCookies([{
    name: "rh_access",
    value: cookieCanary,
    url: "http://localhost:5173",
    httpOnly: true,
    sameSite: "Strict",
  }]);
  await page.route("**/v1/private/portfolio/snapshot", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot()) }),
  );
  const quoteCalls: Array<{ body: string; headers: Record<string, string> }> = [];
  await page.route("**/v1/swaps/quote", async (route) => {
    quoteCalls.push({
      body: route.request().postData() ?? "",
      headers: route.request().headers(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(quoteFixture("0.25")),
    });
  });

  await createVaultWithReplaySnapshot(page);
  await page.getByRole("button", { name: "REPLAY ACTIONS" }).click();
  await expect(page.getByTestId("replay-actions-panel")).toBeVisible();
  await page.getByLabel("Local historical movement").selectOption({ index: 1 });
  const amount = page.getByLabel("New replay amount");
  await expect(amount).toHaveValue("");
  await expect(amount).toBeDisabled();
  await expect(page.getByText("3.25", { exact: true })).toHaveCount(0);
  await expect(page.getByText("12.75", { exact: true })).toHaveCount(0);
  expect(quoteCalls).toHaveLength(0);

  await page.getByRole("button", { name: "WETH → USDG" }).click();
  await amount.fill("0.2500");
  expect(quoteCalls).toHaveLength(0);
  await page.getByRole("button", { name: "BUILD NEW READ-ONLY PREVIEW" }).click();
  await expect(page.getByTestId("swap-quote")).toBeVisible();
  await expect(page.getByText("900 USDG", { exact: true })).toBeVisible();

  expect(quoteCalls).toHaveLength(1);
  expect(JSON.parse(quoteCalls[0]!.body)).toEqual({
    direction: "WETH_TO_USDG",
    amount: "0.25",
  });
  expect(quoteCalls[0]!.headers.cookie).toBeUndefined();
  expect(quoteCalls[0]!.headers["x-chainscout-csrf"]).toBe("1");
  for (const forbidden of [address, transactionHash, "3.25", "12.75", cookieCanary])
    expect(quoteCalls[0]!.body).not.toContain(forbidden);
  await expect(
    page.getByRole("link", { name: "CONTINUE IN OFFICIAL UNISWAP" }),
  ).toHaveAttribute("href", officialHandoff("0.25"));

  const callsBeforeReload = quoteCalls.length;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  expect(quoteCalls).toHaveLength(callsBeforeReload);
});

test("a delayed quote is discarded when the Vault locks", async ({ page }) => {
  await page.route("**/v1/private/portfolio/snapshot", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot()) }),
  );
  let releaseQuote: (() => void) | undefined;
  const quoteReleased = new Promise<void>((resolve) => { releaseQuote = resolve; });
  await page.route("**/v1/swaps/quote", async (route) => {
    await quoteReleased;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(quoteFixture("0.5")) });
  });

  await createVaultWithReplaySnapshot(page);
  await page.getByRole("button", { name: "REPLAY ACTIONS" }).click();
  await page.getByLabel("Local historical movement").selectOption({ index: 1 });
  await page.getByRole("button", { name: "WETH → USDG" }).click();
  await page.getByLabel("New replay amount").fill("0.5");
  await page.getByRole("button", { name: "BUILD NEW READ-ONLY PREVIEW" }).click();
  await expect(page.getByText("FETCHING FRESH QUOTE…")).toBeVisible();
  await page.getByRole("button", { name: "LOCK" }).click();
  releaseQuote?.();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await expect(page.getByTestId("swap-quote")).toHaveCount(0);
  await expect(page.getByText("1800 USDG", { exact: true })).toHaveCount(0);
});

test("purchase rebuild requires a newly approved exact offer and opens only its product page", async ({ page, context }) => {
  const calls: Array<{ path: string; body: string; headers: Record<string, string> }> = [];
  await page.context().addCookies([{
    name: "rh_access",
    value: "PURCHASE-COOKIE-CANARY",
    url: "http://localhost:5173",
    httpOnly: true,
    sameSite: "Strict",
  }]);
  await page.route("**/v1/private/market/merchants", async (route) => {
    calls.push(callRecord(route.request()));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryFixture()) });
  });
  await page.route("**/v1/private/market/merchant", async (route) => {
    calls.push(callRecord(route.request()));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(merchantFixture()) });
  });
  await context.route("https://merchant.example/product/card/", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Mock merchant product</title>" }),
  );
  await page.goto("/vault?view=replay");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Private card");
  await page.getByLabel("IDENTIFIER / CONTRACT / SKU").fill("tcgdex:en:base1-4");
  await page.getByLabel("PRICE PER UNIT").fill("100");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await page.getByRole("button", { name: "REPLAY ACTIONS" }).click();

  await expect(page.getByText("ELIGIBLE LOCAL ASSETS")).toBeVisible();
  await page.getByRole("button", { name: "CHECK CURRENT APPROVED STORES" }).click();
  await page.getByLabel("Current reviewed purchase match").selectOption({ index: 1 });
  const review = page.getByRole("button", { name: "REVIEW & CONFIRM NEW OFFER LOOKUP" });
  await review.click();
  const dialog = page.getByRole("dialog", { name: "Ask the merchant for a new product result?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel current merchant lookup" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(review).toBeFocused();
  await review.click();
  await dialog.getByRole("button", { name: "CONFIRM & REFRESH" }).click();

  const handoff = page.getByRole("link", { name: "OPEN MERCHANT PRODUCT" });
  await expect(handoff).toHaveAttribute("href", "https://merchant.example/product/card/");
  expect(calls.map((call) => call.path)).toEqual([
    "/v1/private/market/merchants",
    "/v1/private/market/merchant",
  ]);
  expect(JSON.parse(calls[0]!.body)).toEqual({});
  expect(JSON.parse(calls[1]!.body)).toEqual({
    merchantId: "sample-store",
    canonicalAssetId: "tcgdex:en:base1-4",
    expectedSku: "CARD-4",
    expectedProductId: "42",
    expectedMappingReviewedAt: "2026-08-01",
  });
  for (const call of calls) expect(call.headers.cookie).toBeUndefined();
  const serialized = JSON.stringify(calls);
  for (const forbidden of ["100", "Private card", "PURCHASE-COOKIE-CANARY", "cart", "coupon", "order"])
    expect(serialized).not.toContain(forbidden);
  const popupPromise = page.waitForEvent("popup");
  await handoff.click();
  const popup = await popupPromise;
  await popup.waitForURL("https://merchant.example/product/card/");
  expect(popup.url()).toBe("https://merchant.example/product/card/");
});

test("a stale or changed merchant response never creates a purchase handoff", async ({ page }) => {
  await page.route("**/v1/private/market/merchants", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryFixture()) }),
  );
  await page.route("**/v1/private/market/merchant", (route) => {
    const stale = merchantFixture();
    stale.offer.merchantName = "Changed Store";
    stale.fetchedAt = "2026-08-12T12:00:00.000Z";
    stale.offer.fetchedAt = stale.fetchedAt;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stale) });
  });
  await createVaultWithPurchaseAsset(page);
  await page.getByRole("button", { name: "CHECK CURRENT APPROVED STORES" }).click();
  await page.getByLabel("Current reviewed purchase match").selectOption({ index: 1 });
  await page.getByRole("button", { name: "REVIEW & CONFIRM NEW OFFER LOOKUP" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "CONFIRM & REFRESH" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be matched safely");
  await expect(page.getByRole("link", { name: "OPEN MERCHANT PRODUCT" })).toHaveCount(0);
});

test("a delayed merchant response is discarded after the Vault locks", async ({ page }) => {
  await page.route("**/v1/private/market/merchants", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryFixture()) }),
  );
  let releaseMerchant: (() => void) | undefined;
  const released = new Promise<void>((resolve) => { releaseMerchant = resolve; });
  await page.route("**/v1/private/market/merchant", async (route) => {
    await released;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(merchantFixture()) });
  });
  await createVaultWithPurchaseAsset(page);
  await page.getByRole("button", { name: "CHECK CURRENT APPROVED STORES" }).click();
  await page.getByLabel("Current reviewed purchase match").selectOption({ index: 1 });
  await page.getByRole("button", { name: "REVIEW & CONFIRM NEW OFFER LOOKUP" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "CONFIRM & REFRESH" }).click();
  await expect(page.getByRole("button", { name: "LOCK" })).toBeEnabled();
  await page.getByRole("button", { name: "LOCK" }).click();
  releaseMerchant?.();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await expect(page.getByRole("link", { name: "OPEN MERCHANT PRODUCT" })).toHaveCount(0);
  expect((await readRawVault(page)).records.map((record) => record.version).sort()).toEqual([3, 4]);
});

test("an offer loses its product handoff when its received freshness window expires", async ({ page }) => {
  await page.route("**/v1/private/market/merchants", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryFixture()) }),
  );
  await page.route("**/v1/private/market/merchant", (route) => {
    const expiring = merchantFixture();
    expiring.freshForMs = 750;
    expiring.offer.freshForMs = 750;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(expiring) });
  });
  await createVaultWithPurchaseAsset(page);
  await page.getByRole("button", { name: "CHECK CURRENT APPROVED STORES" }).click();
  await page.getByLabel("Current reviewed purchase match").selectOption({ index: 1 });
  await page.getByRole("button", { name: "REVIEW & CONFIRM NEW OFFER LOOKUP" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "CONFIRM & REFRESH" }).click();
  await expect(page.getByRole("link", { name: "OPEN MERCHANT PRODUCT" })).toBeVisible();
  await expect(page.getByText("OFFER EXPIRED · REFRESH REQUIRED")).toBeVisible();
  await expect(page.getByRole("link", { name: "OPEN MERCHANT PRODUCT" })).toHaveCount(0);
});

async function createVaultWithReplaySnapshot(page: Page): Promise<void> {
  await page.goto("/vault?view=portfolio");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(address);
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  await expect(page.getByText("Anchored current snapshot verified and encrypted")).toBeVisible();
}

async function createVaultWithPurchaseAsset(page: Page): Promise<void> {
  await page.goto("/vault?view=replay");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Private card");
  await page.getByLabel("IDENTIFIER / CONTRACT / SKU").fill("tcgdex:en:base1-4");
  await page.getByLabel("PRICE PER UNIT").fill("100");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await page.getByRole("button", { name: "REPLAY ACTIONS" }).click();
}

async function readRawVault(page: Page): Promise<{ records: Array<{ version: number; ciphertext: string }> }> {
  return page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("chainscout-private-vault", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["records"], "readonly");
      const records = transaction.objectStore("records").getAll();
      transaction.oncomplete = () => { db.close(); resolve({ records: records.result }); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

function portfolioSnapshot() {
  return {
    schemaVersion: 1,
    chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
    address,
    anchor: { tag: "latest", blockNumber: 33_300_000, blockHash: `0x${"cd".repeat(32)}`, timestamp: "2026-08-12T12:00:00.000Z", fetchedAt: "2026-08-12T12:00:01.000Z" },
    nativeBalanceEth: "0",
    tokens: [], nfts: [], approvals: [], attention: [], citations: [],
    transactions: [{ hash: transactionHash, blockNumber: 33_299_999, timestamp: "2026-08-12T11:59:00.000Z", status: "success", method: "swap", direction: "mixed", counterparty: null, nativeValueEth: "0", movementCount: 2, movementCoverage: "complete", sourceIds: ["receipt"] }],
    movements: [
      { transactionHash, blockNumber: 33_299_999, timestamp: "2026-08-12T11:59:00.000Z", direction: "out", kind: "erc20", symbol: "WETH", quantity: "3.25", contract: WETH.toLowerCase(), tokenId: null, counterparty: null, sourceIds: ["receipt"] },
      { transactionHash, blockNumber: 33_299_999, timestamp: "2026-08-12T11:59:00.000Z", direction: "in", kind: "erc20", symbol: "USDG", quantity: "12.75", contract: USDG.toLowerCase(), tokenId: null, counterparty: null, sourceIds: ["receipt"] },
    ],
    reconciliation: { tokenCandidates: 0, tokenConfirmed: 0, nftCandidates: 0, nftConfirmed: 0, activityCandidates: 1, activityConfirmed: 1, approvalCandidates: 0, approvalConfirmed: 0, degradedSources: [], truncatedSections: [] },
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "client_encrypted_vault", providerDestinations: ["robinhood_public_rpc", "blockscout"], disclosure: "fixture" },
  };
}

function quoteFixture(amount: string) {
  const now = new Date();
  const output = amount === "0.5" ? "1800" : "900";
  return {
    pair: "WETH/USDG",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: { symbol: "WETH", address: WETH, amount },
    output: { symbol: "USDG", address: USDG, amount: output, minimumReceived: amount === "0.5" ? "1791" : "895", minimumSource: "provider" },
    route: { routing: "CLASSIC", label: "WETH → USDG", protocols: ["V4"] },
    priceImpactPercent: 0.01,
    slippageTolerancePercent: 0.5,
    estimatedGas: { nativeAmount: "0.0001", usdAmount: "0.01", paidBy: "user" },
    simulation: { status: "passed", reasons: [] },
    approvalMayBeRequired: true,
    transactionPreview: { explanationOnly: true, unsigned: true, chainId: 4663, sender: null, target: "0x8876789976decbfcbbbe364623c63652db8c0904", action: `Execute an exact-input swap for ${amount} WETH → at least ${amount === "0.5" ? "1791" : "895"} USDG`, canSign: false, canBroadcast: false },
    quotedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30_000).toISOString(),
    freshForMs: 30_000,
    provider: { name: "Uniswap", requestId: "replay-test", cached: false },
    handoffUrl: officialHandoff(amount),
    disclosures: ["Fresh read-only preview"],
  };
}

function officialHandoff(amount: string) {
  return `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=${WETH}&outputCurrency=${USDG}&field=input&value=${amount}&theme=dark`;
}

function directoryFixture() {
  return { schemaVersion: 1, source: "chainscout_reviewed_registry", loadedAt: "2026-08-12T12:00:00.000Z", limitations: [], merchants: [{ id: "sample-store", name: "Sample Store", permissionReviewedAt: "2026-08-01", permissionEvidenceUrl: "https://merchant.example/permission/", mappings: [{ canonicalAssetId: "tcgdex:en:base1-4", sku: "CARD-4", productId: "42", variantLabel: "Holo", condition: "Near mint", reviewedAt: "2026-08-01", evidenceUrl: "https://merchant.example/product/card/" }] }] };
}

function merchantFixture() {
  const fetchedAt = new Date().toISOString();
  return { schemaVersion: 1, merchant: { id: "sample-store", name: "Sample Store", provider: "woocommerce" }, canonicalAssetId: "tcgdex:en:base1-4", mapping: { sku: "CARD-4", productId: "42", reviewedAt: "2026-08-01", evidenceUrl: "https://merchant.example/product/card/" }, state: "exact_match", fetchedAt, freshForMs: 300_000, source: { provider: "woocommerce", url: "https://merchant.example/product/card/" }, limitations: [], privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", modelProvider: "none", providerDestinations: ["Sample Store"], disclosure: "fixture" }, offer: { provider: "woocommerce", merchantId: "sample-store", merchantName: "Sample Store", canonicalAssetId: "tcgdex:en:base1-4", identityConfidence: "reviewed_simple_product_mapping", productId: "42", sku: "CARD-4", title: "Card", variantLabel: "Holo", condition: "Near mint", mappingReviewedAt: "2026-08-01", mappingEvidenceUrl: "https://merchant.example/product/card/", url: "https://merchant.example/product/card/", currency: "USD", unitPrice: "125", inventoryState: "provider_available", exactQuantity: null, productRating: null, fetchedAt, freshForMs: 300_000 } };
}

function callRecord(request: { url(): string; postData(): string | null; headers(): Record<string, string> }) {
  return { path: new URL(request.url()).pathname, body: request.postData() ?? "", headers: request.headers() };
}
