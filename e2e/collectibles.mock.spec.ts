import { expect, test, type Download, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const passphrase = "correct horse battery staple";
const cardName = "Charizard";
const privateCert = "PRIVATE-CERT-778899";
const privateNote = "PRIVATE-COLLECTIBLE-NOTE";
const privateReference = "https://example.test/private-value-source";
const privatePhotoName = "PRIVATE-OWNER-PHOTO-CANARY.png";
const catalogImageUrl = "https://assets.tcgdex.net/en/base/base1/4/low.png";

function searchResponse() {
  return {
    query: { language: "en", name: cardName, number: "4", setId: "base1" },
    results: [{ catalogId: "base1-4", name: cardName, number: "4" }],
    matchesShown: 1,
    truncated: false,
    fetchedAt: "2026-08-11T12:00:00.000Z",
    source: {
      provider: "tcgdex",
      url: "https://tcgdex.dev",
      licenseUrl:
        "https://github.com/tcgdex/cards-database/blob/master/LICENSE",
    },
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["TCGdex"],
      disclosure: "Only approved public catalog identifiers were sent.",
    },
  };
}

function detailResponse() {
  return {
    card: {
      provider: "tcgdex",
      catalogId: "base1-4",
      language: "en",
      name: cardName,
      imageUrl: catalogImageUrl,
      pricing: { marketPrice: "PROVIDER-PRICE-CANARY" },
      number: "4",
      category: "Pokemon",
      set: {
        id: "base1",
        name: "Base Set",
        officialCount: 102,
        totalCount: 102,
      },
      rarity: "Rare",
      illustrator: "Mitsuhiro Arita",
      catalogUpdatedAt: null,
      fetchedAt: "2026-08-11T12:00:00.000Z",
      sourceUrl: "https://api.tcgdex.net/v2/graphql",
      licenseUrl:
        "https://github.com/tcgdex/cards-database/blob/master/LICENSE",
    },
    privacy: searchResponse().privacy,
  };
}

test("catalog match saves only encrypted owner data and survives encrypted backup restore", async ({
  page,
}) => {
  const calls: Array<{
    path: string;
    body: string;
    cookie: string | undefined;
  }> = [];
  const requests: string[] = [];
  const catalogImageRequests: Array<Record<string, string>> = [];
  page.on("request", (request) => requests.push(request.url()));
  await page
    .context()
    .addCookies([
      {
        name: "rh_access",
        value: "SESSION-COOKIE-CANARY",
        url: "http://localhost:5173",
        httpOnly: true,
      },
    ]);
  await page.route("**/v1/private/collectibles/search", async (route) => {
    const request = route.request();
    calls.push({
      path: new URL(request.url()).pathname,
      body: request.postData() ?? "",
      cookie: request.headers().cookie,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchResponse()),
    });
  });
  await page.route("**/v1/private/collectibles/detail", async (route) => {
    const request = route.request();
    calls.push({
      path: new URL(request.url()).pathname,
      body: request.postData() ?? "",
      cookie: request.headers().cookie,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(detailResponse()),
    });
  });
  await page.route(catalogImageUrl, async (route) => {
    catalogImageRequests.push(route.request().headers());
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: readFileSync("apps/web/public/og.png"),
    });
  });

  await createVault(page);
  await page.getByRole("button", { name: "COLLECTIBLE CATALOG" }).click();
  await page.getByLabel("CARD NAME").fill(cardName);
  await page.getByLabel("NUMBER").fill("4");
  await page.getByRole("textbox", { name: "SET ID" }).fill("base1");
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  const searchPermission = page.getByRole("dialog", {
    name: "Confirm this catalog lookup",
  });
  await expect(
    searchPermission.getByRole("button", { name: "Cancel catalog lookup" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    searchPermission.getByRole("button", { name: "SAVE RECEIPT + LOOK UP" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "REVIEW LOOKUP" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  await expect(searchPermission).toContainText("SENT TO CHAINSCOUT");
  await expect(searchPermission).toContainText(
    "EN · Charizard · #4 · set base1",
  );
  await expect(searchPermission).toContainText("SENT TO TCGDEX");
  await expect(searchPermission).toContainText("EN · Charizard · #4");
  await expect(
    searchPermission.getByText("EN · Charizard · #4 · set base1"),
  ).toHaveCount(1);
  await expect(searchPermission).toContainText(
    "ownership fields, photos, costs, notes, grades, certificates, and manual values",
  );
  await expect(searchPermission).toContainText("Search requests only card IDs");
  await searchPermission
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(
    page.getByRole("button", { name: /Charizard.*REVIEW EXACT MATCH/i }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Charizard.*REVIEW EXACT MATCH/i })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm this catalog lookup" })
    .getByText("browser fetches its low-resolution image")
    .waitFor();
  await page
    .getByRole("dialog", { name: "Confirm this catalog lookup" })
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(page.getByTestId("collectible-owner-form")).toContainText(
    "CATALOG IDENTITY RESOLVED",
  );
  await expect(page.getByTestId("collectible-owner-form")).not.toContainText(
    "market price",
  );
  await expect(page.getByText("CATALOG THUMBNAIL READY · SANITIZED LOCALLY")).toBeVisible();
  await expect(page.getByAltText("Charizard sanitized thumbnail preview")).toBeVisible();

  await page
    .getByLabel("OWNER-REPORTED PRINTING / VARIANT")
    .fill("Holo · Shadowless · 1st Edition");
  await page.getByLabel("OWNER-REPORTED CONDITION").selectOption("near-mint");
  await page.getByLabel("OWNER-REPORTED GRADER").selectOption("psa");
  await page.getByLabel("OWNER-ENTERED GRADE").fill("10");
  await page.getByLabel("OWNER-ENTERED CERTIFICATE").fill(privateCert);
  await page.getByLabel("PURCHASE PRICE / UNIT").fill("250.00");
  await page.getByLabel("ACQUIRED DATE").fill("2026-08-11");
  await page.getByLabel("PRIVATE NOTES").fill(privateNote);
  await page.getByLabel("VALUE").fill("321.99");
  await page.getByLabel("OBSERVED DATE").fill("2026-08-11");
  await page.getByLabel("HTTPS SOURCE URL").fill(privateReference);
  await page.getByLabel("SOURCE LABEL").fill("Owner-observed sold listing");
  await page.getByRole("button", { name: "SAVE PRIVATE COLLECTIBLE" }).click();

  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await expect(
    page.getByRole("heading", { name: /Charizard · Base Set #4/ }),
  ).toBeVisible();
  await expect(
    page.getByText("OWNER GRADE / CERT").locator(".."),
  ).toContainText(privateCert);
  await expect(page.getByText(/CATALOG THUMBNAIL · SANITIZED \+ ENCRYPTED/)).toBeVisible();
  await page
    .getByRole("button", { name: /Edit Charizard · Base Set #4/ })
    .click();
  await expect(page.getByLabel("LOT 1 QUANTITY")).toBeDisabled();
  await page.getByLabel("OWNER CONDITION").selectOption("excellent");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(page.getByTestId("vault-asset-editor")).toHaveCount(0);
  await expect(
    page.getByText("OWNER CONDITION", { exact: true }).locator(".."),
  ).toContainText("EXCELLENT");
  await page
    .getByRole("button", { name: /Edit Charizard · Base Set #4/ })
    .click();
  await page.getByLabel("OWNER GRADER").selectOption("ungraded");
  await page.getByRole("button", { name: "+ ADD LOT" }).click();
  await page.getByLabel("OWNER GRADER").selectOption("psa");
  await expect(page.getByLabel("OWNER GRADER")).toHaveValue("ungraded");
  await expect(page.getByRole("alert")).toContainText(
    "Split this item into a separate single-copy record",
  );
  await page.getByRole("button", { name: "Close asset editor" }).click();
  const raw = await readRawVault(page);
  expect(
    raw.records.map((record: { version: number }) => record.version),
  ).toEqual([3, 3]);
  const rawText = JSON.stringify(raw);
  for (const canary of [
    privateCert,
    privateNote,
    privateReference,
    privatePhotoName,
    "321.99",
    "250.00",
    cardName,
    catalogImageUrl,
    "PROVIDER-PRICE-CANARY",
    "NESTED-PRICE-CANARY",
  ])
    expect(rawText).not.toContain(canary);

  expect(calls).toHaveLength(2);
  expect(JSON.parse(calls[0].body)).toEqual({
    language: "en",
    name: cardName,
    number: "4",
    setId: "base1",
  });
  expect(JSON.parse(calls[1].body)).toEqual({
    language: "en",
    cardId: "base1-4",
  });
  expect(calls.every((call) => call.cookie === undefined)).toBe(true);
  const ownOrigin = new URL(page.url()).origin;
  expect(requests.filter((url) => new URL(url).origin !== ownOrigin)).toEqual([catalogImageUrl]);
  expect(catalogImageRequests).toHaveLength(1);
  expect(catalogImageRequests[0].cookie).toBeUndefined();
  expect(catalogImageRequests[0].authorization).toBeUndefined();
  expect(catalogImageRequests[0].referer).toBeUndefined();
  for (const call of calls)
    for (const canary of [
      privateCert,
      privateNote,
      privateReference,
      privatePhotoName,
      "321.99",
      "250.00",
    ])
      expect(call.body).not.toContain(canary);

  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" }).click();
  const backup = await downloadBuffer(await downloadPromise);
  const backupText = backup.toString("utf8");
  for (const canary of [
    privateCert,
    privateNote,
    privateReference,
    privatePhotoName,
    cardName,
  ])
    expect(backupText).not.toContain(canary);

  await page
    .getByLabel("TYPE DELETE MY LOCAL VAULT")
    .fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page
    .getByLabel("Encrypted vault backup", { exact: true })
    .setInputFiles({
      name: "vault.json",
      mimeType: "application/json",
      buffer: backup,
    });
  await page.getByLabel("BACKUP PASSPHRASE", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "VERIFY & RESTORE LOCALLY" }).click();
  await expect(
    page.getByRole("heading", { name: /Charizard · Base Set #4/ }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
});

test("provider failure keeps the manual path usable and lock aborts a delayed lookup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  await page.route("**/v1/private/collectibles/search", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "COLLECTIBLE_PROVIDER_UNAVAILABLE",
            message: "Catalog unavailable",
          },
        }),
      })
      .catch(() => undefined);
  });
  await createVault(page);
  await page.getByRole("button", { name: "COLLECTIBLE CATALOG" }).click();
  await page.getByLabel("CARD NAME").fill("Pikachu");
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  await page
    .getByRole("dialog", { name: "Confirm this catalog lookup" })
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect.poll(() => typeof release).toBe("function");
  await page.getByRole("button", { name: "LOCK" }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "Unlock on this device" }),
  ).toBeVisible();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await page.getByRole("button", { name: "COLLECTIBLE CATALOG" }).click();
  await page.getByRole("button", { name: "ADD WITHOUT CATALOG" }).click();
  await expect(page.getByTestId("vault-asset-editor")).toBeVisible();
});

test("a failed search clears stale matches and explains the provider state", async ({
  page,
}) => {
  let attempt = 0;
  await page.route("**/v1/private/collectibles/search", async (route) => {
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(searchResponse()),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "COLLECTIBLE_PROVIDER_UNAVAILABLE",
          message: "provider detail",
        },
      }),
    });
  });
  await createVault(page);
  await page.getByRole("button", { name: "COLLECTIBLE CATALOG" }).click();
  await page.getByLabel("CARD NAME").fill(cardName);
  await page.getByLabel("NUMBER").fill("4");
  await page.getByRole("textbox", { name: "SET ID" }).fill("base1");
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(
    page.getByRole("button", { name: /Charizard.*REVIEW EXACT MATCH/i }),
  ).toBeVisible();
  await page.getByLabel("CARD NAME").fill("Pikachu");
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(
    page.getByRole("button", { name: /Charizard.*REVIEW EXACT MATCH/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "collectible catalog is temporarily unavailable",
  );
});

test("locking while the encrypted permission receipt is being saved prevents a network request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/v1/private/collectibles/search", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchResponse()),
    });
  });
  await createVault(page);
  await page.getByRole("button", { name: "COLLECTIBLE CATALOG" }).click();
  await page.getByLabel("CARD NAME").fill("Pikachu");
  await page.evaluate(
    async () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("chainscout-private-vault", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["records"], "readwrite");
          const store = transaction.objectStore("records");
          let released = false;
          const keepAlive = () => {
            const pending = store.get("__chainscout_test_write_lock__");
            pending.onsuccess = () => (released ? undefined : keepAlive());
            pending.onerror = () => reject(pending.error);
          };
          (
            window as Window & { __releaseVaultWrite?: () => void }
          ).__releaseVaultWrite = () => {
            released = true;
          };
          transaction.oncomplete = () => {
            db.close();
          };
          transaction.onerror = () => reject(transaction.error);
          keepAlive();
          resolve();
        };
      }),
  );
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await page.getByRole("button", { name: "LOCK" }).click();
  await page.evaluate(() =>
    (
      window as Window & { __releaseVaultWrite?: () => void }
    ).__releaseVaultWrite?.(),
  );
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Unlock on this device" }),
  ).toBeVisible();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  expect((await readRawVault(page)).records).toEqual([]);
});

async function createVault(page: Page): Promise<void> {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
}

async function downloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readRawVault(
  page: Page,
): Promise<{
  meta: unknown[];
  records: Array<{ version: number; ciphertext: string }>;
}> {
  return page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("chainscout-private-vault", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["meta", "records"], "readonly");
          const meta = transaction.objectStore("meta").getAll();
          const records = transaction.objectStore("records").getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve({ meta: meta.result, records: records.result });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}
