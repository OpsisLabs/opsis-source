import { chromium, webkit, expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_ORIGIN } from "./support/origin";

const address = "0x0000000000000000000000000000000000000042";
const timestamp = "2026-08-10T12:00:00.000Z";

const historyPassphrase = "isolated-history-test-passphrase";
const historyQuestion = "LOCAL-HISTORY-QUESTION-CANARY";
const historyAnswer = "LOCAL-HISTORY-ANSWER-CANARY: a public observation with incomplete coverage.";

async function prepareLocalHistory(page: Page) {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE", { exact: true }).fill(historyPassphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(historyPassphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.goto("/app");
  await unlockHistory(page);
}

async function unlockHistory(page: Page) {
  await page.getByLabel("History Vault passphrase").fill(historyPassphrase);
  await page.getByRole("button", { name: "Unlock & enable local autosave" }).click();
  await expect(page.getByRole("button", { name: "Lock history", exact: true })).toBeVisible();
}

function localHistoryResponse() {
  const citations = [{ id: "history-source", provider: "robinhood-public-rpc", url: `https://robinhoodchain.blockscout.com/address/${address}`, fetchedAt: timestamp, fieldsUsed: ["nativeBalanceEth"], description: "Public balance" }];
  const facts = { address, nativeBalanceEth: "0.25", tokenBalances: [] };
  return {
    mode: "private", entity: { chainId: 4663, type: "wallet", value: address, facts, citations, riskNotes: [] },
    answer: { answer: historyAnswer, facts, summaryBullets: ["Incomplete coverage."], confirmedFacts: [], inferences: [], riskNotes: [], citations, suggestedQuestions: [] },
    privacy: { accountRequired: false, walletConnectionRequired: false, serverStorage: "none", browserStorage: "memory_only", clearsOnReload: true, modelProvider: "none", providerDestinations: ["robinhood-public-rpc"], disclosure: "Public identifier only; no cloud history." }
  };
}

async function rawHistoryRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("chainscout-private-vault"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = await new Promise<unknown[]>((resolve, reject) => { const request = db.transaction("records").objectStore("records").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return result;
  });
}

test("local chat history survives a real browser restart and exports only ciphertext", async ({ browserName }) => {
  test.setTimeout(90_000);
  const directory = await mkdtemp(join(tmpdir(), "chainscout-history-profile-"));
  const engine = browserName === "webkit" ? webkit : chromium;
  const options = { headless: true, baseURL: APP_ORIGIN, ...(browserName === "chromium" ? { channel: "chrome" } : {}) };
  let context = await engine.launchPersistentContext(directory, options);
  try {
    let page = await context.newPage();
    const posts: string[] = [];
    page.on("request", request => { if (request.method() === "POST") posts.push(request.postData() ?? ""); });
    await page.route("**/v1/private/analyze", route => route.fulfill({ json: localHistoryResponse() }));
    await prepareLocalHistory(page);
    await page.getByLabel("Public chain identifier").fill(address);
    await page.getByLabel("Optional question").fill(historyQuestion);
    await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
    await expect(page.getByText("Saved encrypted on this device.", { exact: true })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toContain(historyPassphrase);
    expect(posts[0]).not.toContain(historyAnswer);
    const raw = JSON.stringify(await rawHistoryRecords(page));
    expect(raw).not.toContain(historyQuestion); expect(raw).not.toContain(historyAnswer);
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export encrypted backup" }).click();
    const download = await downloadEvent;
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const backup = Buffer.concat(chunks).toString("utf8");
    expect(backup).not.toContain(historyQuestion); expect(backup).not.toContain(historyAnswer);
    expect(JSON.parse(backup).records).toHaveLength(1);
    await page.reload();
    await expect(page.getByText(historyAnswer, { exact: true })).toHaveCount(0);
    await unlockHistory(page);
    await page.getByRole("navigation", { name: "Saved conversations" }).getByRole("button", { name: new RegExp(`^${historyQuestion}`) }).click();
    await expect(page.getByRole("region", { name: "Saved conversation transcript" })).toContainText(historyAnswer);
    await context.close();
    context = await engine.launchPersistentContext(directory, options);
    page = await context.newPage();
    let requests = 0;
    await page.route("**/v1/**", async route => { requests++; await route.abort(); });
    await page.goto("/app");
    await expect(page.getByText(historyQuestion, { exact: true })).toHaveCount(0);
    await unlockHistory(page);
    await page.getByRole("navigation", { name: "Saved conversations" }).getByRole("button", { name: new RegExp(`^${historyQuestion}`) }).click();
    await expect(page.getByRole("region", { name: "Saved conversation transcript" })).toContainText(historyAnswer);
    await expect(page.getByText(/Saved snapshots—not live/)).toBeVisible();
    expect(requests).toBe(0);
    await page.getByRole("button", { name: "Lock history", exact: true }).click();
    await expect(page.getByText(historyAnswer, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("History Vault passphrase")).toHaveValue("");
  } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
});

test("local history backup restores a multi-answer conversation into a separate profile", async ({ page, browser }) => {
  await prepareLocalHistory(page);
  const submitted: unknown[] = [];
  await page.route("**/v1/private/analyze", route => { submitted.push(route.request().postDataJSON()); return route.fulfill({ json: localHistoryResponse() }); });
  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByLabel("Optional question").fill(historyQuestion);
  await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
  await expect(page.getByText("Saved encrypted on this device.", { exact: true })).toBeVisible();
  await page.getByLabel("Optional question").fill("SECOND-LOCAL-QUESTION");
  await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Saved conversations" })).toContainText("2 answers");
  expect(submitted).toHaveLength(2);
  expect(JSON.stringify(submitted[1])).not.toContain(historyQuestion);
  expect(JSON.stringify(submitted[1])).not.toContain(historyAnswer);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export encrypted backup" }).click();
  const download = await downloadEvent;
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  const context = await browser.newContext({ baseURL: APP_ORIGIN });
  try {
    const restored = await context.newPage();
    const requests: string[] = [];
    restored.on("request", request => { if (request.method() === "POST") requests.push(request.url()); });
    await restored.goto("/vault");
    await restored.locator("summary").filter({ hasText: "Have a backup? Restore your Vault" }).click();
    await restored.getByLabel("Encrypted vault backup", { exact: true }).setInputFiles({ name: "test-history.encrypted.json", mimeType: "application/json", buffer: Buffer.concat(chunks) });
    await restored.getByLabel("BACKUP PASSPHRASE", { exact: true }).fill(historyPassphrase);
    await restored.getByRole("button", { name: "VERIFY & RESTORE LOCALLY" }).click();
    await expect(restored.getByRole("button", { name: /BACKUP · RECOVERY/i })).toBeVisible();
    await restored.goto("/app");
    await unlockHistory(restored);
    await restored.getByRole("navigation", { name: "Saved conversations" }).getByRole("button", { name: new RegExp(`^${historyQuestion}`) }).click();
    const transcript = restored.getByRole("region", { name: "Saved conversation transcript" });
    await expect(transcript).toContainText(historyQuestion);
    await expect(transcript).toContainText("SECOND-LOCAL-QUESTION");
    await expect(transcript.getByText(historyAnswer, { exact: true })).toHaveCount(2);
    expect(requests).toEqual([]);
    await restored.getByRole("button", { name: `Delete conversation ${historyQuestion}`, exact: true }).click();
    await restored.getByRole("button", { name: "Confirm delete conversation" }).click();
    await expect(restored.getByText(/No saved chats yet/)).toBeVisible();
    expect(await rawHistoryRecords(restored)).toEqual([]);
  } finally { await context.close(); }
});

test("local history clears plaintext and a typed passphrase when the page is hidden", async ({ page }) => {
  await prepareLocalHistory(page);
  await page.getByRole("button", { name: "Lock history", exact: true }).click();
  await page.getByLabel("History Vault passphrase").fill("UNSUBMITTED-SECRET-CANARY");
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByLabel("History Vault passphrase")).toHaveValue("");
  await expect(page.getByRole("navigation", { name: "Saved conversations" })).toHaveCount(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); });
  await unlockHistory(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByLabel("History Vault passphrase")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Lock history", exact: true })).toHaveCount(0);
});

test("local history locking discards a delayed reply and does not write it", async ({ page }) => {
  await prepareLocalHistory(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/v1/private/analyze", async route => { await pending; await route.fulfill({ json: localHistoryResponse() }).catch(() => undefined); });
  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByLabel("Optional question").fill(historyQuestion);
  const request = page.waitForRequest("**/v1/private/analyze");
  await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
  await request;
  await page.getByRole("button", { name: "Lock history", exact: true }).click();
  release();
  await unlockHistory(page);
  await expect(page.getByText(/No saved chats yet/)).toBeVisible();
  expect(await rawHistoryRecords(page)).toEqual([]);
  await expect(page.getByText(historyAnswer, { exact: true })).toHaveCount(0);
});

test("local history reports quota failure and retries without another network lookup", async ({ page }) => {
  await prepareLocalHistory(page);
  let calls = 0;
  await page.route("**/v1/private/analyze", route => { calls++; return route.fulfill({ json: localHistoryResponse() }); });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "records") { IDBObjectStore.prototype.put = original; throw new DOMException("Test quota exceeded", "QuotaExceededError"); }
      return original.apply(this, args);
    };
  });
  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByLabel("Optional question").fill(historyQuestion);
  await page.getByRole("button", { name: "EXPLAIN PRIVATELY", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Answer NOT saved");
  expect(await rawHistoryRecords(page)).toEqual([]);
  await page.getByRole("button", { name: "Retry encrypted save" }).click();
  await expect(page.getByText("Saved encrypted on this device.", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  expect(await rawHistoryRecords(page)).toHaveLength(1);
});

async function installWalletCanary(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("rh_auth", JSON.stringify({
      accessToken: "legacy-access-canary",
      refreshToken: "legacy-refresh-canary"
    }));
    (window as Window & { __walletCalls?: string[]; ethereum?: unknown }).__walletCalls = [];
    (window as Window & { __walletCalls?: string[]; ethereum?: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as Window & { __walletCalls?: string[] }).__walletCalls?.push(method);
        return [];
      },
      on: () => undefined,
      removeListener: () => undefined
    };
  });
}

test("Private Mode needs no account or wallet, renders citations, and clears on reload", async ({ page }) => {
  await installWalletCanary(page);
  const apiPaths: string[] = [];
  const externalOrigins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/")) apiPaths.push(url.pathname);
    if (url.origin !== APP_ORIGIN) externalOrigins.add(url.origin);
  });
  await page.route("**/v1/private/analyze", async (route) => {
    expect(route.request().headers()["x-chainscout-csrf"]).toBe("1");
    expect(route.request().postDataJSON()).toMatchObject({ entity: address, entityType: "unknown" });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      json: {
        mode: "private",
        entity: {
          chainId: 4663,
          type: "wallet",
          value: address,
          facts: {
            address,
            explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
            nativeBalanceEth: "0.25",
            transactionsFetched: 2,
            tokenBalances: []
          },
          citations: [{
            id: "private-source-1",
            provider: "blockscout",
            url: `https://robinhoodchain.blockscout.com/address/${address}`,
            description: "Public wallet activity",
            fetchedAt: timestamp,
            fieldsUsed: ["transactionsFetched"]
          }],
          riskNotes: []
        },
        answer: {
          answer: "This wallet has two recent public transactions on Robinhood Chain.",
          facts: {
            address,
            explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
            nativeBalanceEth: "0.25",
            transactionsFetched: 2,
            tokenBalances: []
          },
          summaryBullets: ["2 transactions — a small public activity sample."],
          confirmedFacts: [],
          inferences: [],
          uncertainty: ["Provider indexing can lag."],
          riskNotes: [],
          citations: [{
            id: "private-source-1",
            provider: "blockscout",
            url: `https://robinhoodchain.blockscout.com/address/${address}`,
            description: "Public wallet activity",
            fetchedAt: timestamp,
            fieldsUsed: ["transactionsFetched"]
          }],
          suggestedQuestions: []
        },
        privacy: {
          accountRequired: false,
          walletConnectionRequired: false,
          serverStorage: "none",
          browserStorage: "memory_only",
          clearsOnReload: true,
          modelProvider: "none",
          providerDestinations: ["blockscout"],
          disclosure: "Only the public chain identifier was sent to Blockscout. The question was not sent to a model provider."
        }
      }
    });
  });

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Leave no profile behind/i })).toBeVisible();
  expect(apiPaths).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { __walletCalls?: string[] }).__walletCalls)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("rh_auth"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect([...externalOrigins].filter((origin) => origin.includes("google") || origin.includes("gstatic"))).toEqual([]);

  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByTestId("resolving-answer-card")).toBeVisible();
  await expect(page.getByText("This wallet has two recent public transactions on Robinhood Chain.")).toBeVisible();
  await expect(page.getByText("DETERMINISTIC ANSWER · CITED")).toBeVisible();
  await expect(page.getByTestId("privacy-receipt")).toContainText("BLOCKSCOUT");
  expect(apiPaths).toEqual(["/v1/private/analyze"]);
  expect(await page.evaluate(() => document.cookie)).not.toContain("chainscout_");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your explanation will appear here" })).toBeVisible();
  await expect(page.getByText(/Unsaved results are cleared on reload/)).toBeVisible();
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  expect(apiPaths).toEqual(["/v1/private/analyze"]);
});

test("Private Mode validates locally and shows bounded provider failures on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  await page.route("**/v1/private/analyze", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 503,
      json: { error: { code: "PRIVATE_MODE_DISABLED", message: "Private Mode is temporarily unavailable" } }
    });
  });

  await page.goto("/app");
  await page.getByLabel("Public chain identifier").fill("0xbad");
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByRole("alert")).toContainText("one complete wallet or contract address");
  expect(calls).toBe(0);

  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByRole("alert")).toContainText("Private Mode is paused right now");
  expect(calls).toBe(1);
});
