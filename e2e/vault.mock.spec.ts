import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { APP_ORIGIN } from "./support/origin";

const passphrase = "correct horse battery staple";
const nextPassphrase = "new recovery passphrase 2026";
const assetName = "Vault Canary Card";
const privateNote = "PRIVATE-NOTE-CANARY";
const identifier = "PSA-OPSIS-42";
const collectiblePrinting = "1st Edition Holo";
const firstReferenceLabel = "Collector show listing";
const secondReferenceLabel = "Auction result";
const portfolioAddress = "0x1111111111111111111111111111111111111111";
const secondPortfolioAddress = "0x2222222222222222222222222222222222222222";
const portfolioToken = "0x3333333333333333333333333333333333333333";

test("deal finder builds exact click-only searches without a background marketplace request", async ({ page }) => {
  test.skip(process.env.VITE_COLLECTIBLE_DEAL_FINDER_ENABLED !== "true", "preview flag required");
  const external: string[] = [];
  page.on("request", request => { if (new URL(request.url()).hostname.endsWith("ebay.com")) external.push(request.url()); });
  await page.goto("/vault?view=deals");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  const brief = page.getByRole("region", { name: "Collectible shopping brief" });
  await brief.getByLabel("name", { exact: true }).fill("Charizard");
  await brief.getByLabel("set", { exact: true }).fill("Base Set");
  await brief.getByLabel("Collector number").fill("4/102");
  await brief.getByLabel("grader", { exact: true }).fill("PSA");
  await brief.getByLabel("grade", { exact: true }).fill("9");
  await expect(brief.getByRole("link", { name: "Inspect sold listings on eBay" })).toHaveAttribute("href", /LH_Sold=1/);
  expect(external).toEqual([]);
  const prices = page.getByRole("region", { name: "Free card price references" });
  await page.route("**/v1/private/deals/benchmark", async route => {
    if (route.request().postDataJSON().provider === "ygoprodeck") {
      expect(route.request().postDataJSON()).toEqual({ provider: "ygoprodeck", cardId: "46986414" });
      await route.fulfill({ status: 503, json: { error: { code: "BENCHMARK_UNAVAILABLE", message: "Reference source temporarily unavailable" } } });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({ provider: "tcgdex", cardId: "base1-4" });
    await route.fulfill({ json: { provider: "tcgdex", cardId: "base1-4", name: "Charizard", fetchedAt: "2026-09-09T12:00:00Z", sourceUrl: "https://api.tcgdex.net/v2/en/cards/base1-4", rows: [{ market: "TCGplayer", variant: "holofoil", metric: "marketPrice", amount: 42, currency: "USD", updatedAt: null }] } });
  });
  await prices.getByRole("button", { name: "Use example: Charizard · Base Set 4" }).click();
  await prices.getByRole("button", { name: "Fetch public price references" }).click();
  await expect(prices.getByText("USD 42", { exact: true })).toBeVisible();
  await expect(prices.getByText("Provider price timestamp unknown—not certified current")).toBeVisible();
  if (process.env.OPSIS_PREVIEW_SHOT) await page.screenshot({ path: process.env.OPSIS_PREVIEW_SHOT, fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `preview must reflow at ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByText("Robinhood token pools", { exact: true })).toBeHidden();
  await prices.getByLabel("Card game", { exact: true }).selectOption("ygoprodeck");
  await expect(prices.getByText("USD 42", { exact: true })).toHaveCount(0);
  await prices.getByRole("button", { name: "Use example: Dark Magician" }).click();
  await prices.getByRole("button", { name: "Fetch public price references" }).click();
  await expect(prices.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "LOCK", exact: true }).click();
  await expect(brief).toHaveCount(0);
  await expect(prices).toHaveCount(0);
});

async function downloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function backupFile(buffer: Buffer) {
  return { name: "opsis-vault.encrypted.json", mimeType: "application/json", buffer };
}

function portfolioSnapshot(address = portfolioAddress) {
  return {
    schemaVersion: 1,
    chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
    address,
    anchor: {
      tag: "latest",
      blockNumber: 33_300_000,
      blockHash: `0x${"a".repeat(64)}`,
      timestamp: "2026-08-10T21:00:00.000Z",
      fetchedAt: "2026-08-10T21:02:00.000Z"
    },
    nativeBalanceEth: "0.5",
    tokens: [{ kind: "erc20", contract: portfolioToken, name: "Test Token", symbol: "TST", decimals: 18, quantity: "2", rawBalance: "2000000000000000000", sourceIds: ["robinhood-public-rpc-anchor"] }],
    nfts: [],
    transactions: [{ hash: `0x${"b".repeat(64)}`, blockNumber: 33_299_990, timestamp: "2026-08-10T20:59:00.000Z", status: "success", method: "transfer", direction: "in", counterparty: "0x2222222222222222222222222222222222222222", nativeValueEth: "0", movementCount: 1, movementCoverage: "complete", sourceIds: ["robinhood-public-rpc-anchor"] }],
    movements: [{ transactionHash: `0x${"b".repeat(64)}`, blockNumber: 33_299_990, timestamp: "2026-08-10T20:59:00.000Z", direction: "in", kind: "erc20", symbol: "TST", quantity: "2", contract: portfolioToken, tokenId: null, counterparty: "0x2222222222222222222222222222222222222222", sourceIds: ["robinhood-public-rpc-anchor"] }],
    approvals: [],
    attention: [],
    reconciliation: { tokenCandidates: 1, tokenConfirmed: 1, nftCandidates: 0, nftConfirmed: 0, activityCandidates: 1, activityConfirmed: 1, approvalCandidates: 0, approvalConfirmed: 0, degradedSources: [], truncatedSections: [] },
    citations: [{ id: "robinhood-public-rpc-anchor", provider: "robinhood", url: "https://rpc.mainnet.chain.robinhood.com", fetchedAt: "2026-08-10T21:02:00.000Z", description: "Robinhood Public RPC direct read at one captured current block" }],
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "client_encrypted_vault", providerDestinations: ["robinhood_public_rpc", "blockscout"], disclosure: "This public address was sent transiently to Robinhood Public RPC and Blockscout. Private Vault context stayed local." }
  };
}

test("approval manager reviews anchored permissions without executing or leaking labels", async ({ page }) => {
  test.skip(process.env.VITE_APPROVAL_MANAGER_ENABLED !== "true", "dedicated preview flag required");
  const snapshot = portfolioSnapshot();
  await page.route("**/v1/private/approvals/snapshot", async route => {
    expect(route.request().postDataJSON()).toEqual({ address: portfolioAddress });
    await route.fulfill({ json: { ...snapshot, approvals: [{ contract: portfolioToken, spender: secondPortfolioAddress, transactionHash: `0x${"b".repeat(64)}`, kind: "erc20", symbol: "TST", active: true, unlimited: true, currentAmount: "100", sourceIds: ["robinhood-public-rpc-anchor"] }], reconciliation: { ...snapshot.reconciliation, approvalCandidates: 2, approvalConfirmed: 1 } } });
  });
  await page.goto("/vault?view=approvals");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  await expect(page.getByText("TST · ACTIVE BROAD ACCESS", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 unresolved reads/)).toBeVisible();
  await page.getByLabel("Filter permissions").selectOption("inactive");
  await expect(page.getByText(/No confirmed permissions match/)).toBeVisible();
  await page.getByLabel("Filter permissions").selectOption("all");
  await page.getByRole("button", { name: "Review external revocation" }).click();
  await expect(page.getByRole("link", { name: "Open Revoke.cash for Robinhood Chain" })).toHaveAttribute("href", "https://revoke.cash/token-approval-checker/robinhood-chain");
  if (process.env.OPSIS_PREVIEW_SHOT) await page.screenshot({ path: process.env.OPSIS_PREVIEW_SHOT, fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `preview must reflow at ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "LOCK", exact: true }).click();
  await expect(page.getByText("TST · ACTIVE BROAD ACCESS", { exact: true })).toHaveCount(0);
});

test("encrypted Vault creates, stores ciphertext, locks, exports, deletes, and restores", async ({ page }) => {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const consoleMessages: string[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() ?? "" }));
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto("/vault");
  await expect(page.getByRole("heading", { name: /Encrypted on this device/i })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Privacy & storage details" }).click();
  await expect(page.getByText("SERVER COPY", { exact: true })).toBeVisible();
  await expect(page.getByText("NONE", { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Privacy & storage details" }).click();

  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  const recoveryCode = await page.getByTestId("recovery-code").textContent();
  expect(recoveryCode).toMatch(/^CSV1-/);
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill(assetName);
  await page.getByLabel("LOT 1 QUANTITY").fill("1,000");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByLabel("LOT 1 QUANTITY")).toHaveJSProperty("validationMessage", "Enter a decimal such as 1 or 185.50, without commas or minus signs.");
  await expect(page.getByRole("alert")).toContainText("without commas or minus signs");
  await page.getByLabel("IDENTIFIER / CONTRACT / SKU").fill(identifier);
  await page.getByLabel("LOT 1 QUANTITY").fill("1.000000000000000001");
  await page.getByLabel("PRICE PER UNIT").fill("1234.560000000000000001");
  await page.getByLabel("ACQUIRED DATE").fill("2026-08-10");
  await page.getByLabel("PRIVATE NOTES").fill(privateNote);
  await page.getByLabel("OWNER PRINTING / VARIANT").fill(collectiblePrinting);
  await page.getByLabel("OWNER CONDITION").selectOption("near-mint");
  await page.getByRole("button", { name: "ADD FIRST DATED REFERENCE" }).click();
  await page.getByLabel("REFERENCE 1 VALUE").fill("1300.25");
  await page.getByLabel("REFERENCE 1 CURRENCY").fill("USD");
  // Enter references out of date order; the summary must use observed date,
  // never insertion order or the highest value.
  await page.getByLabel("REFERENCE 1 OBSERVED DATE").fill("2026-08-12");
  await page.getByLabel("REFERENCE 1 HTTPS SOURCE URL").fill("https://example.com/collector-show");
  await page.getByLabel("REFERENCE 1 SOURCE LABEL").fill(firstReferenceLabel);
  await page.getByRole("button", { name: "+ ADD DATED REFERENCE" }).click();
  await page.getByLabel("REFERENCE 2 VALUE").fill("1400.75");
  await page.getByLabel("REFERENCE 2 CURRENCY").fill("USD");
  await page.getByLabel("REFERENCE 2 OBSERVED DATE").fill("2026-08-11");
  await page.getByLabel("REFERENCE 2 HTTPS SOURCE URL").fill("https://example.com/auction-result");
  await page.getByLabel("REFERENCE 2 SOURCE LABEL").fill(secondReferenceLabel);
  const sourceMetadataCanary = "SOURCE-METADATA-CANARY";
  const sourcePhoto = Buffer.concat([await readFile("apps/web/public/og-opsis-v1.png"), Buffer.from(sourceMetadataCanary)]);
  await page.getByLabel("Private asset photo").setInputFiles({ name: "secret-photo-canary.png", mimeType: "image/png", buffer: sourcePhoto });
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByRole("heading", { name: assetName })).toBeVisible();
  await expect(page.getByText(privateNote)).toBeVisible();
  await expect(page.locator("article img")).toBeVisible();
  await expect(page.locator("article img")).toHaveCSS("object-fit", "contain");
  await expect(page.getByTestId("collectible-value-history")).toBeVisible();
  await expect(page.locator("[data-chart-renderer=echarts-svg]").first()).toBeVisible();
  await expect(page.getByText("2 dated references · latest 1300.25 USD · 2026-08-12")).toBeVisible();
  await expect(page.getByTestId("collectible-value-history")).toContainText("Latest dated entry: 1300.25 USD");
  await page.getByTestId("collectible-value-history").getByText("ACCESSIBLE EXACT DATA TABLE").click();
  await expect(page.getByRole("cell", { name: "1300.25" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1400.75" })).toBeVisible();
  const processedPhoto = await page.locator("article img").getAttribute("src");
  expect(Buffer.from(processedPhoto?.split(",")[1] ?? "", "base64").toString("latin1")).not.toContain(sourceMetadataCanary);
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "output/qa/encrypted-vault-desktop.png", fullPage: true });
  }

  const raw = await readRawVault(page);
  const rawText = JSON.stringify(raw);
  for (const canary of [assetName, privateNote, identifier, collectiblePrinting, firstReferenceLabel, secondReferenceLabel, "1300.25", "1400.75", "1234.560000000000000001", "secret-photo-canary", recoveryCode ?? "CSV1-"]) {
    expect(rawText).not.toContain(canary);
  }
  expect(raw.meta[0].wrappedKey.ciphertext).toBeTruthy();
  expect(raw.records[0].ciphertext).toBeTruthy();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await expect(page.getByText(assetName)).toHaveCount(0);
  await page.getByLabel("VAULT PASSPHRASE").fill("wrong passphrase but long enough");
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("alert")).toContainText("could not unlock");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("heading", { name: assetName })).toBeVisible();

  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" }).click();
  const download = await downloadPromise;
  const backupBuffer = await downloadBuffer(download);
  const backupText = backupBuffer.toString("utf8");
  await expect(page.getByRole("link", { name: "Download prepared backup" })).toBeVisible();
  const retryDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download prepared backup" }).click();
  expect(await downloadBuffer(await retryDownload)).toEqual(backupBuffer);
  await page.getByText("Download blocked? Save encrypted text instead", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Encrypted backup JSON" })).toHaveValue(backupText);
  await page.getByRole("textbox", { name: "Encrypted backup JSON" }).focus();
  await expect(page.getByRole("textbox", { name: "Encrypted backup JSON" })).toHaveJSProperty("selectionStart", 0);
  await expect(page.getByRole("textbox", { name: "Encrypted backup JSON" })).toHaveJSProperty("selectionEnd", backupText.length);
  expect(JSON.parse(backupText)).toMatchObject({ format: "opsis.encrypted-vault", schemaVersion: 1 });
  for (const canary of [assetName, privateNote, identifier, recoveryCode ?? "CSV1-"]) expect(backupText).not.toContain(canary);

  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await expect(page.getByRole("heading", { name: "Create your private Vault" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download prepared backup" })).toHaveCount(0);
  expect((await readRawVault(page)).records).toEqual([]);

  await page.locator("summary").filter({ hasText: "Have a backup? Restore your Vault" }).click();
  await page.getByLabel("Encrypted vault backup", { exact: true }).setInputFiles(backupFile(backupBuffer));
  await page.getByLabel("BACKUP PASSPHRASE", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "VERIFY & RESTORE LOCALLY" }).click();
  await expect(page.getByRole("heading", { name: assetName })).toBeVisible();
  await expect(page.getByText("1234.560000000000000001 USD")).toBeVisible();

  const canaries = [
    passphrase,
    "wrong passphrase but long enough",
    recoveryCode ?? "CSV1-",
    assetName,
    privateNote,
    identifier,
    collectiblePrinting,
    firstReferenceLabel,
    secondReferenceLabel,
    "1300.25",
    "1400.75",
    "1.000000000000000001",
    "1234.560000000000000001",
    "secret-photo-canary.png",
    sourceMetadataCanary
  ];
  const ownOrigin = new URL(page.url()).origin;
  expect(requests.filter((request) => new URL(request.url).origin !== ownOrigin)).toEqual([]);
  expect(requests.find((request) => new URL(request.url).pathname.startsWith("/v1/"))).toBeUndefined();
  const runtimeText = JSON.stringify(requests) + consoleMessages.join("\n");
  for (const canary of canaries) expect(runtimeText).not.toContain(canary);
});

test("Saved sends only one approved public address and encrypts the useful context locally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sessionCookieCanary = "SESSION-COOKIE-CANARY";
  await page.context().addCookies([{
    name: "rh_access",
    value: sessionCookieCanary,
    url: APP_ORIGIN,
    httpOnly: true,
    sameSite: "Strict"
  }]);
  const calls: Array<{ body: string; headers: Record<string, string> }> = [];
  const allRequests: string[] = [];
  page.on("request", (request) => allRequests.push(`${request.url()} ${request.postData() ?? ""}`));
  await page.route("**/v1/private/portfolio/snapshot", async (route) => {
    calls.push({ body: route.request().postData() ?? "", headers: route.request().headers() });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot()) });
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Private linked token");
  await page.getByLabel("TYPE").selectOption("crypto");
  await page.getByLabel("IDENTIFIER / CONTRACT / SKU").fill(portfolioToken);
  await page.getByLabel("LOT 1 QUANTITY").fill("2");
  await page.getByLabel("PRICE PER UNIT").fill("10");
  await page.getByLabel("PRIVATE NOTES").fill("PORTFOLIO-PRIVATE-NOTE");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();

  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await page.getByLabel("PRIVATE LOCAL LABEL").fill("PORTFOLIO-PRIVATE-LABEL");
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  expect(calls).toHaveLength(0);
  await expect(page.getByRole("dialog", { name: "Portfolio refresh permission" })).toContainText("Lots and purchase prices");
  await expect(page.getByRole("dialog", { name: "Portfolio refresh permission" })).toContainText("the dRPC Robinhood Chain gateway receives the address");
  await expect(page.getByRole("dialog", { name: "Portfolio refresh permission" })).toContainText("dRPC is a paid gateway that may route each read to an independent node operator in its network.");
  await expect(page.getByRole("dialog", { name: "Portfolio refresh permission" })).not.toContainText("Robinhood Public RPC");
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  await expect(page.getByText("Anchored current snapshot verified and encrypted")).toBeVisible();

  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0].body)).toEqual({ address: portfolioAddress });
  expect(calls[0].headers["x-opsis-csrf"]).toBe("1");
  expect(calls[0].headers.cookie).toBeUndefined();
  expect(calls[0].body).not.toContain("PORTFOLIO-PRIVATE-LABEL");
  expect(calls[0].body).not.toContain("PORTFOLIO-PRIVATE-NOTE");
  expect(calls[0].body).not.toContain("10");

  await expect(page.getByRole("heading", { name: "TST", exact: true })).toBeVisible();
  await expect(
    page.getByTestId("vault-portfolio-panel").getByText("Private linked token"),
  ).toBeVisible();
  await expect(page.getByText("VERIFIED MOVEMENTS · RECEIPT-DECODED")).toBeVisible();
  await expect(page.getByText(`CONTRACT ${portfolioToken}`, { exact: false })).toBeVisible();
  const holding = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "TST", exact: true }) });
  await holding.getByLabel("LOCAL UNIT VALUE").fill("98765.43210987654321");
  await holding.getByLabel("CURRENCY").fill("USD");
  await holding.getByRole("button", { name: "SAVE LOCALLY" }).click();
  await expect(page.getByText("Reference price encrypted locally")).toBeVisible();
  await expect(holding).toContainText("20 USD");

  const rawText = JSON.stringify(await readRawVault(page));
  for (const privateCanary of ["PORTFOLIO-PRIVATE-LABEL", "PORTFOLIO-PRIVATE-NOTE", portfolioAddress, "98765.43210987654321"]) {
    expect(rawText).not.toContain(privateCanary);
  }
  const callsBeforeReload = calls.length;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  expect(calls).toHaveLength(callsBeforeReload);
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await expect(page.getByRole("heading", { name: "TST", exact: true })).toBeVisible();
  await expect(page.getByText("PORTFOLIO-PRIVATE-LABEL")).toBeVisible();
  expect(calls).toHaveLength(callsBeforeReload);

  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  const mixedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" }).click();
  const mixedBackup = await downloadBuffer(await mixedDownload);
  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page.locator("summary").filter({ hasText: "Have a backup? Restore your Vault" }).click();
  await page.getByLabel("Encrypted vault backup", { exact: true }).setInputFiles(backupFile(mixedBackup));
  await page.getByLabel("BACKUP PASSPHRASE", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "VERIFY & RESTORE LOCALLY" }).click();
  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await expect(page.getByRole("heading", { name: "Private linked token" })).toBeVisible();
  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await expect(page.getByText("PORTFOLIO-PRIVATE-LABEL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "TST", exact: true })).toBeVisible();

  const networkText = allRequests.join("\n");
  expect(networkText).not.toContain(sessionCookieCanary);
  expect(networkText).not.toContain("PORTFOLIO-PRIVATE-LABEL");
  expect(networkText).not.toContain("PORTFOLIO-PRIVATE-NOTE");
});

test("locking during a delayed portfolio refresh aborts it before encrypted persistence", async ({ page }) => {
  let releaseResponse!: () => void;
  let markRequested!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const requested = new Promise<void>((resolve) => { markRequested = resolve; });
  await page.route("**/v1/private/portfolio/snapshot", async (route) => {
    markRequested();
    await responseGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot()) }).catch(() => undefined);
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  const before = await readRawVault(page);

  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  await requested;
  const afterPermission = await readRawVault(page);
  expect(afterPermission).not.toEqual(before);
  expect(afterPermission.records).toHaveLength(1);
  expect(JSON.stringify(afterPermission)).not.toContain(portfolioAddress);
  await page.getByRole("button", { name: "LOCK", exact: true }).click();
  releaseResponse();
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await page.waitForTimeout(150);
  expect(await readRawVault(page)).toEqual(afterPermission);
});

test("a completed network refresh reports an honest encrypted-save failure", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/v1/private/portfolio/snapshot", async (route) => {
    requestCount += 1;
    await bumpRawVaultRevision(page);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot()) });
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();

  await expect(page.getByRole("alert")).toContainText("The address was sent and the anchored refresh completed, but the encrypted snapshot save failed");
  expect(requestCount).toBe(1);
});

test("a failed provider refresh keeps an encrypted attempt receipt and warns that the address was sent", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/v1/private/portfolio/snapshot", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "PROVIDER_UNAVAILABLE", message: "Provider unavailable" } })
    });
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();

  await expect(page.getByRole("alert")).toContainText("Your confirmed address may already have reached the named providers; the encrypted attempt receipt was kept");
  expect(requestCount).toBe(1);
  const raw = await readRawVault(page);
  expect(raw.records).toHaveLength(1);
  expect(JSON.stringify(raw)).not.toContain(portfolioAddress);
});

test("switching portfolio addresses clears the prior wallet's private label and valuation editor", async ({ page }) => {
  await page.route("**/v1/private/portfolio/snapshot", async (route) => {
    const body = route.request().postDataJSON() as { address: string };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot(body.address)) });
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();

  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  await page.getByLabel("PRIVATE LOCAL LABEL").fill("MAIN-WALLET-A");
  await page.getByRole("button", { name: "SAVE LABEL" }).click();
  await expect(page.getByText("Wallet label encrypted locally. It never crossed the network.", { exact: true })).toBeVisible();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress.slice(0, -1));
  await expect(page.getByLabel("PRIVATE LOCAL LABEL")).toHaveValue("MAIN-WALLET-A");
  await page.getByLabel("ROBINHOOD ADDRESS").fill(portfolioAddress);
  await expect(page.getByLabel("PRIVATE LOCAL LABEL")).toHaveValue("MAIN-WALLET-A");
  const firstHolding = page.getByRole("article").filter({ hasText: "TST" });
  await firstHolding.getByLabel("LOCAL UNIT VALUE").fill("123.456");
  await firstHolding.getByRole("button", { name: "SAVE LOCALLY" }).click();
  await expect(firstHolding.getByLabel("LOCAL UNIT VALUE")).toHaveValue("123.456");

  await page.getByLabel("ROBINHOOD ADDRESS").fill(secondPortfolioAddress);
  await expect(page.getByLabel("PRIVATE LOCAL LABEL")).toHaveValue("");
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  const secondHolding = page.getByRole("article").filter({ hasText: "TST" });
  await expect(secondHolding.getByLabel("LOCAL UNIT VALUE")).toHaveValue("");
});

test("one-time recovery resets the passphrase and rotates the recovery code", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  const firstRecovery = await page.getByTestId("recovery-code").textContent();
  await page.reload();

  await page.locator("summary").filter({ hasText: "Forgot your passphrase? Use your recovery code" }).click();
  await page.getByLabel("RECOVERY CODE").fill(firstRecovery ?? "");
  await page.getByLabel("NEW PASSPHRASE", { exact: true }).fill(nextPassphrase);
  await page.getByLabel("CONFIRM NEW PASSPHRASE").fill(nextPassphrase);
  await page.getByRole("button", { name: "RECOVER & ROTATE CODE" }).click();
  const secondRecovery = await page.getByTestId("recovery-code").textContent();
  expect(secondRecovery).toMatch(/^CSV1-/);
  expect(secondRecovery).not.toBe(firstRecovery);
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "LOCK" }).click();

  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("alert")).toContainText("could not unlock");
  await page.getByLabel("VAULT PASSPHRASE").fill(nextPassphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("button", { name: "ADD ASSET" })).toBeVisible();
});

test("mobile Vault exposes honest best-effort storage and local validation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: async () => false,
        persist: async () => false,
        estimate: async () => ({ usage: 2048, quota: 1048576 })
      }
    });
  });
  await page.goto("/vault");
  await page.locator("summary").filter({ hasText: "Privacy & storage details" }).click();
  await expect(page.getByText("BACKUP ADVISED")).toBeVisible();
  await page.locator("summary").filter({ hasText: "Privacy & storage details" }).click();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  await page.getByRole("button", { name: "REQUEST EVICTION PROTECTION" }).click();
  await expect(page.getByText("2.0 KB USED · 1.0 MB QUOTA")).toBeVisible();
  await expect(page.getByRole("button", { name: "ADD ASSET" })).toBeVisible();
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "output/qa/encrypted-vault-mobile.png", fullPage: true });
  }
});

test("Vault fails closed when IndexedDB is unavailable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined }));
  await page.goto("/vault");
  await expect(page.getByRole("heading", { name: "Secure local storage is not available" })).toBeVisible();
  await expect(page.getByText(/fails closed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" })).toHaveCount(0);
});

test("Vault fails closed before controls mount when WebCrypto is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "subtle", { configurable: true, get: () => undefined });
    Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
  });
  await page.goto("/vault");
  await expect(page.getByRole("heading", { name: "Secure local storage is not available" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" })).toHaveCount(0);
});

test("hiding or leaving an unlocked Vault removes plaintext and requires unlock", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Visibility canary asset");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect(page.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await expect(page.getByText("Visibility canary asset")).toHaveCount(0);
});

test("blocked deletion exposes no Vault operation until the browser completes it", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.evaluate(async () => {
    const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("chainscout-private-vault", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    (window as unknown as { __vaultBlocker: IDBDatabase }).__vaultBlocker = blocker;
  });
  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await expect(page.getByRole("heading", { name: "Local deletion is in progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "UNLOCK LOCALLY" })).toHaveCount(0);
  await expect(page.getByLabel("Encrypted vault backup")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ADD ASSET" })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __vaultBlocker: IDBDatabase }).__vaultBlocker.close());
  await expect(page.getByRole("heading", { name: "Create your private Vault" })).toBeVisible();
});

test("Vault changes lock other tabs and reload the newest encrypted revision", async ({ page, context }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  const secondTab = await context.newPage();
  await secondTab.goto("/vault");
  await secondTab.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await secondTab.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(secondTab.getByRole("button", { name: "ADD ASSET" })).toBeVisible();

  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Cross-tab encrypted card");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(secondTab.getByRole("status")).toContainText("changed in another tab");
  await expect(secondTab.getByText("Cross-tab encrypted card")).toHaveCount(0);

  await secondTab.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await secondTab.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(secondTab.getByRole("heading", { name: "Cross-tab encrypted card" })).toBeVisible();

  await secondTab.getByRole("button", { name: "LOCK" }).click();
  await expect(page.getByRole("status")).toContainText("locked across open Opsis tabs");
  await expect(page.getByText("Cross-tab encrypted card")).toHaveCount(0);
  await secondTab.close();
});

test("an encrypted backup and matching recovery code restore after local loss", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  const originalRecovery = await page.getByTestId("recovery-code").textContent();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Recovered after eviction");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" }).click();
  const backup = await downloadBuffer(await downloadPromise);

  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page.locator("summary").filter({ hasText: "Restore a backup with a recovery code" }).click();
  await page.getByLabel("Encrypted vault backup for recovery").setInputFiles(backupFile(backup));
  await page.getByLabel("BACKUP RECOVERY CODE").fill(originalRecovery ?? "");
  await page.getByLabel("NEW BACKUP PASSPHRASE", { exact: true }).fill(nextPassphrase);
  await page.getByLabel("CONFIRM NEW BACKUP PASSPHRASE").fill(nextPassphrase);
  await page.getByRole("button", { name: "RECOVER BACKUP & ROTATE CODE" }).click();

  await expect(page.getByRole("heading", { name: "Recovered after eviction" })).toBeVisible();
  const rotatedRecovery = await page.getByTestId("recovery-code").textContent();
  expect(rotatedRecovery).toMatch(/^CSV1-/);
  expect(rotatedRecovery).not.toBe(originalRecovery);
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "LOCK" }).click();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("alert")).toContainText("could not unlock");
  await page.getByLabel("VAULT PASSPHRASE").fill(nextPassphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(page.getByRole("heading", { name: "Recovered after eviction" })).toBeVisible();
});

test("switching editors never writes one asset draft over another asset", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  for (const name of ["Asset Alpha", "Asset Beta"]) {
    await page.getByRole("button", { name: "ADD ASSET" }).click();
    await page.getByLabel("ASSET NAME").fill(name);
    await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  }
  await page.getByRole("button", { name: "Edit Asset Alpha" }).click();
  await page.getByLabel("ASSET NAME").fill("Unsaved Alpha draft");
  await page.getByRole("button", { name: "Edit Asset Beta" }).click();
  await expect(page.getByLabel("ASSET NAME")).toHaveValue("Asset Beta");
  await page.getByLabel("ASSET NAME").fill("Asset Beta edited");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByRole("heading", { name: "Asset Alpha" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asset Beta edited" })).toBeVisible();
  await expect(page.getByText("Unsaved Alpha draft")).toHaveCount(0);
});

test("replacing a Vault broadcasts the new identity and revision to other tabs", async ({ page, context }) => {
  await page.route("**/v1/private/portfolio/snapshot", async (route) => {
    const body = route.request().postDataJSON() as { address: string };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portfolioSnapshot(body.address)) });
  });
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Asset from replacement backup");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" }).click();
  const firstVaultBackup = await downloadBuffer(await downloadPromise);

  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page.getByLabel("VAULT PASSPHRASE").fill(nextPassphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(nextPassphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await page.getByLabel("ROBINHOOD ADDRESS").fill(secondPortfolioAddress);
  await page.getByLabel("PRIVATE LOCAL LABEL").fill("SECOND-VAULT-PRIVATE-LABEL");
  await page.getByRole("button", { name: "REVIEW REFRESH" }).click();
  await page.getByRole("button", { name: "CONFIRM ONE-TIME REFRESH" }).click();
  await expect(page.getByText("Anchored current snapshot verified and encrypted")).toBeVisible();
  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("UNSAVED-SECOND-VAULT-DRAFT");

  const secondTab = await context.newPage();
  await secondTab.goto("/vault");
  await secondTab.getByLabel("VAULT PASSPHRASE").fill(nextPassphrase);
  await secondTab.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(secondTab.getByRole("button", { name: "ADD ASSET" })).toBeVisible();

  await page.bringToFront();
  if (await page.getByRole("heading", { name: "Unlock on this device" }).isVisible()) {
    await page.getByLabel("VAULT PASSPHRASE").fill(nextPassphrase);
    await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  }
  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  await page.getByLabel("Encrypted vault backup", { exact: true }).setInputFiles(backupFile(firstVaultBackup));
  await page.getByLabel("BACKUP PASSPHRASE", { exact: true }).fill(passphrase);
  await page.getByLabel("TYPE REPLACE MY LOCAL VAULT").fill("REPLACE MY LOCAL VAULT");
  await page.getByRole("button", { name: "VERIFY & REPLACE LOCAL VAULT" }).click();

  await expect(page.getByRole("heading", { name: "Asset from replacement backup" })).toBeVisible();
  await expect(page.getByText("UNSAVED-SECOND-VAULT-DRAFT")).toHaveCount(0);
  await page.getByRole("button", { name: "PORTFOLIO INTELLIGENCE" }).click();
  await expect(page.getByLabel("ROBINHOOD ADDRESS")).toHaveValue("");
  await expect(page.getByLabel("PRIVATE LOCAL LABEL")).toHaveValue("");
  await expect(page.getByText("SECOND-VAULT-PRIVATE-LABEL")).toHaveCount(0);

  await expect(secondTab.getByRole("heading", { name: "Unlock on this device" })).toBeVisible();
  await secondTab.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await secondTab.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await expect(secondTab.getByRole("heading", { name: "Asset from replacement backup" })).toBeVisible();
  await secondTab.close();
});

async function readRawVault(page: Page): Promise<{ meta: Array<Record<string, unknown>>; records: Array<Record<string, unknown>> }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("chainscout-private-vault", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("meta")) request.result.createObjectStore("meta", { keyPath: "key" });
        if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(["meta", "records"], "readonly");
        const meta = transaction.objectStore("meta").getAll();
        const records = transaction.objectStore("records").getAll();
        transaction.oncomplete = () => resolve({ meta: meta.result, records: records.result });
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}

async function bumpRawVaultRevision(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("chainscout-private-vault", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("meta", "readwrite");
        const store = transaction.objectStore("meta");
        const request = store.get("vault");
        request.onsuccess = () => store.put({ ...request.result, revision: request.result.revision + 1 });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}
