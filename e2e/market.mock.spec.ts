import { expect, test, type Download, type Page } from "@playwright/test";
import { APP_ORIGIN } from "./support/origin";

const passphrase = "correct horse battery staple";
const contract = "0x1111111111111111111111111111111111111111";
const privateLabel = "PRIVATE-MARKET-COMPARISON-CANARY";
const privateSource = "https://example.test/private-owner-offer";

function marketResponse() {
  return {
    schemaVersion: 1,
    chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
    contract,
    canonicalAssetId: `eip155:4663/erc20:${contract}`,
    identityConfidence: "exact_contract",
    pairs: [
      {
        pairAddress: `0x${"44".repeat(32)}`,
        dexId: "uniswap",
        url: `https://dexscreener.com/robinhood/0x${"44".repeat(32)}`,
        labels: ["v4"],
        baseToken: {
          address: "0x2222222222222222222222222222222222222222",
          name: "Other",
          symbol: "OTHER",
        },
        quoteToken: {
          address: contract,
          name: "Searched token",
          symbol: "SEARCH",
        },
        pricedTokenAddress: "0x2222222222222222222222222222222222222222",
        baseTokenPriceUsd: "0.0007234",
        baseTokenPriceInQuote: "0.5",
        liquidityUsd: "2500",
        volume24hUsd: "300",
        priceChange24hPercent: "-1.5",
        pairCreatedAt: "2026-08-10T12:00:00.000Z",
      },
    ],
    pairsShown: 1,
    truncated: true,
    fetchedAt: "2026-08-11T12:00:00.000Z",
    freshForMs: 60_000,
    source: {
      provider: "dexscreener",
      url: `https://dexscreener.com/robinhood/${contract}`,
    },
    limitations: ["Indexed market observations are not executable quotes."],
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["DEX Screener"],
      disclosure: "Public contract only.",
    },
  };
}

test("market lookup and exact landed-cost inputs stay cookie-free and encrypted", async ({
  page,
}) => {
  const calls: Array<{ body: string; cookie: string | undefined }> = [];
  const directoryCalls: Array<{ body: string; cookie: string | undefined }> =
    [];
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.context().addCookies([
    {
      name: "rh_access",
      value: "SESSION-COOKIE-CANARY",
      url: APP_ORIGIN,
      httpOnly: true,
    },
  ]);
  await page.route("**/v1/private/market/crypto", async (route) => {
    calls.push({
      body: route.request().postData() ?? "",
      cookie: route.request().headers().cookie,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(marketResponse()),
    });
  });
  await page.route("**/v1/private/market/merchants", async (route) => {
    directoryCalls.push({
      body: route.request().postData() ?? "",
      cookie: route.request().headers().cookie,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        merchants: [],
        loadedAt: "2026-08-11T12:00:00.000Z",
        source: "chainscout_reviewed_registry",
        limitations: [],
      }),
    });
  });

  const recoveryCode = await createVault(page);
  await addLinkedAsset(page);
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByRole("button", { name: "LOAD APPROVED STORES" }).click();
  await expect(page.getByText("No merchant is enabled yet.")).toBeVisible();
  expect(directoryCalls).toEqual([{ body: "{}", cookie: undefined }]);
  await page.getByLabel("TOKEN CONTRACT").fill(contract);
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Confirm this public lookup",
  });
  await expect(
    dialog.getByRole("button", { name: "Cancel market lookup" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "SAVE RECEIPT + LOOK UP" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  await expect(dialog).toContainText("SENT TO CHAINSCOUT");
  await expect(dialog).toContainText("SENT TO DEX SCREENER");
  await expect(dialog).toContainText(contract);
  await dialog.getByRole("button", { name: "SAVE RECEIPT + LOOK UP" }).click();

  await expect(page.getByText("OTHER/SEARCH")).toBeVisible();
  await expect(page.getByText(/PRICED ADDRESS 0x2222/i)).toBeVisible();
  await expect(page.getByText(/BASE USD 0.0007234/i)).toBeVisible();
  await expect(page.getByText(/CURRENT REFERENCE WINDOW/i)).toBeVisible();
  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(page.getByText(/CURRENT REFERENCE WINDOW/i)).toBeVisible();
  await expect(
    page.getByText(/additional pools may be omitted/i),
  ).toBeVisible();
  expect(calls).toEqual([
    { body: JSON.stringify({ chainId: 4663, contract }), cookie: undefined },
  ]);

  const privatePrice = "100.123456789123456789";
  await addComparison(page, privateLabel, privatePrice);
  await addComparison(page, "Second local offer", "105");
  await expect(
    page.getByText(`${privatePrice} USD`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("105 USD", { exact: true })).toBeVisible();
  await expect(page.getByText("#1", { exact: true })).toBeVisible();
  await expect(page.getByText("#2", { exact: true })).toBeVisible();

  const raw = await readRawVault(page);
  expect(raw.records.map((record) => record.version).sort()).toEqual([3, 4]);
  const rawText = JSON.stringify(raw);
  for (const canary of [
    privateLabel,
    privateSource,
    "Near mint",
    "Canada",
    privatePrice,
  ])
    expect(rawText).not.toContain(canary);
  for (const call of calls)
    for (const canary of [
      privateLabel,
      privateSource,
      "Near mint",
      "Canada",
      privatePrice,
    ])
      expect(call.body).not.toContain(canary);
  const ownOrigin = new URL(page.url()).origin;
  expect(requests.filter((url) => new URL(url).origin !== ownOrigin)).toEqual(
    [],
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Unlock on this device" }),
  ).toBeVisible();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(page.getByText(privateLabel)).toBeVisible();
  await expect(
    page.getByText(/stale until you refresh or reconfirm/i).first(),
  ).toBeVisible();
  const firstRow = page.locator("article").filter({ hasText: privateLabel });
  await firstRow.getByRole("button", { name: "RECONFIRM MY INPUTS" }).click();
  await expect(firstRow).toContainText(`${privatePrice} USD`);
  await expect(firstRow).toContainText("#1");
  const secondRow = page
    .locator("article")
    .filter({ hasText: "Second local offer" });
  await secondRow.getByRole("button", { name: "REMOVE" }).click();
  await expect(secondRow).toHaveCount(0);
  expect(calls).toHaveLength(1);

  await page.getByRole("button", { name: /BACKUP · RECOVERY/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT ENCRYPTED JSON" }).click();
  const backup = await downloadBuffer(await downloadPromise);
  await page
    .getByLabel("TYPE DELETE MY LOCAL VAULT")
    .fill("DELETE MY LOCAL VAULT");
  await page.getByRole("button", { name: "DELETE LOCAL VAULT" }).click();
  await page.locator("summary").filter({ hasText: "Restore a backup with a recovery code" }).click();
  await page
    .getByLabel("Encrypted vault backup for recovery")
    .setInputFiles(backupFile(backup));
  await page.getByLabel("BACKUP RECOVERY CODE").fill(recoveryCode);
  await page
    .getByLabel("NEW BACKUP PASSPHRASE", { exact: true })
    .fill("rotated market backup passphrase");
  await page
    .getByLabel("CONFIRM NEW BACKUP PASSPHRASE")
    .fill("rotated market backup passphrase");
  await page
    .getByRole("button", { name: "RECOVER BACKUP & ROTATE CODE" })
    .click();
  await expect(page.getByTestId("recovery-code")).toContainText("CSV1-");
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(page.getByText(privateLabel)).toBeVisible();
  await expect(page.getByText("OTHER/SEARCH")).toBeVisible();
});

test("an approved Woo mapping locks provider facts, accepts only local costs, and expires on time", async ({
  page,
}) => {
  const calls: Array<{ body: string; cookie: string | undefined }> = [];
  await page.context().addCookies([
    {
      name: "rh_access",
      value: "SESSION-COOKIE-CANARY",
      url: APP_ORIGIN,
      httpOnly: true,
    },
  ]);
  await page.route("**/v1/private/market/merchants", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        merchants: [
          {
            id: "sample-store",
            name: "Sample Opt-In Store",
            mappings: [
              {
                canonicalAssetId: "tcgdex:en:base1-4",
                sku: calls.length > 0 ? "CHAR-BASE-4-NM-V2" : "CHAR-BASE-4-NM",
                productId: calls.length > 0 ? "99" : "42",
                variantLabel: "Unlimited holo",
                condition: "Near mint",
                reviewedAt: "2026-08-11",
                evidenceUrl:
                  calls.length > 0
                    ? "https://merchant.example/product/charizard-base-4-nm-v2/"
                    : "https://merchant.example/product/charizard-base-4-nm/",
              },
            ],
            permissionReviewedAt: "2026-08-11",
            permissionEvidenceUrl:
              "https://merchant.example/chainscout-permission/",
          },
        ],
        loadedAt: "2026-08-11T12:00:00.000Z",
        source: "chainscout_reviewed_registry",
        limitations: [],
      }),
    }),
  );
  await page.route("**/v1/private/market/merchant", async (route) => {
    calls.push({
      body: route.request().postData() ?? "",
      cookie: route.request().headers().cookie,
    });
    const revised = calls.length > 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        merchant: {
          id: "sample-store",
          name: "Sample Opt-In Store",
          provider: "woocommerce",
        },
        canonicalAssetId: "tcgdex:en:base1-4",
        mapping: {
          sku: revised ? "CHAR-BASE-4-NM-V2" : "CHAR-BASE-4-NM",
          productId: revised ? "99" : "42",
          reviewedAt: "2026-08-11",
          evidenceUrl: revised
            ? "https://merchant.example/product/charizard-base-4-nm-v2/"
            : "https://merchant.example/product/charizard-base-4-nm/",
        },
        offer: revised
          ? null
          : {
              provider: "woocommerce",
              merchantId: "sample-store",
              merchantName: "Sample Opt-In Store",
              canonicalAssetId: "tcgdex:en:base1-4",
              identityConfidence: "reviewed_simple_product_mapping",
              productId: "42",
              sku: "CHAR-BASE-4-NM",
              title: "Charizard Base Set #4",
              variantLabel: "Unlimited holo",
              condition: "Near mint",
              mappingReviewedAt: "2026-08-11",
              mappingEvidenceUrl:
                "https://merchant.example/product/charizard-base-4-nm/",
              url: "https://merchant.example/product/charizard/",
              currency: "USD",
              unitPrice: "129.99",
              inventoryState: "provider_low_stock",
              exactQuantity: null,
              productRating: {
                average: "4.8",
                count: 17,
                sourceLabel: "merchant_reported_product_rating",
              },
              fetchedAt: "2026-08-11T12:00:00.000Z",
              freshForMs: 5_000,
            },
        state: revised ? "valid_empty" : "exact_match",
        fetchedAt: "2026-08-11T12:00:00.000Z",
        freshForMs: 5_000,
        source: {
          provider: "woocommerce",
          url: "https://merchant.example/product/charizard/",
        },
        limitations: ["One opted-in merchant."],
        privacy: {
          accountRequired: false,
          walletConnectionRequired: false,
          serverStorage: "none",
          modelProvider: "none",
          providerDestinations: ["Sample Opt-In Store"],
          disclosure: "Reviewed SKU only.",
        },
      }),
    });
  });

  await createVault(page);
  await addLinkedAsset(page);
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByRole("button", { name: "LOAD APPROVED STORES" }).click();
  await page
    .getByRole("button", { name: /Sample Opt-In Store.*Unlimited holo/i })
    .click();
  await page.getByRole("button", { name: "REVIEW MERCHANT LOOKUP" }).click();
  const permission = page.getByRole("dialog");
  await expect(permission).toContainText(
    "Merchant ID sample-store · canonical asset tcgdex:en:base1-4 · reviewed SKU CHAR-BASE-4-NM · expected product ID 42 · mapping reviewed 2026-08-11",
  );
  await expect(permission).toContainText(
    "Exact reviewed SKU CHAR-BASE-4-NM · expected product ID 42",
  );
  await expect(permission).toContainText(
    "reviewed SKU, expected product ID, and mapping review date go transiently to ChainScout",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();

  const editor = page.getByTestId("market-comparison-editor");
  await expect(editor.getByLabel("UNIT PRICE")).toHaveValue("129.99");
  await expect(editor.getByLabel("UNIT PRICE")).toBeDisabled();
  await expect(editor.getByLabel("CONDITION / VARIANT")).toBeDisabled();
  await expect(editor.getByLabel("PROVIDER AVAILABILITY")).toBeDisabled();
  for (const field of ["SHIPPING", "TAX", "DUTY", "FEES", "DISCOUNT"])
    await editor.getByLabel(field).fill("0");
  await editor
    .getByRole("button", { name: "ENCRYPT & ADD COMPARISON" })
    .click();
  const row = page
    .locator("article")
    .filter({ hasText: "Sample Opt-In Store · Charizard Base Set #4" });
  await expect(row).toContainText("129.99 USD");
  await expect(row).toContainText("#1");
  await expect(page.getByText(/4.8\/5 · 17 reviews/i)).toBeVisible();
  await expect(page.getByText("Not supplied by this adapter")).toBeVisible();
  await page.getByRole("button", { name: "LOAD APPROVED STORES" }).click();
  await page
    .getByRole("button", { name: /Sample Opt-In Store.*Unlimited holo/i })
    .click();
  await page.getByRole("button", { name: "REVIEW MERCHANT LOOKUP" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Exact reviewed SKU CHAR-BASE-4-NM-V2 · expected product ID 99",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(page.getByText(/VALID EMPTY · CURRENT/i)).toBeVisible();
  const emptyObservation = page.locator("article").filter({
    hasText: "VALID EMPTY",
  });
  await expect(emptyObservation).toContainText("SKU CHAR-BASE-4-NM-V2");
  await expect(row).toContainText("NOT RANKED");
  await expect(row).toContainText("stale until you refresh");
  const firstBody = JSON.stringify({
    merchantId: "sample-store",
    canonicalAssetId: "tcgdex:en:base1-4",
    expectedSku: "CHAR-BASE-4-NM",
    expectedProductId: "42",
    expectedMappingReviewedAt: "2026-08-11",
  });
  const revisedBody = JSON.stringify({
    merchantId: "sample-store",
    canonicalAssetId: "tcgdex:en:base1-4",
    expectedSku: "CHAR-BASE-4-NM-V2",
    expectedProductId: "99",
    expectedMappingReviewedAt: "2026-08-11",
  });
  expect(calls).toEqual([
    { body: firstBody, cookie: undefined },
    { body: revisedBody, cookie: undefined },
  ]);
  await expect(page.getByText(/VALID EMPTY · STALE/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.reload();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(page.getByText(/VALID EMPTY · STALE/i)).toBeVisible();
});

test("a v4 market write locks another tab and reloads only the newest encrypted revision", async ({
  page,
  context,
}) => {
  await createVault(page);
  await addLinkedAsset(page);
  const secondTab = await context.newPage();
  await secondTab.goto("/vault");
  await secondTab.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await secondTab.getByRole("button", { name: "UNLOCK LOCALLY" }).click();

  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await addComparison(page, "CROSS-TAB-MARKET-CANARY", "88.01");
  await expect(secondTab.getByRole("status")).toContainText(
    "changed in another tab",
  );
  await expect(secondTab.getByText("CROSS-TAB-MARKET-CANARY")).toHaveCount(0);
  await secondTab.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await secondTab.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await secondTab.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(secondTab.getByText("CROSS-TAB-MARKET-CANARY")).toBeVisible();
  await secondTab.close();
});

test("a valid-empty crypto observation stays source-linked, encrypted, and stale after reload", async ({
  page,
}) => {
  await page.route("**/v1/private/market/crypto", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...marketResponse(),
        pairs: [],
        pairsShown: 0,
        truncated: false,
      }),
    }),
  );
  await createVault(page);
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByLabel("TOKEN CONTRACT").fill(contract);
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(page.getByText(/VALID EMPTY · DEX Screener/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /OPEN DEX SCREENER SOURCE/i }),
  ).toHaveAttribute("href", `https://dexscreener.com/robinhood/${contract}`);
  await expect(page.getByText(/CURRENT REFERENCE WINDOW/i)).toBeVisible();
  await page.reload();
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "UNLOCK LOCALLY" }).click();
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(page.getByText(/VALID EMPTY · DEX Screener/i)).toBeVisible();
  await expect(page.getByText(/STALE · REFRESH TO UPDATE/i)).toBeVisible();
});

test("a bounded multi-pair result discloses compact-view truncation and exact pair identities", async ({
  page,
}) => {
  const response = marketResponse();
  const seed = response.pairs[0];
  response.pairs = Array.from({ length: 7 }, (_, index) => {
    const pairAddress = `0x${(index + 1).toString(16).padStart(40, "0")}`;
    return {
      ...seed,
      pairAddress,
      url: `https://dexscreener.com/robinhood/${pairAddress}`,
    };
  });
  response.pairsShown = 7;
  await page.route("**/v1/private/market/crypto", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    }),
  );
  await createVault(page);
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByLabel("TOKEN CONTRACT").fill(contract);
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(page.getByText(/Showing 6 of 7 encrypted/i)).toBeVisible();
  await expect(page.getByText(/PAIR ID 0x0+1/i)).toBeVisible();
  await expect(
    page.getByText(/BASE 0x2222.*QUOTE 0x1111/i).first(),
  ).toBeVisible();
});

test("a post-provider local quota failure says the identifier was sent and does not persist the result", async ({
  page,
}) => {
  let providerCalls = 0;
  await page.route("**/v1/private/market/crypto", async (route) => {
    providerCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(marketResponse()),
    });
  });
  await createVault(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (value, key) {
      writes += 1;
      if (writes === 3) {
        throw new DOMException("Injected quota boundary", "QuotaExceededError");
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByLabel("TOKEN CONTRACT").fill(contract);
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "provider returned a result and the approved public identifier was sent",
  );
  await expect(page.getByRole("alert")).toContainText("out of storage space");
  expect(providerCalls).toBe(1);
  await expect(page.getByText("OTHER/SEARCH")).toHaveCount(0);
});

test("locking a delayed market request prevents the response from entering the Vault", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  await page.route("**/v1/private/market/crypto", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(marketResponse()),
      })
      .catch(() => undefined);
  });
  await createVault(page);
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByLabel("TOKEN CONTRACT").fill(contract);
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  await page
    .getByRole("dialog")
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
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await expect(page.getByText("OTHER/SEARCH")).toHaveCount(0);
});

test("a failed provider keeps the approved receipt local and gives an honest failure state", async ({
  page,
}) => {
  await page.route("**/v1/private/market/crypto", async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "MARKET_PROVIDER_UNAVAILABLE",
          message: "provider detail",
        },
      }),
    }),
  );
  await createVault(page);
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page.getByLabel("TOKEN CONTRACT").fill(contract);
  await page
    .getByRole("button", { name: "REVIEW EXACT-CONTRACT LOOKUP" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "public identifier may already have been sent",
  );
  await expect(page.getByText("OTHER/SEARCH")).toHaveCount(0);
  expect(
    (await readRawVault(page)).records.map((record) => record.version),
  ).toEqual([4]);
});

test("a catalog identity builds click-only public handoffs and waits for the user before leaving", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(APP_ORIGIN))
      externalRequests.push(request.url());
  });
  const privacy = {
    accountRequired: false,
    walletConnectionRequired: false,
    serverStorage: "none",
    modelProvider: "none",
    providerDestinations: ["TCGdex"],
    disclosure: "Public catalog identity only.",
  };
  await page.route("**/v1/private/collectibles/search", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: {
          language: "en",
          name: "Charizard",
          number: "4",
          setId: "base1",
        },
        results: [{ catalogId: "base1-4", name: "Charizard", number: "4" }],
        matchesShown: 1,
        truncated: false,
        fetchedAt: "2026-08-11T12:00:00.000Z",
        source: {
          provider: "tcgdex",
          url: "https://tcgdex.dev",
          licenseUrl:
            "https://github.com/tcgdex/cards-database/blob/master/LICENSE",
        },
        privacy,
      }),
    }),
  );
  await page.route("**/v1/private/collectibles/detail", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        card: {
          provider: "tcgdex",
          catalogId: "base1-4",
          language: "en",
          name: "Charizard",
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
        privacy,
      }),
    }),
  );
  await page.context().route("https://www.ebay.com/**", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>Mock eBay search</title>",
    }),
  );

  await createVault(page);
  await page.getByRole("button", { name: "COLLECTIBLE CATALOG" }).click();
  await page.getByLabel("CARD NAME").fill("Charizard");
  await page.getByLabel("NUMBER").fill("4");
  await page.getByRole("textbox", { name: "SET ID" }).fill("base1");
  await page.getByRole("button", { name: "REVIEW LOOKUP" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await page
    .getByRole("button", { name: /Charizard.*REVIEW EXACT MATCH/i })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "SAVE RECEIPT + LOOK UP" })
    .click();
  await page.getByRole("button", { name: "SAVE PRIVATE COLLECTIBLE" }).click();
  await page.getByRole("button", { name: "MARKET & INVENTORY" }).click();
  await page
    .getByLabel("ENCRYPTED COLLECTIBLE")
    .selectOption({ label: "Charizard · Base Set #4" });

  const ebay = page.getByRole("link", { name: /eBay search/i });
  await expect(ebay).toHaveAttribute(
    "href",
    /_nkw=Charizard%20Base%20Set%20%234/,
  );
  await expect(
    page.getByRole("link", { name: /TCGplayer search/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Cardmarket search/i }),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
  const popupPromise = page.waitForEvent("popup");
  await ebay.click();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle("Mock eBay search");
  expect(new URL(popup.url()).hostname).toBe("www.ebay.com");
});

async function createVault(page: Page): Promise<string> {
  await page.goto("/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill(passphrase);
  await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  const recoveryCode = await page.getByTestId("recovery-code").textContent();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  if (!recoveryCode) throw new Error("Recovery code was not shown");
  return recoveryCode;
}

async function downloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function backupFile(buffer: Buffer) {
  return {
    name: "chainscout-market-vault.encrypted.json",
    mimeType: "application/json",
    buffer,
  };
}

async function addLinkedAsset(page: Page): Promise<void> {
  await page.getByRole("button", { name: "MANUAL ASSET RECORDS" }).click();
  await page.getByRole("button", { name: "ADD ASSET" }).click();
  await page.getByLabel("ASSET NAME").fill("Market Test Card");
  await page
    .getByLabel("IDENTIFIER / CONTRACT / SKU")
    .fill("tcgdex:en:base1-4");
  await page.getByRole("button", { name: "ENCRYPT & SAVE" }).click();
  await expect(
    page.getByRole("heading", { name: "Market Test Card" }),
  ).toBeVisible();
}

async function addComparison(
  page: Page,
  label: string,
  price: string,
): Promise<void> {
  const editor = page.getByTestId("market-comparison-editor");
  await editor
    .getByLabel("LINKED ASSET")
    .selectOption({ label: "Market Test Card" });
  await editor.getByLabel("OFFER LABEL").fill(label);
  await editor.getByLabel("SOURCE NAME").fill("Owner source");
  await editor.getByLabel("SOURCE URL").fill(privateSource);
  await editor.getByLabel("CONDITION / VARIANT").fill("Near mint");
  await editor.getByLabel("REGION").fill("Canada");
  await editor.getByLabel("UNIT PRICE").fill(price);
  for (const field of ["SHIPPING", "TAX", "DUTY", "FEES", "DISCOUNT"])
    await editor.getByLabel(field).fill("0");
  await editor
    .getByRole("button", { name: "ENCRYPT & ADD COMPARISON" })
    .click();
  await expect(editor.getByLabel("OFFER LABEL")).toHaveValue("");
  await expect(
    editor.getByRole("button", { name: "ENCRYPT & ADD COMPARISON" }),
  ).toBeDisabled();
}

async function readRawVault(
  page: Page,
): Promise<{ records: Array<{ version: number; ciphertext: string }> }> {
  return page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("chainscout-private-vault", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["records"], "readonly");
          const records = transaction.objectStore("records").getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve({ records: records.result });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}
