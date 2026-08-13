import { describe, expect, it } from "vitest";
import {
  changeVaultPassphrase,
  createAsset,
  createBackup,
  createCollectibleContext,
  createMarketContext,
  createPortfolioContext,
  createVault,
  decryptAsset,
  decryptCollectibleRecord,
  decryptMarketContext,
  decryptPortfolioContext,
  estimateVaultBackupBytes,
  encryptAsset,
  encryptCollectibleContext,
  encryptMarketContext,
  encryptPortfolioContext,
  parseBackup,
  recoverVault,
  unlockVault,
  vaultErrorMessage,
  verifyBackup,
  assertVaultCapacity,
  VaultError,
} from "./crypto";
import {
  VAULT_COLLECTIBLE_RECORD_VERSION,
  VAULT_FORMAT,
  VAULT_KDF_ITERATIONS,
  VAULT_MARKET_RECORD_VERSION,
  type EncryptedVaultRecord,
  type VaultAsset,
  type VaultCollectibleContext,
  type VaultMarketContext,
  type VaultPortfolioContext,
} from "./types";

const passphrase = "correct horse battery staple";

describe("encrypted vault cryptography", () => {
  it("creates a nonextractable session key and decrypts exact lots, notes, and photos", async () => {
    const created = await createVault(passphrase);
    expect(created.key.extractable).toBe(false);
    expect(created.meta).toMatchObject({
      format: VAULT_FORMAT,
      schemaVersion: 1,
      revision: 0,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: VAULT_KDF_ITERATIONS,
      },
      wrappedKey: { algorithm: "AES-GCM" },
      recovery: { algorithm: "AES-GCM" },
    });
    expect(created.recoverySecret).toMatch(
      /^CSV1-[A-Za-z0-9_-]{43}\.[0-9a-f]{16}$/,
    );
    expect(JSON.stringify(created.meta)).not.toContain(created.recoverySecret);

    const asset = fixtureAsset();
    const first = await encryptAsset(created.meta, created.key, asset);
    const second = await encryptAsset(created.meta, created.key, {
      ...asset,
      notes: "Changed note",
    });
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain("PRIVATE-NOTE-CANARY");
    expect(await decryptAsset(created.meta, created.key, first)).toEqual(asset);
  });

  it("rejects the wrong passphrase, tampered ciphertext, and record identity changes", async () => {
    const created = await createVault(passphrase);
    await expect(
      unlockVault(created.meta, "another secure passphrase"),
    ).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    const encrypted = await encryptAsset(
      created.meta,
      created.key,
      fixtureAsset(),
    );
    const tampered = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA`,
    };
    await expect(
      decryptAsset(created.meta, created.key, tampered),
    ).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
    await expect(
      decryptAsset(created.meta, created.key, {
        ...encrypted,
        id: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
  });

  it("normalizes passphrases consistently and requires the exact fixed KDF work factor", async () => {
    const composed = "vault-passphrase-é-2026";
    const decomposed = "vault-passphrase-e\u0301-2026";
    const created = await createVault(composed);
    expect((await unlockVault(created.meta, decomposed)).extractable).toBe(
      false,
    );
    const hostile = structuredClone(created.meta);
    hostile.kdf.iterations = VAULT_KDF_ITERATIONS + 1;
    await expect(unlockVault(hostile, composed)).rejects.toMatchObject({
      code: "INVALID_VAULT",
    });
  });

  it("changes a passphrase only with the current passphrase", async () => {
    const created = await createVault(passphrase);
    await expect(
      changeVaultPassphrase(
        created.meta,
        "wrong but twelve chars",
        "new secure passphrase 2026",
      ),
    ).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" });
    const changed = await changeVaultPassphrase(
      created.meta,
      passphrase,
      "new secure passphrase 2026",
    );
    expect(changed.revision).toBe(1);
    await expect(unlockVault(changed, passphrase)).rejects.toMatchObject({
      code: "WRONG_PASSPHRASE",
    });
    expect(
      (await unlockVault(changed, "new secure passphrase 2026")).extractable,
    ).toBe(false);
  });

  it("recovers a vault, then rotates both passphrase and recovery code", async () => {
    const created = await createVault(passphrase);
    const recovered = await recoverVault(
      created.meta,
      created.recoverySecret,
      "recovered passphrase 2026",
    );
    expect(recovered.meta.revision).toBe(1);
    expect(recovered.recoverySecret).not.toBe(created.recoverySecret);
    expect(recovered.key.extractable).toBe(false);
    await expect(unlockVault(recovered.meta, passphrase)).rejects.toMatchObject(
      { code: "WRONG_PASSPHRASE" },
    );
    await expect(
      recoverVault(
        recovered.meta,
        created.recoverySecret,
        "another recovered pass 2026",
      ),
    ).rejects.toMatchObject({ code: "RECOVERY_FAILED" });
    await expect(
      recoverVault(
        recovered.meta,
        recovered.recoverySecret,
        "another recovered pass 2026",
      ),
    ).resolves.toMatchObject({ meta: { revision: 2 } });
  });

  it("validates every encrypted record before accepting a backup", async () => {
    const created = await createVault(passphrase);
    const encrypted = await encryptAsset(
      created.meta,
      created.key,
      fixtureAsset(),
    );
    const backup = await createBackup(created.meta, created.key, [encrypted]);
    expect(parseBackup(backup)).toEqual(backup);
    expect((await verifyBackup(backup, passphrase)).extractable).toBe(false);
    expect(() =>
      parseBackup({ ...backup, records: [encrypted, encrypted] }),
    ).toThrowError(VaultError);
    await expect(
      verifyBackup(
        {
          ...backup,
          records: [{ ...encrypted, ciphertext: "AAAAAAAAAAAAAAAAAAAA" }],
        },
        passphrase,
      ),
    ).rejects.toMatchObject({ code: "INVALID_BACKUP" });
    await expect(
      verifyBackup({ ...backup, records: [] }, passphrase),
    ).rejects.toMatchObject({ code: "INVALID_BACKUP" });
    await expect(
      verifyBackup(
        {
          ...backup,
          vault: { ...backup.vault, revision: backup.vault.revision + 1 },
        },
        passphrase,
      ),
    ).rejects.toMatchObject({ code: "INVALID_BACKUP" });
  });

  it("keeps legacy asset records compatible while binding portfolio v2 records to their version", async () => {
    const created = await createVault(passphrase);
    const assetRecord = await encryptAsset(
      created.meta,
      created.key,
      fixtureAsset(),
    );
    const portfolio = fixturePortfolio();
    const portfolioRecord = await encryptPortfolioContext(
      created.meta,
      created.key,
      portfolio,
    );

    expect(assetRecord.version).toBe(1);
    expect(portfolioRecord.version).toBe(2);
    expect(JSON.stringify(portfolioRecord)).not.toContain(
      "PRIVATE-PORTFOLIO-LABEL",
    );
    expect(JSON.stringify(portfolioRecord)).not.toContain("123.456789");
    expect(await decryptAsset(created.meta, created.key, assetRecord)).toEqual(
      fixtureAsset(),
    );
    expect(
      await decryptPortfolioContext(created.meta, created.key, portfolioRecord),
    ).toEqual(portfolio);
    await expect(
      decryptPortfolioContext(created.meta, created.key, {
        ...portfolioRecord,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_RECORD" });

    const backup = await createBackup(created.meta, created.key, [
      assetRecord,
      portfolioRecord,
    ]);
    await expect(verifyBackup(backup, passphrase)).resolves.toMatchObject({
      extractable: false,
    });
  });

  it("encrypts catalog assets and permission receipts as v3 alongside legacy and portfolio records", async () => {
    const created = await createVault(passphrase);
    const legacy = await encryptAsset(
      created.meta,
      created.key,
      fixtureAsset(),
    );
    const portfolio = await encryptPortfolioContext(
      created.meta,
      created.key,
      fixturePortfolio(),
    );
    const catalogAsset = fixtureCatalogAsset();
    const catalog = await encryptAsset(created.meta, created.key, catalogAsset);
    const context = fixtureCollectibleContext();
    const catalogContext = await encryptCollectibleContext(
      created.meta,
      created.key,
      context,
    );

    expect([
      legacy.version,
      portfolio.version,
      catalog.version,
      catalogContext.version,
    ]).toEqual([1, 2, 3, 3]);
    const raw = JSON.stringify([catalog, catalogContext]);
    expect(raw).not.toContain("OWNER-CERT-PRIVATE");
    expect(raw).not.toContain("OWNER-SEARCH-PRIVATE");
    expect(raw).not.toContain("321.99");
    expect(await decryptAsset(created.meta, created.key, catalog)).toEqual(
      catalogAsset,
    );
    expect(
      await decryptCollectibleRecord(created.meta, created.key, catalogContext),
    ).toEqual(context);

    const backup = await createBackup(created.meta, created.key, [
      legacy,
      portfolio,
      catalog,
      catalogContext,
    ]);
    await expect(verifyBackup(backup, passphrase)).resolves.toMatchObject({
      extractable: false,
    });
    await expect(
      decryptCollectibleRecord(created.meta, created.key, {
        ...catalog,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_RECORD" });

    const unknownKind = await encryptAuthenticatedV3(
      created.meta.vaultId,
      created.key,
      { ...catalogAsset, kind: "unknown-context" },
    );
    await expect(
      decryptCollectibleRecord(created.meta, created.key, unknownKind),
    ).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
  });

  it("encrypts private landed costs and receipts as v4 in a mixed-version backup", async () => {
    const created = await createVault(passphrase);
    const legacy = await encryptAsset(
      created.meta,
      created.key,
      fixtureAsset(),
    );
    const portfolio = await encryptPortfolioContext(
      created.meta,
      created.key,
      fixturePortfolio(),
    );
    const catalog = await encryptCollectibleContext(
      created.meta,
      created.key,
      fixtureCollectibleContext(),
    );
    const market = fixtureMarketContext();
    const marketRecord = await encryptMarketContext(
      created.meta,
      created.key,
      market,
    );

    expect([
      legacy.version,
      portfolio.version,
      catalog.version,
      marketRecord.version,
    ]).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(marketRecord)).not.toMatch(
      /PRIVATE-MARKET-LABEL|PRIVATE-EXACT-SKU|987\.654321|PRIVATE-REGION|market-query-private/i,
    );
    expect(
      await decryptMarketContext(created.meta, created.key, marketRecord),
    ).toEqual(market);
    await expect(
      decryptMarketContext(created.meta, created.key, {
        ...marketRecord,
        version: 3,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_RECORD" });

    const backup = await createBackup(created.meta, created.key, [
      legacy,
      portfolio,
      catalog,
      marketRecord,
    ]);
    await expect(verifyBackup(backup, passphrase)).resolves.toMatchObject({
      extractable: false,
    });
    const unknown = await encryptAuthenticatedV4(
      created.meta.vaultId,
      created.key,
      { ...market, kind: "unknown-market-context" },
    );
    await expect(
      decryptMarketContext(created.meta, created.key, unknown),
    ).rejects.toMatchObject({ code: "INVALID_MARKET" });
    const inconsistent = await encryptAuthenticatedV4(
      created.meta.vaultId,
      created.key,
      {
        ...market,
        comparisons: [
          { ...market.comparisons[0], sourceKind: "provider_offer" },
        ],
      },
    );
    await expect(
      decryptMarketContext(created.meta, created.key, inconsistent),
    ).rejects.toMatchObject({ code: "INVALID_MARKET" });
    const invalidRating = structuredClone(market);
    if (invalidRating.merchantObservations[0]?.offer?.productRating) {
      invalidRating.merchantObservations[0].offer.productRating.average =
        "5.0000000000000000001";
    }
    const invalidRatingRecord = await encryptAuthenticatedV4(
      created.meta.vaultId,
      created.key,
      invalidRating,
    );
    await expect(
      decryptMarketContext(created.meta, created.key, invalidRatingRecord),
    ).rejects.toMatchObject({ code: "INVALID_MARKET" });
    const candidate = createMarketContext({
      ...market,
      comparisons: [
        {
          ...market.comparisons[0],
          canonicalAssetId: "",
          identityConfidence: "candidate",
        },
      ],
    });
    const candidateRecord = await encryptMarketContext(
      created.meta,
      created.key,
      candidate,
    );
    await expect(
      decryptMarketContext(created.meta, created.key, candidateRecord),
    ).resolves.toEqual(candidate);
  });

  it("keeps owner certificates single-copy and manual values fully sourced", () => {
    const catalog = fixtureCatalogAsset();
    expect(() =>
      createAsset({
        name: catalog.name,
        assetType: catalog.assetType,
        identifier: catalog.identifier,
        lots: [
          {
            quantity: "2",
            unitPrice: "250",
            currency: "USD",
            acquiredAt: "2026-08-10",
          },
        ],
        notes: catalog.notes,
        collectible: catalog.collectible,
      }),
    ).toThrowError(VaultError);
    expect(() =>
      createAsset({
        name: catalog.name,
        assetType: catalog.assetType,
        identifier: catalog.identifier,
        lots: [
          {
            quantity: "1",
            unitPrice: "250",
            currency: "USD",
            acquiredAt: "2026-08-10",
          },
        ],
        notes: catalog.notes,
        collectible: catalog.collectible && {
          ...catalog.collectible,
          references: [
            { ...catalog.collectible.references[0], observedAt: "" },
          ],
        },
      }),
    ).toThrowError(VaultError);
    expect(() =>
      createAsset({
        name: catalog.name,
        assetType: catalog.assetType,
        identifier: "tcgdex:en:other-set-99",
        lots: [
          {
            quantity: "1",
            unitPrice: "250",
            currency: "USD",
            acquiredAt: "2026-08-10",
          },
        ],
        notes: catalog.notes,
        collectible: catalog.collectible,
      }),
    ).toThrowError(VaultError);
  });

  it("supports a manual collectible history without claiming a catalog match", async () => {
    const asset = createAsset({
      name: "Owner-reported card",
      assetType: "collectible",
      identifier: "owner:set-alpha:4",
      lots: [
        {
          quantity: "1",
          unitPrice: "125.50",
          currency: "USD",
          acquiredAt: "2026-08-01",
        },
      ],
      notes: "Private owner notes",
      collectible: {
        catalog: null,
        ownerPrinting: "1st Edition Holo",
        condition: "near-mint",
        grader: "ungraded",
        grade: "",
        certificate: "",
        photoSource: null,
        photoAddedAt: null,
        references: [
          {
            id: "e08839c5-ef8c-48fe-a657-f1078a17a19c",
            value: "145.75",
            currency: "USD",
            observedAt: "2026-08-12",
            sourceUrl: "https://example.com/dated-reference",
            label: "Owner-entered auction result",
          },
        ],
      },
    });
    const created = await createVault("manual collectible passphrase");
    const record = await encryptAsset(created.meta, created.key, asset);
    expect(record.version).toBe(VAULT_COLLECTIBLE_RECORD_VERSION);
    await expect(decryptAsset(created.meta, created.key, record)).resolves.toEqual(asset);
    expect(asset.collectible?.catalog).toBeNull();
  });

  it("preserves exact decimal strings without Number conversion", () => {
    const created = createAsset({
      name: "Exact-value card",
      assetType: "collectible",
      identifier: "PSA-123",
      lots: [
        {
          quantity: "9007199254740993000000000000000000001.000000000000000001",
          unitPrice: "0.000000000000000000000000000000000001",
          currency: "USD",
          acquiredAt: "2026-08-10",
        },
      ],
      notes: "exact",
    });
    expect(created.lots[0]).toMatchObject({
      quantity: "9007199254740993000000000000000000001.000000000000000001",
      unitPrice: "0.000000000000000000000000000000000001",
    });
    expect(() =>
      createAsset({
        name: "Invalid empty quantity",
        assetType: "collectible",
        identifier: "",
        lots: [
          { quantity: "", unitPrice: "1", currency: "USD", acquiredAt: "" },
        ],
        notes: "",
      }),
    ).toThrowError(VaultError);
    expect(() =>
      createAsset({
        name: "Invalid calendar date",
        assetType: "collectible",
        identifier: "",
        lots: [
          {
            quantity: "1",
            unitPrice: "1",
            currency: "USD",
            acquiredAt: "2026-02-30",
          },
        ],
        notes: "",
      }),
    ).toThrowError(VaultError);
  });

  it("turns browser quota failures into an actionable local-only message", () => {
    const message = vaultErrorMessage(
      new DOMException("full", "QuotaExceededError"),
    );
    expect(message).toContain("out of storage space");
    expect(message).toContain("encrypted backup");
  });

  it("enforces an exact export-size and record-count budget before saving", async () => {
    const created = await createVault(passphrase);
    const record = await encryptAsset(
      created.meta,
      created.key,
      fixtureAsset(),
    );
    const exactBytes = estimateVaultBackupBytes(created.meta, [record]);
    expect(() =>
      assertVaultCapacity(created.meta, [record], exactBytes),
    ).not.toThrow();
    expect(() =>
      assertVaultCapacity(created.meta, [record], exactBytes - 1),
    ).toThrowError(VaultError);
    expect(() =>
      assertVaultCapacity(created.meta, new Array(2_001).fill(record)),
    ).toThrowError(VaultError);
  });
});

async function encryptAuthenticatedV3(
  vaultId: string,
  key: CryptoKey,
  payload: VaultAsset & { kind: string },
): Promise<EncryptedVaultRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(
    `chainscout:vault-record:v3:${vaultId}:${payload.id}`,
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    id: payload.id,
    version: VAULT_COLLECTIBLE_RECORD_VERSION,
    iv: bytesToTestBase64(iv),
    ciphertext: bytesToTestBase64(new Uint8Array(ciphertext)),
  };
}

async function encryptAuthenticatedV4(
  vaultId: string,
  key: CryptoKey,
  payload: Omit<VaultMarketContext, "kind"> & { kind: string },
): Promise<EncryptedVaultRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(
    `chainscout:vault-record:v4:${vaultId}:${payload.id}`,
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    id: payload.id,
    version: VAULT_MARKET_RECORD_VERSION,
    iv: bytesToTestBase64(iv),
    ciphertext: bytesToTestBase64(new Uint8Array(ciphertext)),
  };
}

function bytesToTestBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function fixtureAsset(): VaultAsset {
  return {
    id: "2a2d9930-d937-4f3e-bda7-b0d2ddb4b644",
    name: "Vault Canary Card",
    assetType: "collectible",
    identifier: "PSA-CHAINSCOUT-42",
    lots: [
      {
        id: "f9c68a33-20aa-4fc7-9318-f4306a82b11c",
        quantity: "1",
        unitPrice: "1234.56",
        currency: "USD",
        acquiredAt: "2026-08-10",
      },
    ],
    notes: "PRIVATE-NOTE-CANARY",
    photo: {
      name: "canary.png",
      mimeType: "image/png",
      size: 8,
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    },
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
  };
}

function fixturePortfolio(): VaultPortfolioContext {
  return createPortfolioContext({
    address: "0x1111111111111111111111111111111111111111",
    label: "PRIVATE-PORTFOLIO-LABEL",
    valuations: [
      {
        id: "6d35fd63-cf71-4e6c-9e85-2b31303070f0",
        assetKey: "token:0x3333333333333333333333333333333333333333",
        unitPrice: "123.456789",
        currency: "USD",
        updatedAt: "2026-08-10T12:00:00.000Z",
      },
    ],
    latestSnapshot: null,
    receipts: [
      {
        id: "e3b28dc2-d696-4649-b87e-6005b044f67d",
        address: "0x1111111111111111111111111111111111111111",
        providerDestinations: ["robinhood_public_rpc", "blockscout"],
        disclosure:
          "Public address sent transiently; private context stays local.",
        approvedAt: "2026-08-10T12:00:00.000Z",
        outcome: "completed",
        resolvedAt: "2026-08-10T12:00:01.000Z",
      },
    ],
  });
}

function fixtureCatalogAsset(): VaultAsset {
  return {
    id: "db813477-f336-4283-b6ec-5ca130e1c156",
    name: "Charizard · Base Set #4",
    assetType: "collectible",
    identifier: "tcgdex:en:base1-4",
    lots: [
      {
        id: "22b5c3a0-d502-49f7-a8b4-226e685ff2c8",
        quantity: "1",
        unitPrice: "250",
        currency: "USD",
        acquiredAt: "2026-08-10",
      },
    ],
    notes: "OWNER-NOTE-PRIVATE",
    collectible: {
      catalog: {
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
      ownerPrinting: "Holo · Shadowless · 1st Edition",
      condition: "near-mint",
      grader: "psa",
      grade: "10",
      certificate: "OWNER-CERT-PRIVATE",
      photoSource: null,
      photoAddedAt: null,
      references: [
        {
          id: "16e5b700-07d1-4237-9970-39578183a1aa",
          value: "321.99",
          currency: "USD",
          observedAt: "2026-08-11",
          sourceUrl: "https://example.com/manual-reference",
          label: "OWNER-SOURCE-PRIVATE",
        },
      ],
    },
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z",
  };
}

function fixtureCollectibleContext(): VaultCollectibleContext {
  return createCollectibleContext({
    receipts: [
      {
        id: "da882893-9587-4de0-b153-8169c4186d14",
        operation: "search",
        language: "en",
        query: "OWNER-SEARCH-PRIVATE",
        providerDestinations: ["TCGdex"],
        disclosure: "Only approved catalog identifiers are sent.",
        approvedAt: "2026-08-11T12:00:00.000Z",
        outcome: "completed",
        resolvedAt: "2026-08-11T12:00:01.000Z",
      },
    ],
  });
}

function fixtureMarketContext(): VaultMarketContext {
  return createMarketContext({
    cryptoObservations: [],
    merchantObservations: [
      {
        schemaVersion: 1,
        merchant: {
          id: "sample-store",
          name: "Sample Opt-In Store",
          provider: "woocommerce",
        },
        canonicalAssetId: "tcgdex:en:base1-4",
        mapping: {
          sku: "PRIVATE-EXACT-SKU",
          productId: "42",
          reviewedAt: "2026-08-11",
          evidenceUrl: "https://merchant.example/product/charizard-base-4-nm/",
        },
        offer: {
          provider: "woocommerce",
          merchantId: "sample-store",
          merchantName: "Sample Opt-In Store",
          canonicalAssetId: "tcgdex:en:base1-4",
          identityConfidence: "reviewed_simple_product_mapping",
          productId: "42",
          sku: "PRIVATE-EXACT-SKU",
          title: "Charizard Base Set #4",
          variantLabel: "Unlimited holo",
          condition: "Near mint",
          mappingReviewedAt: "2026-08-11",
          mappingEvidenceUrl:
            "https://merchant.example/product/charizard-base-4-nm/",
          url: "https://merchant.example/product/charizard-base-4-nm/",
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
          freshForMs: 300_000,
        },
        state: "exact_match",
        fetchedAt: "2026-08-11T12:00:00.000Z",
        freshForMs: 300_000,
        source: {
          provider: "woocommerce",
          url: "https://merchant.example/product/charizard-base-4-nm/",
        },
        limitations: ["One opted-in merchant."],
        privacy: {
          accountRequired: false,
          walletConnectionRequired: false,
          serverStorage: "none",
          modelProvider: "none",
          providerDestinations: ["Sample Opt-In Store"],
          disclosure: "Only the exact reviewed public mapping was sent.",
        },
      },
    ],
    comparisons: [
      {
        id: "cb69b984-eccc-4b93-b12f-08bca076165b",
        canonicalAssetId: "tcgdex:en:base1-4",
        label: "PRIVATE-MARKET-LABEL",
        sourceKind: "owner_entered",
        identityConfidence: "owner_linked",
        merchantMapping: null,
        providerName: "Owner source",
        sourceUrl: "https://example.com/owner-offer",
        observedAt: "2026-08-11T12:00:00.000Z",
        freshForMs: 86_400_000,
        currency: "USD",
        itemUnitPrice: "987.654321",
        quantity: "1",
        shipping: "0",
        tax: "0",
        duty: "0",
        fees: "0",
        discount: "0",
        inventoryState: "owner_available",
        condition: "Near mint",
        region: "PRIVATE-REGION",
        returnNotes: "Private return note",
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z",
      },
    ],
    receipts: [
      {
        id: "7333deac-638f-44b6-9ad9-71213b53df3c",
        operation: "crypto",
        publicIdentifier: "market-query-private",
        merchantMapping: null,
        providerDestinations: ["DEX Screener"],
        disclosure: "Only the approved public contract was sent.",
        approvedAt: "2026-08-11T12:00:00.000Z",
        outcome: "completed",
        resolvedAt: "2026-08-11T12:00:01.000Z",
      },
    ],
  });
}
