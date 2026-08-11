import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const passphrase = "correct horse battery staple";
const nextPassphrase = "new recovery passphrase 2026";
const assetName = "Vault Canary Card";
const privateNote = "PRIVATE-NOTE-CANARY";
const identifier = "PSA-CHAINSCOUT-42";

test("encrypted Vault creates, stores ciphertext, locks, exports, deletes, and restores", async ({ page }) => {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const consoleMessages: string[] = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() ?? "" }));
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto("/vault");
  await expect(page.getByRole("heading", { name: /Encrypted on this device/i })).toBeVisible();
  await expect(page.getByText("ZERO SERVER SYNC")).toBeVisible();

  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  const recoveryCode = await page.getByTestId("recovery-code").textContent();
  expect(recoveryCode).toMatch(/^CSV1-/);
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill(assetName);
  await page.getByLabel("IDENTIFIER / CONTRACT / SKU").fill(identifier);
  await page.getByLabel("LOT 1 QUANTITY").fill("1.000000000000000001");
  await page.getByLabel("PRICE PER UNIT").fill("1234.560000000000000001");
  await page.getByLabel("ACQUIRED DATE").fill("2026-08-10");
  await page.getByLabel("PRIVATE NOTES").fill(privateNote);
  const sourceMetadataCanary = "SOURCE-METADATA-CANARY";
  const sourcePhoto = Buffer.concat([await readFile("apps/web/public/og.png"), Buffer.from(sourceMetadataCanary)]);
  await page.getByLabel("Private asset photo").setInputFiles({ name: "secret-photo-canary.png", mimeType: "image/png", buffer: sourcePhoto });
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByRole("heading", { name: assetName })).toBeVisible();
  await expect(page.getByText(privateNote)).toBeVisible();
  await expect(page.locator("article img")).toBeVisible();
  const processedPhoto = await page.locator("article img").getAttribute("src");
  expect(Buffer.from(processedPhoto?.split(",")[1] ?? "", "base64").toString("latin1")).not.toContain(sourceMetadataCanary);
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "output/qa/encrypted-vault-desktop.png", fullPage: true });
  }

  const raw = await readRawVault(page);
  const rawText = JSON.stringify(raw);
  for (const canary of [assetName, privateNote, identifier, "1234.560000000000000001", "secret-photo-canary", recoveryCode ?? "CSV1-"]) {
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
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const backupText = await readFile(downloadPath!, "utf8");
  expect(JSON.parse(backupText)).toMatchObject({ format: "chainscout.encrypted-vault", schemaVersion: 1 });
  for (const canary of [assetName, privateNote, identifier, recoveryCode ?? "CSV1-"]) expect(backupText).not.toContain(canary);

  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await expect(page.getByRole("heading", { name: "Create your encryption key" })).toBeVisible();
  expect((await readRawVault(page)).records).toEqual([]);

  await page.getByLabel("Encrypted vault backup", { exact: true }).setInputFiles(downloadPath!);
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

test("one-time recovery resets the passphrase and rotates the recovery code", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  const firstRecovery = await page.getByTestId("recovery-code").textContent();
  await page.reload();

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
  await expect(page.getByText("BACKUP ADVISED")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Create your encryption key" })).toBeVisible();
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
  await expect(page.getByRole("status")).toContainText("locked across open ChainScout tabs");
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
  const backupPath = await (await downloadPromise).path();
  expect(backupPath).toBeTruthy();

  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page.getByLabel("Encrypted vault backup for recovery").setInputFiles(backupPath!);
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
  const firstVaultBackup = await (await downloadPromise).path();

  await page.getByLabel("TYPE DELETE MY LOCAL VAULT").fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page.getByLabel("VAULT PASSPHRASE").fill(nextPassphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(nextPassphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();

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
  await page.getByLabel("Encrypted vault backup", { exact: true }).setInputFiles(firstVaultBackup!);
  await page.getByLabel("BACKUP PASSPHRASE", { exact: true }).fill(passphrase);
  await page.getByLabel("TYPE REPLACE MY LOCAL VAULT").fill("REPLACE MY LOCAL VAULT");
  await page.getByRole("button", { name: "VERIFY & REPLACE LOCAL VAULT" }).click();

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
